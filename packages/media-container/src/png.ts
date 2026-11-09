import { cicpColorSpaceFromNumbers } from './cicp.js';
import type { ImageColorMetadata } from './color-metadata.js';

/**
 * Upper bound for a decompressed PNG iCCP profile. Decompression stops and the
 * read rejects once the output passes this size (guards against zlib bombs).
 */
export const PNG_ICCP_MAX_PROFILE_BYTES = 16 * 1024 * 1024;

/**
 * Reads PNG colour chunks only; does not validate pixel data or chunk CRCs.
 * cICP takes precedence over iCCP; an overridden iCCP is not decompressed.
 * iCCP is decompressed with the standard `DecompressionStream('deflate')`
 * (zlib wrapper, Adler-32 checked), hence the Promise.
 * Malformed chunks or zlib data reject with an Error, like the other readers throw.
 */
export async function readPngColorMetadata(data: Uint8Array): Promise<ImageColorMetadata | null> {
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
  return { type: 'icc', profile: await inflateIccp(iccp.subarray(nul + 2)) };
}

async function inflateIccp(compressed: Uint8Array): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    const reader = new Blob([new Uint8Array(compressed)]).stream()
      .pipeThrough(new DecompressionStream('deflate')).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > PNG_ICCP_MAX_PROFILE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new RangeError(`PNG iCCP profile exceeds ${PNG_ICCP_MAX_PROFILE_BYTES} bytes`);
      }
      parts.push(value);
    }
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new Error('Invalid PNG iCCP zlib data', { cause: error });
  }
  const profile = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { profile.set(part, offset); offset += part.byteLength; }
  return profile;
}
