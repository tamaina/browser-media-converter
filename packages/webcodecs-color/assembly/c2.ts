import { FIXED_INTERMEDIATE_SHIFT, FIXED_OUTPUT_SHIFT, halve8Generic, simdProbe } from './shared';

export { simdProbe };

export function halve8_c2(
  sourcePtr: usize,
  destinationPtr: usize,
  sourceWidth: i32,
  sourceHeight: i32,
  sourceStride: i32,
  halveWidth: i32,
  halveHeight: i32,
): void {
  halve8Generic(sourcePtr, destinationPtr, sourceWidth, sourceHeight, sourceStride, 2, halveWidth, halveHeight);
}

export function resizeFixed8_c2_striped(
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
  stripeRows: i32,
): void {
  const halfIntermediate = i32x4.splat(1 << (FIXED_INTERMEDIATE_SHIFT - 1));
  const halfOutputVector = i32x4.splat(1 << (FIXED_OUTPUT_SHIFT - 1));
  const intermediateRowValues = destinationWidth << 1;

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
          const sourceBase = sourceRow + <usize>((sourceStart + k) << 1);
          const samples = i32x4.replace_lane(
            i32x4.replace_lane(i32x4.splat(0), 0, <i32>load<u8>(sourceBase)),
            1,
            <i32>load<u8>(sourceBase + 1),
          );
          total = i32x4.add(total, i32x4.mul(samples, weight));
        }
        const rounded = i32x4.shr_s(i32x4.add(total, halfIntermediate), FIXED_INTERMEDIATE_SHIFT);
        const outputBase = intermediateRow + <usize>(x * 4);
        store<i16>(outputBase, <i16>i32x4.extract_lane(rounded, 0));
        store<i16>(outputBase + 2, <i16>i32x4.extract_lane(rounded, 1));
      }
    }

    for (let y = stripeY; y < stripeEnd; y++) {
      const destinationRow = destinationPtr + <usize>(y * destinationStride);
      const start = load<i32>(verticalOffsetsPtr + <usize>(y * 4));
      const count = load<i32>(verticalCountsPtr + <usize>(y * 4));
      const sourceStart = load<i32>(verticalStartsPtr + <usize>(y * 4)) - sourceBegin;
      for (let x = 0; x < destinationWidth; x++) {
        let total = i32x4.splat(0);
        for (let k = 0; k < count; k++) {
          const weight = i32x4.splat(<i32>load<i16>(verticalWeightsPtr + <usize>((start + k) * 2)));
          const values = i32x4.extend_low_i16x8_s(
            v128.load32_zero(intermediatePtr + <usize>(((sourceStart + k) * intermediateRowValues + (x << 1)) * 2)),
          );
          total = i32x4.add(total, i32x4.mul(values, weight));
        }
        const rounded = i32x4.shr_s(i32x4.add(total, halfOutputVector), FIXED_OUTPUT_SHIFT);
        const destinationBase = destinationRow + <usize>(x << 1);
        store<u8>(destinationBase, <u8>clampByte(i32x4.extract_lane(rounded, 0)));
        store<u8>(destinationBase + 1, <u8>clampByte(i32x4.extract_lane(rounded, 1)));
      }
    }
  }
}

function minI32(a: i32, b: i32): i32 {
  return a < b ? a : b;
}

function clampByte(value: i32): i32 {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}
