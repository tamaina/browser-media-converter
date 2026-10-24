// RFC 1950/1951, bounded synchronous inflater for PNG iCCP. No runtime dependencies.
export function inflateZlib(data: Uint8Array, limit = 4 * 1024 * 1024): Uint8Array {
  const bad = (): never => { throw new Error('Invalid PNG iCCP zlib stream'); };
  if (data.length < 6 || (data[0]! & 15) !== 8 || (data[0]! >>> 4) > 7 || ((data[0]! << 8) + data[1]!) % 31 || (data[1]! & 32)) bad();
  const end = data.length - 4;
  let pos = 2, bits = 0, count = 0;
  const read = (n: number): number => {
    while (count < n) { if (pos >= end) bad(); bits |= data[pos++]! << count; count += 8; }
    const v = bits & ((1 << n) - 1); bits >>>= n; count -= n; return v;
  };
  type Tree = { maps: Map<number, number>[]; max: number };
  const tree = (lengths: number[]): Tree => {
    const counts = new Array<number>(16).fill(0), next = counts.slice();
    for (const n of lengths) { if (n < 0 || n > 15) bad(); if (n) counts[n]!++; }
    let left = 1, code = 0, max = 0;
    for (let n = 1; n <= 15; n++) { left = left * 2 - counts[n]!; if (left < 0) bad(); code = (code + counts[n - 1]!) << 1; next[n] = code; if (counts[n]) max = n; }
    if (left && !(max === 1 && counts[1] === 1) && max !== 0) bad();
    const maps = Array.from({ length: 16 }, () => new Map<number, number>());
    lengths.forEach((n, symbol) => { if (n) maps[n]!.set(next[n]!++, symbol); });
    return { maps, max };
  };
  const symbol = (t: Tree): number => {
    let code = 0;
    for (let n = 1; n <= t.max; n++) { code = (code << 1) | read(1); const s = t.maps[n]!.get(code); if (s !== undefined) return s; }
    return bad();
  };
  let out = new Uint8Array(Math.min(limit, 4096)), size = 0;
  const reserve = (n: number) => {
    if (size + n > limit) throw new Error('PNG iCCP exceeds decompressed size limit');
    if (size + n > out.length) { const grown = new Uint8Array(Math.min(limit, Math.max(size + n, out.length * 2))); grown.set(out); out = grown; }
  };
  const lb = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const le = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const db = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const de = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  let last = 0;
  do {
    last = read(1); const kind = read(2);
    if (kind === 0) {
      bits = count = 0; const n = read(16); if ((n ^ read(16)) !== 65535) bad();
      reserve(n); for (let i = 0; i < n; i++) out[size++] = read(8);
      continue;
    }
    if (kind === 3) bad();
    let lit: Tree, dist: Tree;
    if (kind === 1) {
      lit = tree(Array.from({length:288}, (_, s) => s < 144 ? 8 : s < 256 ? 9 : s < 280 ? 7 : 8));
      dist = tree(new Array<number>(32).fill(5));
    } else {
      const nl = read(5) + 257, nd = read(5) + 1, nc = read(4) + 4;
      if (nl > 286 || nd > 32) bad();
      // RFC code-length alphabet order.
      const alphabet = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
      const cl = new Array<number>(19).fill(0);
      for (let i = 0; i < nc; i++) cl[alphabet[i]!] = read(3);
      const ct = tree(cl), lengths: number[] = [];
      while (lengths.length < nl + nd) {
        const s = symbol(ct);
        if (s < 16) lengths.push(s);
        else {
          if (s === 16 && !lengths.length) bad();
          const n = s === 16 ? read(2) + 3 : s === 17 ? read(3) + 3 : read(7) + 11;
          if (lengths.length + n > nl + nd) bad();
          const v = s === 16 ? lengths[lengths.length - 1]! : 0;
          for (let i = 0; i < n; i++) lengths.push(v);
        }
      }
      if (!lengths[256]) bad(); lit = tree(lengths.slice(0, nl)); dist = tree(lengths.slice(nl));
    }
    for (;;) {
      const s = symbol(lit); if (s === 256) break;
      if (s < 256) { reserve(1); out[size++] = s; continue; }
      if (s > 285) bad();
      const n = lb[s - 257]! + read(le[s - 257]!); const ds = symbol(dist);
      if (ds > 29) bad(); const d = db[ds]! + read(de[ds]!);
      if (d > size || d > (1 << ((data[0]! >>> 4) + 8))) bad();
      reserve(n); for (let i = 0; i < n; i++) { out[size] = out[size - d]!; size++; }
    }
  } while (!last);
  if (pos !== end) bad();
  let a = 1, b = 0;
  for (let i = 0; i < size; i++) { a = (a + out[i]!) % 65521; b = (b + a) % 65521; }
  const expected = new DataView(data.buffer, data.byteOffset + end, 4).getUint32(0);
  if (((b * 65536 + a) >>> 0) !== expected) bad();
  return out.slice(0, size);
}
