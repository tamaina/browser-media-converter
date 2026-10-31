fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 3 && args.len() != 4 {
        return Err("usage: oracle input.jxl output.f32le".into());
    }
    let mut image = jxl_oxide::JxlImage::builder().open(&args[1])?;
    if args.get(3).is_some_and(|s| s == "--depth") {
        println!("{} {:?}", image.image_header().metadata.bit_depth.bits_per_sample(), image.image_header().metadata.bit_depth);
        return Ok(());
    }
    // Gamma has no CICP transfer identifier. 65535 is this CLI's GAMMA
    // sentinel (same as JXL_TRANSFER_FUNCTION_GAMMA), not a CICP tag.
    let cicp = image.rendered_cicp().map(|v| v.map(u32::from)).unwrap_or([1,65535,0,1]);
    let original = match &image.image_header().metadata.colour_encoding {
        jxl_oxide::color::ColourEncoding::Enum(original) => original.clone(),
        _ => {
            if args.get(3).is_some_and(|s| s == "--encoding") {
                println!("ICC");
                return Ok(());
            }
            if args.get(3).is_none() || args.get(3).is_some_and(|s| s == "--linear-source") {
                return Err("ICC original-space output requires a CMS; use --linear709/--srgb".into());
            }
            jxl_oxide::EnumColourEncoding::srgb(jxl_oxide::color::RenderingIntent::Relative)
        }
    };
    if args.get(3).is_some_and(|s| s == "--encoding") {
        println!("{original:?}"); return Ok(());
    }
    // A linear target triggers oxide's automatic Rec.2408 HDR->SDR mapping.
    // Request decoded XYB for this diagnostic mode, then invert it with the
    // codestream's opsin matrix/bias and intensity, bypassing display policy.
    let hdr_linear = args.get(3).is_some_and(|s| s == "--hdr-linear709");
    let intensity = image.image_header().metadata.tone_mapping.intensity_target;
    let oim = &image.image_header().metadata.opsin_inverse_matrix;
    let inv_mat = oim.inv_mat;
    let bias = oim.opsin_bias;
    let mut desired=original.clone();
    match args.get(3).map(String::as_str) {
        Some("--linear-source") => desired.tf=jxl_oxide::color::TransferFunction::Linear,
        Some("--hdr-linear709") => desired=jxl_oxide::EnumColourEncoding::xyb(original.rendering_intent),
        Some("--linear709") => desired=jxl_oxide::EnumColourEncoding::srgb_linear(original.rendering_intent),
        Some("--srgb") => desired=jxl_oxide::EnumColourEncoding::srgb(original.rendering_intent),
        Some(_) => return Err("unknown output encoding".into()),
        None => (),
    }
    image.request_color_encoding(desired);
    let render = image.render_frame(0)?;
    let mut stream = render.stream_no_alpha();
    println!(
        "{} {} {} {} {} {}",
        stream.width(),
        stream.height(),
        cicp[0],
        cicp[1],
        cicp[2],
        cicp[3]
    );
    let mut pixels = vec![0f32; stream.width() as usize * stream.height() as usize * 3];
    if stream.channels() != 3 || stream.write_to_buffer(&mut pixels) != pixels.len() {
        return Err("shape".into());
    }
    if hdr_linear {
        for pixel in pixels.chunks_exact_mut(3) {
            let mixed = [pixel[1] + pixel[0], pixel[1] - pixel[0], pixel[2]];
            let lms: [f64; 3] = std::array::from_fn(|i| {
                let v = f64::from(mixed[i]) - f64::from(bias[i]).cbrt();
                (v * v * v + f64::from(bias[i])) * 255.0 / f64::from(intensity)
            });
            for i in 0..3 {
                pixel[i] = (0..3).map(|j| f64::from(inv_mat[i][j]) * lms[j]).sum::<f64>() as f32;
            }
        }
    }
    let bytes: Vec<u8> = pixels.iter().flat_map(|v| v.to_le_bytes()).collect();
    std::fs::write(&args[2], bytes)?;
    Ok(())
}
