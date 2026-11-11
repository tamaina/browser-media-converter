// Synthetic RGB matrix/TRC ICC: D50-adapted sRGB colorants, gamma 2.2 TRCs.
// Deliberately inconsistent PQ/HLG CICP tags exercise unsupported HDR ICC input.
export function iccFixture(transfer?: 16 | 18): Uint8Array {
  const u32 = (n: number) => [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255];
  const sig = (s: string) => [...s].map(c => c.charCodeAt(0));
  const xyz = (values: number[]) => [...sig('XYZ '),0,0,0,0,...values.flatMap(n => u32(Math.round(n*65536)))];
  const curve = [...sig('curv'),0,0,0,0,...u32(1),2,51,0,0];
  const tags: [string, number[]][] = [
    ['wtpt', xyz([0.9642,1,0.8249])],
    ['rXYZ', xyz([0.4360747,0.2225045,0.0139322])],
    ['gXYZ', xyz([0.3850649,0.7168786,0.0971045])],
    ['bXYZ', xyz([0.1430804,0.0606169,0.7141733])],
    ['rTRC',curve], ['gTRC',curve], ['bTRC',curve]
  ];
  if (transfer) tags.push(['cicp',[...sig('cicp'),0,0,0,0,1,transfer,0,1]]);
  const table: number[] = [], data: number[] = [];
  for (const [name, body] of tags) {
    table.push(...sig(name),...u32(132+tags.length*12+data.length),...u32(body.length));
    data.push(...body);
    while (data.length%4) data.push(0);
  }
  const profile = new Uint8Array(132+table.length+data.length);
  profile.set(u32(profile.length)); profile.set([4,0x30,0,0],8);
  profile.set(sig('mntrRGB XYZ '),12); profile.set(sig('acsp'),36);
  profile.set(xyz([0.9642,1,0.8249]).slice(8),68);
  profile.set(u32(tags.length),128); profile.set(table,132); profile.set(data,132+table.length);
  return profile;
}
