import { FIXED_INTERMEDIATE_SHIFT, FIXED_OUTPUT_SHIFT, halve8Generic, simdProbe } from './shared';

export { simdProbe };

export function halve8_c1(
  sourcePtr: usize,
  destinationPtr: usize,
  sourceWidth: i32,
  sourceHeight: i32,
  sourceStride: i32,
  halveWidth: i32,
  halveHeight: i32,
): void {
  if (halveWidth != 0 && halveHeight != 0) {
    halve8Generic(sourcePtr, destinationPtr, sourceWidth, sourceHeight, sourceStride, 1, halveWidth, halveHeight);
    return;
  }
  const width = halveWidth != 0 ? (sourceWidth + 1) >> 1 : sourceWidth;
  const height = halveHeight != 0 ? (sourceHeight + 1) >> 1 : sourceHeight;
  for (let y = 0; y < height; y++) {
    const sourceY = halveHeight != 0 ? y << 1 : y;
    const nextY = halveHeight != 0 ? minI32(sourceY + 1, sourceHeight - 1) : sourceY;
    const row0 = sourcePtr + <usize>(sourceY * sourceStride);
    const row1 = sourcePtr + <usize>(nextY * sourceStride);
    const destinationRow = destinationPtr + <usize>(y * width);
    let x = 0;
    if (halveWidth != 0) {
      const vectorLimit = minI32(width & ~15, sourceWidth >> 1 & ~15);
      for (; x < vectorLimit; x += 16) {
        const sourceOffset = x << 1;
        const a = v128.load(row0 + <usize>sourceOffset);
        const b = v128.load(row0 + <usize>(sourceOffset + 16));
        v128.store(destinationRow + <usize>x, avgAdjacentBytes(a, b));
      }
    } else if (halveHeight != 0) {
      const vectorLimit = width & ~15;
      for (; x < vectorLimit; x += 16) {
        v128.store(
          destinationRow + <usize>x,
          i8x16.avgr_u(v128.load(row0 + <usize>x), v128.load(row1 + <usize>x)),
        );
      }
    }
    for (; x < width; x++) {
      const sourceX = halveWidth != 0 ? x << 1 : x;
      const nextX = halveWidth != 0 ? minI32(sourceX + 1, sourceWidth - 1) : sourceX;
      const value = halveWidth != 0
        ? (load<u8>(row0 + <usize>sourceX) + load<u8>(row0 + <usize>nextX) + 1) >> 1
        : (load<u8>(row0 + <usize>sourceX) + load<u8>(row1 + <usize>sourceX) + 1) >> 1;
      store<u8>(destinationRow + <usize>x, <u8>value);
    }
  }
}

function avgAdjacentBytes(a: v128, b: v128): v128 {
  const even = i8x16.shuffle(a, b, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30);
  const odd = i8x16.shuffle(a, b, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31);
  return i8x16.avgr_u(even, odd);
}

function minI32(a: i32, b: i32): i32 {
  return a < b ? a : b;
}

export function halve8_c1_scalar(
  sourcePtr: usize,
  destinationPtr: usize,
  sourceWidth: i32,
  sourceHeight: i32,
  sourceStride: i32,
  halveWidth: i32,
  halveHeight: i32,
): void {
  halve8Generic(sourcePtr, destinationPtr, sourceWidth, sourceHeight, sourceStride, 1, halveWidth, halveHeight);
}

export function resizeFixed8_c1_striped(
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
  const halfIntermediate = 1 << (FIXED_INTERMEDIATE_SHIFT - 1);
  const halfIntermediateVector = i32x4.splat(halfIntermediate);
  const halfOutputVector = i32x4.splat(1 << (FIXED_OUTPUT_SHIFT - 1));

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
      const intermediateRow = intermediatePtr + <usize>((sourceY - sourceBegin) * destinationWidth * 2);
      let x = 0;
      const vectorLimit = destinationWidth & ~3;
      for (; x < vectorLimit; x += 4) {
        const start0 = load<i32>(horizontalOffsetsPtr + <usize>(x * 4));
        const start1 = load<i32>(horizontalOffsetsPtr + <usize>((x + 1) * 4));
        const start2 = load<i32>(horizontalOffsetsPtr + <usize>((x + 2) * 4));
        const start3 = load<i32>(horizontalOffsetsPtr + <usize>((x + 3) * 4));
        const count0 = load<i32>(horizontalCountsPtr + <usize>(x * 4));
        const count1 = load<i32>(horizontalCountsPtr + <usize>((x + 1) * 4));
        const count2 = load<i32>(horizontalCountsPtr + <usize>((x + 2) * 4));
        const count3 = load<i32>(horizontalCountsPtr + <usize>((x + 3) * 4));
        if (count0 != count1 || count0 != count2 || count0 != count3) {
          for (let lane = 0; lane < 4; lane++) {
            const scalarX = x + lane;
            const start = load<i32>(horizontalOffsetsPtr + <usize>(scalarX * 4));
            const count = load<i32>(horizontalCountsPtr + <usize>(scalarX * 4));
            const sourceStart = load<i32>(horizontalStartsPtr + <usize>(scalarX * 4));
            let total = 0;
            for (let k = 0; k < count; k++) {
              const weight = <i32>load<i16>(horizontalWeightsPtr + <usize>((start + k) * 2));
              total += <i32>load<u8>(sourceRow + <usize>(sourceStart + k)) * weight;
            }
            store<i16>(intermediateRow + <usize>(scalarX * 2), <i16>((total + halfIntermediate) >> FIXED_INTERMEDIATE_SHIFT));
          }
          continue;
        }
        const sourceStart0 = load<i32>(horizontalStartsPtr + <usize>(x * 4));
        const sourceStart1 = load<i32>(horizontalStartsPtr + <usize>((x + 1) * 4));
        const sourceStart2 = load<i32>(horizontalStartsPtr + <usize>((x + 2) * 4));
        const sourceStart3 = load<i32>(horizontalStartsPtr + <usize>((x + 3) * 4));
        let total = i32x4.splat(0);
        for (let k = 0; k < count0; k++) {
          const weights = i32x4.replace_lane(
            i32x4.replace_lane(
              i32x4.replace_lane(
                i32x4.replace_lane(i32x4.splat(0), 0, <i32>load<i16>(horizontalWeightsPtr + <usize>((start0 + k) * 2))),
                1,
                <i32>load<i16>(horizontalWeightsPtr + <usize>((start1 + k) * 2)),
              ),
              2,
              <i32>load<i16>(horizontalWeightsPtr + <usize>((start2 + k) * 2)),
            ),
            3,
            <i32>load<i16>(horizontalWeightsPtr + <usize>((start3 + k) * 2)),
          );
          const samples = i32x4.replace_lane(
            i32x4.replace_lane(
              i32x4.replace_lane(
                i32x4.replace_lane(i32x4.splat(0), 0, <i32>load<u8>(sourceRow + <usize>(sourceStart0 + k))),
                1,
                <i32>load<u8>(sourceRow + <usize>(sourceStart1 + k)),
              ),
              2,
              <i32>load<u8>(sourceRow + <usize>(sourceStart2 + k)),
            ),
            3,
            <i32>load<u8>(sourceRow + <usize>(sourceStart3 + k)),
          );
          total = i32x4.add(total, i32x4.mul(samples, weights));
        }
        const rounded = i32x4.shr_s(i32x4.add(total, halfIntermediateVector), FIXED_INTERMEDIATE_SHIFT);
        store<i16>(intermediateRow + <usize>(x * 2), <i16>i32x4.extract_lane(rounded, 0));
        store<i16>(intermediateRow + <usize>((x + 1) * 2), <i16>i32x4.extract_lane(rounded, 1));
        store<i16>(intermediateRow + <usize>((x + 2) * 2), <i16>i32x4.extract_lane(rounded, 2));
        store<i16>(intermediateRow + <usize>((x + 3) * 2), <i16>i32x4.extract_lane(rounded, 3));
      }
      for (; x < destinationWidth; x++) {
        const count = load<i32>(horizontalCountsPtr + <usize>(x * 4));
        const start = load<i32>(horizontalOffsetsPtr + <usize>(x * 4));
        const sourceStart = load<i32>(horizontalStartsPtr + <usize>(x * 4));
        let total = 0;
        for (let k = 0; k < count; k++) {
          const weight = <i32>load<i16>(horizontalWeightsPtr + <usize>((start + k) * 2));
          total += <i32>load<u8>(sourceRow + <usize>(sourceStart + k)) * weight;
        }
        store<i16>(intermediateRow + <usize>(x * 2), <i16>((total + halfIntermediate) >> FIXED_INTERMEDIATE_SHIFT));
      }
    }

    for (let y = stripeY; y < stripeEnd; y++) {
      const destinationRow = destinationPtr + <usize>(y * destinationStride);
      const start = load<i32>(verticalOffsetsPtr + <usize>(y * 4));
      const count = load<i32>(verticalCountsPtr + <usize>(y * 4));
      const sourceStart = load<i32>(verticalStartsPtr + <usize>(y * 4)) - sourceBegin;
      let x = 0;
      const vectorLimit = destinationWidth & ~3;
      for (; x < vectorLimit; x += 4) {
        let total = i32x4.splat(0);
        for (let k = 0; k < count; k++) {
          const weight = i32x4.splat(<i32>load<i16>(verticalWeightsPtr + <usize>((start + k) * 2)));
          const values = i32x4.extend_low_i16x8_s(
            v128.load64_zero(intermediatePtr + <usize>(((sourceStart + k) * destinationWidth + x) * 2)),
          );
          total = i32x4.add(total, i32x4.mul(values, weight));
        }
        const rounded = i32x4.shr_s(i32x4.add(total, halfOutputVector), FIXED_OUTPUT_SHIFT);
        store<u8>(destinationRow + <usize>x, <u8>clampByte(i32x4.extract_lane(rounded, 0)));
        store<u8>(destinationRow + <usize>(x + 1), <u8>clampByte(i32x4.extract_lane(rounded, 1)));
        store<u8>(destinationRow + <usize>(x + 2), <u8>clampByte(i32x4.extract_lane(rounded, 2)));
        store<u8>(destinationRow + <usize>(x + 3), <u8>clampByte(i32x4.extract_lane(rounded, 3)));
      }
      for (; x < destinationWidth; x++) {
        let total = 0;
        for (let k = 0; k < count; k++) {
          const weight = <i32>load<i16>(verticalWeightsPtr + <usize>((start + k) * 2));
          const value = <i32>load<i16>(intermediatePtr + <usize>(((sourceStart + k) * destinationWidth + x) * 2));
          total += value * weight;
        }
        store<u8>(destinationRow + <usize>x, <u8>clampByte((total + (1 << (FIXED_OUTPUT_SHIFT - 1))) >> FIXED_OUTPUT_SHIFT));
      }
    }
  }
}

function clampByte(value: i32): i32 {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}
