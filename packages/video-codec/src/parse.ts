import {
  AVC_LEVELS,
  AVC_PROFILES,
} from './avc.js';
import {
  AV1_LEVELS,
  AV1_PROFILES,
} from './av1.js';
import {
  HEVC_LEVELS,
  HEVC_PROFILES,
} from './hevc.js';
import {
  VP9_LEVELS,
  VP9_PROFILES,
} from './vp9.js';
import {
  type NumericCicpColorSpace,
  type ParsedVideoCodecString,
  type VideoCodecBitDepth,
  type VideoCodecChromaSubsampling,
  type VideoCodecTier,
} from './types.js';

export function parseVideoCodecString(codecString: string): ParsedVideoCodecString | null {
  const codec = codecString.trim();
  if (codec === 'vp8' || codec === 'vp08') return parseVp8CodecString(codec);
  if (codec.startsWith('av01.')) return parseAv1CodecString(codec);
  if (codec.startsWith('vp09.')) return parseVp9CodecString(codec);
  if (codec.startsWith('avc1.') || codec.startsWith('avc3.')) return parseAvcCodecString(codec);
  if (codec.startsWith('hev1.') || codec.startsWith('hvc1.')) return parseHevcCodecString(codec);
  return null;
}

export function inspectVideoCodecString(codecString: string): ParsedVideoCodecString | null {
  return parseVideoCodecString(codecString);
}

function parseVp8CodecString(codec: string): ParsedVideoCodecString {
  return {
    codec,
    settings: {
      codec: 'vp8',
      profile: 0,
      bitDepth: 8,
      chromaSubsampling: '420',
    },
  };
}

function parseAv1CodecString(codec: string): ParsedVideoCodecString | null {
  const parts = codec.split('.');
  if (parts.length !== 4 && parts.length !== 10) return null;
  const seqProfile = parseInteger(parts[1]);
  const levelAndTier = parts[2];
  const bitDepth = parseBitDepth(parts[3]);
  if (seqProfile === null || !/^\d{2}[MH]$/u.test(levelAndTier) || bitDepth === null) return null;

  const profile = AV1_PROFILES.find((item) => item.seqProfile === seqProfile);
  const levelIndex = Number(levelAndTier.slice(0, 2));
  const tier = parseTierLetter(levelAndTier.slice(2));
  const level = AV1_LEVELS.find((item) => item.levelIndex === levelIndex && item.tier === tier)
    ?? AV1_LEVELS.find((item) => item.levelIndex === levelIndex);
  if (!profile || !tier || !level) return null;

  const monochrome = parts[4] === undefined ? undefined : parts[4] === '1';
  const chromaSubsampling = parts[5] === undefined
    ? defaultAv1ChromaSubsampling(profile.seqProfile, monochrome)
    : parseAv1ChromaSubsampling(parts[5]);
  const cicp = parseOptionalCicp(parts[6], parts[7], parts[8], parts[9]);
  if (chromaSubsampling === null || cicp === null) return null;

  return {
    codec,
    settings: {
      codec: 'av1',
      profile: profile.profile,
      level: level.level,
      tier,
      bitDepth,
      chromaSubsampling,
      ...(monochrome !== undefined ? { monochrome } : {}),
      ...(cicp !== undefined ? { cicp } : {}),
    },
  };
}

function parseVp9CodecString(codec: string): ParsedVideoCodecString | null {
  const parts = codec.split('.');
  if (parts.length !== 4 && parts.length !== 9) return null;
  const profile = parseInteger(parts[1]);
  const levelCode = parseInteger(parts[2]);
  const bitDepth = parseBitDepth(parts[3]);
  if (!isVp9Profile(profile) || levelCode === null || bitDepth === null) return null;

  const level = VP9_LEVELS.find((item) => item.levelCode === levelCode);
  const profileSpec = VP9_PROFILES.find((item) => item.profile === profile);
  if (!level || !profileSpec) return null;

  const chromaSubsampling = parts[7] === undefined
    ? defaultVp9ChromaSubsampling(profile)
    : parseVp9ChromaSubsampling(parts[7]);
  const cicp = parseOptionalCicp(parts[4], parts[5], parts[6], parts[8]);
  if (chromaSubsampling === null || cicp === null) return null;

  return {
    codec,
    settings: {
      codec: 'vp9',
      profile,
      level: level.level,
      bitDepth,
      chromaSubsampling,
      ...(cicp !== undefined ? { cicp } : {}),
    },
  };
}

function parseAvcCodecString(codec: string): ParsedVideoCodecString | null {
  const match = /^(avc1|avc3)\.([0-9a-fA-F]{6})$/u.exec(codec);
  if (!match) return null;
  const profileIdc = Number.parseInt(match[2]!.slice(0, 2), 16);
  const constraintSetFlags = Number.parseInt(match[2]!.slice(2, 4), 16);
  const levelIdc = Number.parseInt(match[2]!.slice(4, 6), 16);
  const profile = AVC_PROFILES.find((item) => (
    item.profileIdc === profileIdc
    && item.constraintSetFlags === constraintSetFlags
  )) ?? AVC_PROFILES.find((item) => item.profileIdc === profileIdc);
  const level = AVC_LEVELS.find((item) => item.levelIdc === levelIdc);
  if (!profile || !level) return null;

  return {
    codec,
    settings: {
      codec: 'avc',
      profile: profile.profile,
      level: level.level,
      bitDepth: highestSupportedBitDepth(profile.bitDepths),
      chromaSubsampling: highestSupportedChromaSubsampling(profile.chromaSubsamplings),
    },
  };
}

function parseHevcCodecString(codec: string): ParsedVideoCodecString | null {
  const parts = codec.split('.');
  if (parts.length < 5) return null;
  if (parts[0] !== 'hev1' && parts[0] !== 'hvc1') return null;
  const profileIdc = parseInteger(parts[1]);
  const tierAndLevel = parts[3];
  if (profileIdc === null || !tierAndLevel || !/^[LH]\d+$/u.test(tierAndLevel)) return null;

  const profile = HEVC_PROFILES.find((item) => item.profileIdc === profileIdc);
  const tier = parseHevcTier(tierAndLevel[0]);
  const levelIdc = Number(tierAndLevel.slice(1));
  const level = HEVC_LEVELS.find((item) => item.levelIdc === levelIdc && item.tier === tier)
    ?? HEVC_LEVELS.find((item) => item.levelIdc === levelIdc);
  if (!profile || !tier || !level) return null;

  return {
    codec,
    settings: {
      codec: 'hevc',
      profile: profile.profile,
      level: level.level,
      tier,
      bitDepth: highestSupportedBitDepth(profile.bitDepths),
      chromaSubsampling: highestSupportedChromaSubsampling(profile.chromaSubsamplings),
    },
  };
}

function parseInteger(value: string | undefined) {
  if (value === undefined || !/^\d+$/u.test(value)) return null;
  return Number(value);
}

function parseBitDepth(value: string | undefined): VideoCodecBitDepth | null {
  const bitDepth = parseInteger(value);
  return bitDepth === 8 || bitDepth === 10 || bitDepth === 12 ? bitDepth : null;
}

function parseTierLetter(value: string): VideoCodecTier | null {
  return value === 'M' ? 'Main' : value === 'H' ? 'High' : null;
}

function parseHevcTier(value: string | undefined): VideoCodecTier | null {
  return value === 'L' ? 'Main' : value === 'H' ? 'High' : null;
}

function parseOptionalCicp(
  primaries: string | undefined,
  transfer: string | undefined,
  matrix: string | undefined,
  fullRange: string | undefined,
): NumericCicpColorSpace | undefined | null {
  if (primaries === undefined && transfer === undefined && matrix === undefined && fullRange === undefined) return undefined;
  const parsedPrimaries = parseInteger(primaries);
  const parsedTransfer = parseInteger(transfer);
  const parsedMatrix = parseInteger(matrix);
  if (parsedPrimaries === null || parsedTransfer === null || parsedMatrix === null) return null;
  if (fullRange !== '0' && fullRange !== '1' && fullRange !== '00' && fullRange !== '01') return null;
  return [parsedPrimaries, parsedTransfer, parsedMatrix, fullRange === '1' || fullRange === '01'];
}

function parseAv1ChromaSubsampling(value: string): VideoCodecChromaSubsampling | null {
  switch (value) {
    case '111':
      return '400';
    case '110':
      return '420';
    case '100':
      return '422';
    case '000':
      return '444';
    default:
      return null;
  }
}

function defaultAv1ChromaSubsampling(seqProfile: number, monochrome: boolean | undefined): VideoCodecChromaSubsampling {
  if (monochrome) return '400';
  return seqProfile === 1 ? '444' : '420';
}

function parseVp9ChromaSubsampling(value: string): VideoCodecChromaSubsampling | null {
  switch (value) {
    case '01':
      return '420';
    case '02':
      return '422';
    case '03':
      return '444';
    case '04':
      return '400';
    default:
      return null;
  }
}

function defaultVp9ChromaSubsampling(profile: 0 | 1 | 2 | 3): VideoCodecChromaSubsampling {
  return profile === 1 || profile === 3 ? '444' : '420';
}

function isVp9Profile(value: number | null): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function highestSupportedBitDepth(bitDepths: VideoCodecBitDepth[]) {
  return bitDepths[bitDepths.length - 1]!;
}

function highestSupportedChromaSubsampling(chromaSubsamplings: VideoCodecChromaSubsampling[]) {
  return chromaSubsamplings[chromaSubsamplings.length - 1]!;
}
