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
//!   using the same float approximations as the fused YUV->XYB kernel.
//! Anything else (PQ, HLG, DCI, unknown) goes to the stock default CMS.
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
    Ok(Inspected { gray, matrix: Some(MatrixTrc { curves, to709 }) })
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
enum Tf { Linear, Srgb, Bt709, Gamma(f32) }
fn tf_of(c: &JxlColorEncoding) -> Option<Tf> {
    if is_linear(c) { return Some(Tf::Linear); }
    match c.transfer_function {
        TF_SRGB => Some(Tf::Srgb),
        TF_709 => Some(Tf::Bt709),
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
    }
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

// --------------------------------------------------------------- CMS state
enum SourceKind { Matrix(Arc<MatrixTrc>), Lut(LutTransform) }
struct Source { bytes: Vec<u8>, gray: bool, kind: SourceKind }
pub struct Context {
    source: Option<Source>,
    /// 0 auto, 1 exact (always embed ICC), 2/3 BT.2100/P3 enum header (the
    /// source ICC still drives the pixels).
    mode: i32,
    fallback: JxlCmsInterface,
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
    Enum { tf: Tf, m: Option<[f32; 9]>, gray: bool },
}
struct Session {
    op: Option<Op>,
    fallback: Option<(JxlCmsInterface, *mut c_void)>,
    src: Vec<Vec<f32>>,
    dst: Vec<Vec<f32>>,
}

impl Context {
    fn is_source(&self, icc: &[u8]) -> bool { self.source.as_ref().is_some_and(|s| s.bytes == icc) }
    fn op_for(&mut self, input: &JxlColorProfile, output: &JxlColorProfile) -> Option<Op> {
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
        let tf = tf_of(ce)?;
        let white = white_of(ce)?;
        match (ce.color_space, channels) {
            (CS_GRAY, 1) => Some(Op::Enum { tf, m: None, gray: true }),
            (CS_RGB, 3) => {
                let to_xyz = rgb_to_xyz(primaries_of(ce)?, white)?;
                let adapted = if white == D65 { to_xyz } else { mul(&adapt(white, D65)?, &to_xyz) };
                let m = mul(&inv(&rgb_to_xyz(SRGB_PRIMARIES, D65)?)?, &adapted);
                Some(Op::Enum { tf, m: Some(m.map(|v| v as f32)), gray: false })
            }
            _ => None,
        }
    }
}

unsafe extern "C" fn set_fields(data: *mut c_void, icc: *const u8, size: usize, c: *mut JxlColorEncoding, cmyk: *mut i32) -> i32 {
    let ctx = unsafe { &mut *(data as *mut Context) };
    let bytes = if icc.is_null() { &[][..] } else { unsafe { std::slice::from_raw_parts(icc, size) } };
    let stock = match ctx.fallback.set_fields_from_icc {
        Some(f) => unsafe { f(ctx.fallback.set_fields_data, icc, size, c, cmyk) },
        None => 0,
    };
    let Some(source) = ctx.source.as_ref().filter(|s| s.bytes == bytes) else { return stock; };
    if c.is_null() || cmyk.is_null() { return 0; }
    let c = unsafe { &mut *c };
    if stock == 0 {
        // Stock CMS could not describe it (e.g. unpatched skcms on XYZ-PCS
        // LUTs). The bytes are ours and validated: keep them as ICC.
        *c = JxlColorEncoding {
            color_space: if source.gray { CS_GRAY } else { CS_RGB },
            white_point: WP_D65,
            primaries: PR_SRGB,
            transfer_function: TF_UNKNOWN,
            rendering_intent: (bytes[67] as i32).min(3),
            ..Default::default()
        };
        unsafe { *cmyk = 0 };
    }
    // libjxl's stock sRGB / linear-sRGB fast paths (ToXYB) bypass the CMS and
    // would replace the profile's real curve by the ideal one (measured 6.4e-6
    // XYB for an LCMS parametric sRGB ICC vs 3e-6 gate; 1.2e-4 for 1024-entry
    // tables). Keep such profiles as ICC so the exact source path runs.
    let fast_path = (c.transfer_function == TF_SRGB || is_linear(c)) && is_d65(c) && (c.color_space == CS_GRAY || is_srgb_primaries(c));
    // A LUT is never representable by an enum, whatever the stock CMS infers.
    let lut = matches!(source.kind, SourceKind::Lut(_));
    if ctx.mode == 1 || fast_path || lut { c.transfer_function = TF_UNKNOWN; }
    ctx.enum_header = c.transfer_function != TF_UNKNOWN && unsafe { *cmyk } == 0;
    ctx.described = ctx.enum_header.then_some(*c);
    1
}

unsafe extern "C" fn init(data: *mut c_void, threads: usize, pixels: usize, input: *const JxlColorProfile, output: *const JxlColorProfile, intensity: f32) -> *mut c_void {
    let ctx = unsafe { &mut *(data as *mut Context) };
    let (input_ref, output_ref) = unsafe { (&*input, &*output) };
    let op = ctx.op_for(input_ref, output_ref);
    let mut session = Session { op: None, fallback: None, src: Vec::new(), dst: Vec::new() };
    match op {
        Some(op) => {
            let channels = input_ref.num_channels.max(1);
            session.src = (0..threads).map(|_| vec![0f32; pixels * channels]).collect();
            session.dst = (0..threads).map(|_| vec![0f32; pixels * output_ref.num_channels.max(1)]).collect();
            session.op = Some(op);
        }
        None => {
            let Some(f) = ctx.fallback.init else { return std::ptr::null_mut() };
            let inner = unsafe { f(ctx.fallback.init_data, threads, pixels, input, output, intensity) };
            if inner.is_null() { return std::ptr::null_mut(); }
            session.fallback = Some((ctx.fallback, inner));
        }
    }
    Box::into_raw(Box::new(session)) as *mut c_void
}
unsafe extern "C" fn get_src(data: *mut c_void, thread: usize) -> *mut f32 {
    let s = unsafe { &mut *(data as *mut Session) };
    match s.fallback { Some((f, inner)) => unsafe { f.get_src_buf.unwrap()(inner, thread) }, None => s.src[thread].as_mut_ptr() }
}
unsafe extern "C" fn get_dst(data: *mut c_void, thread: usize) -> *mut f32 {
    let s = unsafe { &mut *(data as *mut Session) };
    match s.fallback { Some((f, inner)) => unsafe { f.get_dst_buf.unwrap()(inner, thread) }, None => s.dst[thread].as_mut_ptr() }
}
unsafe extern "C" fn run(data: *mut c_void, thread: usize, input: *const f32, output: *mut f32, n: usize) -> i32 {
    let s = unsafe { &mut *(data as *mut Session) };
    if let Some((f, inner)) = s.fallback { return unsafe { f.run.unwrap()(inner, thread, input, output, n) }; }
    let Some(op) = &s.op else { return 0 };
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
        Op::Enum { tf, m: None, .. } => {
            for (o, &v) in out.iter_mut().zip(src) { *o = linearize(*tf, v); }
        }
        Op::Enum { tf, m: Some(m), .. } => {
            for (o, i) in out.chunks_exact_mut(3).zip(src.chunks_exact(3)) {
                let lin = [0, 1, 2].map(|c| linearize(*tf, i[c]));
                for r in 0..3 { o[r] = m[r * 3] * lin[0] + m[r * 3 + 1] * lin[1] + m[r * 3 + 2] * lin[2]; }
            }
        }
    }
    1
}
unsafe extern "C" fn destroy(data: *mut c_void) {
    if data.is_null() { return; }
    let s = unsafe { Box::from_raw(data as *mut Session) };
    if let Some((f, inner)) = s.fallback { if let Some(d) = f.destroy { unsafe { d(inner) } } }
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
pub unsafe extern "C" fn planar_cms_create(icc: *const u8, size: usize, mode: i32, fallback: *const JxlCmsInterface,
                                           error: *mut c_char, error_size: usize) -> *mut Context {
    if fallback.is_null() { write_error("missing default CMS", error, error_size); return std::ptr::null_mut(); }
    let result = std::panic::catch_unwind(|| -> Result<Context, String> {
        let mut ctx = Context { source: None, mode, fallback: unsafe { *fallback }, enum_header: false, described: None, path: 0 };
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
}
