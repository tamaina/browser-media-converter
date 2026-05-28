import { HlsOutputFormat, type HlsOutputFormatOptions, type Source } from 'mediabunny';
export type HlsAsset = {
    path: string;
    mimeType: string;
    data: Uint8Array;
};
export type Mp4ToHlsOptions = {
    input: Blob | ArrayBuffer | Uint8Array | Source;
    targetDuration?: number;
    rootPath?: string;
    singleFilePerPlaylist?: boolean;
    forceTranscode?: boolean;
    keyFrameInterval?: number;
    onProgress?: (progress: number, processedTime: number) => unknown;
};
export declare function mp4ToHls(options: Mp4ToHlsOptions): Promise<HlsAsset[]>;
export declare function createMpegTsHlsFormat(options?: Pick<HlsOutputFormatOptions, 'targetDuration' | 'singleFilePerPlaylist'>): HlsOutputFormat;
export declare function findMasterPlaylist(assets: HlsAsset[]): HlsAsset | null;
export declare function text(data: Uint8Array): string;
//# sourceMappingURL=index.d.ts.map