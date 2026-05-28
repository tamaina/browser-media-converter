import { type InputVideoTrack } from 'mediabunny';
export type SceneChange = {
    timestamp: number;
    score: number;
};
export type SceneDetectionSensitivity = 'low' | 'medium' | 'high';
export type SceneDetectionOptions = {
    sensitivity?: SceneDetectionSensitivity;
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
export type ResolvedSceneDetectionOptions = Required<Omit<SceneDetectionOptions, 'sensitivity' | 'minKeyFrameDistance' | 'maxKeyFrameInterval'>> & {
    sensitivity: SceneDetectionSensitivity;
    minKeyFrameDistance?: number;
    maxKeyFrameInterval?: number;
};
export declare const sceneDetectionPresets: {
    low: {
        sampleRate: number;
        threshold: number;
        width: number;
        height: number;
        minSceneDuration: number;
    };
    medium: {
        sampleRate: number;
        threshold: number;
        width: number;
        height: number;
        minSceneDuration: number;
    };
    high: {
        sampleRate: number;
        threshold: number;
        width: number;
        height: number;
        minSceneDuration: number;
    };
};
export declare function resolveSceneDetectionOptions(options?: SceneDetectionOptions): ResolvedSceneDetectionOptions;
export declare function detectSceneChanges(track: InputVideoTrack, options?: SceneDetectionOptions): Promise<SceneChange[]>;
export declare function planSceneKeyFrames(track: InputVideoTrack, options?: SceneDetectionOptions): Promise<SceneKeyFramePlan>;
export declare function detectSceneChangesInFingerprints(fingerprints: FrameFingerprint[], options?: SceneDetectionOptions): SceneChange[];
export declare function planKeyFrameTimestamps(changes: SceneChange[], options?: {
    duration?: number;
    minKeyFrameDistance?: number;
    maxKeyFrameInterval?: number;
    startTimestamp?: number;
}): number[];
export declare function scoreFrameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number;
//# sourceMappingURL=index.d.ts.map