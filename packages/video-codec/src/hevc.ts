import { getHevcCodec, type HevcProfileName } from './media-codecs.js';
import {
  type PlannedVideoCodecString,
  type VideoCodecBitDepth,
  type VideoCodecChromaSubsampling,
  type VideoCodecPlannerInput,
  type VideoCodecTier,
  type VideoCodecTierPreference,
} from './types.js';

export type HevcProfileSpec = {
  profile: HevcProfileName;
  profileIdc: number;
  bitDepths: VideoCodecBitDepth[];
  chromaSubsamplings: VideoCodecChromaSubsampling[];
};

export type HevcLevelSpec = {
  level: string;
  levelIdc: number;
  tier: VideoCodecTier;
  maxLumaPictureSize: number;
  maxLumaSampleRate: number;
  maxBitrate: number;
  minCompressionRatio: number;
  maxSliceSegments: number;
  maxTileRows: number;
  maxTileColumns: number;
};

export const HEVC_PROFILES: HevcProfileSpec[] = [
  { profile: 'Main', profileIdc: 1, bitDepths: [8], chromaSubsamplings: ['420'] },
  { profile: 'Main 10', profileIdc: 2, bitDepths: [8, 10], chromaSubsamplings: ['420'] },
  { profile: 'Main Still Picture', profileIdc: 3, bitDepths: [8], chromaSubsamplings: ['420'] },
  { profile: 'Range Extensions', profileIdc: 4, bitDepths: [8, 10, 12], chromaSubsamplings: ['400', '420', '422', '444'] },
];

export const HEVC_LEVELS: HevcLevelSpec[] = [
  { level: '1', levelIdc: 30, tier: 'Main', maxLumaPictureSize: 36_864, maxLumaSampleRate: 552_960, maxBitrate: 128_000, minCompressionRatio: 2, maxSliceSegments: 16, maxTileRows: 1, maxTileColumns: 1 },
  { level: '2', levelIdc: 60, tier: 'Main', maxLumaPictureSize: 122_880, maxLumaSampleRate: 3_686_400, maxBitrate: 1_500_000, minCompressionRatio: 2, maxSliceSegments: 16, maxTileRows: 1, maxTileColumns: 1 },
  { level: '2.1', levelIdc: 63, tier: 'Main', maxLumaPictureSize: 245_760, maxLumaSampleRate: 7_372_800, maxBitrate: 3_000_000, minCompressionRatio: 2, maxSliceSegments: 20, maxTileRows: 1, maxTileColumns: 1 },
  { level: '3', levelIdc: 90, tier: 'Main', maxLumaPictureSize: 552_960, maxLumaSampleRate: 16_588_800, maxBitrate: 6_000_000, minCompressionRatio: 2, maxSliceSegments: 30, maxTileRows: 2, maxTileColumns: 2 },
  { level: '3.1', levelIdc: 93, tier: 'Main', maxLumaPictureSize: 983_040, maxLumaSampleRate: 33_177_600, maxBitrate: 10_000_000, minCompressionRatio: 2, maxSliceSegments: 40, maxTileRows: 3, maxTileColumns: 3 },
  { level: '4', levelIdc: 120, tier: 'Main', maxLumaPictureSize: 2_228_224, maxLumaSampleRate: 66_846_720, maxBitrate: 12_000_000, minCompressionRatio: 4, maxSliceSegments: 75, maxTileRows: 5, maxTileColumns: 5 },
  { level: '4', levelIdc: 120, tier: 'High', maxLumaPictureSize: 2_228_224, maxLumaSampleRate: 66_846_720, maxBitrate: 30_000_000, minCompressionRatio: 4, maxSliceSegments: 75, maxTileRows: 5, maxTileColumns: 5 },
  { level: '4.1', levelIdc: 123, tier: 'Main', maxLumaPictureSize: 2_228_224, maxLumaSampleRate: 133_693_440, maxBitrate: 20_000_000, minCompressionRatio: 4, maxSliceSegments: 75, maxTileRows: 5, maxTileColumns: 5 },
  { level: '4.1', levelIdc: 123, tier: 'High', maxLumaPictureSize: 2_228_224, maxLumaSampleRate: 133_693_440, maxBitrate: 50_000_000, minCompressionRatio: 4, maxSliceSegments: 75, maxTileRows: 5, maxTileColumns: 5 },
  { level: '5', levelIdc: 150, tier: 'Main', maxLumaPictureSize: 8_912_896, maxLumaSampleRate: 267_386_880, maxBitrate: 25_000_000, minCompressionRatio: 6, maxSliceSegments: 200, maxTileRows: 11, maxTileColumns: 10 },
  { level: '5', levelIdc: 150, tier: 'High', maxLumaPictureSize: 8_912_896, maxLumaSampleRate: 267_386_880, maxBitrate: 100_000_000, minCompressionRatio: 6, maxSliceSegments: 200, maxTileRows: 11, maxTileColumns: 10 },
  { level: '5.1', levelIdc: 153, tier: 'Main', maxLumaPictureSize: 8_912_896, maxLumaSampleRate: 534_773_760, maxBitrate: 40_000_000, minCompressionRatio: 8, maxSliceSegments: 200, maxTileRows: 11, maxTileColumns: 10 },
  { level: '5.1', levelIdc: 153, tier: 'High', maxLumaPictureSize: 8_912_896, maxLumaSampleRate: 534_773_760, maxBitrate: 160_000_000, minCompressionRatio: 8, maxSliceSegments: 200, maxTileRows: 11, maxTileColumns: 10 },
  { level: '5.2', levelIdc: 156, tier: 'Main', maxLumaPictureSize: 8_912_896, maxLumaSampleRate: 1_069_547_520, maxBitrate: 60_000_000, minCompressionRatio: 8, maxSliceSegments: 200, maxTileRows: 11, maxTileColumns: 10 },
  { level: '5.2', levelIdc: 156, tier: 'High', maxLumaPictureSize: 8_912_896, maxLumaSampleRate: 1_069_547_520, maxBitrate: 240_000_000, minCompressionRatio: 8, maxSliceSegments: 200, maxTileRows: 11, maxTileColumns: 10 },
  { level: '6', levelIdc: 180, tier: 'Main', maxLumaPictureSize: 35_651_584, maxLumaSampleRate: 1_069_547_520, maxBitrate: 60_000_000, minCompressionRatio: 8, maxSliceSegments: 600, maxTileRows: 22, maxTileColumns: 20 },
  { level: '6', levelIdc: 180, tier: 'High', maxLumaPictureSize: 35_651_584, maxLumaSampleRate: 1_069_547_520, maxBitrate: 240_000_000, minCompressionRatio: 8, maxSliceSegments: 600, maxTileRows: 22, maxTileColumns: 20 },
  { level: '6.1', levelIdc: 183, tier: 'Main', maxLumaPictureSize: 35_651_584, maxLumaSampleRate: 2_139_095_040, maxBitrate: 120_000_000, minCompressionRatio: 8, maxSliceSegments: 600, maxTileRows: 22, maxTileColumns: 20 },
  { level: '6.1', levelIdc: 183, tier: 'High', maxLumaPictureSize: 35_651_584, maxLumaSampleRate: 2_139_095_040, maxBitrate: 480_000_000, minCompressionRatio: 8, maxSliceSegments: 600, maxTileRows: 22, maxTileColumns: 20 },
  { level: '6.2', levelIdc: 186, tier: 'Main', maxLumaPictureSize: 35_651_584, maxLumaSampleRate: 4_278_190_080, maxBitrate: 240_000_000, minCompressionRatio: 6, maxSliceSegments: 600, maxTileRows: 22, maxTileColumns: 20 },
  { level: '6.2', levelIdc: 186, tier: 'High', maxLumaPictureSize: 35_651_584, maxLumaSampleRate: 4_278_190_080, maxBitrate: 800_000_000, minCompressionRatio: 6, maxSliceSegments: 600, maxTileRows: 22, maxTileColumns: 20 },
];

export function planHevcCodecString({
  options,
  width,
  height,
  frameRate,
  preferredAllowingMaxBitrate,
  bitDepth,
  chromaSubsampling,
}: VideoCodecPlannerInput): PlannedVideoCodecString {
  const profile = selectHevcProfile({ bitDepth, chromaSubsampling });
  const level = selectHevcLevel({
    width,
    height,
    frameRate,
    preferredAllowingMaxBitrate,
    profile,
    tier: options.tier,
  });
  return {
    codec: getHevcCodec({ profile, compatibility: '6', level: level.level, tier: level.tier, constraint: 'B0' }),
    settings: {
      codec: 'hevc',
      profile,
      level: level.level,
      tier: level.tier,
      frameRate,
      ...(preferredAllowingMaxBitrate !== undefined ? { preferredAllowingMaxBitrate } : {}),
      bitDepth,
      chromaSubsampling,
    },
  };
}

export function selectHevcLevel(options: {
  width: number;
  height: number;
  frameRate?: number;
  preferredAllowingMaxBitrate?: number;
  profile?: HevcProfileName;
  tier?: VideoCodecTierPreference;
}) {
  const pictureSize = options.width * options.height;
  const lumaSampleRate = pictureSize * (options.frameRate ?? 30);
  const candidates = hevcLevelCandidates(options.tier);
  return candidates.find((level) => (
    pictureSize <= level.maxLumaPictureSize
    && lumaSampleRate <= level.maxLumaSampleRate
    && (options.preferredAllowingMaxBitrate === undefined || options.preferredAllowingMaxBitrate <= level.maxBitrate)
  )) ?? candidates[candidates.length - 1]!;
}

function hevcLevelCandidates(tier: VideoCodecTierPreference | undefined) {
  if (tier === undefined || tier === 'auto') return HEVC_LEVELS;
  return HEVC_LEVELS.filter((level) => level.tier === tier);
}

export function selectHevcProfile(options: {
  bitDepth: VideoCodecBitDepth;
  chromaSubsampling: VideoCodecChromaSubsampling;
}): HevcProfileName {
  if (options.bitDepth === 8 && options.chromaSubsampling === '420') return 'Main';
  if (options.bitDepth === 10 && options.chromaSubsampling === '420') return 'Main 10';
  throw new RangeError(`No default HEVC profile is known for ${options.chromaSubsampling}/${options.bitDepth}.`);
}
