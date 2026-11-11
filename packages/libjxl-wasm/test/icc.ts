// Small synthetic ICC fixtures, generated in memory without native tools.
const ascii = (s: string) => Array.from(s, c => c.charCodeAt(0));
const u32 = (n: number) => [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const fixed = (n: number) => u32(Math.round(n * 65536));
const xyz = (v: number[]) => [...ascii('XYZ '),0,0,0,0,...v.flatMap(fixed)];
function profile(tags: [string, number[]][], gray=false) {
  const data: number[]=[], table: number[]=[];
  const base=132+12*tags.length;
  for(const [sig,body] of tags) {
    table.push(...ascii(sig),...u32(base+data.length),...u32(body.length));
    data.push(...body);
    while(data.length%4)data.push(0);
  }
  const header=new Uint8Array(128);
  header.set(u32(base+data.length));
  header.set([4,0x30,0,0],8);
  header.set(ascii(gray?'mntrGRAYXYZ ':'mntrRGB XYZ '),12);
  header.set(ascii('acsp'),36);
  header.set([0.9642,1,0.8249].flatMap(fixed),68);
  return new Uint8Array([...header,...u32(tags.length),...table,...data]);
}
const white: [string,number[]]=['wtpt',xyz([0.9642,1,0.8249])];
const gamma=[...ascii('para'),0,0,0,0,0,0,0,0,...fixed(2.2)];
export function matrixProfile() {
  return profile([white,
    ['rXYZ',xyz([0.4360747,0.2225045,0.0139322])],
    ['gXYZ',xyz([0.3850649,0.7168786,0.0971045])],
    ['bXYZ',xyz([0.1430804,0.0606169,0.7141733])],
    ['rTRC',gamma],['gTRC',gamma],['bTRC',gamma]]);
}
export function grayProfile() {return profile([white,['kTRC',gamma]],true);}
// Same linear RGB->XYZ mAB shape as rust/cms.rs's hdr_lut_profile.
export function lutProfile() {
  const curves=Array.from({length:3},()=>[...ascii('curv'),0,0,0,0,...u32(2),0,0,255,255]).flat();
  const matrix=[...[0.4360747,0.3850649,0.1430804,0.2225045,0.7168786,0.0606169,0.0139322,0.0971045,0.7141733].flatMap(fixed),...new Array(12).fill(0)];
  const clut=[2,2,2,...new Array(13).fill(0),2,0,0,0];
  for(let i=0;i<8;i++)for(let c=0;c<3;c++)clut.push(...(i>>(2-c)&1?[255,255]:[0,0]));
  const parts=[curves,matrix,curves,clut,curves];
  let offset=32;
  const offsets=parts.flatMap(part=>{const at=offset;offset+=part.length;return u32(at);});
  return profile([white,['A2B0',[...ascii('mAB '),0,0,0,0,3,3,0,0,...offsets,...parts.flat()]]]);
}
