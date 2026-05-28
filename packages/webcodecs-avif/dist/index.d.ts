import { type EncodedStillAv1 } from './mux.js';
export type { AvifMetadataItem, EncodedStillAv1, MuxStillAvifOptions, } from './mux.js';
export { findSequenceHeaderObu, makeAv1Config, muxStillAvif, } from './mux.js';
export type EncodeAvifOptions = {
    quality?: number;
    width?: number;
    height?: number;
    codec?: string;
    bitrate?: number;
    av1Config?: Uint8Array;
    alpha?: 'discard' | 'keep';
};
export declare function encodeImageToAv1(source: CanvasImageSource | VideoFrame, options?: EncodeAvifOptions): Promise<EncodedStillAv1>;
export declare function encodeImageToAvif(source: CanvasImageSource | VideoFrame, options?: EncodeAvifOptions): Promise<Uint8Array>;
export declare function decodeAv1Still(encoded: EncodedStillAv1): Promise<VideoFrame>;
export declare function canvasSourceFromBlob(blob: Blob): Promise<ImageBitmap>;
//# sourceMappingURL=index.d.ts.map