// Experimental browser-facing descriptor; no production import or Wasm encoder yet.
export function describeProofFormat(format) {
  if (format === 'NV12') return { depth: 8, storage: 'u8', sx: 2, sy: 2, count: 2 };
  const match = /^(I420|I422|I444)(?:P(10|12))?$/.exec(format ?? '');
  if (!match) throw new Error(`Unsupported proof format ${format}`);
  return { depth: Number(match[2] ?? 8), storage: match[2] ? 'u16le-lsb' : 'u8',
    sx: match[1] === 'I444' ? 1 : 2, sy: match[1] === 'I420' ? 2 : 1, count: 3 };
}
function integer(value) { if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid integer'); return value; }
export async function captureWholePlanarFrame(frame, { chromaSiting, intensityTargetNits } = {}) {
  const format = frame.format;
  const description = describeProofFormat(format);
  if (chromaSiting !== 'center') throw new Error('Caller must provide verified centered chroma siting');
  const rect = frame.visibleRect ?? { x: 0, y: 0, width: frame.codedWidth, height: frame.codedHeight };
  for (const key of ['x', 'y', 'width', 'height']) integer(rect[key]);
  if (rect.x || rect.y || !rect.width || !rect.height) throw new Error('Proof supports origin (0,0) only');
  if (rect.width > 8192 || rect.height > 8192 || rect.width * rect.height > 4194304) throw new Error('Proof dimension cap');
  const { primaries, transfer, matrix, fullRange } = frame.colorSpace;
  if (typeof fullRange !== 'boolean') throw new Error('Explicit fullRange required');
  const hdr = transfer === 'pq' || transfer === 'hlg';
  const supported = (primaries === 'bt709' && ['bt709', 'iec61966-2-1'].includes(transfer)
      && ['bt709', 'smpte170m', 'bt470bg'].includes(matrix))
    || (primaries === 'smpte432' && transfer === 'iec61966-2-1' && ['bt709', 'smpte170m', 'bt470bg'].includes(matrix))
    || (primaries === 'bt2020' && hdr && matrix === 'bt2020-ncl' && description.depth >= 10);
  const target = transfer === 'pq' ? 10000 : transfer === 'hlg' ? 1000 : 255;
  if (!supported || intensityTargetNits !== target) throw new Error('Unsupported/unknown color contract or intensity target');
  // This proof deliberately captures a whole planar frame. It is not streaming.
  const size = integer(frame.allocationSize({ rect }));
  if (!size || size > 64 * 1024 * 1024) throw new Error('Allocation cap');
  const data = new Uint8Array(size);
  const layout = await frame.copyTo(data, { rect }); // retain native YUV; no RGB/Canvas conversion
  if (layout.length !== description.count) throw new Error('Plane count mismatch');
  const planes = layout.map((plane, index) => {
    const width = index ? Math.ceil(rect.width / description.sx) : rect.width;
    const height = index ? Math.ceil(rect.height / description.sy) : rect.height;
    const rowBytes = width * (description.depth === 8 ? 1 : 2) * (format === 'NV12' && index ? 2 : 1);
    const offsetBytes = integer(plane.offset), strideBytes = integer(plane.stride);
    if (strideBytes < rowBytes || offsetBytes + (height - 1) * strideBytes + rowBytes > data.byteLength) throw new Error('Plane layout bounds');
    return { data, width, height, offsetBytes, strideBytes };
  });
  return { width: rect.width, height: rect.height, format, bitDepth: description.depth,
    storage: description.storage, origin: { x: 0, y: 0 },
    color: { primaries, transfer, matrix, fullRange, chromaSiting, intensityTargetNits }, planes };
}
