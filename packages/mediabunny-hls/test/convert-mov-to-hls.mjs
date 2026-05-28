import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mp4ToHls } from '../dist/index.js';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const input = new Uint8Array(await readFile(resolve(root, 'bbb.mov')));
const outputDir = resolve(root, 'playground-output/hls');
await mkdir(outputDir, { recursive: true });

const assets = await mp4ToHls({
  input,
  targetDuration: 2,
  keyFrameInterval: 2,
});

for (const asset of assets) {
  await writeFile(resolve(outputDir, asset.path), asset.data);
}

console.log(`wrote ${assets.length} HLS assets to ${outputDir}`);
