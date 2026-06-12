export const FIXED_INTERMEDIATE_SHIFT: i32 = 8;
export const FIXED_OUTPUT_SHIFT: i32 = 20;

export function simdProbe(value: i32): i32 {
  const lane = i32x4.splat(value);
  const incremented = i32x4.add(lane, i32x4.splat(1));
  return i32x4.extract_lane(incremented, 0);
}

export function minI32(a: i32, b: i32): i32 {
  return a < b ? a : b;
}

export function clampByte(value: i32): i32 {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

// Sums all four i32 lanes of an accumulator vector.
export function sumLanes(v: v128): i32 {
  const high = i8x16.shuffle(v, v, 8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7);
  const pair = i32x4.add(v, high);
  const odd = i8x16.shuffle(pair, pair, 4, 5, 6, 7, 0, 1, 2, 3, 12, 13, 14, 15, 8, 9, 10, 11);
  return i32x4.extract_lane(i32x4.add(pair, odd), 0);
}

// Packs the clamped vertical source range for a stripe into an i64:
// begin in the high 32 bits, end in the low 32 bits.
export function stripeSourceRange(
  verticalCountsPtr: usize,
  verticalStartsPtr: usize,
  stripeY: i32,
  stripeEnd: i32,
  sourceHeight: i32,
): i64 {
  let begin = sourceHeight;
  let end = 0;
  for (let y = stripeY; y < stripeEnd; y++) {
    const start = load<i32>(verticalStartsPtr + (<usize>y << 2));
    const count = load<i32>(verticalCountsPtr + (<usize>y << 2));
    if (start < begin) begin = start;
    if (start + count > end) end = start + count;
  }
  if (begin < 0) begin = 0;
  if (end > sourceHeight) end = sourceHeight;
  if (end < begin) end = begin;
  return (<i64>begin << 32) | <i64><u32>end;
}

// Vertical fixed-point pass shared by all channel layouts: every output row is
// a weighted sum of contiguous intermediate rows, so the kernel streams
// rowValues int16 lanes regardless of how many components a pixel has.
// alphaMask forces every 4th byte to 255 (c4 sources whose alpha is ignored).
export function verticalPassStripe(
  destinationPtr: usize,
  verticalOffsetsPtr: usize,
  verticalCountsPtr: usize,
  verticalStartsPtr: usize,
  verticalWeightsPtr: usize,
  intermediatePtr: usize,
  rowValues: i32,
  destinationStride: i32,
  stripeY: i32,
  stripeEnd: i32,
  sourceBegin: i32,
  alphaMask: i32,
): void {
  const half = 1 << (FIXED_OUTPUT_SHIFT - 1);
  const halfVector = i32x4.splat(half);
  const mask = i8x16(0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1);
  const rowBytes = rowValues << 1;
  for (let y = stripeY; y < stripeEnd; y++) {
    const destinationRow = destinationPtr + <usize>(y * destinationStride);
    const start = load<i32>(verticalOffsetsPtr + (<usize>y << 2));
    const count = load<i32>(verticalCountsPtr + (<usize>y << 2));
    const sourceStart = load<i32>(verticalStartsPtr + (<usize>y << 2)) - sourceBegin;
    const baseRow = intermediatePtr + <usize>(sourceStart * rowBytes);
    const weightBase = verticalWeightsPtr + (<usize>start << 1);
    let x = 0;
    const vectorLimit = rowValues & ~15;
    for (; x < vectorLimit; x += 16) {
      let acc0 = i32x4.splat(0);
      let acc1 = acc0;
      let acc2 = acc0;
      let acc3 = acc0;
      let rowPtr = baseRow + (<usize>x << 1);
      for (let k = 0; k < count; k++) {
        const weight = i16x8.splat(load<i16>(weightBase + (<usize>k << 1)));
        const v0 = v128.load(rowPtr);
        const v1 = v128.load(rowPtr, 16);
        acc0 = i32x4.add(acc0, i32x4.extmul_low_i16x8_s(v0, weight));
        acc1 = i32x4.add(acc1, i32x4.extmul_high_i16x8_s(v0, weight));
        acc2 = i32x4.add(acc2, i32x4.extmul_low_i16x8_s(v1, weight));
        acc3 = i32x4.add(acc3, i32x4.extmul_high_i16x8_s(v1, weight));
        rowPtr += <usize>rowBytes;
      }
      const r0 = i32x4.shr_s(i32x4.add(acc0, halfVector), FIXED_OUTPUT_SHIFT);
      const r1 = i32x4.shr_s(i32x4.add(acc1, halfVector), FIXED_OUTPUT_SHIFT);
      const r2 = i32x4.shr_s(i32x4.add(acc2, halfVector), FIXED_OUTPUT_SHIFT);
      const r3 = i32x4.shr_s(i32x4.add(acc3, halfVector), FIXED_OUTPUT_SHIFT);
      let packed = i8x16.narrow_i16x8_u(i16x8.narrow_i32x4_s(r0, r1), i16x8.narrow_i32x4_s(r2, r3));
      if (alphaMask != 0) packed = v128.or(packed, mask);
      v128.store(destinationRow + <usize>x, packed);
    }
    for (; x + 8 <= rowValues; x += 8) {
      let acc0 = i32x4.splat(0);
      let acc1 = acc0;
      let rowPtr = baseRow + (<usize>x << 1);
      for (let k = 0; k < count; k++) {
        const weight = i16x8.splat(load<i16>(weightBase + (<usize>k << 1)));
        const v0 = v128.load(rowPtr);
        acc0 = i32x4.add(acc0, i32x4.extmul_low_i16x8_s(v0, weight));
        acc1 = i32x4.add(acc1, i32x4.extmul_high_i16x8_s(v0, weight));
        rowPtr += <usize>rowBytes;
      }
      const r0 = i32x4.shr_s(i32x4.add(acc0, halfVector), FIXED_OUTPUT_SHIFT);
      const r1 = i32x4.shr_s(i32x4.add(acc1, halfVector), FIXED_OUTPUT_SHIFT);
      const narrowed = i16x8.narrow_i32x4_s(r0, r1);
      let packed = i8x16.narrow_i16x8_u(narrowed, narrowed);
      if (alphaMask != 0) packed = v128.or(packed, mask);
      v128.store64_lane(destinationRow + <usize>x, packed, 0);
    }
    for (; x < rowValues; x++) {
      if (alphaMask != 0 && (x & 3) == 3) {
        store<u8>(destinationRow + <usize>x, 255);
        continue;
      }
      let total = 0;
      let rowPtr = baseRow + (<usize>x << 1);
      for (let k = 0; k < count; k++) {
        total += <i32>load<i16>(rowPtr) * <i32>load<i16>(weightBase + (<usize>k << 1));
        rowPtr += <usize>rowBytes;
      }
      store<u8>(destinationRow + <usize>x, <u8>clampByte((total + half) >> FIXED_OUTPUT_SHIFT));
    }
  }
}

// Byte-wise rounded average of two rows; height-only halving is the same
// operation for every channel layout.
export function halveRowsAverage(row0: usize, row1: usize, destinationRow: usize, rowBytes: i32): void {
  let x = 0;
  const vectorLimit = rowBytes & ~15;
  for (; x < vectorLimit; x += 16) {
    v128.store(
      destinationRow + <usize>x,
      i8x16.avgr_u(v128.load(row0 + <usize>x), v128.load(row1 + <usize>x)),
    );
  }
  for (; x < rowBytes; x++) {
    store<u8>(destinationRow + <usize>x, <u8>((<i32>load<u8>(row0 + <usize>x) + <i32>load<u8>(row1 + <usize>x) + 1) >> 1));
  }
}
