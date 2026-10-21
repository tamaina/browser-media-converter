fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 3 { return Err("usage: oracle input.jxl output.rgb".into()); }
    let image = jxl_oxide::JxlImage::builder().open(&args[1])?;
    let frame = image.frame_header(0).ok_or("missing frame")?;
    println!("encoding={:?} ycbcr={} jpeg_upsampling={:?} frame={}x{}", frame.encoding, frame.do_ycbcr, frame.jpeg_upsampling, frame.width, frame.height);
    let render = image.render_frame(0)?;
    let mut stream = render.stream_no_alpha();
    let mut pixels = vec![0u8; stream.width() as usize * stream.height() as usize * 3];
    if stream.channels() != 3 || stream.write_to_buffer(&mut pixels) != pixels.len() {
        return Err("unexpected decoded image shape".into());
    }
    std::fs::write(&args[2], pixels)?;
    Ok(())
}
