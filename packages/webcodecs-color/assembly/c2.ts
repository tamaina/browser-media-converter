import {
  FIXED_INTERMEDIATE_SHIFT,
  halveRowsAverage,
  minI32,
  simdProbe,
  stripeSourceRange,
  verticalPassStripe,
} from './shared';

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
  const width = halveWidth != 0 ? (sourceWidth + 1) >> 1 : sourceWidth;
  const height = halveHeight != 0 ? (sourceHeight + 1) >> 1 : sourceHeight;
  const destinationStride = width << 1;
  for (let y = 0; y < height; y++) {
    const sourceY = halveHeight != 0 ? y << 1 : y;
    const nextY = halveHeight != 0 ? minI32(sourceY + 1, sourceHeight - 1) : sourceY;
    const row0 = sourcePtr + <usize>(sourceY * sourceStride);
    const row1 = sourcePtr + <usize>(nextY * sourceStride);
    const destinationRow = destinationPtr + <usize>(y * destinationStride);
    if (halveWidth == 0) {
      halveRowsAverage(row0, row1, destinationRow, destinationStride);
      continue;
    }
    let x = 0;
    const pairs = sourceWidth >> 1;
    if (halveHeight != 0) {
      const two = i16x8.splat(2);
      const vectorLimit = pairs & ~3;
      for (; x < vectorLimit; x += 4) {
        const a = v128.load(row0 + (<usize>x << 2));
        const b = v128.load(row1 + (<usize>x << 2));
        // Group the two bytes of each pixel, splitting even/odd source pixels.
        const even = i8x16.shuffle(a, b, 0, 1, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28, 29);
        const odd = i8x16.shuffle(a, b, 2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23, 26, 27, 30, 31);
        const sum = i16x8.add(
          i16x8.add(
            i16x8.add(
              i16x8.extend_low_i8x16_u(even),
              i16x8.extend_low_i8x16_u(odd),
            ),
            i16x8.add(
              i16x8.extend_high_i8x16_u(even),
              i16x8.extend_high_i8x16_u(odd),
            ),
          ),
          two,
        );
        const narrowed = i16x8.shr_u(sum, 2);
        const packed = i8x16.narrow_i16x8_u(narrowed, narrowed);
        v128.store64_lane(destinationRow + (<usize>x << 1), packed, 0);
      }
    } else {
      const vectorLimit = pairs & ~7;
      for (; x < vectorLimit; x += 8) {
        const a = v128.load(row0 + (<usize>x << 2));
        const b = v128.load(row0 + (<usize>x << 2), 16);
        const even = i8x16.shuffle(a, b, 0, 1, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28, 29);
        const odd = i8x16.shuffle(a, b, 2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23, 26, 27, 30, 31);
        v128.store(destinationRow + (<usize>x << 1), i8x16.avgr_u(even, odd));
      }
    }
    for (; x < width; x++) {
      const sourceX = x << 1;
      const nextX = minI32(sourceX + 1, sourceWidth - 1);
      const column0 = sourceX << 1;
      const column1 = nextX << 1;
      const destinationBase = destinationRow + (<usize>x << 1);
      for (let component = 0; component < 2; component++) {
        const value = halveHeight != 0
          ? (
            <i32>load<u8>(row0 + <usize>(column0 + component)) + <i32>load<u8>(row0 + <usize>(column1 + component))
              + <i32>load<u8>(row1 + <usize>(column0 + component)) + <i32>load<u8>(row1 + <usize>(column1 + component))
              + 2
          ) >> 2
          : (<i32>load<u8>(row0 + <usize>(column0 + component)) + <i32>load<u8>(row0 + <usize>(column1 + component)) + 1) >> 1;
        store<u8>(destinationBase + <usize>component, <u8>value);
      }
    }
  }
}

export function resizeFixed8_c2_striped(
  sourcePtr: usize,
  destinationPtr: usize,
  horizontalStartsPtr: usize,
  horizontalWeightsPtr: usize,
  horizontalPaddedTaps: i32,
  verticalOffsetsPtr: usize,
  verticalCountsPtr: usize,
  verticalStartsPtr: usize,
  verticalWeightsPtr: usize,
  intermediatePtr: usize,
  sourceHeight: i32,
  sourceStride: i32,
  destinationWidth: i32,
  destinationHeight: i32,
  destinationStride: i32,
  stripeRows: i32,
): void {
  const halfIntermediate = i32x4.splat(1 << (FIXED_INTERMEDIATE_SHIFT - 1));
  // Weights are duplicated per component: 4 taps per 8-lane vector.
  const weightRowBytes = <usize>horizontalPaddedTaps << 2;
  const intermediateRowValues = destinationWidth << 1;

  for (let stripeY = 0; stripeY < destinationHeight; stripeY += stripeRows) {
    const stripeEnd = minI32(stripeY + stripeRows, destinationHeight);
    const range = stripeSourceRange(verticalCountsPtr, verticalStartsPtr, stripeY, stripeEnd, sourceHeight);
    const sourceBegin = <i32>(range >> 32);
    const sourceEnd = <i32>(range & 0xffffffff);

    // Process two source rows per iteration so weight vectors and start
    // offsets are loaded once per two accumulator chains.
    const intermediateRowBytes = <usize>intermediateRowValues << 1;
    let sourceY = sourceBegin;
    for (; sourceY + 2 <= sourceEnd; sourceY += 2) {
      const row0 = sourcePtr + <usize>(sourceY * sourceStride);
      const row1 = row0 + <usize>sourceStride;
      let out0 = intermediatePtr + <usize>(sourceY - sourceBegin) * intermediateRowBytes;
      let out1 = out0 + intermediateRowBytes;
      let weightPtr = horizontalWeightsPtr;
      for (let x = 0; x < destinationWidth; x++) {
        const start = <usize>load<i32>(horizontalStartsPtr + (<usize>x << 2)) << 1;
        let acc0Low = i32x4.splat(0);
        let acc0High = acc0Low;
        let acc1Low = acc0Low;
        let acc1High = acc0Low;
        for (let k = 0; k < horizontalPaddedTaps; k += 4) {
          const weights = v128.load(weightPtr + (<usize>k << 2));
          const samples0 = v128.load8x8_u(row0 + start + (<usize>k << 1));
          const samples1 = v128.load8x8_u(row1 + start + (<usize>k << 1));
          acc0Low = i32x4.add(acc0Low, i32x4.extmul_low_i16x8_s(samples0, weights));
          acc0High = i32x4.add(acc0High, i32x4.extmul_high_i16x8_s(samples0, weights));
          acc1Low = i32x4.add(acc1Low, i32x4.extmul_low_i16x8_s(samples1, weights));
          acc1High = i32x4.add(acc1High, i32x4.extmul_high_i16x8_s(samples1, weights));
        }
        weightPtr += weightRowBytes;
        const acc0 = i32x4.add(acc0Low, acc0High);
        const acc1 = i32x4.add(acc1Low, acc1High);
        const swapped0 = i8x16.shuffle(acc0, acc0, 8, 9, 10, 11, 12, 13, 14, 15, 8, 9, 10, 11, 12, 13, 14, 15);
        const swapped1 = i8x16.shuffle(acc1, acc1, 8, 9, 10, 11, 12, 13, 14, 15, 8, 9, 10, 11, 12, 13, 14, 15);
        const rounded0 = i32x4.shr_s(i32x4.add(i32x4.add(acc0, swapped0), halfIntermediate), FIXED_INTERMEDIATE_SHIFT);
        const rounded1 = i32x4.shr_s(i32x4.add(i32x4.add(acc1, swapped1), halfIntermediate), FIXED_INTERMEDIATE_SHIFT);
        const packed0 = i16x8.narrow_i32x4_s(rounded0, rounded1);
        v128.store32_lane(out0, packed0, 0);
        v128.store32_lane(out1, packed0, 2);
        out0 += 4;
        out1 += 4;
      }
    }
    for (; sourceY < sourceEnd; sourceY++) {
      const sourceRow = sourcePtr + <usize>(sourceY * sourceStride);
      let out = intermediatePtr + <usize>(sourceY - sourceBegin) * intermediateRowBytes;
      let weightPtr = horizontalWeightsPtr;
      for (let x = 0; x < destinationWidth; x++) {
        const sampleBase = sourceRow + (<usize>load<i32>(horizontalStartsPtr + (<usize>x << 2)) << 1);
        let accLow = i32x4.splat(0);
        let accHigh = accLow;
        for (let k = 0; k < horizontalPaddedTaps; k += 4) {
          const samples = v128.load8x8_u(sampleBase + (<usize>k << 1));
          const weights = v128.load(weightPtr + (<usize>k << 2));
          accLow = i32x4.add(accLow, i32x4.extmul_low_i16x8_s(samples, weights));
          accHigh = i32x4.add(accHigh, i32x4.extmul_high_i16x8_s(samples, weights));
        }
        weightPtr += weightRowBytes;
        const acc = i32x4.add(accLow, accHigh);
        const swapped = i8x16.shuffle(acc, acc, 8, 9, 10, 11, 12, 13, 14, 15, 8, 9, 10, 11, 12, 13, 14, 15);
        const total = i32x4.add(acc, swapped);
        const rounded = i32x4.shr_s(i32x4.add(total, halfIntermediate), FIXED_INTERMEDIATE_SHIFT);
        const packed = i16x8.narrow_i32x4_s(rounded, rounded);
        v128.store32_lane(out, packed, 0);
        out += 4;
      }
    }

    verticalPassStripe(
      destinationPtr,
      verticalOffsetsPtr,
      verticalCountsPtr,
      verticalStartsPtr,
      verticalWeightsPtr,
      intermediatePtr,
      intermediateRowValues,
      destinationStride,
      stripeY,
      stripeEnd,
      sourceBegin,
      0,
    );
  }
}
