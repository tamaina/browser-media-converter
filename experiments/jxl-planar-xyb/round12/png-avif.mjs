// Supplementary Chrome execution of the exact PNG assertions from Electron smoke.
// Useful when Electron/Xvfb is unavailable; this does not certify the other Electron checks.
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../..');
let source=await readFile(path.join(root,'packages/browser-image-resizer-ex/test/electron-smoke.mjs'),'utf8');
source=source.replace("import { _electron as electron } from 'playwright';",`import {chromium} from 'playwright';
const electron={launch:async({args})=>{const browser=await chromium.launch({channel:'chrome',args:args.slice(1)});const page=await browser.newPage();return {firstWindow:async()=>page,close:()=>browser.close()};}};`);
source=source.replace("const root = resolve(new URL('../../..', import.meta.url).pathname);",`const root=${JSON.stringify(root)};`);
const pngAssertions=source.slice(source.indexOf('assert.deepEqual(result.pngMetadata[0]'),source.indexOf("assert.equal(result.iccWebp.kind"));
source=source.slice(0,source.indexOf('\nassert.',source.indexOf('}, { port,')))+'\n'+pngAssertions+`
console.log('PNG iCCP/cICP → AVIF Chrome assertions passed (2 fixtures)');
await app.close();server.close();\n`;
const file=path.join(root,'experiments/jxl-planar-xyb/build/round12/png-avif-runner.mjs');
await writeFile(file,source);execFileSync(process.execPath,[file],{stdio:'inherit',env:process.env});
