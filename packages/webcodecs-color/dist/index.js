// src/index.ts
async function decodeImageToVideoFrame(data, type, options = {}) {
  if (typeof ImageDecoder === "undefined") throw new Error("ImageDecoder API is not available in this environment");
  const decoder = new ImageDecoder({
    data: copyArrayBuffer(data),
    type,
    colorSpaceConversion: options.colorSpaceConversion ?? "none",
    desiredWidth: options.desiredWidth,
    desiredHeight: options.desiredHeight
  });
  try {
    const result = await decoder.decode({ frameIndex: 0, completeFramesOnly: true });
    return result.image;
  } finally {
    decoder.close();
  }
}
function inspectFrame(frame) {
  const colorSpace = frame.colorSpace;
  return {
    format: frame.format,
    codedWidth: frame.codedWidth,
    codedHeight: frame.codedHeight,
    displayWidth: frame.displayWidth,
    displayHeight: frame.displayHeight,
    timestamp: frame.timestamp,
    duration: frame.duration ?? null,
    colorSpace: {
      primaries: colorSpace.primaries,
      transfer: colorSpace.transfer,
      matrix: colorSpace.matrix,
      fullRange: colorSpace.fullRange
    }
  };
}
function classifyFrameColor(frameOrInspection) {
  const inspection = frameOrInspection instanceof VideoFrame ? inspectFrame(frameOrInspection) : frameOrInspection;
  const { primaries, transfer } = inspection.colorSpace;
  const isBt709OrUnknown = primaries === "bt709" || primaries === null;
  const isDisplayP3Like = primaries === "smpte432";
  const isBt2020 = primaries === "bt2020";
  const isHdrTransfer = transfer === "pq" || transfer === "hlg";
  const isHdrLike = isBt2020 || isHdrTransfer;
  const isWideGamut = isDisplayP3Like || isBt2020;
  const isSimpleSdr = isBt709OrUnknown && !isHdrTransfer;
  const canvasColorSpace = isWideGamut ? "display-p3" : "srgb";
  const recommendedPath = isHdrLike ? "raw-or-webgpu-hdr" : isWideGamut ? "canvas-display-p3" : "canvas-sdr";
  const notes = [];
  if (isHdrLike) {
    notes.push("BT.2020/PQ/HLG-like frames should not be treated as lossless Canvas 2D round-trips.");
  }
  if (isWideGamut && !isHdrLike) {
    notes.push("Display P3 Canvas 2D is a practical SDR wide-gamut path.");
  }
  if (isSimpleSdr) {
    notes.push("sRGB/BT.709 SDR can usually use Canvas 2D safely for resize-style operations.");
  }
  return { isSimpleSdr, isWideGamut, isHdrLike, canvasColorSpace, recommendedPath, notes };
}
async function copyFrameToRgba(frame, options = {}) {
  const colorSpace = options.colorSpace ?? classifyFrameColor(frame).canvasColorSpace;
  const format = options.format ?? "RGBA";
  const allocation = frame.allocationSize({ format, colorSpace });
  const data = new Uint8Array(allocation);
  const layout = await frame.copyTo(data, { format, colorSpace });
  return {
    data,
    layout,
    colorSpace,
    format,
    width: frame.displayWidth,
    height: frame.displayHeight
  };
}
function resizeFrameWithCanvas(frame, options) {
  const colorSpace = options.colorSpace ?? classifyFrameColor(frame).canvasColorSpace;
  const canvas = new OffscreenCanvas(options.width, options.height);
  const context = canvas.getContext("2d", { colorSpace });
  if (!context) throw new Error("Could not create 2D canvas context");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = options.imageSmoothingQuality ?? "high";
  context.drawImage(frame, 0, 0, options.width, options.height);
  const init = { timestamp: frame.timestamp };
  if (frame.duration !== null) init.duration = frame.duration;
  const resized = new VideoFrame(canvas, init);
  return {
    frame: resized,
    inspection: inspectFrame(resized),
    colorSpace
  };
}
async function resizeFrameRaw(frame, options) {
  const format = frame.format;
  if (!format) throw new Error("Cannot raw-resize a VideoFrame with unknown format");
  const descriptor = describePlanarFormat(format);
  if (!descriptor) throw new Error(`Raw resize does not support VideoFrame format ${format}`);
  const sourceLayout = await getNativeLayout(frame);
  const source = new Uint8Array(frame.allocationSize());
  await frame.copyTo(source, { layout: sourceLayout });
  const destinationLayout = makeDestinationLayout(descriptor, options.width, options.height);
  const destination = new Uint8Array(allocationFromLayout(destinationLayout, descriptor, options.width, options.height));
  const algorithm = options.algorithm ?? "bilinear";
  for (let planeIndex = 0; planeIndex < descriptor.planes.length; planeIndex++) {
    const plane = descriptor.planes[planeIndex];
    const srcWidth = planeDimension(frame.codedWidth, plane.subsampleX);
    const srcHeight = planeDimension(frame.codedHeight, plane.subsampleY);
    const dstWidth = planeDimension(options.width, plane.subsampleX);
    const dstHeight = planeDimension(options.height, plane.subsampleY);
    resizePlane({
      source,
      destination,
      sourceLayout: sourceLayout[planeIndex],
      destinationLayout: destinationLayout[planeIndex],
      sourceWidth: srcWidth,
      sourceHeight: srcHeight,
      destinationWidth: dstWidth,
      destinationHeight: dstHeight,
      bytesPerSample: descriptor.bytesPerSample,
      algorithm
    });
  }
  const init = {
    format,
    codedWidth: options.width,
    codedHeight: options.height,
    displayWidth: options.width,
    displayHeight: options.height,
    timestamp: frame.timestamp,
    layout: destinationLayout,
    colorSpace: videoColorSpaceInit(frame)
  };
  if (frame.duration !== null) init.duration = frame.duration;
  const resized = new VideoFrame(destination, init);
  return {
    frame: resized,
    inspection: inspectFrame(resized),
    format,
    layout: destinationLayout,
    byteLength: destination.byteLength,
    algorithm
  };
}
function copyArrayBuffer(data) {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}
function describePlanarFormat(format) {
  switch (format) {
    case "I420":
      return { bytesPerSample: 1, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 2, subsampleY: 2 }, { subsampleX: 2, subsampleY: 2 }] };
    case "I422":
      return { bytesPerSample: 1, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 2, subsampleY: 1 }, { subsampleX: 2, subsampleY: 1 }] };
    case "I444":
      return { bytesPerSample: 1, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 1, subsampleY: 1 }, { subsampleX: 1, subsampleY: 1 }] };
    case "I420P10":
      return { bytesPerSample: 2, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 2, subsampleY: 2 }, { subsampleX: 2, subsampleY: 2 }] };
    case "I422P10":
      return { bytesPerSample: 2, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 2, subsampleY: 1 }, { subsampleX: 2, subsampleY: 1 }] };
    case "I444P10":
      return { bytesPerSample: 2, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 1, subsampleY: 1 }, { subsampleX: 1, subsampleY: 1 }] };
    default:
      return null;
  }
}
async function getNativeLayout(frame) {
  const scratch = new Uint8Array(frame.allocationSize());
  return frame.copyTo(scratch);
}
function makeDestinationLayout(descriptor, width, height) {
  let offset = 0;
  return descriptor.planes.map((plane) => {
    const planeWidth = planeDimension(width, plane.subsampleX);
    const planeHeight = planeDimension(height, plane.subsampleY);
    const stride = planeWidth * descriptor.bytesPerSample;
    const layout = { offset, stride };
    offset += stride * planeHeight;
    return layout;
  });
}
function allocationFromLayout(layout, descriptor, width, height) {
  const lastPlane = descriptor.planes.length - 1;
  const planeHeight = planeDimension(height, descriptor.planes[lastPlane].subsampleY);
  return layout[lastPlane].offset + layout[lastPlane].stride * planeHeight;
}
function planeDimension(size, subsample) {
  return Math.ceil(size / subsample);
}
function resizePlane(options) {
  for (let y = 0; y < options.destinationHeight; y++) {
    const sourceY = mapPixelCenter(y, options.destinationHeight, options.sourceHeight);
    for (let x = 0; x < options.destinationWidth; x++) {
      const sourceX = mapPixelCenter(x, options.destinationWidth, options.sourceWidth);
      const value = options.algorithm === "nearest" ? sampleNearest(options, sourceX, sourceY) : sampleBilinear(options, sourceX, sourceY);
      writeSample(options.destination, options.destinationLayout, x, y, options.bytesPerSample, value);
    }
  }
}
function mapPixelCenter(position, destinationSize, sourceSize) {
  return (position + 0.5) * sourceSize / destinationSize - 0.5;
}
function sampleNearest(options, x, y) {
  return readSample(
    options.source,
    options.sourceLayout,
    clamp(Math.round(x), 0, options.sourceWidth - 1),
    clamp(Math.round(y), 0, options.sourceHeight - 1),
    options.bytesPerSample
  );
}
function sampleBilinear(options, x, y) {
  const x0 = clamp(Math.floor(x), 0, options.sourceWidth - 1);
  const y0 = clamp(Math.floor(y), 0, options.sourceHeight - 1);
  const x1 = clamp(x0 + 1, 0, options.sourceWidth - 1);
  const y1 = clamp(y0 + 1, 0, options.sourceHeight - 1);
  const tx = clamp(x - x0, 0, 1);
  const ty = clamp(y - y0, 0, 1);
  const a = readSample(options.source, options.sourceLayout, x0, y0, options.bytesPerSample);
  const b = readSample(options.source, options.sourceLayout, x1, y0, options.bytesPerSample);
  const c = readSample(options.source, options.sourceLayout, x0, y1, options.bytesPerSample);
  const d = readSample(options.source, options.sourceLayout, x1, y1, options.bytesPerSample);
  return Math.round(
    a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
  );
}
function readSample(data, layout, x, y, bytesPerSample) {
  const offset = layout.offset + y * layout.stride + x * bytesPerSample;
  return bytesPerSample === 1 ? data[offset] : data[offset] | data[offset + 1] << 8;
}
function writeSample(data, layout, x, y, bytesPerSample, value) {
  const offset = layout.offset + y * layout.stride + x * bytesPerSample;
  data[offset] = value;
  if (bytesPerSample === 2) data[offset + 1] = value >> 8;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function videoColorSpaceInit(frame) {
  const colorSpace = frame.colorSpace;
  return {
    primaries: colorSpace.primaries,
    transfer: colorSpace.transfer,
    matrix: colorSpace.matrix,
    fullRange: colorSpace.fullRange
  };
}
export {
  classifyFrameColor,
  copyFrameToRgba,
  decodeImageToVideoFrame,
  inspectFrame,
  resizeFrameRaw,
  resizeFrameWithCanvas
};
