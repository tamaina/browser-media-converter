//! Rust CMS for the stock libjxl encoder, installed by bridge.cc through
//! `JxlEncoderSetCms` (stock `JxlCmsInterface`, no libjxl/skcms colour patch).
//!
//! The only conversion libjxl asks of a CMS while encoding XYB is
//! "input profile -> linear sRGB (D65, BT.709 primaries)". Three paths:
//! * the registered source ICC, matrix/TRC: exact scalar f64 evaluation
//!   (bounded parser below, formerly `source_icc.h` inside patched libjxl);
//! * the registered source ICC, LUT (A2B*) profiles: moxcms 0.9.1;
//! * enum input (no ICC; transfer from `color_encoding`, never from an ICC):
//!   linear / sRGB / BT.709 / pure gamma with any white point and primaries,
//!   using the same float approximations as the fused YUV->XYB kernel;
//!   DCI (gamma 2.6) and, native only, PQ / HLG as libjxl's default CMS does
//!   (EOTF scaled by 10000 / intensity target; HLG inverse OETF + OOTF).
//! `set_fields_from_icc` is a Rust port of libjxl's skcms variant (below), so
//! no C CMS (skcms / LCMS2) is used; the Wasm build does not link one.
#![allow(clippy::missing_safety_doc)]
use std::{
    ffi::{c_char, c_void},
    sync::Arc,
};

// ---------------------------------------------------------------- libjxl ABI
pub const CS_RGB: i32 = 0;
pub const CS_GRAY: i32 = 1;
pub const WP_D65: i32 = 1;
pub const WP_CUSTOM: i32 = 2;
pub const WP_E: i32 = 10;
pub const WP_DCI: i32 = 11;
pub const PR_SRGB: i32 = 1;
pub const PR_CUSTOM: i32 = 2;
pub const PR_2100: i32 = 9;
pub const PR_P3: i32 = 11;
pub const TF_709: i32 = 1;
pub const TF_UNKNOWN: i32 = 2;
pub const TF_LINEAR: i32 = 8;
pub const TF_SRGB: i32 = 13;
pub const TF_PQ: i32 = 16;
pub const TF_DCI: i32 = 17;
pub const TF_HLG: i32 = 18;
pub const TF_GAMMA: i32 = 65535;

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct JxlColorEncoding {
    pub color_space: i32,
    pub white_point: i32,
    pub white_point_xy: [f64; 2],
    pub primaries: i32,
    pub primaries_red_xy: [f64; 2],
    pub primaries_green_xy: [f64; 2],
    pub primaries_blue_xy: [f64; 2],
    pub transfer_function: i32,
    pub gamma: f64,
    pub rendering_intent: i32,
}
#[repr(C)]
pub struct JxlColorProfile {
    pub icc_data: *const u8,
    pub icc_size: usize,
    pub color_encoding: JxlColorEncoding,
    pub num_channels: usize,
}
type SetFields = unsafe extern "C" fn(*mut c_void, *const u8, usize, *mut JxlColorEncoding, *mut i32) -> i32;
type Init = unsafe extern "C" fn(*mut c_void, usize, usize, *const JxlColorProfile, *const JxlColorProfile, f32) -> *mut c_void;
type GetBuf = unsafe extern "C" fn(*mut c_void, usize) -> *mut f32;
type Run = unsafe extern "C" fn(*mut c_void, usize, *const f32, *mut f32, usize) -> i32;
type Destroy = unsafe extern "C" fn(*mut c_void);
#[repr(C)]
#[derive(Clone, Copy)]
pub struct JxlCmsInterface {
    pub set_fields_data: *mut c_void,
    pub set_fields_from_icc: Option<SetFields>,
    pub init_data: *mut c_void,
    pub init: Option<Init>,
    pub get_src_buf: Option<GetBuf>,
    pub get_dst_buf: Option<GetBuf>,
    pub run: Option<Run>,
    pub destroy: Option<Destroy>,
}

// ------------------------------------------------- bounded matrix/TRC parser
#[derive(Clone, Default)]
pub struct Curve {
    kind: i32, // -1 table/identity, 0..4 ICC parametric types
    p: [f64; 7],
    table: Vec<f64>,
    u8: Vec<f32>,
}
impl Curve {
    fn new() -> Self { Curve { kind: -1, ..Default::default() } }
    /// u8-exact inputs (k/255 as f32) use the cached value, as the former C++.
    pub fn eval(&self, x: f64) -> f64 {
        let code = (x * 255.0 + 0.5) as i64;
        if (0..256).contains(&code) && (code as f64 / 255.0) as f32 == x as f32 {
            return self.u8[code as usize] as f64;
        }
        self.eval_raw(x)
    }
    pub fn eval_raw(&self, x: f64) -> f64 {
        if self.kind == -1 {
            if self.table.is_empty() { return x; }
            let f = x.clamp(0.0, 1.0) * (self.table.len() - 1) as f64;
            let i = f as usize;
            let j = (i + 1).min(self.table.len() - 1);
            return self.table[i] + (self.table[j] - self.table[i]) * (f - i as f64);
        }
        let [g, a, b, c, d, e, f] = self.p;
        match self.kind {
            0 => x.max(0.0).powf(g),
            1 => if x >= -b / a { (a * x + b).max(0.0).powf(g) } else { 0.0 },
            2 => if x >= -b / a { (a * x + b).max(0.0).powf(g) + c } else { c },
            3 => if x >= d { (a * x + b).max(0.0).powf(g) } else { c * x },
            _ => if x >= d { (a * x + b).max(0.0).powf(g) + e } else { c * x + f },
        }
    }
}
pub struct MatrixTrc {
    pub curves: [Curve; 3],
    /// rXYZ/gXYZ/bXYZ colorants (D50 PCS), row-major; gray: diag(D50).
    pub xyz: [f64; 9],
    pub to709: [f32; 9],
}
pub struct Inspected {
    pub gray: bool,
    /// Some for matrix/TRC (incl. gray kTRC), None for LUT / other.
    pub matrix: Option<MatrixTrc>,
}
fn tag(s: &[u8; 4]) -> u32 { u32::from_be_bytes(*s) }
/// Bounded ICC check. Errors are user-facing (prefixed by "ICC: " in bridge).
pub fn inspect(bytes: &[u8]) -> Result<Inspected, String> {
    let length = bytes.len();
    if !(132..=4 * 1024 * 1024).contains(&length) { return Err("ICC size must be 132 bytes..4 MiB".into()); }
    let u32at = |p: usize| u32::from_be_bytes(bytes[p..p + 4].try_into().unwrap());
    let u16at = |p: usize| u16::from_be_bytes(bytes[p..p + 2].try_into().unwrap()) as u32;
    let fixed = |p: usize| u32at(p) as i32 as f64 / 65536.0;
    if u32at(0) as usize != length || &bytes[36..40] != b"acsp" { return Err("Invalid ICC signature/declared size".into()); }
    if !matches!(&bytes[12..16], b"mntr" | b"scnr" | b"prtr" | b"spac") {
        return Err("Unsupported ICC class (device-link/abstract not accepted)".into());
    }
    let gray = &bytes[16..20] == b"GRAY";
    if !gray && &bytes[16..20] != b"RGB " { return Err("ICC must describe RGB or GRAY (CMYK/Lab unsupported)".into()); }
    if !matches!(&bytes[20..24], b"XYZ " | b"Lab ") { return Err("Unsupported ICC PCS".into()); }
    let count = u32at(128) as usize;
    if count > (length - 132) / 12 { return Err("Truncated ICC tag table".into()); }
    let mut tags = std::collections::BTreeMap::new();
    for i in 0..count {
        let q = 132 + i * 12;
        let (o, n) = (u32at(q + 4) as usize, u32at(q + 8) as usize);
        if o < 132 + count * 12 || o > length || n < 8 || n > length - o { return Err("ICC tag out of bounds".into()); }
        if tags.insert(u32at(q), (o, n)).is_some() { return Err("Duplicate ICC tag".into()); }
    }
    let lut_only = Ok(Inspected { gray, matrix: None });
    // LUT profiles must be handled by the CMS even if fallback matrix tags exist.
    for t in [b"A2B0", b"A2B1", b"A2B2", b"D2B0", b"D2B1", b"D2B2", b"D2B3"] {
        if tags.contains_key(&tag(t)) { return lut_only; }
    }
    if &bytes[20..24] != b"XYZ " { return lut_only; }
    let mut xyz = [0f64; 9];
    let mut curves = [Curve::new(), Curve::new(), Curve::new()];
    let (xt, tt) = ([b"rXYZ", b"gXYZ", b"bXYZ"], [b"rTRC", b"gTRC", b"bTRC"]);
    for c in 0..3 {
        let trc = if gray { tag(b"kTRC") } else { tag(tt[c]) };
        if !tags.contains_key(&trc) || (!gray && !tags.contains_key(&tag(xt[c]))) { return lut_only; }
        let (to, ts) = tags[&trc];
        if gray {
            // Gray PCS is neutral D50, independent of the media white tag.
            xyz[c * 3 + c] = [0.9642, 1.0, 0.8249][c];
        } else {
            let (xo, xs) = tags[&tag(xt[c])];
            if xs < 20 || u32at(xo) != tag(b"XYZ ") { return Err("Invalid ICC XYZ tag".into()); }
            for r in 0..3 { xyz[r * 3 + c] = fixed(xo + 8 + r * 4); }
        }
        let curve = &mut curves[c];
        if u32at(to) == tag(b"curv") {
            if ts < 12 { return Err("Truncated ICC curv".into()); }
            let n = u32at(to + 8) as usize;
            if n > (ts - 12) / 2 { return Err("Truncated ICC curve table".into()); }
            if n == 1 {
                curve.kind = 0;
                curve.p[0] = u16at(to + 12) as f64 / 256.0;
                if curve.p[0] <= 0.0 { return Err("Invalid ICC gamma".into()); }
            } else {
                for k in 0..n {
                    let v = u16at(to + 12 + k * 2) as f64 / 65535.0;
                    if k > 0 && v < *curve.table.last().unwrap() { return Err("Nonmonotonic ICC TRC".into()); }
                    curve.table.push(v);
                }
            }
        } else if u32at(to) == tag(b"para") {
            if ts < 12 { return Err("Truncated ICC para".into()); }
            curve.kind = u16at(to + 8) as i32;
            if curve.kind > 4 { return lut_only; }
            let n = [1usize, 3, 4, 5, 7][curve.kind as usize];
            if ts < 12 + n * 4 { return Err("Truncated ICC parametric curve".into()); }
            for k in 0..n { curve.p[k] = fixed(to + 12 + k * 4); }
            if curve.p[0] <= 0.0 || (curve.kind != 0 && curve.p[1] <= 0.0) {
                return Err("Invalid ICC parametric gamma/scale".into());
            }
        } else {
            return lut_only;
        }
    }
    // Inverse of Bradford-adapted D65 BT.709 -> D50 PCS, computed independently
    // from published xy values. Matches relative-colorimetric ICC PCS semantics.
    // ICC XYZ colorants are already in D50 PCS: applying inverse(chad) and then
    // readapting would add rounding, not information.
    const INVERSE: [f64; 9] = [3.13418636423682, -1.61720895899828, -0.490694064006384, -0.978748504190694, 1.91613009677359, 0.0334333991599956, 0.0719639278022467, -0.228993873453203, 1.40575373289644];
    let mut to709 = [0f32; 9];
    for r in 0..3 {
        for c in 0..3 {
            let mut v = 0.0;
            for k in 0..3 { v += INVERSE[r * 3 + k] * xyz[k * 3 + c]; }
            if !v.is_finite() || v.abs() > 100.0 { return Err("Invalid ICC primary matrix".into()); }
            to709[r * 3 + c] = v as f32;
        }
    }
    let m = to709.map(f64::from);
    let det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    if det.abs() < 1e-10 { return Err("Singular ICC primary matrix".into()); }
    for curve in curves.iter_mut() {
        let mut cache = vec![0f32; 256];
        for (k, slot) in cache.iter_mut().enumerate() {
            let v = curve.eval_raw((k as f64 / 255.0) as f32 as f64) as f32;
            if !v.is_finite() { return Err("Non-finite ICC TRC output".into()); }
            *slot = v;
        }
        curve.u8 = cache;
    }
    Ok(Inspected { gray, matrix: Some(MatrixTrc { curves, xyz, to709 }) })
}

// ------------------------------------------------------- moxcms LUT profiles
/// TODO(moxcms > 0.9.1): delete this function and its call site.
///
/// moxcms 0.9.1 resolves RelativeColorimetric only through A2B1 and fails on
/// the common A2B0-only device profiles (ICC.1:2010 8.10.2 requires the A2B0
/// fallback; lcms2 and skcms do it). Fixed upstream by moxcms PR #205
/// (commit 962636e), not released yet. Until then, when A2B1 is absent and
/// A2B0 present, append an A2B1 tag-table entry that aliases the A2B0 data
/// (+12 bytes: one table entry; every data offset shifts by 12). The profile
/// ID (MD5) is zeroed because the bytes changed. The aliased copy is only fed
/// to moxcms; the original ICC bytes are what libjxl embeds.
pub fn moxcms_091_relative_a2b0_alias(icc: &[u8]) -> Option<Vec<u8>> {
    if icc.len() < 132 { return None; }
    let be = |o: usize| u32::from_be_bytes(icc[o..o + 4].try_into().unwrap()) as usize;
    let n = be(128);
    if n > (icc.len() - 132) / 12 { return None; }
    let mut a2b0 = None;
    for i in 0..n {
        let o = 132 + 12 * i;
        match &icc[o..o + 4] {
            b"A2B1" => return None,
            b"A2B0" => a2b0 = Some((be(o + 4), be(o + 8))),
            _ => {}
        }
    }
    let (offset, size) = a2b0?;
    let mut out = Vec::with_capacity(icc.len() + 12);
    out.extend_from_slice(&icc[..128]);
    out.extend_from_slice(&(n as u32 + 1).to_be_bytes());
    for i in 0..n {
        let o = 132 + 12 * i;
        out.extend_from_slice(&icc[o..o + 4]);
        out.extend_from_slice(&(be(o + 4) as u32 + 12).to_be_bytes());
        out.extend_from_slice(&icc[o + 8..o + 12]);
    }
    out.extend_from_slice(b"A2B1");
    out.extend_from_slice(&(offset as u32 + 12).to_be_bytes());
    out.extend_from_slice(&(size as u32).to_be_bytes());
    out.extend_from_slice(&icc[132 + 12 * n..]);
    let len = out.len() as u32;
    out[0..4].copy_from_slice(&len.to_be_bytes());
    out[84..100].fill(0);
    Some(out)
}
type LutTransform = Arc<moxcms::TransformF32Executor>;
fn moxcms_lut(icc: &[u8]) -> Result<LutTransform, String> {
    use moxcms::{ColorProfile, Layout, RenderingIntent, ToneReprCurve, TransformOptions};
    let aliased = moxcms_091_relative_a2b0_alias(icc);
    let source = ColorProfile::new_from_slice(aliased.as_deref().unwrap_or(icc)).map_err(|e| format!("moxcms parse: {e}"))?;
    let mut linear709 = ColorProfile::new_srgb();
    for trc in [&mut linear709.red_trc, &mut linear709.green_trc, &mut linear709.blue_trc] {
        *trc = Some(ToneReprCurve::Lut(Vec::new())); // identity
    }
    linear709.cicp = None;
    let options = TransformOptions {
        rendering_intent: RenderingIntent::RelativeColorimetric,
        allow_extended_range_rgb_xyz: true,
        // moxcms defaults to true. With its SIMD LUT features (avx_luts /
        // sse_luts / neon_luts) the f32 LUT grid is then stored as Q2.14 i16
        // and saturates at ~2.0, silently clipping wide-gamut/HDR LUT profiles
        // (AppleHagc reaches 10.3 linear): https://github.com/awxkee/moxcms/issues/208
        // Our Cargo.toml disables those features, so the scalar float path is
        // used today either way; this keeps it correct if they are enabled.
        prefer_fixed_point: false,
        ..Default::default()
    };
    source
        .create_transform_f32(Layout::Rgb, &linear709, Layout::Rgb, options)
        .map_err(|e| format!("moxcms transform: {e}"))
}

// ------------------------------------- libjxl float approximations (scalar)
// Scalar ports of lib/jxl/base/fast_math-inl.h and TF_SRGB/TF_709 so that the
// enum RGB path matches the fused SIMD kernel (FastPowf has ~3e-5 relative
// error; exact pow would differ from the fused path by more than 3e-6 XYB).
fn fast_log2f(x: f32) -> f32 {
    let bits = x.to_bits() as i32;
    let exp_bits = bits.wrapping_sub(0x3f2aaaab);
    let exp_shifted = exp_bits >> 23;
    let mantissa = f32::from_bits(bits.wrapping_sub(exp_shifted.wrapping_shl(23)) as u32);
    let m = mantissa - 1.0;
    let yp = (7.4245873327820566E-01f32 * m + 1.4287160470083755E+00f32) * m + -1.8503833400518310E-06f32;
    let yq = (1.7409343003366853E-01f32 * m + 1.0096718572241148E+00f32) * m + 9.9032814277590719E-01f32;
    yp / yq + exp_shifted as f32
}
fn fast_pow2f(x: f32) -> f32 {
    let floorx = x.floor();
    let exp = f32::from_bits(((floorx as i32).wrapping_add(127)).wrapping_shl(23) as u32);
    let frac = x - floorx;
    let mut num = frac + 1.01749063e+01f32;
    num = num * frac + 4.88687798e+01f32;
    num = num * frac + 9.85506591e+01f32;
    num *= exp;
    let mut den = frac * 2.10242958e-01f32 + -2.22328856e-02f32;
    den = den * frac + -1.94414990e+01f32;
    den = den * frac + 9.85506633e+01f32;
    num / den
}
pub fn fast_powf(base: f32, exponent: f32) -> f32 { fast_pow2f(fast_log2f(base) * exponent) }
pub fn linear_from_srgb(x: f32) -> f32 {
    const P: [f32; 5] = [2.200248328e-04, 1.043637593e-02, 1.624820318e-01, 7.961564959e-01, 8.210152774e-01];
    const Q: [f32; 5] = [2.631846970e-01, 1.076976492e+00, 4.987528350e-01, -5.512498495e-02, 6.521209011e-03];
    let a = x.abs();
    let (mut yp, mut yq) = (P[4], Q[4]);
    for k in (0..4).rev() {
        yp = yp * a + P[k];
        yq = yq * a + Q[k];
    }
    let magnitude = if a > 0.04045f32 { yp / yq } else { a * (1.0f32 / 12.92f32) };
    magnitude.copysign(x)
}
pub fn linear_from_709(x: f32) -> f32 {
    let low = x * (1.0f64 / 4.5) as f32;
    let hi = fast_powf(x * (1.0f64 / 1.099) as f32 + (0.099f64 / 1.099) as f32, (1.0f64 / 0.45) as f32);
    if x < 0.081f32 { low } else { hi }
}

// ------------------------------------------------------------ colour math
type M3 = [f64; 9];
fn mul(a: &M3, b: &M3) -> M3 {
    let mut o = [0.0; 9];
    for r in 0..3 { for c in 0..3 { for k in 0..3 { o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c]; } } }
    o
}
fn inv(m: &M3) -> Option<M3> {
    let det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    if !det.is_finite() || det.abs() < 1e-12 { return None; }
    let d = 1.0 / det;
    Some([
        (m[4] * m[8] - m[5] * m[7]) * d, (m[2] * m[7] - m[1] * m[8]) * d, (m[1] * m[5] - m[2] * m[4]) * d,
        (m[5] * m[6] - m[3] * m[8]) * d, (m[0] * m[8] - m[2] * m[6]) * d, (m[2] * m[3] - m[0] * m[5]) * d,
        (m[3] * m[7] - m[4] * m[6]) * d, (m[1] * m[6] - m[0] * m[7]) * d, (m[0] * m[4] - m[1] * m[3]) * d,
    ])
}
fn white_xyz(w: [f64; 2]) -> [f64; 3] { [w[0] / w[1], 1.0, (1.0 - w[0] - w[1]) / w[1]] }
fn rgb_to_xyz(p: [[f64; 2]; 3], w: [f64; 2]) -> Option<M3> {
    let m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1],
             1.0 - p[0][0] - p[0][1], 1.0 - p[1][0] - p[1][1], 1.0 - p[2][0] - p[2][1]];
    let wx = white_xyz(w);
    let i = inv(&m)?;
    let s: Vec<f64> = (0..3).map(|r| i[r * 3] * wx[0] + i[r * 3 + 1] * wx[1] + i[r * 3 + 2] * wx[2]).collect();
    Some([m[0] * s[0], m[1] * s[1], m[2] * s[2], m[3] * s[0], m[4] * s[1], m[5] * s[2], m[6] * s[0], m[7] * s[1], m[8] * s[2]])
}
const BRADFORD: M3 = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
fn adapt(from: [f64; 2], to: [f64; 2]) -> Option<M3> {
    let (a, b) = (white_xyz(from), white_xyz(to));
    let lms = |v: [f64; 3]| [0, 1, 2].map(|r| BRADFORD[r * 3] * v[0] + BRADFORD[r * 3 + 1] * v[1] + BRADFORD[r * 3 + 2] * v[2]);
    let (la, lb) = (lms(a), lms(b));
    let scale = [lb[0] / la[0], 0.0, 0.0, 0.0, lb[1] / la[1], 0.0, 0.0, 0.0, lb[2] / la[2]];
    Some(mul(&inv(&BRADFORD)?, &mul(&scale, &BRADFORD)))
}
const D65: [f64; 2] = [0.3127, 0.3290];
const SRGB_PRIMARIES: [[f64; 2]; 3] = [[0.64, 0.33], [0.30, 0.60], [0.15, 0.06]];
fn white_of(c: &JxlColorEncoding) -> Option<[f64; 2]> {
    match c.white_point {
        WP_D65 => Some(D65),
        WP_E => Some([1.0 / 3.0, 1.0 / 3.0]),
        WP_DCI => Some([0.314, 0.351]),
        WP_CUSTOM if c.white_point_xy[1] > 0.0 => Some(c.white_point_xy),
        _ => None,
    }
}
fn primaries_of(c: &JxlColorEncoding) -> Option<[[f64; 2]; 3]> {
    match c.primaries {
        PR_SRGB => Some(SRGB_PRIMARIES),
        PR_2100 => Some([[0.708, 0.292], [0.170, 0.797], [0.131, 0.046]]),
        PR_P3 => Some([[0.680, 0.320], [0.265, 0.690], [0.150, 0.060]]),
        PR_CUSTOM => Some([c.primaries_red_xy, c.primaries_green_xy, c.primaries_blue_xy]),
        _ => None,
    }
}
/// libjxl cms::ApproxEq default (1e-3), used when it canonicalizes fields.
fn near(a: f64, b: f64) -> bool { (a - b).abs() <= 1e-3 }
fn is_d65(c: &JxlColorEncoding) -> bool { white_of(c).is_some_and(|w| near(w[0], D65[0]) && near(w[1], D65[1])) }
fn is_srgb_primaries(c: &JxlColorEncoding) -> bool {
    primaries_of(c).is_some_and(|p| (0..3).all(|i| near(p[i][0], SRGB_PRIMARIES[i][0]) && near(p[i][1], SRGB_PRIMARIES[i][1])))
}
fn is_linear(c: &JxlColorEncoding) -> bool {
    c.transfer_function == TF_LINEAR || (c.transfer_function == TF_GAMMA && near(c.gamma, 1.0))
}

#[derive(Clone, Copy)]
enum Tf { Linear, Srgb, Bt709, Gamma(f32), Pq(f32), Hlg }
fn tf_of(c: &JxlColorEncoding, intensity: f32) -> Option<Tf> {
    if is_linear(c) { return Some(Tf::Linear); }
    match c.transfer_function {
        TF_SRGB => Some(Tf::Srgb),
        TF_709 => Some(Tf::Bt709),
        TF_DCI => Some(Tf::Gamma(2.6)),
        // TF_PQ(intensity).DisplayFromEncoded: display relative to the target.
        TF_PQ if intensity > 0.0 => Some(Tf::Pq(10000.0 / intensity)),
        TF_HLG => Some(Tf::Hlg),
        // `gamma` is the encoding exponent (1/2.4 for BT.709/BT.601 policy);
        // libjxl stores 1e-7 units, so snap to exactly 2.4 like the fused path.
        TF_GAMMA if c.gamma > 0.0 => Some(Tf::Gamma(if (c.gamma - 1.0 / 2.4).abs() < 0.00000005 { 2.4 } else { (1.0 / c.gamma) as f32 })),
        _ => None,
    }
}
fn linearize(tf: Tf, v: f32) -> f32 {
    let clipped = v.clamp(0.0, 1.0);
    match tf {
        Tf::Linear => clipped,
        Tf::Srgb => linear_from_srgb(clipped),
        Tf::Bt709 => linear_from_709(clipped),
        Tf::Gamma(e) => fast_powf(clipped, e),
        Tf::Pq(scale) => {
            const M1: f64 = 2610.0 / 16384.0;
            const M2: f64 = 2523.0 / 4096.0 * 128.0;
            const C1: f64 = 3424.0 / 4096.0;
            const C2: f64 = 2413.0 / 4096.0 * 32.0;
            const C3: f64 = 2392.0 / 4096.0 * 32.0;
            if clipped == 0.0 { return 0.0; }
            let xp = (clipped as f64).powf(1.0 / M2);
            ((xp - C1).max(0.0) / (C2 - C3 * xp)).powf(1.0 / M1) as f32 * scale
        }
        Tf::Hlg => {
            // TF_HLG_Base::DisplayFromEncoded (inverse OETF; OOTF separately).
            const A: f64 = 0.17883277;
            const B: f64 = 1.0 - 4.0 * A;
            const C: f64 = 0.5599107295;
            let e = clipped as f64;
            (if e <= 0.5 { e * e / 3.0 } else { (((e - C) / A).exp() + B) / 12.0 }) as f32
        }
    }
}
/// libjxl ApplyHlgOotf(forward) gamma for the intensity target; None if ~1.
fn hlg_ootf_gamma(intensity: f32) -> Option<f32> {
    if (295.0..=305.0).contains(&intensity) { return None; }
    Some(1.2f32 * 1.111f32.powf((intensity * 1e-3).log2()))
}
fn apply_hlg_ootf(rgb: &mut [f32], gamma: f32, luminances: &[f32; 3]) {
    let l = rgb[0] * luminances[0] + rgb[1] * luminances[1] + rgb[2] * luminances[2];
    let ratio = l.powf(gamma - 1.0);
    if !ratio.is_finite() { return; }
    for v in rgb.iter_mut() { *v *= ratio; }
    let maximum = rgb[0].max(rgb[1]).max(rgb[2]);
    if gamma < 1.0 && maximum > 1.0 { for v in rgb.iter_mut() { *v *= 1.0 / maximum; } }
}
/// Same colour space as libjxl would canonicalize it (enum vs custom xy).
fn same_encoding(a: &JxlColorEncoding, b: &JxlColorEncoding) -> bool {
    let near_xy = |p: [f64; 2], q: [f64; 2]| near(p[0], q[0]) && near(p[1], q[1]);
    let tf = a.transfer_function == b.transfer_function && (a.transfer_function != TF_GAMMA || (a.gamma - b.gamma).abs() < 1e-6);
    let white = matches!((white_of(a), white_of(b)), (Some(p), Some(q)) if near_xy(p, q));
    let primaries = a.color_space == CS_GRAY || matches!((primaries_of(a), primaries_of(b)), (Some(p), Some(q)) if (0..3).all(|i| near_xy(p[i], q[i])));
    a.color_space == b.color_space && tf && white && primaries
}
fn is_linear_srgb_target(c: &JxlColorEncoding) -> bool {
    matches!(c.color_space, CS_RGB | CS_GRAY) && is_d65(c) && (c.color_space == CS_GRAY || is_srgb_primaries(c)) && is_linear(c)
}

// ------------------------------------------- ICC -> enum fields (set_fields)
// Rust port of libjxl's skcms-based JxlCmsSetFieldsFromICC (jxl_cms.cc:
// ApplyCICP, UnadaptedWhitePoint, IdentifyPrimaries, DetectTransferFunction),
// so no C CMS (skcms / LCMS2) is needed. Matrix/TRC and gray kTRC profiles
// only; LUT profiles are always kept as ICC by set_fields anyway.
// Not ported: detecting PQ/HLG from *curves* (libjxl's candidate for those is
// a tone-mapped 3D LUT); PQ/HLG matrix/TRC profiles are recognised through
// their cicp tag, otherwise the ICC is embedded (exact, a few hundred bytes).

fn tag_data<'a>(bytes: &'a [u8], sig: &[u8; 4]) -> Option<&'a [u8]> {
    let u32at = |p: usize| bytes.get(p..p + 4).map(|b| u32::from_be_bytes(b.try_into().unwrap()));
    let count = u32at(128)? as usize;
    for i in 0..count.min((bytes.len().saturating_sub(132)) / 12) {
        let q = 132 + i * 12;
        if u32at(q)? == tag(sig) {
            let (o, n) = (u32at(q + 4)? as usize, u32at(q + 8)? as usize);
            return bytes.get(o..o.checked_add(n)?);
        }
    }
    None
}
fn s15(b: &[u8], p: usize) -> f64 { i32::from_be_bytes(b[p..p + 4].try_into().unwrap()) as f64 / 65536.0 }
fn xyz_tag(bytes: &[u8], sig: &[u8; 4]) -> Option<[f64; 3]> {
    let t = tag_data(bytes, sig)?;
    (t.len() >= 20 && &t[..4] == b"XYZ ").then(|| [s15(t, 8), s15(t, 12), s15(t, 16)])
}
fn xy_of(v: [f64; 3]) -> [f64; 2] { let s = v[0] + v[1] + v[2]; [v[0] / s, v[1] / s] }
fn apply(m: &M3, v: [f64; 3]) -> [f64; 3] { [0, 1, 2].map(|r| m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]) }
/// CustomxyEncoding::SetValue: 1e-6 units, `roundf` on a float.
fn quantize_xy(v: [f64; 2]) -> Option<[f64; 2]> {
    let q = |x: f64| -> Option<f64> {
        if x.abs() >= 4.0 { return None; }
        let i = ((x * 1e6) as f32).round() as i64;
        (-0x200000..=0x1FFFFF).contains(&i).then_some(i as f64 / 1e6)
    };
    Some([q(v[0])?, q(v[1])?])
}
/// libjxl ApplyCICP (matrix 0, full range, known primaries/TF only).
fn apply_cicp(t: &[u8], c: &mut JxlColorEncoding) -> bool {
    if t.len() < 12 || &t[..4] != b"cicp" { return false; }
    let (cp, tc, mc, fr) = (t[8] as i32, t[9] as i32, t[10] as i32, t[11]);
    if mc != 0 || fr != 1 || ![TF_709, TF_LINEAR, TF_SRGB, TF_PQ, TF_DCI, TF_HLG].contains(&tc) { return false; }
    let (white, primaries) = match cp {
        PR_SRGB | PR_2100 => (WP_D65, cp),
        PR_P3 => (WP_DCI, PR_P3),
        12 => (WP_D65, PR_P3),
        _ => return false,
    };
    c.color_space = CS_RGB;
    c.transfer_function = tc;
    c.white_point = white;
    c.primaries = primaries;
    true
}
/// skcms_TransferFunction view of an ICC curve, for libjxl's IsGamma.
fn pure_gamma(c: &Curve) -> Option<f64> {
    let [g, a, b, cc, d, e, f] = c.p;
    match c.kind {
        -1 if c.table.is_empty() => Some(1.0),
        // skcms_ApproximateCurve only returns a=1,b=0,d=0 for an identity table.
        -1 => (c.table.len() >= 2 && c.table.iter().enumerate().all(|(i, &v)| (v - i as f64 / (c.table.len() - 1) as f64).abs() < 0.5 / 65535.0)).then_some(1.0),
        0 => Some(g),
        1 => (a == 1.0 && b == 0.0).then_some(g),
        2 => (a == 1.0 && b == 0.0 && cc == 0.0).then_some(g),
        3 => (a == 1.0 && b == 0.0 && d == 0.0).then_some(g),
        _ => (a == 1.0 && b == 0.0 && d == 0.0 && e == 0.0 && f == 0.0).then_some(g),
    }
}
/// skcms_252_random_bytes (skcms.cc), used by skcms_ApproximatelyEqualProfiles.
const RANDOM_252: [u8; 252] = [
    8, 179, 128, 204, 253, 38, 134, 184, 68, 102, 32, 138, 99, 39, 169, 215,
    119, 26, 3, 223, 95, 239, 52, 132, 114, 74, 81, 234, 97, 116, 244, 205, 30,
    154, 173, 12, 51, 159, 122, 153, 61, 226, 236, 178, 229, 55, 181, 220, 191,
    194, 160, 126, 168, 82, 131, 18, 180, 245, 163, 22, 246, 69, 235, 252, 57,
    108, 14, 6, 152, 240, 255, 171, 242, 20, 227, 177, 238, 96, 85, 16, 211,
    70, 200, 149, 155, 146, 127, 145, 100, 151, 109, 19, 165, 208, 195, 164,
    137, 254, 182, 248, 64, 201, 45, 209, 5, 147, 207, 210, 113, 162, 83, 225,
    9, 31, 15, 231, 115, 37, 58, 53, 24, 49, 197, 56, 120, 172, 48, 21, 214,
    129, 111, 11, 50, 187, 196, 34, 60, 103, 71, 144, 47, 203, 77, 80, 232,
    140, 222, 250, 206, 166, 247, 139, 249, 221, 72, 106, 27, 199, 117, 54,
    219, 135, 118, 40, 79, 41, 251, 46, 93, 212, 92, 233, 148, 28, 121, 63,
    123, 158, 105, 59, 29, 42, 143, 23, 0, 107, 176, 87, 104, 183, 156, 193,
    189, 90, 188, 65, 190, 17, 198, 7, 186, 161, 1, 124, 78, 125, 170, 133,
    174, 218, 67, 157, 75, 101, 89, 217, 62, 33, 141, 228, 25, 35, 91, 230, 4,
    2, 13, 73, 86, 167, 237, 84, 243, 44, 185, 66, 130, 110, 150, 142, 216, 88,
    112, 36, 224, 136, 202, 76, 94, 98, 175, 213,
];
fn q15(v: f64) -> f64 { ((v as f32) * 65536.0).round() as f64 / 65536.0 }
/// The matrix/TRC profile libjxl's MaybeCreateProfile writes for `c`
/// (s15Fixed16-quantized colorants and `para` curves), as (D50 matrix, curve).
fn candidate(c: &JxlColorEncoding, gray_white: [f64; 3]) -> Option<(M3, Curve)> {
    let mut curve = Curve { kind: 3, ..Curve::new() };
    let p: [f64; 5] = match c.transfer_function {
        TF_GAMMA => { curve.kind = 0; [((1.0 / c.gamma) as f32) as f64, 0.0, 0.0, 0.0, 0.0] }
        TF_SRGB => [2.4, 1.0 / 1.055, 0.055 / 1.055, 1.0 / 12.92, 0.04045],
        TF_709 => [1.0 / 0.45, 1.0 / 1.099, 0.099 / 1.099, 1.0 / 4.5, 0.081],
        TF_LINEAR => [1.0, 1.0, 0.0, 1.0, 0.0],
        TF_DCI => [2.6, 1.0, 0.0, 1.0, 0.0],
        _ => return None,
    };
    for (k, v) in p.iter().enumerate() { curve.p[k] = q15(*v); }
    let m = if c.color_space == CS_GRAY {
        [gray_white[0], 0.0, 0.0, 0.0, gray_white[1], 0.0, 0.0, 0.0, gray_white[2]]
    } else {
        let w = white_of(c)?;
        let to_xyz = rgb_to_xyz(primaries_of(c)?, w)?;
        let lms = |v: [f64; 3]| apply(&BRADFORD, v);
        let (l, l50) = (lms(white_xyz(w)), lms([0.96422, 1.0, 0.82521]));
        let scale = [l50[0] / l[0], 0.0, 0.0, 0.0, l50[1] / l[1], 0.0, 0.0, 0.0, l50[2] / l[2]];
        mul(&mul(&inv(&BRADFORD)?, &mul(&scale, &BRADFORD)), &to_xyz).map(q15)
    };
    Some((m, curve))
}
/// skcms_ApproximatelyEqualProfiles: 84 pixels -> XYZD50 u8, max 1 apart.
fn approx_equal(m: &M3, curves: &[Curve; 3], c: &JxlColorEncoding, gray_white: [f64; 3]) -> bool {
    let Some((cm, cc)) = candidate(c, gray_white) else { return false };
    let to8 = |v: f64| (v.clamp(0.0, 1.0) * 255.0).round() as i32;
    RANDOM_252.chunks_exact(3).all(|px| {
        let x = [0, 1, 2].map(|k| px[k] as f64 / 255.0);
        let a = apply(m, [0, 1, 2].map(|k| curves[k].eval_raw(x[k])));
        let b = apply(&cm, x.map(|v| cc.eval_raw(v)));
        (0..3).all(|k| (to8(a[k]) - to8(b[k])).abs() <= 1)
    })
}
/// Enum fields for a matrix/TRC (or gray) ICC; TF_UNKNOWN when no enum
/// matches. None where libjxl's set_fields would fail.
pub fn describe(bytes: &[u8], gray: bool, m: Option<&MatrixTrc>) -> Option<JxlColorEncoding> {
    if bytes.len() < 128 { return None; }
    let be = u32::from_be_bytes(bytes[64..68].try_into().unwrap());
    let intent = be.min(u32::from_le_bytes(bytes[64..68].try_into().unwrap()));
    if intent > 3 { return None; }
    let mut c = JxlColorEncoding { rendering_intent: intent as i32, ..Default::default() };
    if let Some(t) = tag_data(bytes, b"cicp") { if apply_cicp(t, &mut c) { return Some(c); } }
    c.color_space = if gray { CS_GRAY } else { CS_RGB };
    // UnadaptedWhitePoint
    let wtpt = xyz_tag(bytes, b"wtpt")?;
    let chad = tag_data(bytes, b"chad").filter(|t| t.len() >= 44 && &t[..4] == b"sf32")
        .map(|t| -> M3 { std::array::from_fn(|i| s15(t, 8 + i * 4)) });
    let inv_chad = match chad { Some(ch) => Some(inv(&ch)?), None => None };
    let white = xy_of(inv_chad.map_or(wtpt, |ic| apply(&ic, wtpt)));
    if white[0] == 0.0 || white[1] == 0.0 || !white[0].is_finite() || !white[1].is_finite() { return None; }
    let snap = |xy: [f64; 2], k: [f64; 2]| near(xy[0], k[0]) && near(xy[1], k[1]);
    c.white_point = if snap(white, D65) { WP_D65 } else if snap(white, [1.0 / 3.0, 1.0 / 3.0]) { WP_E }
        else if snap(white, [0.314, 0.351]) { WP_DCI } else { c.white_point_xy = quantize_xy(white)?; WP_CUSTOM };
    let gray_white = [s15(bytes, 68), s15(bytes, 72), s15(bytes, 76)];
    let Some(m) = m else { c.transfer_function = TF_UNKNOWN; return Some(c) };
    // ICC colorants (D50 PCS), skcms toXYZD50.
    let pcs: M3 = if gray { [gray_white[0], 0.0, 0.0, 0.0, gray_white[1], 0.0, 0.0, 0.0, gray_white[2]] } else { m.xyz };
    if !gray {
        // IdentifyPrimaries
        let inverse_chad = match inv_chad {
            Some(ic) => ic,
            None => {
                const XYZ_FROM_LMS: M3 = [0.9869929, -0.1470543, 0.1599627, 0.4323053, 0.5183603, 0.0492912, -0.0085287, 0.0400428, 0.9684867];
                let (l, l50) = (apply(&BRADFORD, white_xyz(white)), apply(&BRADFORD, [0.96420288, 1.0, 0.82490540]));
                let d = [l[0] / l50[0], 0.0, 0.0, 0.0, l[1] / l50[1], 0.0, 0.0, 0.0, l[2] / l50[2]];
                mul(&mul(&XYZ_FROM_LMS, &d), &BRADFORD)
            }
        };
        let mut prim = [[0.0; 2]; 3];
        for (i, p) in prim.iter_mut().enumerate() {
            let rgb = [0, 1, 2].map(|k| m.curves[k].eval_raw(if k == i { 1.0 } else { 0.0 }));
            *p = xy_of(apply(&inverse_chad, apply(&pcs, rgb)));
            if p[0] == 0.0 || p[1] == 0.0 || !p[0].is_finite() || !p[1].is_finite() { return None; }
        }
        const P2100: [[f64; 2]; 3] = [[0.708, 0.292], [0.170, 0.797], [0.131, 0.046]];
        const PP3: [[f64; 2]; 3] = [[0.680, 0.320], [0.265, 0.690], [0.150, 0.060]];
        let is = |k: [[f64; 2]; 3]| (0..3).all(|i| snap(prim[i], k[i]));
        c.primaries = if is(SRGB_PRIMARIES) { PR_SRGB } else if is(P2100) { PR_2100 } else if is(PP3) { PR_P3 } else {
            c.primaries_red_xy = quantize_xy(prim[0])?;
            c.primaries_green_xy = quantize_xy(prim[1])?;
            c.primaries_blue_xy = quantize_xy(prim[2])?;
            PR_CUSTOM
        };
    }
    // DetectTransferFunction. libjxl reads trc[0]'s parameters for every
    // parametric channel (`profile.trc->parametric`); mirrored here.
    let gamma = |i: usize| -> f64 {
        let g = if m.curves[i].kind >= 0 { pure_gamma(&m.curves[0]).filter(|_| m.curves[0].kind >= 0) } else { pure_gamma(&m.curves[i]) };
        g.map_or(0.0, |g| (1.0 / g as f32) as f64)
    };
    let gm = [gamma(0), gamma(1), gamma(2)];
    if gm[0] != 0.0 && (gm[0] - gm[1]).abs() < 1e-4 && (gm[1] - gm[2]).abs() < 1e-4 && (1.0 / 8192.0..=1.0).contains(&gm[0]) {
        let g = gm[0];
        if near(g, 1.0) { c.transfer_function = TF_LINEAR; }
        else if near(g, 1.0 / 2.6) { c.transfer_function = TF_DCI; }
        else { c.transfer_function = TF_GAMMA; c.gamma = ((g * 1e7) as f32).round() as f64 * 1e-7; }
        if approx_equal(&pcs, &m.curves, &c, gray_white) { return Some(c); }
        c.gamma = 0.0;
    }
    for tf in [TF_709, TF_LINEAR, TF_SRGB, TF_DCI] {
        c.transfer_function = tf;
        if approx_equal(&pcs, &m.curves, &c, gray_white) { return Some(c); }
    }
    c.transfer_function = TF_UNKNOWN;
    Some(c)
}

// --------------------------------------------------------------- CMS state
enum SourceKind { Matrix(Arc<MatrixTrc>), Lut(LutTransform) }
struct Source { bytes: Vec<u8>, gray: bool, kind: SourceKind }
pub struct Context {
    source: Option<Source>,
    /// 0 auto, 1 exact (always embed ICC), 2/3 BT.2100/P3 enum header (the
    /// source ICC still drives the pixels).
    mode: i32,
    /// Last set_fields result for the source ICC: true = enum header.
    enum_header: bool,
    /// The enum fields reported for the source ICC. When libjxl keeps an enum
    /// header it regenerates the ICC from these fields, so CMS init receives
    /// that synthetic profile instead of the source bytes.
    described: Option<JxlColorEncoding>,
    path: i32,
}
enum Op {
    Matrix(Arc<MatrixTrc>, bool),
    Lut(LutTransform),
    /// `ootf`: HLG OOTF gamma and source-primary luminances (RGB) when the
    /// input is HLG and the intensity target is not ~300 nits.
    Enum { tf: Tf, m: Option<[f32; 9]>, gray: bool, ootf: Option<(f32, [f32; 3])> },
}
struct Session {
    op: Op,
    src: Vec<Vec<f32>>,
    dst: Vec<Vec<f32>>,
}

impl Context {
    fn is_source(&self, icc: &[u8]) -> bool { self.source.as_ref().is_some_and(|s| s.bytes == icc) }
    fn op_for(&mut self, input: &JxlColorProfile, output: &JxlColorProfile, intensity: f32) -> Option<Op> {
        if !is_linear_srgb_target(&output.color_encoding) { return None; }
        let icc = if input.icc_data.is_null() || input.icc_size == 0 { &[][..] }
                  else { unsafe { std::slice::from_raw_parts(input.icc_data, input.icc_size) } };
        let ce = &input.color_encoding;
        let channels = input.num_channels;
        if let Some(source) = &self.source {
            let header_override = self.mode >= 2 && !source.gray && ce.color_space == CS_RGB;
            let described = self.described.as_ref().is_some_and(|d| same_encoding(d, ce));
            if (self.is_source(icc) || header_override || described) && channels == if source.gray { 1 } else { 3 } {
                return Some(match &source.kind {
                    SourceKind::Matrix(m) => Op::Matrix(m.clone(), source.gray),
                    SourceKind::Lut(t) => Op::Lut(t.clone()),
                });
            }
        }
        let tf = tf_of(ce, intensity)?;
        let white = white_of(ce)?;
        let hlg = if matches!(tf, Tf::Hlg) { hlg_ootf_gamma(intensity) } else { None };
        match (ce.color_space, channels) {
            (CS_GRAY, 1) => Some(Op::Enum { tf, m: None, gray: true, ootf: hlg.map(|g| (g, [0.0; 3])) }),
            (CS_RGB, 3) => {
                let to_xyz = rgb_to_xyz(primaries_of(ce)?, white)?;
                let adapted = if white == D65 { to_xyz } else { mul(&adapt(white, D65)?, &to_xyz) };
                let m = mul(&inv(&rgb_to_xyz(SRGB_PRIMARIES, D65)?)?, &adapted);
                // GetPrimariesLuminances: the Y row of the source RGB->XYZ.
                let ootf = hlg.map(|g| (g, [to_xyz[3] as f32, to_xyz[4] as f32, to_xyz[5] as f32]));
                Some(Op::Enum { tf, m: Some(m.map(|v| v as f32)), gray: false, ootf })
            }
            _ => None,
        }
    }
}

/// Fill the xy fields of enum white points / primaries the way libjxl's
/// `ColorEncoding::ToExternal` does (stock CMSes return that). libjxl's
/// `MaybeCreateProfile` (DecideIfWantICC) builds its chad/colorants from
/// these xy values, so zeros would make it keep the ICC.
fn fill_xy(c: &mut JxlColorEncoding) {
    let w = match c.white_point {
        WP_D65 => Some([0.3127, 0.3290]),
        WP_DCI => Some([0.314, 0.351]),
        WP_E => Some([1.0 / 3.0, 1.0 / 3.0]),
        _ => None,
    };
    if let Some(w) = w { c.white_point_xy = w; }
    if c.color_space == CS_RGB {
        let p = match c.primaries {
            PR_SRGB => Some([[0.639998686, 0.330010138], [0.300003784, 0.600003357], [0.150002046, 0.059997204]]),
            PR_2100 => Some([[0.708, 0.292], [0.170, 0.797], [0.131, 0.046]]),
            PR_P3 => Some([[0.680, 0.320], [0.265, 0.690], [0.150, 0.060]]),
            _ => None,
        };
        if let Some(p) = p { c.primaries_red_xy = p[0]; c.primaries_green_xy = p[1]; c.primaries_blue_xy = p[2]; }
    }
    if c.transfer_function != TF_GAMMA { c.gamma = 0.0; }
}

unsafe extern "C" fn set_fields(data: *mut c_void, icc: *const u8, size: usize, c: *mut JxlColorEncoding, cmyk: *mut i32) -> i32 {
    let ctx = unsafe { &mut *(data as *mut Context) };
    if c.is_null() || cmyk.is_null() || icc.is_null() { return 0; }
    let bytes = unsafe { std::slice::from_raw_parts(icc, size) };
    let c = unsafe { &mut *c };
    unsafe { *cmyk = 0 };
    let Some(source) = ctx.source.as_ref().filter(|s| s.bytes == bytes) else {
        // Not the registered source (libjxl does not do this while encoding):
        // describe it if it is a supported matrix/TRC profile.
        let Ok(inspected) = inspect(bytes) else { return 0 };
        return match describe(bytes, inspected.gray, inspected.matrix.as_ref()) {
            Some(d) => { *c = d; fill_xy(c); 1 }
            None => 0,
        };
    };
    let matrix = match &source.kind { SourceKind::Matrix(m) => Some(&**m), SourceKind::Lut(_) => None };
    *c = describe(bytes, source.gray, matrix).unwrap_or(JxlColorEncoding {
        // Not describable (e.g. no wtpt): the bytes are ours and validated,
        // keep them as ICC.
        color_space: if source.gray { CS_GRAY } else { CS_RGB },
        white_point: WP_D65,
        rendering_intent: (bytes[67] as i32).min(3),
        ..Default::default()
    });
    if c.primaries == 0 { c.primaries = PR_SRGB; }
    // libjxl's stock sRGB / linear-sRGB fast paths (ToXYB) bypass the CMS and
    // would replace the profile's real curve by the ideal one (measured 6.4e-6
    // XYB for an LCMS parametric sRGB ICC vs 3e-6 gate; 1.2e-4 for 1024-entry
    // tables). Keep such profiles as ICC so the exact source path runs.
    let fast_path = (c.transfer_function == TF_SRGB || is_linear(c)) && is_d65(c) && (c.color_space == CS_GRAY || is_srgb_primaries(c));
    // A LUT is never representable by an enum.
    let lut = matches!(source.kind, SourceKind::Lut(_));
    if ctx.mode == 1 || fast_path || lut { c.transfer_function = TF_UNKNOWN; }
    fill_xy(c);
    ctx.enum_header = c.transfer_function != TF_UNKNOWN;
    ctx.described = ctx.enum_header.then_some(*c);
    1
}

unsafe extern "C" fn init(data: *mut c_void, threads: usize, pixels: usize, input: *const JxlColorProfile, output: *const JxlColorProfile, intensity: f32) -> *mut c_void {
    let ctx = unsafe { &mut *(data as *mut Context) };
    let (input_ref, output_ref) = unsafe { (&*input, &*output) };
    // Only "-> linear sRGB" is needed for XYB; anything else fails the encode.
    let Some(op) = ctx.op_for(input_ref, output_ref, intensity) else { return std::ptr::null_mut() };
    let channels = input_ref.num_channels.max(1);
    let session = Session {
        op,
        src: (0..threads).map(|_| vec![0f32; pixels * channels]).collect(),
        dst: (0..threads).map(|_| vec![0f32; pixels * output_ref.num_channels.max(1)]).collect(),
    };
    Box::into_raw(Box::new(session)) as *mut c_void
}
unsafe extern "C" fn get_src(data: *mut c_void, thread: usize) -> *mut f32 {
    let s = unsafe { &mut *(data as *mut Session) };
    s.src[thread].as_mut_ptr()
}
unsafe extern "C" fn get_dst(data: *mut c_void, thread: usize) -> *mut f32 {
    let s = unsafe { &mut *(data as *mut Session) };
    s.dst[thread].as_mut_ptr()
}
unsafe extern "C" fn run(data: *mut c_void, _thread: usize, input: *const f32, output: *mut f32, n: usize) -> i32 {
    let s = unsafe { &*(data as *mut Session) };
    let op = &s.op;
    let channels = match op { Op::Matrix(_, true) | Op::Enum { gray: true, .. } => 1, _ => 3 };
    // Input may alias our own src buffer; read it fully before writing output.
    let src = unsafe { std::slice::from_raw_parts(input, n * channels) }.to_vec();
    let out = unsafe { std::slice::from_raw_parts_mut(output, n * channels) };
    convert(op, &src, out)
}
fn convert(op: &Op, src: &[f32], out: &mut [f32]) -> i32 {
    match op {
        Op::Matrix(m, true) => {
            for (o, &v) in out.iter_mut().zip(src) { *o = m.curves[0].eval(v as f64) as f32; }
        }
        Op::Matrix(m, false) => {
            for (o, i) in out.chunks_exact_mut(3).zip(src.chunks_exact(3)) {
                let lin = [0, 1, 2].map(|c| m.curves[c].eval(i[c] as f64) as f32 as f64);
                for r in 0..3 {
                    o[r] = (m.to709[r * 3] as f64 * lin[0] + m.to709[r * 3 + 1] as f64 * lin[1] + m.to709[r * 3 + 2] as f64 * lin[2]) as f32;
                }
            }
        }
        Op::Lut(t) => {
            if t.transform(src, out).is_err() { return 0; }
        }
        Op::Enum { tf, m: None, ootf, .. } => {
            for (o, &v) in out.iter_mut().zip(src) {
                let l = linearize(*tf, v);
                *o = match ootf { Some((g, _)) => l.powf(*g), None => l };
            }
        }
        Op::Enum { tf, m: Some(m), ootf, .. } => {
            for (o, i) in out.chunks_exact_mut(3).zip(src.chunks_exact(3)) {
                let mut lin = [0, 1, 2].map(|c| linearize(*tf, i[c]));
                if let Some((g, lum)) = ootf { apply_hlg_ootf(&mut lin, *g, lum); }
                for r in 0..3 { o[r] = m[r * 3] * lin[0] + m[r * 3 + 1] * lin[1] + m[r * 3 + 2] * lin[2]; }
            }
        }
    }
    1
}
unsafe extern "C" fn destroy(data: *mut c_void) {
    if !data.is_null() { drop(unsafe { Box::from_raw(data as *mut Session) }); }
}

// ------------------------------------------------------------ bridge C ABI
fn write_error(text: &str, out: *mut c_char, n: usize) {
    if out.is_null() || n == 0 { return; }
    let bytes = text.as_bytes();
    let k = bytes.len().min(n - 1);
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), out as *mut u8, k);
        *out.add(k) = 0;
    }
}
/// Creates the per-encode CMS context. `icc` may be null (enum input).
/// Returns null and writes `error` if the source ICC is rejected.
/// `path` reports 1 matrix/TRC, 2 LUT (moxcms), 3 gray kTRC.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn planar_cms_create(icc: *const u8, size: usize, mode: i32,
                                           error: *mut c_char, error_size: usize) -> *mut Context {
    let result = std::panic::catch_unwind(|| -> Result<Context, String> {
        let mut ctx = Context { source: None, mode, enum_header: false, described: None, path: 0 };
        if !icc.is_null() && size > 0 {
            let bytes = unsafe { std::slice::from_raw_parts(icc, size) }.to_vec();
            let inspected = inspect(&bytes).map_err(|e| format!("ICC: {e}"))?;
            if inspected.gray && mode > 1 { return Err("ICC: Gray profiles cannot select an RGB header target".into()); }
            let kind = match inspected.matrix {
                Some(m) => SourceKind::Matrix(Arc::new(m)),
                None if inspected.gray => return Err("ICC: Gray requires a supported kTRC curve".into()),
                None => SourceKind::Lut(moxcms_lut(&bytes).map_err(|e| format!("ICC: {e}"))?),
            };
            ctx.path = match kind { SourceKind::Lut(_) => 2, _ if inspected.gray => 3, _ => 1 };
            ctx.enum_header = mode >= 2;
            ctx.source = Some(Source { bytes, gray: inspected.gray, kind });
        }
        Ok(ctx)
    });
    match result {
        Ok(Ok(ctx)) => Box::into_raw(Box::new(ctx)),
        Ok(Err(e)) => { write_error(&e, error, error_size); std::ptr::null_mut() }
        Err(_) => { write_error("ICC: CMS panic", error, error_size); std::ptr::null_mut() }
    }
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn planar_cms_interface(ctx: *mut Context) -> JxlCmsInterface {
    JxlCmsInterface {
        set_fields_data: ctx as *mut c_void,
        set_fields_from_icc: Some(set_fields),
        init_data: ctx as *mut c_void,
        init: Some(init),
        get_src_buf: Some(get_src),
        get_dst_buf: Some(get_dst),
        run: Some(run),
        destroy: Some(destroy),
    }
}
/// 1 when the source ICC will be written as an enum header (auto mode and an
/// enum describes it, or a BT.2100/P3 header target), 0 when ICC is embedded.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn planar_cms_enum_header(ctx: *const Context) -> i32 { unsafe { (*ctx).enum_header as i32 } }
#[unsafe(no_mangle)]
pub unsafe extern "C" fn planar_cms_path(ctx: *const Context) -> i32 { unsafe { (*ctx).path } }
#[unsafe(no_mangle)]
pub unsafe extern "C" fn planar_cms_gray(ctx: *const Context) -> i32 {
    unsafe { (*ctx).source.as_ref().is_some_and(|s| s.gray) as i32 }
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn planar_cms_destroy(ctx: *mut Context) {
    if !ctx.is_null() { drop(unsafe { Box::from_raw(ctx) }); }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn profile(tags: &[(&[u8; 4], Vec<u8>)]) -> Vec<u8> {
        let mut table = Vec::new();
        let mut data = Vec::new();
        let base = 132 + 12 * tags.len();
        for (sig, body) in tags {
            table.extend_from_slice(*sig);
            table.extend_from_slice(&((base + data.len()) as u32).to_be_bytes());
            table.extend_from_slice(&(body.len() as u32).to_be_bytes());
            data.extend_from_slice(body);
            while data.len() % 4 != 0 { data.push(0); }
        }
        let mut out = vec![0u8; 128];
        out[84..100].fill(0xab);
        out.extend_from_slice(&(tags.len() as u32).to_be_bytes());
        out.extend(table);
        out.extend(data);
        let n = out.len() as u32;
        out[0..4].copy_from_slice(&n.to_be_bytes());
        out
    }
    #[test]
    fn alias_adds_a2b1_pointing_at_a2b0() {
        let a2b0 = b"mft2\0\0\0\0payload!".to_vec();
        let original = profile(&[(b"wtpt", vec![1; 20]), (b"A2B0", a2b0.clone())]);
        let aliased = moxcms_091_relative_a2b0_alias(&original).expect("alias");
        assert_eq!(aliased.len(), original.len() + 12);
        assert_eq!(u32::from_be_bytes(aliased[0..4].try_into().unwrap()) as usize, aliased.len());
        assert_eq!(u32::from_be_bytes(aliased[128..132].try_into().unwrap()), 3);
        assert!(aliased[84..100].iter().all(|&b| b == 0), "profile ID must be cleared");
        let entry = |i: usize| {
            let o = 132 + 12 * i;
            (&aliased[o..o + 4], u32::from_be_bytes(aliased[o + 4..o + 8].try_into().unwrap()) as usize,
             u32::from_be_bytes(aliased[o + 8..o + 12].try_into().unwrap()) as usize)
        };
        let (s0, o0, n0) = entry(1);
        let (s1, o1, n1) = entry(2);
        assert_eq!((s0, s1), (&b"A2B0"[..], &b"A2B1"[..]));
        assert_eq!((o0, n0), (o1, n1));
        assert_eq!(&aliased[o1..o1 + n1], &a2b0[..]);
        let (_, ow, nw) = entry(0);
        assert_eq!(&aliased[ow..ow + nw], &[1u8; 20][..]);
    }
    #[test]
    fn alias_not_applied_when_a2b1_exists_or_no_a2b0() {
        assert!(moxcms_091_relative_a2b0_alias(&profile(&[(b"A2B0", vec![0; 12]), (b"A2B1", vec![0; 12])])).is_none());
        assert!(moxcms_091_relative_a2b0_alias(&profile(&[(b"rTRC", vec![0; 12])])).is_none());
    }
    #[test]
    fn a2b0_only_lut_needs_alias_with_moxcms_091() {
        // Fixture produced by round11 (LCMS device link -> A2B0/B2A0 only).
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/build/round11/lut.icc");
        let Ok(icc) = std::fs::read(path) else { eprintln!("skip: {path} missing"); return };
        let raw = moxcms::ColorProfile::new_from_slice(&icc).unwrap();
        let mut dst = moxcms::ColorProfile::new_srgb();
        dst.cicp = None;
        let options = moxcms::TransformOptions {
            rendering_intent: moxcms::RenderingIntent::RelativeColorimetric,
            allow_extended_range_rgb_xyz: true,
            ..Default::default()
        };
        // If this starts succeeding, moxcms gained the A2B0 fallback: remove the alias.
        assert!(raw.create_transform_f32(moxcms::Layout::Rgb, &dst, moxcms::Layout::Rgb, options).is_err());
        let t = moxcms_lut(&icc).expect("aliased transform");
        let mut out = [0f32; 3];
        t.transform(&[1.0, 1.0, 1.0], &mut out).unwrap();
        assert!(out.iter().all(|v| (v - 1.0).abs() < 0.01), "{out:?}");
    }
    /// Synthetic v4 RGB->XYZ lutAtoBType (linear curves, identity 2^3 CLUT, sRGB
    /// D50 matrix x`scale`; mAB XYZ PCS units are 1.0 = 65535/32768, so x2
    /// maps white to ~4.0 linear), like HDR/wide LUT profiles
    /// (AppleHagc reaches 10.3). With moxcms' default prefer_fixed_point and
    /// its avx_luts feature the f32 LUT saturates at ~2.0 (moxcms#208;
    /// verified: this test then gets 1.99988).
    fn hdr_lut_profile(scale: f64) -> Vec<u8> {
        let s15 = |v: f64| ((v * 65536.0).round() as i32).to_be_bytes();
        // Two-entry linear curv (a zero-entry identity curv sends moxcms to its
        // float "katana" fallback, which does not show the clipping).
        let curv = || -> Vec<u8> { let mut c = b"curv\0\0\0\0\0\0\0\x02".to_vec(); c.extend([0, 0, 0xff, 0xff]); c };
        let curves = || -> Vec<u8> { (0..3).flat_map(|_| curv()).collect() };
        let srgb_d50 = [0.4360747, 0.3850649, 0.1430804, 0.2225045, 0.7168786, 0.0606169, 0.0139322, 0.0971045, 0.7141733];
        let mut matrix: Vec<u8> = srgb_d50.iter().flat_map(|&v| s15(v * scale)).collect();
        matrix.extend([0u8; 12]);
        let mut clut = vec![2u8, 2, 2]; clut.extend([0u8; 13]); clut.push(2); clut.extend([0u8; 3]);
        for i in 0..8u16 { for c in 0..3 { clut.extend(if i >> (2 - c) & 1 == 1 { [0xffu8, 0xff] } else { [0, 0] }); } }
        let mut mab = b"mAB \0\0\0\0\x03\x03\0\0".to_vec();
        let parts = [curves(), matrix, curves(), clut, curves()]; // B, matrix, M, CLUT, A
        let mut offset = 32u32;
        for part in &parts { mab.extend(offset.to_be_bytes()); offset += part.len() as u32; }
        for part in parts { mab.extend(part); }
        let mut wtpt = b"XYZ \0\0\0\0".to_vec();
        for v in [0.9642, 1.0, 0.8249] { wtpt.extend(s15(v)); }
        let mut icc = profile(&[(b"wtpt", wtpt), (b"A2B0", mab)]);
        icc[8..12].copy_from_slice(&[4, 0x30, 0, 0]);
        icc[12..24].copy_from_slice(b"mntrRGB XYZ ");
        icc[36..40].copy_from_slice(b"acsp");
        icc[84..100].fill(0);
        for (k, v) in [0.9642, 1.0, 0.8249].into_iter().enumerate() { icc[68 + 4 * k..72 + 4 * k].copy_from_slice(&s15(v)); }
        icc
    }
    /// D65 P3 matrix/TRC profile with a parametric sRGB curve.
    fn p3_matrix_profile() -> Vec<u8> {
        let s15 = |v: f64| ((v * 65536.0).round() as i32).to_be_bytes();
        let xyz = |v: [f64; 3]| -> Vec<u8> { let mut t = b"XYZ \0\0\0\0".to_vec(); for x in v { t.extend(s15(x)); } t };
        let d50 = [0.3457, 0.3585];
        let m = mul(&adapt([0.3127, 0.3290], d50).unwrap(), &rgb_to_xyz([[0.68, 0.32], [0.265, 0.69], [0.15, 0.06]], [0.3127, 0.3290]).unwrap());
        let mut chad = b"sf32\0\0\0\0".to_vec();
        for v in adapt([0.3127, 0.3290], d50).unwrap() { chad.extend(s15(v)); }
        let mut para = b"para\0\0\0\0\0\x03\0\0".to_vec();
        for v in [2.4, 1.0 / 1.055, 0.055 / 1.055, 1.0 / 12.92, 0.04045] { para.extend(s15(v)); }
        let mut icc = profile(&[
            (b"wtpt", xyz([0.9642, 1.0, 0.8249])),
            (b"chad", chad),
            (b"rXYZ", xyz([m[0], m[3], m[6]])), (b"gXYZ", xyz([m[1], m[4], m[7]])), (b"bXYZ", xyz([m[2], m[5], m[8]])),
            (b"rTRC", para.clone()), (b"gTRC", para.clone()), (b"bTRC", para),
        ]);
        icc[8..12].copy_from_slice(&[4, 0x30, 0, 0]);
        icc[12..24].copy_from_slice(b"mntrRGB XYZ ");
        icc[36..40].copy_from_slice(b"acsp");
        icc[84..100].fill(0);
        for (k, v) in [0.9642, 1.0, 0.8249].into_iter().enumerate() { icc[68 + 4 * k..72 + 4 * k].copy_from_slice(&s15(v)); }
        icc
    }
    /// libjxl's DecideIfWantICC regenerates the profile from the returned
    /// fields and uses their xy values, so enum white/primaries need them
    /// filled (zeros silently kept every D65 profile as ICC).
    #[test]
    fn set_fields_fills_enum_xy() {
        let icc = p3_matrix_profile();
        let mut e = [0 as c_char; 256];
        let ctx = unsafe { planar_cms_create(icc.as_ptr(), icc.len(), 0, e.as_mut_ptr(), e.len()) };
        assert!(!ctx.is_null());
        let mut c = JxlColorEncoding::default();
        let mut cmyk = 0;
        assert_eq!(unsafe { set_fields(ctx as *mut c_void, icc.as_ptr(), icc.len(), &mut c, &mut cmyk) }, 1);
        assert_eq!((c.white_point, c.primaries, c.transfer_function), (WP_D65, PR_P3, TF_SRGB));
        assert_eq!(unsafe { planar_cms_enum_header(ctx) }, 1);
        assert_eq!(c.white_point_xy, [0.3127, 0.3290]);
        assert_eq!([c.primaries_red_xy, c.primaries_green_xy, c.primaries_blue_xy], [[0.68, 0.32], [0.265, 0.69], [0.15, 0.06]]);
        unsafe { planar_cms_destroy(ctx) };
    }
    #[test]
    fn lut_values_above_two_are_not_clipped() {
        let t = moxcms_lut(&hdr_lut_profile(2.0)).expect("synthetic HDR LUT");
        let mut out = [0f32; 6];
        t.transform(&[1.0, 1.0, 1.0, 0.25, 0.25, 0.25], &mut out).unwrap();
        assert!(out[..3].iter().all(|v| (v - 4.0).abs() < 0.02), "white {out:?}");
        assert!(out[3..].iter().all(|v| (v - 1.0).abs() < 0.02), "quarter {out:?}");
    }
    #[test]
    fn fast_math_matches_reference() {
        for k in 1..=1000 {
            let x = k as f32 / 1000.0;
            assert!((fast_powf(x, 2.4) as f64 - (x as f64).powf(2.4)).abs() <= 4e-5 * (x as f64).powf(2.4) + 1e-9);
            let s = if x <= 0.04045 { x as f64 / 12.92 } else { ((x as f64 + 0.055) / 1.055).powf(2.4) };
            assert!((linear_from_srgb(x) as f64 - s).abs() < 2e-6);
        }
    }
    #[test]
    fn enum_matrix_matches_fused_constants() {
        let mut ce = JxlColorEncoding { color_space: CS_RGB, white_point: WP_D65, primaries: PR_P3, transfer_function: TF_SRGB, ..Default::default() };
        ce.rendering_intent = 1;
        let m = mul(&inv(&rgb_to_xyz(SRGB_PRIMARIES, D65).unwrap()).unwrap(), &rgb_to_xyz(primaries_of(&ce).unwrap(), D65).unwrap());
        let fused = [1.224940176, -0.224940176, 0.0, -0.042056955, 1.042056955, 0.0, -0.019637555, -0.078636046, 1.098273600];
        for k in 0..9 { assert!((m[k] - fused[k]).abs() < 1e-8, "{k}: {} vs {}", m[k], fused[k]); }
    }

    /// Comparison against libjxl's own set_fields (skcms / LCMS2) over a
    /// profile corpus: CMS_CORPUS=list.txt CMS_DESCRIBE_OUT=out.tsv cargo test -- --ignored
    #[test]
    #[ignore]
    fn describe_corpus() {
        let (Ok(list), Ok(out)) = (std::env::var("CMS_CORPUS"), std::env::var("CMS_DESCRIBE_OUT")) else { return };
        let mut text = String::new();
        for path in std::fs::read_to_string(list).unwrap().lines() {
            let bytes = std::fs::read(path).unwrap();
            let row = match inspect(&bytes) {
                Err(e) => format!("inspect-error\t{e}"),
                Ok(i) => match describe(&bytes, i.gray, i.matrix.as_ref()) {
                    None => "fail".into(),
                    Some(c) => format!("{} {} {:?} {} {:?} {:?} {:?} {} {} {} lut={}", c.color_space, c.white_point, c.white_point_xy, c.primaries,
                        c.primaries_red_xy, c.primaries_green_xy, c.primaries_blue_xy, c.transfer_function, c.gamma, c.rendering_intent, i.matrix.is_none()),
                },
            };
            text += &format!("{path}\t{row}\n");
        }
        std::fs::write(out, text).unwrap();
    }
}
