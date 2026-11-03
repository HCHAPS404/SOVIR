"use client";

import { useRef, useState } from "react";

// Encrypted backup slice (B6): the export JSON is encrypted in the browser
// with AES-256-GCM under a PBKDF2-derived key — the passphrase never leaves
// this tab and SOVIR never sees it. File layout (JSON):
//   {v, kdf:"PBKDF2-SHA256", iters, salt_b64, iv_b64, ct_b64}
// Only the ciphertext touches disk; losing the passphrase loses the backup.
const KDF_ITERS = 250_000;

async function deriveKey(pass: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pass),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: KDF_ITERS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function BackupTool() {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function downloadEncrypted() {
    if (pass.length < 8) {
      setMsg("La passphrase necesita al menos 8 caracteres.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/me/export", { cache: "no-store" });
      if (!res.ok) throw new Error(`export ${res.status}`);
      const plaintext = new TextEncoder().encode(await res.text());
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(pass, salt);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
      const envelope = {
        v: 1,
        kdf: "PBKDF2-SHA256",
        iters: KDF_ITERS,
        salt_b64: b64(salt),
        iv_b64: b64(iv),
        ct_b64: b64(ct),
      };
      const blob = new Blob([JSON.stringify(envelope)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sovir-backup-${Date.now()}.enc.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg("Backup cifrado descargado. Guarda la passphrase fuera de este equipo.");
    } catch (e) {
      setMsg(`No se pudo cifrar el backup: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function verifyBackup() {
    const f = fileRef.current?.files?.[0];
    if (!f) {
      setMsg("Elige primero un archivo .enc.json");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const env = JSON.parse(await f.text());
      if (env.v !== 1 || env.kdf !== "PBKDF2-SHA256") throw new Error("formato no reconocido");
      const key = await deriveKey(pass, unb64(env.salt_b64));
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unb64(env.iv_b64) as BufferSource },
        key,
        unb64(env.ct_b64),
      );
      const data = JSON.parse(new TextDecoder().decode(pt));
      setMsg(
        `Backup íntegro: ${data.events?.length ?? 0} eventos, ${data.grants?.length ?? 0} consentimientos, ` +
          `${data.devices?.length ?? 0} dispositivos, ${data.interventions?.length ?? 0} avisos.`,
      );
    } catch {
      setMsg("No se pudo descifrar — passphrase incorrecta o archivo corrupto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-stack">
      <label className="field">
        <span>Passphrase del backup (nunca sale del navegador)</span>
        <input
          type="password"
          autoComplete="new-password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="mínimo 8 caracteres"
        />
      </label>
      <div className="form-row">
        <button className="btn-op" type="button" disabled={busy} onClick={downloadEncrypted}>
          Descargar backup cifrado
        </button>
        <input ref={fileRef} type="file" accept=".json,.enc.json" hidden />
        <button
          className="btn-op"
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Elegir backup…
        </button>
        <button className="btn-op" type="button" disabled={busy} onClick={verifyBackup}>
          Verificar
        </button>
      </div>
      {msg ? <p className="empty">{msg}</p> : null}
    </div>
  );
}
