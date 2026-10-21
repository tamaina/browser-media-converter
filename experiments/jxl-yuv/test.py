"""Fixtures, independent matrix oracle, separate-process decoding, negative ABI tests."""
import copy
import ctypes as C
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from encode import Input, Plane, Result, encode, library, load_manifest

ROOT = Path(__file__).parent


def fixture(base, fmt="I420", w=17, h=9, full=False, transfer="bt709"):
    cw = w if fmt == "I444" else (w + 1)//2
    ch = (h + 1)//2 if fmt in ("I420", "NV12") else h
    # Asymmetric U/V edge pattern exposes swaps and horizontal/vertical misalignment.
    y = [[16 + (x*7 + j*13) % 220 for x in range(w)] for j in range(h)]
    u = [[80 + (x*29 + j*11) % 97 for x in range(cw)] for j in range(ch)]
    v = [[92 + (x*13 + j*23) % 73 for x in range(cw)] for j in range(ch)]
    arrays = [y, u, v]
    if fmt == "NV12":
        arrays = [y, [[c for pair in zip(ur, vr) for c in pair] for ur, vr in zip(u, v)]]
    planes = []
    for i, rows in enumerate(arrays):
        row_bytes = len(rows[0]); stride = row_bytes + 7; offset = 5
        # No trailing stride padding on the final row: exercise exact last-byte bounds.
        raw = bytearray([237] * (offset + (len(rows)-1)*stride + row_bytes))
        for j, row in enumerate(rows):
            raw[offset+j*stride:offset+j*stride+row_bytes] = bytes(row)
        path = f"plane{i}.bin"
        (base/path).write_bytes(raw)
        planes.append(dict(path=path, offsetBytes=offset, strideBytes=stride,
                           width=w if i == 0 else cw, height=len(rows)))
    manifest = dict(width=w, height=h, format=fmt, bitDepth=8, planes=planes,
                    color=dict(matrix="bt709", primaries="bt709", transfer=transfer,
                               fullRange=full, chromaSiting="center"))
    # Reference derives G from Y = Kr*R + Kg*G + Kb*B (not wrapper coefficients).
    expected = bytearray()
    for j in range(h):
        for x in range(w):
            cx = x if fmt == "I444" else x//2
            cy = j//2 if fmt in ("I420", "NV12") else j
            yy = y[j][x]/255 if full else (y[j][x]-16)/219
            cb = (u[cy][cx]-128)/(255 if full else 224)
            cr = (v[cy][cx]-128)/(255 if full else 224)
            red = yy + 2*(1-.2126)*cr
            blue = yy + 2*(1-.0722)*cb
            green = (yy - .2126*red - .0722*blue)/.7152
            expected.extend(int(max(0, min(1, c))*255 + .5) for c in (red, green, blue))
    return manifest, bytes(expected)


class PrototypeTests(unittest.TestCase):
    def test_decode_matrix_and_metadata(self):
        for fmt in ("I420", "I422", "I444", "NV12"):
            for dims in ((1, 1), (17, 9), (18, 10)):
                for full in (False, True):
                    for transfer in ("bt709", "srgb"):
                        with self.subTest(fmt=fmt, dims=dims, full=full, transfer=transfer), tempfile.TemporaryDirectory() as d:
                            base = Path(d)
                            m, expected = fixture(base, fmt, *dims, full, transfer)
                            inp, buffers = load_manifest(m, base)
                            data, stats = encode(inp)
                            (base/"image.jxl").write_bytes(data)
                            meta = subprocess.check_output([ROOT/"build/decode", base/"image.jxl", base/"decoded.rgb"], text=True)
                            self.assertEqual((base/"decoded.rgb").read_bytes(), expected)
                            if os.environ.get("JXL_ORACLE"):
                                subprocess.run([os.environ["JXL_ORACLE"], base/"image.jxl", base/"oracle.rgb"], check=True, capture_output=True)
                                self.assertEqual((base/"oracle.rgb").read_bytes(), expected)
                            self.assertIn(f"{dims[0]} {dims[1]} primaries=1 transfer={1 if transfer == 'bt709' else 13} white=1", meta)
                            self.assertGreater(stats["callback_count"], 0)

    def test_native_rejections(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d); m, _ = fixture(base)
            original, buffers = load_manifest(m, base)
            def reject(change):
                inp = Input.from_buffer_copy(original)
                change(inp)
                with self.assertRaises(ValueError): encode(inp)
            for field, value in (("width", 0), ("width", 16385), ("height", 16384),
                    ("bit_depth", 10), ("bit_depth", 12), ("format", 4), ("matrix", 9),
                    ("primaries", 12), ("transfer", 16), ("transfer", 18),
                    ("full_range", 2), ("centered", 0), ("origin_x", 1), ("origin_y", 2)):
                with self.subTest(field=field, value=value): reject(lambda x: setattr(x, field, value))
            for index in range(3):
                for field, value in (("size", 1), ("offset", 2**64-1), ("stride", 0),
                                     ("stride", 2**64-1), ("width", 1), ("height", 1)):
                    with self.subTest(plane=index, field=field):
                        reject(lambda x: setattr(x.planes[index], field, value))
                reject(lambda x: setattr(x.planes[index], "data", C.POINTER(C.c_uint8)()))
            # Last required byte missing, not merely a grossly short plane.
            reject(lambda x: setattr(x.planes[2], "size", x.planes[2].size-1))

    def test_manifest_rejections_and_cli(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d); m, _ = fixture(base, "NV12")
            for change in (lambda x: x.update(width=-1), lambda x: x.update(width=2**32),
                    lambda x: x.update(bitDepth=True), lambda x: x.update(alphaMode="none"),
                    lambda x: x["color"].update(icc="x"), lambda x: x["color"].update(fullRange=1),
                    lambda x: x["color"].update(chromaSiting="left"),
                    lambda x: x["color"].update(transfer="pq"),
                    lambda x: x["color"].pop("matrix"), lambda x: x["planes"].pop()):
                bad = copy.deepcopy(m); change(bad)
                with self.assertRaises((ValueError, KeyError)): load_manifest(bad, base)
            (base/"input.json").write_text(json.dumps(m))
            subprocess.run(["python3", ROOT/"encode.py", base/"input.json", base/"cli.jxl"], check=True, capture_output=True)
            self.assertGreater((base/"cli.jxl").stat().st_size, 0)

    def test_rectangle_boundary(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d); m, expected = fixture(base, "NV12", 2051, 33)
            inp, buffers = load_manifest(m, base)
            data, stats = encode(inp)
            (base/"image.jxl").write_bytes(data)
            subprocess.run([ROOT/"build/decode", base/"image.jxl", base/"decoded.rgb"], check=True, capture_output=True)
            self.assertEqual((base/"decoded.rgb").read_bytes(), expected)
            if os.environ.get("JXL_ORACLE"):
                subprocess.run([os.environ["JXL_ORACLE"], base/"image.jxl", base/"oracle.rgb"], check=True, capture_output=True)
                self.assertEqual((base/"oracle.rgb").read_bytes(), expected)
            print("rectangle-boundary", json.dumps(stats))


if __name__ == "__main__":
    unittest.main(verbosity=2)
