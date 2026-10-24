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
    let mut desired=original.clone();
    match args.get(3).map(String::as_str) {
        Some("--linear-source") => desired.tf=jxl_oxide::color::TransferFunction::Linear,
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
    let bytes: Vec<u8> = pixels.iter().flat_map(|v| v.to_le_bytes()).collect();
    std::fs::write(&args[2], bytes)?;
    Ok(())
}
