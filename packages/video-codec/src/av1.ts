import {
  getAvCodec,
  type AvChromaSubsamplingCode,
  type AvProfileName,
} from './media-codecs.js';
import {
  additionalAv1Settings,
  additionalCodecStringFields,
  shouldUseAdditionalFields,
  type PlannedVideoCodecString,
  type VideoCodecBitDepth,
  type VideoCodecChromaSubsampling,
  type VideoCodecPlannerInput,
  type VideoCodecTier,
  type VideoCodecTierPreference,
} from './types.js';

export type Av1ProfileSpec = {
  profile: AvProfileName;
  seqProfile: 0 | 1 | 2;
  bitDepths: VideoCodecBitDepth[];
  chromaSubsamplings: VideoCodecChromaSubsampling[];
  monochrome: boolean;
};

export type Av1LevelSpec = {
  level: string;
  levelIndex: number;
  tier: VideoCodecTier;
  maxPictureSize: number;
  maxHSize: number;
  maxVSize: number;
  maxDisplayRate: number;
  maxDecodeRate: number;
  maxHeaderRate: number;
  maxBitrate: number;
  compressionRatio: number;
  maxTiles: number;
  maxTileCols: number;
};

export const AV1_PROFILES: Av1ProfileSpec[] = [
  { profile: 'Main', seqProfile: 0, bitDepths: [8, 10], chromaSubsamplings: ['400', '420'], monochrome: true },
  { profile: 'High', seqProfile: 1, bitDepths: [8, 10], chromaSubsamplings: ['444'], monochrome: false },
  { profile: 'Professional', seqProfile: 2, bitDepths: [8, 10, 12], chromaSubsamplings: ['400', '420', '422', '444'], monochrome: true },
];

export const AV1_LEVELS: Av1LevelSpec[] = [
  { level: '2.0', levelIndex: 0, tier: 'Main', maxPictureSize: 147_456, maxHSize: 2_048, maxVSize: 1_152, maxDisplayRate: 4_423_680, maxDecodeRate: 5_529_600, maxHeaderRate: 150, maxBitrate: 1_500_000, compressionRatio: 2, maxTiles: 8, maxTileCols: 4 },
  { level: '2.1', levelIndex: 1, tier: 'Main', maxPictureSize: 278_784, maxHSize: 2_816, maxVSize: 1_584, maxDisplayRate: 8_363_520, maxDecodeRate: 10_454_400, maxHeaderRate: 150, maxBitrate: 3_000_000, compressionRatio: 2, maxTiles: 8, maxTileCols: 4 },
  { level: '3.0', levelIndex: 4, tier: 'Main', maxPictureSize: 665_856, maxHSize: 4_352, maxVSize: 2_448, maxDisplayRate: 19_975_680, maxDecodeRate: 24_969_600, maxHeaderRate: 150, maxBitrate: 6_000_000, compressionRatio: 2, maxTiles: 16, maxTileCols: 6 },
  { level: '3.1', levelIndex: 5, tier: 'Main', maxPictureSize: 1_065_024, maxHSize: 5_504, maxVSize: 3_096, maxDisplayRate: 31_950_720, maxDecodeRate: 39_938_400, maxHeaderRate: 150, maxBitrate: 10_000_000, compressionRatio: 2, maxTiles: 16, maxTileCols: 6 },
  { level: '4.0', levelIndex: 8, tier: 'Main', maxPictureSize: 2_359_296, maxHSize: 6_144, maxVSize: 3_456, maxDisplayRate: 70_778_880, maxDecodeRate: 77_856_768, maxHeaderRate: 300, maxBitrate: 12_000_000, compressionRatio: 4, maxTiles: 32, maxTileCols: 8 },
  { level: '4.0', levelIndex: 8, tier: 'High', maxPictureSize: 2_359_296, maxHSize: 6_144, maxVSize: 3_456, maxDisplayRate: 70_778_880, maxDecodeRate: 77_856_768, maxHeaderRate: 300, maxBitrate: 30_000_000, compressionRatio: 4, maxTiles: 32, maxTileCols: 8 },
  { level: '4.1', levelIndex: 9, tier: 'Main', maxPictureSize: 8_912_896, maxHSize: 6_144, maxVSize: 3_456, maxDisplayRate: 141_557_760, maxDecodeRate: 155_713_536, maxHeaderRate: 300, maxBitrate: 20_000_000, compressionRatio: 4, maxTiles: 32, maxTileCols: 8 },
  { level: '4.1', levelIndex: 9, tier: 'High', maxPictureSize: 8_912_896, maxHSize: 6_144, maxVSize: 3_456, maxDisplayRate: 141_557_760, maxDecodeRate: 155_713_536, maxHeaderRate: 300, maxBitrate: 50_000_000, compressionRatio: 4, maxTiles: 32, maxTileCols: 8 },
  { level: '5.0', levelIndex: 12, tier: 'Main', maxPictureSize: 8_912_896, maxHSize: 8_192, maxVSize: 4_352, maxDisplayRate: 267_386_880, maxDecodeRate: 273_715_200, maxHeaderRate: 300, maxBitrate: 30_000_000, compressionRatio: 6, maxTiles: 64, maxTileCols: 8 },
  { level: '5.0', levelIndex: 12, tier: 'High', maxPictureSize: 8_912_896, maxHSize: 8_192, maxVSize: 4_352, maxDisplayRate: 267_386_880, maxDecodeRate: 273_715_200, maxHeaderRate: 300, maxBitrate: 100_000_000, compressionRatio: 4, maxTiles: 64, maxTileCols: 8 },
  { level: '5.1', levelIndex: 13, tier: 'Main', maxPictureSize: 35_651_584, maxHSize: 8_192, maxVSize: 4_352, maxDisplayRate: 534_773_760, maxDecodeRate: 547_430_400, maxHeaderRate: 300, maxBitrate: 40_000_000, compressionRatio: 8, maxTiles: 64, maxTileCols: 8 },
  { level: '5.1', levelIndex: 13, tier: 'High', maxPictureSize: 35_651_584, maxHSize: 8_192, maxVSize: 4_352, maxDisplayRate: 534_773_760, maxDecodeRate: 547_430_400, maxHeaderRate: 300, maxBitrate: 160_000_000, compressionRatio: 4, maxTiles: 64, maxTileCols: 8 },
  { level: '5.2', levelIndex: 14, tier: 'Main', maxPictureSize: 35_651_584, maxHSize: 8_192, maxVSize: 4_352, maxDisplayRate: 1_069_547_520, maxDecodeRate: 1_095_475_200, maxHeaderRate: 300, maxBitrate: 60_000_000, compressionRatio: 8, maxTiles: 64, maxTileCols: 8 },
  { level: '5.2', levelIndex: 14, tier: 'High', maxPictureSize: 35_651_584, maxHSize: 8_192, maxVSize: 4_352, maxDisplayRate: 1_069_547_520, maxDecodeRate: 1_095_475_200, maxHeaderRate: 300, maxBitrate: 240_000_000, compressionRatio: 4, maxTiles: 64, maxTileCols: 8 },
  { level: '5.3', levelIndex: 15, tier: 'Main', maxPictureSize: 35_651_584, maxHSize: 8_192, maxVSize: 4_352, maxDisplayRate: 1_069_547_520, maxDecodeRate: 1_095_475_200, maxHeaderRate: 300, maxBitrate: 60_000_000, compressionRatio: 8, maxTiles: 64, maxTileCols: 8 },
  { level: '5.3', levelIndex: 15, tier: 'High', maxPictureSize: 35_651_584, maxHSize: 8_192, maxVSize: 4_352, maxDisplayRate: 1_069_547_520, maxDecodeRate: 1_095_475_200, maxHeaderRate: 300, maxBitrate: 240_000_000, compressionRatio: 4, maxTiles: 64, maxTileCols: 8 },
  { level: '6.0', levelIndex: 16, tier: 'Main', maxPictureSize: 35_651_584, maxHSize: 16_384, maxVSize: 8_704, maxDisplayRate: 1_069_547_520, maxDecodeRate: 1_176_502_272, maxHeaderRate: 300, maxBitrate: 60_000_000, compressionRatio: 8, maxTiles: 128, maxTileCols: 16 },
  { level: '6.0', levelIndex: 16, tier: 'High', maxPictureSize: 35_651_584, maxHSize: 16_384, maxVSize: 8_704, maxDisplayRate: 1_069_547_520, maxDecodeRate: 1_176_502_272, maxHeaderRate: 300, maxBitrate: 240_000_000, compressionRatio: 4, maxTiles: 128, maxTileCols: 16 },
  { level: '6.1', levelIndex: 17, tier: 'Main', maxPictureSize: 35_651_584, maxHSize: 16_384, maxVSize: 8_704, maxDisplayRate: 2_139_095_040, maxDecodeRate: 2_353_004_544, maxHeaderRate: 300, maxBitrate: 100_000_000, compressionRatio: 8, maxTiles: 128, maxTileCols: 16 },
  { level: '6.1', levelIndex: 17, tier: 'High', maxPictureSize: 35_651_584, maxHSize: 16_384, maxVSize: 8_704, maxDisplayRate: 2_139_095_040, maxDecodeRate: 2_353_004_544, maxHeaderRate: 300, maxBitrate: 480_000_000, compressionRatio: 4, maxTiles: 128, maxTileCols: 16 },
  { level: '6.2', levelIndex: 18, tier: 'Main', maxPictureSize: 35_651_584, maxHSize: 16_384, maxVSize: 8_704, maxDisplayRate: 4_278_190_080, maxDecodeRate: 4_706_009_088, maxHeaderRate: 300, maxBitrate: 160_000_000, compressionRatio: 8, maxTiles: 128, maxTileCols: 16 },
  { level: '6.2', levelIndex: 18, tier: 'High', maxPictureSize: 35_651_584, maxHSize: 16_384, maxVSize: 8_704, maxDisplayRate: 4_278_190_080, maxDecodeRate: 4_706_009_088, maxHeaderRate: 300, maxBitrate: 800_000_000, compressionRatio: 4, maxTiles: 128, maxTileCols: 16 },
  { level: '6.3', levelIndex: 19, tier: 'Main', maxPictureSize: 35_651_584, maxHSize: 16_384, maxVSize: 8_704, maxDisplayRate: 4_278_190_080, maxDecodeRate: 4_706_009_088, maxHeaderRate: 300, maxBitrate: 160_000_000, compressionRatio: 8, maxTiles: 128, maxTileCols: 16 },
  { level: '6.3', levelIndex: 19, tier: 'High', maxPictureSize: 35_651_584, maxHSize: 16_384, maxVSize: 8_704, maxDisplayRate: 4_278_190_080, maxDecodeRate: 4_706_009_088, maxHeaderRate: 300, maxBitrate: 800_000_000, compressionRatio: 4, maxTiles: 128, maxTileCols: 16 },
];

export function planAv1CodecString({
  options,
  behavior,
  width,
  height,
  frameRate,
  preferredAllowingMaxBitrate,
  bitDepth,
  chromaSubsampling,
}: VideoCodecPlannerInput): PlannedVideoCodecString {
  const profile = selectAv1Profile({ bitDepth, chromaSubsampling });
  const level = selectAv1Level({
    width,
    height,
    frameRate,
    preferredAllowingMaxBitrate,
    tileRows: options.tileRows,
    tileCols: options.tileCols,
    profile,
    tier: options.tier,
  });
  return {
    codec: getAvCodec({
      name: 'AV1',
      profile,
      level: level.level,
      tier: level.tier,
      bitDepth,
      monochrome: options.monochrome,
      chromaSubsampling: shouldUseAdditionalFields(options, behavior) ? av1ChromaSubsamplingCode(chromaSubsampling) : undefined,
      ...additionalCodecStringFields(options, behavior),
    }),
    settings: {
      codec: 'av1',
      profile,
      level: level.level,
      tier: level.tier,
      frameRate,
      ...(preferredAllowingMaxBitrate !== undefined ? { preferredAllowingMaxBitrate } : {}),
      ...(options.tileRows !== undefined ? { tileRows: options.tileRows } : {}),
      ...(options.tileCols !== undefined ? { tileCols: options.tileCols } : {}),
      bitDepth,
      chromaSubsampling,
      ...additionalAv1Settings(options),
    },
  };
}

export function selectAv1Level(options: {
  width: number;
  height: number;
  frameRate?: number;
  preferredAllowingMaxBitrate?: number;
  tileRows?: number;
  tileCols?: number;
  profile?: AvProfileName;
  tier?: VideoCodecTierPreference;
}) {
  const pictureSize = options.width * options.height;
  const displayRate = pictureSize * (options.frameRate ?? 30);
  const tileCount = options.tileRows !== undefined && options.tileCols !== undefined
    ? options.tileRows * options.tileCols
    : undefined;
  const candidates = av1LevelCandidates(options.tier);
  return candidates.find((level) => (
    pictureSize <= level.maxPictureSize
    && options.width <= level.maxHSize
    && options.height <= level.maxVSize
    && displayRate <= level.maxDisplayRate
    && (options.preferredAllowingMaxBitrate === undefined || options.preferredAllowingMaxBitrate <= level.maxBitrate)
    && (tileCount === undefined || tileCount <= level.maxTiles)
    && (options.tileCols === undefined || options.tileCols <= level.maxTileCols)
  )) ?? candidates[candidates.length - 1]!;
}

function av1LevelCandidates(tier: VideoCodecTierPreference | undefined) {
  if (tier === undefined || tier === 'auto') return AV1_LEVELS;
  return AV1_LEVELS.filter((level) => level.tier === tier);
}

export function selectAv1Profile(options: {
  bitDepth: VideoCodecBitDepth;
  chromaSubsampling: VideoCodecChromaSubsampling;
}): AvProfileName {
  if (options.chromaSubsampling === '400') return 'Main';
  if ((options.bitDepth === 8 || options.bitDepth === 10) && options.chromaSubsampling === '420') return 'Main';
  if ((options.bitDepth === 8 || options.bitDepth === 10) && options.chromaSubsampling === '444') return 'High';
  return 'Professional';
}

function av1ChromaSubsamplingCode(chromaSubsampling: VideoCodecChromaSubsampling): AvChromaSubsamplingCode {
  switch (chromaSubsampling) {
    case '400':
      return '111';
    case '420':
      return '110';
    case '422':
      return '100';
    case '444':
      return '000';
  }
}
