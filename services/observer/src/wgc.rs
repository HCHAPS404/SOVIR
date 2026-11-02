//! Real Windows pixel capture (ADR-0015/0019) — `feature = "wgc"` only.
//!
//! `WgcFrameSource` captures the FOREGROUND window — the same object the
//! metadata path already reports, so the consent scope is identical and
//! narrower than full-screen capture. Windows.Graphics.Capture is the
//! OS-sanctioned API: we deliberately do NOT request borderless capture,
//! so the system draws its own capture indicator around the window while
//! the observer runs. Frames are consumed in-process and discarded;
//! only `extraction` output (enums + digest) may leave.
//!
//! `WinOcr` wraps Windows.Media.Ocr (on-device engine, no network). Per
//! ADR-0019 it runs only on frames the structural/vision pass already
//! flagged — OCR is never a whole-screen text vacuum.
//!
//! RUNTIME STATUS: compiles on `cfg(windows)` + `feature="wgc"`;
//! end-to-end capture is declared NOT_VERIFIED until exercised on a
//! live desktop session — this module is honest plumbing, not a claim
//! of validated protection.

use anyhow::{Context, Result};
use windows::core::Interface;
use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Win32::Foundation::{HMODULE, HWND};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, D3D11_CPU_ACCESS_READ,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ, D3D11_SDK_VERSION,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::System::WinRT::Direct3D11::{
    CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

use crate::vision::{FrameSource, OwnedFrame};

/// One live capture binding: D3D11 plumbing + frame pool + session for a
/// specific HWND. Rebuilt when the foreground window changes.
struct Capture {
    d3d_device: ID3D11Device,
    context: ID3D11DeviceContext,
    pool: Direct3D11CaptureFramePool,
    _session: windows::Graphics::Capture::GraphicsCaptureSession,
    hwnd: HWND,
}

fn d3d_device() -> Result<(ID3D11Device, ID3D11DeviceContext)> {
    let mut device: Option<ID3D11Device> = None;
    let mut context: Option<ID3D11DeviceContext> = None;
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
        .context("D3D11CreateDevice")?;
    }
    Ok((
        device.context("d3d device none")?,
        context.context("d3d context none")?,
    ))
}

impl Capture {
    fn new(hwnd: HWND) -> Result<Self> {
        let interop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
            .context("capture item interop factory")?;
        let item: GraphicsCaptureItem =
            unsafe { interop.CreateForWindow::<GraphicsCaptureItem>(hwnd) }
                .context("CreateForWindow")?;
        let size = item.Size().context("item size")?;
        let (d3d_device, context) = d3d_device()?;
        let dxgi: IDXGIDevice = d3d_device.cast().context("dxgi cast")?;
        let inspectable =
            unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi) }.context("winrt device")?;
        let rt_device: IDirect3DDevice = inspectable.cast().context("winrt device cast")?;
        let pool = Direct3D11CaptureFramePool::Create(
            &rt_device,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2,
            size,
        )
        .context("frame pool")?;
        let session = pool.CreateCaptureSession(&item).context("session")?;
        // IsBorderRequired left at its default — the OS draws the capture
        // border; we do not ask for the borderless capability.
        session.StartCapture().context("start capture")?;
        Ok(Self {
            d3d_device,
            context,
            pool,
            _session: session,
            hwnd,
        })
    }

    /// Copy the next pooled frame into CPU-readable RGBA. BGRA→RGBA is
    /// done on the staging readback — the only transform pixels get.
    /// `TryGetNextFrame` errors when the pool is empty — that is the
    /// "no new frame" case, not a failure.
    fn next_frame(&self) -> Result<Option<OwnedFrame>> {
        let frame = match self.pool.TryGetNextFrame() {
            Ok(f) => f,
            Err(_) => return Ok(None),
        };
        let surface = frame.Surface().context("surface")?;
        let access: IDirect3DDxgiInterfaceAccess = surface.cast().context("surface access")?;
        let tex: ID3D11Texture2D = unsafe { access.GetInterface() }.context("texture")?;
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { tex.GetDesc(&mut desc) };
        desc.Usage = D3D11_USAGE_STAGING;
        desc.BindFlags = 0;
        desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
        desc.MiscFlags = 0;
        let mut staging: Option<ID3D11Texture2D> = None;
        unsafe {
            self.d3d_device
                .CreateTexture2D(&desc, None, Some(&mut staging))
                .context("staging texture")?
        };
        let staging = staging.context("staging none")?;
        unsafe { self.context.CopyResource(&staging, &tex) };
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        unsafe {
            self.context
                .Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                .context("map staging")?
        };
        let (w, h) = (desc.Width as usize, desc.Height as usize);
        let mut rgba = vec![0u8; w * h * 4];
        unsafe {
            let src = mapped.pData as *const u8;
            for y in 0..h {
                let row = src.add(y * mapped.RowPitch as usize);
                for x in 0..w {
                    let (si, di) = (x * 4, (y * w + x) * 4);
                    rgba[di] = *row.add(si + 2);
                    rgba[di + 1] = *row.add(si + 1);
                    rgba[di + 2] = *row.add(si);
                    rgba[di + 3] = *row.add(si + 3);
                }
            }
            self.context.Unmap(&staging, 0);
        }
        Ok(Some(OwnedFrame {
            width: desc.Width,
            height: desc.Height,
            rgba,
        }))
    }
}

/// Foreground-window frame source. Follows focus changes by rebuilding
/// the capture binding — cheap enough at the observer's poll cadence.
pub struct WgcFrameSource {
    capture: Option<Capture>,
}
impl WgcFrameSource {
    pub fn new() -> Result<Self> {
        Ok(Self { capture: None })
    }
}
impl FrameSource for WgcFrameSource {
    fn capture(&mut self) -> Result<Option<OwnedFrame>> {
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.0.is_null() {
            return Ok(None);
        }
        if self.capture.as_ref().map(|c| c.hwnd) != Some(hwnd) {
            match Capture::new(hwnd) {
                Ok(c) => self.capture = Some(c),
                Err(e) => {
                    tracing::warn!("wgc: capture init failed for hwnd ({e}); skipping frame");
                    self.capture = None;
                    return Ok(None);
                }
            }
        }
        self.capture.as_ref().unwrap().next_frame()
    }
}

// ---------------------------------------------------------------------------
// On-device OCR (ADR-0019): Windows.Media.Ocr, local engine, no egress.
// Invoked ONLY on frames the structural/vision pass flagged — the
// pre-mark gate keeps OCR away from unflagged screen content.
// ---------------------------------------------------------------------------
pub struct WinOcr {
    engine: windows::Media::Ocr::OcrEngine,
}
impl WinOcr {
    pub fn new() -> Result<Self> {
        let engine = windows::Media::Ocr::OcrEngine::TryCreateFromUserProfileLanguages()
            .context("ocr engine")?;
        Ok(Self { engine })
    }
    /// Recognized text of ONE flagged region (ADR-0019): the caller
    /// decides which rects are read — never the whole screen when the
    /// flag was a small anomaly. Out-of-frame rects are clamped; an
    /// empty rect recognizes nothing.
    pub fn recognize_region(
        &self,
        frame: &OwnedFrame,
        r: sovir_edge_extract::Rect,
    ) -> Result<String> {
        use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
        use windows::Storage::Streams::Buffer;
        use windows::Win32::System::WinRT::IBufferByteAccess;
        let x = r.x.min(frame.width);
        let y = r.y.min(frame.height);
        let w = r.w.min(frame.width - x);
        let h = r.h.min(frame.height - y);
        if w == 0 || h == 0 {
            return Ok(String::new());
        }
        // Crop the rect then undo the readback swap — Media.Ocr wants
        // BGRA. Cropping first keeps the copy region-sized.
        let mut bgra = vec![0u8; (w * h * 4) as usize];
        for row in 0..h {
            let src = (((y + row) * frame.width + x) * 4) as usize;
            let dst = (row * w * 4) as usize;
            bgra[dst..dst + (w * 4) as usize]
                .copy_from_slice(&frame.rgba[src..src + (w * 4) as usize]);
        }
        for c in bgra.as_chunks_mut::<4>().0 {
            c.swap(0, 2);
        }
        let bmp = SoftwareBitmap::Create(BitmapPixelFormat::Bgra8, w as i32, h as i32)
            .context("software bitmap")?;
        // Fill an IBuffer via the byte-access COM interface — the only
        // supported way to push raw pixels into a WinRT buffer.
        let ibuf = Buffer::Create(bgra.len() as u32).context("buffer")?;
        let access: IBufferByteAccess = ibuf.cast().context("byte access")?;
        unsafe {
            let dst = access.Buffer().context("buffer ptr")?;
            std::ptr::copy_nonoverlapping(bgra.as_ptr(), dst, bgra.len());
        }
        ibuf.SetLength(bgra.len() as u32).context("set length")?;
        bmp.CopyFromBuffer(&ibuf).context("copy into bitmap")?;
        let res = self
            .engine
            .RecognizeAsync(&bmp)
            .context("ocr async")?
            .get()
            .context("ocr await")?;
        Ok(res.Text().context("ocr text")?.to_string())
    }
}
