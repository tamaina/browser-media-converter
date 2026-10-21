import json
import sys
from pathlib import Path
import subprocess
import tempfile
from fixtures import fixture,ROOT
with tempfile.TemporaryDirectory() as d:
    base=Path(d);m,_=fixture(base,"I420P12",513,257,"pq")
    (base/"input.json").write_text(json.dumps(m))
    if "--compare" in sys.argv:
        from proof import load,encode,encode_rgb
        _,rgb=fixture(base,"I420P12",513,257,"pq")
        inp,keep=load(m,base)
        for _ in range(3):
            a,sa=encode(inp);b,sb=encode_rgb(inp,rgb)
            print(json.dumps(dict(planar=sa,rgb_reference=sb,identical=a==b)))
        raise SystemExit(0)
    for _ in range(3):
        r=subprocess.run(["/usr/bin/time","-f","wall_s=%e max_rss_kib=%M","python3",ROOT/"proof.py",base/"input.json",base/"image.jxl"],check=True,capture_output=True,text=True)
        print(r.stdout.strip(),r.stderr.strip())
