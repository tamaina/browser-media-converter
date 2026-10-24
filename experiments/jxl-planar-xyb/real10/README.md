# Optional genuine 10-bit SDR fixtures

Local evaluation material: **Copyright (C) Netflix Inc. 2015**, licensed under
[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/).
**Do not commit or redistribute frames or derivatives.** Only these scripts and
aggregate measurements belong in git; all media outputs stay in ignored
`../build/real10/` (diagnostics in `../build/diff-viz/`).

| Source / zero-based frame | Copyright notice |
| --- | --- |
| [Aerial f600](https://media.xiph.org/video/derf/Chimera/Netflix_Aerial_4096x2160_60fps_10bit_420.y4m) | [Areal (sic)](https://media.xiph.org/video/derf/Chimera/Netflix_Areal_Copyright.txt) |
| [PierSeaside f300](https://media.xiph.org/video/derf/Chimera/Netflix_PierSeaside_4096x2160_60fps_10bit_420.y4m) | [PierSeaside](https://media.xiph.org/video/derf/Chimera/Netflix_PierSeaside_Copyright.txt) |
| [Boat f150](https://media.xiph.org/video/derf/ElFuente/Netflix_Boat_4096x2160_60fps_10bit_420.y4m) | [Boat](https://media.xiph.org/video/derf/ElFuente/Netflix_Boat_Copyright.txt) |

The notices describe 4096×2160, 10-bit, YCbCr 4:2:0, BT.709, 59.94 fps.
The actual y4m header says F60:1. It has **no color tags**; ffprobe cannot recover
primaries, transfer, matrix or range from that header. We explicitly assume
BT.709 primaries/matrix/transfer, limited range and MPEG-2 **left** chroma siting.
This is a documented interpretation, not metadata discovered by ffprobe.

`python3 experiments/jxl-planar-xyb/real10/fetch.py` requires curl and ffmpeg with
zscale. Downloads are bounded ranges: 44-byte header and one 26,542,086-byte
frame per source (at most ~79.6 MB for these three). Valid existing extracts are
reused; exact size, full header and `FRAME\n` marker are verified. Frame n starts
at `44+n*26542086`. No full-file downloads. Conversions run serially with one
thread, no U8/RGB24 intermediate, zscale spline36 and no dithering.

For each scene, center-crop 3840×2160 at (128,0) then scale to 1280×720.
Boat also gets an unscaled center crop 2560×1440 at (768,360), 3,686,400 pixels,
within the API's 4,194,304 limit. `.bt709-left.yuv` retains the source color
interpretation; the native crop copies samples with no scale or color conversion.
All raw files are tightly packed little-endian I420P10 (low-bit-aligned U16).
Raw pixel format cannot be self-described: both source and API y4m intermediates
are independently probed for `yuv420p10le` before their raw payload is extracted;
source dimensions and raw byte counts are checked too. Color descriptions live
in `manifest.json`.

Round 7 directly accepts **BT.709 transfer and left chroma**. The manifest points
to `.bt709-left.yuv`; no second transfer/siting conversion is performed. The
720p resize explicitly sets `chromalin=left:chromal=left` and
`transferin=709:transfer=709` in zscale. The 1440p crop remains sample-exact.
`analyze.py` scans the source/API bytes with the same left interpolation;
the two OOR rates must match. Old ignored sRGB/center files are unused.
Clipping occurs after the matrix and before inverse BT.709 OETF. See WASM.md
for the difference from BT.1886 and Chrome's display treatment.

Run `node experiments/jxl-planar-xyb/wasm/browser-test.mjs --benchmark --real10`
(or `REAL10=1 ... --benchmark`). Without the flag no real10 input is used;
without the manifest/files the optional set is skipped with a notice. Missing
sets do not prevent default tests. All actual measurements use VideoFrame
I420P10, limited range, BT.709 matrix/primaries and BT.709 transfer with explicit left siting.
Precision checks use distance 0.01 and compare float reconstruction against
both fused and U8-quantized RGB, with 10-bit output headers for both. The fixed
top-center ROI is x=[w/3,2w/3), y=[0,h/5); it includes sky in Aerial/Pier but is
not asserted to be a smooth sky region in Boat. Display PNGs quantize to U8;
they cannot prove absence of subtle 10-bit banding. Use float error measurements.

The unscaled crop needs `setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709`
**before** crop/output tagging. Merely setting output tags on an untagged y4m
caused ffmpeg to alter sample values. The script now declares input color first;
`analyze.py` asserts sample equality against the original Y/U/V crop. This was a
fixture-preparation bug, not a fused conversion bug; final measurements use the
corrected crop. Scaled outputs already used explicit zscale input/output color.
