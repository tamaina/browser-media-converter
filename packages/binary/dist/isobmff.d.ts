export type BoxInput = Uint8Array | BoxInput[];
export type IsobmffBox = {
    type: string;
    start: number;
    end: number;
    headerSize: number;
};
export declare function box(type: string, ...payloads: BoxInput[]): Uint8Array;
export declare function fullBox(type: string, version: number, flags: number, ...payloads: BoxInput[]): Uint8Array;
export declare function boxes(data: Uint8Array, start: number, end: number): Generator<IsobmffBox>;
export declare function readBox(data: Uint8Array, offset: number): IsobmffBox | null;
//# sourceMappingURL=isobmff.d.ts.map