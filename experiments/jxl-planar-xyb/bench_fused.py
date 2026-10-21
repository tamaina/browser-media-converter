"""Same validated session, same AVX2 codec/settings, separate conversion timer.
No XYB capture; all three modes retain the identical XYB hash observer overhead.
The RGB reference begins with prepared samples, not an omitted YUV conversion.
"""
import ctypes as C
import json
import os
from pathlib import Path
import statistics
import tempfile
import time
from fixtures import fixture
from proof import ROOT,Encoded,Config,library,load,create

os.environ.pop("JXL_EXPERIMENT_CAPTURE_XYB",None)
lib=library()
for fmt,profile in [("I420","709-srgb"),("I420P12","709-srgb"),("I420P12","pq"),("I420P12","hlg")]:
    with tempfile.TemporaryDirectory(dir=ROOT/"build") as d:
        base=Path(d);manifest,rgb=fixture(base,fmt,513,257,profile)
        inp,keep=load(manifest,base)
        start=time.perf_counter();handle=create(lib,inp)
        preparation_ms=(time.perf_counter()-start)*1000
        floats=(C.c_float*len(rgb))(*rgb)
        config=Config(inp.width,inp.height,inp.primaries,inp.transfer,inp.intensity)
        results={mode:[] for mode in ("fused_auto","previous_row","prepared_rgb")}
        try:
            # One warmup per mode, then five balanced-order repetitions.
            for repeat in range(6):
                modes=list(results);modes=modes[repeat%3:]+modes[:repeat%3]
                for mode in modes:
                    os.environ.pop("JXL_EXPERIMENT_DISABLE_FUSED",None)
                    os.environ.pop("JXL_EXPERIMENT_OBSERVE_REFERENCE",None)
                    result=Encoded();error=C.create_string_buffer(512)
                    if mode=="previous_row": os.environ["JXL_EXPERIMENT_DISABLE_FUSED"]="1"
                    if mode=="prepared_rgb": os.environ["JXL_EXPERIMENT_OBSERVE_REFERENCE"]="1"
                    start=time.perf_counter()
                    if mode=="prepared_rgb":
                        status=lib.rgb_encode(C.byref(config),floats,len(floats),C.byref(result),error,len(error))
                    else: status=lib.planar_encode(handle,C.byref(result),error,len(error))
                    elapsed=(time.perf_counter()-start)*1000
                    try:
                        if status: raise RuntimeError(error.value.decode())
                        if repeat:
                            results[mode].append(dict(total_ms=elapsed,conversion_ms=result.conversion_ms,
                                size=result.size,simd_lanes=result.simd_lanes,rgb_scratch_bytes=result.peak_rgb_bytes))
                    finally: lib.planar_free(C.byref(result))
        finally:
            lib.planar_destroy(handle)
            os.environ.pop("JXL_EXPERIMENT_DISABLE_FUSED",None)
            os.environ.pop("JXL_EXPERIMENT_OBSERVE_REFERENCE",None)
        summary={mode:{key:statistics.median(row[key] for row in rows) for key in rows[0]} for mode,rows in results.items()}
        print(json.dumps(dict(format=fmt,profile=profile,width=513,height=257,
            session_copy_preflight_ms=preparation_ms,median=summary,samples=results)))
