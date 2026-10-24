"""CLI and ctypes harness for direct pixel-domain YCbCr inside patched libjxl."""
import ctypes as C
import copy
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "jxl-yuv"))
from encode import Input, load_manifest as load_plane_layout  # shared ABI/layout checks


class Result(C.Structure):
    _fields_ = [("data", C.POINTER(C.c_uint8)), ("size", C.c_size_t)]


def load_manifest(manifest, base):
    if manifest["color"]["matrix"] != "bt601" or manifest["color"]["transfer"] != "srgb" or manifest["color"]["fullRange"] is not True:
        raise ValueError("direct proof requires full-range bt601 matrix and sRGB transfer")
    # Reuse only the previous prototype's file-layout parser, not its converter.
    checked = copy.deepcopy(manifest)
    checked["color"]["matrix"] = "bt709"
    inp, keepalive = load_plane_layout(checked, base)
    inp.matrix = 6
    return inp, keepalive


def encode(inp):
    lib = C.CDLL(str(ROOT / "build/libdirect.so"))
    lib.direct_encode.argtypes = [C.POINTER(Input), C.POINTER(Result), C.c_char_p, C.c_size_t]
    lib.direct_encode.restype = C.c_int
    lib.direct_free.argtypes = [C.POINTER(Result)]
    result = Result()
    error = C.create_string_buffer(512)
    start = time.perf_counter()
    if lib.direct_encode(C.byref(inp), C.byref(result), error, len(error)):
        raise ValueError(error.value.decode())
    try:
        data = C.string_at(result.data, result.size)
        return data, {"size": result.size, "encode_ms": round((time.perf_counter()-start)*1000, 3)}
    finally:
        lib.direct_free(C.byref(result))


if __name__ == "__main__":
    try:
        path = Path(sys.argv[1])
        inp, keepalive = load_manifest(json.loads(path.read_text()), path.parent)
        data, stats = encode(inp)
        Path(sys.argv[2]).write_bytes(data)
        print(json.dumps(stats))
    except (ValueError, KeyError, OSError, IndexError) as e:
        sys.exit(f"rejected: {e}")
