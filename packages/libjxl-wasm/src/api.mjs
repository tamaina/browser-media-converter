import createModule from '../build/wasm/codec.mjs';

// One synchronous call at a time per instance. Returned arrays own their bytes.
export async function createEncoder(options = {}) {
  const m = await createModule(options);
  let stats = {};
  const fail = message => { throw new TypeError(message); };
  const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
  const videoTransfers = ['bt709','smpte170m','bt2020-10','bt2020-12','bt470bg'];
  // Read properties, not Object.entries: VideoColorSpace getters live on its prototype.
  function resolveColor(i, o, rgb) {
    const metadata = o.colorMetadata ?? i.colorMetadata;
    let mc = {};
    if (rgb && metadata?.type === 'cicp') {
      const c = metadata.cicp;
      if (!c || typeof c.fullRange !== 'boolean') fail('CICP fullRange must be boolean');
      const names = {
        primaries:{1:'bt709',5:'bt470bg',6:'smpte170m',9:'bt2020',12:'smpte432'},
        transfer:{1:'bt709',5:'gamma28',6:'smpte170m',8:'linear',13:'iec61966-2-1',14:'bt2020-10',15:'bt2020-12',16:'pq',18:'hlg'},
        matrix:{0:'rgb',1:'bt709',5:'bt470bg',6:'smpte170m',9:'bt2020-ncl'}
      };
      for (const key of ['primaries','transfer','matrix']) {
        mc[key] = typeof c[key] === 'number' ? names[key][c[key]] ?? `unknown-${c[key]}` : c[key];
        if (mc[key] == null) fail(`CICP ${key} required`);
      }
      mc.fullRange=c.fullRange;
    }
    const cs = o.colorSpace ?? i.colorSpace ?? {};
    if (typeof cs !== 'object') fail('colorSpace must be a VideoColorSpace or plain object');
    const colorResolved = {source:{}}, warnings = [];
    const defaults = {matrix:'bt709',primaries:'bt709',transfer:rgb?'iec61966-2-1':'bt709',fullRange:false,chromaSiting:'left'};
    for (const [key, fallback] of Object.entries(defaults)) {
      const value = o[key] ?? i[key] ?? cs[key] ?? mc[key];
      colorResolved[key] = value ?? fallback;
      colorResolved.source[key] = o[key] != null || i[key] != null ? 'option' : cs[key] != null ? 'colorSpace' : mc[key] != null ? 'colorMetadata' : 'default';
      if (value == null) warnings.push(`Defaulted ${key} to ${fallback}`);
    }
    const tf = colorResolved.transfer;
    // Match media-container's CICP name; the encoder has no gamma-2.8 path.
    if (tf === 'gamma28') fail('unsupported SDR transfer: gamma28 (CICP 5)');
    const hdr = ['pq','hlg','smpte2084','arib-std-b67'].includes(tf);
    if (hdr && (rgb || colorResolved.primaries !== 'bt2020' || colorResolved.matrix !== 'bt2020-ncl')) fail('HDR requires planar BT.2020 primaries and BT.2020 NCL matrix; encodeRgb HDR is unsupported');
    if (hdr && (['bt2020','p3'].includes(o.iccHeader) || o.iccFallback === 'srgb')) fail('HDR requires enum color encoding; SDR ICC header/fallback is unsupported');
    if (![...videoTransfers,'srgb','iec61966-2-1','linear','pq','hlg','smpte2084','arib-std-b67'].includes(tf)) fail('unsupported transfer');
    if (!['bt709','smpte170m','bt470bg','smpte432','bt2020'].includes(colorResolved.primaries)) fail('unsupported source primaries');
    if (!rgb && colorResolved.matrix === 'rgb') fail('rgb identity matrix is unsupported for YUV planes; use encodeRgb');
    if (!rgb && !['bt709','bt601','smpte170m','bt470bg','bt2020-ncl'].includes(colorResolved.matrix)) fail('unsupported YUV matrix');
    if (typeof colorResolved.fullRange !== 'boolean') fail('fullRange must be boolean');
    if (!['left','center','topleft'].includes(colorResolved.chromaSiting)) fail('chromaSiting must be left/center/topleft');
    if (o.bt709Linearization !== undefined && (!videoTransfers.includes(tf) || !['gamma2.4','srgb','inverse-oetf'].includes(o.bt709Linearization))) fail('bt709Linearization requires a BT-like transfer and gamma2.4/srgb/inverse-oetf');
    colorResolved.linearization = videoTransfers.includes(tf) ? o.bt709Linearization ?? 'gamma2.4' : hdr ? (['pq','smpte2084'].includes(tf) ? 'pq' : 'hlg') : tf === 'linear' ? 'linear' : 'srgb';
    colorResolved.source.linearization = o.bt709Linearization !== undefined ? 'option' : 'default';
    if (o.bt709Linearization === undefined) warnings.push(`Defaulted linearization to ${colorResolved.linearization} (from transfer)`);
    const intensity = o.intensityTargetNits ?? i.intensityTargetNits ?? (hdr ? (colorResolved.linearization === 'pq' ? 10000 : 1000) : 255);
    if (typeof intensity !== 'number' || !Number.isFinite(intensity) || intensity < 2**-24 || intensity > 65504) fail('intensityTargetNits must be positive finite and fit the JXL F16 header (2^-24..65504 nits)');
    colorResolved.intensityTarget = Math.fround(intensity);
    colorResolved.source.intensityTarget = o.intensityTargetNits != null || i.intensityTargetNits != null ? 'option' : 'default';
    colorResolved.policy = hdr ? 'hdr-as-is' : 'sdr-as-is';
    return {colorResolved,warnings};
  }
  function config(i, o, rgb) {
    if (!integer(i.width, 1, 8192) || !integer(i.height, 1, 8192) || i.width*i.height > 4194304) fail('dimension limit: 4 megapixels');
    for (const [k,v] of Object.entries(i)) {
      if (!rgb && ['bitDepth','depth'].includes(k) && ![8,10,12].includes(v)) fail('source depth must be 8/10/12');
      if (!rgb && k === 'storage' && !['u8','u16le-lsb'].includes(v)) fail('storage must be u8/u16le-lsb');
      if (['alpha','origin','color'].includes(k)) fail(`unsupported ${k}`);
    }
    if (i.alphaMode !== undefined && i.alphaMode !== 'straight') fail("alphaMode must be 'straight' (premultiplied alpha is unsupported)");
    if (rgb) {
      // Integer RGB is full-range U8/U16, never low-bit-depth codes in U16.
      const depth = i.data instanceof Uint16Array ? 16 : i.data instanceof Float32Array ? 32 : 8;
      const storage = depth === 32 ? 'float32' : depth === 16 ? 'u16le-lsb' : 'u8';
      if ((i.depth !== undefined && i.depth !== depth) || (i.bitDepth !== undefined && i.bitDepth !== depth) ||
          (i.storage !== undefined && i.storage !== storage)) fail(`RGB depth/storage mismatch: expected depth ${depth}, storage ${storage}`);
    }
    if (o.lossless !== undefined && typeof o.lossless !== 'boolean') fail('lossless must be boolean');
    if (o.distance !== undefined && (!Number.isFinite(o.distance) || o.distance < 0 || o.distance > 25)) fail('distance must be in [0,25]');
    if (o.lossless === true && o.distance > 0) fail('lossless: true conflicts with positive distance');
    const lossless = o.lossless === true || o.distance === 0;
    const distance = lossless ? 0 : o.distance ?? 1, effort = o.effort ?? 3;
    if (!integer(effort,1,10)) fail('effort must be an integer in 1..10');
    if (lossless && ['bt2020','p3'].includes(o.iccHeader)) fail('lossless requires the original profile; iccHeader override is unsupported');
    return {distance,effort,lossless};
  }
  function run(i,o,rgb) {
    const start=performance.now();
    if(o.iccHeader!==undefined && !['auto','exact','bt2020','p3'].includes(o.iccHeader))fail('iccHeader must be auto/exact/bt2020/p3');
    if (o.iccFallback !== undefined && !['error','srgb'].includes(o.iccFallback)) fail('iccFallback must be error/srgb');
    const metadata=o.colorMetadata ?? i.colorMetadata;
    if (metadata != null && !['icc','cicp'].includes(metadata.type)) fail('unsupported colorMetadata type');
    const declaredTransfer=o.transfer ?? i.transfer ?? (o.colorSpace ?? i.colorSpace)?.transfer ?? (metadata?.type==='cicp'?metadata.cicp?.transfer:undefined);
    if (rgb && ['pq','hlg','smpte2084','arib-std-b67',16,18].includes(declaredTransfer)) fail('encodeRgb HDR is unsupported; use planar BT.2020 NCL 10/12-bit input');
    const profile=o.icc ?? i.icc ?? (metadata?.type==='icc'?metadata.profile:undefined);
    if (!rgb && (profile != null || metadata != null)) fail('ICC/colorMetadata is supported only by encodeRgb');
    if (profile != null && [o.primaries,o.transfer,i.primaries,i.transfer].some(v=>v!=null)) fail('ICC conflicts with explicit primaries/transfer');
    let icc;
    if (profile != null) {
      if (!(profile instanceof Uint8Array) && !(profile instanceof ArrayBuffer)) fail('ICC: icc must be Uint8Array/ArrayBuffer');
      icc=profile instanceof ArrayBuffer?new Uint8Array(profile):profile;
      if(icc.length<132 || icc.length>4*1024*1024) fail('ICC: size must be 132 bytes..4 MiB');
    }
    const {distance,effort,lossless}=config(i,o,rgb);
    const {colorResolved,warnings}=resolveColor(icc?{width:i.width,height:i.height}:i,icc?{intensityTargetNits:o.intensityTargetNits ?? i.intensityTargetNits}:o,rgb);
    if(rgb) {
      Object.assign(colorResolved,{profile:icc?'icc':metadata?.type==='cicp'?'cicp':'none',path:'builtin',header:icc?'icc':'enum'});
      if(icc) {
        colorResolved.source.profile=o.icc!=null?'option':i.icc!=null?'input':'colorMetadata';
        colorResolved.iccClass=String.fromCharCode(...icc.subarray(12,16)).trim();
        const v=new DataView(icc.buffer,icc.byteOffset,icc.byteLength),n=v.getUint32(128);
        if(n<=(icc.length-132)/12)for(let k=0;k<n;k++) {
          const p=132+k*12,offset=v.getUint32(p+4),size=v.getUint32(p+8);
          if(v.getUint32(p)!==0x64657363 || offset>icc.length || size>icc.length-offset || size<12)continue;
          const type=v.getUint32(offset);
          if(type===0x64657363) {
            const length=v.getUint32(offset+8);
            if(length>0 && length<=size-12)colorResolved.iccDescription=new TextDecoder('latin1').decode(icc.subarray(offset+12,offset+12+Math.min(length-1,256)));
          } else if(type===0x6d6c7563 && size>=28 && v.getUint32(offset+8)>0 && v.getUint32(offset+12)===12) {
            const length=v.getUint32(offset+20),start=v.getUint32(offset+24);
            if(start<=size && length<=size-start)colorResolved.iccDescription=new TextDecoder('utf-16be').decode(icc.subarray(offset+start,offset+start+Math.min(length,512)));
          }
          break;
        }
        // Numeric defaults are not an interpretation of ICC pixels.
        for(const key of ['primaries','transfer','linearization','matrix','fullRange','chromaSiting']) {delete colorResolved[key];delete colorResolved.source[key];}
        warnings.length=0;
      } else if(metadata?.type==='cicp' && colorResolved.matrix!=='rgb') warnings.push('CICP matrix describes the pre-decoded source; ignored for already-decoded RGB');
    }
    for (const key of ['masteringDisplay','contentLightLevel']) if (o[key] !== undefined || i[key] !== undefined) warnings.push(`${key} is not stored (MDCV/CLLI unsupported)`);
    if (!rgb && o.validation !== 'strict') warnings.push('Reconstructed RGB outside [0,1] is clipped (validation: clip)');
    i={...i,...(icc?{primaries:"bt709",transfer:"iec61966-2-1",linearization:"srgb",matrix:"rgb",fullRange:true,chromaSiting:"left"}:colorResolved)};
    if(o.validation!==undefined && !["clip","strict"].includes(o.validation))fail("unknown validation");
    m._w_options(+(o.observe??false),+(o.validation==="strict"));
    const formats=['I420','I422','I444','NV12'];
    const match=/^(I420|I422|I444)(A)?(?:P(10|12))?$/.exec(i.format??'');
    const sourceDepth=rgb?(i.data instanceof Uint16Array?16:i.data instanceof Float32Array?32:8):(match?Number(match[3]??8):8);
    if(!rgb && ((i.depth!==undefined && i.depth!==sourceDepth) || (i.bitDepth!==undefined && i.bitDepth!==sourceDepth) || (i.storage!==undefined && i.storage!==(sourceDepth===8?'u8':'u16le-lsb'))))fail('format/depth/storage mismatch');
    if (!rgb && ['pq','hlg'].includes(i.linearization) && sourceDepth === 8) fail('HDR requires 10/12-bit source planes');
    // Lossless U8 retains its native precision; other RGB keeps float32.
    const defaultDepth=rgb?(lossless && sourceDepth===8?8:'float32'):'preserve';
    const bitDepth=o.bitDepth===undefined?defaultDepth:o.bitDepth;
    if(!['preserve','float32',8,10,12].includes(bitDepth))fail('bitDepth must be preserve/8/10/12/float32');
    const outputDepth=bitDepth==='float32'?0:bitDepth==='preserve'?(rgb?0:sourceDepth):bitDepth;
    if (['pq','hlg'].includes(i.linearization) && outputDepth === 8) fail('HDR output must be 10/12-bit or float32; 8-bit HDR is unsupported');
    const format=rgb ? 2 : formats.indexOf(match?match[1]:i.format);
    const matrix=rgb ? 1 : ({bt709:1,bt601:6,smpte170m:6,bt470bg:6,'bt2020-ncl':9})[i.matrix];
    if (format<0 || !matrix || (!rgb && typeof i.fullRange !== 'boolean')) fail('explicit supported format required');
    const pointers=[];
    const before=m.HEAPU8.buffer.byteLength;
    const alloc = bytes => {
      const p=m._malloc(bytes.byteLength); if (!p) throw Error('WASM allocation failed');
      pointers.push(p);m.HEAPU8.set(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),p);return p;
    };
    try {
      m._w_init(i.width,i.height,format,matrix,+i.fullRange,distance,effort,sourceDepth,outputDepth,({"gamma2.4":1,srgb:13,"inverse-oetf":1001,linear:8,pq:16,hlg:18})[i.linearization],({left:0,center:1,topleft:2})[i.chromaSiting],({bt709:1,smpte170m:6,bt470bg:5,smpte432:11,bt2020:9})[i.primaries],colorResolved.intensityTarget);
      let status;
      if (rgb) {
        const data=i.data;
        if(icc)m._w_icc(alloc(icc),icc.length);
        m._w_icc_header_mode(({auto:0,exact:1,bt2020:2,p3:3})[o.iccHeader??'auto']);
        if(data instanceof Uint8Array || data instanceof Uint8ClampedArray || data instanceof Uint16Array) {
          const channels=data.length/(i.width*i.height);
          if(![3,4].includes(channels)) fail('RGB integer input requires packed RGB or RGBA');
          if(i.format!=null && i.format!==(channels===3?'RGB':'RGBA'))fail('RGB format/channel mismatch');
          status=m._w_rgb_integer(alloc(data),data.length,data instanceof Uint16Array?16:8,channels);
        } else {
          if (!(data instanceof Float32Array) || ![3,4].includes(data.length/(i.width*i.height))) fail('RGB requires packed Float32Array or integer RGB/RGBA');
          const channels=data.length/(i.width*i.height);
          if(i.format!=null && i.format!==(channels===3?'RGB':'RGBA'))fail('RGB format/channel mismatch');
          status=channels===4?m._w_rgb_integer(alloc(data),data.length,32,4):m._w_rgb(alloc(data),data.length);
        }
        if(!status && icc)Object.assign(colorResolved,{header:m._w_icc_header()?'icc':'enum',path:m._w_icc_path()===2?'cms':'builtin',iccModel:m._w_icc_path()===3?'gray':m._w_icc_path()===1?'matrix-trc':'lut-or-other-trc',...(o.iccHeader && o.iccHeader!=='auto'?{iccHeader:o.iccHeader}:{})});
      } else {
        const expected=format===3?2:match?.[2]?4:3;
        if (!Array.isArray(i.planes) || i.planes.length !== expected) fail('plane count');
        let total=0;
        const layouts=[];
        // Validate every required index before allocating, including sparse holes.
        for (let c=0;c<expected;c++) {
          const p=i.planes[c];
          if (p === null || typeof p !== 'object') fail(`plane ${c} must be an object`);
          const w=c!==0&&c!==3?Math.ceil(i.width/(format===2?1:2)):i.width;
          const h=c!==0&&c!==3?Math.ceil(i.height/([0,3].includes(format)?2:1)):i.height;
          const row=w*(format===3&&c?2:1)*(sourceDepth===8?1:2);
          if (!(p.data instanceof Uint8Array) || !integer(p.offset??0,0,p.data.length) || !integer(p.stride,row,67108864)) fail('plane data/offset/stride');
          const span=(h-1)*p.stride+row;
          if ((p.offset??0)+span>p.data.length) fail('plane bounds');
          total+=span;if(total>67108864) fail('plane span cap: 64 MiB');
          layouts.push({p,span});
        }
        for (let c=0;c<expected;c++) {
          const {p,span}=layouts[c];
          m._w_plane(c,alloc(p.data.subarray(p.offset??0,(p.offset??0)+span)),span,0,p.stride);
        }
        status=m._w_encode(+(o.rgbViaPlanar??false));
      }
      if(status) throw Error(m.UTF8ToString(m._w_error()));
      const bytes=m.HEAPU8.slice(m._w_data(),m._w_data()+m._w_size());
      stats={colorResolved,warnings,sampleCheckMs:m._w_time(5),copyMs:m._w_time(0),preflightMs:m._w_time(1),createMs:m._w_time(2),conversionMs:m._w_time(3)+(rgb?0:m._w_time(6)),encodeMs:m._w_time(4),totalMs:performance.now()-start,observe:o.observe??false,heapBefore:before,heapAfter:m.HEAPU8.buffer.byteLength,simdLanes:m._w_lanes(),target:m.UTF8ToString(m._w_target())};
      Object.assign(bytes,{colorResolved,warnings});
      return bytes;
    } finally {m._w_free();for(const p of pointers)m._free(p);stats.totalMs=performance.now()-start;}
  }
  return {encodePlanarYuv:(i,o={})=>run(i,o,false),encodeRgb:(i,o={})=>{
    try{return run(i,o,true);}catch(error){
      if(o.iccFallback!=='srgb' || !error.message.startsWith('ICC:'))throw error;
      const clean=object=>{const {icc,colorMetadata,colorSpace,primaries,transfer,...rest}=object;return rest;};
      const bytes=run(clean(i),clean(o),true);
      bytes.warnings.push(`ICC fallback to untagged sRGB: ${error.message.slice(5)}`);
      return bytes;
    }
  },get stats(){return {...stats};}};
}
