import {
  FIXED_INTERMEDIATE_SHIFT,
  halveRowsAverage,
  minI32,
  simdProbe,
  stripeSourceRange,
  sumLanes,
  verticalPassStripe,
} from './shared';

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
  const width = halveWidth != 0 ? (sourceWidth + 1) >> 1 : sourceWidth;
  const height = halveHeight != 0 ? (sourceHeight + 1) >> 1 : sourceHeight;
  for (let y = 0; y < height; y++) {
    const sourceY = halveHeight != 0 ? y << 1 : y;
    const nextY = halveHeight != 0 ? minI32(sourceY + 1, sourceHeight - 1) : sourceY;
    const row0 = sourcePtr + <usize>(sourceY * sourceStride);
    const row1 = sourcePtr + <usize>(nextY * sourceStride);
    const destinationRow = destinationPtr + <usize>(y * width);
    if (halveWidth == 0) {
      halveRowsAverage(row0, row1, destinationRow, width);
      continue;
    }
    let x = 0;
    const pairs = sourceWidth >> 1;
    if (halveHeight != 0) {
      const two = i16x8.splat(2);
      const vectorLimit = pairs & ~7;
      for (; x < vectorLimit; x += 8) {
        const a = v128.load(row0 + (<usize>x << 1));
        const b = v128.load(row1 + (<usize>x << 1));
        const sum = i16x8.add(
          i16x8.add(i16x8.extadd_pairwise_i8x16_u(a), i16x8.extadd_pairwise_i8x16_u(b)),
          two,
        );
        const narrowed8 = i16x8.shr_u(sum, 2);
        const packed = i8x16.narrow_i16x8_u(narrowed8, narrowed8);
        v128.store64_lane(destinationRow + <usize>x, packed, 0);
      }
    } else {
      const vectorLimit = pairs & ~15;
      for (; x < vectorLimit; x += 16) {
        const a = v128.load(row0 + (<usize>x << 1));
        const b = v128.load(row0 + (<usize>x << 1), 16);
        const even = i8x16.shuffle(a, b, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30);
        const odd = i8x16.shuffle(a, b, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31);
        v128.store(destinationRow + <usize>x, i8x16.avgr_u(even, odd));
      }
    }
    for (; x < width; x++) {
      const sourceX = x << 1;
      const nextX = minI32(sourceX + 1, sourceWidth - 1);
      const value = halveHeight != 0
        ? (
          <i32>load<u8>(row0 + <usize>sourceX) + <i32>load<u8>(row0 + <usize>nextX)
            + <i32>load<u8>(row1 + <usize>sourceX) + <i32>load<u8>(row1 + <usize>nextX)
            + 2
        ) >> 2
        : (<i32>load<u8>(row0 + <usize>sourceX) + <i32>load<u8>(row0 + <usize>nextX) + 1) >> 1;
      store<u8>(destinationRow + <usize>x, <u8>value);
    }
  }
}

export function resizeFixed8_c1_striped(
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
  const halfIntermediate = 1 << (FIXED_INTERMEDIATE_SHIFT - 1);
  const weightRowBytes = <usize>horizontalPaddedTaps << 1;

  for (let stripeY = 0; stripeY < destinationHeight; stripeY += stripeRows) {
    const stripeEnd = minI32(stripeY + stripeRows, destinationHeight);
    const range = stripeSourceRange(verticalCountsPtr, verticalStartsPtr, stripeY, stripeEnd, sourceHeight);
    const sourceBegin = <i32>(range >> 32);
    const sourceEnd = <i32>(range & 0xffffffff);

    for (let sourceY = sourceBegin; sourceY < sourceEnd; sourceY++) {
      const sourceRow = sourcePtr + <usize>(sourceY * sourceStride);
      let out = intermediatePtr + (<usize>((sourceY - sourceBegin) * destinationWidth) << 1);
      let weightPtr = horizontalWeightsPtr;
      for (let x = 0; x < destinationWidth; x++) {
        const sampleBase = sourceRow + <usize>load<i32>(horizontalStartsPtr + (<usize>x << 2));
        let acc = i32x4.splat(0);
        for (let k = 0; k < horizontalPaddedTaps; k += 8) {
          const samples = v128.load8x8_u(sampleBase + <usize>k);
          const weights = v128.load(weightPtr + (<usize>k << 1));
          acc = i32x4.add(acc, i32x4.dot_i16x8_s(samples, weights));
        }
        weightPtr += weightRowBytes;
        store<i16>(out, <i16>((sumLanes(acc) + halfIntermediate) >> FIXED_INTERMEDIATE_SHIFT));
        out += 2;
      }
    }

    verticalPassStripe(
      destinationPtr,
      verticalOffsetsPtr,
      verticalCountsPtr,
      verticalStartsPtr,
      verticalWeightsPtr,
      intermediatePtr,
      destinationWidth,
      destinationStride,
      stripeY,
      stripeEnd,
      sourceBegin,
      0,
    );
  }
}
