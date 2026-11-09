declare module 'brotli/decompress.js' {
  /** Pure JavaScript Brotli decoder. Throws for invalid compressed data. */
  export function decompress(input: Uint8Array): Uint8Array;
}
