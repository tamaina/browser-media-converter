import { FIXED_INTERMEDIATE_SHIFT, FIXED_OUTPUT_SHIFT, simdProbe } from './shared';

export { simdProbe };

export function halve8_c4(
  sourcePtr: usize,
  destinationPtr: usize,
  sourceWidth: i32,
  sourceHeight: i32,
  sourceStride: i32,
  halveWidth: i32,
  halveHeight: i32,
): void {
  const width = halveWidth != 0 ? (sourceWidth + 1) >> 1 : sourceWidth;
  const height = halveHeight != 0 ? (sourceHeight + 1) >> 1 : sourceHeight;
  const destinationStride = width << 2;
  for (let y = 0; y < height; y++) {
    const sourceY = halveHeight != 0 ? y << 1 : y;
    const nextY = halveHeight != 0 ? minI32(sourceY + 1, sourceHeight - 1) : sourceY;
    const row0 = sourcePtr + <usize>(sourceY * sourceStride);
    const row1 = sourcePtr + <usize>(nextY * sourceStride);
    const destinationRow = destinationPtr + <usize>(y * destinationStride);
    let x = 0;
    if (halveWidth != 0) {
      const vectorLimit = minI32(width & ~3, sourceWidth >> 1 & ~3);
      for (; x < vectorLimit; x += 4) {
        const sourceOffset = x << 3;
        const row0A = v128.load(row0 + <usize>sourceOffset);
        const row0B = v128.load(row0 + <usize>(sourceOffset + 16));
        const horizontal0 = avgAdjacentRgba(row0A, row0B);
        let value = horizontal0;
        if (halveHeight != 0) {
          const row1A = v128.load(row1 + <usize>sourceOffset);
          const row1B = v128.load(row1 + <usize>(sourceOffset + 16));
          value = i8x16.avgr_u(horizontal0, avgAdjacentRgba(row1A, row1B));
        }
        v128.store(destinationRow + <usize>(x << 2), value);
      }
    } else if (halveHeight != 0) {
      const vectorLimit = width & ~3;
      for (; x < vectorLimit; x += 4) {
        const sourceOffset = x << 2;
        const value = i8x16.avgr_u(
          v128.load(row0 + <usize>sourceOffset),
          v128.load(row1 + <usize>sourceOffset),
        );
        v128.store(destinationRow + <usize>sourceOffset, value);
      }
    }
    for (; x < width; x++) {
      halvePixelScalar(row0, row1, destinationRow, sourceWidth, x, halveWidth, halveHeight);
    }
  }
}

function avgAdjacentRgba(a: v128, b: v128): v128 {
  const even = i8x16.shuffle(a, b, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);
  const odd = i8x16.shuffle(a, b, 4, 5, 6, 7, 12, 13, 14, 15, 20, 21, 22, 23, 28, 29, 30, 31);
  return i8x16.avgr_u(even, odd);
}

function halvePixelScalar(
  row0: usize,
  row1: usize,
  destinationRow: usize,
  sourceWidth: i32,
  x: i32,
  halveWidth: i32,
  halveHeight: i32,
): void {
  const sourceX = halveWidth != 0 ? x << 1 : x;
  const nextX = halveWidth != 0 ? minI32(sourceX + 1, sourceWidth - 1) : sourceX;
  const column0 = sourceX << 2;
  const column1 = nextX << 2;
  const destinationBase = destinationRow + <usize>(x << 2);
  for (let component = 0; component < 4; component++) {
    let value: i32;
    if (halveWidth != 0 && halveHeight != 0) {
      value = avgByteRounded(
        avgByteRounded(
          load<u8>(row0 + <usize>(column0 + component)),
          load<u8>(row0 + <usize>(column1 + component)),
        ),
        avgByteRounded(
          load<u8>(row1 + <usize>(column0 + component)),
          load<u8>(row1 + <usize>(column1 + component)),
        ),
      );
    } else if (halveWidth != 0) {
      value = avgByteRounded(
        load<u8>(row0 + <usize>(column0 + component)),
        load<u8>(row0 + <usize>(column1 + component)),
      );
    } else {
      value = avgByteRounded(
        load<u8>(row0 + <usize>(column0 + component)),
        load<u8>(row1 + <usize>(column0 + component)),
      );
    }
    store<u8>(destinationBase + <usize>component, <u8>value);
  }
}

function avgByteRounded(a: i32, b: i32): i32 {
  return (a + b + 1) >> 1;
}

function minI32(a: i32, b: i32): i32 {
  return a < b ? a : b;
}

export function resizeFixed8_c4_striped(
  sourcePtr: usize,
  destinationPtr: usize,
  horizontalOffsetsPtr: usize,
  horizontalCountsPtr: usize,
  horizontalStartsPtr: usize,
  horizontalWeightsPtr: usize,
  verticalOffsetsPtr: usize,
  verticalCountsPtr: usize,
  verticalStartsPtr: usize,
  verticalWeightsPtr: usize,
  intermediatePtr: usize,
  sourceWidth: i32,
  sourceHeight: i32,
  sourceStride: i32,
  destinationWidth: i32,
  destinationHeight: i32,
  destinationStride: i32,
  outputComponents: i32,
  stripeRows: i32,
): void {
  if (outputComponents != 3 && outputComponents != 4) {
    return;
  }

  const halfIntermediate = i32x4.splat(1 << (FIXED_INTERMEDIATE_SHIFT - 1));
  const halfOutput = 1 << (FIXED_OUTPUT_SHIFT - 1);
  const halfOutputVector = i32x4.splat(halfOutput);
  const intermediateRowValues = destinationWidth * outputComponents;

  for (let stripeY = 0; stripeY < destinationHeight; stripeY += stripeRows) {
    const stripeEnd = minI32(stripeY + stripeRows, destinationHeight);
    let sourceBegin = sourceHeight;
    let sourceEnd = 0;
    for (let y = stripeY; y < stripeEnd; y++) {
      const sourceStart = load<i32>(verticalStartsPtr + <usize>(y * 4));
      const count = load<i32>(verticalCountsPtr + <usize>(y * 4));
      if (sourceStart < sourceBegin) sourceBegin = sourceStart;
      if (sourceStart + count > sourceEnd) sourceEnd = sourceStart + count;
    }
    if (sourceBegin < 0) sourceBegin = 0;
    if (sourceEnd > sourceHeight) sourceEnd = sourceHeight;

    for (let sourceY = sourceBegin; sourceY < sourceEnd; sourceY++) {
      const sourceRow = sourcePtr + <usize>(sourceY * sourceStride);
      const intermediateRow = intermediatePtr + <usize>((sourceY - sourceBegin) * intermediateRowValues * 2);
      for (let x = 0; x < destinationWidth; x++) {
        const start = load<i32>(horizontalOffsetsPtr + <usize>(x * 4));
        const count = load<i32>(horizontalCountsPtr + <usize>(x * 4));
        const sourceStart = load<i32>(horizontalStartsPtr + <usize>(x * 4));
        let total = i32x4.splat(0);
        for (let k = 0; k < count; k++) {
          const weight = i32x4.splat(<i32>load<i16>(horizontalWeightsPtr + <usize>((start + k) * 2)));
          const bytes = v128.load32_zero(sourceRow + <usize>((sourceStart + k) << 2));
          const samples = i32x4.extend_low_i16x8_u(i16x8.extend_low_i8x16_u(bytes));
          total = i32x4.add(total, i32x4.mul(samples, weight));
        }
        const rounded = i32x4.shr_s(i32x4.add(total, halfIntermediate), FIXED_INTERMEDIATE_SHIFT);
        const outputBase = intermediateRow + <usize>(x * outputComponents * 2);
        store<i16>(outputBase, <i16>i32x4.extract_lane(rounded, 0));
        store<i16>(outputBase + 2, <i16>i32x4.extract_lane(rounded, 1));
        store<i16>(outputBase + 4, <i16>i32x4.extract_lane(rounded, 2));
        if (outputComponents == 4) store<i16>(outputBase + 6, <i16>i32x4.extract_lane(rounded, 3));
      }
    }

    for (let y = stripeY; y < stripeEnd; y++) {
      const destinationRow = destinationPtr + <usize>(y * destinationStride);
      const start = load<i32>(verticalOffsetsPtr + <usize>(y * 4));
      const count = load<i32>(verticalCountsPtr + <usize>(y * 4));
      const sourceStart = load<i32>(verticalStartsPtr + <usize>(y * 4)) - sourceBegin;
      for (let x = 0; x < destinationWidth; x++) {
        const destinationBase = destinationRow + <usize>(x << 2);
        const intermediateColumn = x * outputComponents;
        if (outputComponents == 4) {
          let total = i32x4.splat(0);
          for (let k = 0; k < count; k++) {
            const weight = i32x4.splat(<i32>load<i16>(verticalWeightsPtr + <usize>((start + k) * 2)));
            const values = i32x4.extend_low_i16x8_s(
              v128.load64_zero(intermediatePtr + <usize>(((sourceStart + k) * intermediateRowValues + intermediateColumn) * 2)),
            );
            total = i32x4.add(total, i32x4.mul(values, weight));
          }
          const rounded = i32x4.shr_s(i32x4.add(total, halfOutputVector), FIXED_OUTPUT_SHIFT);
          store<u8>(destinationBase, <u8>clampByte(i32x4.extract_lane(rounded, 0)));
          store<u8>(destinationBase + 1, <u8>clampByte(i32x4.extract_lane(rounded, 1)));
          store<u8>(destinationBase + 2, <u8>clampByte(i32x4.extract_lane(rounded, 2)));
          store<u8>(destinationBase + 3, <u8>clampByte(i32x4.extract_lane(rounded, 3)));
          continue;
        }
        for (let component = 0; component < outputComponents; component++) {
          let total = 0;
          for (let k = 0; k < count; k++) {
            const weight = <i32>load<i16>(verticalWeightsPtr + <usize>((start + k) * 2));
            const value = <i32>load<i16>(intermediatePtr + <usize>(((sourceStart + k) * intermediateRowValues + intermediateColumn + component) * 2));
            total += value * weight;
          }
          const rounded = (total + halfOutput) >> FIXED_OUTPUT_SHIFT;
          store<u8>(destinationBase + <usize>component, <u8>clampByte(rounded));
        }
        if (outputComponents == 3) store<u8>(destinationBase + 3, 255);
      }
    }
  }
}

function clampByte(value: i32): i32 {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}
