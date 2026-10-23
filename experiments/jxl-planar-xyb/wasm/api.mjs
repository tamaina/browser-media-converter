import createModule from '../build/wasm/codec.mjs';

// One synchronous call at a time per instance. Returned arrays own their bytes.
export async function createEncoder(options = {}) {
  const m = await createModule(options);
  let stats = {};
  const fail = message => { throw new TypeError(message); };
  const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
  function config(i, o) {
    if (!integer(i.width, 1, 8192) || !integer(i.height, 1, 8192) || i.width*i.height > 4194304) fail('dimension limit: 4 megapixels');
    for (const [k,v] of Object.entries(i)) {
      if (['bitDepth','depth'].includes(k) && ![8,10,12].includes(v)) fail('source depth must be 8/10/12');
      if (k === 'storage' && !['u8','u16le-lsb'].includes(v)) fail('storage must be u8/u16le-lsb');
      if (k === 'primaries' && v !== 'bt709') fail('primaries must be bt709');
      if (k === 'transfer' && !['srgb','iec61966-2-1','bt709','smpte170m'].includes(v)) fail('unsupported SDR transfer');
      if (k === 'chromaSiting' && !['left','center','topleft'].includes(v)) fail('chromaSiting must be left/center/topleft');
      if (['alpha','icc','origin','color','colorSpace'].includes(k)) fail(`unsupported ${k}`);
    }
    const distance = o.distance ?? 1, effort = o.effort ?? 3;
    if (!Number.isFinite(distance) || distance <= 0 || distance > 25 || !integer(effort,1,3)) fail('distance must be (0,25], effort must be 1..3');
    return {distance,effort};
  }
  function run(i,o,rgb) {
    const start=performance.now();
    const {distance,effort}=config(i,o);
    if(o.validation!==undefined && !["clip","strict"].includes(o.validation))fail("unknown validation");
    m._w_options(+(o.observe??false),+(o.validation==="strict"));
    const formats=['I420','I422','I444','NV12'];
    const match=/^(I420|I422|I444)(?:P(10|12))?$/.exec(i.format??'');
    const sourceDepth=rgb?(i.depth??i.bitDepth??8):(match?Number(match[2]??8):8);
    if(!rgb && ((i.depth!==undefined && i.depth!==sourceDepth) || (i.bitDepth!==undefined && i.bitDepth!==sourceDepth) || (i.storage!==undefined && i.storage!==(sourceDepth===8?'u8':'u16le-lsb'))))fail('format/depth/storage mismatch');
    const bitDepth=o.bitDepth===undefined?(rgb?'float32':'preserve'):o.bitDepth;
    if(!['preserve','float32',8,10,12].includes(bitDepth))fail('bitDepth must be preserve/8/10/12/float32');
    const outputDepth=bitDepth==='float32'?0:bitDepth==='preserve'?(rgb?0:sourceDepth):bitDepth;
    const format=rgb ? 2 : formats.indexOf(match?match[1]:i.format);
    const matrix=rgb ? 1 : ({bt709:1,bt601:6,smpte170m:6,bt470bg:6})[i.matrix];
    if (format<0 || !matrix || (!rgb && typeof i.fullRange !== 'boolean')) fail('explicit format, bt601/bt709 matrix and boolean fullRange required');
    const pointers=[];
    const before=m.HEAPU8.buffer.byteLength;
    const alloc = bytes => {
      const p=m._malloc(bytes.byteLength); if (!p) throw Error('WASM allocation failed');
      pointers.push(p);m.HEAPU8.set(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),p);return p;
    };
    try {
      m._w_init(i.width,i.height,format,matrix,+!!i.fullRange,distance,effort,sourceDepth,outputDepth,({srgb:13,'iec61966-2-1':13,bt709:1,smpte170m:1})[i.transfer??'iec61966-2-1'],({left:0,center:1,topleft:2})[i.chromaSiting??'left']);
      let status;
      if (rgb) {
        if (!(i.data instanceof Float32Array) || i.data.length !== i.width*i.height*3) fail('RGB requires packed Float32Array');
        status=m._w_rgb(alloc(i.data),i.data.length);
      } else {
        if (!Array.isArray(i.planes) || i.planes.length !== (format===3?2:3)) fail('plane count');
        let total=0;
        const layouts=i.planes.map((p,c)=> {
          const w=c?Math.ceil(i.width/(format===2?1:2)):i.width;
          const h=c?Math.ceil(i.height/([0,3].includes(format)?2:1)):i.height;
          const row=w*(format===3&&c?2:1)*(sourceDepth===8?1:2);
          if (!(p.data instanceof Uint8Array) || !integer(p.offset??0,0,p.data.length) || !integer(p.stride,row,67108864)) fail('plane data/offset/stride');
          const span=(h-1)*p.stride+row;
          if ((p.offset??0)+span>p.data.length) fail('plane bounds');
          total+=span;if(total>67108864) fail('plane span cap: 64 MiB');
          return {p,span};
        });
        layouts.forEach(({p,span},c)=>m._w_plane(c,alloc(p.data.subarray(p.offset??0,(p.offset??0)+span)),span,0,p.stride));
        status=m._w_encode(+(o.rgbViaPlanar??false));
      }
      if(status) throw Error(m.UTF8ToString(m._w_error()));
      const bytes=m.HEAPU8.slice(m._w_data(),m._w_data()+m._w_size());
      stats={sampleCheckMs:m._w_time(5),copyMs:m._w_time(0),preflightMs:m._w_time(1),createMs:m._w_time(2),conversionMs:m._w_time(3),encodeMs:m._w_time(4),totalMs:performance.now()-start,observe:o.observe??false,heapBefore:before,heapAfter:m.HEAPU8.buffer.byteLength,simdLanes:m._w_lanes(),target:m.UTF8ToString(m._w_target())};
      return bytes;
    } finally {m._w_free();for(const p of pointers)m._free(p);stats.totalMs=performance.now()-start;}
  }
  return {encodePlanarYuv:(i,o={})=>run(i,o,false),encodeRgb:(i,o={})=>run(i,o,true),get stats(){return {...stats};}};
}
