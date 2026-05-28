export type FrameColorInspection = {
    format: VideoPixelFormat | null;
    codedWidth: number;
    codedHeight: number;
    displayWidth: number;
    displayHeight: number;
    visibleRect: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;
    timestamp: number;
    duration: number | null;
    colorSpace: {
        primaries: string | null;
        transfer: string | null;
        matrix: string | null;
        fullRange: boolean | null;
    };
};
export type FrameColorClassification = {
    isSimpleSdr: boolean;
    isWideGamut: boolean;
    isHdrLike: boolean;
    canvasColorSpace: PredefinedColorSpace;
    recommendedPath: 'canvas-sdr' | 'canvas-display-p3' | 'raw-or-webgpu-hdr';
    notes: string[];
};
export type RgbaCopyResult = {
    data: Uint8Array;
    layout: PlaneLayout[];
    colorSpace: PredefinedColorSpace;
    format: 'RGBA' | 'BGRA';
    width: number;
    height: number;
};
export type ResizeCanvasOptions = {
    width: number;
    height: number;
    colorSpace?: PredefinedColorSpace;
    imageSmoothingQuality?: ImageSmoothingQuality;
};
export type ResizeCanvasResult = {
    frame: VideoFrame;
    inspection: FrameColorInspection;
    colorSpace: PredefinedColorSpace;
};
export type ResizeRawOptions = {
    width: number;
    height: number;
    algorithm?: 'nearest' | 'bilinear';
};
export type ResizeRawResult = {
    frame: VideoFrame;
    inspection: FrameColorInspection;
    format: string;
    layout: PlaneLayout[];
    byteLength: number;
    algorithm: 'nearest' | 'bilinear';
};
export declare function decodeImageToVideoFrame(data: Uint8Array, type: string, options?: {
    colorSpaceConversion?: ColorSpaceConversion;
    desiredWidth?: number;
    desiredHeight?: number;
}): Promise<VideoFrame>;
export declare function inspectFrame(frame: VideoFrame): FrameColorInspection;
export declare function classifyFrameColor(frameOrInspection: VideoFrame | FrameColorInspection): FrameColorClassification;
export declare function copyFrameToRgba(frame: VideoFrame, options?: {
    colorSpace?: PredefinedColorSpace;
    format?: 'RGBA' | 'BGRA';
}): Promise<RgbaCopyResult>;
export declare function resizeFrameWithCanvas(frame: VideoFrame, options: ResizeCanvasOptions): ResizeCanvasResult;
export declare function resizeFrameRaw(frame: VideoFrame, options: ResizeRawOptions): Promise<ResizeRawResult>;
//# sourceMappingURL=index.d.ts.map