export type VideoCodecName = 'avc' | 'hevc' | 'vp8' | 'vp9' | 'av1';

export type VideoCodecBitDepth = 8 | 10 | 12;

export type VideoCodecChromaSubsampling = '400' | '420' | '422' | '444';

export type VideoCodecTier = 'Main' | 'High';

export type VideoCodecTierPreference = VideoCodecTier | 'auto';

/** Numeric CICP tuple in the order [primaries, transfer, matrix, fullRange]. */
export type NumericCicpColorSpace = [
  primaries: number,
  transfer: number,
  matrix: number,
  fullRange: boolean,
];

export type BuildVideoCodecStringOptions = {
  codec: VideoCodecName;
  width: number;
  height: number;
  /** Frames per second used for level/sample-rate selection. Defaults to 30. */
  frameRate?: number;
  /** Preferred bitrate that the selected level and tier should be able to allow. */
  preferredAllowingMaxBitrate?: number;
  /** Explicit AV1 tile row constraint, if the encoder configuration controls it. */
  tileRows?: number;
  /** Explicit AV1 tile column constraint, if the encoder configuration controls it. */
  tileCols?: number;
  bitDepth?: VideoCodecBitDepth;
  chromaSubsampling?: VideoCodecChromaSubsampling;
  /** AV1/HEVC tier selection policy. Defaults to auto. */
  tier?: VideoCodecTierPreference;
  monochrome?: boolean;
  /** Numeric CICP tuple matching @browser-mc/media-container's numeric CICP shape. */
  cicp?: NumericCicpColorSpace;
};

export type VideoCodecStringBehaviorOptions = {
  style?: 'auto' | 'short' | 'full';
};

export type PlannedVideoCodecString = {
  codec: string;
  settings: {
    codec: VideoCodecName;
    profile: string | number;
    level: string;
    tier?: VideoCodecTier;
    frameRate?: number;
    preferredAllowingMaxBitrate?: number;
    tileRows?: number;
    tileCols?: number;
    bitDepth?: VideoCodecBitDepth;
    chromaSubsampling?: VideoCodecChromaSubsampling;
    monochrome?: boolean;
    cicp?: NumericCicpColorSpace;
  };
};

export type ParsedVideoCodecString = {
  codec: string;
  settings: {
    codec: VideoCodecName;
    profile?: string | number;
    level?: string;
    tier?: VideoCodecTier;
    bitDepth?: VideoCodecBitDepth;
    chromaSubsampling?: VideoCodecChromaSubsampling;
    monochrome?: boolean;
    cicp?: NumericCicpColorSpace;
  };
};

export type VideoCodecPlannerInput = {
  options: BuildVideoCodecStringOptions;
  behavior: VideoCodecStringBehaviorOptions;
  width: number;
  height: number;
  frameRate: number;
  preferredAllowingMaxBitrate?: number;
  bitDepth: VideoCodecBitDepth;
  chromaSubsampling: VideoCodecChromaSubsampling;
};

export function validatePositiveInteger(value: number, name: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
  return value;
}

export function validatePositiveNumber(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number.`);
  }
  return value;
}

export function shouldUseAdditionalFields(options: BuildVideoCodecStringOptions, behavior: VideoCodecStringBehaviorOptions) {
  if (behavior.style === 'short') return false;
  if (behavior.style === 'full') return true;
  return options.monochrome !== undefined
    || options.cicp !== undefined;
}

export function additionalAv1Settings(options: BuildVideoCodecStringOptions) {
  return {
    ...(options.monochrome !== undefined ? { monochrome: options.monochrome } : {}),
    ...additionalColorSettings(options),
  };
}

export function additionalColorSettings(options: BuildVideoCodecStringOptions) {
  if (options.cicp !== undefined) {
    return {
      cicp: options.cicp,
    };
  }
  return {};
}

export function additionalCodecStringFields(options: BuildVideoCodecStringOptions, behavior: VideoCodecStringBehaviorOptions) {
  return shouldUseAdditionalFields(options, behavior) ? additionalColorSettings(options) : {};
}
