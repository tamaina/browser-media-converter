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
    let cicp = image.rendered_cicp().map(|v| v.map(u32::from)).unwrap_or([1,65535,0,1]);
    let jxl_oxide::color::ColourEncoding::Enum(original) = &image.image_header().metadata.colour_encoding else { return Err("ICC unsupported".into()); };
    eprintln!("Original enum: {original:?}");
    image.request_color_encoding(jxl_oxide::EnumColourEncoding::srgb(jxl_oxide::RenderingIntent::Perceptual));
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
