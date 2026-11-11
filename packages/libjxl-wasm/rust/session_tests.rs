use super::*;

fn frame(w: u32, h: u32, format: u32, depth: u32, data: &[Vec<u8>; 3]) -> FrameInput {
    let sx = if format == 2 { 1 } else { 2 };
    let sy = if format == 0 || format == 3 { 2 } else { 1 };
    FrameInput {
        width:w, height:h, format, depth, storage:u32::from(depth > 8),
        matrix:1, primaries:1, transfer:13, full_range:1, siting:0,
        origin_x:0, origin_y:0, intensity:255.0,
        planes:std::array::from_fn(|c| {
            let width = if c == 0 { w } else { w.div_ceil(sx) } as usize;
            let height = if c == 0 { h } else { h.div_ceil(sy) } as usize;
            PlaneInput {data:data[c].as_ptr(), size:data[c].len(), offset:0,
                stride:width * depth.div_ceil(8) as usize * if format == 3 && c == 1 {2} else {1},
                width, height}
        }),
    }
}
fn copy(i: &FrameInput, mode: u32) -> Result<Session, String> {
    // All successful paths use backing allocations alive for this call.
    unsafe { Session::copy_from(i, mode, &mut [0.0; 3]) }
}
fn error(i: &FrameInput, expected: &str) {
    assert!(copy(i, 0).err().unwrap().contains(expected));
}
#[test]
fn plane_validation_rejects_invalid_layouts_before_reading() {
    let data = [vec![128; 12], vec![128; 4], vec![128; 4]];
    let valid = || frame(3, 3, 0, 8, &data);
    for c in 0..3 {
        let mut i = valid(); i.planes[c].data = std::ptr::null(); error(&i, "pointer/stride");
        let mut i = valid(); i.planes[c].width += 1; error(&i, "pointer/stride");
        let mut i = valid(); i.planes[c].height += 1; error(&i, "pointer/stride");
        let mut i = valid(); i.planes[c].stride = 0; error(&i, "pointer/stride");
        let mut i = valid(); i.planes[c].size = 1; error(&i, "plane bounds");
        let mut i = valid(); i.planes[c].offset = usize::MAX; error(&i, "plane offset");
    }
    let mut i = valid(); i.width = 8192; i.height = 8192; error(&i, "4 megapixels");
    let mut i = valid(); i.origin_x = 1; error(&i, "origin");
    let mut i = valid(); i.planes[0].stride = 40_000_000; i.planes[0].size = 80_000_003;
    error(&i, "64 MiB");
}
#[test]
fn nv12_odd_dimensions_deinterleave_owned_planes() {
    let mut data = [vec![128; 9], vec![10,20,30,40,50,60,70,80], vec![]];
    let i = frame(3, 3, 3, 8, &data);
    let s = copy(&i, 0).unwrap();
    data[1].fill(0); // Session owns its compact copy.
    assert_eq!(s.planes[1].bytes, [10,30,50,70]);
    assert_eq!(s.planes[2].bytes, [20,40,60,80]);
    assert_eq!(s.sample(2, 1, 1), 80);
    let mut i = frame(3, 3, 3, 8, &data); i.planes[2].size = 1; error(&i, "two planes");
    let i = frame(3, 3, 3, 10, &data); error(&i, "NV12");
}
#[test]
fn depth_storage_and_hdr_checks() {
    for depth in [10,12] {
        let max = (1u16 << depth) - 1;
        let data = std::array::from_fn(|_| max.to_le_bytes().to_vec());
        let i = frame(1, 1, 2, depth, &data);
        assert_eq!(copy(&i, 0).unwrap().sample(0, 0, 0), u32::from(max));
        let mut i = frame(1, 1, 2, depth, &data); i.storage = 0; error(&i, "storage");
        let bad = std::array::from_fn(|_| (max+1).to_le_bytes().to_vec());
        error(&frame(1,1,2,depth,&bad), "sample exceeds declared depth");
    }
    let data = std::array::from_fn(|_| vec![128]);
    let mut i = frame(1,1,2,8,&data); i.primaries=9; i.transfer=16; error(&i,"8-bit HDR");
}
#[test]
fn padded_offset_rows_pixel_region_and_strict_validation() {
    let data = [vec![99,16,235,99,16,235], vec![99,128,128,99,128,128], vec![99,128,128,99,128,128]];
    let mut i = frame(2,2,2,8,&data); i.full_range=0;
    for p in &mut i.planes {p.offset=1;p.stride=3;}
    let s = copy(&i,1).unwrap();
    assert_eq!(s.pixel(0,0).unwrap(), [0.0;3]);
    assert_eq!(s.pixel(1,1).unwrap(), [1.0;3]);
    let mut out = [0.0;6]; s.region(1,0,1,2,&mut out).unwrap(); assert_eq!(out,[1.0;6]);
    assert!(s.region(2,0,1,1,&mut [0.0;3]).is_err());
    assert!(s.region(0,0,1,1,&mut []).is_err());
    let data = [vec![0],vec![0],vec![255]];
    let i = frame(1,1,2,8,&data);
    assert!(copy(&i,1).err().unwrap().contains("strict mode"));
    assert!(copy(&i,0).unwrap().pixel(0,0).unwrap().iter().all(|v| (0.0..=1.0).contains(v)));
}
#[test]
fn i422_chroma_siting_interpolation_and_edges() {
    let data = [vec![128;8],vec![0,100,20,120],vec![128;4]];
    let mut i = frame(4,2,1,8,&data);
    let s = copy(&i,0).unwrap();
    assert_eq!(s.chroma(1,1,0),50.0);
    assert_eq!(s.chroma(1,3,1),120.0);
    i.siting=1;
    let centered = copy(&i,0).unwrap();
    assert_eq!(centered.chroma(1,0,0),0.0);
    assert_eq!(centered.chroma(1,1,0),25.0);
    i.format=0; i.planes[1].height=1; i.planes[2].height=1;
    let s = copy(&i,0).unwrap(); assert_eq!(s.chroma(1,3,1),100.0);
}
