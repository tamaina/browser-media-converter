import { type ExifPayload } from '@browser-avif-lab/exif-transplant';
import { type EncodeAvifOptions } from '@browser-avif-lab/webcodecs-avif';
import { type FrameColorClassification, type FrameColorInspection, type ResizeRawOptions } from '@browser-avif-lab/webcodecs-color';
export type BrowserImageOutputMime = 'image/avif' | 'image/jpeg' | 'image/webp';
export type BrowserImageResizeFit = 'contain' | 'cover' | 'fill';
export type BrowserImageExifPolicy = 'keep' | 'drop' | 'drop-gps';
export type BrowserImageResizePath = 'none' | 'raw' | 'canvas';
export type BrowserImageResizerOptions = {
    input: Blob | ArrayBuffer | Uint8Array;
    inputMime?: string;
    outputMime?: BrowserImageOutputMime;
    width?: number;
    height?: number;
    fit?: BrowserImageResizeFit;
    exif?: BrowserImageExifPolicy;
    colorSpaceConversion?: ColorSpaceConversion;
    resizePath?: 'auto' | 'raw' | 'canvas';
    rawResizeAlgorithm?: ResizeRawOptions['algorithm'];
    quality?: number;
    avif?: Omit<EncodeAvifOptions, 'width' | 'height' | 'quality'>;
};
export type BrowserImageResizerResult = {
    data: Uint8Array;
    blob: Blob;
    mime: BrowserImageOutputMime;
    width: number;
    height: number;
    resizePath: BrowserImageResizePath;
    input: FrameColorInspection;
    output: FrameColorInspection | null;
    color: FrameColorClassification;
    exif: {
        policy: BrowserImageExifPolicy;
        source: ExifPayload | null;
        written: boolean;
    };
    warnings: string[];
};
export declare function resizeAndConvertImage(options: BrowserImageResizerOptions): Promise<BrowserImageResizerResult>;
export declare function resizeImageToAvif(input: Blob | ArrayBuffer | Uint8Array, options?: Omit<BrowserImageResizerOptions, 'input' | 'outputMime'>): Promise<BrowserImageResizerResult>;
//# sourceMappingURL=index.d.ts.map