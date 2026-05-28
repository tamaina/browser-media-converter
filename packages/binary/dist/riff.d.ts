export type RiffChunk = {
    type: string;
    headerStart: number;
    start: number;
    end: number;
    paddedEnd: number;
};
export declare function riffChunks(data: Uint8Array, startOffset?: number): Generator<RiffChunk>;
export declare function makeRiffChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer>;
//# sourceMappingURL=riff.d.ts.map