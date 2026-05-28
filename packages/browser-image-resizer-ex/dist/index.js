// ../exif-transplant/dist/index.js
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
function startsWith(data, prefix) {
  return prefix.every((byte, index) => data[index] === byte);
}
function readAscii(data, offset, length) {
  return String.fromCharCode(...data.subarray(offset, offset + length));
}
function writeAscii(data, offset, text) {
  for (let i = 0; i < text.length; i++) data[offset + i] = text.charCodeAt(i);
}
function readU16(data, offset) {
  return data[offset] << 8 | data[offset + 1];
}
function readU16le(data, offset) {
  return data[offset] | data[offset + 1] << 8;
}
function writeU16(data, offset, value) {
  data[offset] = value >> 8;
  data[offset + 1] = value;
}
function readU32(data, offset) {
  return data[offset] * 16777216 + (data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3]);
}
function readU32le(data, offset) {
  return data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] * 16777216;
}
function writeU32(data, offset, value) {
  data[offset] = value / 16777216;
  data[offset + 1] = value >> 16;
  data[offset + 2] = value >> 8;
  data[offset + 3] = value;
}
function writeU32le(data, offset, value) {
  data[offset] = value;
  data[offset + 1] = value >> 8;
  data[offset + 2] = value >> 16;
  data[offset + 3] = value >> 24;
}
function u32(value) {
  const result = new Uint8Array(4);
  writeU32(result, 0, value);
  return result;
}
function readU64(data, offset) {
  return BigInt(readU32(data, offset)) << 32n | BigInt(readU32(data, offset + 4));
}
function readSized(data, offset, size) {
  let value = 0;
  for (let i = 0; i < size; i++) value = value * 256 + data[offset + i];
  return value;
}
function* boxes(data, start, end) {
  let offset = start;
  while (offset + 8 <= end) {
    const parsed = readBox(data, offset);
    if (!parsed || parsed.end > end) break;
    yield parsed;
    offset = parsed.end;
  }
}
function readBox(data, offset) {
  const size32 = readU32(data, offset);
  const type = readAscii(data, offset + 4, 4);
  const headerSize = size32 === 1 ? 16 : 8;
  const size = size32 === 1 ? Number(readU64(data, offset + 8)) : size32;
  if (size < headerSize) return null;
  return { type, start: offset, end: offset + size, headerSize };
}
function* riffChunks(data, startOffset = 12) {
  let offset = startOffset;
  while (offset + 8 <= data.length) {
    const type = readAscii(data, offset, 4);
    const size = readU32le(data, offset + 4);
    const start = offset + 8;
    const end = start + size;
    yield { type, headerStart: offset, start, end, paddedEnd: end + size % 2 };
    offset = end + size % 2;
  }
}
function makeRiffChunk(type, data) {
  const chunk = new Uint8Array(8 + data.length + data.length % 2);
  writeAscii(chunk, 0, type);
  writeU32le(chunk, 4, data.length);
  chunk.set(data, 8);
  return chunk;
}
function concat2(chunks) {
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
function writeAscii2(data, offset, text) {
  for (let i = 0; i < text.length; i++) data[offset + i] = text.charCodeAt(i);
}
function ascii(text) {
  const result = new Uint8Array(text.length);
  writeAscii2(result, 0, text);
  return result;
}
function cstr(text) {
  return concat2([ascii(text), new Uint8Array([0])]);
}
function writeU162(data, offset, value) {
  data[offset] = value >> 8;
  data[offset + 1] = value;
}
function u16(value) {
  const result = new Uint8Array(2);
  writeU162(result, 0, value);
  return result;
}
function writeU322(data, offset, value) {
  data[offset] = value / 16777216;
  data[offset + 1] = value >> 16;
  data[offset + 2] = value >> 8;
  data[offset + 3] = value;
}
function u322(value) {
  const result = new Uint8Array(4);
  writeU322(result, 0, value);
  return result;
}
function box(type, ...payloads) {
  const payload = flatten(payloads);
  const result = new Uint8Array(8 + payload.length);
  writeU322(result, 0, result.length);
  writeAscii2(result, 4, type);
  result.set(payload, 8);
  return result;
}
function fullBox(type, version, flags, ...payloads) {
  return box(type, new Uint8Array([version, flags >> 16, flags >> 8, flags]), ...payloads);
}
function flatten(input) {
  const chunks = [];
  for (const item of input) collectChunks(item, chunks);
  return concat2(chunks);
}
function collectChunks(input, chunks) {
  if (input instanceof Uint8Array) {
    chunks.push(input);
    return;
  }
  for (const item of input) collectChunks(item, chunks);
}
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
  const mdatPayload = concat2(itemData);
  const mdat = box("mdat", mdatPayload);
  let offset = ftyp.length + meta.length + 8;
  const fixedMetadataItems = metadataItems.map((item, index) => {
    offset += index === 0 ? encoded.chunk.length : metadata[index - 1].data.length;
    return { ...item, offset };
  });
  const fixedMeta = makeMetaBox(encoded, imageItemId, ftyp.length + meta.length + 8, sequence, fixedMetadataItems);
  return concat2([ftyp, fixedMeta, mdat]);
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
      u322(0),
      ascii("pict"),
      u322(0),
      u322(0),
      u322(0),
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
        fullBox("ispe", 0, 0, u322(encoded.width), u322(encoded.height)),
        fullBox("pixi", 0, 0, new Uint8Array([sequence.monochrome ? 1 : 3, ...Array(sequence.monochrome ? 1 : 3).fill(sequence.bitDepth)])),
        box("av1C", encoded.av1Config),
        makeColrBox(sequence)
      ),
      fullBox(
        "ipma",
        0,
        0,
        u322(1),
        u16(imageItemId),
        new Uint8Array([4, 129, 2, 3, 4])
      )
    )
  );
}
function makeIlocItem(itemId, offset, length) {
  return concat2([
    u16(itemId),
    u16(0),
    u16(1),
    u322(offset),
    u322(length)
  ]);
}
function makeFtypBox(encoded, sequence) {
  const brands = [ascii("avif"), ascii("mif1"), ascii("miaf")];
  if (isAvifBaselineCompatible(encoded, sequence)) brands.push(ascii("MA1B"));
  return box("ftyp", ascii("avif"), u322(0), brands);
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
var EXIF_ASCII = new Uint8Array([69, 120, 105, 102, 0, 0]);
function normalizeJpegExif(bytes) {
  return startsWith(bytes, EXIF_ASCII) ? bytes.slice() : concat([EXIF_ASCII, bytes]);
}
function stripExifHeader(bytes) {
  return startsWith(bytes, EXIF_ASCII) ? bytes.slice(EXIF_ASCII.length) : bytes.slice();
}
function readAvifExif(data) {
  for (const box22 of boxes(data, 0, data.length)) {
    if (box22.type !== "meta") continue;
    const metaStart = box22.start + box22.headerSize + 4;
    const entries = collectAvifItems(data, metaStart, box22.end);
    const exifItem = entries.find((entry) => entry.type === "Exif");
    if (!exifItem) continue;
    const bytes = data.slice(exifItem.offset + exifItem.prefix, exifItem.offset + exifItem.length);
    return { bytes: normalizeJpegExif(bytes), sourceMime: "image/avif" };
  }
  return null;
}
function rewriteAvifExif(data, exifBody) {
  const image = readPrimaryAvifImage(data);
  const metadata = exifBody ? [{ type: "Exif", data: concat([u32(0), stripExifHeader(exifBody)]), name: "Exif" }] : [];
  return muxStillAvif(image, { metadata });
}
function readPrimaryAvifImage(data) {
  for (const box22 of boxes(data, 0, data.length)) {
    if (box22.type !== "meta") continue;
    const metaStart = box22.start + box22.headerSize + 4;
    const entries = collectAvifItems(data, metaStart, box22.end);
    const properties = collectAvifProperties(data, metaStart, box22.end);
    const image = entries.find((entry) => entry.type === "av01");
    if (!image) continue;
    if (!properties.av1Config) throw new Error("AVIF image item is missing av1C");
    if (!properties.width || !properties.height) throw new Error("AVIF image item is missing ispe");
    const chunk = data.slice(image.offset, image.offset + image.length);
    const sequenceHeaderObu = findSequenceHeaderObu(chunk);
    if (!sequenceHeaderObu) throw new Error("AVIF image item does not contain an AV1 Sequence Header OBU");
    const codec = "av01.0.08M.08";
    return {
      chunk,
      decoderConfig: {
        codec,
        codedWidth: properties.width,
        codedHeight: properties.height,
        description: properties.av1Config
      },
      av1Config: makeAv1Config(codec, sequenceHeaderObu),
      width: properties.width,
      height: properties.height
    };
  }
  throw new Error("AVIF image item could not be found");
}
function collectAvifItems(data, start, end) {
  const items = /* @__PURE__ */ new Map();
  for (const box22 of boxes(data, start, end)) {
    if (box22.type === "iinf") {
      const version = data[box22.start + box22.headerSize];
      const countOffset = box22.start + box22.headerSize + 4;
      const count = version === 0 ? readU16(data, countOffset) : readU32(data, countOffset);
      let childStart = countOffset + (version === 0 ? 2 : 4);
      for (let i = 0; i < count; i++) {
        const infe = readBox(data, childStart);
        if (!infe || infe.type !== "infe") break;
        const infeVersion = data[infe.start + infe.headerSize];
        if (infeVersion >= 2) {
          const base = infe.start + infe.headerSize + 4;
          const id = infeVersion === 2 ? readU16(data, base) : readU32(data, base);
          const type = readAscii(data, base + (infeVersion === 2 ? 4 : 6), 4);
          upsert(items, id).type = type;
        }
        childStart = infe.end;
      }
    } else if (box22.type === "iloc") {
      const version = data[box22.start + box22.headerSize];
      const base = box22.start + box22.headerSize + 4;
      const sizes = data[base];
      const offsetSize = sizes >> 4;
      const lengthSize = sizes & 15;
      const baseOffsetSize = data[base + 1] >> 4;
      let cursor = base + 2;
      const count = version < 2 ? readU16(data, cursor) : readU32(data, cursor);
      cursor += version < 2 ? 2 : 4;
      for (let i = 0; i < count; i++) {
        const id = version < 2 ? readU16(data, cursor) : readU32(data, cursor);
        cursor += version < 2 ? 2 : 4;
        if (version === 1 || version === 2) cursor += 2;
        cursor += 2;
        const baseOffset = readSized(data, cursor, baseOffsetSize);
        cursor += baseOffsetSize;
        const extentCount = readU16(data, cursor);
        cursor += 2;
        if (extentCount > 0) {
          if (version === 1 || version === 2) cursor += 4;
          const offset = baseOffset + readSized(data, cursor, offsetSize);
          cursor += offsetSize;
          const length = readSized(data, cursor, lengthSize);
          cursor += lengthSize;
          const entry = upsert(items, id);
          entry.offset = offset;
          entry.length = length;
          entry.prefix = data[offset] === 0 && data[offset + 1] === 0 && data[offset + 2] === 0 && data[offset + 3] === 0 ? 4 : 0;
        }
      }
    }
  }
  return [...items.entries()].map(([id, item]) => ({ id, type: item.type, offset: item.offset ?? 0, length: item.length ?? 0, prefix: item.prefix }));
}
function collectAvifProperties(data, start, end) {
  const properties = {};
  for (const box22 of boxes(data, start, end)) {
    if (box22.type !== "iprp") continue;
    for (const iprpChild of boxes(data, box22.start + box22.headerSize, box22.end)) {
      if (iprpChild.type !== "ipco") continue;
      for (const property of boxes(data, iprpChild.start + iprpChild.headerSize, iprpChild.end)) {
        if (property.type === "ispe") {
          const base = property.start + property.headerSize + 4;
          properties.width = readU32(data, base);
          properties.height = readU32(data, base + 4);
        } else if (property.type === "av1C") {
          properties.av1Config = data.slice(property.start + property.headerSize, property.end);
        }
      }
    }
  }
  return properties;
}
function upsert(map, key) {
  let value = map.get(key);
  if (!value) {
    value = { prefix: 0 };
    map.set(key, value);
  }
  return value;
}
var JPEG_SOI = 65496;
var JPEG_APP1 = 65505;
var JPEG_SOS = 65498;
var JPEG_EOI = 65497;
function readJpegExif(data) {
  for (const segment of jpegSegments(data)) {
    if (segment.marker === JPEG_APP1 && startsWith(data.subarray(segment.dataStart, segment.dataEnd), EXIF_ASCII)) {
      return { bytes: data.slice(segment.dataStart, segment.dataEnd), sourceMime: "image/jpeg" };
    }
  }
  return null;
}
function rewriteJpegExif(data, exif) {
  if (readU16(data, 0) !== JPEG_SOI) throw new Error("Not a JPEG");
  const chunks = [data.slice(0, 2)];
  let cursor = 2;
  let inserted = false;
  for (const segment of jpegSegments(data)) {
    if (segment.marker === JPEG_APP1 && startsWith(data.subarray(segment.dataStart, segment.dataEnd), EXIF_ASCII)) {
      cursor = segment.end;
      continue;
    }
    if (!inserted && exif && (segment.marker < 65504 || segment.marker > 65519)) {
      chunks.push(makeJpegSegment(JPEG_APP1, exif));
      inserted = true;
    }
    chunks.push(data.slice(cursor, segment.end));
    cursor = segment.end;
  }
  if (!inserted && exif) chunks.splice(1, 0, makeJpegSegment(JPEG_APP1, exif));
  if (cursor < data.length) chunks.push(data.slice(cursor));
  return concat(chunks);
}
function* jpegSegments(data) {
  let offset = 2;
  while (offset + 4 <= data.length && data[offset] === 255) {
    const marker = readU16(data, offset);
    if (marker === JPEG_SOS || marker === JPEG_EOI) break;
    const length = readU16(data, offset + 2);
    if (length < 2) break;
    yield { marker, start: offset, dataStart: offset + 4, dataEnd: offset + 2 + length, end: offset + 2 + length };
    offset += 2 + length;
  }
}
function makeJpegSegment(marker, data) {
  if (data.length > 65533) throw new Error("EXIF block is too large for JPEG APP1");
  const segment = new Uint8Array(data.length + 4);
  writeU16(segment, 0, marker);
  writeU16(segment, 2, data.length + 2);
  segment.set(data, 4);
  return segment;
}
var GPS_IFD_POINTER = 34853;
function stripGpsFromExif(exif) {
  const body = stripExifHeader(exif).slice();
  const tiff = parseTiff(body);
  if (!tiff) return exif.slice();
  const zeroth = readIfd(body, tiff.firstIfdOffset, tiff.littleEndian);
  const gpsPointer = zeroth.entries.find((entry) => entry.tag === GPS_IFD_POINTER);
  if (!gpsPointer) return normalizeJpegExif(body);
  zeroGpsIfd(body, gpsPointer.value, tiff.littleEndian);
  body.fill(0, gpsPointer.entryOffset, gpsPointer.entryOffset + 12);
  return normalizeJpegExif(body);
}
function parseTiff(data) {
  if (data.length < 8) return null;
  const littleEndian = readAscii(data, 0, 2) === "II";
  if (!littleEndian && readAscii(data, 0, 2) !== "MM") return null;
  const magic = littleEndian ? readU16le(data, 2) : readU16(data, 2);
  if (magic !== 42) return null;
  const firstIfdOffset = littleEndian ? readU32le(data, 4) : readU32(data, 4);
  if (firstIfdOffset + 2 > data.length) return null;
  return { littleEndian, firstIfdOffset };
}
function readIfd(data, offset, littleEndian) {
  const read16 = littleEndian ? readU16le : readU16;
  const read32 = littleEndian ? readU32le : readU32;
  if (offset + 2 > data.length) return { entries: [] };
  const count = read16(data, offset);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const entryOffset = offset + 2 + i * 12;
    if (entryOffset + 12 > data.length) break;
    const valueOffset = offset + 2 + i * 12 + 8;
    entries.push({
      tag: read16(data, entryOffset),
      type: read16(data, entryOffset + 2),
      count: read32(data, entryOffset + 4),
      entryOffset,
      valueOffset,
      value: read32(data, valueOffset)
    });
  }
  return { entries };
}
function zeroGpsIfd(data, offset, littleEndian) {
  if (offset + 2 > data.length) return;
  const gps = readIfd(data, offset, littleEndian);
  for (const entry of gps.entries) {
    const byteLength = valueByteLength(entry.type, entry.count);
    if (byteLength > 4 && entry.value + byteLength <= data.length) {
      data.fill(0, entry.value, entry.value + byteLength);
    }
  }
  const ifdEnd = offset + 2 + gps.entries.length * 12 + 4;
  data.fill(0, offset, Math.min(ifdEnd, data.length));
}
function valueByteLength(type, count) {
  const size = TYPE_SIZES[type] ?? 1;
  return size * count;
}
var TYPE_SIZES = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  7: 1,
  9: 4,
  10: 8
};
var WEBP_EXIF = "EXIF";
function readWebpExif(data) {
  for (const chunk of riffChunks(data)) {
    if (chunk.type === WEBP_EXIF) return { bytes: normalizeJpegExif(data.slice(chunk.start, chunk.end)), sourceMime: "image/webp" };
  }
  return null;
}
function rewriteWebpExif(data, exifBody) {
  if (readAscii(data, 0, 4) !== "RIFF" || readAscii(data, 8, 4) !== "WEBP") throw new Error("Not a WebP");
  const chunks = [data.slice(12, 12)];
  let cursor = 12;
  let hasVp8x = false;
  for (const chunk of riffChunks(data)) {
    chunks.push(data.slice(cursor, chunk.headerStart));
    if (chunk.type !== WEBP_EXIF) {
      const bytes = data.slice(chunk.headerStart, chunk.paddedEnd);
      if (chunk.type === "VP8X") {
        hasVp8x = true;
        bytes[8] |= 8;
      }
      chunks.push(bytes);
    }
    cursor = chunk.paddedEnd;
  }
  if (cursor < data.length) chunks.push(data.slice(cursor));
  if (exifBody) {
    if (!hasVp8x) {
    }
    chunks.push(makeRiffChunk(WEBP_EXIF, exifBody));
  }
  const payload = concat(chunks);
  const header = new Uint8Array(12);
  writeAscii(header, 0, "RIFF");
  writeU32le(header, 4, payload.length + 4);
  writeAscii(header, 8, "WEBP");
  return concat([header, payload]);
}
function detectImageMime(data) {
  if (data.length >= 12 && readAscii(data, 0, 4) === "RIFF" && readAscii(data, 8, 4) === "WEBP") return "image/webp";
  if (data.length >= 12 && readAscii(data, 4, 4) === "ftyp" && hasBrand(data, ["avif", "avis", "mif1", "msf1"])) return "image/avif";
  if (data.length >= 2 && readU16(data, 0) === JPEG_SOI) return "image/jpeg";
  throw new Error("Unsupported image format");
}
function readExif(data, mime = detectImageMime(data)) {
  if (mime === "image/jpeg") return readJpegExif(data);
  if (mime === "image/webp") return readWebpExif(data);
  return readAvifExif(data);
}
function writeExif(data, exif, mime = detectImageMime(data)) {
  const bytes = exif instanceof Uint8Array ? exif : exif.bytes;
  if (mime === "image/jpeg") return rewriteJpegExif(data, normalizeJpegExif(bytes));
  if (mime === "image/webp") return rewriteWebpExif(data, stripExifHeader(bytes));
  return rewriteAvifExif(data, stripExifHeader(bytes));
}
function hasBrand(data, brands) {
  for (let offset = 8; offset + 4 <= Math.min(data.length, 32); offset += 4) {
    if (brands.includes(readAscii(data, offset, 4))) return true;
  }
  return false;
}

// ../webcodecs-avif/dist/index.js
function concat3(chunks) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
function bytesEqual2(a, b) {
  if (a.length !== b.length) return false;
  return a.every((byte, index) => byte === b[index]);
}
function writeAscii3(data, offset, text) {
  for (let i = 0; i < text.length; i++) data[offset + i] = text.charCodeAt(i);
}
function ascii2(text) {
  const result = new Uint8Array(text.length);
  writeAscii3(result, 0, text);
  return result;
}
function cstr2(text) {
  return concat3([ascii2(text), new Uint8Array([0])]);
}
function writeU163(data, offset, value) {
  data[offset] = value >> 8;
  data[offset + 1] = value;
}
function u162(value) {
  const result = new Uint8Array(2);
  writeU163(result, 0, value);
  return result;
}
function writeU323(data, offset, value) {
  data[offset] = value / 16777216;
  data[offset + 1] = value >> 16;
  data[offset + 2] = value >> 8;
  data[offset + 3] = value;
}
function u323(value) {
  const result = new Uint8Array(4);
  writeU323(result, 0, value);
  return result;
}
function box2(type, ...payloads) {
  const payload = flatten2(payloads);
  const result = new Uint8Array(8 + payload.length);
  writeU323(result, 0, result.length);
  writeAscii3(result, 4, type);
  result.set(payload, 8);
  return result;
}
function fullBox2(type, version, flags, ...payloads) {
  return box2(type, new Uint8Array([version, flags >> 16, flags >> 8, flags]), ...payloads);
}
function flatten2(input) {
  const chunks = [];
  for (const item of input) collectChunks2(item, chunks);
  return concat3(chunks);
}
function collectChunks2(input, chunks) {
  if (input instanceof Uint8Array) {
    chunks.push(input);
    return;
  }
  for (const item of input) collectChunks2(item, chunks);
}
function muxStillAvif2(encoded, options = {}) {
  const sequenceHeaderObu = findSequenceHeaderObu2(encoded.chunk);
  if (!sequenceHeaderObu) throw new Error("Encoded AV1 chunk does not contain a Sequence Header OBU");
  const sequence = parseSequenceHeaderObu2(sequenceHeaderObu);
  const expectedAv1Config = makeAv1Config2(encoded.decoderConfig.codec, sequenceHeaderObu);
  if (!bytesEqual2(encoded.av1Config, expectedAv1Config)) {
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
  const meta = makeMetaBox2(encoded, imageItemId, 0, sequence, metadataItems);
  const ftyp = makeFtypBox2(encoded, sequence);
  const mdatPayload = concat3(itemData);
  const mdat = box2("mdat", mdatPayload);
  let offset = ftyp.length + meta.length + 8;
  const fixedMetadataItems = metadataItems.map((item, index) => {
    offset += index === 0 ? encoded.chunk.length : metadata[index - 1].data.length;
    return { ...item, offset };
  });
  const fixedMeta = makeMetaBox2(encoded, imageItemId, ftyp.length + meta.length + 8, sequence, fixedMetadataItems);
  return concat3([ftyp, fixedMeta, mdat]);
}
function makeMetaBox2(encoded, imageItemId, dataOffset, sequence, metadataItems = []) {
  return fullBox2(
    "meta",
    0,
    0,
    fullBox2(
      "hdlr",
      0,
      0,
      u323(0),
      ascii2("pict"),
      u323(0),
      u323(0),
      u323(0),
      new Uint8Array([0])
    ),
    fullBox2("pitm", 0, 0, u162(imageItemId)),
    fullBox2(
      "iloc",
      0,
      0,
      new Uint8Array([68, 0]),
      u162(1 + metadataItems.length),
      makeIlocItem2(imageItemId, dataOffset, encoded.chunk.length),
      metadataItems.map((item) => makeIlocItem2(item.id, item.offset, item.data.length))
    ),
    fullBox2(
      "iinf",
      0,
      0,
      u162(1 + metadataItems.length),
      fullBox2(
        "infe",
        2,
        0,
        u162(imageItemId),
        u162(0),
        ascii2("av01"),
        cstr2("Color")
      ),
      metadataItems.map((item) => fullBox2(
        "infe",
        2,
        0,
        u162(item.id),
        u162(0),
        ascii2(item.type),
        cstr2(item.name ?? item.type)
      ))
    ),
    metadataItems.length === 0 ? [] : fullBox2(
      "iref",
      0,
      0,
      metadataItems.map((item) => box2("cdsc", u162(item.id), u162(1), u162(imageItemId)))
    ),
    box2(
      "iprp",
      box2(
        "ipco",
        fullBox2("ispe", 0, 0, u323(encoded.width), u323(encoded.height)),
        fullBox2("pixi", 0, 0, new Uint8Array([sequence.monochrome ? 1 : 3, ...Array(sequence.monochrome ? 1 : 3).fill(sequence.bitDepth)])),
        box2("av1C", encoded.av1Config),
        makeColrBox2(sequence)
      ),
      fullBox2(
        "ipma",
        0,
        0,
        u323(1),
        u162(imageItemId),
        new Uint8Array([4, 129, 2, 3, 4])
      )
    )
  );
}
function makeIlocItem2(itemId, offset, length) {
  return concat3([
    u162(itemId),
    u162(0),
    u162(1),
    u323(offset),
    u323(length)
  ]);
}
function makeFtypBox2(encoded, sequence) {
  const brands = [ascii2("avif"), ascii2("mif1"), ascii2("miaf")];
  if (isAvifBaselineCompatible2(encoded, sequence)) brands.push(ascii2("MA1B"));
  return box2("ftyp", ascii2("avif"), u323(0), brands);
}
function isAvifBaselineCompatible2(encoded, sequence) {
  return sequence.seqProfile === 0 && sequence.seqLevelIdx0 <= 13 && encoded.width * encoded.height <= 8912896 && encoded.width <= 8192 && encoded.height <= 4352 && !sequence.monochrome && (sequence.bitDepth === 8 || sequence.bitDepth === 10);
}
function makeColrBox2(sequence) {
  return box2(
    "colr",
    ascii2("nclx"),
    u162(sequence.colorPrimaries),
    u162(sequence.transferCharacteristics),
    u162(sequence.matrixCoefficients),
    new Uint8Array([sequence.colorRange ? 128 : 0])
  );
}
function makeAv1Config2(codec, sequenceHeaderObu) {
  const parsed = /^av01\.(\d+)\.(\d{2})([A-Z])\.(\d{2})/.exec(codec);
  const sequence = sequenceHeaderObu ? parseSequenceHeaderObu2(sequenceHeaderObu) : null;
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
function findSequenceHeaderObu2(data) {
  let offset = 0;
  while (offset < data.length) {
    const obuStart = offset;
    const header = data[offset++];
    const obuType = header >> 3 & 15;
    const extensionFlag = header >> 2 & 1;
    const hasSizeField = header >> 1 & 1;
    if (extensionFlag) offset++;
    if (!hasSizeField) return null;
    const size = readLeb1282(data, offset);
    offset = size.nextOffset;
    const payloadStart = offset;
    const payloadEnd = payloadStart + size.value;
    if (payloadEnd > data.length) return null;
    if (obuType === 1) return data.slice(obuStart, payloadEnd);
    offset = payloadEnd;
  }
  return null;
}
function parseSequenceHeaderObu2(obu) {
  let offset = 1;
  if (obu[0] >> 2 & 1) offset++;
  if (obu[0] >> 1 & 1) offset = readLeb1282(obu, offset).nextOffset;
  const bits = new BitReader2(obu.subarray(offset));
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
function readLeb1282(data, offset) {
  let value = 0;
  for (let i = 0; i < 8; i++) {
    const byte = data[offset + i];
    value |= (byte & 127) << i * 7;
    if ((byte & 128) === 0) return { value, nextOffset: offset + i + 1 };
  }
  throw new Error("Invalid LEB128 value");
}
var BitReader2 = class {
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
  const chunk = concat3(chunks);
  const decoderConfig = metadataConfig ?? { codec, codedWidth: width, codedHeight: height, description: options.av1Config };
  const sequenceHeaderObu = findSequenceHeaderObu2(chunk);
  if (!sequenceHeaderObu) throw new Error("Encoded AV1 chunk does not contain a Sequence Header OBU");
  const generatedAv1Config = makeAv1Config2(codec, sequenceHeaderObu);
  if (options.av1Config && !bytesEqual2(options.av1Config, generatedAv1Config)) {
    throw new Error("Provided av1Config does not match the encoded AV1 Sequence Header OBU");
  }
  const av1Config = generatedAv1Config;
  return { chunk, decoderConfig, av1Config, width, height };
}
async function encodeImageToAvif(source, options = {}) {
  return muxStillAvif2(await encodeImageToAv1(source, options));
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

// ../webcodecs-color/dist/index.js
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
    visibleRect: frame.visibleRect ? {
      x: frame.visibleRect.x,
      y: frame.visibleRect.y,
      width: frame.visibleRect.width,
      height: frame.visibleRect.height
    } : null,
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
  const sourceRect = visibleRectForCopy(frame);
  const sourceLayout = await getNativeLayout(frame, sourceRect);
  const source = new Uint8Array(frame.allocationSize({ rect: sourceRect }));
  await frame.copyTo(source, { layout: sourceLayout, rect: sourceRect });
  const destinationLayout = makeDestinationLayout(descriptor, options.width, options.height);
  const destination = new Uint8Array(allocationFromLayout(destinationLayout, descriptor, options.width, options.height));
  const algorithm = options.algorithm ?? "bilinear";
  for (let planeIndex = 0; planeIndex < descriptor.planes.length; planeIndex++) {
    const plane = descriptor.planes[planeIndex];
    const srcWidth = planeDimension(sourceRect.width, plane.subsampleX);
    const srcHeight = planeDimension(sourceRect.height, plane.subsampleY);
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
      samplesPerPixel: plane.samplesPerPixel ?? 1,
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
    case "NV12":
      return { bytesPerSample: 1, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 2, subsampleY: 2, samplesPerPixel: 2 }] };
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
async function getNativeLayout(frame, rect) {
  const scratch = new Uint8Array(frame.allocationSize({ rect }));
  return frame.copyTo(scratch, { rect });
}
function visibleRectForCopy(frame) {
  const rect = frame.visibleRect;
  return {
    x: rect?.x ?? 0,
    y: rect?.y ?? 0,
    width: rect?.width ?? frame.codedWidth,
    height: rect?.height ?? frame.codedHeight
  };
}
function makeDestinationLayout(descriptor, width, height) {
  let offset = 0;
  return descriptor.planes.map((plane) => {
    const planeWidth = planeDimension(width, plane.subsampleX);
    const planeHeight = planeDimension(height, plane.subsampleY);
    const stride = planeWidth * (plane.samplesPerPixel ?? 1) * descriptor.bytesPerSample;
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
      const value = options.algorithm === "nearest" ? sampleNearest(options, sourceX, sourceY, 0) : sampleBilinear(options, sourceX, sourceY, 0);
      writeSample(options.destination, options.destinationLayout, x, y, options.bytesPerSample, options.samplesPerPixel, 0, value);
      if (options.samplesPerPixel === 2) {
        const secondValue = options.algorithm === "nearest" ? sampleNearest(options, sourceX, sourceY, 1) : sampleBilinear(options, sourceX, sourceY, 1);
        writeSample(options.destination, options.destinationLayout, x, y, options.bytesPerSample, options.samplesPerPixel, 1, secondValue);
      }
    }
  }
}
function mapPixelCenter(position, destinationSize, sourceSize) {
  return (position + 0.5) * sourceSize / destinationSize - 0.5;
}
function sampleNearest(options, x, y, component) {
  return readSample(
    options.source,
    options.sourceLayout,
    clamp(Math.round(x), 0, options.sourceWidth - 1),
    clamp(Math.round(y), 0, options.sourceHeight - 1),
    options.bytesPerSample,
    options.samplesPerPixel,
    component
  );
}
function sampleBilinear(options, x, y, component) {
  const x0 = clamp(Math.floor(x), 0, options.sourceWidth - 1);
  const y0 = clamp(Math.floor(y), 0, options.sourceHeight - 1);
  const x1 = clamp(x0 + 1, 0, options.sourceWidth - 1);
  const y1 = clamp(y0 + 1, 0, options.sourceHeight - 1);
  const tx = clamp(x - x0, 0, 1);
  const ty = clamp(y - y0, 0, 1);
  const a = readSample(options.source, options.sourceLayout, x0, y0, options.bytesPerSample, options.samplesPerPixel, component);
  const b = readSample(options.source, options.sourceLayout, x1, y0, options.bytesPerSample, options.samplesPerPixel, component);
  const c = readSample(options.source, options.sourceLayout, x0, y1, options.bytesPerSample, options.samplesPerPixel, component);
  const d = readSample(options.source, options.sourceLayout, x1, y1, options.bytesPerSample, options.samplesPerPixel, component);
  return Math.round(
    a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
  );
}
function readSample(data, layout, x, y, bytesPerSample, samplesPerPixel, component) {
  const offset = layout.offset + y * layout.stride + (x * samplesPerPixel + component) * bytesPerSample;
  return bytesPerSample === 1 ? data[offset] : data[offset] | data[offset + 1] << 8;
}
function writeSample(data, layout, x, y, bytesPerSample, samplesPerPixel, component, value) {
  const offset = layout.offset + y * layout.stride + (x * samplesPerPixel + component) * bytesPerSample;
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

// src/index.ts
async function resizeAndConvertImage(options) {
  const inputBytes = await toUint8Array(options.input);
  const inputMime = options.inputMime ?? detectInputMime(inputBytes, options.input);
  const outputMime = options.outputMime ?? defaultOutputMime(inputMime);
  const exifPolicy = options.exif ?? "keep";
  const sourceExif = readSourceExif(inputBytes);
  const frame = await decodeImageToVideoFrame(inputBytes, inputMime, {
    colorSpaceConversion: options.colorSpaceConversion ?? "none"
  });
  try {
    const inputInspection = inspectFrame(frame);
    const color = classifyFrameColor(inputInspection);
    const size = resolveTargetSize(frame.displayWidth, frame.displayHeight, options);
    const resized = await resizeForColor(frame, size, options);
    try {
      const encoded = await encodeFrame(resized.frame, outputMime, {
        quality: options.quality,
        avif: options.avif
      });
      const withExif = applyExifPolicy(encoded, outputMime, sourceExif, exifPolicy);
      const blob = new Blob([copyArrayBuffer2(withExif)], { type: outputMime });
      return {
        data: withExif,
        blob,
        mime: outputMime,
        width: size.width,
        height: size.height,
        resizePath: resized.path,
        input: inputInspection,
        output: resized.path === "none" ? inputInspection : inspectFrame(resized.frame),
        color,
        exif: {
          policy: exifPolicy,
          source: sourceExif,
          written: sourceExif !== null && exifPolicy !== "drop"
        },
        warnings: resized.warnings
      };
    } finally {
      if (resized.frame !== frame) resized.frame.close();
    }
  } finally {
    frame.close();
  }
}
async function resizeImageToAvif(input, options = {}) {
  return resizeAndConvertImage({ ...options, input, outputMime: "image/avif" });
}
function readSourceExif(data) {
  try {
    return readExif(data);
  } catch {
    return null;
  }
}
function detectInputMime(data, input) {
  if (input instanceof Blob && input.type) return input.type;
  try {
    return detectImageMime(data);
  } catch {
    throw new Error("inputMime is required for image formats without EXIF transplant support");
  }
}
function defaultOutputMime(inputMime) {
  return inputMime === "image/webp" || inputMime === "image/jpeg" || inputMime === "image/avif" ? inputMime : "image/avif";
}
function resolveTargetSize(sourceWidth2, sourceHeight2, options) {
  if (options.width === void 0 && options.height === void 0) {
    return { width: sourceWidth2, height: sourceHeight2 };
  }
  if (options.width !== void 0 && options.height === void 0) {
    return { width: options.width, height: Math.max(1, Math.round(sourceHeight2 * options.width / sourceWidth2)) };
  }
  if (options.height !== void 0 && options.width === void 0) {
    return { width: Math.max(1, Math.round(sourceWidth2 * options.height / sourceHeight2)), height: options.height };
  }
  const boxWidth = options.width ?? sourceWidth2;
  const boxHeight = options.height ?? sourceHeight2;
  if ((options.fit ?? "contain") === "fill") return { width: boxWidth, height: boxHeight };
  const scale = (options.fit ?? "contain") === "cover" ? Math.max(boxWidth / sourceWidth2, boxHeight / sourceHeight2) : Math.min(boxWidth / sourceWidth2, boxHeight / sourceHeight2);
  return {
    width: Math.max(1, Math.round(sourceWidth2 * scale)),
    height: Math.max(1, Math.round(sourceHeight2 * scale))
  };
}
async function resizeForColor(frame, size, options) {
  if (size.width === frame.displayWidth && size.height === frame.displayHeight) {
    return { frame, path: "none", warnings: [] };
  }
  const warnings = [];
  const requestedPath = options.resizePath ?? "auto";
  const color = classifyFrameColor(frame);
  const shouldTryRaw = requestedPath === "raw" || requestedPath === "auto" && color.recommendedPath === "raw-or-webgpu-hdr";
  if (shouldTryRaw) {
    try {
      const resized2 = await resizeFrameRaw(frame, {
        ...size,
        algorithm: options.rawResizeAlgorithm ?? "bilinear"
      });
      return { frame: resized2.frame, path: "raw", warnings };
    } catch (error) {
      if (requestedPath === "raw") throw error;
      warnings.push(`raw resize was not available and Canvas fallback was used: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const resized = resizeFrameWithCanvas(frame, size);
  if (color.recommendedPath === "raw-or-webgpu-hdr") {
    warnings.push("Canvas fallback may collapse HDR/BT.2020 content to sRGB or Display P3.");
  }
  return { frame: resized.frame, path: "canvas", warnings };
}
async function encodeFrame(frame, mime, options) {
  if (mime === "image/avif") {
    return encodeImageToAvif(frame, {
      ...options.avif,
      width: frame.displayWidth,
      height: frame.displayHeight,
      quality: options.quality
    });
  }
  return encodeFrameWithCanvas(frame, mime, options.quality);
}
async function encodeFrameWithCanvas(frame, mime, quality = 0.85) {
  const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
  const context = canvas.getContext("2d", { colorSpace: classifyFrameColor(frame).canvasColorSpace });
  if (!context) throw new Error("Could not create 2D canvas context");
  context.drawImage(frame, 0, 0);
  const blob = await canvas.convertToBlob({ type: mime, quality });
  return toUint8Array(blob);
}
function applyExifPolicy(data, mime, sourceExif, policy) {
  if (policy === "drop" || !sourceExif) return data;
  const exifBytes = policy === "drop-gps" ? stripGpsFromExif(sourceExif.bytes) : sourceExif.bytes;
  return writeExif(data, exifBytes, mime);
}
function copyArrayBuffer2(data) {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}
async function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}
export {
  resizeAndConvertImage,
  resizeImageToAvif
};
