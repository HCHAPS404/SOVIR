//! SOVIR edge store — durable encrypted queue for on-device observers.
//!
//! When the loopback API is unreachable, observer events are persisted to
//! a local SQLite file with the payload encrypted at rest
//! (ChaCha20-Poly1305, per-row random nonce). This survives process
//! restarts — the in-memory queue cannot.
//!
//! Threat model honesty: this protects the buffer against casual file
//! access and backups. Whoever holds the key holds the data — key custody
//! is the caller's decision (OS keystore wiring is platform work, out of
//! scope for this crate). Rows carry NO plaintext payload: only
//! `source_id` (routing) and `created_at_ms` (retention) are stored
//! unencrypted, both metadata fields that never contain user content.

use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Nonce,
};
use hkdf::Hkdf;
use rand::RngCore;
use rusqlite::Connection;
use sha2::Sha256;
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum EdgeStoreError {
    #[error("storage failure")]
    Storage,
    #[error("encryption failure")]
    Crypto,
    #[error("corrupt stored row")]
    Corrupt,
}

const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const HKDF_INFO: &[u8] = b"sovir-edge-store/v1";

/// An event recovered from the queue. `row_id` is needed to ack/delete.
#[derive(Debug)]
pub struct QueuedEvent {
    pub row_id: i64,
    pub source_id: String,
    pub created_at_ms: u64,
    /// Decrypted event payload (the ObservedEvent JSON body).
    pub payload: serde_json::Value,
}

pub struct EncryptedEdgeQueue {
    conn: Connection,
    cipher: ChaCha20Poly1305,
}

impl EncryptedEdgeQueue {
    /// Opens (or creates) the queue file. `secret` is the caller-provided
    /// key material (>=32 bytes recommended); the store key is HKDF'd from
    /// it so callers never hand the cipher key directly.
    pub fn open(path: &Path, secret: &[u8]) -> Result<Self, EdgeStoreError> {
        let conn = Connection::open(path).map_err(|_| EdgeStoreError::Storage)?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS edge_queue (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               source_id TEXT NOT NULL,
               created_at_ms INTEGER NOT NULL,
               nonce BLOB NOT NULL,
               ciphertext BLOB NOT NULL
             );
             CREATE INDEX IF NOT EXISTS edge_queue_source_time
               ON edge_queue(source_id, created_at_ms);",
        )
        .map_err(|_| EdgeStoreError::Storage)?;
        let hk = Hkdf::<Sha256>::new(None, secret);
        let mut key = [0u8; KEY_LEN];
        hk.expand(HKDF_INFO, &mut key)
            .map_err(|_| EdgeStoreError::Crypto)?;
        Ok(Self {
            conn,
            cipher: ChaCha20Poly1305::new((&key).into()),
        })
    }

    /// In-memory queue for tests (key material still required).
    #[cfg(test)]
    fn open_in_memory(secret: &[u8]) -> Result<Self, EdgeStoreError> {
        let conn = Connection::open_in_memory().map_err(|_| EdgeStoreError::Storage)?;
        conn.execute_batch(
            "CREATE TABLE edge_queue (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               source_id TEXT NOT NULL,
               created_at_ms INTEGER NOT NULL,
               nonce BLOB NOT NULL,
               ciphertext BLOB NOT NULL
             );
             CREATE INDEX edge_queue_source_time
               ON edge_queue(source_id, created_at_ms);",
        )
        .map_err(|_| EdgeStoreError::Storage)?;
        let hk = Hkdf::<Sha256>::new(None, secret);
        let mut key = [0u8; KEY_LEN];
        hk.expand(HKDF_INFO, &mut key)
            .map_err(|_| EdgeStoreError::Crypto)?;
        Ok(Self {
            conn,
            cipher: ChaCha20Poly1305::new((&key).into()),
        })
    }

    /// Encrypts and appends an event. Returns the row id.
    pub fn enqueue(
        &self,
        source_id: &str,
        created_at_ms: u64,
        payload: &serde_json::Value,
    ) -> Result<i64, EdgeStoreError> {
        let plaintext = serde_json::to_vec(payload).map_err(|_| EdgeStoreError::Crypto)?;
        let mut nonce = [0u8; NONCE_LEN];
        rand::rngs::OsRng.fill_bytes(&mut nonce);
        let ciphertext = self
            .cipher
            .encrypt(Nonce::from_slice(&nonce), plaintext.as_ref())
            .map_err(|_| EdgeStoreError::Crypto)?;
        self.conn
            .execute(
                "INSERT INTO edge_queue (source_id, created_at_ms, nonce, ciphertext)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![source_id, created_at_ms as i64, &nonce[..], ciphertext],
            )
            .map_err(|_| EdgeStoreError::Storage)?;
        Ok(self.conn.last_insert_rowid())
    }

    /// FIFO read of up to `limit` decrypted events (oldest first).
    /// A row that fails to decrypt is returned as `Corrupt` — the caller
    /// should delete it rather than retry forever.
    pub fn drain(&self, limit: usize) -> Result<Vec<QueuedEvent>, EdgeStoreError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, source_id, created_at_ms, nonce, ciphertext
                 FROM edge_queue ORDER BY id ASC LIMIT ?1",
            )
            .map_err(|_| EdgeStoreError::Storage)?;
        let rows = stmt
            .query_map([limit as i64], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, Vec<u8>>(3)?,
                    r.get::<_, Vec<u8>>(4)?,
                ))
            })
            .map_err(|_| EdgeStoreError::Storage)?;
        let mut out = Vec::new();
        for row in rows {
            let (id, source_id, at_ms, nonce, ct) = row.map_err(|_| EdgeStoreError::Storage)?;
            if nonce.len() != NONCE_LEN {
                return Err(EdgeStoreError::Corrupt);
            }
            let pt = self
                .cipher
                .decrypt(Nonce::from_slice(&nonce), ct.as_ref())
                .map_err(|_| EdgeStoreError::Corrupt)?;
            let payload = serde_json::from_slice(&pt).map_err(|_| EdgeStoreError::Corrupt)?;
            out.push(QueuedEvent {
                row_id: id,
                source_id,
                created_at_ms: at_ms as u64,
                payload,
            });
        }
        Ok(out)
    }

    /// Hard-deletes the given row ids (after successful ingest upstream).
    pub fn ack(&self, row_ids: &[i64]) -> Result<u64, EdgeStoreError> {
        let mut n = 0u64;
        for id in row_ids {
            n += self
                .conn
                .execute("DELETE FROM edge_queue WHERE id = ?1", [id])
                .map_err(|_| EdgeStoreError::Storage)? as u64;
        }
        Ok(n)
    }

    /// Per-source retention: delete rows older than `cutoff_ms` for one
    /// `source_id`. Returns deleted count.
    pub fn delete_older_than(
        &self,
        source_id: &str,
        cutoff_ms: u64,
    ) -> Result<u64, EdgeStoreError> {
        self.conn
            .execute(
                "DELETE FROM edge_queue WHERE source_id = ?1 AND created_at_ms <= ?2",
                rusqlite::params![source_id, cutoff_ms as i64],
            )
            .map_err(|_| EdgeStoreError::Storage)
            .map(|n| n as u64)
    }

    /// Global retention: delete rows older than `cutoff_ms` across sources.
    pub fn delete_older_than_any(&self, cutoff_ms: u64) -> Result<u64, EdgeStoreError> {
        self.conn
            .execute(
                "DELETE FROM edge_queue WHERE created_at_ms <= ?1",
                [cutoff_ms as i64],
            )
            .map_err(|_| EdgeStoreError::Storage)
            .map(|n| n as u64)
    }

    /// Erasure: delete every row for a source (consent revocation path).
    pub fn purge_by_source(&self, source_id: &str) -> Result<u64, EdgeStoreError> {
        self.conn
            .execute("DELETE FROM edge_queue WHERE source_id = ?1", [source_id])
            .map_err(|_| EdgeStoreError::Storage)
            .map(|n| n as u64)
    }

    pub fn is_empty(&self) -> Result<bool, EdgeStoreError> {
        self.len().map(|n| n == 0)
    }

    pub fn len(&self) -> Result<u64, EdgeStoreError> {
        self.conn
            .query_row("SELECT COUNT(*) FROM edge_queue", [], |r| {
                r.get::<_, i64>(0)
            })
            .map(|n| n as u64)
            .map_err(|_| EdgeStoreError::Storage)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn queue() -> EncryptedEdgeQueue {
        EncryptedEdgeQueue::open_in_memory(b"test-secret-material-32-bytes!!!").unwrap()
    }

    #[test]
    fn enqueue_drain_ack_roundtrip_fifo() {
        let q = queue();
        for i in 0..3 {
            q.enqueue("src-a", 1000 + i, &serde_json::json!({"i": i}))
                .unwrap();
        }
        assert_eq!(q.len().unwrap(), 3);
        let items = q.drain(10).unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].payload["i"], 0); // FIFO
        assert_eq!(items[2].payload["i"], 2);
        let n = q.ack(&[items[0].row_id, items[1].row_id]).unwrap();
        assert_eq!(n, 2);
        assert_eq!(q.len().unwrap(), 1);
    }

    #[test]
    fn drain_limit_respects_fifo_prefix() {
        let q = queue();
        for i in 0..5 {
            q.enqueue("src", i, &serde_json::json!({"i": i})).unwrap();
        }
        let items = q.drain(2).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].payload["i"], 0);
    }

    #[test]
    fn stored_bytes_are_ciphertext_not_plaintext() {
        let q = queue();
        q.enqueue("src", 1, &serde_json::json!({"secret": "hunter2"}))
            .unwrap();
        let ct: Vec<u8> = q
            .conn
            .query_row("SELECT ciphertext FROM edge_queue LIMIT 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        let raw = String::from_utf8_lossy(&ct);
        assert!(!raw.contains("hunter2"), "plaintext must never be stored");
        assert!(ct.len() > 32); // nonce-independent ciphertext + tag
    }

    #[test]
    fn wrong_key_fails_decrypt_not_silent() {
        let q = queue();
        q.enqueue("src", 1, &serde_json::json!({"a": 1})).unwrap();
        let other = EncryptedEdgeQueue::open_in_memory(b"different-key-32-bytes-xxxxxxxx").unwrap();
        // Decrypt the same ciphertext with another key.
        let (nonce, ct): (Vec<u8>, Vec<u8>) = q
            .conn
            .query_row(
                "SELECT nonce, ciphertext FROM edge_queue LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert!(other
            .cipher
            .decrypt(Nonce::from_slice(&nonce), ct.as_ref())
            .is_err());
    }

    #[test]
    fn per_source_and_global_retention() {
        let q = queue();
        q.enqueue("a", 100, &serde_json::json!({})).unwrap();
        q.enqueue("a", 200, &serde_json::json!({})).unwrap();
        q.enqueue("b", 150, &serde_json::json!({})).unwrap();
        assert_eq!(q.delete_older_than("a", 150).unwrap(), 1);
        assert_eq!(q.len().unwrap(), 2);
        assert_eq!(q.delete_older_than_any(250).unwrap(), 2);
        assert_eq!(q.len().unwrap(), 0);
    }

    #[test]
    fn purge_by_source_erases_everything_for_that_source() {
        let q = queue();
        q.enqueue("keep", 1, &serde_json::json!({})).unwrap();
        q.enqueue("drop", 1, &serde_json::json!({})).unwrap();
        q.enqueue("drop", 2, &serde_json::json!({})).unwrap();
        assert_eq!(q.purge_by_source("drop").unwrap(), 2);
        let rest = q.drain(10).unwrap();
        assert_eq!(rest.len(), 1);
        assert_eq!(rest[0].source_id, "keep");
    }

    #[test]
    fn file_backed_queue_survives_reopen() {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("sovir-edge-{}.db", uuid::Uuid::new_v4().simple()));
        {
            let q = EncryptedEdgeQueue::open(&path, b"file-secret-32-bytes-xxxxxxxxxx").unwrap();
            q.enqueue("src", 42, &serde_json::json!({"persist": true}))
                .unwrap();
        }
        let q2 = EncryptedEdgeQueue::open(&path, b"file-secret-32-bytes-xxxxxxxxxx").unwrap();
        let items = q2.drain(10).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].payload["persist"], true);
        std::fs::remove_file(&path).ok();
        std::fs::remove_file(path.with_extension("db-wal")).ok();
        std::fs::remove_file(path.with_extension("db-shm")).ok();
    }
}
