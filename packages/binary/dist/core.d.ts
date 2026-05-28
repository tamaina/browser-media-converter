export declare function concat(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer>;
export declare function bytesEqual(a: Uint8Array, b: Uint8Array): boolean;
export declare function startsWith(data: Uint8Array, prefix: Uint8Array): boolean;
export declare function readAscii(data: Uint8Array, offset: number, length: number): string;
export declare function writeAscii(data: Uint8Array, offset: number, text: string): void;
export declare function ascii(text: string): Uint8Array<ArrayBuffer>;
export declare function cstr(text: string): Uint8Array<ArrayBuffer>;
export declare function readU16(data: Uint8Array, offset: number): number;
export declare function readU16le(data: Uint8Array, offset: number): number;
export declare function writeU16(data: Uint8Array, offset: number, value: number): void;
export declare function u16(value: number): Uint8Array<ArrayBuffer>;
export declare function readU32(data: Uint8Array, offset: number): number;
export declare function readU32le(data: Uint8Array, offset: number): number;
export declare function writeU32(data: Uint8Array, offset: number, value: number): void;
export declare function writeU32le(data: Uint8Array, offset: number, value: number): void;
export declare function u32(value: number): Uint8Array<ArrayBuffer>;
export declare function readU64(data: Uint8Array, offset: number): bigint;
export declare function readSized(data: Uint8Array, offset: number, size: number): number;
//# sourceMappingURL=core.d.ts.map