//! Experimental WASM resize kernels backed by the fast_image_resize crate.
//!
//! Exposes a minimal C ABI so the TypeScript side can drive resizes without
//! wasm-bindgen. Channels are resized independently (no alpha premultiply) to
//! match the semantics of the JS/AssemblyScript fixed-point path.

use std::alloc::{alloc, dealloc, Layout};

use fast_image_resize::images::{Image, ImageRef};
use fast_image_resize::{FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer};

#[no_mangle]
pub extern "C" fn rs_alloc(len: usize) -> *mut u8 {
    unsafe { alloc(Layout::from_size_align_unchecked(len.max(1), 16)) }
}

#[no_mangle]
pub extern "C" fn rs_free(ptr: *mut u8, len: usize) {
    unsafe { dealloc(ptr, Layout::from_size_align_unchecked(len.max(1), 16)) }
}

/// Resizes an 8-bit image with 1, 2 or 4 interleaved channels.
/// filter: 0 = CatmullRom, 1 = Lanczos3.
/// Returns 0 on success.
#[no_mangle]
pub extern "C" fn rs_resize_u8(
    src: *const u8,
    src_width: u32,
    src_height: u32,
    dst: *mut u8,
    dst_width: u32,
    dst_height: u32,
    channels: u32,
    filter: u32,
) -> i32 {
    let pixel_type = match channels {
        1 => PixelType::U8,
        2 => PixelType::U8x2,
        4 => PixelType::U8x4,
        _ => return 1,
    };
    let filter_type = match filter {
        0 => FilterType::CatmullRom,
        1 => FilterType::Lanczos3,
        _ => return 2,
    };
    let src_len = (src_width * src_height * channels) as usize;
    let dst_len = (dst_width * dst_height * channels) as usize;
    let src_slice = unsafe { std::slice::from_raw_parts(src, src_len) };
    let dst_slice = unsafe { std::slice::from_raw_parts_mut(dst, dst_len) };

    let src_image = match ImageRef::new(src_width, src_height, src_slice, pixel_type) {
        Ok(image) => image,
        Err(_) => return 3,
    };
    let mut dst_image = match Image::from_slice_u8(dst_width, dst_height, dst_slice, pixel_type) {
        Ok(image) => image,
        Err(_) => return 4,
    };

    let mut resizer = Resizer::new();
    let options = ResizeOptions::new()
        .resize_alg(ResizeAlg::Convolution(filter_type))
        .use_alpha(false);
    match resizer.resize(&src_image, &mut dst_image, &options) {
        Ok(()) => 0,
        Err(_) => 5,
    }
}
