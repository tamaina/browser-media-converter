//! MIT experiment: owned YUV planes -> row reconstruction -> patched libjxl XYB.
//! No transfer-function conversion, tone mapping, or 8-bit intermediate.
#![deny(unsafe_op_in_unsafe_fn)]
use std::{
    ffi::{c_char, c_void},
    panic::{AssertUnwindSafe, catch_unwind},
    slice,
};

#[repr(C)]
#[derive(Clone, Copy)]
pub struct PlaneInput {
    data: *const u8,
    size: usize,
    offset: usize,
    stride: usize,
    width: usize,
    height: usize,
}
#[repr(C)]
pub struct FrameInput {
    width: u32,
    height: u32,
    format: u32,
    depth: u32,
    storage: u32,
    matrix: u32,
    primaries: u32,
    transfer: u32,
    full_range: u32,
    centered: u32,
    origin_x: u32,
    origin_y: u32,
    intensity: f32,
    planes: [PlaneInput; 3],
}
#[repr(C)]
#[derive(Clone, Copy)]
pub struct Config {
    width: u32,
    height: u32,
    primaries: u32,
    transfer: u32,
    intensity: f32,
}
#[repr(C)]
pub struct Encoded {
    data: *mut u8,
    size: usize,
    callbacks: usize,
    peak_rgb_bytes: usize,
    xyb_hash: u64,
    xyb_data: *mut f32,
    xyb_count: usize,
}
type Fill = unsafe extern "C" fn(*mut c_void, usize, usize, usize, usize, *mut f32, usize) -> i32;
unsafe extern "C" {
    fn hdr_jxl_encode(
        c: *const Config,
        opaque: *mut c_void,
        fill: Option<Fill>,
        rgb: *const f32,
        out: *mut Encoded,
        error: *mut c_char,
        n: usize,
    ) -> i32;
    fn hdr_jxl_free(out: *mut Encoded);
}
struct Plane {
    bytes: Vec<u8>,
    offset: usize,
    stride: usize,
    width: usize,
    height: usize,
    step: usize,
    component: usize,
}
pub struct Session {
    config: Config,
    depth: u32,
    storage: u32,
    matrix: u32,
    full: bool,
    sx: usize,
    sy: usize,
    planes: Vec<Plane>,
}
fn need(ok: bool, message: &str) -> Result<(), String> {
    if ok { Ok(()) } else { Err(message.into()) }
}
fn check_config(c: &Config) -> Result<(), String> {
    need(
        c.width > 0
            && c.height > 0
            && c.width <= 8192
            && c.height <= 8192
            && u64::from(c.width) * u64::from(c.height) <= 4_194_304,
        "dimension limit: 4 megapixels",
    )?;
    need(
        matches!(
            (c.primaries, c.transfer),
            (1, 1 | 13) | (11, 13) | (9, 16 | 18)
        ),
        "unsupported primaries/transfer pair",
    )?;
    let target = match c.transfer {
        16 => 10000.0,
        18 => 1000.0,
        _ => 255.0,
    };
    need(
        c.intensity == target,
        "explicit intensity must be PQ=10000, HLG=1000, SDR=255 nits",
    )
}
impl Session {
    /// Caller supplies valid pointer/length pairs borrowed only for this call.
    unsafe fn copy_from(i: &FrameInput) -> Result<Self, String> {
        let config = Config {
            width: i.width,
            height: i.height,
            primaries: i.primaries,
            transfer: i.transfer,
            intensity: i.intensity,
        };
        check_config(&config)?;
        need(
            i.format <= 3 && matches!(i.depth, 8 | 10 | 12),
            "unsupported format/depth",
        )?;
        need(
            (i.depth == 8 && i.storage == 0) || (i.depth > 8 && i.storage == 1),
            "storage must be U8 or U16LE LSB-aligned matching depth",
        )?;
        need(
            i.format != 3 || i.depth == 8,
            "NV12 is supported only at 8 bits; P010 is unsupported",
        )?;
        need(
            !matches!(i.transfer, 16 | 18) || i.depth >= 10,
            "HDR proof requires 10/12-bit source planes",
        )?;
        need(
            matches!(i.matrix, 1 | 6 | 9),
            "unsupported matrix (constant-luminance is not NCL)",
        )?;
        need(
            (i.primaries == 9 && i.matrix == 9) || (i.primaries != 9 && matches!(i.matrix, 1 | 6)),
            "profile/matrix pair outside proof scope",
        )?;
        need(
            i.full_range <= 1 && i.centered == 1 && i.origin_x == 0 && i.origin_y == 0,
            "explicit range, centered chroma and origin (0,0) required",
        )?;
        let (sx, sy) = match i.format {
            0 | 3 => (2, 2),
            1 => (2, 1),
            _ => (1, 1),
        };
        let w = i.width as usize;
        let h = i.height as usize;
        let cw = w.div_ceil(sx);
        let ch = h.div_ceil(sy);
        let bytes = if i.depth == 8 { 1 } else { 2 };
        let count = if i.format == 3 { 2 } else { 3 };
        need(
            i.format != 3 || i.planes[2].size == 0,
            "NV12 requires two planes",
        )?;
        let mut total = 0usize;
        for (index, p) in i.planes[..count].iter().enumerate() {
            let (pw, ph) = if index == 0 { (w, h) } else { (cw, ch) };
            let row = pw * bytes * if i.format == 3 && index == 1 { 2 } else { 1 };
            need(
                !p.data.is_null() && p.width == pw && p.height == ph && p.stride >= row,
                "plane dimensions/pointer/stride",
            )?;
            let remaining = p.size.checked_sub(p.offset).ok_or("plane offset")?;
            need(
                remaining >= row && (ph - 1) <= (remaining - row) / p.stride,
                "plane bounds",
            )?;
            need(
                p.size <= isize::MAX as usize,
                "plane allocation exceeds Rust slice limit",
            )?;
            total = total
                .checked_add((ph - 1) * p.stride + row)
                .ok_or("plane size overflow")?;
        }
        need(
            total <= 64 * 1024 * 1024,
            "input allocation cap: 64 MiB including padding",
        )?;
        let mut planes = Vec::new();
        for c in 0..3 {
            let index = if i.format == 3 && c == 2 { 1 } else { c };
            let p = i.planes[index];
            // SAFETY: checked caps/layout above; valid storage is the C ABI caller's obligation.
            let source = unsafe { slice::from_raw_parts(p.data, p.size) };
            let source_step = bytes * if i.format == 3 && c > 0 { 2 } else { 1 };
            let component = if i.format == 3 && c == 2 { 1 } else { 0 };
            let mut data = Vec::with_capacity(p.width * p.height * bytes);
            for y in 0..p.height {
                for x in 0..p.width {
                    let offset = p.offset + y * p.stride + x * source_step + component;
                    data.extend_from_slice(&source[offset..offset + bytes]);
                }
            }
            planes.push(Plane {
                bytes: data,
                offset: 0,
                stride: p.width * bytes,
                width: p.width,
                height: p.height,
                step: bytes,
                component: 0,
            });
        }
        let session = Self {
            config,
            depth: i.depth,
            storage: i.storage,
            matrix: i.matrix,
            full: i.full_range == 1,
            sx,
            sy,
            planes,
        };
        // Admit all stored samples and converted RGB before the codec emits bytes.
        let max = (1u32 << i.depth) - 1;
        for c in 0..3 {
            let p = &session.planes[c];
            for y in 0..p.height {
                for x in 0..p.width {
                    need(
                        session.sample(c, x, y) <= max,
                        "sample exceeds declared depth (MSB-aligned/P010 storage is unsupported)",
                    )?;
                }
            }
        }
        for y in 0..h {
            for x in 0..w {
                session.pixel(x, y)?;
            }
        }
        Ok(session)
    }
    fn sample(&self, c: usize, x: usize, y: usize) -> u32 {
        let p = &self.planes[c];
        let offset = p.offset + y * p.stride + x * p.step + p.component;
        if self.storage == 0 {
            u32::from(p.bytes[offset])
        } else {
            u32::from(u16::from_le_bytes([p.bytes[offset], p.bytes[offset + 1]]))
        }
    }
    fn chroma(&self, c: usize, x: usize, y: usize) -> f64 {
        let p = &self.planes[c];
        let fx = ((x as f64 + 0.5) / self.sx as f64 - 0.5).clamp(0.0, (p.width - 1) as f64);
        let fy = ((y as f64 + 0.5) / self.sy as f64 - 0.5).clamp(0.0, (p.height - 1) as f64);
        let x0 = fx.floor() as usize;
        let y0 = fy.floor() as usize;
        let x1 = (x0 + 1).min(p.width - 1);
        let y1 = (y0 + 1).min(p.height - 1);
        let tx = fx - x0 as f64;
        let ty = fy - y0 as f64;
        let a = self.sample(c, x0, y0) as f64 * (1.0 - tx) + self.sample(c, x1, y0) as f64 * tx;
        let b = self.sample(c, x0, y1) as f64 * (1.0 - tx) + self.sample(c, x1, y1) as f64 * tx;
        a * (1.0 - ty) + b * ty
    }
    fn pixel(&self, x: usize, y: usize) -> Result<[f32; 3], String> {
        let scale = (1u32 << (self.depth - 8)) as f64;
        let max = ((1u32 << self.depth) - 1) as f64;
        let center = (1u32 << (self.depth - 1)) as f64;
        let yy = if self.full {
            self.sample(0, x, y) as f64 / max
        } else {
            (self.sample(0, x, y) as f64 - 16.0 * scale) / (219.0 * scale)
        };
        let cb = (self.chroma(1, x, y) - center) / if self.full { max } else { 224.0 * scale };
        let cr = (self.chroma(2, x, y) - center) / if self.full { max } else { 224.0 * scale };
        let (kr, kb) = match self.matrix {
            1 => (0.2126, 0.0722),
            6 => (0.299, 0.114),
            _ => (0.2627, 0.0593),
        };
        let r = yy + 2.0 * (1.0 - kr) * cr;
        let b = yy + 2.0 * (1.0 - kb) * cb;
        let g = (yy - kr * r - kb * b) / (1.0 - kr - kb);
        need(
            [r, g, b]
                .iter()
                .all(|v| v.is_finite() && *v >= 0.0 && *v <= 1.0),
            "converted RGB outside nominal [0,1]; proof rejects instead of clipping/tone-mapping",
        )?;
        Ok([r as f32, g as f32, b as f32])
    }
    fn region(
        &self,
        x: usize,
        y: usize,
        w: usize,
        h: usize,
        out: &mut [f32],
    ) -> Result<(), String> {
        need(
            w > 0
                && h > 0
                && x <= self.config.width as usize
                && y <= self.config.height as usize
                && w <= self.config.width as usize - x
                && h <= self.config.height as usize - y,
            "region bounds",
        )?;
        need(out.len() == w * h * 3, "region RGB float length")?;
        for j in 0..h {
            for i in 0..w {
                out[(j * w + i) * 3..(j * w + i + 1) * 3]
                    .copy_from_slice(&self.pixel(x + i, y + j)?);
            }
        }
        Ok(())
    }
}
fn report(result: Result<(), String>, error: *mut c_char, n: usize) -> i32 {
    if let Err(message) = result {
        if !error.is_null() && n > 0 {
            let bytes = message.as_bytes();
            let count = bytes.len().min(n - 1);
            // SAFETY: C caller supplies a writable error buffer of n bytes.
            unsafe {
                std::ptr::copy_nonoverlapping(bytes.as_ptr(), error.cast::<u8>(), count);
                *error.add(count) = 0;
            }
        }
        1
    } else {
        0
    }
}
fn guard(f: impl FnOnce() -> Result<(), String>, error: *mut c_char, n: usize) -> i32 {
    report(
        catch_unwind(AssertUnwindSafe(f)).unwrap_or_else(|_| Err("Rust boundary panic".into())),
        error,
        n,
    )
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn planar_create(
    input: *const FrameInput,
    out: *mut *mut Session,
    error: *mut c_char,
    n: usize,
) -> i32 {
    guard(
        || {
            need(
                !input.is_null() && !out.is_null(),
                "null input/session output",
            )?;
            // SAFETY: pointer layouts and lifetimes are the C caller's obligation.
            unsafe {
                *out = std::ptr::null_mut();
                let session = Session::copy_from(&*input)?;
                *out = Box::into_raw(Box::new(session));
            }
            Ok(())
        },
        error,
        n,
    )
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn planar_destroy(session: *mut Session) {
    if !session.is_null() {
        unsafe {
            drop(Box::from_raw(session));
        }
    }
}
unsafe extern "C" fn fill(
    opaque: *mut c_void,
    x: usize,
    y: usize,
    w: usize,
    h: usize,
    out: *mut f32,
    count: usize,
) -> i32 {
    guard(
        || {
            need(!opaque.is_null() && !out.is_null(), "null region pointer")?;
            need(count <= 12_582_912, "region output size cap")?;
            // SAFETY: bridge passes this live session and a writable float allocation.
            unsafe {
                (&*opaque.cast::<Session>()).region(
                    x,
                    y,
                    w,
                    h,
                    slice::from_raw_parts_mut(out, count),
                )
            }
        },
        std::ptr::null_mut(),
        0,
    )
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn planar_region(
    session: *mut Session,
    x: usize,
    y: usize,
    w: usize,
    h: usize,
    out: *mut f32,
    count: usize,
) -> i32 {
    unsafe { fill(session.cast(), x, y, w, h, out, count) }
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn planar_encode(
    session: *mut Session,
    out: *mut Encoded,
    error: *mut c_char,
    n: usize,
) -> i32 {
    if session.is_null() || out.is_null() {
        return report(Err("null session/result".into()), error, n);
    }
    // SAFETY: synchronous bridge borrows session until all callbacks complete.
    unsafe {
        hdr_jxl_encode(
            &(*session).config,
            session.cast(),
            Some(fill),
            std::ptr::null(),
            out,
            error,
            n,
        )
    }
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn rgb_encode(
    config: *const Config,
    rgb: *const f32,
    count: usize,
    out: *mut Encoded,
    error: *mut c_char,
    n: usize,
) -> i32 {
    let validation = guard(
        || {
            need(
                !config.is_null() && !rgb.is_null() && !out.is_null(),
                "null RGB input",
            )?;
            // SAFETY: caller supplies live config and count floats; bounds checked first.
            let c = unsafe { &*config };
            check_config(c)?;
            need(
                count == c.width as usize * c.height as usize * 3,
                "RGB length",
            )?;
            need(
                unsafe { slice::from_raw_parts(rgb, count) }
                    .iter()
                    .all(|v| v.is_finite() && (0.0..=1.0).contains(v)),
                "RGB must be finite nominal-range",
            )
        },
        error,
        n,
    );
    if validation != 0 {
        return validation;
    }
    unsafe { hdr_jxl_encode(config, std::ptr::null_mut(), None, rgb, out, error, n) }
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn planar_free(out: *mut Encoded) {
    unsafe {
        hdr_jxl_free(out);
    }
}
