import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmPath = resolve(packageRoot, 'assembly/build/simd.wasm');
const generatedPath = resolve(packageRoot, 'src/generated/simd-wasm.generated.ts');

await mkdir(dirname(wasmPath), { recursive: true });

await run(resolve(packageRoot, 'node_modules/.bin/asc'), [
  resolve(packageRoot, 'assembly/index.ts'),
  '--config',
  resolve(packageRoot, 'assembly/asconfig.json'),
  '--outFile',
  wasmPath,
]);

const bytes = await readFile(wasmPath);
const base64 = bytes.toString('base64');

await writeFile(generatedPath, `export const SIMD_WASM_BASE64 = '${base64}';\n`);
console.log(`wrote ${generatedPath} (${bytes.byteLength} bytes wasm, ${base64.length} bytes base64)`);

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', rejectRun);
    child.on('exit', (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}
