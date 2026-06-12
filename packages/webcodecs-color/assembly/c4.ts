import {
  FIXED_INTERMEDIATE_SHIFT,
  halveRowsAverage,
  minI32,
  simdProbe,
  stripeSourceRange,
  verticalPassStripe,
} from './shared';

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
    if (halveWidth == 0) {
      halveRowsAverage(row0, row1, destinationRow, destinationStride);
      continue;
    }
    let x = 0;
    const pairs = sourceWidth >> 1;
    const vectorLimit = pairs & ~3;
    for (; x < vectorLimit; x += 4) {
      const sourceOffset = <usize>x << 3;
      const row0A = v128.load(row0 + sourceOffset);
      const row0B = v128.load(row0 + sourceOffset, 16);
      const horizontal0 = avgAdjacentRgba(row0A, row0B);
      let value = horizontal0;
      if (halveHeight != 0) {
        const row1A = v128.load(row1 + sourceOffset);
        const row1B = v128.load(row1 + sourceOffset, 16);
        value = i8x16.avgr_u(horizontal0, avgAdjacentRgba(row1A, row1B));
      }
      v128.store(destinationRow + (<usize>x << 2), value);
    }
    for (; x < width; x++) {
      const sourceX = x << 1;
      const nextX = minI32(sourceX + 1, sourceWidth - 1);
      const column0 = sourceX << 2;
      const column1 = nextX << 2;
      const destinationBase = destinationRow + (<usize>x << 2);
      for (let component = 0; component < 4; component++) {
        const top = avgByteRounded(
          <i32>load<u8>(row0 + <usize>(column0 + component)),
          <i32>load<u8>(row0 + <usize>(column1 + component)),
        );
        const value = halveHeight != 0
          ? avgByteRounded(
            top,
            avgByteRounded(
              <i32>load<u8>(row1 + <usize>(column0 + component)),
              <i32>load<u8>(row1 + <usize>(column1 + component)),
            ),
          )
          : top;
        store<u8>(destinationBase + <usize>component, <u8>value);
      }
    }
  }
}

function avgAdjacentRgba(a: v128, b: v128): v128 {
  const even = i8x16.shuffle(a, b, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);
  const odd = i8x16.shuffle(a, b, 4, 5, 6, 7, 12, 13, 14, 15, 20, 21, 22, 23, 28, 29, 30, 31);
  return i8x16.avgr_u(even, odd);
}

function avgByteRounded(a: i32, b: i32): i32 {
  return (a + b + 1) >> 1;
}

export function resizeFixed8_c4_striped(
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
  outputComponents: i32,
  stripeRows: i32,
): void {
  const halfIntermediate = i32x4.splat(1 << (FIXED_INTERMEDIATE_SHIFT - 1));
  // Weights are duplicated per component: 2 taps per 8-lane vector. The
  // intermediate always keeps 4 values per pixel; when outputComponents is 3
  // the alpha lane carries garbage that the vertical pass overwrites with 255.
  const weightRowBytes = <usize>horizontalPaddedTaps << 3;
  const intermediateRowValues = destinationWidth << 2;

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
        const start = <usize>load<i32>(horizontalStartsPtr + (<usize>x << 2)) << 2;
        let acc0Even = i32x4.splat(0);
        let acc0Odd = acc0Even;
        let acc1Even = acc0Even;
        let acc1Odd = acc0Even;
        for (let k = 0; k < horizontalPaddedTaps; k += 2) {
          const weights = v128.load(weightPtr + (<usize>k << 3));
          const samples0 = v128.load8x8_u(row0 + start + (<usize>k << 2));
          const samples1 = v128.load8x8_u(row1 + start + (<usize>k << 2));
          acc0Even = i32x4.add(acc0Even, i32x4.extmul_low_i16x8_s(samples0, weights));
          acc0Odd = i32x4.add(acc0Odd, i32x4.extmul_high_i16x8_s(samples0, weights));
          acc1Even = i32x4.add(acc1Even, i32x4.extmul_low_i16x8_s(samples1, weights));
          acc1Odd = i32x4.add(acc1Odd, i32x4.extmul_high_i16x8_s(samples1, weights));
        }
        weightPtr += weightRowBytes;
        const rounded0 = i32x4.shr_s(i32x4.add(i32x4.add(acc0Even, acc0Odd), halfIntermediate), FIXED_INTERMEDIATE_SHIFT);
        const rounded1 = i32x4.shr_s(i32x4.add(i32x4.add(acc1Even, acc1Odd), halfIntermediate), FIXED_INTERMEDIATE_SHIFT);
        const packed = i16x8.narrow_i32x4_s(rounded0, rounded1);
        v128.store64_lane(out0, packed, 0);
        v128.store64_lane(out1, packed, 1);
        out0 += 8;
        out1 += 8;
      }
    }
    for (; sourceY < sourceEnd; sourceY++) {
      const sourceRow = sourcePtr + <usize>(sourceY * sourceStride);
      let out = intermediatePtr + <usize>(sourceY - sourceBegin) * intermediateRowBytes;
      let weightPtr = horizontalWeightsPtr;
      for (let x = 0; x < destinationWidth; x++) {
        const sampleBase = sourceRow + (<usize>load<i32>(horizontalStartsPtr + (<usize>x << 2)) << 2);
        let accEven = i32x4.splat(0);
        let accOdd = accEven;
        for (let k = 0; k < horizontalPaddedTaps; k += 2) {
          const samples = v128.load8x8_u(sampleBase + (<usize>k << 2));
          const weights = v128.load(weightPtr + (<usize>k << 3));
          accEven = i32x4.add(accEven, i32x4.extmul_low_i16x8_s(samples, weights));
          accOdd = i32x4.add(accOdd, i32x4.extmul_high_i16x8_s(samples, weights));
        }
        weightPtr += weightRowBytes;
        const total = i32x4.add(accEven, accOdd);
        const rounded = i32x4.shr_s(i32x4.add(total, halfIntermediate), FIXED_INTERMEDIATE_SHIFT);
        const packed = i16x8.narrow_i32x4_s(rounded, rounded);
        v128.store64_lane(out, packed, 0);
        out += 8;
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
      outputComponents == 3 ? 1 : 0,
    );
  }
}
