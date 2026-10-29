// Where the patched libjxl build (packages/libjxl-wasm) lives, and how the test
// servers expose it: '/libjxl-wasm/...' maps to the package, everything else to root.
import path from 'node:path';
export const libjxlPackage=path.resolve(import.meta.dirname,'../../packages/libjxl-wasm');
export const libjxlBuild=path.join(libjxlPackage,'build');
export function servedPath(root,pathname){
  const [base,rest]=pathname.startsWith('/libjxl-wasm/')?[libjxlPackage,pathname.slice('/libjxl-wasm'.length)]:[root,pathname];
  const file=path.resolve(base,'.'+rest);
  if(file!==base&&!file.startsWith(base+path.sep))throw Error('path');
  return file;
}
