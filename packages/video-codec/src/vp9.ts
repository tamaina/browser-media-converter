import { getVpCodec, type VpChromaSubsamplingCode } from './media-codecs.js';
import {
  additionalCodecStringFields,
  additionalColorSettings,
  shouldUseAdditionalFields,
  type PlannedVideoCodecString,
  type VideoCodecBitDepth,
  type VideoCodecChromaSubsampling,
  type VideoCodecPlannerInput,
} from './types.js';

export type Vp9ProfileSpec = {
  profile: 0 | 1 | 2 | 3;
  bitDepths: VideoCodecBitDepth[];
  chromaSubsamplings: VideoCodecChromaSubsampling[];
};

export type Vp9LevelSpec = {
  level: string;
  levelCode: number;
  maxPictureSize: number;
  maxLumaSampleRate: number;
  maxBitrate: number;
  maxCpbSize?: number;
  minCompressionRatio: number;
  maxTiles: number;
  minAltRefDistance: number;
  maxReferenceFrames: number;
  maxLumaDimension: number;
};

export const VP9_PROFILES: Vp9ProfileSpec[] = [
  { profile: 0, bitDepths: [8], chromaSubsamplings: ['420'] },
  { profile: 1, bitDepths: [8], chromaSubsamplings: ['422', '444'] },
  { profile: 2, bitDepths: [10, 12], chromaSubsamplings: ['420'] },
  { profile: 3, bitDepths: [10, 12], chromaSubsamplings: ['422', '444'] },
];

export const VP9_LEVELS: Vp9LevelSpec[] = [
  { level: '1', levelCode: 10, maxPictureSize: 36_864, maxLumaSampleRate: 829_440, maxBitrate: 200_000, maxCpbSize: 400_000, minCompressionRatio: 2, maxTiles: 1, minAltRefDistance: 4, maxReferenceFrames: 8, maxLumaDimension: 512 },
  { level: '1.1', levelCode: 11, maxPictureSize: 73_728, maxLumaSampleRate: 2_764_800, maxBitrate: 800_000, maxCpbSize: 1_000_000, minCompressionRatio: 2, maxTiles: 1, minAltRefDistance: 4, maxReferenceFrames: 8, maxLumaDimension: 768 },
  { level: '2', levelCode: 20, maxPictureSize: 122_880, maxLumaSampleRate: 4_608_000, maxBitrate: 1_800_000, maxCpbSize: 1_500_000, minCompressionRatio: 2, maxTiles: 1, minAltRefDistance: 4, maxReferenceFrames: 8, maxLumaDimension: 960 },
  { level: '2.1', levelCode: 21, maxPictureSize: 245_760, maxLumaSampleRate: 9_216_000, maxBitrate: 3_600_000, maxCpbSize: 2_800_000, minCompressionRatio: 2, maxTiles: 2, minAltRefDistance: 4, maxReferenceFrames: 8, maxLumaDimension: 1_344 },
  { level: '3', levelCode: 30, maxPictureSize: 552_960, maxLumaSampleRate: 20_736_000, maxBitrate: 7_200_000, maxCpbSize: 6_000_000, minCompressionRatio: 2, maxTiles: 4, minAltRefDistance: 4, maxReferenceFrames: 8, maxLumaDimension: 2_048 },
  { level: '3.1', levelCode: 31, maxPictureSize: 983_040, maxLumaSampleRate: 36_864_000, maxBitrate: 12_000_000, maxCpbSize: 10_000_000, minCompressionRatio: 2, maxTiles: 4, minAltRefDistance: 4, maxReferenceFrames: 8, maxLumaDimension: 2_752 },
  { level: '4', levelCode: 40, maxPictureSize: 2_228_224, maxLumaSampleRate: 83_558_400, maxBitrate: 18_000_000, maxCpbSize: 16_000_000, minCompressionRatio: 4, maxTiles: 4, minAltRefDistance: 4, maxReferenceFrames: 8, maxLumaDimension: 4_160 },
  { level: '4.1', levelCode: 41, maxPictureSize: 2_228_224, maxLumaSampleRate: 160_432_128, maxBitrate: 30_000_000, maxCpbSize: 18_000_000, minCompressionRatio: 4, maxTiles: 4, minAltRefDistance: 5, maxReferenceFrames: 6, maxLumaDimension: 4_160 },
  { level: '5', levelCode: 50, maxPictureSize: 8_912_896, maxLumaSampleRate: 311_951_360, maxBitrate: 60_000_000, maxCpbSize: 36_000_000, minCompressionRatio: 6, maxTiles: 8, minAltRefDistance: 6, maxReferenceFrames: 4, maxLumaDimension: 8_384 },
  { level: '5.1', levelCode: 51, maxPictureSize: 8_912_896, maxLumaSampleRate: 588_251_136, maxBitrate: 120_000_000, maxCpbSize: 46_000_000, minCompressionRatio: 8, maxTiles: 8, minAltRefDistance: 10, maxReferenceFrames: 4, maxLumaDimension: 8_384 },
  { level: '5.2', levelCode: 52, maxPictureSize: 8_912_896, maxLumaSampleRate: 1_176_502_272, maxBitrate: 180_000_000, minCompressionRatio: 8, maxTiles: 8, minAltRefDistance: 10, maxReferenceFrames: 4, maxLumaDimension: 8_384 },
  { level: '6', levelCode: 60, maxPictureSize: 35_651_584, maxLumaSampleRate: 1_176_502_272, maxBitrate: 180_000_000, minCompressionRatio: 8, maxTiles: 16, minAltRefDistance: 10, maxReferenceFrames: 4, maxLumaDimension: 16_832 },
  { level: '6.1', levelCode: 61, maxPictureSize: 35_651_584, maxLumaSampleRate: 2_353_004_544, maxBitrate: 240_000_000, minCompressionRatio: 8, maxTiles: 16, minAltRefDistance: 10, maxReferenceFrames: 4, maxLumaDimension: 16_832 },
  { level: '6.2', levelCode: 62, maxPictureSize: 35_651_584, maxLumaSampleRate: 4_706_009_088, maxBitrate: 480_000_000, minCompressionRatio: 8, maxTiles: 16, minAltRefDistance: 10, maxReferenceFrames: 4, maxLumaDimension: 16_832 },
];

export function planVp9CodecString({
  options,
  behavior,
  width,
  height,
  frameRate,
  preferredAllowingMaxBitrate,
  bitDepth,
  chromaSubsampling,
}: VideoCodecPlannerInput): PlannedVideoCodecString {
  const profile = selectVp9Profile({ bitDepth, chromaSubsampling });
  const level = selectVp9Level({ width, height, frameRate, preferredAllowingMaxBitrate, profile });
  return {
    codec: getVpCodec({
      name: 'VP9',
      profile,
      level: level.level,
      bitDepth,
      chromaSubsampling: shouldUseAdditionalFields(options, behavior) ? vp9ChromaSubsamplingCode(chromaSubsampling) : undefined,
      ...additionalCodecStringFields(options, behavior),
    }),
    settings: {
      codec: 'vp9',
      profile,
      level: level.level,
      frameRate,
      ...(preferredAllowingMaxBitrate !== undefined ? { preferredAllowingMaxBitrate } : {}),
      bitDepth,
      chromaSubsampling,
      ...additionalColorSettings(options),
    },
  };
}

export function selectVp9Level(options: {
  width: number;
  height: number;
  frameRate?: number;
  preferredAllowingMaxBitrate?: number;
  profile?: 0 | 1 | 2 | 3;
}) {
  const pictureSize = options.width * options.height;
  const lumaSampleRate = pictureSize * (options.frameRate ?? 30);
  return VP9_LEVELS.find((level) => (
    pictureSize <= level.maxPictureSize
    && lumaSampleRate <= level.maxLumaSampleRate
    && (options.preferredAllowingMaxBitrate === undefined || options.preferredAllowingMaxBitrate <= level.maxBitrate)
  ))
    ?? VP9_LEVELS[VP9_LEVELS.length - 1]!;
}

export function selectVp9Profile(options: {
  bitDepth: VideoCodecBitDepth;
  chromaSubsampling: VideoCodecChromaSubsampling;
}) {
  if (options.chromaSubsampling === '420') return options.bitDepth === 8 ? 0 : 2;
  return options.bitDepth === 8 ? 1 : 3;
}

function vp9ChromaSubsamplingCode(chromaSubsampling: VideoCodecChromaSubsampling): VpChromaSubsamplingCode {
  switch (chromaSubsampling) {
    case '420':
      return '01';
    case '422':
      return '02';
    case '444':
      return '03';
    case '400':
      return '04';
  }
}
