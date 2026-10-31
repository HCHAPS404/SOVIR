//! Pure pixel→signal extraction (ADR-0015). One bounded function:
//! `extract(frame, regions)` — RGBA bytes in, typed signal hints out.
//!
//! Hard boundary, enforced structurally:
//! - NO I/O: no fs, no net, no OS calls, no async. A caller that wants
//!   capture writes its own per-platform adapter; this crate never
//!   knows where a frame came from.
//! - NO pixel retention: the output carries typed signals, a digest and
//!   region boxes only — never pixel bytes. Frames are consumed by
//!   reference and forgotten.
//! - NO content claims: v1 heuristics are structural (color/luminance
//!   statistics). They emit `RiskSignal` *hypotheses* — the policy layer
//!   decides. There is deliberately no OCR, no text, no recognition of
//!   real screen content; those require a new ADR.
//!
//! Work is bounded: at most `MAX_REGIONS` regions, each sampled with a
//! stride so large frames cost the same as small ones.

use sha2::{Digest, Sha256};
use sovir_domain::RiskSignal;

/// Maximum regions processed per frame — extra regions are ignored.
pub const MAX_REGIONS: usize = 64;
/// Pixels sampled per axis inside a region (stride sampling keeps the
/// cost per region constant regardless of frame resolution).
pub const MAX_SAMPLES_PER_AXIS: u32 = 64;
/// Minimum red-dominance ratio (basis points) that yields an
/// URGENT_ACTION hint — an alarm-colored region, nothing more.
const ALARM_RED_BP: u16 = 4_000;
/// Minimum dim-ratio (basis points) at the region border combined with a
/// markedly brighter center — the structural signature of a modal dialog
/// dimming what is behind it, a common dark-pattern carrier.
const DIMMED_SURROUND_BP: u16 = 5_000;
const BRIGHTER_CENTER_DELTA: u8 = 40;

/// A region of interest inside a frame, in pixels. Out-of-bounds boxes
/// are clamped to the frame; fully-clamped boxes are skipped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// Borrowed RGBA8 frame. Constructed by the caller's capture adapter —
/// this crate only reads it, never stores it.
pub struct PixelFrame<'a> {
    pub width: u32,
    pub height: u32,
    /// Length must equal width*height*4; `extract` refuses otherwise.
    pub rgba: &'a [u8],
}

/// One typed signal hypothesis over a region — metadata only.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtractedSignal {
    pub signal: RiskSignal,
    /// Heuristic confidence in basis points (0–10_000). It is a
    /// statistic of the region, not a calibrated probability.
    pub confidence_bp: u16,
    pub region: Rect,
}

/// What a frame produced: a content digest (metadata) plus zero or more
/// typed hints. Contains no pixel data by construction.
#[derive(Debug, Clone)]
pub struct Extraction {
    /// "sha256:{hex}" over the whole frame — the same digest scheme an
    /// `ObservedEvent.content_digest` carries.
    pub content_digest: String,
    pub signals: Vec<ExtractedSignal>,
}

/// Bounded pure extraction. Returns `None` on malformed input
/// (fail closed — a caller never gets a half-computed result).
pub fn extract(frame: &PixelFrame<'_>, regions: &[Rect]) -> Option<Extraction> {
    let need = (frame.width as u64)
        .checked_mul(frame.height as u64)?
        .checked_mul(4)?;
    if need != frame.rgba.len() as u64 || frame.width == 0 || frame.height == 0 {
        return None;
    }
    let content_digest = format!("sha256:{:x}", Sha256::digest(frame.rgba));
    let mut signals = Vec::new();
    for region in regions.iter().take(MAX_REGIONS) {
        let r = clamp(*region, frame.width, frame.height);
        if r.w == 0 || r.h == 0 {
            continue;
        }
        let st = region_stats(frame, r);
        if st.alarm_red_bp >= ALARM_RED_BP {
            signals.push(ExtractedSignal {
                signal: RiskSignal::UrgentAction,
                confidence_bp: st.alarm_red_bp,
                region: r,
            });
        }
        if st.dimmed_surround_bp >= DIMMED_SURROUND_BP
            && st.center_minus_border_delta >= BRIGHTER_CENTER_DELTA
        {
            signals.push(ExtractedSignal {
                signal: RiskSignal::ConsentDarkPattern,
                // Confidence is the dimmed-surround ratio, capped.
                confidence_bp: st.dimmed_surround_bp.min(9_999),
                region: r,
            });
        }
    }
    Some(Extraction {
        content_digest,
        signals,
    })
}

fn clamp(r: Rect, w: u32, h: u32) -> Rect {
    let x = r.x.min(w);
    let y = r.y.min(h);
    Rect {
        x,
        y,
        w: r.w.min(w - x),
        h: r.h.min(h - y),
    }
}

#[derive(Default)]
struct RegionStats {
    /// Share of sampled pixels that are alarm-red (R dominates G,B).
    alarm_red_bp: u16,
    /// Share of sampled border pixels that are dim (low luminance).
    dimmed_surround_bp: u16,
    /// Mean center luminance minus mean border luminance.
    center_minus_border_delta: u8,
}

fn region_stats(frame: &PixelFrame<'_>, r: Rect) -> RegionStats {
    let xstep = (r.w / MAX_SAMPLES_PER_AXIS).max(1);
    let ystep = (r.h / MAX_SAMPLES_PER_AXIS).max(1);
    // Border band: outer ~12.5% of the region on each side.
    let bx = (r.w / 8).max(1);
    let by = (r.h / 8).max(1);
    let (mut red, mut dim, mut total) = (0u64, 0u64, 0u64);
    let (mut border_lum, mut border_n) = (0u64, 0u64);
    let (mut center_lum, mut center_n) = (0u64, 0u64);
    let mut y = r.y;
    while y < r.y + r.h {
        let mut x = r.x;
        while x < r.x + r.w {
            let i = ((y * frame.width + x) * 4) as usize;
            let (rr, gg, bb) = (
                frame.rgba[i] as u32,
                frame.rgba[i + 1] as u32,
                frame.rgba[i + 2] as u32,
            );
            // ITU-R BT.601 luma, integer.
            let lum = (299 * rr + 587 * gg + 114 * bb) / 1_000;
            total += 1;
            if rr > gg.saturating_mul(2) && rr > bb.saturating_mul(2) && rr > 100 {
                red += 1;
            }
            let on_border =
                x < r.x + bx || x >= r.x + r.w - bx || y < r.y + by || y >= r.y + r.h - by;
            if on_border {
                border_lum += lum as u64;
                border_n += 1;
                if lum < 80 {
                    dim += 1;
                }
            } else {
                center_lum += lum as u64;
                center_n += 1;
            }
            x += xstep;
        }
        y += ystep;
    }
    if total == 0 {
        return RegionStats::default();
    }
    let border_mean = border_lum.checked_div(border_n).unwrap_or(0);
    let center_mean = center_lum.checked_div(center_n).unwrap_or(0);
    RegionStats {
        alarm_red_bp: (red * 10_000).checked_div(total).unwrap_or(0).min(10_000) as u16,
        dimmed_surround_bp: (dim * 10_000)
            .checked_div(border_n)
            .unwrap_or(0)
            .min(10_000) as u16,
        center_minus_border_delta: center_mean.saturating_sub(border_mean).min(255) as u8,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sovir_domain::SensitiveDataClass;

    /// Synthetic frame builder — patterns are drawn by code, never read
    /// from disk or captured (ADR-0015).
    fn frame(w: u32, h: u32, px: [u8; 4]) -> Vec<u8> {
        let mut v = vec![0u8; (w * h * 4) as usize];
        for c in v.as_chunks_mut::<4>().0 {
            c.copy_from_slice(&px);
        }
        v
    }
    fn paint(buf: &mut [u8], w: u32, x0: u32, y0: u32, x1: u32, y1: u32, px: [u8; 4]) {
        for y in y0..y1 {
            for x in x0..x1 {
                let i = ((y * w + x) * 4) as usize;
                buf[i..i + 4].copy_from_slice(&px);
            }
        }
    }
    fn f<'a>(w: u32, h: u32, rgba: &'a [u8]) -> PixelFrame<'a> {
        PixelFrame {
            width: w,
            height: h,
            rgba,
        }
    }
    const ALL: &[RiskSignal] = &[
        RiskSignal::UrgentAction,
        RiskSignal::ConsentDarkPattern,
        RiskSignal::PaymentRequest,
    ];

    #[test]
    fn alarm_red_region_yields_urgent_action_hint() {
        // 64x64 frame, top region painted alarm-red, rest neutral gray.
        let mut buf = frame(64, 64, [128, 128, 128, 255]);
        paint(&mut buf, 64, 0, 0, 64, 16, [220, 30, 30, 255]);
        let out = extract(
            &f(64, 64, &buf),
            &[Rect {
                x: 0,
                y: 0,
                w: 64,
                h: 16,
            }],
        )
        .unwrap();
        assert!(out
            .signals
            .iter()
            .any(|s| s.signal == RiskSignal::UrgentAction));
    }

    #[test]
    fn dimmed_surround_bright_center_yields_dark_pattern_hint() {
        // Modal-over-dimmed-page: dark border ring, bright center.
        let mut buf = frame(64, 64, [20, 20, 20, 255]);
        paint(&mut buf, 64, 16, 16, 48, 48, [235, 235, 240, 255]);
        let out = extract(
            &f(64, 64, &buf),
            &[Rect {
                x: 0,
                y: 0,
                w: 64,
                h: 64,
            }],
        )
        .unwrap();
        assert!(out
            .signals
            .iter()
            .any(|s| s.signal == RiskSignal::ConsentDarkPattern));
    }

    #[test]
    fn benign_neutral_frame_yields_no_signals() {
        let buf = frame(64, 64, [128, 128, 128, 255]);
        let out = extract(
            &f(64, 64, &buf),
            &[Rect {
                x: 0,
                y: 0,
                w: 64,
                h: 64,
            }],
        )
        .unwrap();
        assert!(out.signals.is_empty());
    }

    #[test]
    fn gradient_ambiguous_frame_stays_silent() {
        // Benign ambiguous case: mild gradient — nothing alarm-like.
        let mut buf = frame(64, 64, [0, 0, 0, 255]);
        for y in 0..64u32 {
            let l = 100 + (y as u8) / 2;
            paint(&mut buf, 64, 0, y, 64, y + 1, [l, l, l + 10, 255]);
        }
        let out = extract(
            &f(64, 64, &buf),
            &[Rect {
                x: 0,
                y: 0,
                w: 64,
                h: 64,
            }],
        )
        .unwrap();
        assert!(out.signals.is_empty());
    }

    #[test]
    fn malformed_frame_fails_closed() {
        let buf = vec![0u8; 10]; // length != w*h*4
        assert!(extract(&f(4, 4, &buf), &[]).is_none());
        let empty: Vec<u8> = vec![];
        assert!(extract(&f(0, 0, &empty), &[]).is_none());
    }

    #[test]
    fn regions_are_bounded_and_clamped() {
        let buf = frame(32, 32, [220, 30, 30, 255]);
        // Out-of-bounds region is clamped, not an error.
        let out = extract(
            &f(32, 32, &buf),
            &[Rect {
                x: 16,
                y: 16,
                w: 100,
                h: 100,
            }],
        )
        .unwrap();
        assert_eq!(
            out.signals[0].region,
            Rect {
                x: 16,
                y: 16,
                w: 16,
                h: 16
            }
        );
        // More than MAX_REGIONS: extras ignored.
        let many = vec![
            Rect {
                x: 0,
                y: 0,
                w: 32,
                h: 32,
            };
            MAX_REGIONS + 10
        ];
        let out = extract(&f(32, 32, &buf), &many).unwrap();
        assert_eq!(out.signals.len(), MAX_REGIONS);
    }

    #[test]
    fn digest_is_deterministic_and_output_holds_no_pixels() {
        let buf = frame(32, 32, [10, 20, 30, 255]);
        let a = extract(&f(32, 32, &buf), &[]).unwrap();
        let b = extract(&f(32, 32, &buf), &[]).unwrap();
        assert_eq!(a.content_digest, b.content_digest);
        assert!(a.content_digest.starts_with("sha256:"));
        assert_eq!(a.content_digest.len(), 7 + 64);
        // Structural property (ADR-0015): the output type carries no
        // byte buffers — a signal is signal+confidence+rect, the digest
        // is fixed-size hex. Nothing to leak.
        assert_eq!(std::mem::size_of::<ExtractedSignal>(), 20);
        let _ = SensitiveDataClass::Secret; // never emitted from here
    }

    #[test]
    fn no_signal_on_paywall_like_gradient() {
        // A benign "settings page" structure must not hallucinate
        // PAYMENT_REQUEST — v1 heuristics cannot detect payments and
        // never claim to (assert NONE of the money signals ever appear).
        let mut buf = frame(64, 64, [250, 250, 250, 255]);
        paint(&mut buf, 64, 8, 8, 56, 20, [200, 200, 210, 255]);
        paint(&mut buf, 64, 8, 28, 56, 40, [200, 200, 210, 255]);
        let out = extract(
            &f(64, 64, &buf),
            &[Rect {
                x: 0,
                y: 0,
                w: 64,
                h: 64,
            }],
        )
        .unwrap();
        for s in &out.signals {
            assert!(ALL.contains(&s.signal));
            assert_ne!(s.signal, RiskSignal::PaymentRequest);
        }
    }
}
