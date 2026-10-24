import ctypes as C
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from direct import Input, ROOT, encode, load_manifest

DECODER = ROOT / "build/stock-decode"  # unmodified system libjxl
ORACLE = Path(os.environ.get("JXL_ORACLE", ROOT / "build/oracle/debug/jxl-yuv-decode-oracle"))


def fixture(base, fmt, w, h, pattern="pattern"):
    cw = w if fmt == "I444" else (w+1)//2
    ch = (h+1)//2 if fmt in ("I420", "NV12") else h
    yy = [[112 + (x*3+y*7)%25 for x in range(w)] for y in range(h)]
    def chroma(x, y, swap):
        if pattern == "neutral": return 128
        if pattern == "impulse": return 160 if (x, y) == (cw//2, ch//2) else 128
        if pattern == "edges": return (96 if ((x+y+swap)%2) else 160)
        return 112 + (x*11+y*7+swap*13)%33
    uu = [[chroma(x, y, 0) for x in range(cw)] for y in range(ch)]
    vv = [[chroma(x, y, 1) for x in range(cw)] for y in range(ch)]
    raw_planes = [yy, uu, vv]
    if fmt == "NV12":
        raw_planes = [yy, [[v for pair in zip(u, v) for v in pair] for u, v in zip(uu, vv)]]
    planes = []
    for index, rows in enumerate(raw_planes):
        width_bytes = len(rows[0]); stride = width_bytes+7; offset = 5
        buf = bytearray([241]*(offset+(len(rows)-1)*stride+width_bytes))
        for y, row in enumerate(rows): buf[offset+y*stride:offset+y*stride+width_bytes] = bytes(row)
        name = f"plane{index}.bin"; (base/name).write_bytes(buf)
        planes.append(dict(path=name, width=w if index == 0 else cw,
                           height=len(rows), offsetBytes=offset, strideBytes=stride))
    manifest = dict(width=w, height=h, format=fmt, bitDepth=8, planes=planes,
                    color=dict(matrix="bt601", primaries="bt709", transfer="srgb",
                               fullRange=True, chromaSiting="center"))
    # Analytic centered chroma reconstruction (sample centers at 0.5, 2.5,...)
    # and independent JFIF inverse matrix. No encoder implementation is reused.
    def sample(plane, x, y):
        cx, cy = (x if fmt == "I444" else x//2), (y//2 if fmt in ("I420", "NV12") else y)
        nx = cx if fmt == "I444" else max(0, min(cw-1, cx + (1 if x%2 else -1)))
        ny = cy if fmt not in ("I420", "NV12") else max(0, min(ch-1, cy + (1 if y%2 else -1)))
        wx = 1 if fmt == "I444" else .75
        wy = 1 if fmt not in ("I420", "NV12") else .75
        return wy*(wx*plane[cy][cx]+(1-wx)*plane[cy][nx]) + (1-wy)*(wx*plane[ny][cx]+(1-wx)*plane[ny][nx])
    rgb = bytearray()
    for y in range(h):
        for x in range(w):
            cb, cr = sample(uu, x, y)-128, sample(vv, x, y)-128
            red = yy[y][x] + 2*(1-.299)*cr
            blue = yy[y][x] + 2*(1-.114)*cb
            green = (yy[y][x]-.299*red-.114*blue)/.587
            rgb.extend(int(max(0, min(255, v))+.5) for v in (red, green, blue))
    return manifest, bytes(rgb)


class DirectTests(unittest.TestCase):
    observed_errors = []

    @classmethod
    def tearDownClass(cls):
        print(f"verified_images={len(cls.observed_errors)//2} max_rgb8_error={max(cls.observed_errors,default=0)}")

    def verify(self, base, manifest, expected):
        inp, buffers = load_manifest(manifest, base)
        data, stats = encode(inp)
        (base/"image.jxl").write_bytes(data)
        native = subprocess.check_output([DECODER, base/"image.jxl", base/"native.rgb"], text=True)
        meta = subprocess.check_output([ORACLE, base/"image.jxl", base/"rust.rgb"], text=True)
        shifts = {"I420":"[0, 1, 0]", "NV12":"[0, 1, 0]", "I422":"[0, 2, 0]", "I444":"[0, 0, 0]"}
        self.assertIn("encoding=Modular ycbcr=true", meta)
        self.assertIn("jpeg_upsampling="+shifts[manifest["format"]], meta)
        fw=manifest["width"]+(manifest["format"]!="I444" and manifest["width"]%2)
        fh=manifest["height"]+(manifest["format"] in ("I420","NV12") and manifest["height"]%2)
        self.assertIn(f"frame={fw}x{fh}",meta)
        self.assertIn(f'{manifest["width"]} {manifest["height"]} primaries=1 transfer=13 white=1', native)
        for name in ("native.rgb", "rust.rgb"):
            decoded = (base/name).read_bytes()
            self.assertEqual(len(decoded), len(expected))
            error = max(abs(a-b) for a, b in zip(decoded, expected))
            self.observed_errors.append(error)
            self.assertLessEqual(error, 1, (manifest["format"], name, error))
        self.assertLessEqual(max(abs(a-b) for a,b in zip((base/"native.rgb").read_bytes(), (base/"rust.rgb").read_bytes())), 1)
        return stats, meta.strip()

    def test_colors_chroma_and_headers(self):
        for fmt in ("I420", "I422", "I444", "NV12"):
            for dims in ((1,1), (17,9), (18,10), (257,259)):
                for pattern in ("pattern", "neutral", "impulse", "edges"):
                    with self.subTest(fmt=fmt, dims=dims, pattern=pattern), tempfile.TemporaryDirectory() as d:
                        base = Path(d); manifest, expected = fixture(base, fmt, *dims, pattern)
                        self.verify(base, manifest, expected)

    def test_native_rejections(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d); m,_ = fixture(base,"I420",17,9)
            good, buffers = load_manifest(m,base)
            def reject(change):
                inp=Input.from_buffer_copy(good); change(inp)
                with self.assertRaises(ValueError): encode(inp)
            for field,value in (("width",0),("width",2**32-1),("height",16384),
                                ("bit_depth",10),("bit_depth",12),("format",4),("matrix",1),
                                ("matrix",9),("primaries",12),("transfer",1),("transfer",16),
                                ("full_range",0),("centered",0),("origin_x",1),("origin_y",2)):
                reject(lambda x: setattr(x,field,value))
            for index in range(3):
                for field,value in (("size",1),("offset",2**64-1),("stride",0),
                                    ("stride",2**64-1),("width",1),("height",1)):
                    reject(lambda x: setattr(x.planes[index],field,value))
                reject(lambda x: setattr(x.planes[index],"data",C.POINTER(C.c_uint8)()))
            reject(lambda x: setattr(x.planes[2],"size",x.planes[2].size-1))
            reject(lambda x: (setattr(x,"width",16384),setattr(x,"height",16384)))
            nv,_ = fixture(base,"NV12",17,9); inp,buffers=load_manifest(nv,base)
            inp.planes[2].size=1
            with self.assertRaises(ValueError): encode(inp)

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d); m,_=fixture(base,"NV12",17,9)
            (base/"input.json").write_text(json.dumps(m))
            subprocess.run(["python3", ROOT/"direct.py",base/"input.json",base/"cli.jxl"],check=True,capture_output=True)
            self.assertGreater((base/"cli.jxl").stat().st_size,0)

    def test_api_contract_and_copy(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d)
            subprocess.run([ROOT/"build/api-contract",base/"copied.jxl"],check=True,capture_output=True)
            for decoder in (DECODER, ORACLE):
                subprocess.run([decoder,base/"copied.jxl",base/"copied.rgb"],check=True,capture_output=True)
                self.assertEqual((base/"copied.rgb").read_bytes(), bytes([128,128,128]))

    def test_full_range_neutral_extremes(self):
        for value in (0,16,128,235,255):
            with tempfile.TemporaryDirectory() as d:
                base=Path(d); m,_=fixture(base,"I444",1,1,"neutral")
                data=bytearray((base/"plane0.bin").read_bytes());data[5]=value
                (base/"plane0.bin").write_bytes(data)
                self.verify(base,m,bytes([value,value,value]))


if __name__ == "__main__": unittest.main(verbosity=2)
