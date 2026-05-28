import { Input, type ConversionAudioOptions, type ConversionVideoOptions, type InputVideoTrack, type OutputFormat, type Source } from 'mediabunny';
import { type HlsAsset, type Mp4ToHlsOptions } from '@browser-avif-lab/mediabunny-hls';
import { type SceneDetectionOptions, type SceneKeyFramePlan } from '@browser-avif-lab/mediabunny-scene-keyframes';
import { type ResizeRawOptions } from '@browser-avif-lab/webcodecs-color';
export type BrowserMovieInput = Blob | ArrayBuffer | Uint8Array | Source;
export type BrowserMovieOutputContainer = 'mp4' | 'webm';
export type BrowserMovieColorMetadataPolicy = 'copy' | 'default';
export type BrowserMovieResizeFit = 'contain' | 'cover' | 'fill';
export type BrowserMovieResizePath = 'auto' | 'raw' | 'mediabunny';
export type BrowserMovieResizeOptions = {
    width?: number;
    height?: number;
    fit?: BrowserMovieResizeFit;
    path?: BrowserMovieResizePath;
    rawAlgorithm?: ResizeRawOptions['algorithm'];
    dimensionAlignment?: 1 | 2 | 4 | 8;
};
export type BrowserMovieConverterOptions = {
    input: BrowserMovieInput;
    outputFormat?: OutputFormat;
    container?: BrowserMovieOutputContainer;
    video?: Omit<ConversionVideoOptions, 'process' | 'keyFrameInterval' | 'forceTranscode' | 'width' | 'height' | 'fit' | 'processedWidth' | 'processedHeight'>;
    audio?: ConversionAudioOptions;
    resize?: BrowserMovieResizeOptions;
    sceneDetection?: false | SceneDetectionOptions;
    colorMetadata?: BrowserMovieColorMetadataPolicy;
    /** @deprecated Use colorMetadata. This option only copied metadata and did not perform color conversion. */
    colorSpace?: 'preserve' | 'default';
    forceTranscode?: boolean;
    onProgress?: (progress: number, processedTime: number) => unknown;
};
export type BrowserMovieTrackColor = {
    colorSpace: VideoColorSpaceInit | null;
    hasHighDynamicRange: boolean;
};
export type BrowserMovieConverterResult = {
    buffer: ArrayBuffer;
    blob: Blob;
    mimeType: string;
    scenePlan: SceneKeyFramePlan | null;
    videoColor: BrowserMovieTrackColor | null;
    resize: {
        width: number;
        height: number;
        path: BrowserMovieResizePath | 'none';
    } | null;
};
export declare function convertMovie(options: BrowserMovieConverterOptions): Promise<BrowserMovieConverterResult>;
export declare function convertMovieToHls(options: Mp4ToHlsOptions): Promise<HlsAsset[]>;
export declare function inspectMovie(inputSource: BrowserMovieInput): Promise<{
    videoColor: BrowserMovieTrackColor | null;
    scenePlan: SceneKeyFramePlan | null;
}>;
export declare function inspectVideoTrackColor(track: InputVideoTrack): Promise<BrowserMovieTrackColor>;
export declare function createInput(input: BrowserMovieInput): Input;
export type { HlsAsset, Mp4ToHlsOptions, SceneDetectionOptions, SceneKeyFramePlan, };
//# sourceMappingURL=index.d.ts.map