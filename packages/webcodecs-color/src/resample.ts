import type { ResizeScratch } from './scratch.js';
import { peekSimdKind, type SimdContext, type SimdKind } from './simd.js';

export type CpuResizeAlgorithm = 'nearest' | 'bilinear' | 'catmullrom' | 'lanczos3';

export type ConvertPlaneOptions = {
  source: Uint8Array;
  destination: Uint8Array;
  sourceLayout: PlaneLayout;
  destinationLayout: PlaneLayout;
  sourceWidth: number;
  sourceHeight: number;
  destinationWidth: number;
  destinationHeight: number;
  sourceBytesPerSample: 1 | 2;
  destinationBytesPerSample: 1 | 2;
  sourceBitDepth: 8 | 10 | 12;
  destinationBitDepth: 8 | 10 | 12;
  sourceSamplesPerPixel: 1 | 2 | 4;
  destinationSamplesPerPixel: 1 | 2 | 4;
  sourceComponent: number;
  algorithm: CpuResizeAlgorithm;
  simd?: boolean;
  scratch?: ResizeScratch;
  skipFourthComponent?: boolean;
};

type PlaneView = {
  data: Uint8Array;
  offset: number;
  stride: number;
  width: number;
  height: number;
};

type KernelTable = {
  offsets: Int32Array;
  counts: Int32Array;
  starts: Int32Array;
  weights: Float32Array;
};

const SIMD_FIXED_STRIPE_ROWS = 64;

export function convertPlane(options: ConvertPlaneOptions) {
  if (options.sourceSamplesPerPixel !== options.destinationSamplesPerPixel && options.destinationSamplesPerPixel !== 1) {
    throw new Error('CPU plane conversion does not support planar-to-packed conversion');
  }
  const components = options.destinationSamplesPerPixel;
  let view: PlaneView = {
    data: options.source,
    offset: options.sourceLayout.offset,
    stride: options.sourceLayout.stride,
    width: options.sourceWidth,
    height: options.sourceHeight,
  };
  if (options.sourceSamplesPerPixel !== components) {
    view = extractComponent(view, options.sourceSamplesPerPixel, options.sourceComponent, options.sourceBytesPerSample, options.scratch);
  }
  if (options.algorithm === 'nearest') {
    resampleNearest(view, options, components);
    return;
  }
  view = halveTowardTarget(view, options.destinationWidth, options.destinationHeight, components, options.sourceBytesPerSample, options.simd, options.scratch);
  if (options.algorithm === 'bilinear') {
    resampleBilinear(view, options, components);
    return;
  }
  resampleConvolution(view, options, components);
}

function mapPixelCenter(position: number, destinationSize: number, sourceSize: number) {
  return (position + 0.5) * sourceSize / destinationSize - 0.5;
}

function extractComponent(
  view: PlaneView,
  samplesPerPixel: number,
  component: number,
  bytesPerSample: 1 | 2,
  scratch?: ResizeScratch,
): PlaneView {
  const stride = view.width * bytesPerSample;
  const data = scratch?.getBytes('plane-extract', stride * view.height) ?? new Uint8Array(stride * view.height);
  const sampleBytes = samplesPerPixel * bytesPerSample;
  for (let y = 0; y < view.height; y++) {
    let source = view.offset + y * view.stride + component * bytesPerSample;
    let target = y * stride;
    if (bytesPerSample === 1) {
      for (let x = 0; x < view.width; x++) {
        data[target] = view.data[source];
        source += sampleBytes;
        target += 1;
      }
    } else {
      for (let x = 0; x < view.width; x++) {
        data[target] = view.data[source];
        data[target + 1] = view.data[source + 1];
        source += sampleBytes;
        target += 2;
      }
    }
  }
  return { data, offset: 0, stride, width: view.width, height: view.height };
}

function halveTowardTarget(
  view: PlaneView,
  destinationWidth: number,
  destinationHeight: number,
  components: number,
  bytesPerSample: 1 | 2,
  simd: boolean | undefined,
  scratch?: ResizeScratch,
): PlaneView {
  let pingPong = 0;
  while (true) {
    const halveWidth = view.width >= destinationWidth * 2;
    const halveHeight = view.height >= destinationHeight * 2;
    if (!halveWidth && !halveHeight) return view;
    view = halvePlane(view, halveWidth, halveHeight, components, bytesPerSample, simd, scratch, pingPong === 0 ? 'plane-halve-a' : 'plane-halve-b');
    pingPong ^= 1;
  }
}

function halvePlane(
  view: PlaneView,
  halveWidth: boolean,
  halveHeight: boolean,
  components: number,
  bytesPerSample: 1 | 2,
  simd: boolean | undefined,
  scratch: ResizeScratch | undefined,
  key: string,
): PlaneView {
  const width = halveWidth ? Math.ceil(view.width / 2) : view.width;
  const height = halveHeight ? Math.ceil(view.height / 2) : view.height;
  const sampleBytes = components * bytesPerSample;
  const stride = width * sampleBytes;
  const data = scratch?.getBytes(key, stride * height) ?? new Uint8Array(stride * height);
  const usedSimd = tryHalvePlaneSimd(view, data, width, height, halveWidth, halveHeight, components, bytesPerSample, simd, scratch);
  if (usedSimd) return { data, offset: 0, stride, width, height };

  for (let y = 0; y < height; y++) {
    const sourceY = halveHeight ? y * 2 : y;
    const nextY = halveHeight ? Math.min(sourceY + 1, view.height - 1) : sourceY;
    const row0 = view.offset + sourceY * view.stride;
    const row1 = view.offset + nextY * view.stride;
    let target = y * stride;
    if (bytesPerSample === 1 && components === 1) {
      const source = view.data;
      if (halveWidth) {
        // The column clamp only applies to the last output pixel when the
        // source width is odd, so the main loop runs without it.
        const pairs = view.width >> 1;
        let source0 = row0;
        let source1 = row1;
        for (let x = 0; x < pairs; x++) {
          data[target] = (source[source0] + source[source0 + 1] + source[source1] + source[source1 + 1] + 2) >> 2;
          target += 1;
          source0 += 2;
          source1 += 2;
        }
        if (pairs < width) {
          const last = view.width - 1;
          data[target] = (source[row0 + last] + source[row1 + last] + 1) >> 1;
        }
      } else {
        for (let x = 0; x < width; x++) {
          data[target] = (source[row0 + x] + source[row1 + x] + 1) >> 1;
          target += 1;
        }
      }
      continue;
    }
    if (bytesPerSample === 1 && components === 4) {
      const source = view.data;
      if (halveWidth) {
        const sourceBase = source.byteOffset + view.offset;
        const targetBase = data.byteOffset;
        const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
        if (littleEndian && (sourceBase & 3) === 0 && (view.stride & 3) === 0 && (targetBase & 3) === 0 && (stride & 3) === 0) {
          const source32 = new Uint32Array(source.buffer, sourceBase, (source.byteLength - view.offset) >> 2);
          const target32 = new Uint32Array(data.buffer, targetBase, data.byteLength >> 2);
          const pairs = view.width >> 1;
          const oddColumn = pairs < width;
          for (let x = 0; x < pairs; x++) {
            const pixel0 = source32[(row0 - view.offset >> 2) + x * 2];
            const pixel1 = source32[(row0 - view.offset >> 2) + x * 2 + 1];
            const pixel2 = source32[(row1 - view.offset >> 2) + x * 2];
            const pixel3 = source32[(row1 - view.offset >> 2) + x * 2 + 1];
            target32[(target >> 2) + x] = avgBytesRounded(avgBytesRounded(pixel0, pixel1), avgBytesRounded(pixel2, pixel3));
          }
          if (oddColumn) {
            const last = view.width - 1;
            const pixel0 = source32[(row0 - view.offset >> 2) + last];
            const pixel1 = source32[(row1 - view.offset >> 2) + last];
            target32[(target >> 2) + pairs] = avgBytesRounded(pixel0, pixel1);
          }
          continue;
        }
        const pairs = view.width >> 1;
        let source0 = row0;
        let source1 = row1;
        for (let x = 0; x < pairs; x++) {
          data[target] = (source[source0] + source[source0 + 4] + source[source1] + source[source1 + 4] + 2) >> 2;
          data[target + 1] = (source[source0 + 1] + source[source0 + 5] + source[source1 + 1] + source[source1 + 5] + 2) >> 2;
          data[target + 2] = (source[source0 + 2] + source[source0 + 6] + source[source1 + 2] + source[source1 + 6] + 2) >> 2;
          data[target + 3] = (source[source0 + 3] + source[source0 + 7] + source[source1 + 3] + source[source1 + 7] + 2) >> 2;
          target += 4;
          source0 += 8;
          source1 += 8;
        }
        if (pairs < width) {
          const last0 = row0 + (view.width - 1) * 4;
          const last1 = row1 + (view.width - 1) * 4;
          data[target] = (source[last0] + source[last1] + 1) >> 1;
          data[target + 1] = (source[last0 + 1] + source[last1 + 1] + 1) >> 1;
          data[target + 2] = (source[last0 + 2] + source[last1 + 2] + 1) >> 1;
          data[target + 3] = (source[last0 + 3] + source[last1 + 3] + 1) >> 1;
        }
      } else {
        let source0 = row0;
        let source1 = row1;
        for (let x = 0; x < width; x++) {
          data[target] = (source[source0] + source[source1] + 1) >> 1;
          data[target + 1] = (source[source0 + 1] + source[source1 + 1] + 1) >> 1;
          data[target + 2] = (source[source0 + 2] + source[source1 + 2] + 1) >> 1;
          data[target + 3] = (source[source0 + 3] + source[source1 + 3] + 1) >> 1;
          target += 4;
          source0 += 4;
          source1 += 4;
        }
      }
      continue;
    }
    if (bytesPerSample === 1) {
      for (let x = 0; x < width; x++) {
        const sourceX = halveWidth ? x * 2 : x;
        const nextX = halveWidth ? Math.min(sourceX + 1, view.width - 1) : sourceX;
        const column0 = sourceX * sampleBytes;
        const column1 = nextX * sampleBytes;
        for (let component = 0; component < components; component++) {
          data[target + component] = (
            view.data[row0 + column0 + component]
              + view.data[row0 + column1 + component]
              + view.data[row1 + column0 + component]
              + view.data[row1 + column1 + component]
              + 2
          ) >> 2;
        }
        target += sampleBytes;
      }
    } else {
      for (let x = 0; x < width; x++) {
        const sourceX = halveWidth ? x * 2 : x;
        const nextX = halveWidth ? Math.min(sourceX + 1, view.width - 1) : sourceX;
        const column0 = sourceX * sampleBytes;
        const column1 = nextX * sampleBytes;
        for (let component = 0; component < components; component++) {
          const offset = component * 2;
          const value = (
            (view.data[row0 + column0 + offset] | (view.data[row0 + column0 + offset + 1] << 8))
              + (view.data[row0 + column1 + offset] | (view.data[row0 + column1 + offset + 1] << 8))
              + (view.data[row1 + column0 + offset] | (view.data[row1 + column0 + offset + 1] << 8))
              + (view.data[row1 + column1 + offset] | (view.data[row1 + column1 + offset + 1] << 8))
              + 2
          ) >> 2;
          data[target + offset] = value;
          data[target + offset + 1] = value >> 8;
        }
        target += sampleBytes;
      }
    }
  }
  return { data, offset: 0, stride, width, height };
}

function resampleNearest(view: PlaneView, options: ConvertPlaneOptions, components: number) {
  const bytesPerSample = options.sourceBytesPerSample;
  const destinationBytesPerSample = options.destinationBytesPerSample;
  const sourceMax = maxSampleValue(options.sourceBitDepth);
  const factor = maxSampleValue(options.destinationBitDepth) / sourceMax;
  const xOffsets = new Int32Array(options.destinationWidth);
  for (let x = 0; x < options.destinationWidth; x++) {
    xOffsets[x] = clamp(Math.round(mapPixelCenter(x, options.destinationWidth, view.width)), 0, view.width - 1) * components * bytesPerSample;
  }

  for (let y = 0; y < options.destinationHeight; y++) {
    const sourceY = clamp(Math.round(mapPixelCenter(y, options.destinationHeight, view.height)), 0, view.height - 1);
    const sourceRow = view.offset + sourceY * view.stride;
    const destinationRow = options.destinationLayout.offset + y * options.destinationLayout.stride;
    for (let x = 0; x < options.destinationWidth; x++) {
      const sourceBase = sourceRow + xOffsets[x];
      const destinationBase = destinationRow + x * components * destinationBytesPerSample;
      for (let component = 0; component < components; component++) {
        const value = bytesPerSample === 1
          ? view.data[sourceBase + component]
          : view.data[sourceBase + component * 2] | (view.data[sourceBase + component * 2 + 1] << 8);
        const converted = Math.round(Math.min(value, sourceMax) * factor);
        const target = destinationBase + component * destinationBytesPerSample;
        options.destination[target] = converted;
        if (destinationBytesPerSample === 2) options.destination[target + 1] = converted >> 8;
      }
    }
  }
}

function resampleBilinear(view: PlaneView, options: ConvertPlaneOptions, components: number) {
  const bytesPerSample = options.sourceBytesPerSample;
  const destinationBytesPerSample = options.destinationBytesPerSample;
  const sourceMax = maxSampleValue(options.sourceBitDepth);
  const factor = maxSampleValue(options.destinationBitDepth) / sourceMax;
  const sampleBytes = components * bytesPerSample;
  const xOffsets0 = new Int32Array(options.destinationWidth);
  const xOffsets1 = new Int32Array(options.destinationWidth);
  const xFractions = new Float32Array(options.destinationWidth);
  for (let x = 0; x < options.destinationWidth; x++) {
    const sourceX = mapPixelCenter(x, options.destinationWidth, view.width);
    const x0 = clamp(Math.floor(sourceX), 0, view.width - 1);
    xOffsets0[x] = x0 * sampleBytes;
    xOffsets1[x] = Math.min(x0 + 1, view.width - 1) * sampleBytes;
    xFractions[x] = clamp(sourceX - x0, 0, 1);
  }

  for (let y = 0; y < options.destinationHeight; y++) {
    const sourceY = mapPixelCenter(y, options.destinationHeight, view.height);
    const y0 = clamp(Math.floor(sourceY), 0, view.height - 1);
    const ty = clamp(sourceY - y0, 0, 1);
    const row0 = view.offset + y0 * view.stride;
    const row1 = view.offset + Math.min(y0 + 1, view.height - 1) * view.stride;
    const destinationRow = options.destinationLayout.offset + y * options.destinationLayout.stride;
    for (let x = 0; x < options.destinationWidth; x++) {
      const tx = xFractions[x];
      const destinationBase = destinationRow + x * components * destinationBytesPerSample;
      for (let component = 0; component < components; component++) {
        const offset = component * bytesPerSample;
        const a = readSampleAt(view.data, row0 + xOffsets0[x] + offset, bytesPerSample);
        const b = readSampleAt(view.data, row0 + xOffsets1[x] + offset, bytesPerSample);
        const c = readSampleAt(view.data, row1 + xOffsets0[x] + offset, bytesPerSample);
        const d = readSampleAt(view.data, row1 + xOffsets1[x] + offset, bytesPerSample);
        const value = Math.round(
          a * (1 - tx) * (1 - ty)
            + b * tx * (1 - ty)
            + c * (1 - tx) * ty
            + d * tx * ty,
        );
        const converted = Math.round(Math.min(value, sourceMax) * factor);
        const target = destinationBase + component * destinationBytesPerSample;
        options.destination[target] = converted;
        if (destinationBytesPerSample === 2) options.destination[target + 1] = converted >> 8;
      }
    }
  }
}

function readSampleAt(data: Uint8Array, offset: number, bytesPerSample: 1 | 2) {
  return bytesPerSample === 1 ? data[offset] : data[offset] | (data[offset + 1] << 8);
}

function resampleConvolution(view: PlaneView, options: ConvertPlaneOptions, components: number) {
  const radius = options.algorithm === 'catmullrom' ? 2 : 3;
  const horizontal = getKernelTable(options.algorithm, view.width, options.destinationWidth, radius, options.scratch);
  const vertical = getKernelTable(options.algorithm, view.height, options.destinationHeight, radius, options.scratch);
  const horizontalFirstCost = view.height * horizontal.weights.length + options.destinationWidth * vertical.weights.length;
  const verticalFirstCost = view.width * vertical.weights.length + options.destinationHeight * horizontal.weights.length;
  const outputComponents = options.skipFourthComponent && components === 4 ? 3 : components;

  const canUseFixedPoint = options.sourceBytesPerSample === 1
    && options.destinationBytesPerSample === 1
    && options.sourceBitDepth === 8
    && options.destinationBitDepth === 8;
  // The fixed-point path (and its SIMD kernels) is horizontal-first only, and
  // it beats the float passes by a wide margin per multiply-accumulate. Prefer
  // it even when vertical-first would do moderately less arithmetic; only an
  // overwhelming vertical-first advantage justifies the float path for 8-bit.
  if (canUseFixedPoint && horizontalFirstCost <= verticalFirstCost * 2) {
    if (tryResampleFixedSimd(view, horizontal, vertical, options, components, outputComponents)) return;
    resampleFixedConvolution(view, horizontal, vertical, options, components, outputComponents);
    return;
  }
  if (horizontalFirstCost <= verticalFirstCost) {
    resampleFloatConvolutionHorizontalFirst(view, horizontal, vertical, options, components);
  } else {
    resampleFloatConvolutionVerticalFirst(view, horizontal, vertical, options, components);
  }
}

function resampleFloatConvolutionHorizontalFirst(
  view: PlaneView,
  horizontal: KernelTable,
  vertical: KernelTable,
  options: ConvertPlaneOptions,
  components: number,
) {
  const rowValues = options.destinationWidth * components;
  const maxSourceRows = maxStripedSourceRows(vertical, options.destinationHeight, CONVOLUTION_STRIPE_ROWS, view.height);
  const intermediate = getFloats(options.scratch, 'plane-intermediate-striped', rowValues * maxSourceRows);

  for (let stripeY = 0; stripeY < options.destinationHeight; stripeY += CONVOLUTION_STRIPE_ROWS) {
    const stripeEnd = Math.min(stripeY + CONVOLUTION_STRIPE_ROWS, options.destinationHeight);
    const { begin, end } = stripedSourceRange(vertical, stripeY, stripeEnd, view.height);
    convolveRowsToFloats(view, horizontal, intermediate, options, components, begin, end);
    accumulateColumnsToPlane(intermediate, vertical, options, components, begin, stripeY, stripeEnd);
  }
}

function resampleFloatConvolutionVerticalFirst(
  view: PlaneView,
  horizontal: KernelTable,
  vertical: KernelTable,
  options: ConvertPlaneOptions,
  components: number,
) {
  const maxSourceColumns = maxStripedSourceRows(horizontal, options.destinationWidth, CONVOLUTION_STRIPE_ROWS, view.width);
  const intermediate = getFloats(options.scratch, 'plane-intermediate-vertical-striped', maxSourceColumns * options.destinationHeight * components);

  for (let stripeX = 0; stripeX < options.destinationWidth; stripeX += CONVOLUTION_STRIPE_ROWS) {
    const stripeEnd = Math.min(stripeX + CONVOLUTION_STRIPE_ROWS, options.destinationWidth);
    const { begin, end } = stripedSourceRange(horizontal, stripeX, stripeEnd, view.width);
    accumulateRowsToFloats(view, vertical, intermediate, components, options.sourceBytesPerSample, begin, end);
    convolveFloatsToPlane(intermediate, horizontal, options, components, end - begin, begin, stripeX, stripeEnd);
  }
}

function tryHalvePlaneSimd(
  view: PlaneView,
  destination: Uint8Array,
  width: number,
  height: number,
  halveWidth: boolean,
  halveHeight: boolean,
  components: number,
  bytesPerSample: 1 | 2,
  simdEnabled: boolean | undefined,
  scratch?: ResizeScratch,
) {
  if (simdEnabled === false) return false;
  if (bytesPerSample !== 1) return false;
  const kind = simdKindForComponents(components);
  if (!kind) return false;
  const simd = peekSimdKind(scratch, kind);
  if (!simd) return false;
  const sourcePtr = pointerForBytes(simd, view.data);
  const destinationPtr = pointerForBytes(simd, destination);
  const halve = halveExportForKind(simd, kind);
  if (!halve) return false;
  halve(
    sourcePtr + view.offset,
    destinationPtr,
    view.width,
    view.height,
    view.stride,
    halveWidth ? 1 : 0,
    halveHeight ? 1 : 0,
  );
  if (destination.buffer !== simd.memory.buffer) {
    destination.set(new Uint8Array(simd.memory.buffer, destinationPtr, width * height * components));
  }
  return true;
}

function tryResampleFixedSimd(
  view: PlaneView,
  horizontal: KernelTable,
  vertical: KernelTable,
  options: ConvertPlaneOptions,
  components: number,
  outputComponents: number,
) {
  if (options.simd === false) return false;
  const kind = simdKindForComponents(components);
  if (!kind) return false;
  const simd = peekSimdKind(options.scratch, kind);
  if (!simd) return false;
  const horizontalWeights = getFixedKernelWeights(horizontal, options.algorithm, view.width, options.destinationWidth, options.scratch);
  const verticalWeights = getFixedKernelWeights(vertical, options.algorithm, view.height, options.destinationHeight, options.scratch);
  const padded = getPaddedHorizontalWeights(horizontal, horizontalWeights, kind, options.algorithm, view.width, options.destinationWidth, options.scratch);
  const sourcePtr = pointerForBytes(simd, view.data);
  const destinationPtr = pointerForOutput(simd, options.destination);
  const horizontalStarts = materializeInt32(options.scratch, `horizontal-starts:${options.algorithm}:${view.width}/${options.destinationWidth}`, horizontal.starts);
  const verticalOffsets = materializeInt32(options.scratch, `vertical-offsets:${options.algorithm}:${view.height}/${options.destinationHeight}`, vertical.offsets);
  const verticalCounts = materializeInt32(options.scratch, `vertical-counts:${options.algorithm}:${view.height}/${options.destinationHeight}`, vertical.counts);
  const verticalStarts = materializeInt32(options.scratch, `vertical-starts:${options.algorithm}:${view.height}/${options.destinationHeight}`, vertical.starts);
  const horizontalStartsPtr = copyInt32(simd, horizontalStarts);
  const horizontalWeightsPtr = copyInt16(simd, padded.weights);
  const verticalOffsetsPtr = copyInt32(simd, verticalOffsets);
  const verticalCountsPtr = copyInt32(simd, verticalCounts);
  const verticalStartsPtr = copyInt32(simd, verticalStarts);
  const verticalWeightsPtr = copyInt16(simd, verticalWeights);

  // Keep fixed-convolution intermediates small enough to stay cache-friendly on 4K inputs.
  const stripeRows = SIMD_FIXED_STRIPE_ROWS;
  const stripeSourceRows = maxStripedSourceRows(vertical, options.destinationHeight, stripeRows, view.height);
  // The c4 kernel always keeps 4 intermediate values per pixel; for
  // 3-component output the alpha lane carries garbage that the vertical pass
  // overwrites with 255.
  const intermediateComponents = kind === 'c4' ? 4 : components;
  const intermediatePtr = simd.allocate(options.destinationWidth * stripeSourceRows * intermediateComponents * Int16Array.BYTES_PER_ELEMENT, 16);
  if (kind === 'c4') {
    simd.exports.resizeFixed8_c4_striped!(
      sourcePtr + view.offset,
      destinationPtr + options.destinationLayout.offset,
      horizontalStartsPtr,
      horizontalWeightsPtr,
      padded.paddedTaps,
      verticalOffsetsPtr,
      verticalCountsPtr,
      verticalStartsPtr,
      verticalWeightsPtr,
      intermediatePtr,
      view.height,
      view.stride,
      options.destinationWidth,
      options.destinationHeight,
      options.destinationLayout.stride,
      outputComponents,
      stripeRows,
    );
  } else {
    const resize = kind === 'c1' ? simd.exports.resizeFixed8_c1_striped! : simd.exports.resizeFixed8_c2_striped!;
    resize(
      sourcePtr + view.offset,
      destinationPtr + options.destinationLayout.offset,
      horizontalStartsPtr,
      horizontalWeightsPtr,
      padded.paddedTaps,
      verticalOffsetsPtr,
      verticalCountsPtr,
      verticalStartsPtr,
      verticalWeightsPtr,
      intermediatePtr,
      view.height,
      view.stride,
      options.destinationWidth,
      options.destinationHeight,
      options.destinationLayout.stride,
      stripeRows,
    );
  }
  if (options.destination.buffer !== simd.memory.buffer) {
    options.destination.set(new Uint8Array(simd.memory.buffer, destinationPtr, options.destination.byteLength));
  }
  return true;
}

const PADDED_TAP_GROUP = { c1: 8, c2: 4, c4: 2 } as const;
const PADDED_WEIGHT_DUP = { c1: 1, c2: 2, c4: 4 } as const;

/**
 * Lays horizontal kernel weights out per output pixel with a uniform,
 * group-aligned tap count (zero padded) and the weight duplicated per
 * component, so the WASM kernels can run a branch-free tap loop with
 * unconditional vector loads.
 */
function getPaddedHorizontalWeights(
  table: KernelTable,
  fixedWeights: Int16Array,
  kind: SimdKind,
  algorithm: CpuResizeAlgorithm,
  sourceSize: number,
  destinationSize: number,
  scratch: ResizeScratch | undefined,
): { weights: Int16Array; paddedTaps: number } {
  const build = () => {
    const group = PADDED_TAP_GROUP[kind];
    const dup = PADDED_WEIGHT_DUP[kind];
    let maxCount = 1;
    for (let x = 0; x < table.counts.length; x++) {
      if (table.counts[x] > maxCount) maxCount = table.counts[x];
    }
    const paddedTaps = Math.ceil(maxCount / group) * group;
    const weights = new Int16Array(destinationSize * paddedTaps * dup);
    for (let x = 0; x < destinationSize; x++) {
      const offset = table.offsets[x];
      const count = table.counts[x];
      const base = x * paddedTaps * dup;
      for (let k = 0; k < count; k++) {
        const weight = fixedWeights[offset + k];
        for (let d = 0; d < dup; d++) weights[base + k * dup + d] = weight;
      }
    }
    return { weights, paddedTaps };
  };
  return scratch
    ? scratch.memo(`plane-kernel-padded:${kind}:${algorithm}:${sourceSize}/${destinationSize}`, build)
    : build();
}

function pointerForBytes(simd: SimdContext, view: Uint8Array) {
  if (view.buffer === simd.memory.buffer) return view.byteOffset;
  const ptr = simd.allocate(view.byteLength, 16);
  new Uint8Array(simd.memory.buffer, ptr, view.byteLength).set(view);
  return ptr;
}

// Like pointerForBytes, but skips the copy-in: the kernel overwrites every
// destination byte, so only the copy-out after the call matters.
function pointerForOutput(simd: SimdContext, view: Uint8Array) {
  if (view.buffer === simd.memory.buffer) return view.byteOffset;
  return simd.allocate(view.byteLength, 16);
}

function materializeInt32(scratch: ResizeScratch | undefined, key: string, source: Int32Array) {
  const target = scratch?.getInts(`plane-kernel-${key}`, source.length);
  if (!target) return source;
  target.set(source);
  return target;
}

function simdKindForComponents(components: number): SimdKind | null {
  if (components === 1) return 'c1';
  if (components === 2) return 'c2';
  if (components === 4) return 'c4';
  return null;
}

function halveExportForKind(simd: SimdContext, kind: SimdKind) {
  if (kind === 'c1') return simd.exports.halve8_c1;
  if (kind === 'c2') return simd.exports.halve8_c2;
  return simd.exports.halve8_c4;
}

function copyInt32(simd: SimdContext, source: Int32Array) {
  if (source.buffer === simd.memory.buffer) return source.byteOffset;
  const ptr = simd.allocate(source.byteLength, Int32Array.BYTES_PER_ELEMENT);
  new Int32Array(simd.memory.buffer, ptr, source.length).set(source);
  return ptr;
}

function copyInt16(simd: SimdContext, source: Int16Array) {
  if (source.buffer === simd.memory.buffer) return source.byteOffset;
  const ptr = simd.allocate(source.byteLength, Int16Array.BYTES_PER_ELEMENT);
  new Int16Array(simd.memory.buffer, ptr, source.length).set(source);
  return ptr;
}

function convolveRowsToFloats(
  view: PlaneView,
  table: KernelTable,
  intermediate: Float32Array,
  options: ConvertPlaneOptions,
  components: number,
  sourceStart: number,
  sourceEnd: number,
) {
  const bytesPerSample = options.sourceBytesPerSample;
  const destinationWidth = table.offsets.length;
  const { offsets, counts, starts, weights } = table;
  const data = view.data;
  const viewOffset = view.offset;
  const viewStride = view.stride;

  if (components === 1 && bytesPerSample === 1) {
    for (let y = sourceStart; y < sourceEnd; y++) {
      const sourceRow = viewOffset + y * viewStride;
      const outputRow = (y - sourceStart) * destinationWidth;
      for (let x = 0; x < destinationWidth; x++) {
        const start = offsets[x];
        const end = start + counts[x];
        let position = sourceRow + starts[x];
        const lastPair = end - 1;
        let value0 = 0;
        let value1 = 0;
        let k = start;
        for (; k < lastPair; k += 2) {
          value0 += data[position] * weights[k];
          value1 += data[position + 1] * weights[k + 1];
          position += 2;
        }
        if (k < end) value0 += data[position] * weights[k];
        intermediate[outputRow + x] = value0 + value1;
      }
    }
    return;
  }
  if (components === 1) {
    for (let y = sourceStart; y < sourceEnd; y++) {
      const sourceRow = viewOffset + y * viewStride;
      const outputRow = (y - sourceStart) * destinationWidth;
      for (let x = 0; x < destinationWidth; x++) {
        const start = offsets[x];
        const end = start + counts[x];
        let position = sourceRow + starts[x] * 2;
        const lastPair = end - 1;
        let value0 = 0;
        let value1 = 0;
        let k = start;
        for (; k < lastPair; k += 2) {
          value0 += (data[position] | (data[position + 1] << 8)) * weights[k];
          value1 += (data[position + 2] | (data[position + 3] << 8)) * weights[k + 1];
          position += 4;
        }
        if (k < end) {
          value0 += (data[position] | (data[position + 1] << 8)) * weights[k];
        }
        intermediate[outputRow + x] = value0 + value1;
      }
    }
    return;
  }
  if (components === 2) {
    for (let y = sourceStart; y < sourceEnd; y++) {
      const sourceRow = viewOffset + y * viewStride;
      let outputBase = (y - sourceStart) * destinationWidth * 2;
      for (let x = 0; x < destinationWidth; x++) {
        const start = offsets[x];
        const end = start + counts[x];
        let position = sourceRow + starts[x] * 2 * bytesPerSample;
        let value0 = 0;
        let value1 = 0;
        if (bytesPerSample === 1) {
          for (let k = start; k < end; k++) {
            const weight = weights[k];
            value0 += data[position] * weight;
            value1 += data[position + 1] * weight;
            position += 2;
          }
        } else {
          for (let k = start; k < end; k++) {
            const weight = weights[k];
            value0 += (data[position] | (data[position + 1] << 8)) * weight;
            value1 += (data[position + 2] | (data[position + 3] << 8)) * weight;
            position += 4;
          }
        }
        intermediate[outputBase] = value0;
        intermediate[outputBase + 1] = value1;
        outputBase += 2;
      }
    }
    return;
  }

  const accumulators = new Float32Array(components);
  for (let y = sourceStart; y < sourceEnd; y++) {
    const sourceRow = viewOffset + y * viewStride;
    const outputRow = (y - sourceStart) * destinationWidth * components;
    for (let x = 0; x < destinationWidth; x++) {
      const start = offsets[x];
      const end = start + counts[x];
      for (let component = 0; component < components; component++) accumulators[component] = 0;
      if (bytesPerSample === 1) {
        let position = sourceRow + starts[x] * components;
        for (let k = start; k < end; k++) {
          const weight = weights[k];
          for (let component = 0; component < components; component++) {
            accumulators[component] += data[position + component] * weight;
          }
          position += components;
        }
      } else {
        let position = sourceRow + starts[x] * components * 2;
        for (let k = start; k < end; k++) {
          const weight = weights[k];
          for (let component = 0; component < components; component++) {
            const offset = position + component * 2;
            accumulators[component] += (data[offset] | (data[offset + 1] << 8)) * weight;
          }
          position += components * 2;
        }
      }
      const outputBase = outputRow + x * components;
      for (let component = 0; component < components; component++) intermediate[outputBase + component] = accumulators[component];
    }
  }
}

function accumulateColumnsToPlane(
  intermediate: Float32Array,
  table: KernelTable,
  options: ConvertPlaneOptions,
  components: number,
  sourceRowOffset: number,
  destinationStart: number,
  destinationEnd: number,
) {
  const rowValues = options.destinationWidth * components;
  const accumulator = getFloats(options.scratch, 'plane-row-accumulator', Math.min(rowValues, FIXED_STRIP_VALUES));
  const { offsets, counts, starts, weights } = table;
  const sourceMax = maxSampleValue(options.sourceBitDepth);
  const factor = maxSampleValue(options.destinationBitDepth) / sourceMax;
  const destination = options.destination;
  const bytesPerSample = options.destinationBytesPerSample;
  const layoutOffset = options.destinationLayout.offset;
  const layoutStride = options.destinationLayout.stride;
  const stripStep = Math.max(components, Math.floor(FIXED_STRIP_VALUES / components) * components);

  for (let strip = 0; strip < rowValues; strip += stripStep) {
    const activeLength = Math.min(stripStep, rowValues - strip);

    for (let y = destinationStart; y < destinationEnd; y++) {
      const start = offsets[y];
      const end = start + counts[y];
      const destinationRow = layoutOffset + y * layoutStride;
      let k = start;
      if (end - k > 2) {
        const weightA = weights[k];
        const weightB = weights[k + 1];
        let rowA = (starts[y] - sourceRowOffset) * rowValues + strip;
        let rowB = rowA + rowValues;
        for (let index = 0; index < activeLength; index++) {
          accumulator[index] = intermediate[rowA + index] * weightA + intermediate[rowB + index] * weightB;
        }
        k += 2;
        const lastPair = end - 2;
        for (; k < lastPair; k += 2) {
          const middleWeightA = weights[k];
          const middleWeightB = weights[k + 1];
          rowA += rowValues * 2;
          rowB += rowValues * 2;
          for (let index = 0; index < activeLength; index++) {
            accumulator[index] += intermediate[rowA + index] * middleWeightA + intermediate[rowB + index] * middleWeightB;
          }
        }
      }
      // The final one or two taps fold into the clamp/store pass so the
      // accumulator is not re-read in a separate output loop. A lone final tap
      // points rowB at rowA with weight zero; the second term adds exactly
      // (+/-)0, which cannot change the stored integer.
      const weightA = weights[k];
      const rowA = (starts[y] - sourceRowOffset + (k - start)) * rowValues + strip;
      const hasPair = k + 1 < end;
      const weightB = hasPair ? weights[k + 1] : 0;
      const rowB = hasPair ? rowA + rowValues : rowA;
      if (bytesPerSample === 1) {
        if (end - start > 2) {
          for (let index = 0; index < activeLength; index++) {
            const value = accumulator[index] + intermediate[rowA + index] * weightA + intermediate[rowB + index] * weightB;
            destination[destinationRow + strip + index] = (clamp(value, 0, sourceMax) * factor + 0.5) | 0;
          }
        } else {
          for (let index = 0; index < activeLength; index++) {
            const value = intermediate[rowA + index] * weightA + intermediate[rowB + index] * weightB;
            destination[destinationRow + strip + index] = (clamp(value, 0, sourceMax) * factor + 0.5) | 0;
          }
        }
      } else {
        let byte = strip * 2;
        if (end - start > 2) {
          for (let index = 0; index < activeLength; index++, byte += 2) {
            const value = accumulator[index] + intermediate[rowA + index] * weightA + intermediate[rowB + index] * weightB;
            const converted = (clamp(value, 0, sourceMax) * factor + 0.5) | 0;
            destination[destinationRow + byte] = converted;
            destination[destinationRow + byte + 1] = converted >> 8;
          }
        } else {
          for (let index = 0; index < activeLength; index++, byte += 2) {
            const value = intermediate[rowA + index] * weightA + intermediate[rowB + index] * weightB;
            const converted = (clamp(value, 0, sourceMax) * factor + 0.5) | 0;
            destination[destinationRow + byte] = converted;
            destination[destinationRow + byte + 1] = converted >> 8;
          }
        }
      }
    }
  }
}

function accumulateRowsToFloats(
  view: PlaneView,
  table: KernelTable,
  intermediate: Float32Array,
  components: number,
  bytesPerSample: 1 | 2,
  sourceColumnStart: number,
  sourceColumnEnd: number,
) {
  const intermediateWidth = sourceColumnEnd - sourceColumnStart;
  const rowValues = intermediateWidth * components;
  const { offsets, counts, starts, weights } = table;
  const data = view.data;

  const viewOffset = view.offset;
  const viewStride = view.stride;
  const sourceByteOffset = sourceColumnStart * components * bytesPerSample;
  for (let y = 0; y < offsets.length; y++) {
    const outputRow = y * rowValues;
    const start = offsets[y];
    const end = start + counts[y];
    const lastPair = end - 1;
    if (bytesPerSample === 1) {
      let k = start;
      if (k < lastPair) {
        const weightA = weights[k];
        const weightB = weights[k + 1];
        const rowA = viewOffset + starts[y] * viewStride + sourceByteOffset;
        const rowB = rowA + viewStride;
        for (let index = 0; index < rowValues; index++) {
          intermediate[outputRow + index] = data[rowA + index] * weightA + data[rowB + index] * weightB;
        }
        k += 2;
      } else {
        const weight = weights[k];
        const sourceRow = viewOffset + starts[y] * viewStride + sourceByteOffset;
        for (let index = 0; index < rowValues; index++) intermediate[outputRow + index] = data[sourceRow + index] * weight;
        k += 1;
      }
      for (; k < lastPair; k += 2) {
        const weightA = weights[k];
        const weightB = weights[k + 1];
        const rowA = viewOffset + (starts[y] + k - start) * viewStride + sourceByteOffset;
        const rowB = rowA + viewStride;
        for (let index = 0; index < rowValues; index++) {
          intermediate[outputRow + index] += data[rowA + index] * weightA + data[rowB + index] * weightB;
        }
      }
      if (k < end) {
        const weight = weights[k];
        const sourceRow = viewOffset + (starts[y] + k - start) * viewStride + sourceByteOffset;
        for (let index = 0; index < rowValues; index++) intermediate[outputRow + index] += data[sourceRow + index] * weight;
      }
    } else {
      let k = start;
      if (k < lastPair) {
        const weightA = weights[k];
        const weightB = weights[k + 1];
        const rowA = viewOffset + starts[y] * viewStride + sourceByteOffset;
        const rowB = rowA + viewStride;
        for (let index = 0, byte = 0; index < rowValues; index++, byte += 2) {
          intermediate[outputRow + index] = (data[rowA + byte] | (data[rowA + byte + 1] << 8)) * weightA
            + (data[rowB + byte] | (data[rowB + byte + 1] << 8)) * weightB;
        }
        k += 2;
      } else {
        const weight = weights[k];
        const sourceRow = viewOffset + starts[y] * viewStride + sourceByteOffset;
        for (let index = 0, byte = 0; index < rowValues; index++, byte += 2) {
          intermediate[outputRow + index] = (data[sourceRow + byte] | (data[sourceRow + byte + 1] << 8)) * weight;
        }
        k += 1;
      }
      for (; k < lastPair; k += 2) {
        const weightA = weights[k];
        const weightB = weights[k + 1];
        const rowA = viewOffset + (starts[y] + k - start) * viewStride + sourceByteOffset;
        const rowB = rowA + viewStride;
        for (let index = 0, byte = 0; index < rowValues; index++, byte += 2) {
          intermediate[outputRow + index] += (data[rowA + byte] | (data[rowA + byte + 1] << 8)) * weightA
            + (data[rowB + byte] | (data[rowB + byte + 1] << 8)) * weightB;
        }
      }
      if (k < end) {
        const weight = weights[k];
        const sourceRow = viewOffset + (starts[y] + k - start) * viewStride + sourceByteOffset;
        for (let index = 0, byte = 0; index < rowValues; index++, byte += 2) {
          intermediate[outputRow + index] += (data[sourceRow + byte] | (data[sourceRow + byte + 1] << 8)) * weight;
        }
      }
    }
  }
}

function convolveFloatsToPlane(
  intermediate: Float32Array,
  table: KernelTable,
  options: ConvertPlaneOptions,
  components: number,
  intermediateWidth: number,
  sourceColumnOffset: number,
  destinationStart: number,
  destinationEnd: number,
) {
  const { offsets, counts, starts, weights } = table;
  const sourceMax = maxSampleValue(options.sourceBitDepth);
  const factor = maxSampleValue(options.destinationBitDepth) / sourceMax;
  const destination = options.destination;
  const bytesPerSample = options.destinationBytesPerSample;
  const destinationHeight = options.destinationHeight;
  const layoutOffset = options.destinationLayout.offset;
  const layoutStride = options.destinationLayout.stride;
  const rowValues = intermediateWidth * components;
  const accumulators = new Float32Array(components);

  for (let y = 0; y < destinationHeight; y++) {
    const intermediateRow = y * rowValues;
    const destinationRow = layoutOffset + y * layoutStride;
    if (components === 1) {
      let target = destinationRow + destinationStart * bytesPerSample;
      for (let x = destinationStart; x < destinationEnd; x++) {
        const start = offsets[x];
        const end = start + counts[x];
        let position = intermediateRow + (starts[x] - sourceColumnOffset) * components;
        const lastPair = end - 1;
        let value0 = 0;
        let value1 = 0;
        let k = start;
        for (; k < lastPair; k += 2) {
          value0 += intermediate[position] * weights[k];
          value1 += intermediate[position + components] * weights[k + 1];
          position += components * 2;
        }
        if (k < end) value0 += intermediate[position] * weights[k];
        const converted = (clamp(value0 + value1, 0, sourceMax) * factor + 0.5) | 0;
        destination[target] = converted;
        if (bytesPerSample === 2) destination[target + 1] = converted >> 8;
        target += bytesPerSample;
      }
      continue;
    }
    if (components === 4) {
      const pixelBytes = 4 * bytesPerSample;
      let destinationBase = destinationRow + destinationStart * pixelBytes;
      for (let x = destinationStart; x < destinationEnd; x++) {
        const start = offsets[x];
        const end = start + counts[x];
        let position = intermediateRow + (starts[x] - sourceColumnOffset) * 4;
        const lastPair = end - 1;
        let value0 = 0;
        let value1 = 0;
        let value2 = 0;
        let value3 = 0;
        let k = start;
        for (; k < lastPair; k += 2) {
          const weightA = weights[k];
          const positionB = position + 4;
          const weightB = weights[k + 1];
          value0 += intermediate[position] * weightA + intermediate[positionB] * weightB;
          value1 += intermediate[position + 1] * weightA + intermediate[positionB + 1] * weightB;
          value2 += intermediate[position + 2] * weightA + intermediate[positionB + 2] * weightB;
          value3 += intermediate[position + 3] * weightA + intermediate[positionB + 3] * weightB;
          position += 8;
        }
        if (k < end) {
          const weight = weights[k];
          value0 += intermediate[position] * weight;
          value1 += intermediate[position + 1] * weight;
          value2 += intermediate[position + 2] * weight;
          value3 += intermediate[position + 3] * weight;
        }
        const converted0 = (clamp(value0, 0, sourceMax) * factor + 0.5) | 0;
        const converted1 = (clamp(value1, 0, sourceMax) * factor + 0.5) | 0;
        const converted2 = (clamp(value2, 0, sourceMax) * factor + 0.5) | 0;
        const converted3 = (clamp(value3, 0, sourceMax) * factor + 0.5) | 0;
        if (bytesPerSample === 1) {
          destination[destinationBase] = converted0;
          destination[destinationBase + 1] = converted1;
          destination[destinationBase + 2] = converted2;
          destination[destinationBase + 3] = converted3;
        } else {
          destination[destinationBase] = converted0;
          destination[destinationBase + 1] = converted0 >> 8;
          destination[destinationBase + 2] = converted1;
          destination[destinationBase + 3] = converted1 >> 8;
          destination[destinationBase + 4] = converted2;
          destination[destinationBase + 5] = converted2 >> 8;
          destination[destinationBase + 6] = converted3;
          destination[destinationBase + 7] = converted3 >> 8;
        }
        destinationBase += pixelBytes;
      }
      continue;
    }
    const pixelBytes = components * bytesPerSample;
    let destinationBase = destinationRow + destinationStart * pixelBytes;
    for (let x = destinationStart; x < destinationEnd; x++) {
      const start = offsets[x];
      const end = start + counts[x];
      for (let component = 0; component < components; component++) accumulators[component] = 0;
      let position = intermediateRow + (starts[x] - sourceColumnOffset) * components;
      for (let k = start; k < end; k++) {
        const weight = weights[k];
        for (let component = 0; component < components; component++) accumulators[component] += intermediate[position + component] * weight;
        position += components;
      }
      for (let component = 0; component < components; component++) {
        const converted = (clamp(accumulators[component], 0, sourceMax) * factor + 0.5) | 0;
        const target = destinationBase + component * bytesPerSample;
        destination[target] = converted;
        if (bytesPerSample === 2) destination[target + 1] = converted >> 8;
      }
      destinationBase += pixelBytes;
    }
  }
}

// Fixed-point 8-bit convolution: weights are scaled by 2^14, the horizontal
// pass descales its row sums by 2^8 so the vertical accumulation of
// (intermediate * weight) stays within int32 range.
const FIXED_WEIGHT_SHIFT = 14;
const FIXED_INTERMEDIATE_SHIFT = 8;
const FIXED_OUTPUT_SHIFT = FIXED_WEIGHT_SHIFT * 2 - FIXED_INTERMEDIATE_SHIFT;
const FIXED_STRIP_VALUES = 1024;
const CONVOLUTION_STRIPE_ROWS = 64;

function resampleFixedConvolution(
  view: PlaneView,
  horizontal: KernelTable,
  vertical: KernelTable,
  options: ConvertPlaneOptions,
  components: number,
  outputComponents: number,
) {
  const rowValues = options.destinationWidth * outputComponents;
  const maxSourceRows = maxStripedSourceRows(vertical, options.destinationHeight, CONVOLUTION_STRIPE_ROWS, view.height);
  const intermediate = options.scratch?.getShorts('plane-intermediate-fixed-striped', rowValues * maxSourceRows)
    ?? new Int16Array(rowValues * maxSourceRows);

  for (let stripeY = 0; stripeY < options.destinationHeight; stripeY += CONVOLUTION_STRIPE_ROWS) {
    const stripeEnd = Math.min(stripeY + CONVOLUTION_STRIPE_ROWS, options.destinationHeight);
    const { begin, end } = stripedSourceRange(vertical, stripeY, stripeEnd, view.height);
    convolveRowsToFixed(view, horizontal, intermediate, options, components, outputComponents, begin, end);
    accumulateColumnsFixedToPlane(intermediate, vertical, options, components, outputComponents, view.height, begin, stripeY, stripeEnd);
  }
}

function stripedSourceRange(table: KernelTable, destinationStart: number, destinationEnd: number, sourceHeight: number) {
  let begin = sourceHeight;
  let end = 0;
  for (let y = destinationStart; y < destinationEnd; y++) {
    const start = table.starts[y];
    const count = table.counts[y];
    begin = Math.min(begin, start);
    end = Math.max(end, start + count);
  }
  return {
    begin: Math.max(0, begin),
    end: Math.min(sourceHeight, end),
  };
}

function maxStripedSourceRows(table: KernelTable, destinationHeight: number, stripeRows: number, sourceHeight: number) {
  let maxRows = 0;
  for (let y = 0; y < destinationHeight; y += stripeRows) {
    const { begin, end } = stripedSourceRange(table, y, Math.min(y + stripeRows, destinationHeight), sourceHeight);
    maxRows = Math.max(maxRows, end - begin);
  }
  return Math.max(1, maxRows);
}

function convolveRowsToFixed(
  view: PlaneView,
  table: KernelTable,
  intermediate: Int16Array,
  options: ConvertPlaneOptions,
  components: number,
  outputComponents: number,
  sourceStart: number,
  sourceEnd: number,
) {
  const destinationWidth = table.offsets.length;
  const fixedWeights = getFixedKernelWeights(table, options.algorithm, view.width, destinationWidth, options.scratch);
  const { offsets, counts, starts } = table;
  const data = view.data;
  const viewOffset = view.offset;
  const viewStride = view.stride;
  const half = 1 << (FIXED_INTERMEDIATE_SHIFT - 1);

  if (components === 1) {
    for (let y = sourceStart; y < sourceEnd; y++) {
      const sourceRow = viewOffset + y * viewStride;
      const outputRow = (y - sourceStart) * destinationWidth;
      for (let x = 0; x < destinationWidth; x++) {
        const start = offsets[x];
        const end = start + counts[x];
        let position = sourceRow + starts[x];
        const lastPair = end - 1;
        let value0 = 0;
        let value1 = 0;
        let k = start;
        for (; k < lastPair; k += 2) {
          value0 += data[position] * fixedWeights[k];
          value1 += data[position + 1] * fixedWeights[k + 1];
          position += 2;
        }
        if (k < end) value0 += data[position] * fixedWeights[k];
        intermediate[outputRow + x] = (value0 + value1 + half) >> FIXED_INTERMEDIATE_SHIFT;
      }
    }
    return;
  }

  if (components === 2) {
    for (let y = sourceStart; y < sourceEnd; y++) {
      const sourceRow = viewOffset + y * viewStride;
      let outputBase = (y - sourceStart) * destinationWidth * 2;
      for (let x = 0; x < destinationWidth; x++) {
        const start = offsets[x];
        const end = start + counts[x];
        let position = sourceRow + starts[x] * 2;
        let value0 = 0;
        let value1 = 0;
        for (let k = start; k < end; k++) {
          const weight = fixedWeights[k];
          value0 += data[position] * weight;
          value1 += data[position + 1] * weight;
          position += 2;
        }
        intermediate[outputBase] = (value0 + half) >> FIXED_INTERMEDIATE_SHIFT;
        intermediate[outputBase + 1] = (value1 + half) >> FIXED_INTERMEDIATE_SHIFT;
        outputBase += 2;
      }
    }
    return;
  }

  if (components === 4) {
    const base = data.byteOffset + viewOffset;
    const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
    if (littleEndian && (base & 3) === 0 && (viewStride & 3) === 0) {
      // Aligned RGBA rows: read one 32-bit word per pixel and unpack the four
      // channels with shifts instead of four byte loads.
      const data32 = new Uint32Array(data.buffer, base, (data.byteLength - viewOffset) >> 2);
      const strideWords = viewStride >> 2;
      for (let y = sourceStart; y < sourceEnd; y += 2) {
        const sourceRow = y * strideWords;
        let outputBase = (y - sourceStart) * destinationWidth * outputComponents;
        const hasSecondRow = y + 1 < sourceEnd;
        let outputBaseB = outputBase + destinationWidth * outputComponents;
        for (let x = 0; x < destinationWidth; x++) {
          const start = offsets[x];
          const end = start + counts[x];
          let position = sourceRow + starts[x];
          const lastPair = end - 1;
          let value0 = 0;
          let value1 = 0;
          let value2 = 0;
          let value3 = 0;
          let value4 = 0;
          let value5 = 0;
          let value6 = 0;
          let value7 = 0;
          let k = start;
          for (; k < lastPair; k += 2) {
            const pixelA = data32[position];
            const weightA = fixedWeights[k];
            const pixelB = data32[position + 1];
            const weightB = fixedWeights[k + 1];
            value0 += (pixelA & 255) * weightA + (pixelB & 255) * weightB;
            value1 += ((pixelA >>> 8) & 255) * weightA + ((pixelB >>> 8) & 255) * weightB;
            value2 += ((pixelA >>> 16) & 255) * weightA + ((pixelB >>> 16) & 255) * weightB;
            if (outputComponents === 4) value3 += (pixelA >>> 24) * weightA + (pixelB >>> 24) * weightB;
            if (hasSecondRow) {
              const pixelC = data32[position + strideWords];
              const pixelD = data32[position + strideWords + 1];
              value4 += (pixelC & 255) * weightA + (pixelD & 255) * weightB;
              value5 += ((pixelC >>> 8) & 255) * weightA + ((pixelD >>> 8) & 255) * weightB;
              value6 += ((pixelC >>> 16) & 255) * weightA + ((pixelD >>> 16) & 255) * weightB;
              if (outputComponents === 4) value7 += (pixelC >>> 24) * weightA + (pixelD >>> 24) * weightB;
            }
            position += 2;
          }
          if (k < end) {
            const pixel = data32[position];
            const weight = fixedWeights[k];
            value0 += (pixel & 255) * weight;
            value1 += ((pixel >>> 8) & 255) * weight;
            value2 += ((pixel >>> 16) & 255) * weight;
            if (outputComponents === 4) value3 += (pixel >>> 24) * weight;
            if (hasSecondRow) {
              const pixelB = data32[position + strideWords];
              value4 += (pixelB & 255) * weight;
              value5 += ((pixelB >>> 8) & 255) * weight;
              value6 += ((pixelB >>> 16) & 255) * weight;
              if (outputComponents === 4) value7 += (pixelB >>> 24) * weight;
            }
          }
          intermediate[outputBase] = (value0 + half) >> FIXED_INTERMEDIATE_SHIFT;
          intermediate[outputBase + 1] = (value1 + half) >> FIXED_INTERMEDIATE_SHIFT;
          intermediate[outputBase + 2] = (value2 + half) >> FIXED_INTERMEDIATE_SHIFT;
          if (outputComponents === 4) intermediate[outputBase + 3] = (value3 + half) >> FIXED_INTERMEDIATE_SHIFT;
          if (hasSecondRow) {
            intermediate[outputBaseB] = (value4 + half) >> FIXED_INTERMEDIATE_SHIFT;
            intermediate[outputBaseB + 1] = (value5 + half) >> FIXED_INTERMEDIATE_SHIFT;
            intermediate[outputBaseB + 2] = (value6 + half) >> FIXED_INTERMEDIATE_SHIFT;
            if (outputComponents === 4) intermediate[outputBaseB + 3] = (value7 + half) >> FIXED_INTERMEDIATE_SHIFT;
            outputBaseB += outputComponents;
          }
          outputBase += outputComponents;
        }
      }
      return;
    }
    for (let y = sourceStart; y < sourceEnd; y++) {
      const sourceRow = viewOffset + y * viewStride;
      let outputBase = (y - sourceStart) * destinationWidth * outputComponents;
      for (let x = 0; x < destinationWidth; x++) {
        const start = offsets[x];
        const end = start + counts[x];
        let position = sourceRow + starts[x] * 4;
        const lastPair = end - 1;
        let value0 = 0;
        let value1 = 0;
        let value2 = 0;
        let value3 = 0;
        let k = start;
        for (; k < lastPair; k += 2) {
          const weightA = fixedWeights[k];
          const positionB = position + 4;
          const weightB = fixedWeights[k + 1];
          value0 += data[position] * weightA + data[positionB] * weightB;
          value1 += data[position + 1] * weightA + data[positionB + 1] * weightB;
          value2 += data[position + 2] * weightA + data[positionB + 2] * weightB;
          if (outputComponents === 4) value3 += data[position + 3] * weightA + data[positionB + 3] * weightB;
          position += 8;
        }
        if (k < end) {
          const weight = fixedWeights[k];
          value0 += data[position] * weight;
          value1 += data[position + 1] * weight;
          value2 += data[position + 2] * weight;
          if (outputComponents === 4) value3 += data[position + 3] * weight;
        }
        intermediate[outputBase] = (value0 + half) >> FIXED_INTERMEDIATE_SHIFT;
        intermediate[outputBase + 1] = (value1 + half) >> FIXED_INTERMEDIATE_SHIFT;
        intermediate[outputBase + 2] = (value2 + half) >> FIXED_INTERMEDIATE_SHIFT;
        if (outputComponents === 4) intermediate[outputBase + 3] = (value3 + half) >> FIXED_INTERMEDIATE_SHIFT;
        outputBase += outputComponents;
      }
    }
    return;
  }

  const accumulators = new Int32Array(components);
  for (let y = sourceStart; y < sourceEnd; y++) {
    const sourceRow = viewOffset + y * viewStride;
    const outputRow = (y - sourceStart) * destinationWidth * components;
    for (let x = 0; x < destinationWidth; x++) {
      const start = offsets[x];
      const end = start + counts[x];
      let position = sourceRow + starts[x] * components;
      for (let component = 0; component < components; component++) accumulators[component] = 0;
      for (let k = start; k < end; k++) {
        const weight = fixedWeights[k];
        for (let component = 0; component < components; component++) {
          accumulators[component] += data[position + component] * weight;
        }
        position += components;
      }
      const outputBase = outputRow + x * components;
      for (let component = 0; component < components; component++) {
        intermediate[outputBase + component] = (accumulators[component] + half) >> FIXED_INTERMEDIATE_SHIFT;
      }
    }
  }
}

function accumulateColumnsFixedToPlane(
  intermediate: Int16Array,
  table: KernelTable,
  options: ConvertPlaneOptions,
  components: number,
  outputComponents: number,
  sourceHeight: number,
  sourceRowOffset: number,
  destinationStart: number,
  destinationEnd: number,
) {
  const rowValues = options.destinationWidth * outputComponents;
  const accumulator = options.scratch?.getInts('plane-row-accumulator-fixed', Math.min(rowValues, FIXED_STRIP_VALUES))
    ?? new Int32Array(Math.min(rowValues, FIXED_STRIP_VALUES));
  const fixedWeights = getFixedKernelWeights(table, options.algorithm, sourceHeight, table.offsets.length, options.scratch);
  const { offsets, counts, starts } = table;
  const destination = options.destination;
  const layoutOffset = options.destinationLayout.offset;
  const layoutStride = options.destinationLayout.stride;
  const half = 1 << (FIXED_OUTPUT_SHIFT - 1);
  const expandFourth = components === 4 && outputComponents === 3;
  const stripStep = Math.max(outputComponents, Math.floor(FIXED_STRIP_VALUES / outputComponents) * outputComponents);

  for (let strip = 0; strip < rowValues; strip += stripStep) {
    const activeLength = Math.min(stripStep, rowValues - strip);

    for (let y = destinationStart; y < destinationEnd; y++) {
      const start = offsets[y];
      const end = start + counts[y];
      const destinationRow = layoutOffset + y * layoutStride;
      let k = start;
      if (end - k > 2) {
        const weightA = fixedWeights[k];
        const weightB = fixedWeights[k + 1];
        let rowA = (starts[y] - sourceRowOffset) * rowValues + strip;
        let rowB = rowA + rowValues;
        for (let index = 0; index < activeLength; index++) {
          accumulator[index] = intermediate[rowA + index] * weightA + intermediate[rowB + index] * weightB;
        }
        k += 2;
        const lastPair = end - 2;
        for (; k < lastPair; k += 2) {
          const middleWeightA = fixedWeights[k];
          const middleWeightB = fixedWeights[k + 1];
          rowA += rowValues * 2;
          rowB += rowValues * 2;
          for (let index = 0; index < activeLength; index++) {
            accumulator[index] += intermediate[rowA + index] * middleWeightA + intermediate[rowB + index] * middleWeightB;
          }
        }
      }
      const weightA = fixedWeights[k];
      const rowA = (starts[y] - sourceRowOffset + (k - start)) * rowValues + strip;
      const hasPair = k + 1 < end;
      const weightB = hasPair ? fixedWeights[k + 1] : 0;
      const rowB = hasPair ? rowA + rowValues : rowA;
      if (expandFourth) {
        let dest = destinationRow + (strip / 3 | 0) * 4;
        if (end - start > 2) {
          for (let index = 0; index < activeLength; index += 3) {
            let value = (accumulator[index] + intermediate[rowA + index] * weightA + intermediate[rowB + index] * weightB + half) >> FIXED_OUTPUT_SHIFT;
            destination[dest] = value < 0 ? 0 : value > 255 ? 255 : value;
            value = (accumulator[index + 1] + intermediate[rowA + index + 1] * weightA + intermediate[rowB + index + 1] * weightB + half) >> FIXED_OUTPUT_SHIFT;
            destination[dest + 1] = value < 0 ? 0 : value > 255 ? 255 : value;
            value = (accumulator[index + 2] + intermediate[rowA + index + 2] * weightA + intermediate[rowB + index + 2] * weightB + half) >> FIXED_OUTPUT_SHIFT;
            destination[dest + 2] = value < 0 ? 0 : value > 255 ? 255 : value;
            destination[dest + 3] = 255;
            dest += 4;
          }
        } else {
          for (let index = 0; index < activeLength; index += 3) {
            let value = (intermediate[rowA + index] * weightA + intermediate[rowB + index] * weightB + half) >> FIXED_OUTPUT_SHIFT;
            destination[dest] = value < 0 ? 0 : value > 255 ? 255 : value;
            value = (intermediate[rowA + index + 1] * weightA + intermediate[rowB + index + 1] * weightB + half) >> FIXED_OUTPUT_SHIFT;
            destination[dest + 1] = value < 0 ? 0 : value > 255 ? 255 : value;
            value = (intermediate[rowA + index + 2] * weightA + intermediate[rowB + index + 2] * weightB + half) >> FIXED_OUTPUT_SHIFT;
            destination[dest + 2] = value < 0 ? 0 : value > 255 ? 255 : value;
            destination[dest + 3] = 255;
            dest += 4;
          }
        }
      } else if (end - start > 2) {
        for (let index = 0; index < activeLength; index++) {
          const total = accumulator[index] + intermediate[rowA + index] * weightA + intermediate[rowB + index] * weightB;
          const value = (total + half) >> FIXED_OUTPUT_SHIFT;
          destination[destinationRow + strip + index] = value < 0 ? 0 : value > 255 ? 255 : value;
        }
      } else {
        for (let index = 0; index < activeLength; index++) {
          const total = intermediate[rowA + index] * weightA + intermediate[rowB + index] * weightB;
          const value = (total + half) >> FIXED_OUTPUT_SHIFT;
          destination[destinationRow + strip + index] = value < 0 ? 0 : value > 255 ? 255 : value;
        }
      }
    }
  }
}

function getFixedKernelWeights(
  table: KernelTable,
  algorithm: CpuResizeAlgorithm,
  sourceSize: number,
  destinationSize: number,
  scratch?: ResizeScratch,
): Int16Array {
  const fixed = scratch?.getShorts(`plane-kernel-fixed:${algorithm}:${sourceSize}/${destinationSize}`, table.weights.length)
    ?? new Int16Array(table.weights.length);
  for (let index = 0; index < fixed.length; index++) {
    fixed[index] = Math.round(table.weights[index] * (1 << FIXED_WEIGHT_SHIFT));
  }
  return fixed;
}

function getFloats(scratch: ResizeScratch | undefined, key: string, length: number) {
  return scratch?.getFloats(key, length) ?? new Float32Array(length);
}

function getKernelTable(
  algorithm: CpuResizeAlgorithm,
  sourceSize: number,
  destinationSize: number,
  radius: number,
  scratch?: ResizeScratch,
): KernelTable {
  const build = () => buildKernelTable(algorithm, sourceSize, destinationSize, radius);
  if (!scratch) return build();
  return scratch.memo(`plane-kernel:${algorithm}:${sourceSize}/${destinationSize}`, build);
}

function kernelWeight(algorithm: CpuResizeAlgorithm, distance: number, radius: number) {
  return algorithm === 'catmullrom' ? catmullRomWeight(distance) : lanczosWeight(distance, radius);
}

function lanczosWeight(distance: number, radius: number) {
  const absoluteDistance = Math.abs(distance);
  if (absoluteDistance === 0) return 1;
  if (absoluteDistance >= radius) return 0;
  return sinc(absoluteDistance) * sinc(absoluteDistance / radius);
}

function catmullRomWeight(distance: number) {
  const absoluteDistance = Math.abs(distance);
  if (absoluteDistance < 1) {
    return ((1.5 * absoluteDistance - 2.5) * absoluteDistance) * absoluteDistance + 1;
  }
  if (absoluteDistance < 2) {
    return (((-0.5 * absoluteDistance + 2.5) * absoluteDistance) - 4) * absoluteDistance + 2;
  }
  return 0;
}

function sinc(value: number) {
  const angle = Math.PI * value;
  return Math.sin(angle) / angle;
}

function buildKernelTable(algorithm: CpuResizeAlgorithm, sourceSize: number, destinationSize: number, radius: number): KernelTable {
  const scale = destinationSize / sourceSize;
  const filterScale = Math.min(1, scale);
  const sourceRadius = Math.ceil(radius / filterScale);
  const offsets = new Int32Array(destinationSize);
  const counts = new Int32Array(destinationSize);
  const starts = new Int32Array(destinationSize);
  const weights: number[] = [];

  for (let destination = 0; destination < destinationSize; destination++) {
    const sourceCenter = mapPixelCenter(destination, destinationSize, sourceSize);
    const left = Math.ceil(sourceCenter - sourceRadius);
    const right = Math.floor(sourceCenter + sourceRadius);
    offsets[destination] = weights.length;
    let weightTotal = 0;
    let runStart = sourceSize;
    let runEnd = -1;
    const merged = new Map<number, number>();

    for (let source = left; source <= right; source++) {
      const weight = kernelWeight(algorithm, (sourceCenter - source) * filterScale, radius);
      if (weight === 0) continue;
      const clamped = clamp(source, 0, sourceSize - 1);
      merged.set(clamped, (merged.get(clamped) ?? 0) + weight);
      weightTotal += weight;
    }

    const start = offsets[destination];
    if (weightTotal === 0) {
      starts[destination] = clamp(Math.round(sourceCenter), 0, sourceSize - 1);
      weights.push(1);
      counts[destination] = 1;
      continue;
    }
    for (const source of merged.keys()) {
      if (source < runStart) runStart = source;
      if (source > runEnd) runEnd = source;
    }
    while (runStart <= runEnd && (merged.get(runStart) ?? 0) === 0) runStart++;
    while (runEnd >= runStart && (merged.get(runEnd) ?? 0) === 0) runEnd--;
    starts[destination] = runStart;
    for (let source = runStart; source <= runEnd; source++) {
      weights.push((merged.get(source) ?? 0) / weightTotal);
    }
    counts[destination] = weights.length - start;
  }

  return {
    offsets,
    counts,
    starts,
    weights: Float32Array.from(weights),
  };
}

function maxSampleValue(bitDepth: 8 | 10 | 12) {
  return 2 ** bitDepth - 1;
}

function avgBytesRounded(a: number, b: number) {
  return (a | b) - (((a ^ b) & 0xfefefefe) >>> 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
