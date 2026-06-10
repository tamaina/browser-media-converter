/*
 * Portions adapted from media-codecs.
 *
 * Copyright (C) 2023 Damien Seguin
 * Licensed under the MIT License.
 */

export type AvProfileName = 'Main' | 'High' | 'Professional';
export type AvTierName = 'Main' | 'High';
export type AvcProfileName =
  | 'Constrained Baseline'
  | 'Baseline'
  | 'Extended'
  | 'Main'
  | 'High'
  | 'Progressive High'
  | 'Constrained High'
  | 'High 10'
  | 'High 4:2:2'
  | 'High 4:4:4 Predictive'
  | 'High 10 Intra'
  | 'High 4:2:2 Intra'
  | 'High 4:4:4 Intra'
  | 'CAVLC 4:4:4 Intra';
export type HevcProfileName = 'Main' | 'Main 10' | 'Main Still Picture' | 'Range Extensions';
export type AvChromaSubsamplingCode = '000' | '100' | '110' | '111';
export type VpChromaSubsamplingCode = '01' | '02' | '03' | '04';
export type NumericCicpColorSpace = [
  primaries: number,
  transfer: number,
  matrix: number,
  fullRange: boolean,
];

type AvProfile = {
  name: AvProfileName;
  P: `${number}`;
};

type VcProfile = {
  name: string;
  PP: string;
  CC?: string;
};

const avProfiles: AvProfile[] = [
  { name: 'Main', P: '0' },
  { name: 'High', P: '1' },
  { name: 'Professional', P: '2' },
];

const avLevels = [
  '2.0', '2.1', '2.2', '2.3',
  '3.0', '3.1', '3.2', '3.3',
  '4.0', '4.1', '4.2', '4.3',
  '5.0', '5.1', '5.2', '5.3',
  '6.0', '6.1', '6.2', '6.3',
  '7.0', '7.1', '7.2', '7.3',
] as const;

const avcProfiles: Array<VcProfile & { name: AvcProfileName }> = [
  { name: 'Constrained Baseline', PP: '42', CC: '40' },
  { name: 'Baseline', PP: '42', CC: '00' },
  { name: 'Extended', PP: '58', CC: '00' },
  { name: 'Main', PP: '4d', CC: '00' },
  { name: 'High', PP: '64', CC: '00' },
  { name: 'Progressive High', PP: '64', CC: '08' },
  { name: 'Constrained High', PP: '64', CC: '0c' },
  { name: 'High 10', PP: '6e', CC: '00' },
  { name: 'High 4:2:2', PP: '7a', CC: '00' },
  { name: 'High 4:4:4 Predictive', PP: 'f4', CC: '00' },
  { name: 'High 10 Intra', PP: '6e', CC: '10' },
  { name: 'High 4:2:2 Intra', PP: '7a', CC: '10' },
  { name: 'High 4:4:4 Intra', PP: 'f4', CC: '10' },
  { name: 'CAVLC 4:4:4 Intra', PP: '44', CC: '00' },
];

const avcLevels = [
  '1', '1.1', '1.2', '1.3',
  '2', '2.1', '2.2',
  '3', '3.1', '3.2',
  '4', '4.1', '4.2',
  '5', '5.1', '5.2',
  '6', '6.1', '6.2',
] as const;

const hevcProfiles: Array<VcProfile & { name: HevcProfileName }> = [
  { name: 'Main', PP: '1' },
  { name: 'Main 10', PP: '2' },
  { name: 'Main Still Picture', PP: '3' },
  { name: 'Range Extensions', PP: '4' },
];

const hevcLevels = [
  '1',
  '2', '2.1',
  '3', '3.1',
  '4', '4.1',
  '5', '5.1', '5.2',
  '6', '6.1', '6.2',
] as const;

const vpLevels = [
  '1', '1.1',
  '2', '2.1',
  '3', '3.1',
  '4', '4.1',
  '5', '5.1', '5.2',
  '6', '6.1', '6.2',
] as const;

export function getAvCodec(options: {
  name: 'AV1';
  profile: AvProfileName;
  level: string;
  tier: AvTierName;
  bitDepth: 8 | 10 | 12;
  monochrome?: boolean;
  chromaSubsampling?: AvChromaSubsamplingCode;
  cicp?: NumericCicpColorSpace;
}) {
  if (options.name !== 'AV1') throw new Error(`Unknown AV Codec "${options.name}"`);
  const profile = avProfiles.find((item) => item.name === options.profile);
  if (!profile) throw new Error(`Unknown AV Profile "${options.profile}"`);
  if (!stringIncludes(avLevels, options.level)) throw new Error(`Unknown AV Level "${options.level}"`);
  if (options.tier !== 'Main' && options.tier !== 'High') throw new Error(`Unknown AV Tier "${options.tier}"`);
  if (options.bitDepth !== 8 && options.bitDepth !== 10 && options.bitDepth !== 12) {
    throw new Error(`Unknown AV BitDepth "${options.bitDepth}"`);
  }
  const base = `av01.${profile.P}.${formatAvLevel(options.level)}${options.tier.at(0)}.${formatBitDepth(options.bitDepth)}`;
  if (
    options.monochrome === undefined
    && options.chromaSubsampling === undefined
    && options.cicp === undefined
  ) {
    return base;
  }

  const colorPrimaries = options.cicp?.[0] ?? 1;
  const transferCharacteristics = options.cicp?.[1] ?? 1;
  const matrixCoefficients = options.cicp?.[2] ?? 1;
  const videoFullRangeFlag = options.cicp?.[3] ?? false;
  return `${base}.${options.monochrome ? 1 : 0}.${options.chromaSubsampling ?? '110'}.${formatFixedNumber(colorPrimaries, 2)}.${formatFixedNumber(transferCharacteristics, 2)}.${formatFixedNumber(matrixCoefficients, 2)}.${videoFullRangeFlag ? 1 : 0}`;
}

export function getAvcCodec(options: {
  profile: AvcProfileName;
  level: string;
}) {
  if (!stringIncludes(avcLevels, options.level)) throw new Error(`Unknown AVC Level "${options.level}"`);
  const profile = avcProfiles.find((item) => item.name === options.profile);
  if (!profile) throw new Error(`Unknown AVC Profile "${options.profile}"`);
  return `avc1.${profile.PP}${profile.CC}${formatAvcLevel(options.level)}`;
}

export function getVpCodec(options: {
  name: 'VP8' | 'VP9';
  profile: 0 | 1 | 2 | 3;
  level: string;
  bitDepth: 8 | 10 | 12;
  chromaSubsampling?: VpChromaSubsamplingCode;
  cicp?: NumericCicpColorSpace;
}) {
  const cccc = options.name === 'VP8' ? 'vp08' : options.name === 'VP9' ? 'vp09' : null;
  if (!cccc) throw new Error(`Unknown VP Codec "${options.name}"`);
  if (![0, 1, 2, 3].includes(options.profile)) throw new Error(`Unknown VP Profile "${options.profile}"`);
  if (!stringIncludes(vpLevels, options.level)) throw new Error(`Unknown VP Level "${options.level}"`);
  if (options.bitDepth !== 8 && options.bitDepth !== 10 && options.bitDepth !== 12) {
    throw new Error(`Unknown VP BitDepth "${options.bitDepth}"`);
  }
  const base = `${cccc}.${formatFixedNumber(options.profile, 2)}.${formatVpLevel(options.level)}.${formatBitDepth(options.bitDepth)}`;
  if (
    options.chromaSubsampling === undefined
    && options.cicp === undefined
  ) {
    return base;
  }

  const colorPrimaries = options.cicp?.[0] ?? 1;
  const transferCharacteristics = options.cicp?.[1] ?? 1;
  const matrixCoefficients = options.cicp?.[2] ?? 1;
  const videoFullRangeFlag = options.cicp?.[3] ?? false;
  return `${base}.${formatFixedNumber(colorPrimaries, 2)}.${formatFixedNumber(transferCharacteristics, 2)}.${formatFixedNumber(matrixCoefficients, 2)}.${options.chromaSubsampling ?? '01'}.${videoFullRangeFlag ? '01' : '00'}`;
}

export function getHevcProfile(profile: HevcProfileName) {
  const found = hevcProfiles.find((item) => item.name === profile);
  if (!found) throw new Error(`Unknown HEVC profile "${profile}"`);
  return found;
}

export function getHevcCodec(options: {
  sampleEntry?: 'hev1' | 'hvc1';
  profile: HevcProfileName;
  compatibility: string;
  level: string;
  tier: AvTierName;
  constraint?: string;
}) {
  if (!stringIncludes(hevcLevels, options.level)) throw new Error(`Unknown HEVC Level "${options.level}"`);
  const profile = getHevcProfile(options.profile);
  const tier = options.tier === 'Main' ? 'L' : options.tier === 'High' ? 'H' : null;
  if (!tier) throw new Error(`Unknown HEVC Tier "${options.tier}"`);
  return formatHevcCodec(
    options.sampleEntry ?? 'hev1',
    profile,
    options.compatibility,
    tier,
    formatHevcLevel(options.level),
    options.constraint ?? 'B0',
  );
}

function formatHevcCodec(cccc: string, { PP }: VcProfile, compatibility: string, tier: 'L' | 'H', level: string, constraint: string) {
  return `${cccc}.${PP}.${compatibility}.${tier}${level}.${constraint}`;
}

function formatAvLevel(level: string) {
  const [major, minor] = level.split('.');
  return String((Number(major) - 2) * 4 + Number(minor)).padStart(2, '0');
}

function formatAvcLevel(level: string) {
  return (Number.parseFloat(level) * 10).toString(16).padStart(2, '0');
}

function formatHevcLevel(level: string) {
  return String(Number.parseFloat(level) * 10 * 3);
}

function formatVpLevel(level: string) {
  return String(Number.parseFloat(level) * 10).padStart(2, '0');
}

function formatBitDepth(bitDepth: number) {
  return String(bitDepth).padStart(2, '0');
}

function formatFixedNumber(value: number, width: number) {
  return String(value).padStart(width, '0');
}

function stringIncludes<const T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value as T[number]);
}
