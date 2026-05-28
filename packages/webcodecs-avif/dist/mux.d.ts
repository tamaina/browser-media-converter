export type EncodedStillAv1 = {
    chunk: Uint8Array;
    decoderConfig: VideoDecoderConfig;
    av1Config: Uint8Array;
    width: number;
    height: number;
};
export type AvifMetadataItem = {
    type: 'Exif';
    data: Uint8Array;
    name?: string;
};
export type MuxStillAvifOptions = {
    metadata?: AvifMetadataItem[];
};
export declare function muxStillAvif(encoded: EncodedStillAv1, options?: MuxStillAvifOptions): Uint8Array;
export declare function makeAv1Config(codec: string, sequenceHeaderObu: Uint8Array | null): Uint8Array<ArrayBuffer>;
export declare function findSequenceHeaderObu(data: Uint8Array): Uint8Array<ArrayBuffer> | null;
//# sourceMappingURL=mux.d.ts.map