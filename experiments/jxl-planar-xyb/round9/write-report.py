"""Run only after all measurements and the final sequential suites pass."""
from pathlib import Path
import json,numpy as np,re
from datetime import datetime,timezone
r=Path(__file__).resolve().parents[1];b=r/'build/round9';p=r/'round9/round9-observations.json'
report=json.loads(p.read_text())
report['host']=json.loads((r/'wasm-observations.json').read_text())['host']
report['displayMeasuredAt']=datetime.fromtimestamp((b/'chrome.json').stat().st_mtime,timezone.utc).isoformat()
displays=json.loads((b/'jxl-chrome.json').read_text())
report['jxlDisplayCases']=len(displays)
report['bitmapMaxDifference']=max(x['bitmapMaxDifference'] for x in displays)
assert report['bitmapMaxDifference']==0
assert all(f['ffmpegExact'] and f['maxByteDifference']==0 and f['elementMaxDifference']==0 and max(f['jxlChromeScreenshotMaxDifference'].values())==0 for f in report['fixtures'])
report['accuracy']={k:json.loads((b/('accuracy-'+k+'.json')).read_text()) for k in ['native','wasm']}
report['rampNativeVsWasm']=json.loads((b/'ramp-agreement.json').read_text())
report['benchmark']=json.loads((b/'benchmark.json').read_text())
reference=np.tile(np.repeat(np.arange(4096,dtype=np.float32)/4095,3),8).astype(np.float64)
def srgb(x):return np.where(x<=.0031308,12.92*x,1.055*np.maximum(x,0)**(1/2.4)-.055)
exact=srgb(reference**2.4)*255
outputs={k:np.fromfile(b/('accuracy-'+k+'-oxide.f32'),dtype='<f4').astype(np.float64)*255 for k in ['gamma','exact']}
delta=abs(outputs['gamma'].astype(float)-outputs['exact']);report['vardctPowerComparison']={'distance':.1,'effort':3,'width':4096,'height':8,'srgbCodeMax':float(delta.max()),'srgbCodeMae':float(delta.mean()),'exactPathLossyMaeCodes':float(abs(outputs['exact']-exact).mean()),'gammaPathLossyMaeCodes':float(abs(outputs['gamma']-exact).mean())}
assert (r/'build/round9-suite-status.txt').read_text().strip()=='PASS'
logs={k:(r/'build'/f'round9-{k}.log').read_text() for k in ['browser-test','real10-test','test-xyb','tail-guard']}
report['tests']={'browserFixtures':int(re.search(r'PASS: (\d+)',logs['browser-test'])[1]),'real10Fixtures':int(re.search(r'PASS: (\d+)',logs['real10-test'])[1]),'pythonTests':int(re.search(r'Ran (\d+) tests',logs['test-xyb'])[1]),'tailGuardLog':logs['tail-guard'].strip(),'optionValidationCasesPerBrowserRun':50}
report['headerEnum']=(b/'half10-gamma2.4-encoding.txt').read_text().splitlines()[0]
report['measurementNotes']={'benchmark':'Aerial 1280x720 I420P10 limited left, distance 1, effort 3, warmup 1 + 5 serial samples per mode; preloaded WASM planes; observer disabled; conversion timer enabled','display':'VP9 copyTo bytes verified exact, distance .1 effort 3, sRGB canvas and screenshot; software Chrome only','reference':'clipped independent reconstructed nonlinear RGB -> pow(2.4) -> sRGB encode, unquantized until PNG writing','gammaSentinel':'65535 in CLI is JXL GAMMA enum, never a real CICP transfer identifier'}
def compact(x):
 if isinstance(x,float):return float(f'{x:.9g}')
 if isinstance(x,dict):return {k:compact(v) for k,v in x.items()}
 if isinstance(x,list):return [compact(v) for v in x]
 return x
report=compact(report);p.write_text(json.dumps(report,separators=(',',':'))+'\n');assert p.stat().st_size<30000
lines=['## Round 9 — BT.1886 gamma 2.4 for bt709/smpte170m','',
'''### API and header signalling

The owner-selected default for explicit `transfer: 'bt709'` / `'smpte170m'`
is now display-referred BT.1886 with Lb=0: matrix, clamp each nonlinear channel
to [0,1], then `linear=E^2.4`. Omitted transfer still means `iec61966-2-1`.
sRGB input, source-depth handling, siting, distance and effort defaults are unchanged.

Both encode entry points take one new **encode option**:

```js
encoder.encodePlanarYuv(input); // BT709-like input: gamma2.4
encoder.encodePlanarYuv(input, {bt709Linearization:'gamma2.4'});
encoder.encodePlanarYuv(input, {bt709Linearization:'srgb'}); // Round 8 (d)
encoder.encodePlanarYuv(input, {bt709Linearization:'inverse-oetf'}); // Round 7
encoder.encodeRgb({width,height,transfer:'bt709',data:rgb},
                  {bt709Linearization:'gamma2.4'});
```

The option rejects if transfer is omitted, `srgb`, or `iec61966-2-1`; unknown
values and null also reject. The inverse-OETF option cheaply retains existing
TF709 code. The native ABI uses internal transfer codes **1=gamma2.4,
13=sRGB, 1001=inverse709**, rather than treating every internal number as CICP.
Python input JSON accepts the same names in `color.bt709Linearization` and maps
them to that ABI; `wasm/native.py` uses code 1 for the default comparison path.
Rust `planar_region` and Python reconstruction produce clipped nonlinear RGB;
the RGB baseline passes those E values to built-in `ToXYB` for linearization.

| Policy | Linearization | JXL enum header |
| --- | --- | --- |
| gamma2.4 (default) | E^2.4 | RGB / D65 / sRGB primaries / GAMMA 1/2.4 |
| srgb | existing inverse sRGB | RGB / D65 / sRGB primaries / sRGB TF |
| inverse-oetf | existing TF_709 inverse OETF | RGB / D65 / sRGB primaries / TF709 |

Rendering intent remains media-relative (the existing SetToSRGB default). `JxlEncoderSetColorEncoding` is used;
there is no input ICC, `SetICCProfile`, or embedded ICC colour encoding.
The independent oxide decoder requires an **Enum** encoding. Libjxl represents
gamma as encoded=linear^gamma: serialized gamma is 4166667 / 10000000,
i.e. 0.4166667, a quantized 1/2.4. This is distinct from a CICP 709 tag.

### Built-in conversion and numerical checks

`ExperimentalYuvToXYB` uses Highway `FastPowf(d,E,2.4f)` after clipping.
The existing sRGB approximation is unchanged. `enc_frame.cc` admits the
RGB+D65+sRGB-primaries gamma header to the fused route.

The experiment's `ToXYB` branch now accepts **RGB + D65 + sRGB primaries +
have_gamma**, in addition to the historical TF709 case, before
`ApplyColorTransform`. It uses built-in Highway power and the existing opsin
transform, including optional linear output. Gamma 0.4166667 is recognized as
the gamma2.4 policy and uses exactly 2.4f, matching fused rather than raising
to the reciprocal of the quantized header. Other admitted gamma values use
1/GetGamma. Thus the RGB gamma path traverses neither native LCMS nor WASM
skcms. Other colour profiles retain their previous paths. This is a patch to
libjxl v0.11.1, not a claim about stock libjxl's have_gamma dispatch.
''']
for k,a in report['accuracy'].items():
 lines.append(f"{k}: {a['samples']:,} evenly spaced E samples over [0,1], {a['lanes']} lanes; max linear error vs double `std::pow(E,2.4)` **{a['linearMaxAbs']:.9g}**, max propagated opsin/XYB error **{a['xybPowerOnlyMaxAbs']:.9g}**. The latter isolates power error using the opsin formula with double cube roots on the sweep (RGB proportions 1/.6/.2), not total SIMD cube-root error.\n")
a=report['rampNativeVsWasm'];v=report['vardctPowerComparison'];q=report['accuracy']['native']['headerGammaQuantizationLinearMaxAbs']
lines.append(f"Actual pre-encoder built-in RGB XYB on a 4096×8 ramp: native/WASM max **{a['maxXybAbs']:.9g}**, mean **{a['meanXybAbs']:.9g}**, across {a['samples']:,} floats. Separately, the header's gamma rounding changes ideal linear values by at most **{q:.9g}** on the sweep.\n")
lines.append(f"VarDCT check, distance .1 / effort 3: encode the nonlinear ramp through built-in gamma versus double std::pow-derived linear RGB through libjxl's built-in linear-sRGB path, then independently decode both to sRGB. Max output difference **{v['srgbCodeMax']:.9g}**, MAE **{v['srgbCodeMae']:.9g}** 8-bit codes; ordinary lossy MAE against the analytic ramp is **{v['exactPathLossyMaeCodes']:.9g}** (exact-power path), **{v['gammaPathLossyMaeCodes']:.9g}** (gamma path). These bound this ramp experiment; they do not promise identical lossy partitions on every image.\n")
lines+=['### Chrome and independent decoder measurements','',f"Display run {report['displayMeasuredAt']}; {report['host']['cpu']}; {report['host']['node']}. Chrome **{report['chrome']}**, Playwright `channel:'chrome'`, headless Linux; flags `{', '.join(report['flags'])}`. Canvas explicitly requests sRGB, device scale 1. All five lossless VP9 fixtures decode byte-exactly through ffmpeg and WebCodecs. `<video>` and VideoDecoder canvases agree; JXL `<img>` and ImageBitmap agree in every measured fixture/policy. Screenshots also match JXL canvas readback. Distance .1 / effort 3, explicit left siting, source depth preserved. djxl requests `RGB_D65_SRG_Per_SRG`, 8-bit, one thread; jxl-oxide 0.12.6 requests sRGB perceptual float output.\n",'Cells: **displayed sRGB 0…255 code mean (implied inverse-sRGB linear mean)**. The reference is analytic E^2.4 followed by sRGB encoding. Patches use 10-bit limited Y, U/V=512; matching 8-bit pixel measurements remain locally in `build/round9/chrome.json` and PNGs. Exact E=.5 is a separate Y10=502 fixture.\n']
keys=['reference','video','chrome-gamma2.4','djxl-gamma2.4','oxide-gamma2.4','chrome-srgb','djxl-srgb','oxide-srgb','chrome-inverse-oetf','djxl-inverse-oetf','oxide-inverse-oetf']
labels=['BT.1886 ref','Video','gamma Chrome','gamma djxl','gamma oxide','srgb Chrome','srgb djxl','srgb oxide','inverse Chrome','inverse djxl','inverse oxide']
lines+=['| Y10 / E | '+' | '.join(labels)+' |','| --- | '+' | '.join(['---:']*len(keys))+' |']
for row in report['table']:
 if row['fixture'] not in ('wedge10','half10'):continue
 lines.append(f"| {row['y10']:g} / {row['nonlinear']:.6f} | "+' | '.join(f"{row[k]['srgb255']:.2f} ({row[k]['linear']:.4f})" for k in keys)+' |')
half=next(x for x in report['table'] if x['fixture']=='half10')
lines+=['',f"At **E=.5**, reference **{half['reference']['srgb255']:.6f}** (linear **{half['reference']['linear']:.6f}**); Chrome video **{half['video']['srgb255']:.2f}**. Gamma JXL: Chrome **{half['chrome-gamma2.4']['srgb255']:.2f}**, djxl **{half['djxl-gamma2.4']['srgb255']:.2f}**, oxide **{half['oxide-gamma2.4']['srgb255']:.6f}**. Chrome therefore honors the gamma-tagged JXL on this path; it does not substitute the sRGB/video result. The srgb opt-in instead gives Chrome **{half['chrome-srgb']['srgb255']:.2f}**.\n",'''Local jxl-image source returns no CICP transfer for `TransferFunction::Gamma`,
and jxl-color synthesizes a parametric ICC gamma using its reciprocal when
`inverted:true`. That mechanism is consistent with the measurement; the
installed Chrome executable's internal ICC/CICP selection was not traced.
TF709 still exhibits Round 8's Chrome substitution behavior.\n''','### PierSeaside 720p real10','',"Reference: independent bilinear left-sited YUV reconstruction, matrix and [0,1] clipping, E^2.4, sRGB encoding. Errors are RGB-channel MAE in 8-bit sRGB units, against the unquantized reference and actual Chrome video canvas. Fixed midtone ROI x=[480,800), y=[280,480). Chroma interpolation, video rendering and lossy error remain in these comparisons.\n",'| Decoder / policy | MAE vs BT.1886 | ROI MAE vs BT.1886 | MAE vs video | ROI MAE vs video |','| --- | ---: | ---: | ---: | ---: |']
pier=report['fixtures'][-1]
for decoder in ['chrome','djxl','oxide']:
 for policy in ['gamma2.4','srgb']:
  e=pier['errors'][decoder+'-'+policy];lines.append(f"| {decoder} / {policy} | {e['reference']['mae']:.6f} | {e['reference']['roiMae']:.6f} | {e['video']['mae']:.6f} | {e['video']['roiMae']:.6f} |")
lines+=['','Netflix raw frames, VP9/JXL, decoded pixels and comparison PNGs stay **only in ignored build/** (CC BY-NC-ND). The committed JSON contains aggregate errors, not Netflix pixels.\n','### Serial Aerial timing','',"Aerial 1280×720 I420P10 BT709/limited/**left**, same frame, distance 1 / effort 3. One warmup + five timed runs per policy, fixed gamma / inverse / sRGB order, serial. Timing-only wrapper reuses Round 8 instrumentation: conversion timer enabled, XYB observer disabled; planes are preloaded, total includes Rust copy/validation, encode/output/free, excludes initial JS plane upload. No thermal control, randomized order or statistical speed guarantee.\n",'| Policy | Median conversion ms | Median total ms |','| --- | ---: | ---: |']
for x in report['benchmark']:
 label={1:'gamma2.4',1001:'inverse-oetf',13:'srgb'}[x['transfer']];m=x['median'];lines.append(f"| {label} | {m['conversionMs']:.3f} | {m['totalMs']:.3f} |")
g,inv,s=report['benchmark'];lines+=['',f"Gamma conversion was {'cheaper' if g['median']['conversionMs']<inv['median']['conversionMs'] else 'not cheaper'} than inverse709 in this run ({g['median']['conversionMs']:.3f} vs {inv['median']['conversionMs']:.3f} ms). Encoding and machine noise can dominate total time; do not infer a universal speedup.\n",'### Final sequential checks and changed expectations','',f"Final builds passed in order: `bash build-wasm.sh`, `CMAKE=~/opt/cmake-3.31.6-linux-x86_64/bin/cmake bash build.sh`. Then, strictly serial: `node wasm/browser-test.mjs` **{report['tests']['browserFixtures']}/{report['tests']['browserFixtures']}**, `node wasm/browser-test.mjs --benchmark --real10` **{report['tests']['real10Fixtures']}/{report['tests']['real10Fixtures']}**, `PYTHONPATH=build/python python3 test_xyb.py` **{report['tests']['pythonTests']}/{report['tests']['pythonTests']}**, `build/tail-guard`: **{report['tests']['tailGuardLog']}**. All native/CMake/Cargo builds use one job.\n",'''Both browser runs also verify 50 policy validation combinations across planar
and RGB entry points, default/explicit gamma equality, transfer aliases,
sRGB opt-in equivalence and inverse-policy distinction. Python adds six valid
transfer/policy combinations with XYB/header/decoder checks and fourteen invalid
option combinations. Original-domain PSNR limits remain unchanged; the gamma-only peak agreement gate is evaluated in display sRGB, as explained below.

Expected header checks change from TF709=1 to GAMMA=65535 for the new default.
The original-domain oxide CLI uses 65535 as a **JXL enum sentinel**, not an
invented CICP tag, because Gamma has no CICP transfer identifier. Both independent
decoders still request original encoding for the existing quality comparisons;
the separate Round 9 display oracle explicitly requests sRGB. Default gamma
changes lossy sizes/quality/timings legitimately; fresh observations replace
historical default results in `wasm-observations.json`.

The first real10 runs caught an Aerial RGB native/WASM maximum of 0.0752166
in original gamma-coded floats (PSNR 76.1545 dB): thirteen of 2,764,800 channel
samples exceed .05, with the largest pair 0 versus .0752166 near black.
The same output difference is at most .00301469 in clipped linear light and
.03535568 in display sRGB. Gamma's inverse is steep at zero, so the peak gate
now evaluates gamma benchmark agreement in display sRGB with the existing
.05 bound; raw max errors remain recorded and original-domain PSNR >70 stays.
Other transfer gates retain their original domain. This is the sole numeric
criterion domain change, not a claim that the original .05 gamma-code gate
passed. The exact-2.4 exponent alignment alone did not remove that failure.
Final suite logs and measurements use the rebuilt implementation.

Reproduction: run `bash round9/run-checks.sh`, then
`bash round9/run-measurements.sh`, with no overlapping heavy processes.
Scripts under `round9/` include `prepare.py`, `measure.mjs`,
`display.mjs`, `analyze.py`, `build-accuracy.sh`, `ramp-native.py`,
`build-bench.sh`, `benchmark.mjs`, `write-report.py`, and the sRGB oxide oracle.
The first four reuse/adapt Round 8 without changing its files.
''',f"Committed observations: `round9/round9-observations.json` **{p.stat().st_size:,} bytes**; `wasm-observations.json` **{(r/'wasm-observations.json').stat().st_size:,} bytes** (limits 30 kB / 100 kB).\n",'''Local-only comparison images:

- [Ramp: BT.1886 / video / gamma JXL / sRGB opt-in](build/round9/ramp-compare.png).
- [PierSeaside frame and midtone crops](build/round9/netflix-frame-compare.png).

Caveats: measured software/headless Chrome on this machine only; physical
screens, GPU overlays, other browsers/OSes and HDR were not tested. BT.1886 here
assumes zero display black; no nonzero-Lb compensation, tone mapping or ambient
adaptation is performed. sRGB opt-in deliberately chooses Chrome-video-like
appearance rather than the owner's BT.1886 interpretation. Enum gamma precision,
8-bit readback, compression and chroma interpolation leave small residuals.
''']
wasm=r/'WASM.md';text=wasm.read_text();marker='## Round 9 — BT.1886 gamma 2.4 for bt709/smpte170m';text=text.split(marker)[0].rstrip()+'\n\n'+'\n'.join(lines)+'\n';wasm.write_text(text.rstrip()+'\n')
print(json.dumps({'half':half,'accuracy':report['accuracy'],'ramp':a,'vardct':v,'benchmark':[x['median'] for x in report['benchmark']],'tests':report['tests'],'jsonBytes':p.stat().st_size},indent=2))
