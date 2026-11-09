//! Opt-in native callback microbenchmark; profile/session creation is untimed.
use crate::cms::*;
use std::{ffi::c_char, hint::black_box, time::Instant};

#[test]
#[ignore = "manual CMS timing: cargo test --lib --release --locked --jobs 1 cms_row_benchmark -- --ignored --nocapture"]
fn cms_row_benchmark() {
    const WIDTH: usize = 2048;
    const ROWS: usize = 1024;
    let icc = moxcms::ColorProfile::new_display_p3().encode().unwrap();
    let mut error = [0 as c_char; 256];
    unsafe {
        let ctx = planar_cms_create(icc.as_ptr(), icc.len(), 1, error.as_mut_ptr(), error.len());
        assert!(!ctx.is_null());
        assert_eq!(planar_cms_path(ctx), 1); // matrix/TRC, not enum or LUT
        let cms = planar_cms_interface(ctx);
        let input = JxlColorProfile { icc_data: icc.as_ptr(), icc_size: icc.len(), color_encoding: JxlColorEncoding::default(), num_channels: 3 };
        let output = JxlColorProfile { icc_data: std::ptr::null(), icc_size: 0, color_encoding: JxlColorEncoding {
            color_space: CS_RGB, white_point: WP_D65, primaries: PR_SRGB, transfer_function: TF_LINEAR, ..Default::default()
        }, num_channels: 3 };
        let session = cms.init.unwrap()(cms.init_data, 1, WIDTH, &input, &output, 255.0);
        assert!(!session.is_null());
        let src = cms.get_src_buf.unwrap()(session, 0);
        let dst = cms.get_dst_buf.unwrap()(session, 0);
        for k in 0..WIDTH * 3 { *src.add(k) = ((k * 37 % 1009) as f32 + 0.5) / 1009.0; }
        let run = cms.run.unwrap();
        for _ in 0..32 { assert_eq!(run(session, 0, src, dst, WIDTH), 1); }
        let mut times = Vec::new();
        for _ in 0..7 {
            let start = Instant::now();
            for _ in 0..ROWS {
                assert_eq!(run(black_box(session), 0, black_box(src), black_box(dst), WIDTH), 1);
                black_box(*dst.add(WIDTH * 3 - 1));
            }
            times.push(start.elapsed().as_secs_f64() * 1000.0);
        }
        times.sort_by(f64::total_cmp);
        eprintln!("CMS 2048 pixels/row x 1024 rows, RGB f32 synthetic, moxcms new_display_p3 matrix/TRC; ms={times:?}; median_ms={:.3}", times[3]);
        cms.destroy.unwrap()(session);
        planar_cms_destroy(ctx);
    }
}
