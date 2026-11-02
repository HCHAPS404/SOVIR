//! Observer vision pipeline (ADR-0014 / ADR-0019 / ADR-0020):
//! `FrameSource` → deterministic on-device extraction → `IMAGE_REGION`
//! events carrying typed signals + frame digest only.
//!
//! Consent scope is a SEPARATE grant (`VISION_GRANT`): watching pixels is
//! a stronger claim than watching window titles, so it gets its own
//! opt-in (`SOVIR_OBSERVER_VISION=1`). The OS capture affordance is
//! preserved — the WGC source leaves the capture border at its default
//! (visible) instead of requesting borderless capture.
//!
//! Sources: `wgc` (real Windows.Graphics.Capture, `feature="wgc"`) and
//! `synthetic` — a procedurally drawn dev frame that makes the whole
//! observe → extract → emit path verifiable end-to-end without any OS
//! capture. The emitted event is honest either way: enums + sha256 only.

use anyhow::Result;
use sovir_domain::RiskSignal;
use sovir_edge_extract::{self as ex, PixelFrame, Rect};
use std::collections::HashSet;

/// Consent grant covering PIXEL observation — distinct from the
/// metadata grant so revocation can scope each independently.
pub const VISION_GRANT: &str = "win-observer-vision-grant";

/// A captured frame owned by the pipeline (`rgba.len() == w*h*4`).
pub struct OwnedFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

/// Pixel source — the only place OS capture lives. The pipeline is
/// source-agnostic, which is what makes it testable without a screen.
pub trait FrameSource {
    /// Latest frame, or `None` when the source is unavailable/denied —
    /// never a panic, vision is additive and must not kill the observer.
    fn capture(&mut self) -> Result<Option<OwnedFrame>>;
}

// ---------------------------------------------------------------------------
// Synthetic dev source: draws a QR-like three-finder scene procedurally —
// same "no real captures" rule as the crate tests, enabling a real E2E
// run (`SOVIR_OBSERVER_VISION_SOURCE=synthetic`) on any machine.
// ---------------------------------------------------------------------------
pub struct SyntheticFrameSource {
    emitted: bool,
}
impl SyntheticFrameSource {
    pub fn new() -> Self {
        Self { emitted: false }
    }
    /// 96×96 light frame with three QR finder patterns at the classic
    /// corner positions — deterministic, no external data.
    pub fn scene() -> OwnedFrame {
        let (w, h) = (96u32, 96u32);
        let mut rgba = vec![240u8; (w * h * 4) as usize];
        for c in rgba.as_chunks_mut::<4>().0 {
            c[3] = 255;
        }
        let paint = |rgba: &mut Vec<u8>, x0: u32, y0: u32, x1: u32, y1: u32, l: u8| {
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = ((y * w + x) * 4) as usize;
                    rgba[i] = l;
                    rgba[i + 1] = l;
                    rgba[i + 2] = l;
                }
            }
        };
        let finder = |rgba: &mut Vec<u8>, ox: u32, oy: u32| {
            paint(rgba, ox, oy, ox + 14, oy + 14, 20);
            paint(rgba, ox + 2, oy + 2, ox + 12, oy + 12, 235);
            paint(rgba, ox + 4, oy + 4, ox + 10, oy + 10, 20);
        };
        finder(&mut rgba, 8, 8);
        finder(&mut rgba, 72, 8);
        finder(&mut rgba, 8, 72);
        OwnedFrame {
            width: w,
            height: h,
            rgba,
        }
    }
}
impl FrameSource for SyntheticFrameSource {
    fn capture(&mut self) -> Result<Option<OwnedFrame>> {
        self.emitted = true;
        Ok(Some(Self::scene()))
    }
}

/// Structural pass + vision classifier over the whole frame. Returns
/// `(signals, flagged_regions, sha256-digest)` — enums, not labels: the
/// caller maps to wire strings at emit time, after priority-bounding.
/// `flagged_regions` are the rects the passes marked anomalous — the
/// ADR-0019 OCR gate reads ONLY those, never the whole screen.
/// Digest covers the analyzed pixels (they never leave).
pub fn analyze_frame(frame: &OwnedFrame) -> Option<(Vec<RiskSignal>, Vec<Rect>, String)> {
    if frame.width == 0
        || frame.height == 0
        || frame.rgba.len() as u64 != frame.width as u64 * frame.height as u64 * 4
    {
        return None;
    }
    let pf = PixelFrame {
        width: frame.width,
        height: frame.height,
        rgba: &frame.rgba,
    };
    let whole = [Rect {
        x: 0,
        y: 0,
        w: frame.width,
        h: frame.height,
    }];
    let mut signals = HashSet::new();
    let mut flagged: Vec<Rect> = Vec::new();
    let mut digest = None;
    if let Some(out) = ex::extract(&pf, &whole) {
        digest = Some(out.content_digest);
        for s in out.signals {
            signals.insert(s.signal);
            flagged.push(s.region);
        }
    }
    if let Some(out) = ex::vision::classify(&pf, &whole) {
        digest = Some(out.content_digest); // same input → same digest
        for s in out.signals {
            signals.insert(s.signal);
            flagged.push(s.region);
        }
    }
    flagged.truncate(4); // OCR reads at most four flagged rects (ADR-0019)
    digest.map(|d| (signals.into_iter().collect(), flagged, d))
}

/// Pick the configured frame source. `wgc` is the real capture path;
/// `synthetic` is the dev/test double. Anything else disables vision.
pub fn make_source(name: &str) -> Option<Box<dyn FrameSource>> {
    match name {
        "synthetic" => Some(Box::new(SyntheticFrameSource::new())),
        #[cfg(all(windows, feature = "wgc"))]
        "wgc" => match crate::wgc::WgcFrameSource::new() {
            Ok(s) => Some(Box::new(s)),
            Err(e) => {
                tracing::warn!("wgc init failed ({e}); vision disabled");
                None
            }
        },
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthetic_qr_scene_yields_qr_present() {
        let (signals, regions, digest) = analyze_frame(&SyntheticFrameSource::scene()).unwrap();
        assert!(signals.contains(&RiskSignal::QrPresent));
        assert!(!regions.is_empty());
        assert!(digest.starts_with("sha256:"));
    }

    #[test]
    fn flat_frame_yields_no_signals() {
        let f = OwnedFrame {
            width: 32,
            height: 32,
            rgba: vec![128u8; 32 * 32 * 4],
        };
        let (signals, regions, _) = analyze_frame(&f).unwrap();
        assert!(signals.is_empty());
        assert!(regions.is_empty());
    }

    #[test]
    fn malformed_frame_fails_closed() {
        let f = OwnedFrame {
            width: 4,
            height: 4,
            rgba: vec![0u8; 10],
        };
        assert!(analyze_frame(&f).is_none());
    }

    #[test]
    fn synthetic_source_always_captures() {
        let mut s = SyntheticFrameSource::new();
        assert!(s.capture().unwrap().is_some());
        assert!(s.emitted);
    }
}
