"""Write measured Round 8 chapter from the compact observations. No media in git."""
import json, math
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'build/round8';r=json.loads((root/'round8/round8-observations.json').read_text());bench=json.loads((out/'benchmark.json').read_text())
lin=lambda e:e/12.92 if e<=.04045 else ((e+.055)/1.055)**2.4
fmt=lambda v:f"{sum(v['rgb'])/3:.2f} ({v['linear']:.4f})"
ofmt=lambda v:f"{sum(v['srgb255'])/3:.2f} ({v['linear']:.4f})"
w8=[p for p in r['table'] if p['fixture']=='wedge8'];w10=[p for p in r['table'] if p['fixture']=='wedge10'];half=next(p for p in r['table'] if p['fixture']=='half10')
text='''\n\n## Round 8 — BT.709 transfer midtone check

### Measured verdict and display policy

**The inverse-709 brightness prediction is confirmed for strict color-managed
JXL decoding, but the predicted visible JXL/video mismatch is refuted inside
this installed Chrome's software rendering path.** Chrome decodes JXL by
default and displays a TF709 JXL approximately like its BT.709 video. Explicit
sRGB output from libjxl and jxl-oxide is substantially lighter. This distinction
was not established by Round 7's original-encoding float checks.

Recommendation: retain the existing normative transfer API. Offer a separately
named, explicit **video-display-match** policy when matching Chrome video is
the product goal: option **(d)** interprets reconstructed nonlinear RGB as sRGB,
linearizes with sRGB and signals sRGB. That makes independent color-managed
viewers agree with the intended Chrome video appearance. It deliberately changes
the source interpretation; it is not an inverse BT.709 OETF conversion. Option
**(c)**, retaining inverse709 while signaling sRGB, preserves the brighter linear
light and therefore does **not** solve display matching.

No committed API defaults, entry.cc, bridge.cc, api.mjs or libjxl patch changed.
`round8/display-match.mjs` is the opt-in wrapper: only this wrapper substitutes
`transfer:'srgb'` before calling the existing encoder. Its output is checked
byte-identical to the measured (d) Pier output. `build-header-variant.sh` generates
an ignored copy of bridge.cc changing only output color encoding to sRGB for
709 input, links the unchanged fused kernel and ABI into a separate
`build/round8/codec.mjs`, and leaves the regular module intact. Its fused YUV
transfer remains 709. These are experimental artifacts, not a proposed default.

### Machine, exact clips and display paths

'''
text+=f"Measured Chrome **{r['chrome']}**, Playwright `channel:'chrome'`, headless Linux;\nflags `{', '.join(r['flags'])}` (plus Playwright's launch defaults).\n"
text+='''Canvas contexts explicitly request `colorSpace:'srgb'`, device scale 1.
The physical display, GPU overlays, HDR and macOS paths were not measured.

`prepare.py` creates 17 neutral 32-pixel patches at Y8=16…235, U/V=128,
corresponding 10-bit Y=4×Y8, U/V=512, plus a separate exact E=0.5 frame at
Y10=502 (8-bit equivalent Y=125.5), and a horizontal ramp. The decoded source
for Pier is 1280×720 I420P10 BT.709/limited/left. All five fixtures are encoded
losslessly as VP9 IVF and tagged WebM, profile 0/2, one ffmpeg thread, one filter
thread and row-mt off. ffmpeg decoding and WebCodecs `copyTo` match the original
raw planes **byte-for-byte** in all five cases. IVF lacks transfer/primaries
container metadata; WebCodecs configuration supplies explicit BT.709 metadata.
WebM carries the tags for `<video>`. Every decoded frame actually reports
BT.709 matrix/primaries/transfer and limited range. H.264 and optional (e)
BT.1886 were not tested.

Important fixture trap: setting output color tags on untagged raw input caused
ffmpeg's automatic YUV→RGB→YUV matrix conversion, changing samples by one code
even with lossless VP9. Applying input `setparams` before encoding removes it;
the final clips all pass byte equality.

Both `VideoDecoder` frames and loaded `<video>` elements are drawn at native
size. Their complete canvases are pixel-identical for every fixture, not just
the patch centers. Page screenshots match video canvas readback exactly.
JXL `<img>` data URLs and `createImageBitmap(image/jxl)` both work with no
feature flag; flags JXL, JxlImageFormat, blink JXL and enable-jxl-image-format
were also tested. `<img>` and ImageBitmap outputs are pixel-identical; JXL
canvas screenshots also match exactly for all 15 fixture/variant combinations.
This is empirical behavior of this binary, not evidence that these flag names
all control the decoder.

All JXL inputs are the actual WebCodecs decoded planes, distance **0.1**, effort
**3**, source depth preserved, explicit left chroma siting. (709) and (d) use
the existing WASM API; (c) uses the separate header-override build. Native libjxl
**v0.11.1** `djxl` was built serially from build/libjxl and invoked with
`--color_space=RGB_D65_SRG_Per_SRG --bits_per_sample=8 --num_threads=1`.
jxl-oxide **0.12.6** / jxl-color **0.11.0** independently requests
`EnumColourEncoding::srgb(Perceptual)` and writes float samples. There is no
manual inverse709 conversion in the decoder analysis. PNG code values below
come from explicitly sRGB-converted djxl outputs; oxide values remain float.

### Patch measurements

Cells are **displayed sRGB code on a 0…255 scale (implied linear)**. For a
slightly nonneutral Chrome result the code is the RGB mean and linear is the
mean of independently inverse-sRGB-transformed channels. Full RGB triplets are
in `round8/round8-observations.json`. Video8/10 both cover WebCodecs and `<video>`.
Equivalent 8/10-bit JXL patch outputs agree in this table. Columns combining
709 and (c) have equal measurements, not an assumed equivalence.

| Y8 / Y10 | Nonlinear E | Video8 | Video10 | 709 Chrome | 709 = c djxl | 709 = c oxide | c Chrome | d Chrome | d djxl | d oxide |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
'''
for p,q in zip(w8,w10):
 for k in ['709','c','d','chrome-709','chrome-c','chrome-d']:
  assert p[k]==q[k],(p['y8'],k)
 for k in ['709','c','d']:assert p['oxide'][k]==q['oxide'][k]
 text+=f"| {p['y8']} / {int(p['y10'])} | {p['nonlinear']:.6f} | {fmt(p['video'])} | {fmt(q['video'])} | {fmt(p['chrome-709'])} | {fmt(p['709'])} | {ofmt(p['oxide']['709'])} | {fmt(p['chrome-c'])} | {fmt(p['chrome-d'])} | {fmt(p['d'])} | {ofmt(p['oxide']['d'])} |\n"
p=half
text+=f"| 125.5 equiv / 502 | **0.500000** | — | {fmt(p['video'])} | {fmt(p['chrome-709'])} | {fmt(p['709'])} | {ofmt(p['oxide']['709'])} | {fmt(p['chrome-c'])} | {fmt(p['chrome-d'])} | {fmt(p['d'])} | {ofmt(p['oxide']['d'])} |\n"
text+='''
At exact E=.5, analytic inverse709 is **0.259589**, inverse-sRGB **0.214041**.
Measured oxide sRGB floats imply **0.259647** for 709/(c) and **0.213941** for
(d), confirming the roughly **0.260 vs 0.214** prediction. Chrome video gives
127/255, implying **0.212231** after 8-bit quantization. Chrome 709-JXL is
RGB **127/128/127**, mean implied linear **0.213441**. djxl's 8-bit PNG is 139,
implying **0.258183**; the float result avoids that final byte quantization.

Thus strict output differs from video by **12 byte codes at E=.5**, reaching
about **15 codes** on these lower/middle steps: visibly different. In this
Chrome the direct 709-JXL path instead differs by at most a small byte-scale
rounding/tint on flat neutral patches. A decoder successfully loading a 709-JXL
is not sufficient evidence that it honors inverse709 when rendering to sRGB.
(c) and 709 have the same strict-decoder pixels, demonstrating that relabeling
already-linearized XYB does not remove the brighter midtone interpretation.

### Real 10-bit PierSeaside and local images

Errors below are RGB-channel means in **8-bit sRGB code units**, against the
actual Chrome VideoDecoder canvas. ROI is fixed x=[480,800), y=[280,480), a
central midtone building/pier crop; video ROI mean is **85.335245**. Positive
signed error means brighter. Chroma reconstruction, clipping, quantization and
lossy error remain in these full-image comparisons; residual error is not all
transfer mismatch and no perceptual ΔE was inferred from it.

| Decoder / policy | Signed mean | MAE | ROI signed mean | ROI MAE |
| --- | ---: | ---: | ---: | ---: |
'''
pier=next(f for f in r['fixtures'] if f['name']=='pier')
for k,label in [('chrome-709','Chrome / 709'),('709','djxl sRGB / 709'),('chrome-c','Chrome / c'),('c','djxl sRGB / c'),('chrome-d','Chrome / d'),('d','djxl sRGB / d')]:
 v=pier[k];text+=f"| {label} | {v['meanSignedRgbCodes']:.6f} | {v['maeRgbCodes']:.6f} | {v['roiSignedRgbCodes']:.6f} | {v['roiMaeRgbCodes']:.6f} |\n"
for k,label in [('709','oxide sRGB / 709'),('c','oxide sRGB / c'),('d','oxide sRGB / d')]:
 v=pier['oxideVsVideo'][k];text+=f"| {label} | {v['meanSignedRgbCodes']:.6f} | {v['maeRgbCodes']:.6f} | {v['roiSignedRgbCodes']:.6f} | {v['roiMaeRgbCodes']:.6f} |\n"
text+='''
The strict-decoder (d) MAE falls from **12.034169** to **1.859156** codes.
The same Chrome already displays 709 approximately like (d); (c) makes it
visibly brighter. Local PNGs, visually inspected:

- [Ramp comparison](build/round8/ramp-compare.png): rows video, 709, c, d;
  Chrome at left, explicit djxl-sRGB at right (video repeated as reference).
- [Netflix frame and midtone crops](build/round8/netflix-frame-compare.png):
  video, Chrome-709, djxl-709 and djxl-d columns.

Netflix media and all derivatives remain under ignored `build/`; none are
versioned or redistributed. Source/license restrictions remain those in
`real10/README.md`. Only scripts, prose and aggregate observations are added.

### Optional slowdown attribution

Aerial 720p uses the **same direct BT.709/left plane bytes** for all rows below;
only transfer interpretation, siting, or forced row fallback changes. Separate
benchmark module, serial Chrome, distance 1 / effort 3, one warmup + five runs
per configuration. It retains conversion timing but disables the XYB hash
observer, avoiding that diagnostic overhead. Total excludes JS plane marshaling
(the same WASM allocation is reused). These totals are not directly identical
to Round 6/7 JS-inclusive totals. Conversion is timed inside encoder patches;
encode includes that conversion plus the remaining encoder work.

| Transfer / siting / path | Conversion ms | Encode ms | Total ms | SIMD lanes | Bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
'''
for v in bench:
 m=v['median'];label=('709' if v['transfer']==1 else 'sRGB')+' / '+('left' if v['siting']==0 else 'center')+' / '+('forced row' if v['row'] else 'fused')
 text+=f"| {label} | {m['conversionMs']:.2f} | {m['encodeMs']:.2f} | {m['totalMs']:.2f} | {m['lanes']} | {m['bytes']} |\n"
text+='''
At left siting, 709 adds **2.3 ms conversion**, **1.8 ms encode** relative to
sRGB on the same planes. At center it adds **7.1 / 7.4 ms**. Left is faster
than center here, so left-siting interpolation does not explain the historical
slowdown. The regular path reports **4 SIMD lanes**; forced row reports **0**,
with identical 205109-byte size and much slower conversion (**104.1 ms**).
There is no evidence of accidental row fallback in Round 7.

The measured transfer-related cost is concentrated in conversion (709's pow
path versus sRGB), with relatively similar remaining encoder work. Changed
transfer/siting also changes XYB content and compressed sizes, so VarDCT
choices differ. Timing drift is material: the five 709/left conversions range
**37.6–43.7 ms**, and sRGB/center has a 56.2-ms first timed outlier. Consequently
these trials identify the transfer conversion as a contributor and rule out
fallback/left-siting as the cause, but **do not uniquely account for the entire
historical 74.2→83.9 ms delta**: Round 6 also used different preconverted planes.
No optimization was made, and no exact 10-ms attribution is claimed.

### Reproduction and checks

From the repository root, finish each command before starting the next:

```sh
export PYTHONPATH="$PWD/experiments/jxl-planar-xyb/build/python"
python3 experiments/jxl-planar-xyb/round8/prepare.py
bash experiments/jxl-planar-xyb/round8/build-header-variant.sh
node experiments/jxl-planar-xyb/round8/measure.mjs
# Build djxl serially using the existing native cache, with tools enabled.
CMAKE="$HOME/opt/cmake-3.31.6-linux-x86_64/bin/cmake"
"$CMAKE" -S experiments/jxl-planar-xyb/build/libjxl -B experiments/jxl-planar-xyb/build/native -DJPEGXL_ENABLE_TOOLS=ON
"$CMAKE" --build experiments/jxl-planar-xyb/build/native --target djxl --parallel 1
CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=/usr/bin/gcc CARGO_TARGET_DIR="$PWD/experiments/jxl-planar-xyb/build/round8/oxide-target" cargo build --manifest-path experiments/jxl-planar-xyb/round8/oxide/Cargo.toml --release --locked -j1
python3 experiments/jxl-planar-xyb/round8/analyze.py
node experiments/jxl-planar-xyb/round8/display.mjs
python3 experiments/jxl-planar-xyb/round8/analyze.py --reuse
bash experiments/jxl-planar-xyb/round8/build-bench.sh
node experiments/jxl-planar-xyb/round8/benchmark.mjs
python3 experiments/jxl-planar-xyb/round8/write-report.py
node experiments/jxl-planar-xyb/wasm/browser-test.mjs
```

`analyze.py --reuse` verifies independent decode timestamps against each JXL.
The initial analysis is permitted before Chrome JXL canvases exist; the final
analysis requires them for the comparative visuals. Raw full timing samples,
clips, screenshots, float decodes and PNGs stay under `build/round8/`.
`wasm-observations.json` remains unchanged at **66939 bytes**; the new compact
`round8/round8-observations.json` stays below **30 kB**. Final default browser
suite: **138/138 PASS** (see `build/round8/default-test.log`).
'''
p=root/'WASM.md';old=p.read_text();old=old.split('\n\n## Round 8 —')[0];p.write_text(old+text)
# Retain compact benchmark medians alongside the display observations.
r['benchmark']=[{k:v for k,v in x.items() if k!='samples'} for x in bench]
r['benchmark']=[{**x,'median':{k:round(v,4) for k,v in x['median'].items()}} for x in r['benchmark']]
(root/'round8/round8-observations.json').write_text(json.dumps(r,separators=(',',':'))+'\n')
assert (root/'round8/round8-observations.json').stat().st_size<30000
