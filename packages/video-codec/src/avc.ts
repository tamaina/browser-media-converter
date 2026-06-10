import {
  getAvcCodec,
  type AvcProfileName,
} from './media-codecs.js';
import {
  type PlannedVideoCodecString,
  type VideoCodecBitDepth,
  type VideoCodecChromaSubsampling,
  type VideoCodecPlannerInput,
} from './types.js';

export type AvcProfileSpec = {
  profile: AvcProfileName;
  profileIdc: number;
  constraintSetFlags: number;
  bitDepths: VideoCodecBitDepth[];
  chromaSubsamplings: VideoCodecChromaSubsampling[];
  intraOnly: boolean;
};

export type AvcLevelSpec = {
  level: string;
  levelIdc: number;
  maxMacroblocks: number;
  maxFrameRateMacroblocks: number;
  maxDpbMacroblocks: number;
  maxBitrate: number;
  maxCpb: number;
};

export const AVC_PROFILES: AvcProfileSpec[] = [
  { profile: 'Constrained Baseline', profileIdc: 0x42, constraintSetFlags: 0x40, bitDepths: [8], chromaSubsamplings: ['420'], intraOnly: false },
  { profile: 'Baseline', profileIdc: 0x42, constraintSetFlags: 0x00, bitDepths: [8], chromaSubsamplings: ['420'], intraOnly: false },
  { profile: 'Extended', profileIdc: 0x58, constraintSetFlags: 0x00, bitDepths: [8], chromaSubsamplings: ['420'], intraOnly: false },
  { profile: 'Main', profileIdc: 0x4d, constraintSetFlags: 0x00, bitDepths: [8], chromaSubsamplings: ['420'], intraOnly: false },
  { profile: 'High', profileIdc: 0x64, constraintSetFlags: 0x00, bitDepths: [8], chromaSubsamplings: ['420'], intraOnly: false },
  { profile: 'High 10', profileIdc: 0x6e, constraintSetFlags: 0x00, bitDepths: [8, 10], chromaSubsamplings: ['420'], intraOnly: false },
  { profile: 'High 4:2:2', profileIdc: 0x7a, constraintSetFlags: 0x00, bitDepths: [8, 10], chromaSubsamplings: ['420', '422'], intraOnly: false },
  { profile: 'High 4:4:4 Predictive', profileIdc: 0xf4, constraintSetFlags: 0x00, bitDepths: [8, 10, 12], chromaSubsamplings: ['420', '422', '444'], intraOnly: false },
  { profile: 'High 10 Intra', profileIdc: 0x6e, constraintSetFlags: 0x10, bitDepths: [8, 10], chromaSubsamplings: ['420'], intraOnly: true },
  { profile: 'High 4:2:2 Intra', profileIdc: 0x7a, constraintSetFlags: 0x10, bitDepths: [8, 10], chromaSubsamplings: ['420', '422'], intraOnly: true },
  { profile: 'High 4:4:4 Intra', profileIdc: 0xf4, constraintSetFlags: 0x10, bitDepths: [8, 10, 12], chromaSubsamplings: ['420', '422', '444'], intraOnly: true },
  { profile: 'CAVLC 4:4:4 Intra', profileIdc: 0x44, constraintSetFlags: 0x00, bitDepths: [8, 10, 12], chromaSubsamplings: ['444'], intraOnly: true },
];

export const AVC_LEVELS: AvcLevelSpec[] = [
  { level: '1', levelIdc: 10, maxMacroblocks: 99, maxFrameRateMacroblocks: 1_485, maxDpbMacroblocks: 396, maxBitrate: 64_000, maxCpb: 175_000 },
  { level: '1.1', levelIdc: 11, maxMacroblocks: 396, maxFrameRateMacroblocks: 3_000, maxDpbMacroblocks: 900, maxBitrate: 192_000, maxCpb: 500_000 },
  { level: '1.2', levelIdc: 12, maxMacroblocks: 396, maxFrameRateMacroblocks: 6_000, maxDpbMacroblocks: 2_376, maxBitrate: 384_000, maxCpb: 1_000_000 },
  { level: '1.3', levelIdc: 13, maxMacroblocks: 396, maxFrameRateMacroblocks: 11_880, maxDpbMacroblocks: 2_376, maxBitrate: 768_000, maxCpb: 2_000_000 },
  { level: '2', levelIdc: 20, maxMacroblocks: 396, maxFrameRateMacroblocks: 11_880, maxDpbMacroblocks: 2_376, maxBitrate: 2_000_000, maxCpb: 2_000_000 },
  { level: '2.1', levelIdc: 21, maxMacroblocks: 792, maxFrameRateMacroblocks: 19_800, maxDpbMacroblocks: 4_752, maxBitrate: 4_000_000, maxCpb: 4_000_000 },
  { level: '2.2', levelIdc: 22, maxMacroblocks: 1_620, maxFrameRateMacroblocks: 20_250, maxDpbMacroblocks: 8_100, maxBitrate: 4_000_000, maxCpb: 4_000_000 },
  { level: '3', levelIdc: 30, maxMacroblocks: 1_620, maxFrameRateMacroblocks: 40_500, maxDpbMacroblocks: 8_100, maxBitrate: 10_000_000, maxCpb: 10_000_000 },
  { level: '3.1', levelIdc: 31, maxMacroblocks: 3_600, maxFrameRateMacroblocks: 108_000, maxDpbMacroblocks: 18_000, maxBitrate: 14_000_000, maxCpb: 14_000_000 },
  { level: '3.2', levelIdc: 32, maxMacroblocks: 5_120, maxFrameRateMacroblocks: 216_000, maxDpbMacroblocks: 20_480, maxBitrate: 20_000_000, maxCpb: 20_000_000 },
  { level: '4', levelIdc: 40, maxMacroblocks: 8_192, maxFrameRateMacroblocks: 245_760, maxDpbMacroblocks: 32_768, maxBitrate: 20_000_000, maxCpb: 25_000_000 },
  { level: '4.1', levelIdc: 41, maxMacroblocks: 8_192, maxFrameRateMacroblocks: 245_760, maxDpbMacroblocks: 32_768, maxBitrate: 50_000_000, maxCpb: 62_500_000 },
  { level: '4.2', levelIdc: 42, maxMacroblocks: 8_704, maxFrameRateMacroblocks: 522_240, maxDpbMacroblocks: 34_816, maxBitrate: 50_000_000, maxCpb: 62_500_000 },
  { level: '5', levelIdc: 50, maxMacroblocks: 22_080, maxFrameRateMacroblocks: 589_824, maxDpbMacroblocks: 110_400, maxBitrate: 135_000_000, maxCpb: 135_000_000 },
  { level: '5.1', levelIdc: 51, maxMacroblocks: 36_864, maxFrameRateMacroblocks: 983_040, maxDpbMacroblocks: 184_320, maxBitrate: 240_000_000, maxCpb: 240_000_000 },
  { level: '5.2', levelIdc: 52, maxMacroblocks: 36_864, maxFrameRateMacroblocks: 2_073_600, maxDpbMacroblocks: 184_320, maxBitrate: 240_000_000, maxCpb: 240_000_000 },
  { level: '6', levelIdc: 60, maxMacroblocks: 139_264, maxFrameRateMacroblocks: 4_177_920, maxDpbMacroblocks: 696_320, maxBitrate: 240_000_000, maxCpb: 240_000_000 },
  { level: '6.1', levelIdc: 61, maxMacroblocks: 139_264, maxFrameRateMacroblocks: 8_355_840, maxDpbMacroblocks: 696_320, maxBitrate: 480_000_000, maxCpb: 480_000_000 },
  { level: '6.2', levelIdc: 62, maxMacroblocks: 139_264, maxFrameRateMacroblocks: 16_711_680, maxDpbMacroblocks: 696_320, maxBitrate: 800_000_000, maxCpb: 800_000_000 },
];

export function planAvcCodecString({
  width,
  height,
  frameRate,
  preferredAllowingMaxBitrate,
  bitDepth,
  chromaSubsampling,
}: VideoCodecPlannerInput): PlannedVideoCodecString {
  const profile = selectAvcProfile({ bitDepth, chromaSubsampling });
  const level = selectAvcLevel({ width, height, frameRate, preferredAllowingMaxBitrate, profile });
  return {
    codec: getAvcCodec({ profile, level: level.level }),
    settings: {
      codec: 'avc',
      profile,
      level: level.level,
      frameRate,
      ...(preferredAllowingMaxBitrate !== undefined ? { preferredAllowingMaxBitrate } : {}),
      bitDepth,
      chromaSubsampling,
    },
  };
}

export function selectAvcLevel(options: {
  width: number;
  height: number;
  frameRate?: number;
  preferredAllowingMaxBitrate?: number;
  profile?: AvcProfileName;
}) {
  const macroblocks = Math.ceil(options.width / 16) * Math.ceil(options.height / 16);
  const macroblockRate = macroblocks * (options.frameRate ?? 30);
  return AVC_LEVELS.find((level) => (
    macroblocks <= level.maxMacroblocks
    && macroblockRate <= level.maxFrameRateMacroblocks
    && (options.preferredAllowingMaxBitrate === undefined || options.preferredAllowingMaxBitrate <= level.maxBitrate)
  ))
    ?? AVC_LEVELS[AVC_LEVELS.length - 1]!;
}

export function selectAvcProfile(options: {
  bitDepth: VideoCodecBitDepth;
  chromaSubsampling: VideoCodecChromaSubsampling;
}): AvcProfileName {
  if (options.bitDepth === 8 && options.chromaSubsampling === '420') return 'High';
  if (options.bitDepth === 10 && options.chromaSubsampling === '420') return 'High 10';
  if (options.bitDepth === 10 && options.chromaSubsampling === '422') return 'High 4:2:2';
  if (options.chromaSubsampling === '444') return 'High 4:4:4 Predictive';
  throw new RangeError(`No default AVC profile is known for ${options.chromaSubsampling}/${options.bitDepth}.`);
}
