import { planAv1CodecString } from './av1.js';
import { planAvcCodecString } from './avc.js';
import { planHevcCodecString } from './hevc.js';
import {
  validatePositiveNumber,
  validatePositiveInteger,
  type BuildVideoCodecStringOptions,
  type PlannedVideoCodecString,
  type VideoCodecPlannerInput,
  type VideoCodecStringBehaviorOptions,
} from './types.js';
import { planVp9CodecString } from './vp9.js';
export {
  inspectVideoCodecString,
  parseVideoCodecString,
} from './parse.js';

export type {
  BuildVideoCodecStringOptions,
  NumericCicpColorSpace,
  ParsedVideoCodecString,
  PlannedVideoCodecString,
  VideoCodecBitDepth,
  VideoCodecChromaSubsampling,
  VideoCodecName,
  VideoCodecPlannerInput,
  VideoCodecStringBehaviorOptions,
  VideoCodecTier,
  VideoCodecTierPreference,
} from './types.js';

export {
  AV1_LEVELS,
  AV1_PROFILES,
  planAv1CodecString,
  selectAv1Level,
  selectAv1Profile,
  type Av1LevelSpec,
  type Av1ProfileSpec,
} from './av1.js';
export {
  AVC_LEVELS,
  AVC_PROFILES,
  planAvcCodecString,
  selectAvcLevel,
  selectAvcProfile,
  type AvcLevelSpec,
  type AvcProfileSpec,
} from './avc.js';
export {
  HEVC_LEVELS,
  HEVC_PROFILES,
  planHevcCodecString,
  selectHevcLevel,
  selectHevcProfile,
  type HevcLevelSpec,
  type HevcProfileSpec,
} from './hevc.js';
export {
  VP9_LEVELS,
  VP9_PROFILES,
  planVp9CodecString,
  selectVp9Level,
  selectVp9Profile,
  type Vp9LevelSpec,
  type Vp9ProfileSpec,
} from './vp9.js';

export function planVideoCodecString(
  options: BuildVideoCodecStringOptions,
  behavior: VideoCodecStringBehaviorOptions = {},
): PlannedVideoCodecString {
  const width = validatePositiveInteger(options.width, 'width');
  const height = validatePositiveInteger(options.height, 'height');
  const frameRate = validatePositiveNumber(options.frameRate ?? 30, 'frameRate');
  const preferredAllowingMaxBitrate = options.preferredAllowingMaxBitrate === undefined
    ? undefined
    : validatePositiveInteger(options.preferredAllowingMaxBitrate, 'preferredAllowingMaxBitrate');
  if (options.tileRows !== undefined) validatePositiveInteger(options.tileRows, 'tileRows');
  if (options.tileCols !== undefined) validatePositiveInteger(options.tileCols, 'tileCols');
  const bitDepth = options.bitDepth ?? 8;
  const chromaSubsampling = options.chromaSubsampling ?? '420';
  const plannerInput: VideoCodecPlannerInput = {
    options,
    behavior,
    width,
    height,
    frameRate,
    preferredAllowingMaxBitrate,
    bitDepth,
    chromaSubsampling,
  };

  switch (options.codec) {
    case 'avc':
      return planAvcCodecString(plannerInput);
    case 'hevc':
      return planHevcCodecString(plannerInput);
    case 'vp8':
      return {
        codec: 'vp8',
        settings: { codec: 'vp8', profile: 0, level: '0', bitDepth: 8, chromaSubsampling: '420' },
      };
    case 'vp9':
      return planVp9CodecString(plannerInput);
    case 'av1':
      return planAv1CodecString(plannerInput);
  }
}

export function buildVideoCodecString(
  options: BuildVideoCodecStringOptions,
  behavior: VideoCodecStringBehaviorOptions = {},
) {
  return planVideoCodecString(options, behavior).codec;
}
