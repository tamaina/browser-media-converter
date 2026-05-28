// ../binary/dist/index.js
function concat(chunks) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((byte, index) => byte === b[index]);
}
function writeAscii(data, offset, text) {
  for (let i = 0; i < text.length; i++) data[offset + i] = text.charCodeAt(i);
}
function ascii(text) {
  const result = new Uint8Array(text.length);
  writeAscii(result, 0, text);
  return result;
}
function cstr(text) {
  return concat([ascii(text), new Uint8Array([0])]);
}
function writeU16(data, offset, value) {
  data[offset] = value >> 8;
  data[offset + 1] = value;
}
function u16(value) {
  const result = new Uint8Array(2);
  writeU16(result, 0, value);
  return result;
}
function writeU32(data, offset, value) {
  data[offset] = value / 16777216;
  data[offset + 1] = value >> 16;
  data[offset + 2] = value >> 8;
  data[offset + 3] = value;
}
function u32(value) {
  const result = new Uint8Array(4);
  writeU32(result, 0, value);
  return result;
}
function box(type, ...payloads) {
  const payload = flatten(payloads);
  const result = new Uint8Array(8 + payload.length);
  writeU32(result, 0, result.length);
  writeAscii(result, 4, type);
  result.set(payload, 8);
  return result;
}
function fullBox(type, version, flags, ...payloads) {
  return box(type, new Uint8Array([version, flags >> 16, flags >> 8, flags]), ...payloads);
}
function flatten(input) {
  const chunks = [];
  for (const item of input) collectChunks(item, chunks);
  return concat(chunks);
}
function collectChunks(input, chunks) {
  if (input instanceof Uint8Array) {
    chunks.push(input);
    return;
  }
  for (const item of input) collectChunks(item, chunks);
}

// src/mux.ts
function muxStillAvif(encoded, options = {}) {
  const sequenceHeaderObu = findSequenceHeaderObu(encoded.chunk);
  if (!sequenceHeaderObu) throw new Error("Encoded AV1 chunk does not contain a Sequence Header OBU");
  const sequence = parseSequenceHeaderObu(sequenceHeaderObu);
  const expectedAv1Config = makeAv1Config(encoded.decoderConfig.codec, sequenceHeaderObu);
  if (!bytesEqual(encoded.av1Config, expectedAv1Config)) {
    throw new Error("encoded.av1Config does not match encoded.chunk Sequence Header OBU");
  }
  if (sequence.monochrome) throw new Error("Monochrome AVIF output is not supported yet");
  if (sequence.bitDepth !== 8 && sequence.bitDepth !== 10 && sequence.bitDepth !== 12) throw new Error(`Unsupported AV1 bit depth: ${sequence.bitDepth}`);
  const imageItemId = 1;
  const metadata = options.metadata ?? [];
  const itemData = [encoded.chunk, ...metadata.map((item) => item.data)];
  const metadataItems = metadata.map((item, index) => ({
    ...item,
    id: imageItemId + index + 1,
    offset: 0
  }));
  const meta = makeMetaBox(encoded, imageItemId, 0, sequence, metadataItems);
  const ftyp = makeFtypBox(encoded, sequence);
  const mdatPayload = concat(itemData);
  const mdat = box("mdat", mdatPayload);
  let offset = ftyp.length + meta.length + 8;
  const fixedMetadataItems = metadataItems.map((item, index) => {
    offset += index === 0 ? encoded.chunk.length : metadata[index - 1].data.length;
    return { ...item, offset };
  });
  const fixedMeta = makeMetaBox(encoded, imageItemId, ftyp.length + meta.length + 8, sequence, fixedMetadataItems);
  return concat([ftyp, fixedMeta, mdat]);
}
function makeMetaBox(encoded, imageItemId, dataOffset, sequence, metadataItems = []) {
  return fullBox(
    "meta",
    0,
    0,
    fullBox(
      "hdlr",
      0,
      0,
      u32(0),
      ascii("pict"),
      u32(0),
      u32(0),
      u32(0),
      new Uint8Array([0])
    ),
    fullBox("pitm", 0, 0, u16(imageItemId)),
    fullBox(
      "iloc",
      0,
      0,
      new Uint8Array([68, 0]),
      u16(1 + metadataItems.length),
      makeIlocItem(imageItemId, dataOffset, encoded.chunk.length),
      metadataItems.map((item) => makeIlocItem(item.id, item.offset, item.data.length))
    ),
    fullBox(
      "iinf",
      0,
      0,
      u16(1 + metadataItems.length),
      fullBox(
        "infe",
        2,
        0,
        u16(imageItemId),
        u16(0),
        ascii("av01"),
        cstr("Color")
      ),
      metadataItems.map((item) => fullBox(
        "infe",
        2,
        0,
        u16(item.id),
        u16(0),
        ascii(item.type),
        cstr(item.name ?? item.type)
      ))
    ),
    metadataItems.length === 0 ? [] : fullBox(
      "iref",
      0,
      0,
      metadataItems.map((item) => box("cdsc", u16(item.id), u16(1), u16(imageItemId)))
    ),
    box(
      "iprp",
      box(
        "ipco",
        fullBox("ispe", 0, 0, u32(encoded.width), u32(encoded.height)),
        fullBox("pixi", 0, 0, new Uint8Array([sequence.monochrome ? 1 : 3, ...Array(sequence.monochrome ? 1 : 3).fill(sequence.bitDepth)])),
        box("av1C", encoded.av1Config),
        makeColrBox(sequence)
      ),
      fullBox(
        "ipma",
        0,
        0,
        u32(1),
        u16(imageItemId),
        new Uint8Array([4, 129, 2, 3, 4])
      )
    )
  );
}
function makeIlocItem(itemId, offset, length) {
  return concat([
    u16(itemId),
    u16(0),
    u16(1),
    u32(offset),
    u32(length)
  ]);
}
function makeFtypBox(encoded, sequence) {
  const brands = [ascii("avif"), ascii("mif1"), ascii("miaf")];
  if (isAvifBaselineCompatible(encoded, sequence)) brands.push(ascii("MA1B"));
  return box("ftyp", ascii("avif"), u32(0), brands);
}
function isAvifBaselineCompatible(encoded, sequence) {
  return sequence.seqProfile === 0 && sequence.seqLevelIdx0 <= 13 && encoded.width * encoded.height <= 8912896 && encoded.width <= 8192 && encoded.height <= 4352 && !sequence.monochrome && (sequence.bitDepth === 8 || sequence.bitDepth === 10);
}
function makeColrBox(sequence) {
  return box(
    "colr",
    ascii("nclx"),
    u16(sequence.colorPrimaries),
    u16(sequence.transferCharacteristics),
    u16(sequence.matrixCoefficients),
    new Uint8Array([sequence.colorRange ? 128 : 0])
  );
}
function makeAv1Config(codec, sequenceHeaderObu) {
  const parsed = /^av01\.(\d+)\.(\d{2})([A-Z])\.(\d{2})/.exec(codec);
  const sequence = sequenceHeaderObu ? parseSequenceHeaderObu(sequenceHeaderObu) : null;
  const seqProfile = sequence?.seqProfile ?? (parsed ? Number(parsed[1]) : 0);
  const seqLevelIdx0 = sequence?.seqLevelIdx0 ?? (parsed ? Number(parsed[2]) : 8);
  const seqTier0 = sequence?.seqTier0 ?? (parsed?.[3] === "H" ? 1 : 0);
  const highBitdepth = sequence?.highBitdepth ?? (parsed ? Number(parsed[4]) > 8 : false);
  const twelveBit = sequence?.twelveBit ?? (parsed ? Number(parsed[4]) === 12 : false);
  const monochrome = sequence?.monochrome ?? false;
  const chromaSubsamplingX = sequence?.chromaSubsamplingX ?? (seqProfile === 1 ? 0 : 1);
  const chromaSubsamplingY = sequence?.chromaSubsamplingY ?? (seqProfile === 1 ? 0 : 1);
  const chromaSamplePosition = sequence?.chromaSamplePosition ?? 0;
  return new Uint8Array([
    129,
    (seqProfile & 7) << 5 | seqLevelIdx0 & 31,
    (seqTier0 & 1) << 7 | Number(highBitdepth) << 6 | Number(twelveBit) << 5 | Number(monochrome) << 4 | Number(chromaSubsamplingX) << 3 | Number(chromaSubsamplingY) << 2 | chromaSamplePosition & 3,
    0,
    ...sequenceHeaderObu ? [...sequenceHeaderObu] : []
  ]);
}
function findSequenceHeaderObu(data) {
  let offset = 0;
  while (offset < data.length) {
    const obuStart = offset;
    const header = data[offset++];
    const obuType = header >> 3 & 15;
    const extensionFlag = header >> 2 & 1;
    const hasSizeField = header >> 1 & 1;
    if (extensionFlag) offset++;
    if (!hasSizeField) return null;
    const size = readLeb128(data, offset);
    offset = size.nextOffset;
    const payloadStart = offset;
    const payloadEnd = payloadStart + size.value;
    if (payloadEnd > data.length) return null;
    if (obuType === 1) return data.slice(obuStart, payloadEnd);
    offset = payloadEnd;
  }
  return null;
}
function parseSequenceHeaderObu(obu) {
  let offset = 1;
  if (obu[0] >> 2 & 1) offset++;
  if (obu[0] >> 1 & 1) offset = readLeb128(obu, offset).nextOffset;
  const bits = new BitReader(obu.subarray(offset));
  const seqProfile = bits.read(3);
  bits.read(1);
  const reducedStillPictureHeader = bits.read(1) === 1;
  let seqLevelIdx0 = 0;
  let seqTier0 = 0;
  let decoderModelInfoPresentFlag = false;
  let initialDisplayDelayPresentFlag = false;
  if (reducedStillPictureHeader) {
    seqLevelIdx0 = bits.read(5);
  } else {
    const timingInfoPresentFlag = bits.read(1) === 1;
    if (timingInfoPresentFlag) {
      bits.skip(32 + 32);
      if (bits.read(1)) bits.skipUvlc();
      decoderModelInfoPresentFlag = bits.read(1) === 1;
      if (decoderModelInfoPresentFlag) bits.skip(5 + 32 + 5 + 5);
    }
    initialDisplayDelayPresentFlag = bits.read(1) === 1;
    const operatingPointsCntMinus1 = bits.read(5);
    for (let i = 0; i <= operatingPointsCntMinus1; i++) {
      bits.skip(12);
      const level = bits.read(5);
      const tier = level > 7 ? bits.read(1) : 0;
      if (i === 0) {
        seqLevelIdx0 = level;
        seqTier0 = tier;
      }
      if (decoderModelInfoPresentFlag && bits.read(1)) bits.skip(5 + 32 + 5);
      if (initialDisplayDelayPresentFlag && bits.read(1)) bits.skip(4);
    }
  }
  const frameWidthBitsMinus1 = bits.read(4);
  const frameHeightBitsMinus1 = bits.read(4);
  bits.skip(frameWidthBitsMinus1 + 1);
  bits.skip(frameHeightBitsMinus1 + 1);
  if (!reducedStillPictureHeader && bits.read(1)) bits.skip(4 + 3);
  bits.skip(1 + 1 + 1);
  if (!reducedStillPictureHeader) {
    bits.skip(1 + 1 + 1 + 1);
    const enableOrderHint = bits.read(1);
    if (enableOrderHint) bits.skip(1 + 1);
    if (bits.read(1) || bits.read(1)) bits.skip(1);
    if (enableOrderHint) bits.skip(3);
  }
  bits.skip(1 + 1 + 1);
  const highBitdepth = bits.read(1) === 1;
  const twelveBit = seqProfile === 2 && highBitdepth ? bits.read(1) === 1 : false;
  const bitDepth = seqProfile === 2 && highBitdepth ? twelveBit ? 12 : 10 : highBitdepth ? 10 : 8;
  const monochrome = seqProfile === 1 ? false : bits.read(1) === 1;
  const colorDescriptionPresent = bits.read(1) === 1;
  let colorPrimaries = 2;
  let transferCharacteristics = 2;
  let matrixCoefficients = 2;
  if (colorDescriptionPresent) {
    colorPrimaries = bits.read(8);
    transferCharacteristics = bits.read(8);
    matrixCoefficients = bits.read(8);
  }
  const colorRange = bits.read(1) === 1;
  let chromaSubsamplingX = 0;
  let chromaSubsamplingY = 0;
  let chromaSamplePosition = 0;
  if (monochrome) {
    chromaSubsamplingX = 1;
    chromaSubsamplingY = 1;
  } else if (colorPrimaries === 1 && transferCharacteristics === 13 && matrixCoefficients === 0) {
    chromaSubsamplingX = 0;
    chromaSubsamplingY = 0;
  } else {
    if (seqProfile === 0) {
      chromaSubsamplingX = 1;
      chromaSubsamplingY = 1;
    } else if (seqProfile === 1) {
      chromaSubsamplingX = 0;
      chromaSubsamplingY = 0;
    } else if (twelveBit) {
      chromaSubsamplingX = bits.read(1);
      chromaSubsamplingY = chromaSubsamplingX ? bits.read(1) : 0;
    } else {
      chromaSubsamplingX = 1;
      chromaSubsamplingY = 0;
    }
    if (chromaSubsamplingX && chromaSubsamplingY) chromaSamplePosition = bits.read(2);
  }
  return {
    seqProfile,
    seqLevelIdx0,
    seqTier0,
    highBitdepth,
    twelveBit,
    bitDepth,
    monochrome,
    colorDescriptionPresent,
    colorPrimaries,
    transferCharacteristics,
    matrixCoefficients,
    colorRange,
    chromaSubsamplingX,
    chromaSubsamplingY,
    chromaSamplePosition
  };
}
function readLeb128(data, offset) {
  let value = 0;
  for (let i = 0; i < 8; i++) {
    const byte = data[offset + i];
    value |= (byte & 127) << i * 7;
    if ((byte & 128) === 0) return { value, nextOffset: offset + i + 1 };
  }
  throw new Error("Invalid LEB128 value");
}
var BitReader = class {
  #data;
  #bitOffset = 0;
  constructor(data) {
    this.#data = data;
  }
  read(count) {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byte = this.#data[this.#bitOffset >> 3] ?? 0;
      value = value << 1 | byte >> 7 - (this.#bitOffset & 7) & 1;
      this.#bitOffset++;
    }
    return value;
  }
  skip(count) {
    this.#bitOffset += count;
  }
  skipUvlc() {
    let leadingZeroes = 0;
    while (this.read(1) === 0) leadingZeroes++;
    if (leadingZeroes > 0) this.skip(leadingZeroes);
  }
};

// src/index.ts
async function encodeImageToAv1(source, options = {}) {
  assertWebCodecs();
  if (options.alpha === "keep") throw new Error("AVIF alpha is not supported yet; auxiliary alpha items are not muxed");
  const width = options.width ?? sourceWidth(source);
  const height = options.height ?? sourceHeight(source);
  const codec = options.codec ?? "av01.0.08M.08";
  const bitrate = options.bitrate ?? Math.max(8e4, Math.round(width * height * (options.quality ?? 0.8) * 0.7));
  const support = await VideoEncoder.isConfigSupported({
    codec,
    width,
    height,
    bitrate,
    framerate: 1,
    alpha: options.alpha ?? "discard",
    latencyMode: "quality"
  });
  if (!support.supported) throw new Error(`VideoEncoder does not support ${codec}`);
  const config = support.config;
  if (!config) throw new Error(`VideoEncoder did not return a normalized config for ${codec}`);
  let metadataConfig;
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    const encoder = new VideoEncoder({
      error: reject,
      output: (chunk2, metadata) => {
        const bytes = new Uint8Array(chunk2.byteLength);
        chunk2.copyTo(bytes);
        chunks.push(bytes);
        if (metadata?.decoderConfig) metadataConfig = metadata.decoderConfig;
      }
    });
    encoder.configure(config);
    const frame = source instanceof VideoFrame ? source : new VideoFrame(source, { timestamp: 0, duration: 1e6 });
    encoder.encode(frame, { keyFrame: true });
    encoder.flush().then(() => {
      encoder.close();
      if (!(source instanceof VideoFrame)) frame.close();
      resolve();
    }, reject);
  });
  await done;
  const chunk = concat(chunks);
  const decoderConfig = metadataConfig ?? { codec, codedWidth: width, codedHeight: height, description: options.av1Config };
  const sequenceHeaderObu = findSequenceHeaderObu(chunk);
  if (!sequenceHeaderObu) throw new Error("Encoded AV1 chunk does not contain a Sequence Header OBU");
  const generatedAv1Config = makeAv1Config(codec, sequenceHeaderObu);
  if (options.av1Config && !bytesEqual(options.av1Config, generatedAv1Config)) {
    throw new Error("Provided av1Config does not match the encoded AV1 Sequence Header OBU");
  }
  const av1Config = generatedAv1Config;
  return { chunk, decoderConfig, av1Config, width, height };
}
async function encodeImageToAvif(source, options = {}) {
  return muxStillAvif(await encodeImageToAv1(source, options));
}
async function decodeAv1Still(encoded) {
  assertWebCodecs();
  const frame = await new Promise((resolve, reject) => {
    const decoder = new VideoDecoder({
      error: reject,
      output: resolve
    });
    decoder.configure(encoded.decoderConfig);
    decoder.decode(new EncodedVideoChunk({
      type: "key",
      timestamp: 0,
      duration: 1e6,
      data: encoded.chunk
    }));
    decoder.flush().then(() => decoder.close(), reject);
  });
  return frame;
}
async function canvasSourceFromBlob(blob) {
  return createImageBitmap(blob);
}
function assertWebCodecs() {
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined" || typeof VideoFrame === "undefined") {
    throw new Error("WebCodecs API is not available in this environment");
  }
}
function sourceWidth(source) {
  if (source instanceof VideoFrame) return source.displayWidth;
  if ("videoWidth" in source) return source.videoWidth;
  if ("naturalWidth" in source) return source.naturalWidth;
  if ("width" in source) return Number(source.width);
  throw new Error("Cannot determine source width");
}
function sourceHeight(source) {
  if (source instanceof VideoFrame) return source.displayHeight;
  if ("videoHeight" in source) return source.videoHeight;
  if ("naturalHeight" in source) return source.naturalHeight;
  if ("height" in source) return Number(source.height);
  throw new Error("Cannot determine source height");
}
export {
  canvasSourceFromBlob,
  decodeAv1Still,
  encodeImageToAv1,
  encodeImageToAvif,
  findSequenceHeaderObu,
  makeAv1Config,
  muxStillAvif
};
