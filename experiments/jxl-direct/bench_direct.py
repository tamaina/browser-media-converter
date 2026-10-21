"""Synthetic direct-path measurements; no comparison with XYB quality/speed."""
import json
from pathlib import Path
import subprocess
import tempfile
from test_direct import fixture, ROOT

with tempfile.TemporaryDirectory() as d:
    base=Path(d); m,_=fixture(base,"NV12",1921,1081)
    (base/"input.json").write_text(json.dumps(m))
    for _ in range(3):
        r=subprocess.run(["/usr/bin/time","-f","wall_s=%e max_rss_kib=%M","python3",
                          ROOT/"direct.py",base/"input.json",base/"image.jxl"],
                         check=True,capture_output=True,text=True)
        print(r.stdout.strip(),r.stderr.strip())
