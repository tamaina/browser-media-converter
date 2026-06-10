export type CicpColorPrimaries =
  | 'bt709'
  | 'unspecified'
  | 'bt470m'
  | 'bt470bg'
  | 'smpte170m'
  | 'smpte240m'
  | 'film'
  | 'bt2020'
  | 'xyz'
  | 'smpte431'
  | 'smpte432'
  | 'ebu3213'
  | `unknown-${number}`;

export type CicpTransferCharacteristics =
  | 'bt709'
  | 'unspecified'
  | 'gamma22'
  | 'gamma28'
  | 'smpte170m'
  | 'smpte240m'
  | 'linear'
  | 'log100'
  | 'log100-sqrt10'
  | 'iec61966-2-4'
  | 'bt1361'
  | 'iec61966-2-1'
  | 'bt2020-10'
  | 'bt2020-12'
  | 'pq'
  | 'smpte428'
  | 'hlg'
  | `unknown-${number}`;

export type CicpMatrixCoefficients =
  | 'rgb'
  | 'bt709'
  | 'unspecified'
  | 'fcc'
  | 'bt470bg'
  | 'smpte170m'
  | 'smpte240m'
  | 'ycgco'
  | 'bt2020-ncl'
  | 'bt2020-cl'
  | 'smpte2085'
  | 'chroma-derived-ncl'
  | 'chroma-derived-cl'
  | 'ictcp'
  | `unknown-${number}`;

export type CicpColorSpace = {
  primaries: CicpColorPrimaries;
  transfer: CicpTransferCharacteristics;
  matrix: CicpMatrixCoefficients;
  fullRange: boolean;
};

export type NumericCicpColorSpace = [
  primaries: number,
  transfer: number,
  matrix: number,
  fullRange: boolean,
];

export function cicpToVideoColorSpace(cicp: CicpColorSpace): VideoColorSpaceInit {
  return {
    primaries: cicpColorPrimariesToVideoColorPrimaries(cicp.primaries),
    transfer: cicpTransferCharacteristicsToVideoTransferCharacteristics(cicp.transfer),
    matrix: cicpMatrixCoefficientsToVideoMatrixCoefficients(cicp.matrix),
    fullRange: cicp.fullRange,
  };
}

export function videoColorSpaceToCicp(colorSpace: VideoColorSpaceInit): Partial<CicpColorSpace> | null {
  const primaries = videoColorPrimariesToCicp(colorSpace.primaries);
  const transfer = videoTransferCharacteristicsToCicp(colorSpace.transfer);
  const matrix = videoMatrixCoefficientsToCicp(colorSpace.matrix);
  const fullRange = colorSpace.fullRange ?? undefined;
  if (primaries === undefined && transfer === undefined && matrix === undefined && fullRange === undefined) return null;
  return { primaries, transfer, matrix, fullRange };
}

export function cicpColorSpaceFromNumbers(value: NumericCicpColorSpace): CicpColorSpace {
  return {
    primaries: cicpColorPrimariesFromNumber(value[0]),
    transfer: cicpTransferCharacteristicsFromNumber(value[1]),
    matrix: cicpMatrixCoefficientsFromNumber(value[2]),
    fullRange: value[3],
  };
}

export function cicpColorSpaceToNumbers(value: CicpColorSpace): NumericCicpColorSpace {
  return [
    cicpColorPrimariesToNumber(value.primaries),
    cicpTransferCharacteristicsToNumber(value.transfer),
    cicpMatrixCoefficientsToNumber(value.matrix),
    value.fullRange,
  ];
}

export function cicpColorPrimariesFromNumber(value: number): CicpColorPrimaries {
  switch (value) {
    case 1: return 'bt709';
    case 2: return 'unspecified';
    case 4: return 'bt470m';
    case 5: return 'bt470bg';
    case 6: return 'smpte170m';
    case 7: return 'smpte240m';
    case 8: return 'film';
    case 9: return 'bt2020';
    case 10: return 'xyz';
    case 11: return 'smpte431';
    case 12: return 'smpte432';
    case 22: return 'ebu3213';
    default: return `unknown-${value}`;
  }
}

export function cicpTransferCharacteristicsFromNumber(value: number): CicpTransferCharacteristics {
  switch (value) {
    case 1: return 'bt709';
    case 2: return 'unspecified';
    case 4: return 'gamma22';
    case 5: return 'gamma28';
    case 6: return 'smpte170m';
    case 7: return 'smpte240m';
    case 8: return 'linear';
    case 9: return 'log100';
    case 10: return 'log100-sqrt10';
    case 11: return 'iec61966-2-4';
    case 12: return 'bt1361';
    case 13: return 'iec61966-2-1';
    case 14: return 'bt2020-10';
    case 15: return 'bt2020-12';
    case 16: return 'pq';
    case 17: return 'smpte428';
    case 18: return 'hlg';
    default: return `unknown-${value}`;
  }
}

export function cicpMatrixCoefficientsFromNumber(value: number): CicpMatrixCoefficients {
  switch (value) {
    case 0: return 'rgb';
    case 1: return 'bt709';
    case 2: return 'unspecified';
    case 4: return 'fcc';
    case 5: return 'bt470bg';
    case 6: return 'smpte170m';
    case 7: return 'smpte240m';
    case 8: return 'ycgco';
    case 9: return 'bt2020-ncl';
    case 10: return 'bt2020-cl';
    case 11: return 'smpte2085';
    case 12: return 'chroma-derived-ncl';
    case 13: return 'chroma-derived-cl';
    case 14: return 'ictcp';
    default: return `unknown-${value}`;
  }
}

export function cicpColorPrimariesToNumber(value: CicpColorPrimaries): number {
  switch (value) {
    case 'bt709': return 1;
    case 'unspecified': return 2;
    case 'bt470m': return 4;
    case 'bt470bg': return 5;
    case 'smpte170m': return 6;
    case 'smpte240m': return 7;
    case 'film': return 8;
    case 'bt2020': return 9;
    case 'xyz': return 10;
    case 'smpte431': return 11;
    case 'smpte432': return 12;
    case 'ebu3213': return 22;
    default: return unknownCicpNumber(value);
  }
}

export function cicpTransferCharacteristicsToNumber(value: CicpTransferCharacteristics): number {
  switch (value) {
    case 'bt709': return 1;
    case 'unspecified': return 2;
    case 'gamma22': return 4;
    case 'gamma28': return 5;
    case 'smpte170m': return 6;
    case 'smpte240m': return 7;
    case 'linear': return 8;
    case 'log100': return 9;
    case 'log100-sqrt10': return 10;
    case 'iec61966-2-4': return 11;
    case 'bt1361': return 12;
    case 'iec61966-2-1': return 13;
    case 'bt2020-10': return 14;
    case 'bt2020-12': return 15;
    case 'pq': return 16;
    case 'smpte428': return 17;
    case 'hlg': return 18;
    default: return unknownCicpNumber(value);
  }
}

export function cicpMatrixCoefficientsToNumber(value: CicpMatrixCoefficients): number {
  switch (value) {
    case 'rgb': return 0;
    case 'bt709': return 1;
    case 'unspecified': return 2;
    case 'fcc': return 4;
    case 'bt470bg': return 5;
    case 'smpte170m': return 6;
    case 'smpte240m': return 7;
    case 'ycgco': return 8;
    case 'bt2020-ncl': return 9;
    case 'bt2020-cl': return 10;
    case 'smpte2085': return 11;
    case 'chroma-derived-ncl': return 12;
    case 'chroma-derived-cl': return 13;
    case 'ictcp': return 14;
    default: return unknownCicpNumber(value);
  }
}

export function videoColorPrimariesToCicp(value: VideoColorPrimaries | null | undefined): CicpColorPrimaries | undefined {
  switch (String(value ?? '')) {
    case 'bt709': return 'bt709';
    case 'bt470bg': return 'bt470bg';
    case 'smpte170m': return 'smpte170m';
    case 'bt2020': return 'bt2020';
    case 'smpte432': return 'smpte432';
    default: return undefined;
  }
}

export function videoTransferCharacteristicsToCicp(value: VideoTransferCharacteristics | null | undefined): CicpTransferCharacteristics | undefined {
  switch (String(value ?? '')) {
    case 'bt709': return 'bt709';
    case 'smpte170m': return 'smpte170m';
    case 'iec61966-2-1': return 'iec61966-2-1';
    case 'pq':
    case 'smpte2084': return 'pq';
    case 'hlg':
    case 'arib-std-b67': return 'hlg';
    default: return undefined;
  }
}

export function videoMatrixCoefficientsToCicp(value: VideoMatrixCoefficients | null | undefined): CicpMatrixCoefficients | undefined {
  switch (String(value ?? '')) {
    case 'rgb': return 'rgb';
    case 'bt709': return 'bt709';
    case 'smpte170m': return 'smpte170m';
    case 'bt2020-ncl': return 'bt2020-ncl';
    default: return undefined;
  }
}

export function cicpColorPrimariesToVideoColorPrimaries(value: CicpColorPrimaries): VideoColorPrimaries | undefined {
  switch (value) {
    case 'bt709': return 'bt709';
    case 'bt470bg': return 'bt470bg';
    case 'smpte170m': return 'smpte170m';
    case 'bt2020': return 'bt2020' as VideoColorPrimaries;
    case 'smpte432': return 'smpte432' as VideoColorPrimaries;
    default: return undefined;
  }
}

export function cicpTransferCharacteristicsToVideoTransferCharacteristics(value: CicpTransferCharacteristics): VideoTransferCharacteristics | undefined {
  switch (value) {
    case 'bt709': return 'bt709';
    case 'smpte170m': return 'smpte170m';
    case 'iec61966-2-1': return 'iec61966-2-1';
    case 'pq': return 'pq' as VideoTransferCharacteristics;
    case 'hlg': return 'hlg' as VideoTransferCharacteristics;
    default: return undefined;
  }
}

export function cicpMatrixCoefficientsToVideoMatrixCoefficients(value: CicpMatrixCoefficients): VideoMatrixCoefficients | undefined {
  switch (value) {
    case 'rgb': return 'rgb';
    case 'bt709': return 'bt709';
    case 'smpte170m': return 'smpte170m';
    case 'bt2020-ncl': return 'bt2020-ncl' as VideoMatrixCoefficients;
    default: return undefined;
  }
}

function unknownCicpNumber(value: `unknown-${number}`) {
  return Number(value.slice('unknown-'.length));
}
