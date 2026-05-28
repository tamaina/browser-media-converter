import { HlsOutputFormat, type ConversionVideoOptions, type InputVideoTrack, type OutputFormat, type Source } from 'mediabunny';
export type SceneChange = {
    timestamp: number;
    score: number;
};
export type SceneDetectionOptions = {
    sampleRate?: number;
    threshold?: number;
    width?: number;
    height?: number;
    minSceneDuration?: number;
    minKeyFrameDistance?: number;
    maxKeyFrameInterval?: number;
};
export type SceneKeyFramePlan = {
    changes: SceneChange[];
    keyFrameTimestamps: number[];
    recommendedKeyFrameInterval: number;
};
export type FrameFingerprint = {
    timestamp: number;
    data: Uint8ClampedArray;
};
export declare function detectSceneChanges(track: InputVideoTrack, options?: SceneDetectionOptions): Promise<SceneChange[]>;
export declare function planSceneKeyFrames(track: InputVideoTrack, options?: SceneDetectionOptions): Promise<SceneKeyFramePlan>;
export declare function conversionVideoOptionsWithSceneKeyFrames(track: InputVideoTrack, options?: SceneDetectionOptions): Promise<ConversionVideoOptions>;
export type TranscodeWithSceneKeyFramesOptions = {
    input: Blob | ArrayBuffer | Uint8Array | Source;
    outputFormat?: OutputFormat;
    detection?: SceneDetectionOptions;
    video?: Omit<ConversionVideoOptions, 'keyFrameInterval' | 'forceTranscode' | 'process'>;
};
export declare function transcodeWithSceneKeyFrames(options: TranscodeWithSceneKeyFramesOptions): Promise<{
    buffer: ArrayBuffer;
    scenePlan: SceneKeyFramePlan | null;
}>;
export declare function mpegTsHlsOutputFormat(targetDuration?: number): HlsOutputFormat;
export declare function detectSceneChangesInFingerprints(fingerprints: FrameFingerprint[], options?: SceneDetectionOptions): SceneChange[];
export declare function planKeyFrameTimestamps(changes: SceneChange[], options?: {
    duration?: number;
    minKeyFrameDistance?: number;
    maxKeyFrameInterval?: number;
    startTimestamp?: number;
}): number[];
export declare function scoreFrameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number;
//# sourceMappingURL=index.d.ts.map