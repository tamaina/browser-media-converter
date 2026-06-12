export const FIXED_INTERMEDIATE_SHIFT: i32 = 8;
export const FIXED_OUTPUT_SHIFT: i32 = 20;

export function simdProbe(value: i32): i32 {
  const lane = i32x4.splat(value);
  const incremented = i32x4.add(lane, i32x4.splat(1));
  return i32x4.extract_lane(incremented, 0);
}

export function halve8Generic(
  sourcePtr: usize,
  destinationPtr: usize,
  sourceWidth: i32,
  sourceHeight: i32,
  sourceStride: i32,
  components: i32,
  halveWidth: i32,
  halveHeight: i32,
): void {
  const width = halveWidth != 0 ? (sourceWidth + 1) >> 1 : sourceWidth;
  const height = halveHeight != 0 ? (sourceHeight + 1) >> 1 : sourceHeight;
  const destinationStride = width * components;
  for (let y = 0; y < height; y++) {
    const sourceY = halveHeight != 0 ? y << 1 : y;
    const nextY = halveHeight != 0 ? minI32(sourceY + 1, sourceHeight - 1) : sourceY;
    const row0 = sourcePtr + <usize>(sourceY * sourceStride);
    const row1 = sourcePtr + <usize>(nextY * sourceStride);
    const destinationRow = destinationPtr + <usize>(y * destinationStride);
    for (let x = 0; x < width; x++) {
      const sourceX = halveWidth != 0 ? x << 1 : x;
      const nextX = halveWidth != 0 ? minI32(sourceX + 1, sourceWidth - 1) : sourceX;
      const column0 = sourceX * components;
      const column1 = nextX * components;
      const destinationBase = destinationRow + <usize>(x * components);
      for (let component = 0; component < components; component++) {
        let value: i32;
        if (components == 4 && halveWidth != 0 && halveHeight != 0) {
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
        } else if (components == 4 && halveWidth != 0) {
          value = avgByteRounded(
            load<u8>(row0 + <usize>(column0 + component)),
            load<u8>(row0 + <usize>(column1 + component)),
          );
        } else if (components == 4 && halveHeight != 0) {
          value = avgByteRounded(
            load<u8>(row0 + <usize>(column0 + component)),
            load<u8>(row1 + <usize>(column0 + component)),
          );
        } else if (halveWidth != 0 && halveHeight != 0) {
          value = (
            load<u8>(row0 + <usize>(column0 + component))
              + load<u8>(row0 + <usize>(column1 + component))
              + load<u8>(row1 + <usize>(column0 + component))
              + load<u8>(row1 + <usize>(column1 + component))
              + 2
          ) >> 2;
        } else if (halveWidth != 0) {
          value = (
            load<u8>(row0 + <usize>(column0 + component))
              + load<u8>(row0 + <usize>(column1 + component))
              + 1
          ) >> 1;
        } else {
          value = (
            load<u8>(row0 + <usize>(column0 + component))
              + load<u8>(row1 + <usize>(column0 + component))
              + 1
          ) >> 1;
        }
        store<u8>(destinationBase + <usize>component, <u8>value);
      }
    }
  }
}

export function resizeFixed8Generic(
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
  components: i32,
  outputComponents: i32,
): void {
  const halfIntermediate = 1 << (FIXED_INTERMEDIATE_SHIFT - 1);
  const intermediateRowValues = destinationWidth * outputComponents;

  for (let y = 0; y < sourceHeight; y++) {
    const sourceRow = sourcePtr + <usize>(y * sourceStride);
    const intermediateRow = intermediatePtr + <usize>(y * intermediateRowValues * 2);
    for (let x = 0; x < destinationWidth; x++) {
      const start = load<i32>(horizontalOffsetsPtr + <usize>(x * 4));
      const count = load<i32>(horizontalCountsPtr + <usize>(x * 4));
      const sourceStart = load<i32>(horizontalStartsPtr + <usize>(x * 4));
      const outputBase = intermediateRow + <usize>(x * outputComponents * 2);
      for (let component = 0; component < outputComponents; component++) {
        let total = 0;
        for (let k = 0; k < count; k++) {
          const weight = <i32>load<i16>(horizontalWeightsPtr + <usize>((start + k) * 2));
          const sample = <i32>load<u8>(sourceRow + <usize>((sourceStart + k) * components + component));
          total += sample * weight;
        }
        store<i16>(outputBase + <usize>(component * 2), <i16>((total + halfIntermediate) >> FIXED_INTERMEDIATE_SHIFT));
      }
    }
  }

  const halfOutput = 1 << (FIXED_OUTPUT_SHIFT - 1);
  for (let y = 0; y < destinationHeight; y++) {
    const destinationRow = destinationPtr + <usize>(y * destinationStride);
    const start = load<i32>(verticalOffsetsPtr + <usize>(y * 4));
    const count = load<i32>(verticalCountsPtr + <usize>(y * 4));
    const sourceStart = load<i32>(verticalStartsPtr + <usize>(y * 4));
    for (let x = 0; x < destinationWidth; x++) {
      const destinationBase = destinationRow + <usize>(x * components);
      const intermediateColumn = x * outputComponents;
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
      if (components == 4 && outputComponents == 3) store<u8>(destinationBase + 3, 255);
    }
  }
}

function clampByte(value: i32): i32 {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

function minI32(a: i32, b: i32): i32 {
  return a < b ? a : b;
}

function avgByteRounded(a: i32, b: i32): i32 {
  return (a + b + 1) >> 1;
}
