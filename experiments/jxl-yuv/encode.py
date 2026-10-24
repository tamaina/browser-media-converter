"""Native prototype CLI: python3 encode.py manifest.json output.jxl."""
import ctypes as C
import json
from pathlib import Path
import sys
import time


class Plane(C.Structure):
    _fields_ = [("data", C.POINTER(C.c_uint8))] + [(k, C.c_size_t) for k in
                 ("size", "offset", "stride", "width", "height")]


class Input(C.Structure):
    _fields_ = [(k, C.c_uint32) for k in ("width", "height", "bit_depth", "format",
                "matrix", "primaries", "transfer", "full_range", "centered", "origin_x", "origin_y")] + [("planes", Plane * 3)]


class Result(C.Structure):
    _fields_ = [("data", C.POINTER(C.c_uint8))] + [(k, C.c_size_t) for k in
                 ("size", "callback_count", "peak_rgb_bytes", "max_rectangle_bytes")]


def library():
    lib = C.CDLL(str(Path(__file__).parent / "build/libyuv_jxl.so"))
    lib.encode_yuv.argtypes = [C.POINTER(Input), C.POINTER(Result), C.c_char_p, C.c_size_t]
    lib.encode_yuv.restype = C.c_int
    lib.free_result.argtypes = [C.POINTER(Result)]
    return lib


def integer(value, maximum=2**32-1):
    if type(value) is not int or not 0 <= value <= maximum:
        raise ValueError("expected unsigned integer within ABI range")
    return value


def load_manifest(manifest, base):
    allowed = {"width", "height", "bitDepth", "format", "color", "planes", "origin"}
    if set(manifest) - allowed:
        raise ValueError("unknown input fields (alpha, ICC and visibleRect unsupported)")
    color = manifest["color"]
    if set(color) != {"matrix", "primaries", "transfer", "fullRange", "chromaSiting"}:
        raise ValueError("explicit color fields required; ICC unsupported")
    if color["matrix"] != "bt709" or color["primaries"] != "bt709":
        raise ValueError("only bt709 matrix/primaries supported")
    transfer = {"srgb": 13, "bt709": 1}[color["transfer"]]
    if type(color["fullRange"]) is not bool or color["chromaSiting"] != "center":
        raise ValueError("explicit boolean range and centered chroma required")
    fmt = {"I420": 0, "I422": 1, "I444": 2, "NV12": 3}[manifest["format"]]
    origin = manifest.get("origin", {"x": 0, "y": 0})
    if set(origin) != {"x", "y"}:
        raise ValueError("origin requires x,y")
    inp = Input(integer(manifest["width"]), integer(manifest["height"]),
                integer(manifest["bitDepth"]), fmt, 1, 1, transfer,
                int(color["fullRange"]), 1, integer(origin["x"]), integer(origin["y"]))
    if len(manifest["planes"]) != (2 if fmt == 3 else 3):
        raise ValueError("incorrect plane count")
    keepalive = []
    for index, p in enumerate(manifest["planes"]):
        if set(p) != {"path", "offsetBytes", "strideBytes", "width", "height"}:
            raise ValueError("explicit plane layout required")
        raw = (base / p["path"]).read_bytes()
        buf = (C.c_uint8 * len(raw)).from_buffer_copy(raw)
        keepalive.append(buf)
        inp.planes[index] = Plane(buf, len(raw), *[integer(p[k], C.c_size_t(-1).value)
                 for k in ("offsetBytes", "strideBytes", "width", "height")])
    return inp, keepalive


def encode(inp):
    lib = library()
    result = Result()
    error = C.create_string_buffer(512)
    start = time.perf_counter()
    if lib.encode_yuv(C.byref(inp), C.byref(result), error, len(error)):
        raise ValueError(error.value.decode())
    try:
        data = C.string_at(result.data, result.size)
        stats = {k: getattr(result, k) for k, _ in result._fields_[1:]}
        stats["encode_ms"] = round((time.perf_counter() - start) * 1000, 3)
        return data, stats
    finally:
        lib.free_result(C.byref(result))


if __name__ == "__main__":
    try:
        manifest_path = Path(sys.argv[1])
        inp, keepalive = load_manifest(json.loads(manifest_path.read_text()), manifest_path.parent)
        data, stats = encode(inp)
        Path(sys.argv[2]).write_bytes(data)
        print(json.dumps(stats))
    except (ValueError, KeyError, OSError, IndexError) as e:
        sys.exit(f"rejected: {e}")
