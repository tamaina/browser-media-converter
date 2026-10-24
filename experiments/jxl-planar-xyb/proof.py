"""Native CLI: python3 proof.py input.json output.jxl. Explicit metadata only."""
import ctypes as C
import json
from pathlib import Path
import sys
import time
ROOT=Path(__file__).resolve().parent
class Plane(C.Structure):
    _fields_=[("data",C.POINTER(C.c_uint8))]+[(x,C.c_size_t) for x in ("size","offset","stride","width","height")]
class Input(C.Structure):
    _fields_=[(x,C.c_uint32) for x in ("width","height","format","depth","storage","matrix","primaries","transfer","full_range","siting","origin_x","origin_y")]+[("intensity",C.c_float),("planes",Plane*3)]
class Config(C.Structure):
    _fields_=[(x,C.c_uint32) for x in ("width","height","primaries","transfer")]+[("intensity",C.c_float),("depth",C.c_uint32)]
class Encoded(C.Structure):
    _fields_=[("data",C.POINTER(C.c_uint8))]+[(x,C.c_size_t) for x in ("size","callbacks","peak_rgb_bytes")]+[("xyb_hash",C.c_uint64),("xyb_data",C.POINTER(C.c_float)),("xyb_count",C.c_size_t),("conversion_ms",C.c_double),("simd_lanes",C.c_size_t)]
def library():
    lib=C.CDLL(str(ROOT/"build/target/release/libjxl_planar_xyb_proof.so"))
    lib.planar_create.argtypes=[C.POINTER(Input),C.POINTER(C.c_void_p),C.c_char_p,C.c_size_t]
    lib.planar_encode.argtypes=[C.c_void_p,C.POINTER(Encoded),C.c_char_p,C.c_size_t]
    lib.planar_region.argtypes=[C.c_void_p]+[C.c_size_t]*4+[C.POINTER(C.c_float),C.c_size_t]
    lib.planar_destroy.argtypes=[C.c_void_p]
    lib.planar_free.argtypes=[C.POINTER(Encoded)]
    lib.rgb_encode.argtypes=[C.POINTER(Config),C.POINTER(C.c_float),C.c_size_t,C.POINTER(Encoded),C.c_char_p,C.c_size_t]
    lib.planar_set_bit_depth.argtypes=[C.c_void_p,C.c_uint32]
    return lib
def integer(x,maximum=2**32-1):
    if type(x) is not int or not 0<=x<=maximum: raise ValueError("unsigned integer out of ABI range")
    return x
def load(m,base):
    if set(m)!={"width","height","format","bitDepth","storage","origin","color","planes"}: raise ValueError("explicit input fields required; ICC/alpha unsupported")
    c=m["color"]
    if set(c)-{"bt709Linearization"}!={"primaries","transfer","matrix","fullRange","chromaSiting","intensityTargetNits"}: raise ValueError("explicit complete color metadata required")
    if type(c["fullRange"]) is not bool or c["chromaSiting"] not in ("left","center","topleft"): raise ValueError("explicit boolean range and valid chroma siting required")
    policy=c.get('bt709Linearization','gamma2.4')
    if 'bt709Linearization' in c and (c['transfer'] not in ('bt709','smpte170m','bt2020-10','bt2020-12','bt470bg') or policy not in ('gamma2.4','srgb','inverse-oetf')): raise ValueError('invalid bt709Linearization')
    transfer=({'gamma2.4':1,'srgb':13,'inverse-oetf':1001}[policy] if c['transfer'] in ('bt709','smpte170m','bt2020-10','bt2020-12','bt470bg') else {'linear':8,'srgb':13,'iec61966-2-1':13,'pq':16,'hlg':18}[c['transfer']])
    formats={"NV12":(3,8)}
    for index,name in enumerate(("I420","I422","I444")):
        for depth in (8,10,12): formats[name+("" if depth==8 else f"P{depth}")]=(index,depth)
    fmt,depth=formats[m["format"]]
    if m["bitDepth"]!=depth or type(m["bitDepth"]) is not int: raise ValueError("format/depth mismatch")
    if set(m["origin"])!={"x","y"}: raise ValueError("explicit origin x/y required")
    if type(c["intensityTargetNits"]) not in (float,int): raise ValueError("numeric luminance target required")
    i=Input(integer(m["width"]),integer(m["height"]),fmt,depth,{"u8":0,"u16le-lsb":1}[m["storage"]],
            {"bt601":6,"bt709":1,"smpte170m":6,"bt470bg":6,"bt2020-ncl":9}[c["matrix"]],
            {"bt709":1,"bt470bg":5,"smpte170m":6,"smpte432":11,"bt2020":9}[c["primaries"]],
            transfer,int(c["fullRange"]),{"left":0,"center":1,"topleft":2}[c["chromaSiting"]],
            integer(m["origin"]["x"]),integer(m["origin"]["y"]),c["intensityTargetNits"])
    if len(m["planes"])!=(2 if fmt==3 else 3): raise ValueError("plane count")
    keep=[]
    for index,p in enumerate(m["planes"]):
        if set(p)!={"path","width","height","offsetBytes","strideBytes"}: raise ValueError("explicit plane layout required")
        data=(base/p["path"]).read_bytes(); buf=(C.c_uint8*len(data)).from_buffer_copy(data);keep.append(buf)
        i.planes[index]=Plane(buf,len(data),*[integer(p[k],C.c_size_t(-1).value) for k in ("offsetBytes","strideBytes","width","height")])
    return i,keep
def create(lib,inp):
    handle=C.c_void_p(); error=C.create_string_buffer(512)
    if lib.planar_create(C.byref(inp),C.byref(handle),error,len(error)): raise ValueError(error.value.decode())
    return handle
def finish(lib,result,start):
    try:
        return C.string_at(result.data,result.size),dict(size=result.size,callbacks=result.callbacks,peak_rgb_bytes=result.peak_rgb_bytes,conversion_ms=result.conversion_ms,simd_lanes=result.simd_lanes,xyb_hash=result.xyb_hash,xyb=list(result.xyb_data[:result.xyb_count]),encode_ms=round((time.perf_counter()-start)*1000,3))
    finally: lib.planar_free(C.byref(result))
def encode(inp):
    lib=library(); start=time.perf_counter(); handle=create(lib,inp)
    try:
        result=Encoded();error=C.create_string_buffer(512)
        if lib.planar_encode(handle,C.byref(result),error,len(error)): raise ValueError(error.value.decode())
        return finish(lib,result,start)
    finally: lib.planar_destroy(handle)
def encode_rgb(inp,rgb):
    lib=library(); cfg=Config(inp.width,inp.height,inp.primaries,inp.transfer,inp.intensity,inp.depth)
    data=(C.c_float*len(rgb))(*rgb);result=Encoded();error=C.create_string_buffer(512);start=time.perf_counter()
    if lib.rgb_encode(C.byref(cfg),data,len(data),C.byref(result),error,len(error)): raise ValueError(error.value.decode())
    return finish(lib,result,start)
if __name__=="__main__":
    try:
        path=Path(sys.argv[1]); inp,keep=load(json.loads(path.read_text()),path.parent)
        data,stats=encode(inp);Path(sys.argv[2]).write_bytes(data);print(json.dumps(stats))
    except (ValueError,KeyError,OSError,IndexError) as e: sys.exit(f"rejected: {e}")
