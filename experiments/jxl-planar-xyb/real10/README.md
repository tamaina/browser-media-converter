# Optional genuine 10-bit SDR fixtures

Local evaluation material: **Copyright (C) Netflix Inc. 2015**, licensed under
[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/).
**Do not commit or redistribute frames or derivatives.** All media stays in the
ignored `../build/real10/`.

| Source / zero-based frame | Copyright notice |
| --- | --- |
| [Aerial f600](https://media.xiph.org/video/derf/Chimera/Netflix_Aerial_4096x2160_60fps_10bit_420.y4m) | [Areal (sic)](https://media.xiph.org/video/derf/Chimera/Netflix_Areal_Copyright.txt) |
| [PierSeaside f300](https://media.xiph.org/video/derf/Chimera/Netflix_PierSeaside_4096x2160_60fps_10bit_420.y4m) | [PierSeaside](https://media.xiph.org/video/derf/Chimera/Netflix_PierSeaside_Copyright.txt) |
| [Boat f150](https://media.xiph.org/video/derf/ElFuente/Netflix_Boat_4096x2160_60fps_10bit_420.y4m) | [Boat](https://media.xiph.org/video/derf/ElFuente/Netflix_Boat_Copyright.txt) |

The y4m headers carry **no colour tags**. We assume BT.709 primaries, matrix and
transfer, limited range, and MPEG-2 **left** chroma siting.

`python3 real10/fetch.py` needs curl and ffmpeg built with zscale. It downloads
only bounded byte ranges: the 44-byte header plus one 26,542,086-byte frame per
source. It then center-crops 3840×2160 and scales to 1280×720 with zscale
spline36, keeping left siting and BT.709 transfer. Boat also gets an unscaled
2560×1440 crop. The output is tightly packed I420P10 described by
`manifest.json`.

`python3 real10/analyze.py` writes `source-analysis.json`. It checks that the
1440p crop is sample-exact and that source and API out-of-range rates match.

To benchmark, run `node wasm/browser-test.mjs --benchmark --real10`. Without the
files, the set is skipped with a notice.
