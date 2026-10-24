import { cicpColorSpaceFromNumbers } from './cicp.js';
import type { ImageColorMetadata } from './color-metadata.js';
import { inflateZlib } from './inflate.js';

/** Reads colour chunks only; does not validate pixel data or chunk CRCs. */
export function readPngColorMetadata(data: Uint8Array): ImageColorMetadata | null {
  const signature = [137,80,78,71,13,10,26,10];
  if (data.length < 8 || signature.some((v, i) => data[i] !== v)) throw new Error('Invalid PNG signature');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let iccp: Uint8Array | undefined, cicp: ImageColorMetadata | undefined, ended = false;
  for (let p = 8; p < data.length;) {
    if (data.length - p < 12) throw new Error('Truncated PNG chunk');
    const n = view.getUint32(p);
    if (n > 0x7fffffff || n > data.length - p - 12) throw new Error('Invalid PNG chunk length');
    const type = String.fromCharCode(...data.subarray(p + 4, p + 8));
    const payload = data.subarray(p + 8, p + 8 + n);
    if (type === 'cICP') {
      if (n !== 4 || payload[2] !== 0 || payload[3]! > 1) throw new Error('Invalid PNG cICP (RGB matrix must be 0, range must be 0 or 1)');
      cicp = { type: 'cicp', cicp: cicpColorSpaceFromNumbers([payload[0]!, payload[1]!, payload[2]!, payload[3] === 1]) };
    }
    if (type === 'iCCP') iccp = payload;
    p += n + 12;
    if (type === 'IEND') { if (n) throw new Error('Invalid PNG IEND'); ended = true; break; }
  }
  if (!ended) throw new Error('Missing PNG IEND');
  // Do not inflate an overridden (possibly corrupt) profile.
  if (cicp) return cicp;
  if (!iccp) return null;
  const nul = iccp.indexOf(0);
  if (nul < 1 || nul > 79 || iccp[nul + 1] !== 0) throw new Error('Invalid PNG iCCP name/compression method');
  const name = iccp.subarray(0, nul);
  if (name[0] === 32 || name[nul - 1] === 32 || name.some((v, i) => v < 32 || (v > 126 && v < 161) || (v === 32 && name[i - 1] === 32))) throw new Error('Invalid PNG iCCP name');
  return { type: 'icc', profile: inflateZlib(iccp.subarray(nul + 2)) };
}
