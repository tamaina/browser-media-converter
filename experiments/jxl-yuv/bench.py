"""Small synthetic measurement; fixture generation excluded from encode time/RSS."""
import json
from pathlib import Path
import subprocess
import tempfile
from test import fixture, ROOT

with tempfile.TemporaryDirectory() as d:
    base = Path(d)
    manifest, _ = fixture(base, "NV12", 1921, 1081)
    (base/"input.json").write_text(json.dumps(manifest))
    for _ in range(3):
        result = subprocess.run(["/usr/bin/time", "-f", "wall_s=%e max_rss_kib=%M",
             "python3", ROOT/"encode.py", base/"input.json", base/"output.jxl"],
             check=True, capture_output=True, text=True)
        print(result.stdout.strip(), result.stderr.strip())
