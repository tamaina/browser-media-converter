// Included in cms::tests to share the synthetic ICC fixtures.
#[test]
fn callback_borrows_disjoint_rows_and_reuses_overlap_scratch_for_all_ops() {
    let matrix = Arc::new(inspect(&p3_matrix_profile()).unwrap().matrix.unwrap());
    let ops = vec![
        Op::Matrix(matrix.clone(), false),
        Op::Matrix(matrix, true),
        Op::Lut(moxcms_lut(&hdr_lut_profile(1.0)).unwrap()),
        Op::Enum { tf: Tf::Srgb, m: None, gray: true, ootf: None },
        Op::Enum { tf: Tf::Hlg, m: None, gray: true, ootf: Some((1.2, [0.0; 3])) },
        Op::Enum { tf: Tf::Srgb, m: Some([1.1, -0.1, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]), gray: false, ootf: None },
        Op::Enum { tf: Tf::Hlg, m: Some([1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]), gray: false, ootf: Some((1.2, [0.2126, 0.7152, 0.0722])) },
    ];
    for op in ops {
        let channels = match &op { Op::Matrix(_, true) | Op::Enum { gray: true, .. } => 1, _ => 3 };
        let n = 17;
        let len = n * channels;
        let row: Vec<f32> = (0..len).map(|k| (k as f32 + 0.5) / len as f32).collect();
        let mut expected = vec![0.0; len];
        assert_eq!(convert(&op, &row, &mut expected), 1);
        let mut session = Session {
            op,
            src: vec![vec![0.0; len]; 2], dst: vec![vec![0.0; len]; 2],
            scratch: (0..2).map(|_| std::cell::UnsafeCell::new(Vec::new())).collect(),
        };
        let data = &mut session as *mut Session as *mut c_void;
        unsafe {
            let src = get_src(data, 1);
            let dst = get_dst(data, 1);
            std::ptr::copy_nonoverlapping(row.as_ptr(), src, len);
            assert_eq!(run(data, 1, src, dst, n), 1);
            assert_eq!(std::slice::from_raw_parts(dst, len), expected);
            // Aliasing the session source alone does not allocate scratch.
            assert_eq!((*session.scratch[1].get()).capacity(), 0);
            let mut external = vec![0.0; len];
            assert_eq!(run(data, 1, row.as_ptr(), external.as_mut_ptr(), n), 1);
            assert_eq!(external, expected);
            assert_eq!((*session.scratch[1].get()).capacity(), 0);
            // Exact in-place, then both directions of partial overlap.
            let mut scratch_ptr = std::ptr::null();
            for (iteration, (from, to)) in [(0, 0), (0, 1), (1, 0), (0, 0)].into_iter().enumerate() {
                let mut buffer = vec![0.0; len + 1];
                buffer[from..from + len].copy_from_slice(&row);
                assert_eq!(run(data, 1, buffer.as_ptr().add(from), buffer.as_mut_ptr().add(to), n), 1);
                assert_eq!(&buffer[to..to + len], expected);
                let scratch = &*session.scratch[1].get();
                if iteration == 0 { scratch_ptr = scratch.as_ptr(); }
                else { assert_eq!(scratch.as_ptr(), scratch_ptr); }
            }
            // The callback may also be asked to overwrite its own source.
            assert_eq!(run(data, 1, src, src, n), 1);
            assert_eq!(std::slice::from_raw_parts(src, len), expected);
            assert_eq!((*session.scratch[0].get()).capacity(), 0);
        }
    }
}
