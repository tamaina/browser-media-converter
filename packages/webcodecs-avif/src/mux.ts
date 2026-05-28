import { ascii, box, bytesEqual, concat, cstr, fullBox, u16, u32 } from '@browser-avif-lab/binary';

export type EncodedStillAv1 = {
  chunk: Uint8Array;
  decoderConfig: VideoDecoderConfig;
  av1Config: Uint8Array;
  width: number;
  height: number;
};

export type AvifMetadataItem = {
  type: 'Exif';
  data: Uint8Array;
  name?: string;
};

export type MuxStillAvifOptions = {
  metadata?: AvifMetadataItem[];
};

export function muxStillAvif(encoded: EncodedStillAv1, options: MuxStillAvifOptions = {}): Uint8Array {
  const sequenceHeaderObu = findSequenceHeaderObu(encoded.chunk);
  if (!sequenceHeaderObu) throw new Error('Encoded AV1 chunk does not contain a Sequence Header OBU');
  const sequence = parseSequenceHeaderObu(sequenceHeaderObu);
  const expectedAv1Config = makeAv1Config(encoded.decoderConfig.codec, sequenceHeaderObu);
  if (!bytesEqual(encoded.av1Config, expectedAv1Config)) {
    throw new Error('encoded.av1Config does not match encoded.chunk Sequence Header OBU');
  }
  if (sequence.monochrome) throw new Error('Monochrome AVIF output is not supported yet');
  if (sequence.bitDepth !== 8 && sequence.bitDepth !== 10 && sequence.bitDepth !== 12) throw new Error(`Unsupported AV1 bit depth: ${sequence.bitDepth}`);
  const imageItemId = 1;
  const metadata = options.metadata ?? [];
  const itemData = [encoded.chunk, ...metadata.map((item) => item.data)];
  const metadataItems = metadata.map((item, index) => ({
    ...item,
    id: imageItemId + index + 1,
    offset: 0,
  }));
  const meta = makeMetaBox(encoded, imageItemId, 0, sequence, metadataItems);
  const ftyp = makeFtypBox(encoded, sequence);
  const mdatPayload = concat(itemData);
  const mdat = box('mdat', mdatPayload);
  let offset = ftyp.length + meta.length + 8;
  const fixedMetadataItems = metadataItems.map((item, index) => {
    offset += index === 0 ? encoded.chunk.length : metadata[index - 1].data.length;
    return { ...item, offset };
  });
  const fixedMeta = makeMetaBox(encoded, imageItemId, ftyp.length + meta.length + 8, sequence, fixedMetadataItems);
  return concat([ftyp, fixedMeta, mdat]);
}

function makeMetaBox(
  encoded: EncodedStillAv1,
  imageItemId: number,
  dataOffset: number,
  sequence: SequenceHeaderInfo,
  metadataItems: Array<AvifMetadataItem & { id: number; offset: number }> = [],
) {
  return fullBox('meta', 0, 0,
    fullBox('hdlr', 0, 0,
      u32(0),
      ascii('pict'),
      u32(0), u32(0), u32(0),
      new Uint8Array([0]),
    ),
    fullBox('pitm', 0, 0, u16(imageItemId)),
    fullBox('iloc', 0, 0,
      new Uint8Array([0x44, 0x00]),
      u16(1 + metadataItems.length),
      makeIlocItem(imageItemId, dataOffset, encoded.chunk.length),
      metadataItems.map((item) => makeIlocItem(item.id, item.offset, item.data.length)),
    ),
    fullBox('iinf', 0, 0,
      u16(1 + metadataItems.length),
      fullBox('infe', 2, 0,
        u16(imageItemId),
        u16(0),
        ascii('av01'),
        cstr('Color'),
      ),
      metadataItems.map((item) => fullBox('infe', 2, 0,
        u16(item.id),
        u16(0),
        ascii(item.type),
        cstr(item.name ?? item.type),
      )),
    ),
    metadataItems.length === 0
      ? []
      : fullBox('iref', 0, 0,
        metadataItems.map((item) => box('cdsc', u16(item.id), u16(1), u16(imageItemId))),
      ),
    box('iprp',
      box('ipco',
        fullBox('ispe', 0, 0, u32(encoded.width), u32(encoded.height)),
        fullBox('pixi', 0, 0, new Uint8Array([sequence.monochrome ? 1 : 3, ...Array(sequence.monochrome ? 1 : 3).fill(sequence.bitDepth)])),
        box('av1C', encoded.av1Config),
        makeColrBox(sequence),
      ),
      fullBox('ipma', 0, 0,
        u32(1),
        u16(imageItemId),
        new Uint8Array([4, 0x81, 0x02, 0x03, 0x04]),
      ),
    ),
  );
}

function makeIlocItem(itemId: number, offset: number, length: number) {
  return concat([
    u16(itemId),
    u16(0),
    u16(1),
    u32(offset),
    u32(length),
  ]);
}

function makeFtypBox(encoded: EncodedStillAv1, sequence: SequenceHeaderInfo) {
  const brands = [ascii('avif'), ascii('mif1'), ascii('miaf')];
  if (isAvifBaselineCompatible(encoded, sequence)) brands.push(ascii('MA1B'));
  return box('ftyp', ascii('avif'), u32(0), brands);
}

function isAvifBaselineCompatible(encoded: EncodedStillAv1, sequence: SequenceHeaderInfo) {
  return sequence.seqProfile === 0
    && sequence.seqLevelIdx0 <= 13
    && encoded.width * encoded.height <= 8_912_896
    && encoded.width <= 8192
    && encoded.height <= 4352
    && !sequence.monochrome
    && (sequence.bitDepth === 8 || sequence.bitDepth === 10);
}

function makeColrBox(sequence: SequenceHeaderInfo) {
  return box('colr',
    ascii('nclx'),
    u16(sequence.colorPrimaries),
    u16(sequence.transferCharacteristics),
    u16(sequence.matrixCoefficients),
    new Uint8Array([sequence.colorRange ? 0x80 : 0x00]),
  );
}

type SequenceHeaderInfo = ReturnType<typeof parseSequenceHeaderObu>;

export function makeAv1Config(codec: string, sequenceHeaderObu: Uint8Array | null) {
  const parsed = /^av01\.(\d+)\.(\d{2})([A-Z])\.(\d{2})/.exec(codec);
  const sequence = sequenceHeaderObu ? parseSequenceHeaderObu(sequenceHeaderObu) : null;
  const seqProfile = sequence?.seqProfile ?? (parsed ? Number(parsed[1]) : 0);
  const seqLevelIdx0 = sequence?.seqLevelIdx0 ?? (parsed ? Number(parsed[2]) : 8);
  const seqTier0 = sequence?.seqTier0 ?? (parsed?.[3] === 'H' ? 1 : 0);
  const highBitdepth = sequence?.highBitdepth ?? (parsed ? Number(parsed[4]) > 8 : false);
  const twelveBit = sequence?.twelveBit ?? (parsed ? Number(parsed[4]) === 12 : false);
  const monochrome = sequence?.monochrome ?? false;
  const chromaSubsamplingX = sequence?.chromaSubsamplingX ?? (seqProfile === 1 ? 0 : 1);
  const chromaSubsamplingY = sequence?.chromaSubsamplingY ?? (seqProfile === 1 ? 0 : 1);
  const chromaSamplePosition = sequence?.chromaSamplePosition ?? 0;
  return new Uint8Array([
    0x81,
    ((seqProfile & 0x07) << 5) | (seqLevelIdx0 & 0x1f),
    ((seqTier0 & 1) << 7)
      | (Number(highBitdepth) << 6)
      | (Number(twelveBit) << 5)
      | (Number(monochrome) << 4)
      | (Number(chromaSubsamplingX) << 3)
      | (Number(chromaSubsamplingY) << 2)
      | (chromaSamplePosition & 0x03),
    0,
    ...(sequenceHeaderObu ? [...sequenceHeaderObu] : []),
  ]);
}

export function findSequenceHeaderObu(data: Uint8Array) {
  let offset = 0;
  while (offset < data.length) {
    const obuStart = offset;
    const header = data[offset++];
    const obuType = (header >> 3) & 0x0f;
    const extensionFlag = (header >> 2) & 1;
    const hasSizeField = (header >> 1) & 1;
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

function parseSequenceHeaderObu(obu: Uint8Array) {
  let offset = 1;
  if ((obu[0] >> 2) & 1) offset++;
  if ((obu[0] >> 1) & 1) offset = readLeb128(obu, offset).nextOffset;
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
  const bitDepth = seqProfile === 2 && highBitdepth ? (twelveBit ? 12 : 10) : (highBitdepth ? 10 : 8);
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
    chromaSamplePosition,
  };
}

function readLeb128(data: Uint8Array, offset: number) {
  let value = 0;
  for (let i = 0; i < 8; i++) {
    const byte = data[offset + i];
    value |= (byte & 0x7f) << (i * 7);
    if ((byte & 0x80) === 0) return { value, nextOffset: offset + i + 1 };
  }
  throw new Error('Invalid LEB128 value');
}

class BitReader {
  #data: Uint8Array;
  #bitOffset = 0;

  constructor(data: Uint8Array) {
    this.#data = data;
  }

  read(count: number) {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byte = this.#data[this.#bitOffset >> 3] ?? 0;
      value = (value << 1) | ((byte >> (7 - (this.#bitOffset & 7))) & 1);
      this.#bitOffset++;
    }
    return value;
  }

  skip(count: number) {
    this.#bitOffset += count;
  }

  skipUvlc() {
    let leadingZeroes = 0;
    while (this.read(1) === 0) leadingZeroes++;
    if (leadingZeroes > 0) this.skip(leadingZeroes);
  }
}
