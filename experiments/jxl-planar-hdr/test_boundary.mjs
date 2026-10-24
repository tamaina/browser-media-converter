import assert from 'node:assert/strict';
import { captureWholePlanarFrame, describeProofFormat } from './boundary.mjs';
for (const base of ['I420', 'I422', 'I444']) for (const depth of [8, 10, 12]) {
  assert.equal(describeProofFormat(base + (depth === 8 ? '' : `P${depth}`)).depth, depth);
}
assert.throws(() => describeProofFormat('I420AP10'));
assert.throws(() => describeProofFormat('P010'));
let copied = 0;
const frame = { format: 'I420P10', visibleRect: { x: 0, y: 0, width: 3, height: 3 },
  colorSpace: { primaries: 'bt2020', transfer: 'pq', matrix: 'bt2020-ncl', fullRange: false },
  allocationSize() { return 34; },
  async copyTo(bytes, options) { copied++; assert.equal(options.format, undefined); bytes.fill(0); return [{offset:0,stride:6},{offset:18,stride:4},{offset:26,stride:4}]; } };
const input = await captureWholePlanarFrame(frame, { chromaSiting: 'center', intensityTargetNits: 10000 });
assert.equal(input.bitDepth, 10); assert.equal(input.storage, 'u16le-lsb');
assert.equal(input.planes[1].width, 2); assert.equal(input.planes[1].height, 2);
assert.equal(input.color.transfer, 'pq'); assert.equal(copied, 1);
for (const bad of [{chromaSiting:'left',intensityTargetNits:10000}, {chromaSiting:'center',intensityTargetNits:255}]) await assert.rejects(captureWholePlanarFrame(frame,bad));
await assert.rejects(captureWholePlanarFrame({...frame,visibleRect:{x:1,y:0,width:3,height:3}},{chromaSiting:'center',intensityTargetNits:10000}));
await assert.rejects(captureWholePlanarFrame({...frame,colorSpace:{...frame.colorSpace,matrix:null}},{chromaSiting:'center',intensityTargetNits:10000}));
assert.equal(copied, 1);
console.log('Browser boundary descriptor/mock-copy tests passed; no real browser/Wasm run.');
