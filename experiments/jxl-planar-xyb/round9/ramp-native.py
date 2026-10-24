"""Same nonlinear ramp as measure.mjs; compare actual built-in RGB XYB."""
from pathlib import Path
import sys,os,numpy as np,json
r=Path(__file__).resolve().parents[1];sys.path.insert(0,str(r));import proof
os.environ['JXL_EXPERIMENT_CAPTURE_XYB']='1';os.environ['JXL_EXPERIMENT_OBSERVE_REFERENCE']='1'
rgb=np.tile(np.repeat(np.arange(4096,dtype=np.float32)/4095,3),8)
i=proof.Input(width=4096,height=8,primaries=1,transfer=1,intensity=255,depth=0)
encoded,s=proof.encode_rgb(i,rgb)
(r/'build/round9/ramp-native.jxl').write_bytes(encoded)
a=np.array(s['xyb'],dtype=np.float32);a.tofile(r/'build/round9/ramp-native.xyb')
b=np.fromfile(r/'build/round9/ramp-wasm.xyb',dtype='<f4');delta=abs(a-b)
print(json.dumps({'samples':len(a),'maxXybAbs':float(delta.max()),'meanXybAbs':float(delta.mean())}))
