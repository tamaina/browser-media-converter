Synthetic 9×7 JPEGs generated with Pillow 12.1.1, no external image sources.
RGB samples: (x*23, y*31, (x+y)*13), quality 80, default 4:2:0 subsampling.
`baseline.jpg`: baseline RGB. `oriented.jpg`: same with EXIF orientation 6.
`progressive.jpg`: progressive RGB. `gray.jpg`: Pillow L conversion, baseline.
`xmp.jpg`: baseline with a synthetic standard APP1 XMP segment.

Additional synthetic fixtures (Pillow 12.1.1):
- `icc-srgb.jpg`: baseline decoded/re-saved at quality 90 with Pillow/LCMS's
  `ImageCms.createProfile('sRGB')` profile in ICC_PROFILE APP2 (1275 bytes).
- `large-444.jpg`: 160×128 RGB, Python `random.Random(14).randbytes(160*128*3)`,
  quality 88, subsampling 0 (4:4:4), 36296 bytes. Its JXL output exceeds the
  bridge's initial 4096-byte output buffer.
- `restart-422-tail.jpg`: baseline resized to 33×17, saved at quality 85, subsampling 1
  (4:2:2), `restart_marker_blocks=1`, followed by
  `b'BMC synthetic JPEG trailer\x00\xff\xd9'`. Covers DRI/RST and jbrd tail data.
- `cmyk.jpg`: baseline converted to CMYK and saved at quality 80; pins the
  coefficient parser's unsupported four-component error and recovery.
All are generated test data, with no external image sources.
- `icc-p3.jpg`: baseline re-saved at quality 90, with an LCMS2 RGB profile
  generated from D65 (0.3127, 0.3290), Display-P3 primaries
  (0.68, 0.32)/(0.265, 0.69)/(0.15, 0.06), parametric sRGB TRC
  (type 4: 2.4, 1/1.055, .055/1.055, 1/12.92, .04045).
