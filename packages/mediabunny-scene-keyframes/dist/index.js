// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/misc.js
function assert(x) {
  if (!x) {
    throw new Error("Assertion failed.");
  }
}
var normalizeRotation = (rotation) => {
  const mappedRotation = (rotation % 360 + 360) % 360;
  if (mappedRotation === 0 || mappedRotation === 90 || mappedRotation === 180 || mappedRotation === 270) {
    return mappedRotation;
  } else {
    throw new Error(`Invalid rotation ${rotation}.`);
  }
};
var last = (arr) => {
  return arr && arr[arr.length - 1];
};
var isU32 = (value) => {
  return value >= 0 && value < 2 ** 32;
};
var readExpGolomb = (bitstream) => {
  let leadingZeroBits = 0;
  while (bitstream.readBits(1) === 0 && leadingZeroBits < 32) {
    leadingZeroBits++;
  }
  if (leadingZeroBits >= 32) {
    throw new Error("Invalid exponential-Golomb code.");
  }
  const result = (1 << leadingZeroBits) - 1 + bitstream.readBits(leadingZeroBits);
  return result;
};
var readSignedExpGolomb = (bitstream) => {
  const codeNum = readExpGolomb(bitstream);
  return (codeNum & 1) === 0 ? -(codeNum >> 1) : codeNum + 1 >> 1;
};
var toUint8Array = (source) => {
  if (source.constructor === Uint8Array) {
    return source;
  } else if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  } else {
    return new Uint8Array(source);
  }
};
var toDataView = (source) => {
  if (source.constructor === DataView) {
    return source;
  } else if (ArrayBuffer.isView(source)) {
    return new DataView(source.buffer, source.byteOffset, source.byteLength);
  } else {
    return new DataView(source);
  }
};
var textDecoder = /* @__PURE__ */ new TextDecoder();
var textEncoder = /* @__PURE__ */ new TextEncoder();
var invertObject = (object) => {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [value, key]));
};
var COLOR_PRIMARIES_MAP = {
  bt709: 1,
  // ITU-R BT.709
  bt470bg: 5,
  // ITU-R BT.470BG
  smpte170m: 6,
  // ITU-R BT.601 525 - SMPTE 170M
  bt2020: 9,
  // ITU-R BT.202
  smpte432: 12
  // SMPTE EG 432-1
};
var COLOR_PRIMARIES_MAP_INVERSE = /* @__PURE__ */ invertObject(COLOR_PRIMARIES_MAP);
var TRANSFER_CHARACTERISTICS_MAP = {
  "bt709": 1,
  // ITU-R BT.709
  "smpte170m": 6,
  // SMPTE 170M
  "linear": 8,
  // Linear transfer characteristics
  "iec61966-2-1": 13,
  // IEC 61966-2-1
  "pq": 16,
  // Rec. ITU-R BT.2100-2 perceptual quantization (PQ) system
  "hlg": 18
  // Rec. ITU-R BT.2100-2 hybrid loggamma (HLG) system
};
var TRANSFER_CHARACTERISTICS_MAP_INVERSE = /* @__PURE__ */ invertObject(TRANSFER_CHARACTERISTICS_MAP);
var MATRIX_COEFFICIENTS_MAP = {
  "rgb": 0,
  // Identity
  "bt709": 1,
  // ITU-R BT.709
  "bt470bg": 5,
  // ITU-R BT.470BG
  "smpte170m": 6,
  // SMPTE 170M
  "bt2020-ncl": 9
  // ITU-R BT.2020-2 (non-constant luminance)
};
var MATRIX_COEFFICIENTS_MAP_INVERSE = /* @__PURE__ */ invertObject(MATRIX_COEFFICIENTS_MAP);
var colorSpaceIsComplete = (colorSpace) => {
  return !!colorSpace && !!colorSpace.primaries && !!colorSpace.transfer && !!colorSpace.matrix && colorSpace.fullRange !== void 0;
};
var isAllowSharedBufferSource = (x) => {
  return x instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && x instanceof SharedArrayBuffer || ArrayBuffer.isView(x);
};
var AsyncMutex = class {
  constructor() {
    this.currentPromise = Promise.resolve();
    this.pending = 0;
  }
  async acquire() {
    let resolver;
    const nextPromise = new Promise((resolve) => {
      let resolved = false;
      resolver = () => {
        if (resolved) {
          return;
        }
        resolve();
        this.pending--;
        resolved = true;
      };
    });
    const currentPromiseAlias = this.currentPromise;
    this.currentPromise = nextPromise;
    this.pending++;
    await currentPromiseAlias;
    return resolver;
  }
};
var HEX_STRING_REGEX = /^[0-9a-fA-F]+$/;
var bytesToHexString = (bytes2) => {
  return [...bytes2].map((x) => x.toString(16).padStart(2, "0")).join("");
};
var hexStringToBytes = (hexString) => {
  assert(hexString.length % 2 === 0);
  const bytes2 = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes2[i / 2] = parseInt(hexString.slice(i, i + 2), 16);
  }
  return bytes2;
};
var reverseBitsU32 = (x) => {
  x = x >> 1 & 1431655765 | (x & 1431655765) << 1;
  x = x >> 2 & 858993459 | (x & 858993459) << 2;
  x = x >> 4 & 252645135 | (x & 252645135) << 4;
  x = x >> 8 & 16711935 | (x & 16711935) << 8;
  x = x >> 16 & 65535 | (x & 65535) << 16;
  return x >>> 0;
};
var binarySearchExact = (arr, key, valueGetter) => {
  let low = 0;
  let high = arr.length - 1;
  let ans = -1;
  while (low <= high) {
    const mid = low + high >> 1;
    const midVal = valueGetter(arr[mid]);
    if (midVal === key) {
      ans = mid;
      high = mid - 1;
    } else if (midVal < key) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return ans;
};
var binarySearchLessOrEqual = (arr, key, valueGetter) => {
  let low = 0;
  let high = arr.length - 1;
  let ans = -1;
  while (low <= high) {
    const mid = low + (high - low + 1) / 2 | 0;
    const midVal = valueGetter(arr[mid]);
    if (midVal <= key) {
      ans = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return ans;
};
var insertSorted = (arr, item, valueGetter) => {
  const insertionIndex = binarySearchLessOrEqual(arr, valueGetter(item), valueGetter);
  arr.splice(insertionIndex + 1, 0, item);
};
var promiseWithResolvers = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
var removeItem = (arr, item) => {
  const index = arr.indexOf(item);
  if (index !== -1) {
    arr.splice(index, 1);
  }
};
var findLastIndex = (arr, predicate) => {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) {
      return i;
    }
  }
  return -1;
};
var toAsyncIterator = async function* (source) {
  if (Symbol.iterator in source) {
    yield* source[Symbol.iterator]();
  } else {
    yield* source[Symbol.asyncIterator]();
  }
};
var validateAnyIterable = (iterable) => {
  if (!(Symbol.iterator in iterable) && !(Symbol.asyncIterator in iterable)) {
    throw new TypeError("Argument must be an iterable or async iterable.");
  }
};
var assertNever = (x) => {
  throw new Error(`Unexpected value: ${x}`);
};
var getUint24 = (view2, byteOffset, littleEndian) => {
  const byte1 = view2.getUint8(byteOffset);
  const byte2 = view2.getUint8(byteOffset + 1);
  const byte3 = view2.getUint8(byteOffset + 2);
  if (littleEndian) {
    return byte1 | byte2 << 8 | byte3 << 16;
  } else {
    return byte1 << 16 | byte2 << 8 | byte3;
  }
};
var getInt24 = (view2, byteOffset, littleEndian) => {
  return getUint24(view2, byteOffset, littleEndian) << 8 >> 8;
};
var setUint24 = (view2, byteOffset, value, littleEndian) => {
  value = value >>> 0;
  value = value & 16777215;
  if (littleEndian) {
    view2.setUint8(byteOffset, value & 255);
    view2.setUint8(byteOffset + 1, value >>> 8 & 255);
    view2.setUint8(byteOffset + 2, value >>> 16 & 255);
  } else {
    view2.setUint8(byteOffset, value >>> 16 & 255);
    view2.setUint8(byteOffset + 1, value >>> 8 & 255);
    view2.setUint8(byteOffset + 2, value & 255);
  }
};
var setInt24 = (view2, byteOffset, value, littleEndian) => {
  value = clamp(value, -8388608, 8388607);
  if (value < 0) {
    value = value + 16777216 & 16777215;
  }
  setUint24(view2, byteOffset, value, littleEndian);
};
var clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};
var UNDETERMINED_LANGUAGE = "und";
var roundIfAlmostInteger = (value) => {
  const rounded = Math.round(value);
  if (Math.abs(value / rounded - 1) < 10 * Number.EPSILON) {
    return rounded;
  } else {
    return value;
  }
};
var roundToMultiple = (value, multiple) => {
  return Math.round(value / multiple) * multiple;
};
var roundToDivisor = (value, multiple) => {
  return Math.round(value * multiple) / multiple;
};
var floorToDivisor = (value, multiple) => {
  return Math.floor(value * multiple) / multiple;
};
var ISO_639_2_REGEX = /^[a-z]{3}$/;
var isIso639Dash2LanguageCode = (x) => {
  return ISO_639_2_REGEX.test(x);
};
var SECOND_TO_MICROSECOND_FACTOR = 1e6 * (1 + Number.EPSILON);
var computeRationalApproximation = (x, maxDenominator) => {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  let prevNumerator = 0, prevDenominator = 1;
  let currNumerator = 1, currDenominator = 0;
  let remainder = x;
  while (true) {
    const integer = Math.floor(remainder);
    const nextNumerator = integer * currNumerator + prevNumerator;
    const nextDenominator = integer * currDenominator + prevDenominator;
    if (nextDenominator > maxDenominator) {
      return {
        num: sign * currNumerator,
        den: currDenominator
      };
    }
    prevNumerator = currNumerator;
    prevDenominator = currDenominator;
    currNumerator = nextNumerator;
    currDenominator = nextDenominator;
    remainder = 1 / (remainder - integer);
    if (!isFinite(remainder)) {
      break;
    }
  }
  return {
    num: sign * currNumerator,
    den: currDenominator
  };
};
var CallSerializer = class {
  constructor() {
    this.currentPromise = Promise.resolve();
  }
  call(fn) {
    return this.currentPromise = this.currentPromise.then(fn);
  }
};
var isWebKitCache = null;
var isWebKit = () => {
  if (isWebKitCache !== null) {
    return isWebKitCache;
  }
  return isWebKitCache = !!(typeof navigator !== "undefined" && // eslint-disable-next-line @typescript-eslint/no-deprecated
  (navigator.vendor?.match(/apple/i) || /AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) || /\b(iPad|iPhone|iPod)\b/.test(navigator.userAgent)));
};
var isFirefoxCache = null;
var isFirefox = () => {
  if (isFirefoxCache !== null) {
    return isFirefoxCache;
  }
  return isFirefoxCache = typeof navigator !== "undefined" && navigator.userAgent?.includes("Firefox");
};
var isChromiumCache = null;
var isChromium = () => {
  if (isChromiumCache !== null) {
    return isChromiumCache;
  }
  return isChromiumCache = !!(typeof navigator !== "undefined" && (navigator.vendor?.includes("Google Inc") || /Chrome/.test(navigator.userAgent)));
};
var chromiumVersionCache = null;
var getChromiumVersion = () => {
  if (chromiumVersionCache !== null) {
    return chromiumVersionCache;
  }
  if (typeof navigator === "undefined") {
    return null;
  }
  const match = /\bChrome\/(\d+)/.exec(navigator.userAgent);
  if (!match) {
    return null;
  }
  return chromiumVersionCache = Number(match[1]);
};
var closedIntervalsOverlap = (startA, endA, startB, endB) => {
  return startA <= endB && startB <= endA;
};
var keyValueIterator = function* (object) {
  for (const key in object) {
    const value = object[key];
    if (value === void 0) {
      continue;
    }
    yield { key, value };
  }
};
var uint8ArraysAreEqual = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};
var polyfillSymbolDispose = () => {
  Symbol.dispose ??= /* @__PURE__ */ Symbol("Symbol.dispose");
};
var isNumber = (x) => {
  return typeof x === "number" && !Number.isNaN(x);
};
var joinPaths = (basePath, relativePath) => {
  if (relativePath.includes("://")) {
    return relativePath;
  }
  if (basePath.includes("://")) {
    const queryIndex = basePath.indexOf("?");
    if (queryIndex !== -1) {
      basePath = basePath.slice(0, queryIndex);
    }
  }
  let result;
  if (relativePath.startsWith("/")) {
    const protocolIndex2 = basePath.indexOf("://");
    if (protocolIndex2 === -1) {
      result = relativePath;
    } else {
      const pathStart = basePath.indexOf("/", protocolIndex2 + 3);
      if (pathStart === -1) {
        result = basePath + relativePath;
      } else {
        result = basePath.slice(0, pathStart) + relativePath;
      }
    }
  } else {
    const lastSlash = basePath.lastIndexOf("/");
    if (lastSlash === -1) {
      result = relativePath;
    } else {
      result = basePath.slice(0, lastSlash + 1) + relativePath;
    }
  }
  let prefix = "";
  const protocolIndex = result.indexOf("://");
  if (protocolIndex !== -1) {
    const pathStart = result.indexOf("/", protocolIndex + 3);
    if (pathStart !== -1) {
      prefix = result.slice(0, pathStart);
      result = result.slice(pathStart);
    }
  }
  const segments = result.split("/");
  const normalized = [];
  for (const segment of segments) {
    if (segment === "..") {
      normalized.pop();
    } else if (segment !== ".") {
      normalized.push(segment);
    }
  }
  return prefix + normalized.join("/");
};
var arrayCount = (array, predicate) => {
  let count = 0;
  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i])) {
      count++;
    }
  }
  return count;
};
var arrayArgmin = (array, getValue) => {
  let minIndex = -1;
  let minValue = Infinity;
  for (let i = 0; i < array.length; i++) {
    const value = getValue(array[i]);
    if (value < minValue) {
      minValue = value;
      minIndex = i;
    }
  }
  return minIndex;
};
var arrayArgmax = (array, getValue) => {
  let maxIndex = -1;
  let maxValue = -Infinity;
  for (let i = 0; i < array.length; i++) {
    const value = getValue(array[i]);
    if (value > maxValue) {
      maxValue = value;
      maxIndex = i;
    }
  }
  return maxIndex;
};
var simplifyRational = (rational) => {
  assert(Number.isInteger(rational.num));
  assert(Number.isInteger(rational.den));
  assert(rational.den !== 0);
  let a = Math.abs(rational.num);
  let b = Math.abs(rational.den);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  const gcd = a || 1;
  return {
    num: rational.num / gcd,
    den: rational.den / gcd
  };
};
var validateRectangle = (rect, propertyPath) => {
  if (typeof rect !== "object" || !rect) {
    throw new TypeError(`${propertyPath} must be an object.`);
  }
  if (!Number.isInteger(rect.left) || rect.left < 0) {
    throw new TypeError(`${propertyPath}.left must be a non-negative integer.`);
  }
  if (!Number.isInteger(rect.top) || rect.top < 0) {
    throw new TypeError(`${propertyPath}.top must be a non-negative integer.`);
  }
  if (!Number.isInteger(rect.width) || rect.width < 0) {
    throw new TypeError(`${propertyPath}.width must be a non-negative integer.`);
  }
  if (!Number.isInteger(rect.height) || rect.height < 0) {
    throw new TypeError(`${propertyPath}.height must be a non-negative integer.`);
  }
};
var toArray = (x) => {
  if (Array.isArray(x)) {
    return x;
  } else {
    return [x];
  }
};
var EventEmitter = class {
  constructor() {
    this._listeners = /* @__PURE__ */ new Map();
  }
  /** Registers a listener for the given event. */
  on(event, listener, options) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, /* @__PURE__ */ new Set());
    }
    const entry = { fn: listener, once: options?.once ?? false };
    this._listeners.get(event).add(entry);
    return () => {
      this._listeners.get(event)?.delete(entry);
    };
  }
  /** @internal */
  _emit(...args) {
    const [event, data] = args;
    const listeners = this._listeners.get(event);
    if (!listeners) {
      return;
    }
    for (const entry of listeners) {
      try {
        entry.fn(data);
      } catch (error) {
        console.error(error);
      }
      if (entry.once) {
        listeners.delete(entry);
      }
    }
  }
};
var ceilToMultipleOfTwo = (value) => Math.ceil(value / 2) * 2;
var isRecordStringString = (value) => {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every((x) => typeof x === "string");
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/metadata.js
var RichImageData = class {
  /** Creates a new {@link RichImageData}. */
  constructor(data, mimeType) {
    this.data = data;
    this.mimeType = mimeType;
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be a Uint8Array.");
    }
    if (typeof mimeType !== "string") {
      throw new TypeError("mimeType must be a string.");
    }
  }
};
var AttachedFile = class {
  /** Creates a new {@link AttachedFile}. */
  constructor(data, mimeType, name, description) {
    this.data = data;
    this.mimeType = mimeType;
    this.name = name;
    this.description = description;
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be a Uint8Array.");
    }
    if (mimeType !== void 0 && typeof mimeType !== "string") {
      throw new TypeError("mimeType, when provided, must be a string.");
    }
    if (name !== void 0 && typeof name !== "string") {
      throw new TypeError("name, when provided, must be a string.");
    }
    if (description !== void 0 && typeof description !== "string") {
      throw new TypeError("description, when provided, must be a string.");
    }
  }
};
var validateMetadataTags = (tags) => {
  if (!tags || typeof tags !== "object") {
    throw new TypeError("tags must be an object.");
  }
  if (tags.title !== void 0 && typeof tags.title !== "string") {
    throw new TypeError("tags.title, when provided, must be a string.");
  }
  if (tags.description !== void 0 && typeof tags.description !== "string") {
    throw new TypeError("tags.description, when provided, must be a string.");
  }
  if (tags.artist !== void 0 && typeof tags.artist !== "string") {
    throw new TypeError("tags.artist, when provided, must be a string.");
  }
  if (tags.album !== void 0 && typeof tags.album !== "string") {
    throw new TypeError("tags.album, when provided, must be a string.");
  }
  if (tags.albumArtist !== void 0 && typeof tags.albumArtist !== "string") {
    throw new TypeError("tags.albumArtist, when provided, must be a string.");
  }
  if (tags.trackNumber !== void 0 && (!Number.isInteger(tags.trackNumber) || tags.trackNumber <= 0)) {
    throw new TypeError("tags.trackNumber, when provided, must be a positive integer.");
  }
  if (tags.tracksTotal !== void 0 && (!Number.isInteger(tags.tracksTotal) || tags.tracksTotal <= 0)) {
    throw new TypeError("tags.tracksTotal, when provided, must be a positive integer.");
  }
  if (tags.discNumber !== void 0 && (!Number.isInteger(tags.discNumber) || tags.discNumber <= 0)) {
    throw new TypeError("tags.discNumber, when provided, must be a positive integer.");
  }
  if (tags.discsTotal !== void 0 && (!Number.isInteger(tags.discsTotal) || tags.discsTotal <= 0)) {
    throw new TypeError("tags.discsTotal, when provided, must be a positive integer.");
  }
  if (tags.genre !== void 0 && typeof tags.genre !== "string") {
    throw new TypeError("tags.genre, when provided, must be a string.");
  }
  if (tags.date !== void 0 && (!(tags.date instanceof Date) || Number.isNaN(tags.date.getTime()))) {
    throw new TypeError("tags.date, when provided, must be a valid Date.");
  }
  if (tags.lyrics !== void 0 && typeof tags.lyrics !== "string") {
    throw new TypeError("tags.lyrics, when provided, must be a string.");
  }
  if (tags.images !== void 0) {
    if (!Array.isArray(tags.images)) {
      throw new TypeError("tags.images, when provided, must be an array.");
    }
    for (const image of tags.images) {
      if (!image || typeof image !== "object") {
        throw new TypeError("Each image in tags.images must be an object.");
      }
      if (!(image.data instanceof Uint8Array)) {
        throw new TypeError("Each image.data must be a Uint8Array.");
      }
      if (typeof image.mimeType !== "string") {
        throw new TypeError("Each image.mimeType must be a string.");
      }
      if (!["coverFront", "coverBack", "unknown"].includes(image.kind)) {
        throw new TypeError("Each image.kind must be 'coverFront', 'coverBack', or 'unknown'.");
      }
    }
  }
  if (tags.comment !== void 0 && typeof tags.comment !== "string") {
    throw new TypeError("tags.comment, when provided, must be a string.");
  }
  if (tags.raw !== void 0) {
    if (!tags.raw || typeof tags.raw !== "object") {
      throw new TypeError("tags.raw, when provided, must be an object.");
    }
    for (const value of Object.values(tags.raw)) {
      if (value !== null && typeof value !== "string" && !(value instanceof Uint8Array) && !(value instanceof RichImageData) && !(value instanceof AttachedFile) && !isRecordStringString(value)) {
        throw new TypeError("Each value in tags.raw must be a string, Uint8Array, RichImageData, AttachedFile, Record<string, string>, or null.");
      }
    }
  }
};
var DEFAULT_TRACK_DISPOSITION = {
  default: true,
  primary: true,
  forced: false,
  original: false,
  commentary: false,
  hearingImpaired: false,
  visuallyImpaired: false
};
var validateTrackDisposition = (disposition) => {
  if (!disposition || typeof disposition !== "object") {
    throw new TypeError("disposition must be an object.");
  }
  if (disposition.default !== void 0 && typeof disposition.default !== "boolean") {
    throw new TypeError("disposition.default must be a boolean.");
  }
  if (disposition.primary !== void 0 && typeof disposition.primary !== "boolean") {
    throw new TypeError("disposition.primary must be a boolean.");
  }
  if (disposition.forced !== void 0 && typeof disposition.forced !== "boolean") {
    throw new TypeError("disposition.forced must be a boolean.");
  }
  if (disposition.original !== void 0 && typeof disposition.original !== "boolean") {
    throw new TypeError("disposition.original must be a boolean.");
  }
  if (disposition.commentary !== void 0 && typeof disposition.commentary !== "boolean") {
    throw new TypeError("disposition.commentary must be a boolean.");
  }
  if (disposition.hearingImpaired !== void 0 && typeof disposition.hearingImpaired !== "boolean") {
    throw new TypeError("disposition.hearingImpaired must be a boolean.");
  }
  if (disposition.visuallyImpaired !== void 0 && typeof disposition.visuallyImpaired !== "boolean") {
    throw new TypeError("disposition.visuallyImpaired must be a boolean.");
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/shared/bitstream.js
var Bitstream = class _Bitstream {
  constructor(bytes2) {
    this.bytes = bytes2;
    this.pos = 0;
  }
  seekToByte(byteOffset) {
    this.pos = 8 * byteOffset;
  }
  readBit() {
    const byteIndex = Math.floor(this.pos / 8);
    const byte = this.bytes[byteIndex] ?? 0;
    const bitIndex = 7 - (this.pos & 7);
    const bit = (byte & 1 << bitIndex) >> bitIndex;
    this.pos++;
    return bit;
  }
  readBits(n) {
    if (n === 1) {
      return this.readBit();
    }
    let result = 0;
    for (let i = 0; i < n; i++) {
      result <<= 1;
      result |= this.readBit();
    }
    return result;
  }
  writeBits(n, value) {
    const end = this.pos + n;
    for (let i = this.pos; i < end; i++) {
      const byteIndex = Math.floor(i / 8);
      let byte = this.bytes[byteIndex];
      const bitIndex = 7 - (i & 7);
      byte &= ~(1 << bitIndex);
      byte |= (value & 1 << end - i - 1) >> end - i - 1 << bitIndex;
      this.bytes[byteIndex] = byte;
    }
    this.pos = end;
  }
  readAlignedByte() {
    if (this.pos % 8 !== 0) {
      throw new Error("Bitstream is not byte-aligned.");
    }
    const byteIndex = this.pos / 8;
    const byte = this.bytes[byteIndex] ?? 0;
    this.pos += 8;
    return byte;
  }
  skipBits(n) {
    this.pos += n;
  }
  getBitsLeft() {
    return this.bytes.length * 8 - this.pos;
  }
  clone() {
    const clone = new _Bitstream(this.bytes);
    clone.pos = this.pos;
    return clone;
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/shared/aac-misc.js
var aacFrequencyTable = [
  96e3,
  88200,
  64e3,
  48e3,
  44100,
  32e3,
  24e3,
  22050,
  16e3,
  12e3,
  11025,
  8e3,
  7350
];
var aacChannelMap = [-1, 1, 2, 3, 4, 5, 6, 8];
var parseAacAudioSpecificConfig = (bytes2) => {
  if (!bytes2 || bytes2.byteLength < 2) {
    throw new TypeError("AAC description must be at least 2 bytes long.");
  }
  const bitstream = new Bitstream(bytes2);
  let objectType = bitstream.readBits(5);
  if (objectType === 31) {
    objectType = 32 + bitstream.readBits(6);
  }
  const frequencyIndex = bitstream.readBits(4);
  let sampleRate = null;
  if (frequencyIndex === 15) {
    sampleRate = bitstream.readBits(24);
  } else {
    if (frequencyIndex < aacFrequencyTable.length) {
      sampleRate = aacFrequencyTable[frequencyIndex];
    }
  }
  const channelConfiguration = bitstream.readBits(4);
  let numberOfChannels = null;
  if (channelConfiguration >= 1 && channelConfiguration <= 7) {
    numberOfChannels = aacChannelMap[channelConfiguration];
  }
  return {
    objectType,
    frequencyIndex,
    sampleRate,
    channelConfiguration,
    numberOfChannels
  };
};
var buildAacAudioSpecificConfig = (config) => {
  let frequencyIndex = aacFrequencyTable.indexOf(config.sampleRate);
  let customSampleRate = null;
  if (frequencyIndex === -1) {
    frequencyIndex = 15;
    customSampleRate = config.sampleRate;
  }
  const channelConfiguration = aacChannelMap.indexOf(config.numberOfChannels);
  if (channelConfiguration === -1) {
    throw new TypeError(`Unsupported number of channels: ${config.numberOfChannels}`);
  }
  let bitCount = 5 + 4 + 4;
  if (config.objectType >= 32) {
    bitCount += 6;
  }
  if (frequencyIndex === 15) {
    bitCount += 24;
  }
  const byteCount = Math.ceil(bitCount / 8);
  const bytes2 = new Uint8Array(byteCount);
  const bitstream = new Bitstream(bytes2);
  if (config.objectType < 32) {
    bitstream.writeBits(5, config.objectType);
  } else {
    bitstream.writeBits(5, 31);
    bitstream.writeBits(6, config.objectType - 32);
  }
  bitstream.writeBits(4, frequencyIndex);
  if (frequencyIndex === 15) {
    bitstream.writeBits(24, customSampleRate);
  }
  bitstream.writeBits(4, channelConfiguration);
  return bytes2;
};
var buildAdtsHeaderTemplate = (config) => {
  const header = new Uint8Array(7);
  const bitstream = new Bitstream(header);
  const { objectType, frequencyIndex, channelConfiguration } = config;
  const profile = objectType - 1;
  bitstream.writeBits(12, 4095);
  bitstream.writeBits(1, 0);
  bitstream.writeBits(2, 0);
  bitstream.writeBits(1, 1);
  bitstream.writeBits(2, profile);
  bitstream.writeBits(4, frequencyIndex);
  bitstream.writeBits(1, 0);
  bitstream.writeBits(3, channelConfiguration);
  bitstream.writeBits(1, 0);
  bitstream.writeBits(1, 0);
  bitstream.writeBits(1, 0);
  bitstream.writeBits(1, 0);
  bitstream.skipBits(13);
  bitstream.writeBits(11, 2047);
  bitstream.writeBits(2, 0);
  return { header, bitstream };
};
var writeAdtsFrameLength = (bitstream, frameLength) => {
  bitstream.pos = 30;
  bitstream.writeBits(13, frameLength);
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/codec.js
var VIDEO_CODECS = [
  "avc",
  "hevc",
  "vp9",
  "av1",
  "vp8"
];
var PCM_AUDIO_CODECS = [
  "pcm-s16",
  // We don't prefix 'le' so we're compatible with the WebCodecs-registered PCM codec strings
  "pcm-s16be",
  "pcm-s24",
  "pcm-s24be",
  "pcm-s32",
  "pcm-s32be",
  "pcm-f32",
  "pcm-f32be",
  "pcm-f64",
  "pcm-f64be",
  "pcm-u8",
  "pcm-s8",
  "ulaw",
  "alaw"
];
var NON_PCM_AUDIO_CODECS = [
  "aac",
  "opus",
  "mp3",
  "vorbis",
  "flac",
  "ac3",
  "eac3"
];
var AUDIO_CODECS = [
  ...NON_PCM_AUDIO_CODECS,
  ...PCM_AUDIO_CODECS
];
var SUBTITLE_CODECS = [
  "webvtt"
];
var AVC_LEVEL_TABLE = [
  { maxMacroblocks: 99, maxBitrate: 64e3, maxDpbMbs: 396, level: 10 },
  // Level 1
  { maxMacroblocks: 396, maxBitrate: 192e3, maxDpbMbs: 900, level: 11 },
  // Level 1.1
  { maxMacroblocks: 396, maxBitrate: 384e3, maxDpbMbs: 2376, level: 12 },
  // Level 1.2
  { maxMacroblocks: 396, maxBitrate: 768e3, maxDpbMbs: 2376, level: 13 },
  // Level 1.3
  { maxMacroblocks: 396, maxBitrate: 2e6, maxDpbMbs: 2376, level: 20 },
  // Level 2
  { maxMacroblocks: 792, maxBitrate: 4e6, maxDpbMbs: 4752, level: 21 },
  // Level 2.1
  { maxMacroblocks: 1620, maxBitrate: 4e6, maxDpbMbs: 8100, level: 22 },
  // Level 2.2
  { maxMacroblocks: 1620, maxBitrate: 1e7, maxDpbMbs: 8100, level: 30 },
  // Level 3
  { maxMacroblocks: 3600, maxBitrate: 14e6, maxDpbMbs: 18e3, level: 31 },
  // Level 3.1
  { maxMacroblocks: 5120, maxBitrate: 2e7, maxDpbMbs: 20480, level: 32 },
  // Level 3.2
  { maxMacroblocks: 8192, maxBitrate: 2e7, maxDpbMbs: 32768, level: 40 },
  // Level 4
  { maxMacroblocks: 8192, maxBitrate: 5e7, maxDpbMbs: 32768, level: 41 },
  // Level 4.1
  { maxMacroblocks: 8704, maxBitrate: 5e7, maxDpbMbs: 34816, level: 42 },
  // Level 4.2
  { maxMacroblocks: 22080, maxBitrate: 135e6, maxDpbMbs: 110400, level: 50 },
  // Level 5
  { maxMacroblocks: 36864, maxBitrate: 24e7, maxDpbMbs: 184320, level: 51 },
  // Level 5.1
  { maxMacroblocks: 36864, maxBitrate: 24e7, maxDpbMbs: 184320, level: 52 },
  // Level 5.2
  { maxMacroblocks: 139264, maxBitrate: 24e7, maxDpbMbs: 696320, level: 60 },
  // Level 6
  { maxMacroblocks: 139264, maxBitrate: 48e7, maxDpbMbs: 696320, level: 61 },
  // Level 6.1
  { maxMacroblocks: 139264, maxBitrate: 8e8, maxDpbMbs: 696320, level: 62 }
  // Level 6.2
];
var HEVC_LEVEL_TABLE = [
  { maxPictureSize: 36864, maxBitrate: 128e3, tier: "L", level: 30 },
  // Level 1 (Low Tier)
  { maxPictureSize: 122880, maxBitrate: 15e5, tier: "L", level: 60 },
  // Level 2 (Low Tier)
  { maxPictureSize: 245760, maxBitrate: 3e6, tier: "L", level: 63 },
  // Level 2.1 (Low Tier)
  { maxPictureSize: 552960, maxBitrate: 6e6, tier: "L", level: 90 },
  // Level 3 (Low Tier)
  { maxPictureSize: 983040, maxBitrate: 1e7, tier: "L", level: 93 },
  // Level 3.1 (Low Tier)
  { maxPictureSize: 2228224, maxBitrate: 12e6, tier: "L", level: 120 },
  // Level 4 (Low Tier)
  { maxPictureSize: 2228224, maxBitrate: 3e7, tier: "H", level: 120 },
  // Level 4 (High Tier)
  { maxPictureSize: 2228224, maxBitrate: 2e7, tier: "L", level: 123 },
  // Level 4.1 (Low Tier)
  { maxPictureSize: 2228224, maxBitrate: 5e7, tier: "H", level: 123 },
  // Level 4.1 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 25e6, tier: "L", level: 150 },
  // Level 5 (Low Tier)
  { maxPictureSize: 8912896, maxBitrate: 1e8, tier: "H", level: 150 },
  // Level 5 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 4e7, tier: "L", level: 153 },
  // Level 5.1 (Low Tier)
  { maxPictureSize: 8912896, maxBitrate: 16e7, tier: "H", level: 153 },
  // Level 5.1 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 6e7, tier: "L", level: 156 },
  // Level 5.2 (Low Tier)
  { maxPictureSize: 8912896, maxBitrate: 24e7, tier: "H", level: 156 },
  // Level 5.2 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 6e7, tier: "L", level: 180 },
  // Level 6 (Low Tier)
  { maxPictureSize: 35651584, maxBitrate: 24e7, tier: "H", level: 180 },
  // Level 6 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 12e7, tier: "L", level: 183 },
  // Level 6.1 (Low Tier)
  { maxPictureSize: 35651584, maxBitrate: 48e7, tier: "H", level: 183 },
  // Level 6.1 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 24e7, tier: "L", level: 186 },
  // Level 6.2 (Low Tier)
  { maxPictureSize: 35651584, maxBitrate: 8e8, tier: "H", level: 186 }
  // Level 6.2 (High Tier)
];
var VP9_LEVEL_TABLE = [
  { maxPictureSize: 36864, maxBitrate: 2e5, level: 10 },
  // Level 1
  { maxPictureSize: 73728, maxBitrate: 8e5, level: 11 },
  // Level 1.1
  { maxPictureSize: 122880, maxBitrate: 18e5, level: 20 },
  // Level 2
  { maxPictureSize: 245760, maxBitrate: 36e5, level: 21 },
  // Level 2.1
  { maxPictureSize: 552960, maxBitrate: 72e5, level: 30 },
  // Level 3
  { maxPictureSize: 983040, maxBitrate: 12e6, level: 31 },
  // Level 3.1
  { maxPictureSize: 2228224, maxBitrate: 18e6, level: 40 },
  // Level 4
  { maxPictureSize: 2228224, maxBitrate: 3e7, level: 41 },
  // Level 4.1
  { maxPictureSize: 8912896, maxBitrate: 6e7, level: 50 },
  // Level 5
  { maxPictureSize: 8912896, maxBitrate: 12e7, level: 51 },
  // Level 5.1
  { maxPictureSize: 8912896, maxBitrate: 18e7, level: 52 },
  // Level 5.2
  { maxPictureSize: 35651584, maxBitrate: 18e7, level: 60 },
  // Level 6
  { maxPictureSize: 35651584, maxBitrate: 24e7, level: 61 },
  // Level 6.1
  { maxPictureSize: 35651584, maxBitrate: 48e7, level: 62 }
  // Level 6.2
];
var AV1_LEVEL_TABLE = [
  { maxPictureSize: 147456, maxBitrate: 15e5, tier: "M", level: 0 },
  // Level 2.0 (Main Tier)
  { maxPictureSize: 278784, maxBitrate: 3e6, tier: "M", level: 1 },
  // Level 2.1 (Main Tier)
  { maxPictureSize: 665856, maxBitrate: 6e6, tier: "M", level: 4 },
  // Level 3.0 (Main Tier)
  { maxPictureSize: 1065024, maxBitrate: 1e7, tier: "M", level: 5 },
  // Level 3.1 (Main Tier)
  { maxPictureSize: 2359296, maxBitrate: 12e6, tier: "M", level: 8 },
  // Level 4.0 (Main Tier)
  { maxPictureSize: 2359296, maxBitrate: 3e7, tier: "H", level: 8 },
  // Level 4.0 (High Tier)
  { maxPictureSize: 2359296, maxBitrate: 2e7, tier: "M", level: 9 },
  // Level 4.1 (Main Tier)
  { maxPictureSize: 2359296, maxBitrate: 5e7, tier: "H", level: 9 },
  // Level 4.1 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 3e7, tier: "M", level: 12 },
  // Level 5.0 (Main Tier)
  { maxPictureSize: 8912896, maxBitrate: 1e8, tier: "H", level: 12 },
  // Level 5.0 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 4e7, tier: "M", level: 13 },
  // Level 5.1 (Main Tier)
  { maxPictureSize: 8912896, maxBitrate: 16e7, tier: "H", level: 13 },
  // Level 5.1 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 6e7, tier: "M", level: 14 },
  // Level 5.2 (Main Tier)
  { maxPictureSize: 8912896, maxBitrate: 24e7, tier: "H", level: 14 },
  // Level 5.2 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 6e7, tier: "M", level: 15 },
  // Level 5.3 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 24e7, tier: "H", level: 15 },
  // Level 5.3 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 6e7, tier: "M", level: 16 },
  // Level 6.0 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 24e7, tier: "H", level: 16 },
  // Level 6.0 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 1e8, tier: "M", level: 17 },
  // Level 6.1 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 48e7, tier: "H", level: 17 },
  // Level 6.1 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 16e7, tier: "M", level: 18 },
  // Level 6.2 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 8e8, tier: "H", level: 18 },
  // Level 6.2 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 16e7, tier: "M", level: 19 },
  // Level 6.3 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 8e8, tier: "H", level: 19 }
  // Level 6.3 (High Tier)
];
var VP9_DEFAULT_SUFFIX = ".01.01.01.01.00";
var AV1_DEFAULT_SUFFIX = ".0.110.01.01.01.0";
var buildVideoCodecString = (codec, width, height, bitrate) => {
  if (codec === "avc") {
    const profileIndication = 100;
    const totalMacroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
    const levelInfo = AVC_LEVEL_TABLE.find((level) => totalMacroblocks <= level.maxMacroblocks && bitrate <= level.maxBitrate) ?? last(AVC_LEVEL_TABLE);
    const levelIndication = levelInfo ? levelInfo.level : 0;
    const hexProfileIndication = profileIndication.toString(16).padStart(2, "0");
    const hexProfileCompatibility = "00";
    const hexLevelIndication = levelIndication.toString(16).padStart(2, "0");
    return `avc1.${hexProfileIndication}${hexProfileCompatibility}${hexLevelIndication}`;
  } else if (codec === "hevc") {
    const profilePrefix = "";
    const profileIdc = 1;
    const compatibilityFlags = "6";
    const pictureSize = width * height;
    const levelInfo = HEVC_LEVEL_TABLE.find((level) => pictureSize <= level.maxPictureSize && bitrate <= level.maxBitrate) ?? last(HEVC_LEVEL_TABLE);
    const constraintFlags = "B0";
    return `hev1.${profilePrefix}${profileIdc}.${compatibilityFlags}.${levelInfo.tier}${levelInfo.level}.${constraintFlags}`;
  } else if (codec === "vp8") {
    return "vp8";
  } else if (codec === "vp9") {
    const profile = "00";
    const pictureSize = width * height;
    const levelInfo = VP9_LEVEL_TABLE.find((level) => pictureSize <= level.maxPictureSize && bitrate <= level.maxBitrate) ?? last(VP9_LEVEL_TABLE);
    const bitDepth = "08";
    return `vp09.${profile}.${levelInfo.level.toString().padStart(2, "0")}.${bitDepth}`;
  } else if (codec === "av1") {
    const profile = 0;
    const pictureSize = width * height;
    const levelInfo = AV1_LEVEL_TABLE.find((level2) => pictureSize <= level2.maxPictureSize && bitrate <= level2.maxBitrate) ?? last(AV1_LEVEL_TABLE);
    const level = levelInfo.level.toString().padStart(2, "0");
    const bitDepth = "08";
    return `av01.${profile}.${level}${levelInfo.tier}.${bitDepth}`;
  }
  throw new TypeError(`Unhandled codec '${codec}'.`);
};
var generateAv1CodecConfigurationFromCodecString = (codecString) => {
  const parts = codecString.split(".");
  const marker = 1;
  const version = 1;
  const firstByte = (marker << 7) + version;
  const profile = Number(parts[1]);
  const levelAndTier = parts[2];
  const level = Number(levelAndTier.slice(0, -1));
  const secondByte = (profile << 5) + level;
  const tier = levelAndTier.slice(-1) === "H" ? 1 : 0;
  const bitDepth = Number(parts[3]);
  const highBitDepth = bitDepth === 8 ? 0 : 1;
  const twelveBit = 0;
  const monochrome = parts[4] ? Number(parts[4]) : 0;
  const chromaSubsamplingX = parts[5] ? Number(parts[5][0]) : 1;
  const chromaSubsamplingY = parts[5] ? Number(parts[5][1]) : 1;
  const chromaSamplePosition = parts[5] ? Number(parts[5][2]) : 0;
  const thirdByte = (tier << 7) + (highBitDepth << 6) + (twelveBit << 5) + (monochrome << 4) + (chromaSubsamplingX << 3) + (chromaSubsamplingY << 2) + chromaSamplePosition;
  const initialPresentationDelayPresent = 0;
  const fourthByte = initialPresentationDelayPresent;
  return [firstByte, secondByte, thirdByte, fourthByte];
};
var extractVideoCodecString = (trackInfo) => {
  const { codec, codecDescription, colorSpace, avcCodecInfo, hevcCodecInfo, vp9CodecInfo, av1CodecInfo } = trackInfo;
  if (codec === "avc") {
    assert(trackInfo.avcType !== null);
    if (avcCodecInfo) {
      const bytes2 = new Uint8Array([
        avcCodecInfo.avcProfileIndication,
        avcCodecInfo.profileCompatibility,
        avcCodecInfo.avcLevelIndication
      ]);
      return `avc${trackInfo.avcType}.${bytesToHexString(bytes2)}`;
    }
    if (!codecDescription || codecDescription.byteLength < 4) {
      throw new TypeError("AVC decoder description is not provided or is not at least 4 bytes long.");
    }
    return `avc${trackInfo.avcType}.${bytesToHexString(codecDescription.subarray(1, 4))}`;
  } else if (codec === "hevc") {
    let generalProfileSpace;
    let generalProfileIdc;
    let compatibilityFlags;
    let generalTierFlag;
    let generalLevelIdc;
    let constraintFlags;
    if (hevcCodecInfo) {
      generalProfileSpace = hevcCodecInfo.generalProfileSpace;
      generalProfileIdc = hevcCodecInfo.generalProfileIdc;
      compatibilityFlags = reverseBitsU32(hevcCodecInfo.generalProfileCompatibilityFlags);
      generalTierFlag = hevcCodecInfo.generalTierFlag;
      generalLevelIdc = hevcCodecInfo.generalLevelIdc;
      constraintFlags = [...hevcCodecInfo.generalConstraintIndicatorFlags];
    } else {
      if (!codecDescription || codecDescription.byteLength < 23) {
        throw new TypeError("HEVC decoder description is not provided or is not at least 23 bytes long.");
      }
      const view2 = toDataView(codecDescription);
      const profileByte = view2.getUint8(1);
      generalProfileSpace = profileByte >> 6 & 3;
      generalProfileIdc = profileByte & 31;
      compatibilityFlags = reverseBitsU32(view2.getUint32(2));
      generalTierFlag = profileByte >> 5 & 1;
      generalLevelIdc = view2.getUint8(12);
      constraintFlags = [];
      for (let i = 0; i < 6; i++) {
        constraintFlags.push(view2.getUint8(6 + i));
      }
    }
    let codecString = "hev1.";
    codecString += ["", "A", "B", "C"][generalProfileSpace] + generalProfileIdc;
    codecString += ".";
    codecString += compatibilityFlags.toString(16).toUpperCase();
    codecString += ".";
    codecString += generalTierFlag === 0 ? "L" : "H";
    codecString += generalLevelIdc;
    while (constraintFlags.length > 0 && constraintFlags[constraintFlags.length - 1] === 0) {
      constraintFlags.pop();
    }
    if (constraintFlags.length > 0) {
      codecString += ".";
      codecString += constraintFlags.map((x) => x.toString(16).toUpperCase()).join(".");
    }
    return codecString;
  } else if (codec === "vp8") {
    return "vp8";
  } else if (codec === "vp9") {
    if (!vp9CodecInfo) {
      const pictureSize = trackInfo.width * trackInfo.height;
      let level2 = last(VP9_LEVEL_TABLE).level;
      for (const entry of VP9_LEVEL_TABLE) {
        if (pictureSize <= entry.maxPictureSize) {
          level2 = entry.level;
          break;
        }
      }
      return `vp09.00.${level2.toString().padStart(2, "0")}.08`;
    }
    const profile = vp9CodecInfo.profile.toString().padStart(2, "0");
    const level = vp9CodecInfo.level.toString().padStart(2, "0");
    const bitDepth = vp9CodecInfo.bitDepth.toString().padStart(2, "0");
    const chromaSubsampling = vp9CodecInfo.chromaSubsampling.toString().padStart(2, "0");
    const colourPrimaries = vp9CodecInfo.colourPrimaries.toString().padStart(2, "0");
    const transferCharacteristics = vp9CodecInfo.transferCharacteristics.toString().padStart(2, "0");
    const matrixCoefficients = vp9CodecInfo.matrixCoefficients.toString().padStart(2, "0");
    const videoFullRangeFlag = vp9CodecInfo.videoFullRangeFlag.toString().padStart(2, "0");
    let string = `vp09.${profile}.${level}.${bitDepth}.${chromaSubsampling}`;
    string += `.${colourPrimaries}.${transferCharacteristics}.${matrixCoefficients}.${videoFullRangeFlag}`;
    if (string.endsWith(VP9_DEFAULT_SUFFIX)) {
      string = string.slice(0, -VP9_DEFAULT_SUFFIX.length);
    }
    return string;
  } else if (codec === "av1") {
    if (!av1CodecInfo) {
      const pictureSize = trackInfo.width * trackInfo.height;
      let level2 = last(VP9_LEVEL_TABLE).level;
      for (const entry of VP9_LEVEL_TABLE) {
        if (pictureSize <= entry.maxPictureSize) {
          level2 = entry.level;
          break;
        }
      }
      return `av01.0.${level2.toString().padStart(2, "0")}M.08`;
    }
    const profile = av1CodecInfo.profile;
    const level = av1CodecInfo.level.toString().padStart(2, "0");
    const tier = av1CodecInfo.tier ? "H" : "M";
    const bitDepth = av1CodecInfo.bitDepth.toString().padStart(2, "0");
    const monochrome = av1CodecInfo.monochrome ? "1" : "0";
    const chromaSubsampling = 100 * av1CodecInfo.chromaSubsamplingX + 10 * av1CodecInfo.chromaSubsamplingY + 1 * (av1CodecInfo.chromaSubsamplingX && av1CodecInfo.chromaSubsamplingY ? av1CodecInfo.chromaSamplePosition : 0);
    const colorPrimaries = colorSpace?.primaries ? COLOR_PRIMARIES_MAP[colorSpace.primaries] : 1;
    const transferCharacteristics = colorSpace?.transfer ? TRANSFER_CHARACTERISTICS_MAP[colorSpace.transfer] : 1;
    const matrixCoefficients = colorSpace?.matrix ? MATRIX_COEFFICIENTS_MAP[colorSpace.matrix] : 1;
    const videoFullRangeFlag = colorSpace?.fullRange ? 1 : 0;
    let string = `av01.${profile}.${level}${tier}.${bitDepth}`;
    string += `.${monochrome}.${chromaSubsampling.toString().padStart(3, "0")}`;
    string += `.${colorPrimaries.toString().padStart(2, "0")}`;
    string += `.${transferCharacteristics.toString().padStart(2, "0")}`;
    string += `.${matrixCoefficients.toString().padStart(2, "0")}`;
    string += `.${videoFullRangeFlag}`;
    if (string.endsWith(AV1_DEFAULT_SUFFIX)) {
      string = string.slice(0, -AV1_DEFAULT_SUFFIX.length);
    }
    return string;
  }
  throw new TypeError(`Unhandled codec '${codec}'.`);
};
var buildAudioCodecString = (codec, numberOfChannels, sampleRate) => {
  if (codec === "aac") {
    if (numberOfChannels >= 2 && sampleRate <= 24e3) {
      return "mp4a.40.29";
    }
    if (sampleRate <= 24e3) {
      return "mp4a.40.5";
    }
    return "mp4a.40.2";
  } else if (codec === "mp3") {
    return "mp3";
  } else if (codec === "opus") {
    return "opus";
  } else if (codec === "vorbis") {
    return "vorbis";
  } else if (codec === "flac") {
    return "flac";
  } else if (codec === "ac3") {
    return "ac-3";
  } else if (codec === "eac3") {
    return "ec-3";
  } else if (PCM_AUDIO_CODECS.includes(codec)) {
    return codec;
  }
  throw new TypeError(`Unhandled codec '${codec}'.`);
};
var extractAudioCodecString = (trackInfo) => {
  const { codec, codecDescription, aacCodecInfo } = trackInfo;
  if (codec === "aac") {
    if (!aacCodecInfo) {
      throw new TypeError("AAC codec info must be provided.");
    }
    if (aacCodecInfo.isMpeg2) {
      return "mp4a.67";
    } else {
      let objectType;
      if (aacCodecInfo.objectType !== null) {
        objectType = aacCodecInfo.objectType;
      } else {
        const audioSpecificConfig = parseAacAudioSpecificConfig(codecDescription);
        objectType = audioSpecificConfig.objectType;
      }
      return `mp4a.40.${objectType}`;
    }
  } else if (codec === "mp3") {
    return "mp3";
  } else if (codec === "opus") {
    return "opus";
  } else if (codec === "vorbis") {
    return "vorbis";
  } else if (codec === "flac") {
    return "flac";
  } else if (codec === "ac3") {
    return "ac-3";
  } else if (codec === "eac3") {
    return "ec-3";
  } else if (codec && PCM_AUDIO_CODECS.includes(codec)) {
    return codec;
  }
  throw new TypeError(`Unhandled codec '${codec}'.`);
};
var OPUS_SAMPLE_RATE = 48e3;
var PCM_CODEC_REGEX = /^pcm-([usf])(\d+)(be)?$/;
var parsePcmCodec = (codec) => {
  assert(PCM_AUDIO_CODECS.includes(codec));
  if (codec === "ulaw") {
    return { dataType: "ulaw", sampleSize: 1, littleEndian: true, silentValue: 255 };
  } else if (codec === "alaw") {
    return { dataType: "alaw", sampleSize: 1, littleEndian: true, silentValue: 213 };
  }
  const match = PCM_CODEC_REGEX.exec(codec);
  assert(match);
  let dataType;
  if (match[1] === "u") {
    dataType = "unsigned";
  } else if (match[1] === "s") {
    dataType = "signed";
  } else {
    dataType = "float";
  }
  const sampleSize = Number(match[2]) / 8;
  const littleEndian = match[3] !== "be";
  const silentValue = codec === "pcm-u8" ? 2 ** 7 : 0;
  return { dataType, sampleSize, littleEndian, silentValue };
};
var inferCodecFromCodecString = (codecString) => {
  if (codecString.startsWith("avc1") || codecString.startsWith("avc3")) {
    return "avc";
  } else if (codecString.startsWith("hev1") || codecString.startsWith("hvc1")) {
    return "hevc";
  } else if (codecString === "vp8") {
    return "vp8";
  } else if (codecString.startsWith("vp09")) {
    return "vp9";
  } else if (codecString.startsWith("av01")) {
    return "av1";
  }
  if (codecString === "mp3" || codecString === "mp4a.69" || codecString === "mp4a.6B" || codecString === "mp4a.6b" || codecString === "mp4a.40.34") {
    return "mp3";
  } else if (codecString.startsWith("mp4a.40.") || codecString === "mp4a.67") {
    return "aac";
  } else if (codecString === "opus") {
    return "opus";
  } else if (codecString === "vorbis") {
    return "vorbis";
  } else if (codecString === "flac") {
    return "flac";
  } else if (codecString === "ac-3" || codecString === "ac3") {
    return "ac3";
  } else if (codecString === "ec-3" || codecString === "eac3") {
    return "eac3";
  } else if (codecString === "ulaw") {
    return "ulaw";
  } else if (codecString === "alaw") {
    return "alaw";
  } else if (PCM_CODEC_REGEX.test(codecString)) {
    return codecString;
  }
  if (codecString === "webvtt") {
    return "webvtt";
  }
  return null;
};
var getVideoEncoderConfigExtension = (codec) => {
  if (codec === "avc") {
    return {
      avc: {
        format: "avc"
        // Ensure the format is not Annex B
      }
    };
  } else if (codec === "hevc") {
    return {
      hevc: {
        format: "hevc"
        // Ensure the format is not Annex B
      }
    };
  }
  return {};
};
var getAudioEncoderConfigExtension = (codec) => {
  if (codec === "aac") {
    return {
      aac: {
        format: "aac"
        // Ensure the format is not ADTS
      }
    };
  } else if (codec === "opus") {
    return {
      opus: {
        format: "opus"
      }
    };
  }
  return {};
};
var VALID_VIDEO_CODEC_STRING_PREFIXES = ["avc1", "avc3", "hev1", "hvc1", "vp8", "vp09", "av01"];
var AVC_CODEC_STRING_REGEX = /^(avc1|avc3)\.[0-9a-fA-F]{6}$/;
var HEVC_CODEC_STRING_REGEX = /^(hev1|hvc1)\.(?:[ABC]?\d+)\.[0-9a-fA-F]{1,8}\.[LH]\d+(?:\.[0-9a-fA-F]{1,2}){0,6}$/;
var VP9_CODEC_STRING_REGEX = /^vp09(?:\.\d{2}){3}(?:(?:\.\d{2}){5})?$/;
var AV1_CODEC_STRING_REGEX = /^av01\.\d\.\d{2}[MH]\.\d{2}(?:\.\d\.\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d)?$/;
var validateVideoChunkMetadata = (metadata) => {
  if (!metadata) {
    throw new TypeError("Video chunk metadata must be provided.");
  }
  if (typeof metadata !== "object") {
    throw new TypeError("Video chunk metadata must be an object.");
  }
  if (!metadata.decoderConfig) {
    throw new TypeError("Video chunk metadata must include a decoder configuration.");
  }
  if (typeof metadata.decoderConfig !== "object") {
    throw new TypeError("Video chunk metadata decoder configuration must be an object.");
  }
  if (typeof metadata.decoderConfig.codec !== "string") {
    throw new TypeError("Video chunk metadata decoder configuration must specify a codec string.");
  }
  if (!VALID_VIDEO_CODEC_STRING_PREFIXES.some((prefix) => metadata.decoderConfig.codec.startsWith(prefix))) {
    throw new TypeError("Video chunk metadata decoder configuration codec string must be a valid video codec string as specified in the Mediabunny Codec Registry.");
  }
  if (!Number.isInteger(metadata.decoderConfig.codedWidth) || metadata.decoderConfig.codedWidth <= 0) {
    throw new TypeError("Video chunk metadata decoder configuration must specify a valid codedWidth (positive integer).");
  }
  if (!Number.isInteger(metadata.decoderConfig.codedHeight) || metadata.decoderConfig.codedHeight <= 0) {
    throw new TypeError("Video chunk metadata decoder configuration must specify a valid codedHeight (positive integer).");
  }
  if (metadata.decoderConfig.displayAspectWidth !== void 0 && (!Number.isInteger(metadata.decoderConfig.displayAspectWidth) || metadata.decoderConfig.displayAspectWidth <= 0)) {
    throw new TypeError("Video chunk metadata decoder configuration displayAspectWidth, when defined, must be a positive integer.");
  }
  if (metadata.decoderConfig.displayAspectHeight !== void 0 && (!Number.isInteger(metadata.decoderConfig.displayAspectHeight) || metadata.decoderConfig.displayAspectHeight <= 0)) {
    throw new TypeError("Video chunk metadata decoder configuration displayAspectHeight, when defined, must be a positive integer.");
  }
  if (metadata.decoderConfig.displayAspectWidth !== void 0 !== (metadata.decoderConfig.displayAspectHeight !== void 0)) {
    throw new TypeError("Video chunk metadata decoder configuration must specify both displayAspectWidth and displayAspectHeight, or neither.");
  }
  if (metadata.decoderConfig.description !== void 0) {
    if (!isAllowSharedBufferSource(metadata.decoderConfig.description)) {
      throw new TypeError("Video chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
    }
  }
  if (metadata.decoderConfig.colorSpace !== void 0) {
    const { colorSpace } = metadata.decoderConfig;
    if (typeof colorSpace !== "object") {
      throw new TypeError("Video chunk metadata decoder configuration colorSpace, when provided, must be an object.");
    }
    const primariesValues = Object.keys(COLOR_PRIMARIES_MAP);
    if (colorSpace.primaries != null && !primariesValues.includes(colorSpace.primaries)) {
      throw new TypeError(`Video chunk metadata decoder configuration colorSpace primaries, when defined, must be one of ${primariesValues.join(", ")}.`);
    }
    const transferValues = Object.keys(TRANSFER_CHARACTERISTICS_MAP);
    if (colorSpace.transfer != null && !transferValues.includes(colorSpace.transfer)) {
      throw new TypeError(`Video chunk metadata decoder configuration colorSpace transfer, when defined, must be one of ${transferValues.join(", ")}.`);
    }
    const matrixValues = Object.keys(MATRIX_COEFFICIENTS_MAP);
    if (colorSpace.matrix != null && !matrixValues.includes(colorSpace.matrix)) {
      throw new TypeError(`Video chunk metadata decoder configuration colorSpace matrix, when defined, must be one of ${matrixValues.join(", ")}.`);
    }
    if (colorSpace.fullRange != null && typeof colorSpace.fullRange !== "boolean") {
      throw new TypeError("Video chunk metadata decoder configuration colorSpace fullRange, when defined, must be a boolean.");
    }
  }
  if (metadata.decoderConfig.codec.startsWith("avc1") || metadata.decoderConfig.codec.startsWith("avc3")) {
    if (!AVC_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
      throw new TypeError("Video chunk metadata decoder configuration codec string for AVC must be a valid AVC codec string as specified in Section 3.4 of RFC 6381.");
    }
  } else if (metadata.decoderConfig.codec.startsWith("hev1") || metadata.decoderConfig.codec.startsWith("hvc1")) {
    if (!HEVC_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
      throw new TypeError("Video chunk metadata decoder configuration codec string for HEVC must be a valid HEVC codec string as specified in Section E.3 of ISO 14496-15.");
    }
  } else if (metadata.decoderConfig.codec.startsWith("vp8")) {
    if (metadata.decoderConfig.codec !== "vp8") {
      throw new TypeError('Video chunk metadata decoder configuration codec string for VP8 must be "vp8".');
    }
  } else if (metadata.decoderConfig.codec.startsWith("vp09")) {
    if (!VP9_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
      throw new TypeError('Video chunk metadata decoder configuration codec string for VP9 must be a valid VP9 codec string as specified in Section "Codecs Parameter String" of https://www.webmproject.org/vp9/mp4/.');
    }
  } else if (metadata.decoderConfig.codec.startsWith("av01")) {
    if (!AV1_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
      throw new TypeError('Video chunk metadata decoder configuration codec string for AV1 must be a valid AV1 codec string as specified in Section "Codecs Parameter String" of https://aomediacodec.github.io/av1-isobmff/.');
    }
  }
};
var VALID_AUDIO_CODEC_STRING_PREFIXES = [
  "mp4a",
  "mp3",
  "opus",
  "vorbis",
  "flac",
  "ulaw",
  "alaw",
  "pcm",
  "ac-3",
  "ec-3"
];
var validateAudioChunkMetadata = (metadata) => {
  if (!metadata) {
    throw new TypeError("Audio chunk metadata must be provided.");
  }
  if (typeof metadata !== "object") {
    throw new TypeError("Audio chunk metadata must be an object.");
  }
  if (!metadata.decoderConfig) {
    throw new TypeError("Audio chunk metadata must include a decoder configuration.");
  }
  if (typeof metadata.decoderConfig !== "object") {
    throw new TypeError("Audio chunk metadata decoder configuration must be an object.");
  }
  if (typeof metadata.decoderConfig.codec !== "string") {
    throw new TypeError("Audio chunk metadata decoder configuration must specify a codec string.");
  }
  if (!VALID_AUDIO_CODEC_STRING_PREFIXES.some((prefix) => metadata.decoderConfig.codec.startsWith(prefix))) {
    throw new TypeError("Audio chunk metadata decoder configuration codec string must be a valid audio codec string as specified in the Mediabunny Codec Registry.");
  }
  if (!Number.isInteger(metadata.decoderConfig.sampleRate) || metadata.decoderConfig.sampleRate <= 0) {
    throw new TypeError("Audio chunk metadata decoder configuration must specify a valid sampleRate (positive integer).");
  }
  if (!Number.isInteger(metadata.decoderConfig.numberOfChannels) || metadata.decoderConfig.numberOfChannels <= 0) {
    throw new TypeError("Audio chunk metadata decoder configuration must specify a valid numberOfChannels (positive integer).");
  }
  if (metadata.decoderConfig.description !== void 0) {
    if (!isAllowSharedBufferSource(metadata.decoderConfig.description)) {
      throw new TypeError("Audio chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
    }
  }
  if (metadata.decoderConfig.codec.startsWith("mp4a") && metadata.decoderConfig.codec !== "mp4a.69" && metadata.decoderConfig.codec !== "mp4a.6B" && metadata.decoderConfig.codec !== "mp4a.6b") {
    const validStrings = ["mp4a.40.2", "mp4a.40.02", "mp4a.40.5", "mp4a.40.05", "mp4a.40.29", "mp4a.67"];
    if (!validStrings.includes(metadata.decoderConfig.codec)) {
      throw new TypeError("Audio chunk metadata decoder configuration codec string for AAC must be a valid AAC codec string as specified in https://www.w3.org/TR/webcodecs-aac-codec-registration/.");
    }
  } else if (metadata.decoderConfig.codec.startsWith("mp3") || metadata.decoderConfig.codec.startsWith("mp4a")) {
    if (metadata.decoderConfig.codec !== "mp3" && metadata.decoderConfig.codec !== "mp4a.69" && metadata.decoderConfig.codec !== "mp4a.6B" && metadata.decoderConfig.codec !== "mp4a.6b") {
      throw new TypeError('Audio chunk metadata decoder configuration codec string for MP3 must be "mp3", "mp4a.69" or "mp4a.6B".');
    }
  } else if (metadata.decoderConfig.codec.startsWith("opus")) {
    if (metadata.decoderConfig.codec !== "opus") {
      throw new TypeError('Audio chunk metadata decoder configuration codec string for Opus must be "opus".');
    }
    if (metadata.decoderConfig.description && metadata.decoderConfig.description.byteLength < 18) {
      throw new TypeError("Audio chunk metadata decoder configuration description, when specified, is expected to be an Identification Header as specified in Section 5.1 of RFC 7845.");
    }
  } else if (metadata.decoderConfig.codec.startsWith("vorbis")) {
    if (metadata.decoderConfig.codec !== "vorbis") {
      throw new TypeError('Audio chunk metadata decoder configuration codec string for Vorbis must be "vorbis".');
    }
    if (!metadata.decoderConfig.description) {
      throw new TypeError("Audio chunk metadata decoder configuration for Vorbis must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-vorbis-codec-registration/.");
    }
  } else if (metadata.decoderConfig.codec.startsWith("flac")) {
    if (metadata.decoderConfig.codec !== "flac") {
      throw new TypeError('Audio chunk metadata decoder configuration codec string for FLAC must be "flac".');
    }
    const minDescriptionSize = 4 + 4 + 34;
    if (!metadata.decoderConfig.description || metadata.decoderConfig.description.byteLength < minDescriptionSize) {
      throw new TypeError("Audio chunk metadata decoder configuration for FLAC must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-flac-codec-registration/.");
    }
  } else if (metadata.decoderConfig.codec.startsWith("ac-3") || metadata.decoderConfig.codec.startsWith("ac3")) {
    if (metadata.decoderConfig.codec !== "ac-3") {
      throw new TypeError('Audio chunk metadata decoder configuration codec string for AC-3 must be "ac-3".');
    }
  } else if (metadata.decoderConfig.codec.startsWith("ec-3") || metadata.decoderConfig.codec.startsWith("eac3")) {
    if (metadata.decoderConfig.codec !== "ec-3") {
      throw new TypeError('Audio chunk metadata decoder configuration codec string for EC-3 must be "ec-3".');
    }
  } else if (metadata.decoderConfig.codec.startsWith("pcm") || metadata.decoderConfig.codec.startsWith("ulaw") || metadata.decoderConfig.codec.startsWith("alaw")) {
    if (!PCM_AUDIO_CODECS.includes(metadata.decoderConfig.codec)) {
      throw new TypeError(`Audio chunk metadata decoder configuration codec string for PCM must be one of the supported PCM codecs (${PCM_AUDIO_CODECS.join(", ")}).`);
    }
  }
};
var validateSubtitleMetadata = (metadata) => {
  if (!metadata) {
    throw new TypeError("Subtitle metadata must be provided.");
  }
  if (typeof metadata !== "object") {
    throw new TypeError("Subtitle metadata must be an object.");
  }
  if (!metadata.config) {
    throw new TypeError("Subtitle metadata must include a config object.");
  }
  if (typeof metadata.config !== "object") {
    throw new TypeError("Subtitle metadata config must be an object.");
  }
  if (typeof metadata.config.description !== "string") {
    throw new TypeError("Subtitle metadata config description must be a string.");
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/shared/ac3-misc.js
var AC3_SAMPLE_RATES = [48e3, 44100, 32e3];
var EAC3_REDUCED_SAMPLE_RATES = [24e3, 22050, 16e3];

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/codec-data.js
var AvcNalUnitType;
(function(AvcNalUnitType2) {
  AvcNalUnitType2[AvcNalUnitType2["NON_IDR_SLICE"] = 1] = "NON_IDR_SLICE";
  AvcNalUnitType2[AvcNalUnitType2["SLICE_DPA"] = 2] = "SLICE_DPA";
  AvcNalUnitType2[AvcNalUnitType2["SLICE_DPB"] = 3] = "SLICE_DPB";
  AvcNalUnitType2[AvcNalUnitType2["SLICE_DPC"] = 4] = "SLICE_DPC";
  AvcNalUnitType2[AvcNalUnitType2["IDR"] = 5] = "IDR";
  AvcNalUnitType2[AvcNalUnitType2["SEI"] = 6] = "SEI";
  AvcNalUnitType2[AvcNalUnitType2["SPS"] = 7] = "SPS";
  AvcNalUnitType2[AvcNalUnitType2["PPS"] = 8] = "PPS";
  AvcNalUnitType2[AvcNalUnitType2["AUD"] = 9] = "AUD";
  AvcNalUnitType2[AvcNalUnitType2["SPS_EXT"] = 13] = "SPS_EXT";
})(AvcNalUnitType || (AvcNalUnitType = {}));
var HevcNalUnitType;
(function(HevcNalUnitType2) {
  HevcNalUnitType2[HevcNalUnitType2["RASL_N"] = 8] = "RASL_N";
  HevcNalUnitType2[HevcNalUnitType2["RASL_R"] = 9] = "RASL_R";
  HevcNalUnitType2[HevcNalUnitType2["BLA_W_LP"] = 16] = "BLA_W_LP";
  HevcNalUnitType2[HevcNalUnitType2["RSV_IRAP_VCL23"] = 23] = "RSV_IRAP_VCL23";
  HevcNalUnitType2[HevcNalUnitType2["VPS_NUT"] = 32] = "VPS_NUT";
  HevcNalUnitType2[HevcNalUnitType2["SPS_NUT"] = 33] = "SPS_NUT";
  HevcNalUnitType2[HevcNalUnitType2["PPS_NUT"] = 34] = "PPS_NUT";
  HevcNalUnitType2[HevcNalUnitType2["AUD_NUT"] = 35] = "AUD_NUT";
  HevcNalUnitType2[HevcNalUnitType2["PREFIX_SEI_NUT"] = 39] = "PREFIX_SEI_NUT";
  HevcNalUnitType2[HevcNalUnitType2["SUFFIX_SEI_NUT"] = 40] = "SUFFIX_SEI_NUT";
})(HevcNalUnitType || (HevcNalUnitType = {}));
var iterateNalUnitsInAnnexB = function* (packetData) {
  let i = 0;
  let nalStart = -1;
  while (i < packetData.length - 2) {
    const zeroIndex = packetData.indexOf(0, i);
    if (zeroIndex === -1 || zeroIndex >= packetData.length - 2) {
      break;
    }
    i = zeroIndex;
    let startCodeLength = 0;
    if (i + 3 < packetData.length && packetData[i + 1] === 0 && packetData[i + 2] === 0 && packetData[i + 3] === 1) {
      startCodeLength = 4;
    } else if (packetData[i + 1] === 0 && packetData[i + 2] === 1) {
      startCodeLength = 3;
    }
    if (startCodeLength === 0) {
      i++;
      continue;
    }
    if (nalStart !== -1 && i > nalStart) {
      yield {
        offset: nalStart,
        length: i - nalStart
      };
    }
    nalStart = i + startCodeLength;
    i = nalStart;
  }
  if (nalStart !== -1 && nalStart < packetData.length) {
    yield {
      offset: nalStart,
      length: packetData.length - nalStart
    };
  }
};
var iterateNalUnitsInLengthPrefixed = function* (packetData, lengthSize) {
  let offset = 0;
  const dataView = new DataView(packetData.buffer, packetData.byteOffset, packetData.byteLength);
  while (offset + lengthSize <= packetData.length) {
    let nalUnitLength;
    if (lengthSize === 1) {
      nalUnitLength = dataView.getUint8(offset);
    } else if (lengthSize === 2) {
      nalUnitLength = dataView.getUint16(offset, false);
    } else if (lengthSize === 3) {
      nalUnitLength = getUint24(dataView, offset, false);
    } else {
      assert(lengthSize === 4);
      nalUnitLength = dataView.getUint32(offset, false);
    }
    offset += lengthSize;
    yield {
      offset,
      length: nalUnitLength
    };
    offset += nalUnitLength;
  }
};
var iterateAvcNalUnits = (packetData, decoderConfig) => {
  if (decoderConfig.description) {
    const bytes2 = toUint8Array(decoderConfig.description);
    const lengthSizeMinusOne = bytes2[4] & 3;
    const lengthSize = lengthSizeMinusOne + 1;
    return iterateNalUnitsInLengthPrefixed(packetData, lengthSize);
  } else {
    return iterateNalUnitsInAnnexB(packetData);
  }
};
var extractNalUnitTypeForAvc = (byte) => {
  return byte & 31;
};
var removeEmulationPreventionBytes = (data) => {
  const result = [];
  const len = data.length;
  for (let i = 0; i < len; i++) {
    if (i + 2 < len && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 3) {
      result.push(0, 0);
      i += 2;
    } else {
      result.push(data[i]);
    }
  }
  return new Uint8Array(result);
};
var ANNEX_B_START_CODE = new Uint8Array([0, 0, 0, 1]);
var concatNalUnitsInAnnexB = (nalUnits) => {
  const totalLength = nalUnits.reduce((a, b) => a + ANNEX_B_START_CODE.byteLength + b.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const nalUnit of nalUnits) {
    result.set(ANNEX_B_START_CODE, offset);
    offset += ANNEX_B_START_CODE.byteLength;
    result.set(nalUnit, offset);
    offset += nalUnit.byteLength;
  }
  return result;
};
var concatNalUnitsInLengthPrefixed = (nalUnits, lengthSize) => {
  const totalLength = nalUnits.reduce((a, b) => a + lengthSize + b.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const nalUnit of nalUnits) {
    const dataView = new DataView(result.buffer, result.byteOffset, result.byteLength);
    switch (lengthSize) {
      case 1:
        dataView.setUint8(offset, nalUnit.byteLength);
        break;
      case 2:
        dataView.setUint16(offset, nalUnit.byteLength, false);
        break;
      case 3:
        setUint24(dataView, offset, nalUnit.byteLength, false);
        break;
      case 4:
        dataView.setUint32(offset, nalUnit.byteLength, false);
        break;
    }
    offset += lengthSize;
    result.set(nalUnit, offset);
    offset += nalUnit.byteLength;
  }
  return result;
};
var concatAvcNalUnits = (nalUnits, decoderConfig) => {
  if (decoderConfig.description) {
    const bytes2 = toUint8Array(decoderConfig.description);
    const lengthSizeMinusOne = bytes2[4] & 3;
    const lengthSize = lengthSizeMinusOne + 1;
    return concatNalUnitsInLengthPrefixed(nalUnits, lengthSize);
  } else {
    return concatNalUnitsInAnnexB(nalUnits);
  }
};
var extractAvcDecoderConfigurationRecord = (packetData) => {
  try {
    const spsUnits = [];
    const ppsUnits = [];
    const spsExtUnits = [];
    for (const loc of iterateNalUnitsInAnnexB(packetData)) {
      const nalUnit = packetData.subarray(loc.offset, loc.offset + loc.length);
      const type = extractNalUnitTypeForAvc(nalUnit[0]);
      if (type === AvcNalUnitType.SPS) {
        spsUnits.push(nalUnit);
      } else if (type === AvcNalUnitType.PPS) {
        ppsUnits.push(nalUnit);
      } else if (type === AvcNalUnitType.SPS_EXT) {
        spsExtUnits.push(nalUnit);
      }
    }
    if (spsUnits.length === 0) {
      return null;
    }
    if (ppsUnits.length === 0) {
      return null;
    }
    const spsData = spsUnits[0];
    const spsInfo = parseAvcSps(spsData);
    assert(spsInfo !== null);
    const hasExtendedData = spsInfo.profileIdc === 100 || spsInfo.profileIdc === 110 || spsInfo.profileIdc === 122 || spsInfo.profileIdc === 144;
    return {
      configurationVersion: 1,
      avcProfileIndication: spsInfo.profileIdc,
      profileCompatibility: spsInfo.constraintFlags,
      avcLevelIndication: spsInfo.levelIdc,
      lengthSizeMinusOne: 3,
      // Typically 4 bytes for length field
      sequenceParameterSets: spsUnits,
      pictureParameterSets: ppsUnits,
      chromaFormat: hasExtendedData ? spsInfo.chromaFormatIdc : null,
      bitDepthLumaMinus8: hasExtendedData ? spsInfo.bitDepthLumaMinus8 : null,
      bitDepthChromaMinus8: hasExtendedData ? spsInfo.bitDepthChromaMinus8 : null,
      sequenceParameterSetExt: hasExtendedData ? spsExtUnits : null
    };
  } catch (error) {
    console.error("Error building AVC Decoder Configuration Record:", error);
    return null;
  }
};
var serializeAvcDecoderConfigurationRecord = (record) => {
  const bytes2 = [];
  bytes2.push(record.configurationVersion);
  bytes2.push(record.avcProfileIndication);
  bytes2.push(record.profileCompatibility);
  bytes2.push(record.avcLevelIndication);
  bytes2.push(252 | record.lengthSizeMinusOne & 3);
  bytes2.push(224 | record.sequenceParameterSets.length & 31);
  for (const sps of record.sequenceParameterSets) {
    const length = sps.byteLength;
    bytes2.push(length >> 8);
    bytes2.push(length & 255);
    for (let i = 0; i < length; i++) {
      bytes2.push(sps[i]);
    }
  }
  bytes2.push(record.pictureParameterSets.length);
  for (const pps of record.pictureParameterSets) {
    const length = pps.byteLength;
    bytes2.push(length >> 8);
    bytes2.push(length & 255);
    for (let i = 0; i < length; i++) {
      bytes2.push(pps[i]);
    }
  }
  if (record.avcProfileIndication === 100 || record.avcProfileIndication === 110 || record.avcProfileIndication === 122 || record.avcProfileIndication === 144) {
    assert(record.chromaFormat !== null);
    assert(record.bitDepthLumaMinus8 !== null);
    assert(record.bitDepthChromaMinus8 !== null);
    assert(record.sequenceParameterSetExt !== null);
    bytes2.push(252 | record.chromaFormat & 3);
    bytes2.push(248 | record.bitDepthLumaMinus8 & 7);
    bytes2.push(248 | record.bitDepthChromaMinus8 & 7);
    bytes2.push(record.sequenceParameterSetExt.length);
    for (const spsExt of record.sequenceParameterSetExt) {
      const length = spsExt.byteLength;
      bytes2.push(length >> 8);
      bytes2.push(length & 255);
      for (let i = 0; i < length; i++) {
        bytes2.push(spsExt[i]);
      }
    }
  }
  return new Uint8Array(bytes2);
};
var deserializeAvcDecoderConfigurationRecord = (data) => {
  try {
    const view2 = toDataView(data);
    let offset = 0;
    const configurationVersion = view2.getUint8(offset++);
    const avcProfileIndication = view2.getUint8(offset++);
    const profileCompatibility = view2.getUint8(offset++);
    const avcLevelIndication = view2.getUint8(offset++);
    const lengthSizeMinusOne = view2.getUint8(offset++) & 3;
    const numOfSequenceParameterSets = view2.getUint8(offset++) & 31;
    const sequenceParameterSets = [];
    for (let i = 0; i < numOfSequenceParameterSets; i++) {
      const length = view2.getUint16(offset, false);
      offset += 2;
      sequenceParameterSets.push(data.subarray(offset, offset + length));
      offset += length;
    }
    const numOfPictureParameterSets = view2.getUint8(offset++);
    const pictureParameterSets = [];
    for (let i = 0; i < numOfPictureParameterSets; i++) {
      const length = view2.getUint16(offset, false);
      offset += 2;
      pictureParameterSets.push(data.subarray(offset, offset + length));
      offset += length;
    }
    const record = {
      configurationVersion,
      avcProfileIndication,
      profileCompatibility,
      avcLevelIndication,
      lengthSizeMinusOne,
      sequenceParameterSets,
      pictureParameterSets,
      chromaFormat: null,
      bitDepthLumaMinus8: null,
      bitDepthChromaMinus8: null,
      sequenceParameterSetExt: null
    };
    if ((avcProfileIndication === 100 || avcProfileIndication === 110 || avcProfileIndication === 122 || avcProfileIndication === 144) && offset + 4 <= data.length) {
      const chromaFormat = view2.getUint8(offset++) & 3;
      const bitDepthLumaMinus8 = view2.getUint8(offset++) & 7;
      const bitDepthChromaMinus8 = view2.getUint8(offset++) & 7;
      const numOfSequenceParameterSetExt = view2.getUint8(offset++);
      record.chromaFormat = chromaFormat;
      record.bitDepthLumaMinus8 = bitDepthLumaMinus8;
      record.bitDepthChromaMinus8 = bitDepthChromaMinus8;
      const sequenceParameterSetExt = [];
      for (let i = 0; i < numOfSequenceParameterSetExt; i++) {
        const length = view2.getUint16(offset, false);
        offset += 2;
        sequenceParameterSetExt.push(data.subarray(offset, offset + length));
        offset += length;
      }
      record.sequenceParameterSetExt = sequenceParameterSetExt;
    }
    return record;
  } catch (error) {
    console.error("Error deserializing AVC Decoder Configuration Record:", error);
    return null;
  }
};
var AVC_HEVC_ASPECT_RATIO_IDC_TABLE = {
  1: { num: 1, den: 1 },
  2: { num: 12, den: 11 },
  3: { num: 10, den: 11 },
  4: { num: 16, den: 11 },
  5: { num: 40, den: 33 },
  6: { num: 24, den: 11 },
  7: { num: 20, den: 11 },
  8: { num: 32, den: 11 },
  9: { num: 80, den: 33 },
  10: { num: 18, den: 11 },
  11: { num: 15, den: 11 },
  12: { num: 64, den: 33 },
  13: { num: 160, den: 99 },
  14: { num: 4, den: 3 },
  15: { num: 3, den: 2 },
  16: { num: 2, den: 1 }
};
var parseAvcSps = (sps) => {
  try {
    const bitstream = new Bitstream(removeEmulationPreventionBytes(sps));
    bitstream.skipBits(1);
    bitstream.skipBits(2);
    const nalUnitType = bitstream.readBits(5);
    if (nalUnitType !== 7) {
      return null;
    }
    const profileIdc = bitstream.readAlignedByte();
    const constraintFlags = bitstream.readAlignedByte();
    const levelIdc = bitstream.readAlignedByte();
    readExpGolomb(bitstream);
    let chromaFormatIdc = 1;
    let bitDepthLumaMinus8 = 0;
    let bitDepthChromaMinus8 = 0;
    let separateColourPlaneFlag = 0;
    if (profileIdc === 100 || profileIdc === 110 || profileIdc === 122 || profileIdc === 244 || profileIdc === 44 || profileIdc === 83 || profileIdc === 86 || profileIdc === 118 || profileIdc === 128) {
      chromaFormatIdc = readExpGolomb(bitstream);
      if (chromaFormatIdc === 3) {
        separateColourPlaneFlag = bitstream.readBits(1);
      }
      bitDepthLumaMinus8 = readExpGolomb(bitstream);
      bitDepthChromaMinus8 = readExpGolomb(bitstream);
      bitstream.skipBits(1);
      const seqScalingMatrixPresentFlag = bitstream.readBits(1);
      if (seqScalingMatrixPresentFlag) {
        for (let i = 0; i < (chromaFormatIdc !== 3 ? 8 : 12); i++) {
          const seqScalingListPresentFlag = bitstream.readBits(1);
          if (seqScalingListPresentFlag) {
            const sizeOfScalingList = i < 6 ? 16 : 64;
            let lastScale = 8;
            let nextScale = 8;
            for (let j = 0; j < sizeOfScalingList; j++) {
              if (nextScale !== 0) {
                const deltaScale = readSignedExpGolomb(bitstream);
                nextScale = (lastScale + deltaScale + 256) % 256;
              }
              lastScale = nextScale === 0 ? lastScale : nextScale;
            }
          }
        }
      }
    }
    readExpGolomb(bitstream);
    const picOrderCntType = readExpGolomb(bitstream);
    if (picOrderCntType === 0) {
      readExpGolomb(bitstream);
    } else if (picOrderCntType === 1) {
      bitstream.skipBits(1);
      readSignedExpGolomb(bitstream);
      readSignedExpGolomb(bitstream);
      const numRefFramesInPicOrderCntCycle = readExpGolomb(bitstream);
      for (let i = 0; i < numRefFramesInPicOrderCntCycle; i++) {
        readSignedExpGolomb(bitstream);
      }
    }
    readExpGolomb(bitstream);
    bitstream.skipBits(1);
    const picWidthInMbsMinus1 = readExpGolomb(bitstream);
    const picHeightInMapUnitsMinus1 = readExpGolomb(bitstream);
    const codedWidth = 16 * (picWidthInMbsMinus1 + 1);
    const codedHeight = 16 * (picHeightInMapUnitsMinus1 + 1);
    let displayWidth = codedWidth;
    let displayHeight = codedHeight;
    const frameMbsOnlyFlag = bitstream.readBits(1);
    if (!frameMbsOnlyFlag) {
      bitstream.skipBits(1);
    }
    bitstream.skipBits(1);
    const frameCroppingFlag = bitstream.readBits(1);
    if (frameCroppingFlag) {
      const frameCropLeftOffset = readExpGolomb(bitstream);
      const frameCropRightOffset = readExpGolomb(bitstream);
      const frameCropTopOffset = readExpGolomb(bitstream);
      const frameCropBottomOffset = readExpGolomb(bitstream);
      let cropUnitX;
      let cropUnitY;
      const chromaArrayType = separateColourPlaneFlag === 0 ? chromaFormatIdc : 0;
      if (chromaArrayType === 0) {
        cropUnitX = 1;
        cropUnitY = 2 - frameMbsOnlyFlag;
      } else {
        const subWidthC = chromaFormatIdc === 3 ? 1 : 2;
        const subHeightC = chromaFormatIdc === 1 ? 2 : 1;
        cropUnitX = subWidthC;
        cropUnitY = subHeightC * (2 - frameMbsOnlyFlag);
      }
      displayWidth -= cropUnitX * (frameCropLeftOffset + frameCropRightOffset);
      displayHeight -= cropUnitY * (frameCropTopOffset + frameCropBottomOffset);
    }
    let colourPrimaries = 2;
    let transferCharacteristics = 2;
    let matrixCoefficients = 2;
    let fullRangeFlag = 0;
    let pixelAspectRatio = { num: 1, den: 1 };
    let numReorderFrames = null;
    let maxDecFrameBuffering = null;
    const vuiParametersPresentFlag = bitstream.readBits(1);
    if (vuiParametersPresentFlag) {
      const aspectRatioInfoPresentFlag = bitstream.readBits(1);
      if (aspectRatioInfoPresentFlag) {
        const aspectRatioIdc = bitstream.readBits(8);
        if (aspectRatioIdc === 255) {
          pixelAspectRatio = {
            num: bitstream.readBits(16),
            den: bitstream.readBits(16)
          };
        } else {
          const aspectRatio = AVC_HEVC_ASPECT_RATIO_IDC_TABLE[aspectRatioIdc];
          if (aspectRatio) {
            pixelAspectRatio = aspectRatio;
          }
        }
      }
      const overscanInfoPresentFlag = bitstream.readBits(1);
      if (overscanInfoPresentFlag) {
        bitstream.skipBits(1);
      }
      const videoSignalTypePresentFlag = bitstream.readBits(1);
      if (videoSignalTypePresentFlag) {
        bitstream.skipBits(3);
        fullRangeFlag = bitstream.readBits(1);
        const colourDescriptionPresentFlag = bitstream.readBits(1);
        if (colourDescriptionPresentFlag) {
          colourPrimaries = bitstream.readBits(8);
          transferCharacteristics = bitstream.readBits(8);
          matrixCoefficients = bitstream.readBits(8);
        }
      }
      const chromaLocInfoPresentFlag = bitstream.readBits(1);
      if (chromaLocInfoPresentFlag) {
        readExpGolomb(bitstream);
        readExpGolomb(bitstream);
      }
      const timingInfoPresentFlag = bitstream.readBits(1);
      if (timingInfoPresentFlag) {
        bitstream.skipBits(32);
        bitstream.skipBits(32);
        bitstream.skipBits(1);
      }
      const nalHrdParametersPresentFlag = bitstream.readBits(1);
      if (nalHrdParametersPresentFlag) {
        skipAvcHrdParameters(bitstream);
      }
      const vclHrdParametersPresentFlag = bitstream.readBits(1);
      if (vclHrdParametersPresentFlag) {
        skipAvcHrdParameters(bitstream);
      }
      if (nalHrdParametersPresentFlag || vclHrdParametersPresentFlag) {
        bitstream.skipBits(1);
      }
      bitstream.skipBits(1);
      const bitstreamRestrictionFlag = bitstream.readBits(1);
      if (bitstreamRestrictionFlag) {
        bitstream.skipBits(1);
        readExpGolomb(bitstream);
        readExpGolomb(bitstream);
        readExpGolomb(bitstream);
        readExpGolomb(bitstream);
        numReorderFrames = readExpGolomb(bitstream);
        maxDecFrameBuffering = readExpGolomb(bitstream);
      }
    }
    if (numReorderFrames === null) {
      assert(maxDecFrameBuffering === null);
      const constraintSet3Flag = constraintFlags & 16;
      if ((profileIdc === 44 || profileIdc === 86 || profileIdc === 100 || profileIdc === 110 || profileIdc === 122 || profileIdc === 244) && constraintSet3Flag) {
        numReorderFrames = 0;
        maxDecFrameBuffering = 0;
      } else {
        const picWidthInMbs = picWidthInMbsMinus1 + 1;
        const picHeightInMapUnits = picHeightInMapUnitsMinus1 + 1;
        const frameHeightInMbs = (2 - frameMbsOnlyFlag) * picHeightInMapUnits;
        const levelInfo = AVC_LEVEL_TABLE.find((x) => x.level >= levelIdc) ?? last(AVC_LEVEL_TABLE);
        const maxDpbFrames = Math.min(Math.floor(levelInfo.maxDpbMbs / (picWidthInMbs * frameHeightInMbs)), 16);
        numReorderFrames = maxDpbFrames;
        maxDecFrameBuffering = maxDpbFrames;
      }
    }
    assert(maxDecFrameBuffering !== null);
    return {
      profileIdc,
      constraintFlags,
      levelIdc,
      frameMbsOnlyFlag,
      chromaFormatIdc,
      bitDepthLumaMinus8,
      bitDepthChromaMinus8,
      codedWidth,
      codedHeight,
      displayWidth,
      displayHeight,
      pixelAspectRatio,
      colourPrimaries,
      matrixCoefficients,
      transferCharacteristics,
      fullRangeFlag,
      numReorderFrames,
      maxDecFrameBuffering
    };
  } catch (error) {
    console.error("Error parsing AVC SPS:", error);
    return null;
  }
};
var skipAvcHrdParameters = (bitstream) => {
  const cpb_cnt_minus1 = readExpGolomb(bitstream);
  bitstream.skipBits(4);
  bitstream.skipBits(4);
  for (let i = 0; i <= cpb_cnt_minus1; i++) {
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    bitstream.skipBits(1);
  }
  bitstream.skipBits(5);
  bitstream.skipBits(5);
  bitstream.skipBits(5);
  bitstream.skipBits(5);
};
var concatHevcNalUnits = (nalUnits, decoderConfig) => {
  if (decoderConfig.description) {
    const bytes2 = toUint8Array(decoderConfig.description);
    const lengthSizeMinusOne = bytes2[21] & 3;
    const lengthSize = lengthSizeMinusOne + 1;
    return concatNalUnitsInLengthPrefixed(nalUnits, lengthSize);
  } else {
    return concatNalUnitsInAnnexB(nalUnits);
  }
};
var iterateHevcNalUnits = (packetData, decoderConfig) => {
  if (decoderConfig.description) {
    const bytes2 = toUint8Array(decoderConfig.description);
    const lengthSizeMinusOne = bytes2[21] & 3;
    const lengthSize = lengthSizeMinusOne + 1;
    return iterateNalUnitsInLengthPrefixed(packetData, lengthSize);
  } else {
    return iterateNalUnitsInAnnexB(packetData);
  }
};
var extractNalUnitTypeForHevc = (byte) => {
  return byte >> 1 & 63;
};
var parseHevcSps = (sps) => {
  try {
    const bitstream = new Bitstream(removeEmulationPreventionBytes(sps));
    bitstream.skipBits(16);
    bitstream.readBits(4);
    const spsMaxSubLayersMinus1 = bitstream.readBits(3);
    const spsTemporalIdNestingFlag = bitstream.readBits(1);
    const { general_profile_space, general_tier_flag, general_profile_idc, general_profile_compatibility_flags, general_constraint_indicator_flags, general_level_idc } = parseProfileTierLevel(bitstream, spsMaxSubLayersMinus1);
    readExpGolomb(bitstream);
    const chromaFormatIdc = readExpGolomb(bitstream);
    let separateColourPlaneFlag = 0;
    if (chromaFormatIdc === 3) {
      separateColourPlaneFlag = bitstream.readBits(1);
    }
    const picWidthInLumaSamples = readExpGolomb(bitstream);
    const picHeightInLumaSamples = readExpGolomb(bitstream);
    let displayWidth = picWidthInLumaSamples;
    let displayHeight = picHeightInLumaSamples;
    if (bitstream.readBits(1)) {
      const confWinLeftOffset = readExpGolomb(bitstream);
      const confWinRightOffset = readExpGolomb(bitstream);
      const confWinTopOffset = readExpGolomb(bitstream);
      const confWinBottomOffset = readExpGolomb(bitstream);
      let subWidthC = 1;
      let subHeightC = 1;
      const chromaArrayType = separateColourPlaneFlag === 0 ? chromaFormatIdc : 0;
      if (chromaArrayType === 1) {
        subWidthC = 2;
        subHeightC = 2;
      } else if (chromaArrayType === 2) {
        subWidthC = 2;
        subHeightC = 1;
      }
      displayWidth -= (confWinLeftOffset + confWinRightOffset) * subWidthC;
      displayHeight -= (confWinTopOffset + confWinBottomOffset) * subHeightC;
    }
    const bitDepthLumaMinus8 = readExpGolomb(bitstream);
    const bitDepthChromaMinus8 = readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    const spsSubLayerOrderingInfoPresentFlag = bitstream.readBits(1);
    const startI = spsSubLayerOrderingInfoPresentFlag ? 0 : spsMaxSubLayersMinus1;
    let spsMaxNumReorderPics = 0;
    for (let i = startI; i <= spsMaxSubLayersMinus1; i++) {
      readExpGolomb(bitstream);
      spsMaxNumReorderPics = readExpGolomb(bitstream);
      readExpGolomb(bitstream);
    }
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    if (bitstream.readBits(1)) {
      if (bitstream.readBits(1)) {
        skipScalingListData(bitstream);
      }
    }
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    if (bitstream.readBits(1)) {
      bitstream.skipBits(4);
      bitstream.skipBits(4);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      bitstream.skipBits(1);
    }
    const numShortTermRefPicSets = readExpGolomb(bitstream);
    skipAllStRefPicSets(bitstream, numShortTermRefPicSets);
    if (bitstream.readBits(1)) {
      const numLongTermRefPicsSps = readExpGolomb(bitstream);
      for (let i = 0; i < numLongTermRefPicsSps; i++) {
        readExpGolomb(bitstream);
        bitstream.skipBits(1);
      }
    }
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    let colourPrimaries = 2;
    let transferCharacteristics = 2;
    let matrixCoefficients = 2;
    let fullRangeFlag = 0;
    let minSpatialSegmentationIdc = 0;
    let pixelAspectRatio = { num: 1, den: 1 };
    if (bitstream.readBits(1)) {
      const vui = parseHevcVui(bitstream, spsMaxSubLayersMinus1);
      pixelAspectRatio = vui.pixelAspectRatio;
      colourPrimaries = vui.colourPrimaries;
      transferCharacteristics = vui.transferCharacteristics;
      matrixCoefficients = vui.matrixCoefficients;
      fullRangeFlag = vui.fullRangeFlag;
      minSpatialSegmentationIdc = vui.minSpatialSegmentationIdc;
    }
    return {
      displayWidth,
      displayHeight,
      pixelAspectRatio,
      colourPrimaries,
      transferCharacteristics,
      matrixCoefficients,
      fullRangeFlag,
      maxDecFrameBuffering: spsMaxNumReorderPics + 1,
      spsMaxSubLayersMinus1,
      spsTemporalIdNestingFlag,
      generalProfileSpace: general_profile_space,
      generalTierFlag: general_tier_flag,
      generalProfileIdc: general_profile_idc,
      generalProfileCompatibilityFlags: general_profile_compatibility_flags,
      generalConstraintIndicatorFlags: general_constraint_indicator_flags,
      generalLevelIdc: general_level_idc,
      chromaFormatIdc,
      bitDepthLumaMinus8,
      bitDepthChromaMinus8,
      minSpatialSegmentationIdc
    };
  } catch (error) {
    console.error("Error parsing HEVC SPS:", error);
    return null;
  }
};
var extractHevcDecoderConfigurationRecord = (packetData) => {
  try {
    const vpsUnits = [];
    const spsUnits = [];
    const ppsUnits = [];
    const seiUnits = [];
    for (const loc of iterateNalUnitsInAnnexB(packetData)) {
      const nalUnit = packetData.subarray(loc.offset, loc.offset + loc.length);
      const type = extractNalUnitTypeForHevc(nalUnit[0]);
      if (type === HevcNalUnitType.VPS_NUT) {
        vpsUnits.push(nalUnit);
      } else if (type === HevcNalUnitType.SPS_NUT) {
        spsUnits.push(nalUnit);
      } else if (type === HevcNalUnitType.PPS_NUT) {
        ppsUnits.push(nalUnit);
      } else if (type === HevcNalUnitType.PREFIX_SEI_NUT || type === HevcNalUnitType.SUFFIX_SEI_NUT) {
        seiUnits.push(nalUnit);
      }
    }
    if (spsUnits.length === 0 || ppsUnits.length === 0)
      return null;
    const spsInfo = parseHevcSps(spsUnits[0]);
    if (!spsInfo)
      return null;
    let parallelismType = 0;
    if (ppsUnits.length > 0) {
      const pps = ppsUnits[0];
      const ppsBitstream = new Bitstream(removeEmulationPreventionBytes(pps));
      ppsBitstream.skipBits(16);
      readExpGolomb(ppsBitstream);
      readExpGolomb(ppsBitstream);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(3);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      readExpGolomb(ppsBitstream);
      readExpGolomb(ppsBitstream);
      readSignedExpGolomb(ppsBitstream);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      if (ppsBitstream.readBits(1)) {
        readExpGolomb(ppsBitstream);
      }
      readSignedExpGolomb(ppsBitstream);
      readSignedExpGolomb(ppsBitstream);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      const tiles_enabled_flag = ppsBitstream.readBits(1);
      const entropy_coding_sync_enabled_flag = ppsBitstream.readBits(1);
      if (!tiles_enabled_flag && !entropy_coding_sync_enabled_flag)
        parallelismType = 0;
      else if (tiles_enabled_flag && !entropy_coding_sync_enabled_flag)
        parallelismType = 2;
      else if (!tiles_enabled_flag && entropy_coding_sync_enabled_flag)
        parallelismType = 3;
      else
        parallelismType = 0;
    }
    const arrays = [
      ...vpsUnits.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: HevcNalUnitType.VPS_NUT,
          nalUnits: vpsUnits
        }
      ] : [],
      ...spsUnits.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: HevcNalUnitType.SPS_NUT,
          nalUnits: spsUnits
        }
      ] : [],
      ...ppsUnits.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: HevcNalUnitType.PPS_NUT,
          nalUnits: ppsUnits
        }
      ] : [],
      ...seiUnits.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: extractNalUnitTypeForHevc(seiUnits[0][0]),
          nalUnits: seiUnits
        }
      ] : []
    ];
    const record = {
      configurationVersion: 1,
      generalProfileSpace: spsInfo.generalProfileSpace,
      generalTierFlag: spsInfo.generalTierFlag,
      generalProfileIdc: spsInfo.generalProfileIdc,
      generalProfileCompatibilityFlags: spsInfo.generalProfileCompatibilityFlags,
      generalConstraintIndicatorFlags: spsInfo.generalConstraintIndicatorFlags,
      generalLevelIdc: spsInfo.generalLevelIdc,
      minSpatialSegmentationIdc: spsInfo.minSpatialSegmentationIdc,
      parallelismType,
      chromaFormatIdc: spsInfo.chromaFormatIdc,
      bitDepthLumaMinus8: spsInfo.bitDepthLumaMinus8,
      bitDepthChromaMinus8: spsInfo.bitDepthChromaMinus8,
      avgFrameRate: 0,
      constantFrameRate: 0,
      numTemporalLayers: spsInfo.spsMaxSubLayersMinus1 + 1,
      temporalIdNested: spsInfo.spsTemporalIdNestingFlag,
      lengthSizeMinusOne: 3,
      arrays
    };
    return record;
  } catch (error) {
    console.error("Error building HEVC Decoder Configuration Record:", error);
    return null;
  }
};
var parseProfileTierLevel = (bitstream, maxNumSubLayersMinus1) => {
  const general_profile_space = bitstream.readBits(2);
  const general_tier_flag = bitstream.readBits(1);
  const general_profile_idc = bitstream.readBits(5);
  let general_profile_compatibility_flags = 0;
  for (let i = 0; i < 32; i++) {
    general_profile_compatibility_flags = general_profile_compatibility_flags << 1 | bitstream.readBits(1);
  }
  const general_constraint_indicator_flags = new Uint8Array(6);
  for (let i = 0; i < 6; i++) {
    general_constraint_indicator_flags[i] = bitstream.readBits(8);
  }
  const general_level_idc = bitstream.readBits(8);
  const sub_layer_profile_present_flag = [];
  const sub_layer_level_present_flag = [];
  for (let i = 0; i < maxNumSubLayersMinus1; i++) {
    sub_layer_profile_present_flag.push(bitstream.readBits(1));
    sub_layer_level_present_flag.push(bitstream.readBits(1));
  }
  if (maxNumSubLayersMinus1 > 0) {
    for (let i = maxNumSubLayersMinus1; i < 8; i++) {
      bitstream.skipBits(2);
    }
  }
  for (let i = 0; i < maxNumSubLayersMinus1; i++) {
    if (sub_layer_profile_present_flag[i])
      bitstream.skipBits(88);
    if (sub_layer_level_present_flag[i])
      bitstream.skipBits(8);
  }
  return {
    general_profile_space,
    general_tier_flag,
    general_profile_idc,
    general_profile_compatibility_flags,
    general_constraint_indicator_flags,
    general_level_idc
  };
};
var skipScalingListData = (bitstream) => {
  for (let sizeId = 0; sizeId < 4; sizeId++) {
    for (let matrixId = 0; matrixId < (sizeId === 3 ? 2 : 6); matrixId++) {
      const scaling_list_pred_mode_flag = bitstream.readBits(1);
      if (!scaling_list_pred_mode_flag) {
        readExpGolomb(bitstream);
      } else {
        const coefNum = Math.min(64, 1 << 4 + (sizeId << 1));
        if (sizeId > 1) {
          readSignedExpGolomb(bitstream);
        }
        for (let i = 0; i < coefNum; i++) {
          readSignedExpGolomb(bitstream);
        }
      }
    }
  }
};
var skipAllStRefPicSets = (bitstream, num_short_term_ref_pic_sets) => {
  const NumDeltaPocs = [];
  for (let stRpsIdx = 0; stRpsIdx < num_short_term_ref_pic_sets; stRpsIdx++) {
    NumDeltaPocs[stRpsIdx] = skipStRefPicSet(bitstream, stRpsIdx, num_short_term_ref_pic_sets, NumDeltaPocs);
  }
};
var skipStRefPicSet = (bitstream, stRpsIdx, num_short_term_ref_pic_sets, NumDeltaPocs) => {
  let NumDeltaPocsThis = 0;
  let inter_ref_pic_set_prediction_flag = 0;
  let RefRpsIdx = 0;
  if (stRpsIdx !== 0) {
    inter_ref_pic_set_prediction_flag = bitstream.readBits(1);
  }
  if (inter_ref_pic_set_prediction_flag) {
    if (stRpsIdx === num_short_term_ref_pic_sets) {
      const delta_idx_minus1 = readExpGolomb(bitstream);
      RefRpsIdx = stRpsIdx - (delta_idx_minus1 + 1);
    } else {
      RefRpsIdx = stRpsIdx - 1;
    }
    bitstream.readBits(1);
    readExpGolomb(bitstream);
    const numDelta = NumDeltaPocs[RefRpsIdx] ?? 0;
    for (let j = 0; j <= numDelta; j++) {
      const used_by_curr_pic_flag = bitstream.readBits(1);
      if (!used_by_curr_pic_flag) {
        bitstream.readBits(1);
      }
    }
    NumDeltaPocsThis = NumDeltaPocs[RefRpsIdx];
  } else {
    const num_negative_pics = readExpGolomb(bitstream);
    const num_positive_pics = readExpGolomb(bitstream);
    for (let i = 0; i < num_negative_pics; i++) {
      readExpGolomb(bitstream);
      bitstream.readBits(1);
    }
    for (let i = 0; i < num_positive_pics; i++) {
      readExpGolomb(bitstream);
      bitstream.readBits(1);
    }
    NumDeltaPocsThis = num_negative_pics + num_positive_pics;
  }
  return NumDeltaPocsThis;
};
var parseHevcVui = (bitstream, sps_max_sub_layers_minus1) => {
  let colourPrimaries = 2;
  let transferCharacteristics = 2;
  let matrixCoefficients = 2;
  let fullRangeFlag = 0;
  let minSpatialSegmentationIdc = 0;
  let pixelAspectRatio = { num: 1, den: 1 };
  if (bitstream.readBits(1)) {
    const aspect_ratio_idc = bitstream.readBits(8);
    if (aspect_ratio_idc === 255) {
      pixelAspectRatio = {
        num: bitstream.readBits(16),
        den: bitstream.readBits(16)
      };
    } else {
      const aspectRatio = AVC_HEVC_ASPECT_RATIO_IDC_TABLE[aspect_ratio_idc];
      if (aspectRatio) {
        pixelAspectRatio = aspectRatio;
      }
    }
  }
  if (bitstream.readBits(1)) {
    bitstream.readBits(1);
  }
  if (bitstream.readBits(1)) {
    bitstream.readBits(3);
    fullRangeFlag = bitstream.readBits(1);
    if (bitstream.readBits(1)) {
      colourPrimaries = bitstream.readBits(8);
      transferCharacteristics = bitstream.readBits(8);
      matrixCoefficients = bitstream.readBits(8);
    }
  }
  if (bitstream.readBits(1)) {
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
  }
  bitstream.readBits(1);
  bitstream.readBits(1);
  bitstream.readBits(1);
  if (bitstream.readBits(1)) {
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
  }
  if (bitstream.readBits(1)) {
    bitstream.readBits(32);
    bitstream.readBits(32);
    if (bitstream.readBits(1)) {
      readExpGolomb(bitstream);
    }
    if (bitstream.readBits(1)) {
      skipHevcHrdParameters(bitstream, true, sps_max_sub_layers_minus1);
    }
  }
  if (bitstream.readBits(1)) {
    bitstream.readBits(1);
    bitstream.readBits(1);
    bitstream.readBits(1);
    minSpatialSegmentationIdc = readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
  }
  return {
    pixelAspectRatio,
    colourPrimaries,
    transferCharacteristics,
    matrixCoefficients,
    fullRangeFlag,
    minSpatialSegmentationIdc
  };
};
var skipHevcHrdParameters = (bitstream, commonInfPresentFlag, maxNumSubLayersMinus1) => {
  let nal_hrd_parameters_present_flag = false;
  let vcl_hrd_parameters_present_flag = false;
  let sub_pic_hrd_params_present_flag = false;
  if (commonInfPresentFlag) {
    nal_hrd_parameters_present_flag = bitstream.readBits(1) === 1;
    vcl_hrd_parameters_present_flag = bitstream.readBits(1) === 1;
    if (nal_hrd_parameters_present_flag || vcl_hrd_parameters_present_flag) {
      sub_pic_hrd_params_present_flag = bitstream.readBits(1) === 1;
      if (sub_pic_hrd_params_present_flag) {
        bitstream.readBits(8);
        bitstream.readBits(5);
        bitstream.readBits(1);
        bitstream.readBits(5);
      }
      bitstream.readBits(4);
      bitstream.readBits(4);
      if (sub_pic_hrd_params_present_flag) {
        bitstream.readBits(4);
      }
      bitstream.readBits(5);
      bitstream.readBits(5);
      bitstream.readBits(5);
    }
  }
  for (let i = 0; i <= maxNumSubLayersMinus1; i++) {
    const fixed_pic_rate_general_flag = bitstream.readBits(1) === 1;
    let fixed_pic_rate_within_cvs_flag = true;
    if (!fixed_pic_rate_general_flag) {
      fixed_pic_rate_within_cvs_flag = bitstream.readBits(1) === 1;
    }
    let low_delay_hrd_flag = false;
    if (fixed_pic_rate_within_cvs_flag) {
      readExpGolomb(bitstream);
    } else {
      low_delay_hrd_flag = bitstream.readBits(1) === 1;
    }
    let CpbCnt = 1;
    if (!low_delay_hrd_flag) {
      const cpb_cnt_minus1 = readExpGolomb(bitstream);
      CpbCnt = cpb_cnt_minus1 + 1;
    }
    if (nal_hrd_parameters_present_flag) {
      skipSubLayerHrdParameters(bitstream, CpbCnt, sub_pic_hrd_params_present_flag);
    }
    if (vcl_hrd_parameters_present_flag) {
      skipSubLayerHrdParameters(bitstream, CpbCnt, sub_pic_hrd_params_present_flag);
    }
  }
};
var skipSubLayerHrdParameters = (bitstream, CpbCnt, sub_pic_hrd_params_present_flag) => {
  for (let i = 0; i < CpbCnt; i++) {
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    if (sub_pic_hrd_params_present_flag) {
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
    }
    bitstream.readBits(1);
  }
};
var serializeHevcDecoderConfigurationRecord = (record) => {
  const bytes2 = [];
  bytes2.push(record.configurationVersion);
  bytes2.push((record.generalProfileSpace & 3) << 6 | (record.generalTierFlag & 1) << 5 | record.generalProfileIdc & 31);
  bytes2.push(record.generalProfileCompatibilityFlags >>> 24 & 255);
  bytes2.push(record.generalProfileCompatibilityFlags >>> 16 & 255);
  bytes2.push(record.generalProfileCompatibilityFlags >>> 8 & 255);
  bytes2.push(record.generalProfileCompatibilityFlags & 255);
  bytes2.push(...record.generalConstraintIndicatorFlags);
  bytes2.push(record.generalLevelIdc & 255);
  bytes2.push(240 | record.minSpatialSegmentationIdc >> 8 & 15);
  bytes2.push(record.minSpatialSegmentationIdc & 255);
  bytes2.push(252 | record.parallelismType & 3);
  bytes2.push(252 | record.chromaFormatIdc & 3);
  bytes2.push(248 | record.bitDepthLumaMinus8 & 7);
  bytes2.push(248 | record.bitDepthChromaMinus8 & 7);
  bytes2.push(record.avgFrameRate >> 8 & 255);
  bytes2.push(record.avgFrameRate & 255);
  bytes2.push((record.constantFrameRate & 3) << 6 | (record.numTemporalLayers & 7) << 3 | (record.temporalIdNested & 1) << 2 | record.lengthSizeMinusOne & 3);
  bytes2.push(record.arrays.length & 255);
  for (const arr of record.arrays) {
    bytes2.push((arr.arrayCompleteness & 1) << 7 | 0 << 6 | arr.nalUnitType & 63);
    bytes2.push(arr.nalUnits.length >> 8 & 255);
    bytes2.push(arr.nalUnits.length & 255);
    for (const nal of arr.nalUnits) {
      bytes2.push(nal.length >> 8 & 255);
      bytes2.push(nal.length & 255);
      for (let i = 0; i < nal.length; i++) {
        bytes2.push(nal[i]);
      }
    }
  }
  return new Uint8Array(bytes2);
};
var deserializeHevcDecoderConfigurationRecord = (data) => {
  try {
    const view2 = toDataView(data);
    let offset = 0;
    const configurationVersion = view2.getUint8(offset++);
    const byte1 = view2.getUint8(offset++);
    const generalProfileSpace = byte1 >> 6 & 3;
    const generalTierFlag = byte1 >> 5 & 1;
    const generalProfileIdc = byte1 & 31;
    const generalProfileCompatibilityFlags = view2.getUint32(offset, false);
    offset += 4;
    const generalConstraintIndicatorFlags = data.subarray(offset, offset + 6);
    offset += 6;
    const generalLevelIdc = view2.getUint8(offset++);
    const minSpatialSegmentationIdc = (view2.getUint8(offset++) & 15) << 8 | view2.getUint8(offset++);
    const parallelismType = view2.getUint8(offset++) & 3;
    const chromaFormatIdc = view2.getUint8(offset++) & 3;
    const bitDepthLumaMinus8 = view2.getUint8(offset++) & 7;
    const bitDepthChromaMinus8 = view2.getUint8(offset++) & 7;
    const avgFrameRate = view2.getUint16(offset, false);
    offset += 2;
    const byte21 = view2.getUint8(offset++);
    const constantFrameRate = byte21 >> 6 & 3;
    const numTemporalLayers = byte21 >> 3 & 7;
    const temporalIdNested = byte21 >> 2 & 1;
    const lengthSizeMinusOne = byte21 & 3;
    const numOfArrays = view2.getUint8(offset++);
    const arrays = [];
    for (let i = 0; i < numOfArrays; i++) {
      const arrByte = view2.getUint8(offset++);
      const arrayCompleteness = arrByte >> 7 & 1;
      const nalUnitType = arrByte & 63;
      const numNalus = view2.getUint16(offset, false);
      offset += 2;
      const nalUnits = [];
      for (let j = 0; j < numNalus; j++) {
        const nalUnitLength = view2.getUint16(offset, false);
        offset += 2;
        nalUnits.push(data.subarray(offset, offset + nalUnitLength));
        offset += nalUnitLength;
      }
      arrays.push({
        arrayCompleteness,
        nalUnitType,
        nalUnits
      });
    }
    return {
      configurationVersion,
      generalProfileSpace,
      generalTierFlag,
      generalProfileIdc,
      generalProfileCompatibilityFlags,
      generalConstraintIndicatorFlags,
      generalLevelIdc,
      minSpatialSegmentationIdc,
      parallelismType,
      chromaFormatIdc,
      bitDepthLumaMinus8,
      bitDepthChromaMinus8,
      avgFrameRate,
      constantFrameRate,
      numTemporalLayers,
      temporalIdNested,
      lengthSizeMinusOne,
      arrays
    };
  } catch (error) {
    console.error("Error deserializing HEVC Decoder Configuration Record:", error);
    return null;
  }
};
var HevcNaluOrderState;
(function(HevcNaluOrderState2) {
  HevcNaluOrderState2[HevcNaluOrderState2["audAllowed"] = 0] = "audAllowed";
  HevcNaluOrderState2[HevcNaluOrderState2["beforeFirstVcl"] = 1] = "beforeFirstVcl";
  HevcNaluOrderState2[HevcNaluOrderState2["afterFirstVcl"] = 2] = "afterFirstVcl";
  HevcNaluOrderState2[HevcNaluOrderState2["eoBitstreamAllowed"] = 3] = "eoBitstreamAllowed";
  HevcNaluOrderState2[HevcNaluOrderState2["noMoreDataAllowed"] = 4] = "noMoreDataAllowed";
})(HevcNaluOrderState || (HevcNaluOrderState = {}));
var sanitizeHevcPacketForChromium = (packetData, decoderConfig) => {
  const removedNalUnits = /* @__PURE__ */ new Set();
  let orderState = HevcNaluOrderState.audAllowed;
  for (const loc of iterateHevcNalUnits(packetData, decoderConfig)) {
    if (orderState === HevcNaluOrderState.noMoreDataAllowed) {
      removedNalUnits.add(loc.offset);
      continue;
    }
    const type = extractNalUnitTypeForHevc(packetData[loc.offset]);
    if (orderState === HevcNaluOrderState.eoBitstreamAllowed && type !== 37) {
      removedNalUnits.add(loc.offset);
      continue;
    }
    let remove = false;
    if (type === 35) {
      if (orderState > HevcNaluOrderState.audAllowed) {
        remove = true;
      } else {
        orderState = HevcNaluOrderState.beforeFirstVcl;
      }
    } else if (type <= 31) {
      if (orderState > HevcNaluOrderState.afterFirstVcl) {
        remove = true;
      } else {
        orderState = HevcNaluOrderState.afterFirstVcl;
      }
    } else if (type === 36) {
      if (orderState !== HevcNaluOrderState.afterFirstVcl) {
        remove = true;
      } else {
        orderState = HevcNaluOrderState.eoBitstreamAllowed;
      }
    } else if (type === 37) {
      if (orderState < HevcNaluOrderState.afterFirstVcl) {
        remove = true;
      } else {
        orderState = HevcNaluOrderState.noMoreDataAllowed;
      }
    } else if (type === 32 || type === 33 || type === 34 || type === 39 || type >= 41 && type <= 44 || type >= 48 && type <= 55) {
      if (orderState > HevcNaluOrderState.beforeFirstVcl) {
        remove = true;
      } else {
        orderState = HevcNaluOrderState.beforeFirstVcl;
      }
    } else if (type === 38 || type === 40 || type >= 45 && type <= 47 || type >= 56 && type <= 63) {
      if (orderState < HevcNaluOrderState.afterFirstVcl) {
        remove = true;
      }
    }
    if (remove) {
      removedNalUnits.add(loc.offset);
    }
  }
  if (removedNalUnits.size === 0) {
    return null;
  }
  const filteredNalUnits = [];
  for (const loc of iterateHevcNalUnits(packetData, decoderConfig)) {
    if (!removedNalUnits.has(loc.offset)) {
      filteredNalUnits.push(packetData.subarray(loc.offset, loc.offset + loc.length));
    }
  }
  return concatHevcNalUnits(filteredNalUnits, decoderConfig);
};
var extractVp9CodecInfoFromPacket = (packet) => {
  const bitstream = new Bitstream(packet);
  const frameMarker = bitstream.readBits(2);
  if (frameMarker !== 2) {
    return null;
  }
  const profileLowBit = bitstream.readBits(1);
  const profileHighBit = bitstream.readBits(1);
  const profile = (profileHighBit << 1) + profileLowBit;
  if (profile === 3) {
    bitstream.skipBits(1);
  }
  const showExistingFrame = bitstream.readBits(1);
  if (showExistingFrame === 1) {
    return null;
  }
  const frameType = bitstream.readBits(1);
  if (frameType !== 0) {
    return null;
  }
  bitstream.skipBits(2);
  const syncCode = bitstream.readBits(24);
  if (syncCode !== 4817730) {
    return null;
  }
  let bitDepth = 8;
  if (profile >= 2) {
    const tenOrTwelveBit = bitstream.readBits(1);
    bitDepth = tenOrTwelveBit ? 12 : 10;
  }
  const colorSpace = bitstream.readBits(3);
  let chromaSubsampling = 0;
  let videoFullRangeFlag = 0;
  if (colorSpace !== 7) {
    const colorRange = bitstream.readBits(1);
    videoFullRangeFlag = colorRange;
    if (profile === 1 || profile === 3) {
      const subsamplingX = bitstream.readBits(1);
      const subsamplingY = bitstream.readBits(1);
      chromaSubsampling = !subsamplingX && !subsamplingY ? 3 : subsamplingX && !subsamplingY ? 2 : 1;
      bitstream.skipBits(1);
    } else {
      chromaSubsampling = 1;
    }
  } else {
    chromaSubsampling = 3;
    videoFullRangeFlag = 1;
  }
  const widthMinusOne = bitstream.readBits(16);
  const heightMinusOne = bitstream.readBits(16);
  const width = widthMinusOne + 1;
  const height = heightMinusOne + 1;
  const pictureSize = width * height;
  let level = last(VP9_LEVEL_TABLE).level;
  for (const entry of VP9_LEVEL_TABLE) {
    if (pictureSize <= entry.maxPictureSize) {
      level = entry.level;
      break;
    }
  }
  const matrixCoefficients = colorSpace === 7 ? 0 : colorSpace === 2 ? 1 : colorSpace === 1 ? 6 : 2;
  const colourPrimaries = colorSpace === 2 ? 1 : colorSpace === 1 ? 6 : 2;
  const transferCharacteristics = colorSpace === 2 ? 1 : colorSpace === 1 ? 6 : 2;
  return {
    profile,
    level,
    bitDepth,
    chromaSubsampling,
    videoFullRangeFlag,
    colourPrimaries,
    transferCharacteristics,
    matrixCoefficients
  };
};
var iterateAv1PacketObus = function* (packet) {
  const bitstream = new Bitstream(packet);
  const readLeb128 = () => {
    let value = 0;
    for (let i = 0; i < 8; i++) {
      const byte = bitstream.readAlignedByte();
      value |= (byte & 127) << i * 7;
      if (!(byte & 128)) {
        break;
      }
      if (i === 7 && byte & 128) {
        return null;
      }
    }
    if (value >= 2 ** 32 - 1) {
      return null;
    }
    return value;
  };
  while (bitstream.getBitsLeft() >= 8) {
    bitstream.skipBits(1);
    const obuType = bitstream.readBits(4);
    const obuExtension = bitstream.readBits(1);
    const obuHasSizeField = bitstream.readBits(1);
    bitstream.skipBits(1);
    if (obuExtension) {
      bitstream.skipBits(8);
    }
    let obuSize;
    if (obuHasSizeField) {
      const obuSizeValue = readLeb128();
      if (obuSizeValue === null)
        return;
      obuSize = obuSizeValue;
    } else {
      obuSize = Math.floor(bitstream.getBitsLeft() / 8);
    }
    assert(bitstream.pos % 8 === 0);
    yield {
      type: obuType,
      data: packet.subarray(bitstream.pos / 8, bitstream.pos / 8 + obuSize)
    };
    bitstream.skipBits(obuSize * 8);
  }
};
var extractAv1CodecInfoFromPacket = (packet) => {
  for (const { type, data } of iterateAv1PacketObus(packet)) {
    if (type !== 1) {
      continue;
    }
    const bitstream = new Bitstream(data);
    const seqProfile = bitstream.readBits(3);
    const stillPicture = bitstream.readBits(1);
    const reducedStillPictureHeader = bitstream.readBits(1);
    let seqLevel = 0;
    let seqTier = 0;
    let bufferDelayLengthMinus1 = 0;
    if (reducedStillPictureHeader) {
      seqLevel = bitstream.readBits(5);
    } else {
      const timingInfoPresentFlag = bitstream.readBits(1);
      if (timingInfoPresentFlag) {
        bitstream.skipBits(32);
        bitstream.skipBits(32);
        const equalPictureInterval = bitstream.readBits(1);
        if (equalPictureInterval) {
          return null;
        }
      }
      const decoderModelInfoPresentFlag = bitstream.readBits(1);
      if (decoderModelInfoPresentFlag) {
        bufferDelayLengthMinus1 = bitstream.readBits(5);
        bitstream.skipBits(32);
        bitstream.skipBits(5);
        bitstream.skipBits(5);
      }
      const operatingPointsCntMinus1 = bitstream.readBits(5);
      for (let i = 0; i <= operatingPointsCntMinus1; i++) {
        bitstream.skipBits(12);
        const seqLevelIdx = bitstream.readBits(5);
        if (i === 0) {
          seqLevel = seqLevelIdx;
        }
        if (seqLevelIdx > 7) {
          const seqTierTemp = bitstream.readBits(1);
          if (i === 0) {
            seqTier = seqTierTemp;
          }
        }
        if (decoderModelInfoPresentFlag) {
          const decoderModelPresentForThisOp = bitstream.readBits(1);
          if (decoderModelPresentForThisOp) {
            const n = bufferDelayLengthMinus1 + 1;
            bitstream.skipBits(n);
            bitstream.skipBits(n);
            bitstream.skipBits(1);
          }
        }
        const initialDisplayDelayPresentFlag = bitstream.readBits(1);
        if (initialDisplayDelayPresentFlag) {
          bitstream.skipBits(4);
        }
      }
    }
    const frameWidthBitsMinus1 = bitstream.readBits(4);
    const frameHeightBitsMinus1 = bitstream.readBits(4);
    const n1 = frameWidthBitsMinus1 + 1;
    bitstream.skipBits(n1);
    const n2 = frameHeightBitsMinus1 + 1;
    bitstream.skipBits(n2);
    let frameIdNumbersPresentFlag = 0;
    if (reducedStillPictureHeader) {
      frameIdNumbersPresentFlag = 0;
    } else {
      frameIdNumbersPresentFlag = bitstream.readBits(1);
    }
    if (frameIdNumbersPresentFlag) {
      bitstream.skipBits(4);
      bitstream.skipBits(3);
    }
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    if (!reducedStillPictureHeader) {
      bitstream.skipBits(1);
      bitstream.skipBits(1);
      bitstream.skipBits(1);
      bitstream.skipBits(1);
      const enableOrderHint = bitstream.readBits(1);
      if (enableOrderHint) {
        bitstream.skipBits(1);
        bitstream.skipBits(1);
      }
      const seqChooseScreenContentTools = bitstream.readBits(1);
      let seqForceScreenContentTools = 0;
      if (seqChooseScreenContentTools) {
        seqForceScreenContentTools = 2;
      } else {
        seqForceScreenContentTools = bitstream.readBits(1);
      }
      if (seqForceScreenContentTools > 0) {
        const seqChooseIntegerMv = bitstream.readBits(1);
        if (!seqChooseIntegerMv) {
          bitstream.skipBits(1);
        }
      }
      if (enableOrderHint) {
        bitstream.skipBits(3);
      }
    }
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    const highBitdepth = bitstream.readBits(1);
    let bitDepth = 8;
    if (seqProfile === 2 && highBitdepth) {
      const twelveBit = bitstream.readBits(1);
      bitDepth = twelveBit ? 12 : 10;
    } else if (seqProfile <= 2) {
      bitDepth = highBitdepth ? 10 : 8;
    }
    let monochrome = 0;
    if (seqProfile !== 1) {
      monochrome = bitstream.readBits(1);
    }
    let chromaSubsamplingX = 1;
    let chromaSubsamplingY = 1;
    let chromaSamplePosition = 0;
    if (!monochrome) {
      if (seqProfile === 0) {
        chromaSubsamplingX = 1;
        chromaSubsamplingY = 1;
      } else if (seqProfile === 1) {
        chromaSubsamplingX = 0;
        chromaSubsamplingY = 0;
      } else {
        if (bitDepth === 12) {
          chromaSubsamplingX = bitstream.readBits(1);
          if (chromaSubsamplingX) {
            chromaSubsamplingY = bitstream.readBits(1);
          }
        }
      }
      if (chromaSubsamplingX && chromaSubsamplingY) {
        chromaSamplePosition = bitstream.readBits(2);
      }
    }
    return {
      profile: seqProfile,
      level: seqLevel,
      tier: seqTier,
      bitDepth,
      monochrome,
      chromaSubsamplingX,
      chromaSubsamplingY,
      chromaSamplePosition
    };
  }
  return null;
};
var parseOpusIdentificationHeader = (bytes2) => {
  const view2 = toDataView(bytes2);
  const outputChannelCount = view2.getUint8(9);
  const preSkip = view2.getUint16(10, true);
  const inputSampleRate = view2.getUint32(12, true);
  const outputGain = view2.getInt16(16, true);
  const channelMappingFamily = view2.getUint8(18);
  let channelMappingTable = null;
  if (channelMappingFamily) {
    channelMappingTable = bytes2.subarray(19, 19 + 2 + outputChannelCount);
  }
  return {
    outputChannelCount,
    preSkip,
    inputSampleRate,
    outputGain,
    channelMappingFamily,
    channelMappingTable
  };
};
var determineVideoPacketType = (codec, decoderConfig, packetData) => {
  switch (codec) {
    case "avc":
      {
        for (const loc of iterateAvcNalUnits(packetData, decoderConfig)) {
          const nalTypeByte = packetData[loc.offset];
          const type = extractNalUnitTypeForAvc(nalTypeByte);
          if (type >= AvcNalUnitType.NON_IDR_SLICE && type <= AvcNalUnitType.SLICE_DPC) {
            return "delta";
          }
          if (type === AvcNalUnitType.IDR) {
            return "key";
          }
          if (type === AvcNalUnitType.SEI && (!isChromium() || getChromiumVersion() >= 144)) {
            const nalUnit = packetData.subarray(loc.offset, loc.offset + loc.length);
            const bytes2 = removeEmulationPreventionBytes(nalUnit);
            let pos = 1;
            do {
              let payloadType = 0;
              while (true) {
                const nextByte = bytes2[pos++];
                if (nextByte === void 0)
                  break;
                payloadType += nextByte;
                if (nextByte < 255) {
                  break;
                }
              }
              let payloadSize = 0;
              while (true) {
                const nextByte = bytes2[pos++];
                if (nextByte === void 0)
                  break;
                payloadSize += nextByte;
                if (nextByte < 255) {
                  break;
                }
              }
              const PAYLOAD_TYPE_RECOVERY_POINT = 6;
              if (payloadType === PAYLOAD_TYPE_RECOVERY_POINT) {
                const bitstream = new Bitstream(bytes2);
                bitstream.pos = 8 * pos;
                const recoveryFrameCount = readExpGolomb(bitstream);
                const exactMatchFlag = bitstream.readBits(1);
                if (recoveryFrameCount === 0 && exactMatchFlag === 1) {
                  return "key";
                }
              }
              pos += payloadSize;
            } while (pos < bytes2.length - 1);
          }
        }
        return "delta";
      }
      ;
    case "hevc":
      {
        for (const loc of iterateHevcNalUnits(packetData, decoderConfig)) {
          const type = extractNalUnitTypeForHevc(packetData[loc.offset]);
          if (type < HevcNalUnitType.BLA_W_LP) {
            return "delta";
          }
          if (type <= HevcNalUnitType.RSV_IRAP_VCL23) {
            return "key";
          }
        }
        return "delta";
      }
      ;
    case "vp8":
      {
        const frameType = packetData[0] & 1;
        return frameType === 0 ? "key" : "delta";
      }
      ;
    case "vp9":
      {
        const bitstream = new Bitstream(packetData);
        if (bitstream.readBits(2) !== 2) {
          return null;
        }
        ;
        const profileLowBit = bitstream.readBits(1);
        const profileHighBit = bitstream.readBits(1);
        const profile = (profileHighBit << 1) + profileLowBit;
        if (profile === 3) {
          bitstream.skipBits(1);
        }
        const showExistingFrame = bitstream.readBits(1);
        if (showExistingFrame) {
          return null;
        }
        const frameType = bitstream.readBits(1);
        return frameType === 0 ? "key" : "delta";
      }
      ;
    case "av1":
      {
        let reducedStillPictureHeader = false;
        for (const { type, data } of iterateAv1PacketObus(packetData)) {
          if (type === 1) {
            const bitstream = new Bitstream(data);
            bitstream.skipBits(4);
            reducedStillPictureHeader = !!bitstream.readBits(1);
          } else if (type === 3 || type === 6 || type === 7) {
            if (reducedStillPictureHeader) {
              return "key";
            }
            const bitstream = new Bitstream(data);
            const showExistingFrame = bitstream.readBits(1);
            if (showExistingFrame) {
              return null;
            }
            const frameType = bitstream.readBits(2);
            return frameType === 0 ? "key" : "delta";
          }
        }
        return null;
      }
      ;
    default:
      {
        assertNever(codec);
        assert(false);
      }
      ;
  }
};
var FlacBlockType;
(function(FlacBlockType2) {
  FlacBlockType2[FlacBlockType2["STREAMINFO"] = 0] = "STREAMINFO";
  FlacBlockType2[FlacBlockType2["VORBIS_COMMENT"] = 4] = "VORBIS_COMMENT";
  FlacBlockType2[FlacBlockType2["PICTURE"] = 6] = "PICTURE";
})(FlacBlockType || (FlacBlockType = {}));
var AC3_ACMOD_CHANNEL_COUNTS = [2, 1, 2, 3, 3, 4, 4, 5];
var parseAc3SyncFrame = (data) => {
  if (data.length < 7) {
    return null;
  }
  if (data[0] !== 11 || data[1] !== 119) {
    return null;
  }
  const bitstream = new Bitstream(data);
  bitstream.skipBits(16);
  bitstream.skipBits(16);
  const fscod = bitstream.readBits(2);
  if (fscod === 3) {
    return null;
  }
  const frmsizecod = bitstream.readBits(6);
  const bsid = bitstream.readBits(5);
  if (bsid > 8) {
    return null;
  }
  const bsmod = bitstream.readBits(3);
  const acmod = bitstream.readBits(3);
  if ((acmod & 1) !== 0 && acmod !== 1) {
    bitstream.skipBits(2);
  }
  if ((acmod & 4) !== 0) {
    bitstream.skipBits(2);
  }
  if (acmod === 2) {
    bitstream.skipBits(2);
  }
  const lfeon = bitstream.readBits(1);
  const bitRateCode = Math.floor(frmsizecod / 2);
  return { fscod, bsid, bsmod, acmod, lfeon, bitRateCode };
};
var AC3_FRAME_SIZES = [
  // frmsizecod, [48kHz, 44.1kHz, 32kHz] in bytes
  64 * 2,
  69 * 2,
  96 * 2,
  64 * 2,
  70 * 2,
  96 * 2,
  80 * 2,
  87 * 2,
  120 * 2,
  80 * 2,
  88 * 2,
  120 * 2,
  96 * 2,
  104 * 2,
  144 * 2,
  96 * 2,
  105 * 2,
  144 * 2,
  112 * 2,
  121 * 2,
  168 * 2,
  112 * 2,
  122 * 2,
  168 * 2,
  128 * 2,
  139 * 2,
  192 * 2,
  128 * 2,
  140 * 2,
  192 * 2,
  160 * 2,
  174 * 2,
  240 * 2,
  160 * 2,
  175 * 2,
  240 * 2,
  192 * 2,
  208 * 2,
  288 * 2,
  192 * 2,
  209 * 2,
  288 * 2,
  224 * 2,
  243 * 2,
  336 * 2,
  224 * 2,
  244 * 2,
  336 * 2,
  256 * 2,
  278 * 2,
  384 * 2,
  256 * 2,
  279 * 2,
  384 * 2,
  320 * 2,
  348 * 2,
  480 * 2,
  320 * 2,
  349 * 2,
  480 * 2,
  384 * 2,
  417 * 2,
  576 * 2,
  384 * 2,
  418 * 2,
  576 * 2,
  448 * 2,
  487 * 2,
  672 * 2,
  448 * 2,
  488 * 2,
  672 * 2,
  512 * 2,
  557 * 2,
  768 * 2,
  512 * 2,
  558 * 2,
  768 * 2,
  640 * 2,
  696 * 2,
  960 * 2,
  640 * 2,
  697 * 2,
  960 * 2,
  768 * 2,
  835 * 2,
  1152 * 2,
  768 * 2,
  836 * 2,
  1152 * 2,
  896 * 2,
  975 * 2,
  1344 * 2,
  896 * 2,
  976 * 2,
  1344 * 2,
  1024 * 2,
  1114 * 2,
  1536 * 2,
  1024 * 2,
  1115 * 2,
  1536 * 2,
  1152 * 2,
  1253 * 2,
  1728 * 2,
  1152 * 2,
  1254 * 2,
  1728 * 2,
  1280 * 2,
  1393 * 2,
  1920 * 2,
  1280 * 2,
  1394 * 2,
  1920 * 2
];
var AC3_REGISTRATION_DESCRIPTOR = new Uint8Array([5, 4, 65, 67, 45, 51]);
var EAC3_REGISTRATION_DESCRIPTOR = new Uint8Array([5, 4, 69, 65, 67, 51]);
var EAC3_NUMBLKS_TABLE = [1, 2, 3, 6];
var parseEac3SyncFrame = (data) => {
  if (data.length < 6) {
    return null;
  }
  if (data[0] !== 11 || data[1] !== 119) {
    return null;
  }
  const bitstream = new Bitstream(data);
  bitstream.skipBits(16);
  const strmtyp = bitstream.readBits(2);
  bitstream.skipBits(3);
  if (strmtyp !== 0 && strmtyp !== 2) {
    return null;
  }
  const frmsiz = bitstream.readBits(11);
  const fscod = bitstream.readBits(2);
  let fscod2 = 0;
  let numblkscod;
  if (fscod === 3) {
    fscod2 = bitstream.readBits(2);
    numblkscod = 3;
  } else {
    numblkscod = bitstream.readBits(2);
  }
  const acmod = bitstream.readBits(3);
  const lfeon = bitstream.readBits(1);
  const bsid = bitstream.readBits(5);
  if (bsid < 11 || bsid > 16) {
    return null;
  }
  const numblks = EAC3_NUMBLKS_TABLE[numblkscod];
  let fs;
  if (fscod < 3) {
    fs = AC3_SAMPLE_RATES[fscod] / 1e3;
  } else {
    fs = EAC3_REDUCED_SAMPLE_RATES[fscod2] / 1e3;
  }
  const dataRate = Math.round((frmsiz + 1) * fs / (numblks * 16));
  const bsmod = 0;
  const numDepSub = 0;
  const chanLoc = 0;
  const substream = {
    fscod,
    fscod2,
    bsid,
    bsmod,
    acmod,
    lfeon,
    numDepSub,
    chanLoc
  };
  return {
    dataRate,
    substreams: [substream]
  };
};
var parseEac3Config = (data) => {
  if (data.length < 2) {
    return null;
  }
  const bitstream = new Bitstream(data);
  const dataRate = bitstream.readBits(13);
  const numIndSub = bitstream.readBits(3);
  const substreams = [];
  for (let i = 0; i <= numIndSub; i++) {
    if (Math.ceil(bitstream.pos / 8) + 3 > data.length) {
      break;
    }
    const fscod = bitstream.readBits(2);
    const bsid = bitstream.readBits(5);
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    const bsmod = bitstream.readBits(3);
    const acmod = bitstream.readBits(3);
    const lfeon = bitstream.readBits(1);
    bitstream.skipBits(3);
    const numDepSub = bitstream.readBits(4);
    let chanLoc = 0;
    if (numDepSub > 0) {
      chanLoc = bitstream.readBits(9);
    } else {
      bitstream.skipBits(1);
    }
    substreams.push({
      fscod,
      fscod2: null,
      bsid,
      bsmod,
      acmod,
      lfeon,
      numDepSub,
      chanLoc
    });
  }
  if (substreams.length === 0) {
    return null;
  }
  return { dataRate, substreams };
};
var getEac3SampleRate = (config) => {
  const sub = config.substreams[0];
  assert(sub);
  if (sub.fscod < 3) {
    return AC3_SAMPLE_RATES[sub.fscod];
  } else if (sub.fscod2 !== null && sub.fscod2 < 3) {
    return EAC3_REDUCED_SAMPLE_RATES[sub.fscod2];
  }
  return null;
};
var getEac3ChannelCount = (config) => {
  const sub = config.substreams[0];
  assert(sub);
  let channels = AC3_ACMOD_CHANNEL_COUNTS[sub.acmod] + sub.lfeon;
  if (sub.numDepSub > 0) {
    const CHAN_LOC_COUNTS = [2, 2, 1, 1, 2, 2, 2, 1, 1];
    for (let bit = 0; bit < 9; bit++) {
      if (sub.chanLoc & 1 << 8 - bit) {
        channels += CHAN_LOC_COUNTS[bit];
      }
    }
  }
  return channels;
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/demuxer.js
var Demuxer = class {
  constructor(input) {
    this.input = input;
  }
  dispose() {
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/packet.js
var PLACEHOLDER_DATA = /* @__PURE__ */ new Uint8Array(0);
var EncodedPacket = class _EncodedPacket {
  /** Creates a new {@link EncodedPacket} from raw bytes and timing information. */
  constructor(data, type, timestamp, duration, sequenceNumber = -1, byteLength, sideData) {
    this.data = data;
    this.type = type;
    this.timestamp = timestamp;
    this.duration = duration;
    this.sequenceNumber = sequenceNumber;
    if (data === PLACEHOLDER_DATA && byteLength === void 0) {
      throw new Error("Internal error: byteLength must be explicitly provided when constructing metadata-only packets.");
    }
    if (byteLength === void 0) {
      byteLength = data.byteLength;
    }
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be a Uint8Array.");
    }
    if (type !== "key" && type !== "delta") {
      throw new TypeError('type must be either "key" or "delta".');
    }
    if (!Number.isFinite(timestamp)) {
      throw new TypeError("timestamp must be a number.");
    }
    if (!Number.isFinite(duration) || duration < 0) {
      throw new TypeError("duration must be a non-negative number.");
    }
    if (!Number.isFinite(sequenceNumber)) {
      throw new TypeError("sequenceNumber must be a number.");
    }
    if (!Number.isInteger(byteLength) || byteLength < 0) {
      throw new TypeError("byteLength must be a non-negative integer.");
    }
    if (sideData !== void 0 && (typeof sideData !== "object" || !sideData)) {
      throw new TypeError("sideData, when provided, must be an object.");
    }
    if (sideData?.alpha !== void 0 && !(sideData.alpha instanceof Uint8Array)) {
      throw new TypeError("sideData.alpha, when provided, must be a Uint8Array.");
    }
    if (sideData?.alphaByteLength !== void 0 && (!Number.isInteger(sideData.alphaByteLength) || sideData.alphaByteLength < 0)) {
      throw new TypeError("sideData.alphaByteLength, when provided, must be a non-negative integer.");
    }
    this.byteLength = byteLength;
    this.sideData = sideData ?? {};
    if (this.sideData.alpha && this.sideData.alphaByteLength === void 0) {
      this.sideData.alphaByteLength = this.sideData.alpha.byteLength;
    }
  }
  /**
   * If this packet is a metadata-only packet. Metadata-only packets don't contain their packet data. They are the
   * result of retrieving packets with {@link PacketRetrievalOptions.metadataOnly} set to `true`.
   */
  get isMetadataOnly() {
    return this.data === PLACEHOLDER_DATA;
  }
  /** The timestamp of this packet in microseconds. */
  get microsecondTimestamp() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.timestamp);
  }
  /** The duration of this packet in microseconds. */
  get microsecondDuration() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.duration);
  }
  /** Converts this packet to an
   * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) for use with the
   * WebCodecs API. */
  toEncodedVideoChunk() {
    if (this.isMetadataOnly) {
      throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");
    }
    if (typeof EncodedVideoChunk === "undefined") {
      throw new Error("Your browser does not support EncodedVideoChunk.");
    }
    return new EncodedVideoChunk({
      data: this.data,
      type: this.type,
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration
    });
  }
  /**
   * Converts this packet to an
   * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) for use with the
   * WebCodecs API, using the alpha side data instead of the color data. Throws if no alpha side data is defined.
   */
  alphaToEncodedVideoChunk(type = this.type) {
    if (!this.sideData.alpha) {
      throw new TypeError("This packet does not contain alpha side data.");
    }
    if (this.isMetadataOnly) {
      throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");
    }
    if (typeof EncodedVideoChunk === "undefined") {
      throw new Error("Your browser does not support EncodedVideoChunk.");
    }
    return new EncodedVideoChunk({
      data: this.sideData.alpha,
      type,
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration
    });
  }
  /** Converts this packet to an
   * [`EncodedAudioChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedAudioChunk) for use with the
   * WebCodecs API. */
  toEncodedAudioChunk() {
    if (this.isMetadataOnly) {
      throw new TypeError("Metadata-only packets cannot be converted to an audio chunk.");
    }
    if (typeof EncodedAudioChunk === "undefined") {
      throw new Error("Your browser does not support EncodedAudioChunk.");
    }
    return new EncodedAudioChunk({
      data: this.data,
      type: this.type,
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration
    });
  }
  /**
   * Creates an {@link EncodedPacket} from an
   * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) or
   * [`EncodedAudioChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedAudioChunk). This method is useful
   * for converting chunks from the WebCodecs API to `EncodedPacket` instances.
   */
  static fromEncodedChunk(chunk, sideData) {
    if (!(chunk instanceof EncodedVideoChunk || chunk instanceof EncodedAudioChunk)) {
      throw new TypeError("chunk must be an EncodedVideoChunk or EncodedAudioChunk.");
    }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    return new _EncodedPacket(data, chunk.type, chunk.timestamp / 1e6, (chunk.duration ?? 0) / 1e6, void 0, void 0, sideData);
  }
  /** Clones this packet while optionally modifying the new packet's data. */
  clone(options) {
    if (options !== void 0 && (typeof options !== "object" || options === null)) {
      throw new TypeError("options, when provided, must be an object.");
    }
    if (options?.data !== void 0 && !(options.data instanceof Uint8Array)) {
      throw new TypeError("options.data, when provided, must be a Uint8Array.");
    }
    if (options?.type !== void 0 && options.type !== "key" && options.type !== "delta") {
      throw new TypeError('options.type, when provided, must be either "key" or "delta".');
    }
    if (options?.timestamp !== void 0 && !Number.isFinite(options.timestamp)) {
      throw new TypeError("options.timestamp, when provided, must be a number.");
    }
    if (options?.duration !== void 0 && !Number.isFinite(options.duration)) {
      throw new TypeError("options.duration, when provided, must be a number.");
    }
    if (options?.sequenceNumber !== void 0 && !Number.isFinite(options.sequenceNumber)) {
      throw new TypeError("options.sequenceNumber, when provided, must be a number.");
    }
    if (options?.sideData !== void 0 && (typeof options.sideData !== "object" || options.sideData === null)) {
      throw new TypeError("options.sideData, when provided, must be an object.");
    }
    return new _EncodedPacket(options?.data ?? this.data, options?.type ?? this.type, options?.timestamp ?? this.timestamp, options?.duration ?? this.duration, options?.sequenceNumber ?? this.sequenceNumber, this.byteLength, options?.sideData ?? this.sideData);
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/isobmff/isobmff-misc.js
var buildIsobmffMimeType = (info) => {
  const base = info.hasVideo ? "video/" : info.hasAudio ? "audio/" : "application/";
  let string = base + (info.isQuickTime ? "quicktime" : "mp4");
  if (info.codecStrings.length > 0) {
    const uniqueCodecMimeTypes = [...new Set(info.codecStrings)];
    string += `; codecs="${uniqueCodecMimeTypes.join(", ")}"`;
  }
  return string;
};
var parsePsshBoxContents = (contents) => {
  const view2 = toDataView(contents);
  let pos = 0;
  const version = view2.getUint8(pos);
  pos += 1;
  pos += 3;
  const systemId = bytesToHexString(contents.subarray(pos, pos + 16));
  pos += 16;
  let keyIds = null;
  if (version > 0) {
    const kidCount = view2.getUint32(pos);
    pos += 4;
    if (kidCount > 0) {
      keyIds = [];
      for (let i = 0; i < kidCount; i++) {
        keyIds.push(bytesToHexString(contents.subarray(pos, pos + 16)));
        pos += 16;
      }
    }
  }
  const dataSize = view2.getUint32(pos);
  pos += 4;
  return {
    systemId,
    keyIds,
    data: contents.slice(pos, pos + dataSize)
  };
};
var psshBoxesAreEqual = (a, b) => a.systemId === b.systemId && uint8ArraysAreEqual(a.data, b.data);

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/isobmff/isobmff-reader.js
var MIN_BOX_HEADER_SIZE = 8;
var MAX_BOX_HEADER_SIZE = 16;
var readBoxHeader = (slice) => {
  let totalSize = readU32Be(slice);
  const name = readAscii(slice, 4);
  let headerSize = 8;
  const hasLargeSize = totalSize === 1;
  if (hasLargeSize) {
    totalSize = readU64Be(slice);
    headerSize = 16;
  }
  const contentSize = totalSize - headerSize;
  if (contentSize < 0) {
    return null;
  }
  return { name, totalSize, headerSize, contentSize };
};
var readFixed_16_16 = (slice) => {
  return readI32Be(slice) / 65536;
};
var readFixed_2_30 = (slice) => {
  return readI32Be(slice) / 1073741824;
};
var readIsomVariableInteger = (slice) => {
  let result = 0;
  for (let i = 0; i < 4; i++) {
    result <<= 7;
    const nextByte = readU8(slice);
    result |= nextByte & 127;
    if ((nextByte & 128) === 0) {
      break;
    }
  }
  return result;
};
var readMetadataStringShort = (slice) => {
  let stringLength = readU16Be(slice);
  slice.skip(2);
  stringLength = Math.min(stringLength, slice.remainingLength);
  return textDecoder.decode(readBytes(slice, stringLength));
};
var readDataBox = (slice) => {
  const header = readBoxHeader(slice);
  if (!header || header.name !== "data") {
    return null;
  }
  if (slice.remainingLength < 8) {
    return null;
  }
  const typeIndicator = readU32Be(slice);
  slice.skip(4);
  const data = readBytes(slice, header.contentSize - 8);
  switch (typeIndicator) {
    case 1:
      return textDecoder.decode(data);
    // UTF-8
    case 2:
      return new TextDecoder("utf-16be").decode(data);
    // UTF-16-BE
    case 13:
      return new RichImageData(data, "image/jpeg");
    case 14:
      return new RichImageData(data, "image/png");
    case 27:
      return new RichImageData(data, "image/bmp");
    default:
      return data;
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/aes.js
var AES_128_BLOCK_SIZE = 16;
var Te4 = new Uint32Array(256);
var Td0 = new Uint32Array(256);
var Td1 = new Uint32Array(256);
var Td2 = new Uint32Array(256);
var Td3 = new Uint32Array(256);
var Td4 = new Uint32Array(256);
var rcon = new Uint32Array(10);
var tablesGenerated = false;
var generateAesTables = () => {
  const sbox = new Uint8Array(256);
  const log = new Uint8Array(256);
  const pow = new Uint8Array(256);
  for (let i = 0, p = 1; i < 256; i++) {
    pow[i] = p;
    log[p] = i;
    p = p ^ p << 1 ^ (p & 128 ? 283 : 0);
  }
  const mul = (a, b) => a && b ? pow[(log[a] + log[b]) % 255] : 0;
  sbox[0] = 99;
  for (let i = 1; i < 256; i++) {
    const x = pow[255 - log[i]];
    let s = x ^ x << 1 ^ x << 2 ^ x << 3 ^ x << 4;
    s = s >>> 8 ^ s & 255 ^ 99;
    sbox[i] = s;
  }
  for (let i = 0; i < 256; i++) {
    const s = sbox[i];
    const is = sbox.indexOf(i);
    Te4[i] = s << 24 | s << 16 | s << 8 | s;
    Td4[i] = is << 24 | is << 16 | is << 8 | is;
    const b0 = mul(is, 14);
    const b1 = mul(is, 9);
    const b2 = mul(is, 13);
    const b3 = mul(is, 11);
    const w = b0 << 24 | b1 << 16 | b2 << 8 | b3;
    Td0[i] = w;
    Td1[i] = w >>> 8 | w << 24;
    Td2[i] = w >>> 16 | w << 16;
    Td3[i] = w >>> 24 | w << 8;
  }
  let r = 1;
  for (let i = 0; i < 10; i++) {
    rcon[i] = r << 24;
    r = r << 1 ^ (r & 128 ? 283 : 0);
  }
  tablesGenerated = true;
};
var Aes128CbcContext = class {
  constructor() {
    this.roundkey = new Uint32Array(44);
    this.iv = new Uint32Array(AES_128_BLOCK_SIZE / Uint32Array.BYTES_PER_ELEMENT);
    this.in = new Uint8Array(AES_128_BLOCK_SIZE);
    this.out = new Uint8Array(AES_128_BLOCK_SIZE);
    this.inView = new DataView(this.in.buffer);
    this.outView = new DataView(this.out.buffer);
  }
  init({ key, iv }) {
    assert(key.byteLength === 16);
    assert(iv.byteLength === 16);
    if (!tablesGenerated) {
      generateAesTables();
    }
    const keyView = new DataView(key.buffer, key.byteOffset, key.byteLength);
    const ivView = new DataView(iv.buffer, iv.byteOffset, iv.byteLength);
    this.roundkey[0] = keyView.getUint32(0, false);
    this.roundkey[1] = keyView.getUint32(4, false);
    this.roundkey[2] = keyView.getUint32(8, false);
    this.roundkey[3] = keyView.getUint32(12, false);
    this.iv[0] = ivView.getUint32(0, false);
    this.iv[1] = ivView.getUint32(4, false);
    this.iv[2] = ivView.getUint32(8, false);
    this.iv[3] = ivView.getUint32(12, false);
    for (let index = 4; index < 44; index += 4) {
      const temp = this.roundkey[index - 1];
      this.roundkey[index] = this.roundkey[index - 4] ^ Te4[temp >>> 16 & 255] & 4278190080 ^ Te4[temp >>> 8 & 255] & 16711680 ^ Te4[temp >>> 0 & 255] & 65280 ^ Te4[temp >>> 24 & 255] & 255 ^ rcon[index / 4 - 1];
      this.roundkey[index + 1] = this.roundkey[index - 3] ^ this.roundkey[index];
      this.roundkey[index + 2] = this.roundkey[index - 2] ^ this.roundkey[index + 1];
      this.roundkey[index + 3] = this.roundkey[index - 1] ^ this.roundkey[index + 2];
    }
    for (let i = 0, j = 40; i < j; i += 4, j -= 4) {
      for (let k = 0; k < 4; k++) {
        const temp = this.roundkey[i + k];
        this.roundkey[i + k] = this.roundkey[j + k];
        this.roundkey[j + k] = temp;
      }
    }
    for (let index = 4; index < 40; index += 4) {
      for (let k = 0; k < 4; k++) {
        const rk = this.roundkey[index + k];
        this.roundkey[index + k] = Td0[Te4[rk >>> 24 & 255] & 255] ^ Td1[Te4[rk >>> 16 & 255] & 255] ^ Td2[Te4[rk >>> 8 & 255] & 255] ^ Td3[Te4[rk >>> 0 & 255] & 255];
      }
    }
  }
  decrypt() {
    let s0 = this.inView.getUint32(0, false) ^ this.roundkey[0];
    let s1 = this.inView.getUint32(4, false) ^ this.roundkey[1];
    let s2 = this.inView.getUint32(8, false) ^ this.roundkey[2];
    let s3 = this.inView.getUint32(12, false) ^ this.roundkey[3];
    const temp0 = this.inView.getUint32(0, false);
    const temp1 = this.inView.getUint32(4, false);
    const temp2 = this.inView.getUint32(8, false);
    const temp3 = this.inView.getUint32(12, false);
    let t0, t1, t2, t3;
    for (let round = 1; round < 10; round++) {
      const offset = round * 4;
      t0 = Td0[s0 >>> 24] ^ Td1[s3 >>> 16 & 255] ^ Td2[s2 >>> 8 & 255] ^ Td3[s1 & 255] ^ this.roundkey[offset];
      t1 = Td0[s1 >>> 24] ^ Td1[s0 >>> 16 & 255] ^ Td2[s3 >>> 8 & 255] ^ Td3[s2 & 255] ^ this.roundkey[offset + 1];
      t2 = Td0[s2 >>> 24] ^ Td1[s1 >>> 16 & 255] ^ Td2[s0 >>> 8 & 255] ^ Td3[s3 & 255] ^ this.roundkey[offset + 2];
      t3 = Td0[s3 >>> 24] ^ Td1[s2 >>> 16 & 255] ^ Td2[s1 >>> 8 & 255] ^ Td3[s0 & 255] ^ this.roundkey[offset + 3];
      s0 = t0;
      s1 = t1;
      s2 = t2;
      s3 = t3;
    }
    const f0 = Td4[s0 >>> 24 & 255] & 4278190080 ^ Td4[s3 >>> 16 & 255] & 16711680 ^ Td4[s2 >>> 8 & 255] & 65280 ^ Td4[s1 >>> 0 & 255] & 255 ^ this.roundkey[40];
    const f1 = Td4[s1 >>> 24 & 255] & 4278190080 ^ Td4[s0 >>> 16 & 255] & 16711680 ^ Td4[s3 >>> 8 & 255] & 65280 ^ Td4[s2 >>> 0 & 255] & 255 ^ this.roundkey[41];
    const f2 = Td4[s2 >>> 24 & 255] & 4278190080 ^ Td4[s1 >>> 16 & 255] & 16711680 ^ Td4[s0 >>> 8 & 255] & 65280 ^ Td4[s3 >>> 0 & 255] & 255 ^ this.roundkey[42];
    const f3 = Td4[s3 >>> 24 & 255] & 4278190080 ^ Td4[s2 >>> 16 & 255] & 16711680 ^ Td4[s1 >>> 8 & 255] & 65280 ^ Td4[s0 >>> 0 & 255] & 255 ^ this.roundkey[43];
    this.outView.setUint32(0, f0 ^ this.iv[0], false);
    this.outView.setUint32(4, f1 ^ this.iv[1], false);
    this.outView.setUint32(8, f2 ^ this.iv[2], false);
    this.outView.setUint32(12, f3 ^ this.iv[3], false);
    this.iv[0] = temp0;
    this.iv[1] = temp1;
    this.iv[2] = temp2;
    this.iv[3] = temp3;
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/isobmff/isobmff-demuxer.js
var IsobmffDemuxer = class _IsobmffDemuxer extends Demuxer {
  constructor(input) {
    super(input);
    this.moovSlice = null;
    this.currentTrack = null;
    this.tracks = [];
    this.metadataPromise = null;
    this.movieTimescale = -1;
    this.movieDurationInTimescale = -1;
    this.isQuickTime = false;
    this.metadataTags = {};
    this.currentMetadataKeys = null;
    this.isFragmented = false;
    this.fragmentTrackDefaults = [];
    this.psshBoxes = [];
    this.currentFragment = null;
    this.lastReadFragment = null;
    this.decryptionKeyCache = /* @__PURE__ */ new Map();
    this.reader = input._reader;
  }
  async getTrackBackings() {
    await this.readMetadata();
    return this.tracks.map((track) => track.trackBacking);
  }
  async getMimeType() {
    await this.readMetadata();
    const backings = await this.getTrackBackings();
    const codecStrings = await Promise.all(backings.map((x) => x.getDecoderConfig().then((c) => c?.codec ?? null)));
    return buildIsobmffMimeType({
      isQuickTime: this.isQuickTime,
      hasVideo: this.tracks.some((x) => x.info?.type === "video"),
      hasAudio: this.tracks.some((x) => x.info?.type === "audio"),
      codecStrings: codecStrings.filter(Boolean)
    });
  }
  async getMetadataTags() {
    await this.readMetadata();
    return this.metadataTags;
  }
  readMetadata() {
    return this.metadataPromise ??= (async () => {
      let currentPos = 0;
      let lookForMfraBox = false;
      while (true) {
        let slice = this.reader.requestSliceRange(currentPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
        if (slice instanceof Promise)
          slice = await slice;
        if (!slice)
          break;
        const startPos = currentPos;
        const boxInfo = readBoxHeader(slice);
        if (!boxInfo) {
          break;
        }
        if (boxInfo.name === "ftyp" || boxInfo.name === "styp") {
          const majorBrand = readAscii(slice, 4);
          this.isQuickTime = majorBrand === "qt  ";
        } else if (boxInfo.name === "moov") {
          let moovSlice = this.reader.requestSlice(slice.filePos, boxInfo.contentSize);
          if (moovSlice instanceof Promise)
            moovSlice = await moovSlice;
          if (!moovSlice)
            break;
          this.moovSlice = moovSlice;
          this.readContiguousBoxes(this.moovSlice);
          for (const track of this.tracks) {
            const previousSegmentDurationsInSeconds = track.editListPreviousSegmentDurations / this.movieTimescale;
            track.editListOffset -= Math.round(previousSegmentDurationsInSeconds * track.timescale);
          }
          lookForMfraBox = this.isFragmented && this.reader.fileSize !== null && this.reader.fileSize > startPos + boxInfo.totalSize;
          break;
        } else if (boxInfo.name === "moof") {
          if (!this.input._initInput) {
            throw new Error('"moof" box encountered with no "moov" box present; this file is likely a Segment as described in ISO/IEC 14496-12 Section 8.16. A separate init file that contains a "moov" box is required to read this file, please provide it using InputOptions.initInput.');
          }
          const initDemuxer = await this.input._initInput._getDemuxer();
          if (initDemuxer.constructor !== _IsobmffDemuxer) {
            throw new Error("Init input must match the input's format.");
          }
          await initDemuxer.readMetadata();
          this.movieTimescale = initDemuxer.movieTimescale;
          this.movieDurationInTimescale = initDemuxer.movieDurationInTimescale;
          this.metadataTags = initDemuxer.metadataTags;
          this.isFragmented = true;
          this.fragmentTrackDefaults = initDemuxer.fragmentTrackDefaults;
          this.psshBoxes = initDemuxer.psshBoxes;
          for (const foreignTrack of initDemuxer.tracks) {
            const track = {
              id: foreignTrack.id,
              demuxer: this,
              trackBacking: null,
              disposition: foreignTrack.disposition,
              timescale: foreignTrack.timescale,
              durationInMediaTimescale: foreignTrack.durationInMediaTimescale,
              durationInMovieTimescale: foreignTrack.durationInMovieTimescale,
              rotation: foreignTrack.rotation,
              internalCodecId: foreignTrack.internalCodecId,
              name: foreignTrack.name,
              languageCode: foreignTrack.languageCode,
              sampleTableByteOffset: null,
              sampleTable: null,
              fragmentLookupTable: [],
              currentFragmentState: null,
              fragmentPositionCache: [],
              editListPreviousSegmentDurations: foreignTrack.editListPreviousSegmentDurations,
              editListOffset: foreignTrack.editListOffset,
              encryptionInfo: foreignTrack.encryptionInfo,
              encryptionAuxInfo: null,
              frmaCodecString: null,
              info: foreignTrack.info
            };
            if (foreignTrack.trackBacking) {
              assert(track.info);
              if (track.info.type === "video" && track.info.width !== -1) {
                const videoTrack = track;
                track.trackBacking = new IsobmffVideoTrackBacking(videoTrack);
                this.tracks.push(track);
              } else if (track.info.type === "audio" && track.info.numberOfChannels !== -1) {
                const audioTrack = track;
                track.trackBacking = new IsobmffAudioTrackBacking(audioTrack);
                this.tracks.push(track);
              }
            } else {
            }
          }
          lookForMfraBox = false;
          break;
        }
        currentPos = startPos + boxInfo.totalSize;
      }
      if (lookForMfraBox) {
        assert(this.reader.fileSize !== null);
        let lastWordSlice = this.reader.requestSlice(this.reader.fileSize - 4, 4);
        if (lastWordSlice instanceof Promise)
          lastWordSlice = await lastWordSlice;
        assert(lastWordSlice);
        const lastWord = readU32Be(lastWordSlice);
        const potentialMfraPos = this.reader.fileSize - lastWord;
        if (potentialMfraPos >= 0 && potentialMfraPos <= this.reader.fileSize - MAX_BOX_HEADER_SIZE) {
          let mfraHeaderSlice = this.reader.requestSliceRange(potentialMfraPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
          if (mfraHeaderSlice instanceof Promise)
            mfraHeaderSlice = await mfraHeaderSlice;
          if (mfraHeaderSlice) {
            const boxInfo = readBoxHeader(mfraHeaderSlice);
            if (boxInfo && boxInfo.name === "mfra") {
              let mfraSlice = this.reader.requestSlice(mfraHeaderSlice.filePos, boxInfo.contentSize);
              if (mfraSlice instanceof Promise)
                mfraSlice = await mfraSlice;
              if (mfraSlice) {
                this.readContiguousBoxes(mfraSlice);
              }
            }
          }
        }
      }
    })();
  }
  getSampleTableForTrack(internalTrack) {
    if (internalTrack.sampleTable) {
      return internalTrack.sampleTable;
    }
    const sampleTable = {
      sampleTimingEntries: [],
      sampleCompositionTimeOffsets: [],
      sampleSizes: [],
      keySampleIndices: null,
      chunkOffsets: [],
      sampleToChunk: [],
      presentationTimestamps: null,
      presentationTimestampIndexMap: null
    };
    internalTrack.sampleTable = sampleTable;
    if (internalTrack.sampleTableByteOffset === null) {
      return sampleTable;
    }
    assert(this.moovSlice);
    const stblContainerSlice = this.moovSlice.slice(internalTrack.sampleTableByteOffset);
    this.currentTrack = internalTrack;
    this.traverseBox(stblContainerSlice);
    this.currentTrack = null;
    const isPcmCodec = internalTrack.info?.type === "audio" && internalTrack.info.codec && PCM_AUDIO_CODECS.includes(internalTrack.info.codec);
    if (isPcmCodec && sampleTable.sampleCompositionTimeOffsets.length === 0) {
      assert(internalTrack.info?.type === "audio");
      const pcmInfo = parsePcmCodec(internalTrack.info.codec);
      const newSampleTimingEntries = [];
      const newSampleSizes = [];
      for (let i = 0; i < sampleTable.sampleToChunk.length; i++) {
        const chunkEntry = sampleTable.sampleToChunk[i];
        const nextEntry = sampleTable.sampleToChunk[i + 1];
        const chunkCount = (nextEntry ? nextEntry.startChunkIndex : sampleTable.chunkOffsets.length) - chunkEntry.startChunkIndex;
        for (let j = 0; j < chunkCount; j++) {
          const startSampleIndex = chunkEntry.startSampleIndex + j * chunkEntry.samplesPerChunk;
          const endSampleIndex = startSampleIndex + chunkEntry.samplesPerChunk;
          const startTimingEntryIndex = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, startSampleIndex, (x) => x.startIndex);
          const startTimingEntry = sampleTable.sampleTimingEntries[startTimingEntryIndex];
          const endTimingEntryIndex = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, endSampleIndex, (x) => x.startIndex);
          const endTimingEntry = sampleTable.sampleTimingEntries[endTimingEntryIndex];
          const firstSampleTimestamp = startTimingEntry.startDecodeTimestamp + (startSampleIndex - startTimingEntry.startIndex) * startTimingEntry.delta;
          const lastSampleTimestamp = endTimingEntry.startDecodeTimestamp + (endSampleIndex - endTimingEntry.startIndex) * endTimingEntry.delta;
          const delta = lastSampleTimestamp - firstSampleTimestamp;
          const lastSampleTimingEntry = last(newSampleTimingEntries);
          if (lastSampleTimingEntry && lastSampleTimingEntry.delta === delta) {
            lastSampleTimingEntry.count++;
          } else {
            newSampleTimingEntries.push({
              startIndex: chunkEntry.startChunkIndex + j,
              startDecodeTimestamp: firstSampleTimestamp,
              count: 1,
              delta
            });
          }
          const chunkSize = chunkEntry.samplesPerChunk * pcmInfo.sampleSize * internalTrack.info.numberOfChannels;
          newSampleSizes.push(chunkSize);
        }
        chunkEntry.startSampleIndex = chunkEntry.startChunkIndex;
        chunkEntry.samplesPerChunk = 1;
      }
      sampleTable.sampleTimingEntries = newSampleTimingEntries;
      sampleTable.sampleSizes = newSampleSizes;
    }
    if (sampleTable.sampleCompositionTimeOffsets.length > 0) {
      sampleTable.presentationTimestamps = [];
      for (const entry of sampleTable.sampleTimingEntries) {
        for (let i = 0; i < entry.count; i++) {
          sampleTable.presentationTimestamps.push({
            presentationTimestamp: entry.startDecodeTimestamp + i * entry.delta,
            sampleIndex: entry.startIndex + i
          });
        }
      }
      for (const entry of sampleTable.sampleCompositionTimeOffsets) {
        for (let i = 0; i < entry.count; i++) {
          const sampleIndex = entry.startIndex + i;
          const sample = sampleTable.presentationTimestamps[sampleIndex];
          if (!sample) {
            continue;
          }
          sample.presentationTimestamp += entry.offset;
        }
      }
      sampleTable.presentationTimestamps.sort((a, b) => a.presentationTimestamp - b.presentationTimestamp);
      sampleTable.presentationTimestampIndexMap = Array(sampleTable.presentationTimestamps.length).fill(-1);
      for (let i = 0; i < sampleTable.presentationTimestamps.length; i++) {
        sampleTable.presentationTimestampIndexMap[sampleTable.presentationTimestamps[i].sampleIndex] = i;
      }
    } else {
    }
    return sampleTable;
  }
  async readFragment(startPos) {
    if (this.lastReadFragment?.moofOffset === startPos) {
      return this.lastReadFragment;
    }
    let headerSlice = this.reader.requestSliceRange(startPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
    if (headerSlice instanceof Promise)
      headerSlice = await headerSlice;
    assert(headerSlice);
    const moofBoxInfo = readBoxHeader(headerSlice);
    assert(moofBoxInfo?.name === "moof");
    let entireSlice = this.reader.requestSlice(startPos, moofBoxInfo.totalSize);
    if (entireSlice instanceof Promise)
      entireSlice = await entireSlice;
    assert(entireSlice);
    this.traverseBox(entireSlice);
    const fragment = this.lastReadFragment;
    assert(fragment && fragment.moofOffset === startPos);
    for (const [, trackData] of fragment.trackData) {
      const track = trackData.track;
      const { fragmentPositionCache } = track;
      if (!trackData.startTimestampIsFinal) {
        const lookupEntry = track.fragmentLookupTable.find((x) => x.moofOffset === fragment.moofOffset);
        if (lookupEntry) {
          offsetFragmentTrackDataByTimestamp(trackData, lookupEntry.timestamp);
        } else {
          const lastCacheIndex = binarySearchLessOrEqual(fragmentPositionCache, fragment.moofOffset - 1, (x) => x.moofOffset);
          if (lastCacheIndex !== -1) {
            const lastCache = fragmentPositionCache[lastCacheIndex];
            offsetFragmentTrackDataByTimestamp(trackData, lastCache.endTimestamp);
          } else {
          }
        }
        trackData.startTimestampIsFinal = true;
      }
      const insertionIndex = binarySearchLessOrEqual(fragmentPositionCache, trackData.startTimestamp, (x) => x.startTimestamp);
      if (insertionIndex === -1 || fragmentPositionCache[insertionIndex].moofOffset !== fragment.moofOffset) {
        fragmentPositionCache.splice(insertionIndex + 1, 0, {
          moofOffset: fragment.moofOffset,
          startTimestamp: trackData.startTimestamp,
          endTimestamp: trackData.endTimestamp
        });
      }
      if (trackData.encryptionAuxInfo && track.encryptionInfo) {
        const entries = await resolveEncryptionAuxInfo(this.reader, track.encryptionInfo, trackData.encryptionAuxInfo);
        for (let i = 0; i < Math.min(trackData.samples.length, entries.length); i++) {
          const entry = entries[i];
          trackData.samples[i].encryption = entry;
        }
      }
    }
    return fragment;
  }
  readContiguousBoxes(slice) {
    const startIndex = slice.filePos;
    while (slice.filePos - startIndex <= slice.length - MIN_BOX_HEADER_SIZE) {
      const foundBox = this.traverseBox(slice);
      if (!foundBox) {
        break;
      }
    }
  }
  // eslint-disable-next-line @stylistic/generator-star-spacing
  *iterateContiguousBoxes(slice) {
    const startIndex = slice.filePos;
    while (slice.filePos - startIndex <= slice.length - MIN_BOX_HEADER_SIZE) {
      const startPos = slice.filePos;
      const boxInfo = readBoxHeader(slice);
      if (!boxInfo) {
        break;
      }
      yield { boxInfo, slice };
      slice.filePos = startPos + boxInfo.totalSize;
    }
  }
  traverseBox(slice) {
    const startPos = slice.filePos;
    const boxInfo = readBoxHeader(slice);
    if (!boxInfo) {
      return false;
    }
    const contentStartPos = slice.filePos;
    const boxEndPos = startPos + boxInfo.totalSize;
    switch (boxInfo.name) {
      case "mdia":
      case "minf":
      case "dinf":
      case "mfra":
      case "edts":
      case "sinf":
      case "schi":
        {
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
        }
        ;
        break;
      case "mvhd":
        {
          const version = readU8(slice);
          slice.skip(3);
          if (version === 1) {
            slice.skip(8 + 8);
            this.movieTimescale = readU32Be(slice);
            this.movieDurationInTimescale = readU64Be(slice);
          } else {
            slice.skip(4 + 4);
            this.movieTimescale = readU32Be(slice);
            this.movieDurationInTimescale = readU32Be(slice);
          }
        }
        ;
        break;
      case "trak":
        {
          const track = {
            id: -1,
            demuxer: this,
            trackBacking: null,
            disposition: {
              ...DEFAULT_TRACK_DISPOSITION,
              primary: false
            },
            info: null,
            timescale: -1,
            durationInMovieTimescale: -1,
            durationInMediaTimescale: -1,
            rotation: 0,
            internalCodecId: null,
            name: null,
            languageCode: UNDETERMINED_LANGUAGE,
            sampleTableByteOffset: -1,
            sampleTable: null,
            fragmentLookupTable: [],
            currentFragmentState: null,
            fragmentPositionCache: [],
            editListPreviousSegmentDurations: 0,
            editListOffset: 0,
            encryptionInfo: null,
            encryptionAuxInfo: null,
            frmaCodecString: null
          };
          this.currentTrack = track;
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          if (track.id !== -1 && track.timescale !== -1 && track.info !== null) {
            if (track.info.type === "video" && track.info.width !== -1) {
              const videoTrack = track;
              track.trackBacking = new IsobmffVideoTrackBacking(videoTrack);
              this.tracks.push(track);
            } else if (track.info.type === "audio" && track.info.numberOfChannels !== -1) {
              const audioTrack = track;
              track.trackBacking = new IsobmffAudioTrackBacking(audioTrack);
              this.tracks.push(track);
            }
          }
          this.currentTrack = null;
        }
        ;
        break;
      case "tkhd":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          const version = readU8(slice);
          const flags = readU24Be(slice);
          const trackEnabled = !!(flags & 1);
          track.disposition.default = trackEnabled;
          if (version === 0) {
            slice.skip(8);
            track.id = readU32Be(slice);
            slice.skip(4);
            track.durationInMovieTimescale = readU32Be(slice);
          } else if (version === 1) {
            slice.skip(16);
            track.id = readU32Be(slice);
            slice.skip(4);
            track.durationInMovieTimescale = readU64Be(slice);
          } else {
            throw new Error(`Incorrect track header version ${version}.`);
          }
          slice.skip(2 * 4 + 2 + 2 + 2 + 2);
          const matrix = [
            readFixed_16_16(slice),
            readFixed_16_16(slice),
            readFixed_2_30(slice),
            readFixed_16_16(slice),
            readFixed_16_16(slice),
            readFixed_2_30(slice),
            readFixed_16_16(slice),
            readFixed_16_16(slice),
            readFixed_2_30(slice)
          ];
          const rotation = normalizeRotation(roundToMultiple(extractRotationFromMatrix(matrix), 90));
          assert(rotation === 0 || rotation === 90 || rotation === 180 || rotation === 270);
          track.rotation = rotation;
        }
        ;
        break;
      case "elst":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          const version = readU8(slice);
          slice.skip(3);
          let relevantEntryFound = false;
          let previousSegmentDurations = 0;
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const segmentDuration = version === 1 ? readU64Be(slice) : readU32Be(slice);
            const mediaTime = version === 1 ? readI64Be(slice) : readI32Be(slice);
            const mediaRate = readFixed_16_16(slice);
            if (segmentDuration === 0) {
              continue;
            }
            if (relevantEntryFound) {
              console.warn("Unsupported edit list: multiple edits are not currently supported. Only using first edit.");
              break;
            }
            if (mediaTime === -1) {
              previousSegmentDurations += segmentDuration;
              continue;
            }
            if (mediaRate !== 1) {
              console.warn("Unsupported edit list entry: media rate must be 1.");
              break;
            }
            track.editListPreviousSegmentDurations = previousSegmentDurations;
            track.editListOffset = mediaTime;
            relevantEntryFound = true;
          }
        }
        ;
        break;
      case "mdhd":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          const version = readU8(slice);
          slice.skip(3);
          if (version === 0) {
            slice.skip(8);
            track.timescale = readU32Be(slice);
            track.durationInMediaTimescale = readU32Be(slice);
          } else if (version === 1) {
            slice.skip(16);
            track.timescale = readU32Be(slice);
            track.durationInMediaTimescale = readU64Be(slice);
          }
          let language = readU16Be(slice);
          if (language > 0) {
            track.languageCode = "";
            for (let i = 0; i < 3; i++) {
              track.languageCode = String.fromCharCode(96 + (language & 31)) + track.languageCode;
              language >>= 5;
            }
            if (!isIso639Dash2LanguageCode(track.languageCode)) {
              track.languageCode = UNDETERMINED_LANGUAGE;
            }
          }
        }
        ;
        break;
      case "hdlr":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          slice.skip(8);
          const handlerType = readAscii(slice, 4);
          if (handlerType === "vide") {
            track.info = {
              type: "video",
              width: -1,
              height: -1,
              squarePixelWidth: -1,
              squarePixelHeight: -1,
              codec: null,
              codecDescription: null,
              colorSpace: null,
              avcType: null,
              avcCodecInfo: null,
              hevcCodecInfo: null,
              vp9CodecInfo: null,
              av1CodecInfo: null
            };
          } else if (handlerType === "soun") {
            track.info = {
              type: "audio",
              numberOfChannels: -1,
              sampleRate: -1,
              codec: null,
              codecDescription: null,
              aacCodecInfo: null,
              pcmLittleEndian: false,
              pcmSampleSize: null
            };
          }
        }
        ;
        break;
      case "stbl":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          track.sampleTableByteOffset = startPos;
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
        }
        ;
        break;
      case "stsd":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (track.info === null || track.sampleTable) {
            break;
          }
          const stsdVersion = readU8(slice);
          slice.skip(3);
          const entries = readU32Be(slice);
          for (let i = 0; i < entries; i++) {
            const sampleBoxStartPos = slice.filePos;
            const sampleBoxInfo = readBoxHeader(slice);
            if (!sampleBoxInfo) {
              break;
            }
            track.internalCodecId = sampleBoxInfo.name;
            const lowercaseBoxName = sampleBoxInfo.name.toLowerCase();
            if (track.info.type === "video") {
              slice.skip(6 * 1 + 2 + 2 + 2 + 3 * 4);
              track.info.width = readU16Be(slice);
              track.info.height = readU16Be(slice);
              track.info.squarePixelWidth = track.info.width;
              track.info.squarePixelHeight = track.info.height;
              slice.skip(4 + 4 + 4 + 2 + 32 + 2 + 2);
              track.frmaCodecString = null;
              this.readContiguousBoxes(slice.slice(slice.filePos, sampleBoxStartPos + sampleBoxInfo.totalSize - slice.filePos));
              const codecName = lowercaseBoxName === "encv" ? track.frmaCodecString : lowercaseBoxName;
              track.frmaCodecString = null;
              if (codecName === "avc1" || codecName === "avc3") {
                track.info.codec = "avc";
                track.info.avcType = codecName === "avc1" ? 1 : 3;
              } else if (codecName === "hvc1" || codecName === "hev1") {
                track.info.codec = "hevc";
              } else if (codecName === "vp08") {
                track.info.codec = "vp8";
              } else if (codecName === "vp09") {
                track.info.codec = "vp9";
              } else if (codecName === "av01") {
                track.info.codec = "av1";
              } else if (codecName === null) {
                console.warn(`Unknown encrypted video codec due to missing frma box.`);
              } else {
                console.warn(`Unsupported video codec (sample entry type '${sampleBoxInfo.name}').`);
              }
            } else {
              slice.skip(6 * 1 + 2);
              const version = readU16Be(slice);
              slice.skip(3 * 2);
              let channelCount = readU16Be(slice);
              let sampleSize = readU16Be(slice);
              slice.skip(2 * 2);
              let sampleRate = readU32Be(slice) / 65536;
              let lpcmFlags = null;
              if (stsdVersion === 0 && version > 0) {
                if (version === 1) {
                  slice.skip(4);
                  sampleSize = 8 * readU32Be(slice);
                  slice.skip(2 * 4);
                } else if (version === 2) {
                  slice.skip(4);
                  sampleRate = readF64Be(slice);
                  channelCount = readU32Be(slice);
                  slice.skip(4);
                  sampleSize = readU32Be(slice);
                  lpcmFlags = readU32Be(slice);
                  slice.skip(2 * 4);
                }
              }
              track.info.numberOfChannels = channelCount;
              track.info.sampleRate = sampleRate;
              track.frmaCodecString = null;
              this.readContiguousBoxes(slice.slice(slice.filePos, sampleBoxStartPos + sampleBoxInfo.totalSize - slice.filePos));
              const codecName = lowercaseBoxName === "enca" ? track.frmaCodecString : lowercaseBoxName;
              track.frmaCodecString = null;
              if (codecName === "mp4a") {
              } else if (codecName === "opus") {
                track.info.codec = "opus";
                track.info.sampleRate = OPUS_SAMPLE_RATE;
              } else if (codecName === "flac") {
                track.info.codec = "flac";
              } else if (codecName === "ulaw") {
                track.info.codec = "ulaw";
              } else if (codecName === "alaw") {
                track.info.codec = "alaw";
              } else if (codecName === "ac-3") {
                track.info.codec = "ac3";
              } else if (codecName === "ec-3") {
                track.info.codec = "eac3";
              } else if (codecName === "twos") {
                if (sampleSize === 8) {
                  track.info.codec = "pcm-s8";
                } else if (sampleSize === 16) {
                  track.info.codec = track.info.pcmLittleEndian ? "pcm-s16" : "pcm-s16be";
                } else {
                  console.warn(`Unsupported sample size ${sampleSize} for codec 'twos'.`);
                  track.info.codec = null;
                }
              } else if (codecName === "sowt") {
                if (sampleSize === 8) {
                  track.info.codec = "pcm-s8";
                } else if (sampleSize === 16) {
                  track.info.codec = "pcm-s16";
                } else {
                  console.warn(`Unsupported sample size ${sampleSize} for codec 'sowt'.`);
                  track.info.codec = null;
                }
              } else if (codecName === "raw ") {
                track.info.codec = "pcm-u8";
              } else if (codecName === "in24") {
                track.info.codec = track.info.pcmLittleEndian ? "pcm-s24" : "pcm-s24be";
              } else if (codecName === "in32") {
                track.info.codec = track.info.pcmLittleEndian ? "pcm-s32" : "pcm-s32be";
              } else if (codecName === "fl32") {
                track.info.codec = track.info.pcmLittleEndian ? "pcm-f32" : "pcm-f32be";
              } else if (codecName === "fl64") {
                track.info.codec = track.info.pcmLittleEndian ? "pcm-f64" : "pcm-f64be";
              } else if (codecName === "ipcm") {
                const pcmSampleSize = track.info.pcmSampleSize;
                if (track.info.pcmLittleEndian) {
                  if (pcmSampleSize === 16) {
                    track.info.codec = "pcm-s16";
                  } else if (pcmSampleSize === 24) {
                    track.info.codec = "pcm-s24";
                  } else if (pcmSampleSize === 32) {
                    track.info.codec = "pcm-s32";
                  } else {
                    console.warn(`Invalid ipcm sample size ${pcmSampleSize}.`);
                    track.info.codec = null;
                  }
                } else {
                  if (pcmSampleSize === 16) {
                    track.info.codec = "pcm-s16be";
                  } else if (pcmSampleSize === 24) {
                    track.info.codec = "pcm-s24be";
                  } else if (pcmSampleSize === 32) {
                    track.info.codec = "pcm-s32be";
                  } else {
                    console.warn(`Invalid ipcm sample size ${pcmSampleSize}.`);
                    track.info.codec = null;
                  }
                }
              } else if (codecName === "fpcm") {
                const pcmSampleSize = track.info.pcmSampleSize;
                if (track.info.pcmLittleEndian) {
                  if (pcmSampleSize === 32) {
                    track.info.codec = "pcm-f32";
                  } else if (pcmSampleSize === 64) {
                    track.info.codec = "pcm-f64";
                  } else {
                    console.warn(`Invalid fpcm sample size ${pcmSampleSize}.`);
                    track.info.codec = null;
                  }
                } else {
                  if (pcmSampleSize === 32) {
                    track.info.codec = "pcm-f32be";
                  } else if (pcmSampleSize === 64) {
                    track.info.codec = "pcm-f64be";
                  } else {
                    console.warn(`Invalid fpcm sample size ${pcmSampleSize}.`);
                    track.info.codec = null;
                  }
                }
              } else if (codecName === "lpcm" && lpcmFlags !== null) {
                const bytesPerSample = sampleSize + 7 >> 3;
                const isFloat = Boolean(lpcmFlags & 1);
                const isBigEndian = Boolean(lpcmFlags & 2);
                const sFlags = lpcmFlags & 4 ? -1 : 0;
                if (sampleSize > 0 && sampleSize <= 64) {
                  if (isFloat) {
                    if (sampleSize === 32) {
                      track.info.codec = isBigEndian ? "pcm-f32be" : "pcm-f32";
                    }
                  } else {
                    if (sFlags & 1 << bytesPerSample - 1) {
                      if (bytesPerSample === 1) {
                        track.info.codec = "pcm-s8";
                      } else if (bytesPerSample === 2) {
                        track.info.codec = isBigEndian ? "pcm-s16be" : "pcm-s16";
                      } else if (bytesPerSample === 3) {
                        track.info.codec = isBigEndian ? "pcm-s24be" : "pcm-s24";
                      } else if (bytesPerSample === 4) {
                        track.info.codec = isBigEndian ? "pcm-s32be" : "pcm-s32";
                      }
                    } else {
                      if (bytesPerSample === 1) {
                        track.info.codec = "pcm-u8";
                      }
                    }
                  }
                }
                if (track.info.codec === null) {
                  console.warn("Unsupported PCM format.");
                }
              } else if (codecName === null) {
                console.warn(`Unknown encrypted audio codec due to missing frma box.`);
              } else {
                console.warn(`Unsupported audio codec (sample entry type '${sampleBoxInfo.name}').`);
              }
            }
            slice.filePos = sampleBoxStartPos + sampleBoxInfo.totalSize;
          }
        }
        ;
        break;
      case "frma":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          const format = readAscii(slice, 4);
          const lowercase = format.toLowerCase();
          track.frmaCodecString = lowercase;
        }
        ;
        break;
      case "schm":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          slice.skip(4);
          const schemeType = readAscii(slice, 4);
          if (schemeType === "cenc" || schemeType === "cens" || schemeType === "cbcs") {
            track.encryptionInfo = {
              scheme: schemeType,
              defaultKid: null,
              defaultIsProtected: null,
              defaultPerSampleIvSize: null,
              defaultConstantIv: null,
              defaultCryptByteBlock: null,
              defaultSkipByteBlock: null
            };
          } else {
            console.warn(`Unsupported encryption scheme '${schemeType}'.`);
          }
        }
        ;
        break;
      case "tenc":
        {
          const track = this.currentTrack;
          if (!track || !track.encryptionInfo) {
            break;
          }
          const version = readU8(slice);
          slice.skip(3);
          slice.skip(1);
          const patternByte = readU8(slice);
          if (version > 0) {
            track.encryptionInfo.defaultCryptByteBlock = patternByte >> 4;
            track.encryptionInfo.defaultSkipByteBlock = patternByte & 15;
          } else {
            track.encryptionInfo.defaultCryptByteBlock = 0;
            track.encryptionInfo.defaultSkipByteBlock = 0;
          }
          track.encryptionInfo.defaultIsProtected = readU8(slice) !== 0;
          track.encryptionInfo.defaultPerSampleIvSize = readU8(slice);
          track.encryptionInfo.defaultKid = bytesToHexString(readBytes(slice, 16));
          if (track.encryptionInfo.defaultIsProtected && track.encryptionInfo.defaultPerSampleIvSize === 0) {
            const constantIvSize = readU8(slice);
            const constantIv = new Uint8Array(16);
            constantIv.set(readBytes(slice, constantIvSize), 0);
            track.encryptionInfo.defaultConstantIv = constantIv;
          }
        }
        ;
        break;
      case "avcC":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info);
          track.info.codecDescription = readBytes(slice, boxInfo.contentSize);
        }
        ;
        break;
      case "hvcC":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info);
          track.info.codecDescription = readBytes(slice, boxInfo.contentSize);
        }
        ;
        break;
      case "vpcC":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "video");
          slice.skip(4);
          const profile = readU8(slice);
          const level = readU8(slice);
          const thirdByte = readU8(slice);
          const bitDepth = thirdByte >> 4;
          const chromaSubsampling = thirdByte >> 1 & 7;
          const videoFullRangeFlag = thirdByte & 1;
          const colourPrimaries = readU8(slice);
          const transferCharacteristics = readU8(slice);
          const matrixCoefficients = readU8(slice);
          track.info.vp9CodecInfo = {
            profile,
            level,
            bitDepth,
            chromaSubsampling,
            videoFullRangeFlag,
            colourPrimaries,
            transferCharacteristics,
            matrixCoefficients
          };
        }
        ;
        break;
      case "av1C":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "video");
          slice.skip(1);
          const secondByte = readU8(slice);
          const profile = secondByte >> 5;
          const level = secondByte & 31;
          const thirdByte = readU8(slice);
          const tier = thirdByte >> 7;
          const highBitDepth = thirdByte >> 6 & 1;
          const twelveBit = thirdByte >> 5 & 1;
          const monochrome = thirdByte >> 4 & 1;
          const chromaSubsamplingX = thirdByte >> 3 & 1;
          const chromaSubsamplingY = thirdByte >> 2 & 1;
          const chromaSamplePosition = thirdByte & 3;
          const bitDepth = profile === 2 && highBitDepth ? twelveBit ? 12 : 10 : highBitDepth ? 10 : 8;
          track.info.av1CodecInfo = {
            profile,
            level,
            tier,
            bitDepth,
            monochrome,
            chromaSubsamplingX,
            chromaSubsamplingY,
            chromaSamplePosition
          };
        }
        ;
        break;
      case "colr":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "video");
          const colourType = readAscii(slice, 4);
          if (colourType !== "nclx") {
            break;
          }
          const colourPrimaries = readU16Be(slice);
          const transferCharacteristics = readU16Be(slice);
          const matrixCoefficients = readU16Be(slice);
          const fullRangeFlag = Boolean(readU8(slice) & 128);
          track.info.colorSpace = {
            primaries: COLOR_PRIMARIES_MAP_INVERSE[colourPrimaries],
            transfer: TRANSFER_CHARACTERISTICS_MAP_INVERSE[transferCharacteristics],
            matrix: MATRIX_COEFFICIENTS_MAP_INVERSE[matrixCoefficients],
            fullRange: fullRangeFlag
          };
        }
        ;
        break;
      case "pasp":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "video");
          const num = readU32Be(slice);
          const den = readU32Be(slice);
          if (num > 0 && den > 0) {
            if (num > den) {
              track.info.squarePixelWidth = Math.round(track.info.width * num / den);
            } else {
              track.info.squarePixelHeight = Math.round(track.info.height * den / num);
            }
          }
        }
        ;
        break;
      case "wave":
        {
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
        }
        ;
        break;
      case "esds":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          slice.skip(4);
          const tag = readU8(slice);
          assert(tag === 3);
          readIsomVariableInteger(slice);
          slice.skip(2);
          const mixed = readU8(slice);
          const streamDependenceFlag = (mixed & 128) !== 0;
          const urlFlag = (mixed & 64) !== 0;
          const ocrStreamFlag = (mixed & 32) !== 0;
          if (streamDependenceFlag) {
            slice.skip(2);
          }
          if (urlFlag) {
            const urlLength = readU8(slice);
            slice.skip(urlLength);
          }
          if (ocrStreamFlag) {
            slice.skip(2);
          }
          const decoderConfigTag = readU8(slice);
          assert(decoderConfigTag === 4);
          const decoderConfigDescriptorLength = readIsomVariableInteger(slice);
          const payloadStart = slice.filePos;
          const objectTypeIndication = readU8(slice);
          if (objectTypeIndication === 64 || objectTypeIndication === 103) {
            track.info.codec = "aac";
            track.info.aacCodecInfo = {
              isMpeg2: objectTypeIndication === 103,
              objectType: null
            };
          } else if (objectTypeIndication === 105 || objectTypeIndication === 107) {
            track.info.codec = "mp3";
          } else if (objectTypeIndication === 221) {
            track.info.codec = "vorbis";
          } else {
            console.warn(`Unsupported audio codec (objectTypeIndication ${objectTypeIndication}) - discarding track.`);
          }
          slice.skip(1 + 3 + 4 + 4);
          if (decoderConfigDescriptorLength > slice.filePos - payloadStart) {
            const decoderSpecificInfoTag = readU8(slice);
            assert(decoderSpecificInfoTag === 5);
            const decoderSpecificInfoLength = readIsomVariableInteger(slice);
            track.info.codecDescription = readBytes(slice, decoderSpecificInfoLength);
            if (track.info.codec === "aac") {
              const audioSpecificConfig = parseAacAudioSpecificConfig(track.info.codecDescription);
              if (audioSpecificConfig.numberOfChannels !== null) {
                track.info.numberOfChannels = audioSpecificConfig.numberOfChannels;
              }
              if (audioSpecificConfig.sampleRate !== null) {
                track.info.sampleRate = audioSpecificConfig.sampleRate;
              }
            }
          }
        }
        ;
        break;
      case "enda":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          track.info.pcmLittleEndian = !!(readU16Be(slice) & 255);
        }
        ;
        break;
      case "pcmC":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          slice.skip(1 + 3);
          const formatFlags = readU8(slice);
          track.info.pcmLittleEndian = Boolean(formatFlags & 1);
          track.info.pcmSampleSize = readU8(slice);
        }
        ;
        break;
      case "dOps":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          slice.skip(1);
          const outputChannelCount = readU8(slice);
          const preSkip = readU16Be(slice);
          const inputSampleRate = readU32Be(slice);
          const outputGain = readI16Be(slice);
          const channelMappingFamily = readU8(slice);
          let channelMappingTable;
          if (channelMappingFamily !== 0) {
            channelMappingTable = readBytes(slice, 2 + outputChannelCount);
          } else {
            channelMappingTable = new Uint8Array(0);
          }
          const description = new Uint8Array(8 + 1 + 1 + 2 + 4 + 2 + 1 + channelMappingTable.byteLength);
          const view2 = new DataView(description.buffer);
          view2.setUint32(0, 1332770163, false);
          view2.setUint32(4, 1214603620, false);
          view2.setUint8(8, 1);
          view2.setUint8(9, outputChannelCount);
          view2.setUint16(10, preSkip, true);
          view2.setUint32(12, inputSampleRate, true);
          view2.setInt16(16, outputGain, true);
          view2.setUint8(18, channelMappingFamily);
          description.set(channelMappingTable, 19);
          track.info.codecDescription = description;
          track.info.numberOfChannels = outputChannelCount;
        }
        ;
        break;
      case "dfLa":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          slice.skip(4);
          const BLOCK_TYPE_MASK = 127;
          const LAST_METADATA_BLOCK_FLAG_MASK = 128;
          const startPos2 = slice.filePos;
          while (slice.filePos < boxEndPos) {
            const flagAndType = readU8(slice);
            const metadataBlockLength = readU24Be(slice);
            const type = flagAndType & BLOCK_TYPE_MASK;
            if (type === FlacBlockType.STREAMINFO) {
              slice.skip(10);
              const word = readU32Be(slice);
              const sampleRate = word >>> 12;
              const numberOfChannels = (word >> 9 & 7) + 1;
              track.info.sampleRate = sampleRate;
              track.info.numberOfChannels = numberOfChannels;
              slice.skip(20);
            } else {
              slice.skip(metadataBlockLength);
            }
            if (flagAndType & LAST_METADATA_BLOCK_FLAG_MASK) {
              break;
            }
          }
          const endPos = slice.filePos;
          slice.filePos = startPos2;
          const bytes2 = readBytes(slice, endPos - startPos2);
          const description = new Uint8Array(4 + bytes2.byteLength);
          const view2 = new DataView(description.buffer);
          view2.setUint32(0, 1716281667, false);
          description.set(bytes2, 4);
          track.info.codecDescription = description;
        }
        ;
        break;
      case "dac3":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          const bytes2 = readBytes(slice, 3);
          const bitstream = new Bitstream(bytes2);
          const fscod = bitstream.readBits(2);
          bitstream.skipBits(5 + 3);
          const acmod = bitstream.readBits(3);
          const lfeon = bitstream.readBits(1);
          if (fscod < 3) {
            track.info.sampleRate = AC3_SAMPLE_RATES[fscod];
          }
          track.info.numberOfChannels = AC3_ACMOD_CHANNEL_COUNTS[acmod] + lfeon;
        }
        ;
        break;
      case "dec3":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          const bytes2 = readBytes(slice, boxInfo.contentSize);
          const config = parseEac3Config(bytes2);
          if (!config) {
            console.warn("Invalid dec3 box contents, ignoring.");
            break;
          }
          const sampleRate = getEac3SampleRate(config);
          if (sampleRate !== null) {
            track.info.sampleRate = sampleRate;
          }
          track.info.numberOfChannels = getEac3ChannelCount(config);
        }
        ;
        break;
      case "stts":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          let currentIndex = 0;
          let currentTimestamp = 0;
          for (let i = 0; i < entryCount; i++) {
            const sampleCount = readU32Be(slice);
            const sampleDelta = readU32Be(slice);
            track.sampleTable.sampleTimingEntries.push({
              startIndex: currentIndex,
              startDecodeTimestamp: currentTimestamp,
              count: sampleCount,
              delta: sampleDelta
            });
            currentIndex += sampleCount;
            currentTimestamp += sampleCount * sampleDelta;
          }
        }
        ;
        break;
      case "ctts":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(1 + 3);
          const entryCount = readU32Be(slice);
          let sampleIndex = 0;
          for (let i = 0; i < entryCount; i++) {
            const sampleCount = readU32Be(slice);
            const sampleOffset = readI32Be(slice);
            track.sampleTable.sampleCompositionTimeOffsets.push({
              startIndex: sampleIndex,
              count: sampleCount,
              offset: sampleOffset
            });
            sampleIndex += sampleCount;
          }
        }
        ;
        break;
      case "stsz":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const sampleSize = readU32Be(slice);
          const sampleCount = readU32Be(slice);
          if (sampleSize === 0) {
            for (let i = 0; i < sampleCount; i++) {
              const sampleSize2 = readU32Be(slice);
              track.sampleTable.sampleSizes.push(sampleSize2);
            }
          } else {
            track.sampleTable.sampleSizes.push(sampleSize);
          }
        }
        ;
        break;
      case "stz2":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          slice.skip(3);
          const fieldSize = readU8(slice);
          const sampleCount = readU32Be(slice);
          const bytes2 = readBytes(slice, Math.ceil(sampleCount * fieldSize / 8));
          const bitstream = new Bitstream(bytes2);
          for (let i = 0; i < sampleCount; i++) {
            const sampleSize = bitstream.readBits(fieldSize);
            track.sampleTable.sampleSizes.push(sampleSize);
          }
        }
        ;
        break;
      case "stss":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          track.sampleTable.keySampleIndices = [];
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const sampleIndex = readU32Be(slice) - 1;
            track.sampleTable.keySampleIndices.push(sampleIndex);
          }
          if (track.sampleTable.keySampleIndices[0] !== 0) {
            track.sampleTable.keySampleIndices.unshift(0);
          }
        }
        ;
        break;
      case "stsc":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const startChunkIndex = readU32Be(slice) - 1;
            const samplesPerChunk = readU32Be(slice);
            const sampleDescriptionIndex = readU32Be(slice);
            track.sampleTable.sampleToChunk.push({
              startSampleIndex: -1,
              startChunkIndex,
              samplesPerChunk,
              sampleDescriptionIndex
            });
          }
          let startSampleIndex = 0;
          for (let i = 0; i < track.sampleTable.sampleToChunk.length; i++) {
            track.sampleTable.sampleToChunk[i].startSampleIndex = startSampleIndex;
            if (i < track.sampleTable.sampleToChunk.length - 1) {
              const nextChunk = track.sampleTable.sampleToChunk[i + 1];
              const chunkCount = nextChunk.startChunkIndex - track.sampleTable.sampleToChunk[i].startChunkIndex;
              startSampleIndex += chunkCount * track.sampleTable.sampleToChunk[i].samplesPerChunk;
            }
          }
        }
        ;
        break;
      case "stco":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const chunkOffset = readU32Be(slice);
            track.sampleTable.chunkOffsets.push(chunkOffset);
          }
        }
        ;
        break;
      case "co64":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const chunkOffset = readU64Be(slice);
            track.sampleTable.chunkOffsets.push(chunkOffset);
          }
        }
        ;
        break;
      case "mvex":
        {
          this.isFragmented = true;
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
        }
        ;
        break;
      case "mehd":
        {
          const version = readU8(slice);
          slice.skip(3);
          const fragmentDuration = version === 1 ? readU64Be(slice) : readU32Be(slice);
          this.movieDurationInTimescale = fragmentDuration;
        }
        ;
        break;
      case "trex":
        {
          slice.skip(4);
          const trackId = readU32Be(slice);
          const defaultSampleDescriptionIndex = readU32Be(slice);
          const defaultSampleDuration = readU32Be(slice);
          const defaultSampleSize = readU32Be(slice);
          const defaultSampleFlags = readU32Be(slice);
          this.fragmentTrackDefaults.push({
            trackId,
            defaultSampleDescriptionIndex,
            defaultSampleDuration,
            defaultSampleSize,
            defaultSampleFlags
          });
        }
        ;
        break;
      case "tfra":
        {
          const version = readU8(slice);
          slice.skip(3);
          const trackId = readU32Be(slice);
          const track = this.tracks.find((x) => x.id === trackId);
          if (!track) {
            break;
          }
          const word = readU32Be(slice);
          const lengthSizeOfTrafNum = (word & 48) >> 4;
          const lengthSizeOfTrunNum = (word & 12) >> 2;
          const lengthSizeOfSampleNum = word & 3;
          const functions = [readU8, readU16Be, readU24Be, readU32Be];
          const readTrafNum = functions[lengthSizeOfTrafNum];
          const readTrunNum = functions[lengthSizeOfTrunNum];
          const readSampleNum = functions[lengthSizeOfSampleNum];
          const numberOfEntries = readU32Be(slice);
          for (let i = 0; i < numberOfEntries; i++) {
            const time = version === 1 ? readU64Be(slice) : readU32Be(slice);
            const moofOffset = version === 1 ? readU64Be(slice) : readU32Be(slice);
            readTrafNum(slice);
            readTrunNum(slice);
            readSampleNum(slice);
            track.fragmentLookupTable.push({
              timestamp: time,
              moofOffset
            });
          }
          track.fragmentLookupTable.sort((a, b) => a.timestamp - b.timestamp);
          for (let i = 0; i < track.fragmentLookupTable.length - 1; i++) {
            const entry1 = track.fragmentLookupTable[i];
            const entry2 = track.fragmentLookupTable[i + 1];
            if (entry1.timestamp === entry2.timestamp) {
              track.fragmentLookupTable.splice(i + 1, 1);
              i--;
            }
          }
        }
        ;
        break;
      case "moof":
        {
          this.currentFragment = {
            moofOffset: startPos,
            moofSize: boxInfo.totalSize,
            implicitBaseDataOffset: startPos,
            trackData: /* @__PURE__ */ new Map(),
            psshBoxes: []
          };
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          this.lastReadFragment = this.currentFragment;
          this.currentFragment = null;
        }
        ;
        break;
      case "traf":
        {
          assert(this.currentFragment);
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          if (this.currentTrack) {
            const trackData = this.currentFragment.trackData.get(this.currentTrack.id);
            if (trackData) {
              this.currentFragment.implicitBaseDataOffset = trackData.currentOffset;
              trackData.presentationTimestamps = trackData.samples.map((x, i) => ({ presentationTimestamp: x.presentationTimestamp, sampleIndex: i })).sort((a, b) => a.presentationTimestamp - b.presentationTimestamp);
              for (let i = 0; i < trackData.presentationTimestamps.length; i++) {
                const currentEntry = trackData.presentationTimestamps[i];
                const currentSample = trackData.samples[currentEntry.sampleIndex];
                if (trackData.firstKeyFrameTimestamp === null && currentSample.isKeyFrame) {
                  trackData.firstKeyFrameTimestamp = currentSample.presentationTimestamp;
                }
                if (i < trackData.presentationTimestamps.length - 1) {
                  const nextEntry = trackData.presentationTimestamps[i + 1];
                  const duration = nextEntry.presentationTimestamp - currentEntry.presentationTimestamp;
                  currentSample.duration = duration;
                }
              }
              const firstSample = trackData.samples[trackData.presentationTimestamps[0].sampleIndex];
              const lastSample = trackData.samples[last(trackData.presentationTimestamps).sampleIndex];
              trackData.startTimestamp = firstSample.presentationTimestamp;
              trackData.endTimestamp = lastSample.presentationTimestamp + lastSample.duration;
              const { currentFragmentState } = this.currentTrack;
              assert(currentFragmentState);
              if (currentFragmentState.startTimestamp !== null) {
                offsetFragmentTrackDataByTimestamp(trackData, currentFragmentState.startTimestamp);
                trackData.startTimestampIsFinal = true;
              }
              if (currentFragmentState.encryptionAuxInfo && !trackData.samples[0].encryption) {
                trackData.encryptionAuxInfo = currentFragmentState.encryptionAuxInfo;
              }
            }
            this.currentTrack.currentFragmentState = null;
            this.currentTrack = null;
          }
        }
        ;
        break;
      case "pssh":
        {
          if (this.input._formatOptions.isobmff?._suppressPsshParsing) {
            break;
          }
          const psshBox = parsePsshBoxContents(readBytes(slice, boxInfo.contentSize));
          if (this.currentFragment) {
            this.currentFragment.psshBoxes.push(psshBox);
          } else if (!this.currentTrack) {
            this.psshBoxes.push(psshBox);
          }
        }
        ;
        break;
      case "tfhd":
        {
          assert(this.currentFragment);
          slice.skip(1);
          const flags = readU24Be(slice);
          const baseDataOffsetPresent = Boolean(flags & 1);
          const sampleDescriptionIndexPresent = Boolean(flags & 2);
          const defaultSampleDurationPresent = Boolean(flags & 8);
          const defaultSampleSizePresent = Boolean(flags & 16);
          const defaultSampleFlagsPresent = Boolean(flags & 32);
          const durationIsEmpty = Boolean(flags & 65536);
          const defaultBaseIsMoof = Boolean(flags & 131072);
          const trackId = readU32Be(slice);
          const track = this.tracks.find((x) => x.id === trackId);
          if (!track) {
            break;
          }
          const defaults = this.fragmentTrackDefaults.find((x) => x.trackId === trackId);
          this.currentTrack = track;
          track.currentFragmentState = {
            baseDataOffset: this.currentFragment.implicitBaseDataOffset,
            sampleDescriptionIndex: defaults?.defaultSampleDescriptionIndex ?? null,
            defaultSampleDuration: defaults?.defaultSampleDuration ?? null,
            defaultSampleSize: defaults?.defaultSampleSize ?? null,
            defaultSampleFlags: defaults?.defaultSampleFlags ?? null,
            startTimestamp: null,
            encryptionAuxInfo: null
          };
          if (baseDataOffsetPresent) {
            track.currentFragmentState.baseDataOffset = readU64Be(slice);
          } else if (defaultBaseIsMoof) {
            track.currentFragmentState.baseDataOffset = this.currentFragment.moofOffset;
          }
          if (sampleDescriptionIndexPresent) {
            track.currentFragmentState.sampleDescriptionIndex = readU32Be(slice);
          }
          if (defaultSampleDurationPresent) {
            track.currentFragmentState.defaultSampleDuration = readU32Be(slice);
          }
          if (defaultSampleSizePresent) {
            track.currentFragmentState.defaultSampleSize = readU32Be(slice);
          }
          if (defaultSampleFlagsPresent) {
            track.currentFragmentState.defaultSampleFlags = readU32Be(slice);
          }
          if (durationIsEmpty) {
            track.currentFragmentState.defaultSampleDuration = 0;
          }
        }
        ;
        break;
      case "tfdt":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.currentFragmentState);
          const version = readU8(slice);
          slice.skip(3);
          const baseMediaDecodeTime = version === 0 ? readU32Be(slice) : readU64Be(slice);
          track.currentFragmentState.startTimestamp = baseMediaDecodeTime;
        }
        ;
        break;
      case "trun":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(this.currentFragment);
          assert(track.currentFragmentState);
          const version = readU8(slice);
          const flags = readU24Be(slice);
          const dataOffsetPresent = Boolean(flags & 1);
          const firstSampleFlagsPresent = Boolean(flags & 4);
          const sampleDurationPresent = Boolean(flags & 256);
          const sampleSizePresent = Boolean(flags & 512);
          const sampleFlagsPresent = Boolean(flags & 1024);
          const sampleCompositionTimeOffsetsPresent = Boolean(flags & 2048);
          const sampleCount = readU32Be(slice);
          let dataOffset = null;
          if (dataOffsetPresent) {
            dataOffset = readI32Be(slice);
          }
          let firstSampleFlags = null;
          if (firstSampleFlagsPresent) {
            firstSampleFlags = readU32Be(slice);
          }
          let trackData;
          if (this.currentFragment.trackData.has(track.id)) {
            trackData = this.currentFragment.trackData.get(track.id);
            if (dataOffset !== null) {
              trackData.currentOffset = track.currentFragmentState.baseDataOffset + dataOffset;
            } else {
            }
          } else {
            trackData = {
              track,
              currentTimestamp: 0,
              currentOffset: track.currentFragmentState.baseDataOffset + (dataOffset ?? 0),
              startTimestamp: 0,
              endTimestamp: 0,
              firstKeyFrameTimestamp: null,
              samples: [],
              presentationTimestamps: [],
              startTimestampIsFinal: false,
              encryptionAuxInfo: null
            };
            this.currentFragment.trackData.set(track.id, trackData);
          }
          if (sampleCount === 0) {
            this.currentFragment.implicitBaseDataOffset = trackData.currentOffset;
            break;
          }
          for (let i = 0; i < sampleCount; i++) {
            let sampleDuration;
            if (sampleDurationPresent) {
              sampleDuration = readU32Be(slice);
            } else {
              assert(track.currentFragmentState.defaultSampleDuration !== null);
              sampleDuration = track.currentFragmentState.defaultSampleDuration;
            }
            let sampleSize;
            if (sampleSizePresent) {
              sampleSize = readU32Be(slice);
            } else {
              assert(track.currentFragmentState.defaultSampleSize !== null);
              sampleSize = track.currentFragmentState.defaultSampleSize;
            }
            let sampleFlags;
            if (sampleFlagsPresent) {
              sampleFlags = readU32Be(slice);
            } else {
              assert(track.currentFragmentState.defaultSampleFlags !== null);
              sampleFlags = track.currentFragmentState.defaultSampleFlags;
            }
            if (i === 0 && firstSampleFlags !== null) {
              sampleFlags = firstSampleFlags;
            }
            let sampleCompositionTimeOffset = 0;
            if (sampleCompositionTimeOffsetsPresent) {
              if (version === 0) {
                sampleCompositionTimeOffset = readU32Be(slice);
              } else {
                sampleCompositionTimeOffset = readI32Be(slice);
              }
            }
            const isKeyFrame = !(sampleFlags & 65536);
            trackData.samples.push({
              presentationTimestamp: trackData.currentTimestamp + sampleCompositionTimeOffset,
              duration: sampleDuration,
              byteOffset: trackData.currentOffset,
              byteSize: sampleSize,
              isKeyFrame,
              encryption: null
            });
            trackData.currentOffset += sampleSize;
            trackData.currentTimestamp += sampleDuration;
          }
        }
        ;
        break;
      case "saiz":
        {
          const track = this.currentTrack;
          if (!track || !track.encryptionInfo) {
            break;
          }
          slice.skip(1);
          const flags = readU24Be(slice);
          if (flags & 1) {
            const auxInfoType = readAscii(slice, 4);
            const auxInfoTypeParam = readU32Be(slice);
            if (auxInfoType !== track.encryptionInfo.scheme || auxInfoTypeParam !== 0) {
              break;
            }
          }
          const defaultSampleInfoSize = readU8(slice);
          const sampleCount = readU32Be(slice);
          let sampleSizes = null;
          if (defaultSampleInfoSize === 0 && sampleCount > 0) {
            sampleSizes = readBytes(slice, sampleCount);
          }
          const aux = getOrCreateEncryptionAuxInfo(track);
          aux.defaultSampleInfoSize = defaultSampleInfoSize;
          aux.sampleSizes = sampleSizes;
          aux.sampleCount = sampleCount;
        }
        ;
        break;
      case "saio":
        {
          const track = this.currentTrack;
          if (!track || !track.encryptionInfo) {
            break;
          }
          const version = readU8(slice);
          const flags = readU24Be(slice);
          if (flags & 1) {
            const auxInfoType = readAscii(slice, 4);
            const auxInfoTypeParam = readU32Be(slice);
            if (auxInfoType !== track.encryptionInfo.scheme || auxInfoTypeParam !== 0) {
              break;
            }
          }
          const entryCount = readU32Be(slice);
          if (entryCount === 0) {
            break;
          }
          if (entryCount > 1) {
            console.warn("Multiple saio entries are not supported; using the first offset only.");
          }
          let offset = version === 0 ? readU32Be(slice) : Number(readU64Be(slice));
          if (this.currentFragment) {
            offset += this.currentFragment.moofOffset;
          }
          const aux = getOrCreateEncryptionAuxInfo(track);
          aux.offset = offset;
        }
        ;
        break;
      case "senc":
        {
          const track = this.currentTrack;
          if (!track || !track.encryptionInfo) {
            break;
          }
          assert(this.currentFragment);
          const trackData = this.currentFragment.trackData.get(track.id);
          if (!trackData) {
            break;
          }
          slice.skip(1);
          const flags = readU24Be(slice);
          const useSubsamples = Boolean(flags & 2);
          const sampleCount = readU32Be(slice);
          const ivSize = track.encryptionInfo.defaultPerSampleIvSize;
          assert(ivSize !== null);
          for (let i = 0; i < Math.min(sampleCount, trackData.samples.length); i++) {
            const iv = new Uint8Array(16);
            if (ivSize > 0) {
              iv.set(readBytes(slice, ivSize), 0);
            } else {
              iv.set(track.encryptionInfo.defaultConstantIv, 0);
            }
            let subsamples = null;
            if (useSubsamples) {
              const subsampleCount = readU16Be(slice);
              subsamples = [];
              for (let j = 0; j < subsampleCount; j++) {
                const clearLen = readU16Be(slice);
                const protectedLen = readU32Be(slice);
                subsamples.push({ clearLen, protectedLen });
              }
            }
            const sample = trackData.samples[i];
            sample.encryption = { iv, subsamples };
          }
        }
        ;
        break;
      // Metadata section
      // https://exiftool.org/TagNames/QuickTime.html
      // https://mp4workshop.com/about
      case "udta":
        {
          const iterator = this.iterateContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          for (const { boxInfo: boxInfo2, slice: slice2 } of iterator) {
            if (boxInfo2.name !== "meta" && !this.currentTrack) {
              const startPos2 = slice2.filePos;
              this.metadataTags.raw ??= {};
              if (boxInfo2.name[0] === "\xA9") {
                this.metadataTags.raw[boxInfo2.name] ??= readMetadataStringShort(slice2);
              } else {
                this.metadataTags.raw[boxInfo2.name] ??= readBytes(slice2, boxInfo2.contentSize);
              }
              slice2.filePos = startPos2;
            }
            switch (boxInfo2.name) {
              case "meta":
                {
                  slice2.skip(-boxInfo2.headerSize);
                  this.traverseBox(slice2);
                }
                ;
                break;
              case "\xA9nam":
              case "name":
                {
                  if (this.currentTrack) {
                    this.currentTrack.name = textDecoder.decode(readBytes(slice2, boxInfo2.contentSize));
                  } else {
                    this.metadataTags.title ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9des":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.description ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9ART":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.artist ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9alb":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.album ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "albr":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.albumArtist ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9gen":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.genre ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9day":
                {
                  if (!this.currentTrack) {
                    const date = new Date(readMetadataStringShort(slice2));
                    if (!Number.isNaN(date.getTime())) {
                      this.metadataTags.date ??= date;
                    }
                  }
                }
                ;
                break;
              case "\xA9cmt":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.comment ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9lyr":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.lyrics ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
            }
          }
        }
        ;
        break;
      case "meta":
        {
          if (this.currentTrack) {
            break;
          }
          const word = readU32Be(slice);
          const isQuickTime = word !== 0;
          this.currentMetadataKeys = /* @__PURE__ */ new Map();
          if (isQuickTime) {
            this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          } else {
            this.readContiguousBoxes(slice.slice(contentStartPos + 4, boxInfo.contentSize - 4));
          }
          this.currentMetadataKeys = null;
        }
        ;
        break;
      case "keys":
        {
          if (!this.currentMetadataKeys) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const keySize = readU32Be(slice);
            slice.skip(4);
            const keyName = textDecoder.decode(readBytes(slice, keySize - 8));
            this.currentMetadataKeys.set(i + 1, keyName);
          }
        }
        ;
        break;
      case "ilst":
        {
          if (!this.currentMetadataKeys) {
            break;
          }
          const iterator = this.iterateContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          for (const { boxInfo: boxInfo2, slice: slice2 } of iterator) {
            let metadataKey = boxInfo2.name;
            const nameAsNumber = (metadataKey.charCodeAt(0) << 24) + (metadataKey.charCodeAt(1) << 16) + (metadataKey.charCodeAt(2) << 8) + metadataKey.charCodeAt(3);
            if (this.currentMetadataKeys.has(nameAsNumber)) {
              metadataKey = this.currentMetadataKeys.get(nameAsNumber);
            }
            const data = readDataBox(slice2);
            this.metadataTags.raw ??= {};
            this.metadataTags.raw[metadataKey] ??= data;
            switch (metadataKey) {
              case "\xA9nam":
              case "titl":
              case "com.apple.quicktime.title":
              case "title":
                {
                  if (typeof data === "string") {
                    this.metadataTags.title ??= data;
                  }
                }
                ;
                break;
              case "\xA9des":
              case "desc":
              case "dscp":
              case "com.apple.quicktime.description":
              case "description":
                {
                  if (typeof data === "string") {
                    this.metadataTags.description ??= data;
                  }
                }
                ;
                break;
              case "\xA9ART":
              case "com.apple.quicktime.artist":
              case "artist":
                {
                  if (typeof data === "string") {
                    this.metadataTags.artist ??= data;
                  }
                }
                ;
                break;
              case "\xA9alb":
              case "albm":
              case "com.apple.quicktime.album":
              case "album":
                {
                  if (typeof data === "string") {
                    this.metadataTags.album ??= data;
                  }
                }
                ;
                break;
              case "aART":
              case "album_artist":
                {
                  if (typeof data === "string") {
                    this.metadataTags.albumArtist ??= data;
                  }
                }
                ;
                break;
              case "\xA9cmt":
              case "com.apple.quicktime.comment":
              case "comment":
                {
                  if (typeof data === "string") {
                    this.metadataTags.comment ??= data;
                  }
                }
                ;
                break;
              case "\xA9gen":
              case "gnre":
              case "com.apple.quicktime.genre":
              case "genre":
                {
                  if (typeof data === "string") {
                    this.metadataTags.genre ??= data;
                  }
                }
                ;
                break;
              case "\xA9lyr":
              case "lyrics":
                {
                  if (typeof data === "string") {
                    this.metadataTags.lyrics ??= data;
                  }
                }
                ;
                break;
              case "\xA9day":
              case "rldt":
              case "com.apple.quicktime.creationdate":
              case "date":
                {
                  if (typeof data === "string") {
                    const date = new Date(data);
                    if (!Number.isNaN(date.getTime())) {
                      this.metadataTags.date ??= date;
                    }
                  }
                }
                ;
                break;
              case "covr":
              case "com.apple.quicktime.artwork":
                {
                  if (data instanceof RichImageData) {
                    this.metadataTags.images ??= [];
                    this.metadataTags.images.push({
                      data: data.data,
                      kind: "coverFront",
                      mimeType: data.mimeType
                    });
                  } else if (data instanceof Uint8Array) {
                    this.metadataTags.images ??= [];
                    this.metadataTags.images.push({
                      data,
                      kind: "coverFront",
                      mimeType: "image/*"
                    });
                  }
                }
                ;
                break;
              case "track":
                {
                  if (typeof data === "string") {
                    const parts = data.split("/");
                    const trackNum = Number.parseInt(parts[0], 10);
                    const tracksTotal = parts[1] && Number.parseInt(parts[1], 10);
                    if (Number.isInteger(trackNum) && trackNum > 0) {
                      this.metadataTags.trackNumber ??= trackNum;
                    }
                    if (tracksTotal && Number.isInteger(tracksTotal) && tracksTotal > 0) {
                      this.metadataTags.tracksTotal ??= tracksTotal;
                    }
                  }
                }
                ;
                break;
              case "trkn":
                {
                  if (data instanceof Uint8Array && data.length >= 6) {
                    const view2 = toDataView(data);
                    const trackNumber = view2.getUint16(2, false);
                    const tracksTotal = view2.getUint16(4, false);
                    if (trackNumber > 0) {
                      this.metadataTags.trackNumber ??= trackNumber;
                    }
                    if (tracksTotal > 0) {
                      this.metadataTags.tracksTotal ??= tracksTotal;
                    }
                  }
                }
                ;
                break;
              case "disc":
              case "disk":
                {
                  if (data instanceof Uint8Array && data.length >= 6) {
                    const view2 = toDataView(data);
                    const discNumber = view2.getUint16(2, false);
                    const discNumberMax = view2.getUint16(4, false);
                    if (discNumber > 0) {
                      this.metadataTags.discNumber ??= discNumber;
                    }
                    if (discNumberMax > 0) {
                      this.metadataTags.discsTotal ??= discNumberMax;
                    }
                  }
                }
                ;
                break;
            }
          }
        }
        ;
        break;
    }
    slice.filePos = boxEndPos;
    return true;
  }
};
var IsobmffTrackBacking = class {
  constructor(internalTrack) {
    this.internalTrack = internalTrack;
    this.packetToSampleIndex = /* @__PURE__ */ new WeakMap();
    this.packetToFragmentLocation = /* @__PURE__ */ new WeakMap();
  }
  getId() {
    return this.internalTrack.id;
  }
  getNumber() {
    const demuxer = this.internalTrack.demuxer;
    const trackType = this.internalTrack.trackBacking.getType();
    let number = 0;
    for (const track of demuxer.tracks) {
      if (track.trackBacking.getType() === trackType) {
        number++;
      }
      if (track === this.internalTrack) {
        break;
      }
    }
    return number;
  }
  getCodec() {
    throw new Error("Not implemented on base class.");
  }
  getInternalCodecId() {
    return this.internalTrack.internalCodecId;
  }
  getName() {
    return this.internalTrack.name;
  }
  getLanguageCode() {
    return this.internalTrack.languageCode;
  }
  getTimeResolution() {
    return this.internalTrack.timescale;
  }
  isRelativeToUnixEpoch() {
    return false;
  }
  getDisposition() {
    return this.internalTrack.disposition;
  }
  getPairingMask() {
    return 1n;
  }
  getBitrate() {
    return null;
  }
  getAverageBitrate() {
    return null;
  }
  async getDurationFromMetadata() {
    const track = this.internalTrack;
    if (track.durationInMediaTimescale <= 0) {
      return null;
    }
    assert(track.trackBacking);
    const firstPacket = await track.trackBacking.getFirstPacket({ metadataOnly: true });
    return (firstPacket?.timestamp ?? 0) + track.durationInMediaTimescale / track.timescale;
  }
  async getLiveRefreshInterval() {
    return null;
  }
  async getFirstPacket(options) {
    const regularPacket = await this.fetchPacketForSampleIndex(0, options);
    if (regularPacket || !this.internalTrack.demuxer.isFragmented) {
      return regularPacket;
    }
    return this.performFragmentedLookup(
      null,
      (fragment) => {
        const trackData = fragment.trackData.get(this.internalTrack.id);
        if (trackData) {
          return {
            sampleIndex: 0,
            correctSampleFound: true
          };
        }
        return {
          sampleIndex: -1,
          correctSampleFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the lookup entries
      Infinity,
      options
    );
  }
  mapTimestampIntoTimescale(timestamp) {
    return roundIfAlmostInteger(timestamp * this.internalTrack.timescale) + this.internalTrack.editListOffset;
  }
  async getPacket(timestamp, options) {
    const timestampInTimescale = this.mapTimestampIntoTimescale(timestamp);
    const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
    const sampleIndex = getSampleIndexForTimestamp(sampleTable, timestampInTimescale);
    const regularPacket = await this.fetchPacketForSampleIndex(sampleIndex, options);
    if (!sampleTableIsEmpty(sampleTable) || !this.internalTrack.demuxer.isFragmented) {
      return regularPacket;
    }
    return this.performFragmentedLookup(null, (fragment) => {
      const trackData = fragment.trackData.get(this.internalTrack.id);
      if (!trackData) {
        return { sampleIndex: -1, correctSampleFound: false };
      }
      const index = binarySearchLessOrEqual(trackData.presentationTimestamps, timestampInTimescale, (x) => x.presentationTimestamp);
      const sampleIndex2 = index !== -1 ? trackData.presentationTimestamps[index].sampleIndex : -1;
      const correctSampleFound = index !== -1 && timestampInTimescale < trackData.endTimestamp;
      return { sampleIndex: sampleIndex2, correctSampleFound };
    }, timestampInTimescale, timestampInTimescale, options);
  }
  async getNextPacket(packet, options) {
    const regularSampleIndex = this.packetToSampleIndex.get(packet);
    if (regularSampleIndex !== void 0) {
      return this.fetchPacketForSampleIndex(regularSampleIndex + 1, options);
    }
    const locationInFragment = this.packetToFragmentLocation.get(packet);
    if (locationInFragment === void 0) {
      throw new Error("Packet was not created from this track.");
    }
    return this.performFragmentedLookup(
      locationInFragment.fragment,
      (fragment) => {
        if (fragment === locationInFragment.fragment) {
          const trackData = fragment.trackData.get(this.internalTrack.id);
          if (locationInFragment.sampleIndex + 1 < trackData.samples.length) {
            return {
              sampleIndex: locationInFragment.sampleIndex + 1,
              correctSampleFound: true
            };
          }
        } else {
          const trackData = fragment.trackData.get(this.internalTrack.id);
          if (trackData) {
            return {
              sampleIndex: 0,
              correctSampleFound: true
            };
          }
        }
        return {
          sampleIndex: -1,
          correctSampleFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the lookup entries
      Infinity,
      options
    );
  }
  async getKeyPacket(timestamp, options) {
    const timestampInTimescale = this.mapTimestampIntoTimescale(timestamp);
    const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
    const sampleIndex = getKeyframeSampleIndexForTimestamp(sampleTable, timestampInTimescale);
    const regularPacket = await this.fetchPacketForSampleIndex(sampleIndex, options);
    if (!sampleTableIsEmpty(sampleTable) || !this.internalTrack.demuxer.isFragmented) {
      return regularPacket;
    }
    return this.performFragmentedLookup(null, (fragment) => {
      const trackData = fragment.trackData.get(this.internalTrack.id);
      if (!trackData) {
        return { sampleIndex: -1, correctSampleFound: false };
      }
      const index = findLastIndex(trackData.presentationTimestamps, (x) => {
        const sample = trackData.samples[x.sampleIndex];
        return sample.isKeyFrame && x.presentationTimestamp <= timestampInTimescale;
      });
      const sampleIndex2 = index !== -1 ? trackData.presentationTimestamps[index].sampleIndex : -1;
      const correctSampleFound = index !== -1 && timestampInTimescale < trackData.endTimestamp;
      return { sampleIndex: sampleIndex2, correctSampleFound };
    }, timestampInTimescale, timestampInTimescale, options);
  }
  async getNextKeyPacket(packet, options) {
    const regularSampleIndex = this.packetToSampleIndex.get(packet);
    if (regularSampleIndex !== void 0) {
      const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
      const nextKeyFrameSampleIndex = getNextKeyframeIndexForSample(sampleTable, regularSampleIndex);
      return this.fetchPacketForSampleIndex(nextKeyFrameSampleIndex, options);
    }
    const locationInFragment = this.packetToFragmentLocation.get(packet);
    if (locationInFragment === void 0) {
      throw new Error("Packet was not created from this track.");
    }
    return this.performFragmentedLookup(
      locationInFragment.fragment,
      (fragment) => {
        if (fragment === locationInFragment.fragment) {
          const trackData = fragment.trackData.get(this.internalTrack.id);
          const nextKeyFrameIndex = trackData.samples.findIndex((x, i) => x.isKeyFrame && i > locationInFragment.sampleIndex);
          if (nextKeyFrameIndex !== -1) {
            return {
              sampleIndex: nextKeyFrameIndex,
              correctSampleFound: true
            };
          }
        } else {
          const trackData = fragment.trackData.get(this.internalTrack.id);
          if (trackData && trackData.firstKeyFrameTimestamp !== null) {
            const keyFrameIndex = trackData.samples.findIndex((x) => x.isKeyFrame);
            assert(keyFrameIndex !== -1);
            return {
              sampleIndex: keyFrameIndex,
              correctSampleFound: true
            };
          }
        }
        return {
          sampleIndex: -1,
          correctSampleFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the lookup entries
      Infinity,
      options
    );
  }
  async fetchPacketForSampleIndex(sampleIndex, options) {
    if (sampleIndex === -1) {
      return null;
    }
    const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
    const sampleInfo = getSampleInfo(sampleTable, sampleIndex);
    if (!sampleInfo) {
      return null;
    }
    let data;
    if (options.metadataOnly) {
      data = PLACEHOLDER_DATA;
    } else {
      let slice = this.internalTrack.demuxer.reader.requestSlice(sampleInfo.sampleOffset, sampleInfo.sampleSize);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice) {
        return null;
      }
      data = readBytes(slice, sampleInfo.sampleSize);
      if (this.internalTrack.encryptionAuxInfo) {
        assert(this.internalTrack.encryptionInfo);
        const entries = await resolveEncryptionAuxInfo(this.internalTrack.demuxer.reader, this.internalTrack.encryptionInfo, this.internalTrack.encryptionAuxInfo);
        if (sampleIndex < entries.length) {
          data = await decryptSample(this.internalTrack, entries[sampleIndex], data, null);
        }
      }
    }
    const timestamp = (sampleInfo.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale;
    const duration = sampleInfo.duration / this.internalTrack.timescale;
    const packet = new EncodedPacket(data, sampleInfo.isKeyFrame ? "key" : "delta", timestamp, duration, sampleIndex, sampleInfo.sampleSize);
    this.packetToSampleIndex.set(packet, sampleIndex);
    return packet;
  }
  async fetchPacketInFragment(fragment, sampleIndex, options) {
    if (sampleIndex === -1) {
      return null;
    }
    const trackData = fragment.trackData.get(this.internalTrack.id);
    const fragmentSample = trackData.samples[sampleIndex];
    assert(fragmentSample);
    let data;
    if (options.metadataOnly) {
      data = PLACEHOLDER_DATA;
    } else {
      let slice = this.internalTrack.demuxer.reader.requestSlice(fragmentSample.byteOffset, fragmentSample.byteSize);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice) {
        return null;
      }
      data = readBytes(slice, fragmentSample.byteSize);
      if (fragmentSample.encryption) {
        data = await decryptSample(this.internalTrack, fragmentSample.encryption, data, fragment);
      }
    }
    const timestamp = (fragmentSample.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale;
    const duration = fragmentSample.duration / this.internalTrack.timescale;
    const packet = new EncodedPacket(data, fragmentSample.isKeyFrame ? "key" : "delta", timestamp, duration, fragment.moofOffset + sampleIndex, fragmentSample.byteSize);
    this.packetToFragmentLocation.set(packet, { fragment, sampleIndex });
    return packet;
  }
  /** Looks for a packet in the fragments while trying to load as few fragments as possible to retrieve it. */
  async performFragmentedLookup(startFragment, getMatchInFragment, searchTimestamp, latestTimestamp, options) {
    const demuxer = this.internalTrack.demuxer;
    let currentFragment = null;
    let bestFragment = null;
    let bestSampleIndex = -1;
    if (startFragment) {
      const { sampleIndex, correctSampleFound } = getMatchInFragment(startFragment);
      if (correctSampleFound) {
        return this.fetchPacketInFragment(startFragment, sampleIndex, options);
      }
      if (sampleIndex !== -1) {
        bestFragment = startFragment;
        bestSampleIndex = sampleIndex;
      }
    }
    const lookupEntryIndex = binarySearchLessOrEqual(this.internalTrack.fragmentLookupTable, searchTimestamp, (x) => x.timestamp);
    const lookupEntry = lookupEntryIndex !== -1 ? this.internalTrack.fragmentLookupTable[lookupEntryIndex] : null;
    const positionCacheIndex = binarySearchLessOrEqual(this.internalTrack.fragmentPositionCache, searchTimestamp, (x) => x.startTimestamp);
    const positionCacheEntry = positionCacheIndex !== -1 ? this.internalTrack.fragmentPositionCache[positionCacheIndex] : null;
    const lookupEntryPosition = Math.max(lookupEntry?.moofOffset ?? 0, positionCacheEntry?.moofOffset ?? 0) || null;
    let currentPos;
    if (!startFragment) {
      currentPos = lookupEntryPosition ?? 0;
    } else {
      if (lookupEntryPosition === null || startFragment.moofOffset >= lookupEntryPosition) {
        currentPos = startFragment.moofOffset + startFragment.moofSize;
        currentFragment = startFragment;
      } else {
        currentPos = lookupEntryPosition;
      }
    }
    while (true) {
      if (currentFragment) {
        const trackData = currentFragment.trackData.get(this.internalTrack.id);
        if (trackData && trackData.startTimestamp > latestTimestamp) {
          break;
        }
      }
      let slice = demuxer.reader.requestSliceRange(currentPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice)
        break;
      const boxStartPos = currentPos;
      const boxInfo = readBoxHeader(slice);
      if (!boxInfo) {
        break;
      }
      if (boxInfo.name === "moof") {
        currentFragment = await demuxer.readFragment(boxStartPos);
        const { sampleIndex, correctSampleFound } = getMatchInFragment(currentFragment);
        if (correctSampleFound) {
          return this.fetchPacketInFragment(currentFragment, sampleIndex, options);
        }
        if (sampleIndex !== -1) {
          bestFragment = currentFragment;
          bestSampleIndex = sampleIndex;
        }
      }
      currentPos = boxStartPos + boxInfo.totalSize;
    }
    if (lookupEntry && (!bestFragment || bestFragment.moofOffset < lookupEntry.moofOffset)) {
      const previousLookupEntry = this.internalTrack.fragmentLookupTable[lookupEntryIndex - 1];
      assert(!previousLookupEntry || previousLookupEntry.timestamp < lookupEntry.timestamp);
      const newSearchTimestamp = previousLookupEntry?.timestamp ?? -Infinity;
      return this.performFragmentedLookup(null, getMatchInFragment, newSearchTimestamp, latestTimestamp, options);
    }
    if (bestFragment) {
      return this.fetchPacketInFragment(bestFragment, bestSampleIndex, options);
    }
    return null;
  }
};
var IsobmffVideoTrackBacking = class extends IsobmffTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.decoderConfigPromise = null;
    this.internalTrack = internalTrack;
  }
  getType() {
    return "video";
  }
  getCodec() {
    return this.internalTrack.info.codec;
  }
  getCodedWidth() {
    return this.internalTrack.info.width;
  }
  getCodedHeight() {
    return this.internalTrack.info.height;
  }
  getSquarePixelWidth() {
    return this.internalTrack.info.squarePixelWidth;
  }
  getSquarePixelHeight() {
    return this.internalTrack.info.squarePixelHeight;
  }
  getRotation() {
    return this.internalTrack.rotation;
  }
  async getColorSpace() {
    return {
      primaries: this.internalTrack.info.colorSpace?.primaries,
      transfer: this.internalTrack.info.colorSpace?.transfer,
      matrix: this.internalTrack.info.colorSpace?.matrix,
      fullRange: this.internalTrack.info.colorSpace?.fullRange
    };
  }
  async canBeTransparent() {
    return false;
  }
  async getDecoderConfig() {
    if (!this.internalTrack.info.codec) {
      return null;
    }
    return this.decoderConfigPromise ??= (async () => {
      if (this.internalTrack.info.codec === "vp9" && !this.internalTrack.info.vp9CodecInfo) {
        const firstPacket = await this.getFirstPacket({});
        this.internalTrack.info.vp9CodecInfo = firstPacket && extractVp9CodecInfoFromPacket(firstPacket.data);
      } else if (this.internalTrack.info.codec === "av1" && !this.internalTrack.info.av1CodecInfo) {
        const firstPacket = await this.getFirstPacket({});
        this.internalTrack.info.av1CodecInfo = firstPacket && extractAv1CodecInfoFromPacket(firstPacket.data);
      }
      const config = {
        codec: extractVideoCodecString(this.internalTrack.info),
        codedWidth: this.internalTrack.info.width,
        codedHeight: this.internalTrack.info.height,
        description: this.internalTrack.info.codecDescription ?? void 0,
        colorSpace: this.internalTrack.info.colorSpace ?? void 0
      };
      if (this.internalTrack.info.width !== this.internalTrack.info.squarePixelWidth || this.internalTrack.info.height !== this.internalTrack.info.squarePixelHeight) {
        config.displayAspectWidth = this.internalTrack.info.squarePixelWidth;
        config.displayAspectHeight = this.internalTrack.info.squarePixelHeight;
      }
      return config;
    })();
  }
};
var IsobmffAudioTrackBacking = class extends IsobmffTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.decoderConfig = null;
    this.internalTrack = internalTrack;
  }
  getType() {
    return "audio";
  }
  getCodec() {
    return this.internalTrack.info.codec;
  }
  getNumberOfChannels() {
    return this.internalTrack.info.numberOfChannels;
  }
  getSampleRate() {
    return this.internalTrack.info.sampleRate;
  }
  async getDecoderConfig() {
    if (!this.internalTrack.info.codec) {
      return null;
    }
    return this.decoderConfig ??= {
      codec: extractAudioCodecString(this.internalTrack.info),
      numberOfChannels: this.internalTrack.info.numberOfChannels,
      sampleRate: this.internalTrack.info.sampleRate,
      description: this.internalTrack.info.codecDescription ?? void 0
    };
  }
};
var getSampleIndexForTimestamp = (sampleTable, timescaleUnits) => {
  if (sampleTable.presentationTimestamps) {
    const index = binarySearchLessOrEqual(sampleTable.presentationTimestamps, timescaleUnits, (x) => x.presentationTimestamp);
    if (index === -1) {
      return -1;
    }
    return sampleTable.presentationTimestamps[index].sampleIndex;
  } else {
    const index = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, timescaleUnits, (x) => x.startDecodeTimestamp);
    if (index === -1) {
      return -1;
    }
    const entry = sampleTable.sampleTimingEntries[index];
    return entry.startIndex + Math.min(Math.floor((timescaleUnits - entry.startDecodeTimestamp) / entry.delta), entry.count - 1);
  }
};
var getKeyframeSampleIndexForTimestamp = (sampleTable, timescaleUnits) => {
  if (!sampleTable.keySampleIndices) {
    return getSampleIndexForTimestamp(sampleTable, timescaleUnits);
  }
  if (sampleTable.presentationTimestamps) {
    const index = binarySearchLessOrEqual(sampleTable.presentationTimestamps, timescaleUnits, (x) => x.presentationTimestamp);
    if (index === -1) {
      return -1;
    }
    for (let i = index; i >= 0; i--) {
      const sampleIndex = sampleTable.presentationTimestamps[i].sampleIndex;
      const isKeyFrame = binarySearchExact(sampleTable.keySampleIndices, sampleIndex, (x) => x) !== -1;
      if (isKeyFrame) {
        return sampleIndex;
      }
    }
    return -1;
  } else {
    const sampleIndex = getSampleIndexForTimestamp(sampleTable, timescaleUnits);
    const index = binarySearchLessOrEqual(sampleTable.keySampleIndices, sampleIndex, (x) => x);
    return sampleTable.keySampleIndices[index] ?? -1;
  }
};
var getSampleInfo = (sampleTable, sampleIndex) => {
  const timingEntryIndex = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, sampleIndex, (x) => x.startIndex);
  const timingEntry = sampleTable.sampleTimingEntries[timingEntryIndex];
  if (!timingEntry || timingEntry.startIndex + timingEntry.count <= sampleIndex) {
    return null;
  }
  const decodeTimestamp = timingEntry.startDecodeTimestamp + (sampleIndex - timingEntry.startIndex) * timingEntry.delta;
  let presentationTimestamp = decodeTimestamp;
  const offsetEntryIndex = binarySearchLessOrEqual(sampleTable.sampleCompositionTimeOffsets, sampleIndex, (x) => x.startIndex);
  const offsetEntry = sampleTable.sampleCompositionTimeOffsets[offsetEntryIndex];
  if (offsetEntry && sampleIndex - offsetEntry.startIndex < offsetEntry.count) {
    presentationTimestamp += offsetEntry.offset;
  }
  const sampleSize = sampleTable.sampleSizes[Math.min(sampleIndex, sampleTable.sampleSizes.length - 1)];
  const chunkEntryIndex = binarySearchLessOrEqual(sampleTable.sampleToChunk, sampleIndex, (x) => x.startSampleIndex);
  const chunkEntry = sampleTable.sampleToChunk[chunkEntryIndex];
  assert(chunkEntry);
  const chunkIndex = chunkEntry.startChunkIndex + Math.floor((sampleIndex - chunkEntry.startSampleIndex) / chunkEntry.samplesPerChunk);
  const chunkOffset = sampleTable.chunkOffsets[chunkIndex];
  const startSampleIndexOfChunk = chunkEntry.startSampleIndex + (chunkIndex - chunkEntry.startChunkIndex) * chunkEntry.samplesPerChunk;
  let chunkSize = 0;
  let sampleOffset = chunkOffset;
  if (sampleTable.sampleSizes.length === 1) {
    sampleOffset += sampleSize * (sampleIndex - startSampleIndexOfChunk);
    chunkSize += sampleSize * chunkEntry.samplesPerChunk;
  } else {
    for (let i = startSampleIndexOfChunk; i < startSampleIndexOfChunk + chunkEntry.samplesPerChunk; i++) {
      const sampleSize2 = sampleTable.sampleSizes[i];
      if (i < sampleIndex) {
        sampleOffset += sampleSize2;
      }
      chunkSize += sampleSize2;
    }
  }
  let duration = timingEntry.delta;
  if (sampleTable.presentationTimestamps) {
    const presentationIndex = sampleTable.presentationTimestampIndexMap[sampleIndex];
    assert(presentationIndex !== void 0);
    if (presentationIndex < sampleTable.presentationTimestamps.length - 1) {
      const nextEntry = sampleTable.presentationTimestamps[presentationIndex + 1];
      const nextPresentationTimestamp = nextEntry.presentationTimestamp;
      duration = nextPresentationTimestamp - presentationTimestamp;
    }
  }
  return {
    presentationTimestamp,
    duration,
    sampleOffset,
    sampleSize,
    chunkOffset,
    chunkSize,
    isKeyFrame: sampleTable.keySampleIndices ? binarySearchExact(sampleTable.keySampleIndices, sampleIndex, (x) => x) !== -1 : true
  };
};
var getNextKeyframeIndexForSample = (sampleTable, sampleIndex) => {
  if (!sampleTable.keySampleIndices) {
    return sampleIndex + 1;
  }
  const index = binarySearchLessOrEqual(sampleTable.keySampleIndices, sampleIndex, (x) => x);
  return sampleTable.keySampleIndices[index + 1] ?? -1;
};
var offsetFragmentTrackDataByTimestamp = (trackData, timestamp) => {
  trackData.startTimestamp += timestamp;
  trackData.endTimestamp += timestamp;
  for (const sample of trackData.samples) {
    sample.presentationTimestamp += timestamp;
  }
  for (const entry of trackData.presentationTimestamps) {
    entry.presentationTimestamp += timestamp;
  }
};
var extractRotationFromMatrix = (matrix) => {
  const [a, b] = matrix;
  const radians = Math.atan2(b, a);
  if (!Number.isFinite(radians)) {
    return 0;
  }
  return radians * (180 / Math.PI);
};
var sampleTableIsEmpty = (sampleTable) => {
  return sampleTable.sampleSizes.length === 0;
};
var getOrCreateEncryptionAuxInfo = (track) => {
  if (track.currentFragmentState) {
    return track.currentFragmentState.encryptionAuxInfo ??= {
      defaultSampleInfoSize: 0,
      sampleSizes: null,
      sampleCount: 0,
      offset: null,
      resolved: null
    };
  } else {
    return track.encryptionAuxInfo ??= {
      defaultSampleInfoSize: 0,
      sampleSizes: null,
      sampleCount: 0,
      offset: null,
      resolved: null
    };
  }
};
var resolveEncryptionAuxInfo = async (reader, encryptionInfo, aux) => {
  if (aux.resolved) {
    return aux.resolved;
  }
  if (aux.offset === null || aux.sampleCount === 0) {
    throw new Error("Incomplete saiz/saio info; cannot resolve encryption data.");
  }
  let totalSize = 0;
  if (aux.defaultSampleInfoSize > 0) {
    totalSize = aux.defaultSampleInfoSize * aux.sampleCount;
  } else {
    assert(aux.sampleSizes);
    for (let i = 0; i < aux.sampleCount; i++) {
      totalSize += aux.sampleSizes[i];
    }
  }
  let slice = reader.requestSlice(aux.offset, totalSize);
  if (slice instanceof Promise)
    slice = await slice;
  if (!slice) {
    throw new Error("Failed to read auxiliary encryption info.");
  }
  const ivSize = encryptionInfo.defaultPerSampleIvSize;
  assert(ivSize !== null);
  const entries = [];
  for (let i = 0; i < aux.sampleCount; i++) {
    const entrySize = aux.defaultSampleInfoSize > 0 ? aux.defaultSampleInfoSize : aux.sampleSizes[i];
    const iv = new Uint8Array(16);
    if (ivSize > 0) {
      iv.set(readBytes(slice, ivSize), 0);
    } else {
      iv.set(encryptionInfo.defaultConstantIv, 0);
    }
    let subsamples = null;
    if (entrySize > ivSize) {
      const subsampleCount = readU16Be(slice);
      subsamples = [];
      for (let j = 0; j < subsampleCount; j++) {
        const clearLen = readU16Be(slice);
        const protectedLen = readU32Be(slice);
        subsamples.push({ clearLen, protectedLen });
      }
    }
    entries.push({ iv, subsamples });
  }
  aux.resolved = entries;
  return entries;
};
var decryptSample = async (track, sampleEncryption, data, fragment) => {
  assert(track.encryptionInfo);
  const encryptionInfo = track.encryptionInfo;
  assert(encryptionInfo.defaultKid !== null);
  const keyId = encryptionInfo.defaultKid;
  let keyBytes;
  const cacheEntry = track.demuxer.decryptionKeyCache.get(keyId);
  if (cacheEntry) {
    keyBytes = await cacheEntry;
  } else {
    if (!track.demuxer.input._formatOptions.isobmff?.resolveKeyId) {
      throw new Error("Encrypted media samples encountered. To decrypt them, please provide a callback for InputOptions.formatOptions.isobmff.resolveKeyId.");
    }
    const promise = (async () => {
      let psshBoxes = track.demuxer.psshBoxes;
      if (fragment) {
        psshBoxes = [
          ...psshBoxes,
          ...fragment.psshBoxes
        ].filter((x) => x.keyIds === null || x.keyIds.includes(keyId));
        for (let i = 0; i < psshBoxes.length - 1; i++) {
          for (let j = i + 1; j < psshBoxes.length; j++) {
            if (psshBoxesAreEqual(psshBoxes[i], psshBoxes[j])) {
              psshBoxes.splice(j, 1);
              j--;
            }
          }
        }
      }
      const keyResult = await track.demuxer.input._formatOptions.isobmff.resolveKeyId({ keyId, psshBoxes });
      if (!(typeof keyResult === "string" && keyResult.length === 32 && HEX_STRING_REGEX.test(keyResult) || keyResult instanceof Uint8Array && keyResult.byteLength === 16)) {
        throw new TypeError("resolveKeyId must return a 32-character hex string or a 16-byte Uint8Array containing the decryption key.");
      }
      return keyResult instanceof Uint8Array ? keyResult : hexStringToBytes(keyResult);
    })();
    track.demuxer.decryptionKeyCache.set(keyId, promise);
    keyBytes = await promise;
  }
  if (encryptionInfo.scheme === "cenc" || encryptionInfo.scheme === "cens") {
    return decryptCtr(keyBytes, encryptionInfo, sampleEncryption, data);
  } else {
    return decryptCbcs(keyBytes, encryptionInfo, sampleEncryption, data);
  }
};
var decryptCtr = async (key, encryptionInfo, sampleEncryption, data) => {
  const counter = new Uint8Array(16);
  counter.set(sampleEncryption.iv, 0);
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-CTR" }, false, ["decrypt"]);
  const cryptApply = async (input) => {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-CTR", counter, length: 64 }, cryptoKey, input);
    return new Uint8Array(plaintext);
  };
  if (!sampleEncryption.subsamples) {
    return cryptApply(data);
  }
  assert(encryptionInfo.defaultCryptByteBlock !== null && encryptionInfo.defaultSkipByteBlock !== null);
  const cryptRanges = collectCryptRanges(sampleEncryption.subsamples, encryptionInfo.defaultCryptByteBlock, encryptionInfo.defaultSkipByteBlock);
  let totalCryptLen = 0;
  for (const range of cryptRanges) {
    for (const seg of range.perSubsample) {
      totalCryptLen += seg.length;
    }
  }
  const cryptBuffer = new Uint8Array(totalCryptLen);
  let writePos = 0;
  for (const range of cryptRanges) {
    for (const seg of range.perSubsample) {
      cryptBuffer.set(data.subarray(seg.offset, seg.offset + seg.length), writePos);
      writePos += seg.length;
    }
  }
  const plain = await cryptApply(cryptBuffer);
  const output = new Uint8Array(data);
  let readPos = 0;
  for (const range of cryptRanges) {
    for (const seg of range.perSubsample) {
      output.set(plain.subarray(readPos, readPos + seg.length), seg.offset);
      readPos += seg.length;
    }
  }
  return output;
};
var decryptCbcs = (key, encryptionInfo, sampleEncryption, data) => {
  const ctx = new Aes128CbcContext();
  ctx.init({ key, iv: sampleEncryption.iv });
  const cryptByteBlock = encryptionInfo.defaultCryptByteBlock;
  const skipByteBlock = encryptionInfo.defaultSkipByteBlock;
  assert(cryptByteBlock !== null && skipByteBlock !== null);
  if (!sampleEncryption.subsamples) {
    const output2 = new Uint8Array(data);
    const numBlocks = Math.floor(data.length / 16);
    for (let b = 0; b < numBlocks; b++) {
      const off = b * 16;
      ctx.in.set(data.subarray(off, off + 16));
      ctx.decrypt();
      output2.set(ctx.out, off);
    }
    return output2;
  }
  if (cryptByteBlock === 0 && skipByteBlock === 0) {
    throw new Error("cbcs with subsamples requires pattern encryption.");
  }
  const output = new Uint8Array(data);
  const cryptRanges = collectCryptRanges(sampleEncryption.subsamples, cryptByteBlock, skipByteBlock);
  const ivView = new DataView(sampleEncryption.iv.buffer, sampleEncryption.iv.byteOffset, 16);
  for (const range of cryptRanges) {
    ctx.iv[0] = ivView.getUint32(0, false);
    ctx.iv[1] = ivView.getUint32(4, false);
    ctx.iv[2] = ivView.getUint32(8, false);
    ctx.iv[3] = ivView.getUint32(12, false);
    for (const seg of range.perSubsample) {
      const numBlocks = seg.length / 16;
      for (let b = 0; b < numBlocks; b++) {
        const offset = seg.offset + b * 16;
        ctx.in.set(data.subarray(offset, offset + 16));
        ctx.decrypt();
        output.set(ctx.out, offset);
      }
    }
  }
  return output;
};
var collectCryptRanges = (subsamples, cryptByteBlock, skipByteBlock) => {
  const ranges = [];
  const hasPattern = cryptByteBlock !== 0 || skipByteBlock !== 0;
  let cursor = 0;
  for (const subsample of subsamples) {
    cursor += subsample.clearLen;
    const perSubsample = [];
    if (!hasPattern) {
      if (subsample.protectedLen > 0) {
        perSubsample.push({ offset: cursor, length: subsample.protectedLen });
      }
      cursor += subsample.protectedLen;
    } else {
      let remaining = subsample.protectedLen;
      let pos = cursor;
      while (remaining > 0) {
        if (remaining < 16 * cryptByteBlock) {
          break;
        }
        const cryptBytes = 16 * cryptByteBlock;
        perSubsample.push({ offset: pos, length: cryptBytes });
        pos += cryptBytes;
        remaining -= cryptBytes;
        const skipBytes = Math.min(16 * skipByteBlock, remaining);
        pos += skipBytes;
        remaining -= skipBytes;
      }
      cursor += subsample.protectedLen;
    }
    ranges.push({ perSubsample });
  }
  return ranges;
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/adts/adts-reader.js
var MIN_ADTS_FRAME_HEADER_SIZE = 7;
var MAX_ADTS_FRAME_HEADER_SIZE = 9;
var readAdtsFrameHeader = (slice) => {
  const startPos = slice.filePos;
  const bytes2 = readBytes(slice, 9);
  const bitstream = new Bitstream(bytes2);
  const syncword = bitstream.readBits(12);
  if (syncword !== 4095) {
    return null;
  }
  bitstream.skipBits(1);
  const layer = bitstream.readBits(2);
  if (layer !== 0) {
    return null;
  }
  const protectionAbsence = bitstream.readBits(1);
  const objectType = bitstream.readBits(2) + 1;
  const samplingFrequencyIndex = bitstream.readBits(4);
  if (samplingFrequencyIndex === 15) {
    return null;
  }
  bitstream.skipBits(1);
  const channelConfiguration = bitstream.readBits(3);
  if (channelConfiguration === 0) {
    throw new Error("ADTS frames with channel configuration 0 are not supported.");
  }
  bitstream.skipBits(1);
  bitstream.skipBits(1);
  bitstream.skipBits(1);
  bitstream.skipBits(1);
  const frameLength = bitstream.readBits(13);
  bitstream.skipBits(11);
  const numberOfAacFrames = bitstream.readBits(2) + 1;
  if (numberOfAacFrames !== 1) {
    throw new Error("ADTS frames with more than one AAC frame are not supported.");
  }
  let crcCheck = null;
  if (protectionAbsence === 1) {
    slice.filePos -= 2;
  } else {
    crcCheck = bitstream.readBits(16);
  }
  return {
    objectType,
    samplingFrequencyIndex,
    channelConfiguration,
    frameLength,
    numberOfAacFrames,
    crcCheck,
    startPos
  };
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/mpeg-ts/mpeg-ts-misc.js
var TIMESCALE = 9e4;
var TS_PACKET_SIZE = 188;
var buildMpegTsMimeType = (codecStrings) => {
  let string = "video/MP2T";
  const uniqueCodecStrings = [...new Set(codecStrings.filter(Boolean))];
  if (uniqueCodecStrings.length > 0) {
    string += `; codecs="${uniqueCodecStrings.join(", ")}"`;
  }
  return string;
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/hls/hls-misc.js
var HLS_MIME_TYPE = "application/vnd.apple.mpegurl";

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/source.js
polyfillSymbolDispose();
var DEFAULT_MIN_READ_POSITION = 0;
var DEFAULT_MAX_READ_POSITION = Infinity;
var sourceFinalizationRegistry = null;
if (typeof FinalizationRegistry !== "undefined") {
  sourceFinalizationRegistry = new FinalizationRegistry((cleanup) => {
    cleanup();
  });
}
var Source = class extends EventEmitter {
  constructor() {
    super();
    this._disposed = false;
    this._refCount = 0;
    this._usedForHls = false;
    this._refFinalizationRegistry = null;
    this._sizePromise = null;
    this.onread = null;
    if (typeof FinalizationRegistry !== "undefined") {
      this._refFinalizationRegistry = new FinalizationRegistry((source) => {
        source._decrementRefCount();
      });
    }
  }
  /**
   * Resolves with the total size of the file in bytes. This function is memoized, meaning only the first call
   * will retrieve the size.
   *
   * Returns null if the source is unsized.
   */
  async getSizeOrNull() {
    if (this._disposed) {
      throw new InputDisposedError();
    }
    return this._sizePromise ??= (async () => {
      let size = this._getFileSize();
      if (size !== void 0) {
        return size;
      }
      await this._read(0, 1, DEFAULT_MIN_READ_POSITION, DEFAULT_MAX_READ_POSITION);
      size = this._getFileSize();
      assert(size !== void 0);
      return size;
    })();
  }
  /**
   * Resolves with the total size of the file in bytes. This function is memoized, meaning only the first call
   * will retrieve the size.
   *
   * Throws an error if the source is unsized.
   */
  async getSize() {
    if (this._disposed) {
      throw new InputDisposedError();
    }
    const result = await this.getSizeOrNull();
    if (result === null) {
      throw new Error("Cannot determine the size of an unsized source.");
    }
    return result;
  }
  /**
   * Returns a new {@link RangedSource} that maps data onto this source using the given offset and length. If a length
   * is not provided, the ranged source spans until the end of this source's data.
   *
   * Useful for reading files that are embedded within larger files.
   */
  slice(offset, length) {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new TypeError("offset must be a non-negative integer.");
    }
    if (length !== void 0 && (!Number.isInteger(length) || length < 0)) {
      throw new TypeError("length, when provided, must be a non-negative integer.");
    }
    return new RangedSource(this, offset, length);
  }
  /** @internal */
  _dispatchRead(start, end) {
    this.onread?.(start, end);
    this._emit("read", { start, end });
  }
  /**
   * Creates a new `SourceRef` pointing to this source. You are expected to call `.free()` on said `SourceRef` when
   * you're done with it.
   */
  ref() {
    return new SourceRef(this);
  }
  /** @internal */
  _incrementRefCount() {
    this._refCount++;
  }
  /** @internal */
  _decrementRefCount() {
    this._refCount--;
    if (this._refCount === 0) {
      this._dispose();
      this._disposed = true;
    }
  }
};
var SourceRef = class {
  /** @internal */
  constructor(source) {
    this._freed = false;
    if (source._disposed) {
      throw new Error("Cannot ref a disposed source.");
    }
    source._incrementRefCount();
    source._refFinalizationRegistry?.register(this, source, this);
    this._source = source;
  }
  /** The {@link Source} this ref references. Accessing this field throws an error after having freed the ref. */
  get source() {
    if (!this._source) {
      throw new Error("Can't get source; ref has already been freed.");
    }
    return this._source;
  }
  /** Whether or not this reference has been freed via {@link SourceRef.free}. */
  get freed() {
    return this._freed;
  }
  /**
   * Frees the ref, decrementing the source's internal reference count. If the source's internal reference count
   * reaches zero, it gets disposed. To catch bugs, this method throws if the ref is already freed.
   */
  free() {
    if (this._freed) {
      throw new Error("Illegal operation: double free on SourceRef.");
    }
    const source = this.source;
    assert(source._refCount > 0);
    source._decrementRefCount();
    source._refFinalizationRegistry?.unregister(this);
    this._freed = true;
    this._source = null;
  }
  /**
   * Calls {@link SourceRef.free}.
   */
  [Symbol.dispose]() {
    if (!this.freed) {
      this.free();
    }
  }
};
var PathedSource = class extends Source {
  constructor(rootPath, requestHandler) {
    if (typeof rootPath !== "string") {
      throw new TypeError("rootPath must be a string.");
    }
    if (typeof requestHandler !== "function") {
      throw new TypeError("requestHandler must be a function.");
    }
    super();
    this.rootPath = rootPath;
    this.requestHandler = requestHandler;
  }
  /** @internal */
  _resolveRequest(request) {
    const result = this.requestHandler(request);
    const handle = (result2) => {
      if (!(result2 instanceof Source || result2 instanceof SourceRef)) {
        throw new TypeError("requestHandler must return or resolve to a Source or SourceRef.");
      }
      const ref = result2 instanceof Source ? result2.ref() : result2;
      ref.source._usedForHls ||= this._usedForHls;
      return ref;
    };
    if (result instanceof Promise) {
      return result.then(handle);
    } else {
      return handle(result);
    }
  }
};
var sourceRequestsAreEqual = (a, b) => {
  return a.path === b.path;
};
var BufferSource = class extends Source {
  /**
   * Creates a new {@link BufferSource} backed by the specified `ArrayBuffer`, `SharedArrayBuffer`,
   * or `ArrayBufferView`.
   */
  constructor(buffer) {
    if (!(buffer instanceof ArrayBuffer) && !(typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer) && !ArrayBuffer.isView(buffer)) {
      throw new TypeError("buffer must be an ArrayBuffer, SharedArrayBuffer, or ArrayBufferView.");
    }
    super();
    this._onreadCalled = false;
    this._bytes = toUint8Array(buffer);
    this._view = toDataView(buffer);
  }
  /** @internal */
  _getFileSize() {
    return this._bytes.byteLength;
  }
  /** @internal */
  _read() {
    if (!this._onreadCalled) {
      this._dispatchRead(0, this._bytes.byteLength);
      this._onreadCalled = true;
    }
    return {
      bytes: this._bytes,
      view: this._view,
      offset: 0
    };
  }
  /** @internal */
  _dispose() {
  }
};
var BlobSource = class extends Source {
  /**
   * Creates a new {@link BlobSource} backed by the specified
   * [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob).
   */
  constructor(blob, options = {}) {
    if (!(blob instanceof Blob)) {
      throw new TypeError("blob must be a Blob.");
    }
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.maxCacheSize !== void 0 && (!isNumber(options.maxCacheSize) || options.maxCacheSize < 0)) {
      throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
    }
    if (options.useStreamReader !== void 0 && typeof options.useStreamReader !== "boolean") {
      throw new TypeError("options.useStreamReader, when provided, must be a boolean.");
    }
    super();
    this._readers = /* @__PURE__ */ new WeakMap();
    this._blob = blob;
    this._options = options;
    this._orchestrator = new ReadOrchestrator({
      maxCacheSize: options.maxCacheSize ?? 8 * 2 ** 20,
      maxWorkerCount: 4,
      runWorker: this._runWorker.bind(this),
      prefetchProfile: PREFETCH_PROFILES.fileSystem
    });
    this._orchestrator.fileSize = blob.size;
  }
  /** @internal */
  _getFileSize() {
    return this._orchestrator.fileSize;
  }
  /** @internal */
  _read(start, end, minReadPosition, maxReadPosition) {
    return this._orchestrator.read(start, end, minReadPosition, maxReadPosition);
  }
  /** @internal */
  async _runWorker(worker) {
    assert(worker.strictTarget);
    let reader = this._readers.get(worker);
    if (reader === void 0) {
      if ("stream" in this._blob && !isWebKit() && this._options.useStreamReader !== false) {
        const slice = this._blob.slice(worker.currentPos);
        reader = slice.stream().getReader();
      } else {
        reader = null;
      }
      this._readers.set(worker, reader);
    }
    while (worker.currentPos < worker.targetPos && !worker.aborted) {
      if (reader) {
        const { done, value } = await reader.read();
        if (done) {
          this._orchestrator.onWorkerFinished(worker);
          throw new Error("Blob reader stopped unexpectedly before all requested data was read.");
        }
        if (worker.aborted) {
          break;
        }
        this._dispatchRead(worker.currentPos, worker.currentPos + value.length);
        this._orchestrator.supplyWorkerData(worker, value);
      } else {
        const data = await this._blob.slice(worker.currentPos, worker.targetPos).arrayBuffer();
        if (worker.aborted) {
          break;
        }
        this._dispatchRead(worker.currentPos, worker.currentPos + data.byteLength);
        this._orchestrator.supplyWorkerData(worker, new Uint8Array(data));
      }
    }
    this._orchestrator.signalWorkerStoppedRunning(worker);
    if (worker.aborted) {
      await reader?.cancel();
    }
  }
  /** @internal */
  _dispose() {
    this._orchestrator.dispose();
  }
};
var URL_SOURCE_MIN_LOAD_AMOUNT = 0.5 * 2 ** 20;
var PREFETCH_PROFILES = {
  none: (start, end) => ({ start, end }),
  fileSystem: (start, end) => {
    const padding = 2 ** 16;
    start = Math.floor((start - padding) / padding) * padding;
    end = Math.ceil((end + padding) / padding) * padding;
    return { start, end };
  },
  network: (start, end, workers) => {
    const paddingStart = 2 ** 16;
    start = Math.max(0, Math.floor((start - paddingStart) / paddingStart) * paddingStart);
    for (const worker of workers) {
      const maxExtensionAmount = 8 * 2 ** 20;
      const thresholdPoint = Math.max((worker.startPos + worker.targetPos) / 2, worker.targetPos - maxExtensionAmount);
      if (closedIntervalsOverlap(start, end, thresholdPoint, worker.targetPos)) {
        const size = worker.targetPos - worker.startPos;
        const a = Math.ceil((size + 1) / maxExtensionAmount) * maxExtensionAmount;
        const b = 2 ** Math.ceil(Math.log2(size + 1));
        const extent = Math.min(b, a);
        end = Math.max(end, worker.startPos + extent);
      }
    }
    end = Math.max(end, start + URL_SOURCE_MIN_LOAD_AMOUNT);
    return {
      start,
      end
    };
  }
};
var ReadOrchestrator = class {
  constructor(options) {
    this.options = options;
    this.fileSize = null;
    this.nextAge = 0;
    this.workers = [];
    this.cache = [];
    this.currentCacheSize = 0;
    this.disposed = false;
    this.queuedReads = [];
  }
  read(innerStart, innerEnd, minReadPosition, maxReadPosition) {
    assert(!this.disposed);
    const prefetchRange = this.options.prefetchProfile(innerStart, innerEnd, this.workers);
    const outerStart = Math.max(prefetchRange.start, minReadPosition);
    const outerEnd = Math.min(prefetchRange.end, this.fileSize ?? Infinity, maxReadPosition);
    assert(outerStart <= innerStart && innerEnd <= outerEnd);
    let result = null;
    const innerCacheStartIndex = binarySearchLessOrEqual(this.cache, innerStart, (x) => x.start);
    const innerStartEntry = innerCacheStartIndex !== -1 ? this.cache[innerCacheStartIndex] : null;
    if (innerStartEntry && innerStartEntry.start <= innerStart && innerEnd <= innerStartEntry.end) {
      innerStartEntry.age = this.nextAge++;
      result = {
        bytes: innerStartEntry.bytes,
        view: innerStartEntry.view,
        offset: innerStartEntry.start
      };
    }
    const outerCacheStartIndex = binarySearchLessOrEqual(this.cache, outerStart, (x) => x.start);
    const bytes2 = result ? null : new Uint8Array(innerEnd - innerStart);
    let contiguousBytesWriteEnd = 0;
    let lastEnd = outerStart;
    const outerHoles = [];
    if (outerCacheStartIndex !== -1) {
      for (let i = outerCacheStartIndex; i < this.cache.length; i++) {
        const entry = this.cache[i];
        if (entry.start >= outerEnd) {
          break;
        }
        if (entry.end <= outerStart) {
          continue;
        }
        const cappedOuterStart = Math.max(outerStart, entry.start);
        const cappedOuterEnd = Math.min(outerEnd, entry.end);
        assert(cappedOuterStart <= cappedOuterEnd);
        if (lastEnd < cappedOuterStart) {
          outerHoles.push({ start: lastEnd, end: cappedOuterStart });
        }
        lastEnd = cappedOuterEnd;
        if (bytes2) {
          const cappedInnerStart = Math.max(innerStart, entry.start);
          const cappedInnerEnd = Math.min(innerEnd, entry.end);
          if (cappedInnerStart < cappedInnerEnd) {
            const relativeOffset = cappedInnerStart - innerStart;
            bytes2.set(entry.bytes.subarray(cappedInnerStart - entry.start, cappedInnerEnd - entry.start), relativeOffset);
            if (relativeOffset === contiguousBytesWriteEnd) {
              contiguousBytesWriteEnd = cappedInnerEnd - innerStart;
            }
          }
        }
        entry.age = this.nextAge++;
      }
      if (lastEnd < outerEnd) {
        outerHoles.push({ start: lastEnd, end: outerEnd });
      }
    } else {
      outerHoles.push({ start: outerStart, end: outerEnd });
    }
    if (bytes2 && contiguousBytesWriteEnd >= bytes2.length) {
      result = {
        bytes: bytes2,
        view: toDataView(bytes2),
        offset: innerStart
      };
    }
    if (outerHoles.length === 0) {
      assert(result);
      return result;
    }
    const { promise, resolve, reject } = promiseWithResolvers();
    const innerHoles = [];
    for (const outerHole of outerHoles) {
      const cappedStart = Math.max(innerStart, outerHole.start);
      const cappedEnd = Math.min(innerEnd, outerHole.end);
      if (cappedStart === outerHole.start && cappedEnd === outerHole.end) {
        innerHoles.push(outerHole);
      } else if (cappedStart < cappedEnd) {
        innerHoles.push({ start: cappedStart, end: cappedEnd });
      }
    }
    const pendingSlice = bytes2 && {
      start: innerStart,
      bytes: bytes2,
      holes: innerHoles,
      resolve,
      reject
    };
    outer: for (const outerHole of outerHoles) {
      for (const worker of this.workers) {
        const addedToWorker = this.checkHoleAgainstWorker(worker, outerHole, pendingSlice ? [pendingSlice] : []);
        if (addedToWorker) {
          this.checkQueuedReadsAgainstWorker(worker);
          continue outer;
        }
      }
      const strictTarget = outerHole.end < outerEnd || this.fileSize !== null;
      const newWorker = this.createWorker(outerHole.start, outerHole.end, strictTarget);
      if (newWorker) {
        if (pendingSlice) {
          newWorker.pendingSlices = [pendingSlice];
        }
        this.runWorker(newWorker);
      } else {
        let index = binarySearchLessOrEqual(this.queuedReads, outerHole.start, (x) => x.hole.start);
        let entry = index !== -1 ? this.queuedReads[index] : null;
        if (entry && outerHole.start <= entry.hole.end) {
          entry.hole.end = Math.max(entry.hole.end, outerHole.end);
          entry.strictTarget &&= strictTarget;
          if (pendingSlice) {
            entry.pendingSlices.push(pendingSlice);
          }
        } else {
          index++;
          entry = {
            hole: {
              // Clone the hole because it might be mutated later
              start: outerHole.start,
              end: outerHole.end
            },
            strictTarget,
            pendingSlices: pendingSlice ? [pendingSlice] : [],
            age: this.nextAge++
          };
          this.queuedReads.splice(index, 0, entry);
        }
        while (index + 1 < this.queuedReads.length) {
          const nextEntry = this.queuedReads[index + 1];
          if (nextEntry.hole.start > entry.hole.end) {
            break;
          }
          entry.hole.end = Math.max(entry.hole.end, nextEntry.hole.end);
          entry.pendingSlices.push(...nextEntry.pendingSlices);
          entry.strictTarget &&= nextEntry.strictTarget;
          entry.age = Math.min(entry.age, nextEntry.age);
          this.queuedReads.splice(index + 1, 1);
        }
      }
    }
    if (!result) {
      assert(bytes2);
      result = promise.then((bytes3) => bytes3 && {
        bytes: bytes3,
        view: toDataView(bytes3),
        offset: innerStart
      });
    } else {
    }
    return result;
  }
  checkHoleAgainstWorker(worker, hole, pendingSlices) {
    const gapTolerance = 2 ** 17;
    if (closedIntervalsOverlap(hole.start - gapTolerance, hole.start, worker.currentPos, worker.targetPos)) {
      worker.targetPos = Math.max(worker.targetPos, hole.end);
      for (let i = 0; i < pendingSlices.length; i++) {
        const pendingSlice = pendingSlices[i];
        if (!worker.pendingSlices.includes(pendingSlice)) {
          worker.pendingSlices.push(pendingSlice);
        }
      }
      if (!worker.running) {
        this.runWorker(worker);
      }
      return true;
    }
    return false;
  }
  checkQueuedReadsAgainstWorker(worker) {
    let wasTrueOnce = false;
    for (let i = 0; i < this.queuedReads.length; i++) {
      const queuedRead = this.queuedReads[i];
      const result = this.checkHoleAgainstWorker(worker, queuedRead.hole, queuedRead.pendingSlices);
      if (result) {
        this.queuedReads.splice(i, 1);
        i--;
        wasTrueOnce = true;
      } else if (wasTrueOnce) {
        break;
      }
    }
  }
  createWorker(startPos, targetPos, strictTarget) {
    if (this.workers.length >= this.options.maxWorkerCount) {
      let oldestWorker = null;
      let oldestIndex = null;
      for (let i = 0; i < this.workers.length; i++) {
        const worker2 = this.workers[i];
        if (!worker2.running && worker2.pendingSlices.length === 0 && (!oldestWorker || worker2.age < oldestWorker.age)) {
          oldestIndex = i;
          oldestWorker = worker2;
        }
      }
      if (oldestWorker) {
        assert(oldestIndex !== null);
        assert(oldestWorker.pendingSlices.length === 0);
        this.workers.splice(oldestIndex, 1);
      } else {
        return null;
      }
    }
    const worker = {
      startPos,
      currentPos: startPos,
      targetPos,
      strictTarget,
      running: false,
      // Due to async shenanigans, it can happen that workers are started after disposal. In this case, instead of
      // simply not creating the worker, we allow it to run but immediately label it as aborted, so it can then
      // shut itself down.
      aborted: this.disposed,
      pendingSlices: [],
      age: this.nextAge++
    };
    this.workers.push(worker);
    return worker;
  }
  runWorker(worker) {
    assert(!worker.running);
    assert(worker.currentPos < worker.targetPos);
    worker.running = true;
    worker.age = this.nextAge++;
    void this.options.runWorker(worker).catch((error) => {
      worker.running = false;
      if (worker.pendingSlices.length > 0) {
        worker.pendingSlices.forEach((x) => x.reject(error));
        worker.pendingSlices.length = 0;
      } else {
        throw error;
      }
    }).finally(() => {
      if (worker.running) {
        return;
      }
      if (this.queuedReads.length > 0) {
        let oldestIndex = 0;
        for (let i = 1; i < this.queuedReads.length; i++) {
          const queuedRead2 = this.queuedReads[i];
          if (queuedRead2.age < this.queuedReads[oldestIndex].age) {
            oldestIndex = i;
          }
        }
        const queuedRead = this.queuedReads[oldestIndex];
        this.queuedReads.splice(oldestIndex, 1);
        const newWorker = this.createWorker(queuedRead.hole.start, queuedRead.hole.end, queuedRead.strictTarget);
        assert(newWorker);
        newWorker.pendingSlices = queuedRead.pendingSlices;
        this.runWorker(newWorker);
      }
    });
  }
  consolidateEverythingIntoOneWorker(worker) {
    const uniqueSlices = new Set(worker.pendingSlices);
    for (let i = 0; i < this.workers.length; i++) {
      const otherWorker = this.workers[i];
      if (otherWorker === worker) {
        continue;
      }
      for (const slice of otherWorker.pendingSlices) {
        uniqueSlices.add(slice);
      }
      otherWorker.aborted = true;
      otherWorker.pendingSlices.length = 0;
      this.workers.splice(i, 1);
      i--;
    }
    for (let i = 0; i < this.queuedReads.length; i++) {
      const queuedRead = this.queuedReads[i];
      for (const slice of queuedRead.pendingSlices) {
        uniqueSlices.add(slice);
      }
    }
    worker.pendingSlices = [...uniqueSlices];
    this.queuedReads.length = 0;
  }
  /** Called by a worker when it has read some data. */
  supplyWorkerData(worker, bytes2) {
    assert(!worker.aborted);
    const start = worker.currentPos;
    const end = start + bytes2.length;
    this.insertIntoCache({
      start,
      end,
      bytes: bytes2,
      view: toDataView(bytes2),
      age: this.nextAge++
    });
    worker.currentPos += bytes2.length;
    if (worker.currentPos > worker.targetPos) {
      worker.targetPos = worker.currentPos;
      this.checkQueuedReadsAgainstWorker(worker);
    }
    for (let i = 0; i < worker.pendingSlices.length; i++) {
      const pendingSlice = worker.pendingSlices[i];
      const clampedStart = Math.max(start, pendingSlice.start);
      const clampedEnd = Math.min(end, pendingSlice.start + pendingSlice.bytes.length);
      if (clampedStart < clampedEnd) {
        pendingSlice.bytes.set(bytes2.subarray(clampedStart - start, clampedEnd - start), clampedStart - pendingSlice.start);
      }
      for (let j = 0; j < pendingSlice.holes.length; j++) {
        const hole = pendingSlice.holes[j];
        if (start <= hole.start && end > hole.start) {
          hole.start = end;
        }
        if (hole.end <= hole.start) {
          pendingSlice.holes.splice(j, 1);
          j--;
        }
      }
      if (pendingSlice.holes.length === 0) {
        pendingSlice.resolve(pendingSlice.bytes);
        worker.pendingSlices.splice(i, 1);
        i--;
      }
    }
    for (let i = 0; i < this.workers.length; i++) {
      const otherWorker = this.workers[i];
      if (worker === otherWorker || otherWorker.running) {
        continue;
      }
      if (closedIntervalsOverlap(start, end, otherWorker.currentPos, otherWorker.targetPos)) {
        this.workers.splice(i, 1);
        i--;
      }
    }
  }
  supplyFileSize(size) {
    assert(this.fileSize === null);
    this.fileSize = size;
    for (const worker of this.workers) {
      worker.targetPos = Math.min(worker.targetPos, size);
      worker.strictTarget = true;
      for (let i = 0; i < worker.pendingSlices.length; i++) {
        const pendingSlice = worker.pendingSlices[i];
        for (const hole of pendingSlice.holes) {
          if (hole.end > size) {
            pendingSlice.resolve(null);
            worker.pendingSlices.splice(i, 1);
            i--;
            break;
          }
        }
      }
    }
    for (let i = 0; i < this.queuedReads.length; i++) {
      const queuedRead = this.queuedReads[i];
      if (queuedRead.hole.start >= size) {
        for (const slice of queuedRead.pendingSlices)
          slice.resolve(null);
        this.queuedReads.splice(i, 1);
        i--;
      } else if (queuedRead.hole.end > size) {
        queuedRead.hole.end = size;
        queuedRead.strictTarget = true;
        for (let j = 0; j < queuedRead.pendingSlices.length; j++) {
          const slice = queuedRead.pendingSlices[j];
          if (slice.start >= size) {
            slice.resolve(null);
            queuedRead.pendingSlices.splice(j, 1);
            j--;
          }
        }
      }
    }
  }
  signalWorkerStoppedRunning(worker) {
    worker.running = false;
    worker.pendingSlices.length = 0;
  }
  /** Called when a worker reaches the end of the underlying data and must be cleaned up. */
  onWorkerFinished(worker) {
    const index = this.workers.indexOf(worker);
    assert(index !== -1);
    worker.running = false;
    this.workers.splice(index, 1);
    if (this.fileSize === null) {
      this.supplyFileSize(worker.currentPos);
    }
    for (const pendingSlice of worker.pendingSlices) {
      pendingSlice.resolve(null);
    }
  }
  insertIntoCache(entry) {
    if (this.options.maxCacheSize === 0) {
      return;
    }
    let insertionIndex = binarySearchLessOrEqual(this.cache, entry.start, (x) => x.start) + 1;
    if (insertionIndex > 0) {
      const previous = this.cache[insertionIndex - 1];
      if (previous.end >= entry.end) {
        return;
      }
      if (previous.end > entry.start) {
        const joined = new Uint8Array(entry.end - previous.start);
        joined.set(previous.bytes, 0);
        joined.set(entry.bytes, entry.start - previous.start);
        this.currentCacheSize += entry.end - previous.end;
        previous.bytes = joined;
        previous.view = toDataView(joined);
        previous.end = entry.end;
        insertionIndex--;
        entry = previous;
      } else {
        this.cache.splice(insertionIndex, 0, entry);
        this.currentCacheSize += entry.bytes.length;
      }
    } else {
      this.cache.splice(insertionIndex, 0, entry);
      this.currentCacheSize += entry.bytes.length;
    }
    for (let i = insertionIndex + 1; i < this.cache.length; i++) {
      const next = this.cache[i];
      if (entry.end <= next.start) {
        break;
      }
      if (entry.end >= next.end) {
        this.cache.splice(i, 1);
        this.currentCacheSize -= next.bytes.length;
        i--;
        continue;
      }
      const joined = new Uint8Array(next.end - entry.start);
      joined.set(entry.bytes, 0);
      joined.set(next.bytes, next.start - entry.start);
      this.currentCacheSize -= entry.end - next.start;
      entry.bytes = joined;
      entry.view = toDataView(joined);
      entry.end = next.end;
      this.cache.splice(i, 1);
      break;
    }
    while (this.currentCacheSize > this.options.maxCacheSize) {
      let oldestIndex = 0;
      let oldestEntry = this.cache[0];
      for (let i = 1; i < this.cache.length; i++) {
        const entry2 = this.cache[i];
        if (entry2.age < oldestEntry.age) {
          oldestIndex = i;
          oldestEntry = entry2;
        }
      }
      if (this.currentCacheSize - oldestEntry.bytes.length <= this.options.maxCacheSize) {
        break;
      }
      this.cache.splice(oldestIndex, 1);
      this.currentCacheSize -= oldestEntry.bytes.length;
    }
  }
  dispose() {
    for (const worker of this.workers) {
      worker.aborted = true;
    }
    this.workers.length = 0;
    this.cache.length = 0;
    this.disposed = true;
  }
};
var RangedSource = class extends Source {
  /** @internal */
  constructor(baseSource, offset, length) {
    super();
    this._ref = null;
    if (baseSource._disposed) {
      throw new Error("Cannot create a slice of a disposed source.");
    }
    this._baseSource = baseSource;
    this._offset = offset;
    this._length = length ?? null;
  }
  /** @internal */
  _getFileSize() {
    const baseSize = this._baseSource._getFileSize();
    if (baseSize === void 0) {
      return this._length !== null ? this._length : void 0;
    }
    if (baseSize === null) {
      if (this._length !== null) {
        return this._length;
      } else {
        return null;
      }
    }
    return clamp(baseSize - this._offset, 0, this._length ?? Infinity);
  }
  /** @internal */
  _read(start, end, minReadPosition, maxReadPosition) {
    if (this._length !== null && end > this._length) {
      return null;
    }
    const result = this._baseSource._read(this._offset + start, this._offset + end, this._offset + minReadPosition, this._offset + maxReadPosition);
    if (result instanceof Promise) {
      return result.then((result2) => {
        if (!result2) {
          return null;
        }
        result2.offset -= this._offset;
        return result2;
      });
    } else {
      if (!result) {
        return null;
      }
      result.offset -= this._offset;
      return result;
    }
  }
  /** @internal */
  _dispose() {
    this._ref?.free();
  }
  ref() {
    this._ref ??= this._baseSource.ref();
    return super.ref();
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/input-format.js
var InputFormat = class {
  constructor() {
    this._isIsobmff = false;
  }
};
var IsobmffInputFormat = class extends InputFormat {
  constructor() {
    super(...arguments);
    this._isIsobmff = true;
  }
  /** @internal */
  async _getMajorBrand(input) {
    let slice = input._reader.requestSlice(0, 12);
    if (slice instanceof Promise)
      slice = await slice;
    if (!slice)
      return null;
    slice.skip(4);
    const fourCc = readAscii(slice, 4);
    if (fourCc !== "ftyp" && fourCc !== "styp") {
      return null;
    }
    return readAscii(slice, 4);
  }
  /** @internal */
  _createDemuxer(input) {
    return new IsobmffDemuxer(input);
  }
};
var Mp4InputFormat = class extends IsobmffInputFormat {
  /** @internal */
  async _canReadInput(input) {
    const majorBrand = await this._getMajorBrand(input);
    if (majorBrand !== null) {
      return majorBrand !== "qt  ";
    }
    let slice = input._reader.requestSlice(4, 4);
    if (slice instanceof Promise)
      slice = await slice;
    if (!slice)
      return false;
    const fourCc = readAscii(slice, 4);
    return fourCc === "moof" || fourCc === "sidx";
  }
  get name() {
    return "MP4";
  }
  get mimeType() {
    return "video/mp4";
  }
};
var QuickTimeInputFormat = class extends IsobmffInputFormat {
  /** @internal */
  async _canReadInput(input) {
    const majorBrand = await this._getMajorBrand(input);
    return majorBrand === "qt  ";
  }
  get name() {
    return "QuickTime File Format";
  }
  get mimeType() {
    return "video/quicktime";
  }
};
var validateInputFormatOptions = (options, prefix) => {
  if (!options || typeof options !== "object") {
    throw new TypeError(`${prefix}, when provided, must be an object.`);
  }
  if (options.isobmff !== void 0) {
    if (!options.isobmff || typeof options.isobmff !== "object") {
      throw new TypeError(`${prefix}.isobmff, when provided, must be an object.`);
    }
    if (options.isobmff.resolveKeyId !== void 0 && typeof options.isobmff.resolveKeyId !== "function") {
      throw new TypeError(`${prefix}.isobmff.resolveKeyId, when provided, must be a function.`);
    }
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/sample.js
var __addDisposableResource = function(env, value, async) {
  if (value !== null && value !== void 0) {
    if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
    var dispose, inner;
    if (async) {
      if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
      dispose = value[Symbol.asyncDispose];
    }
    if (dispose === void 0) {
      if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
      dispose = value[Symbol.dispose];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    env.stack.push({ value, dispose, async });
  } else if (async) {
    env.stack.push({ async: true });
  }
  return value;
};
var __disposeResources = /* @__PURE__ */ (function(SuppressedError2) {
  return function(env) {
    function fail(e) {
      env.error = env.hasError ? new SuppressedError2(e, env.error, "An error was suppressed during disposal.") : e;
      env.hasError = true;
    }
    var r, s = 0;
    function next() {
      while (r = env.stack.pop()) {
        try {
          if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
          if (r.dispose) {
            var result = r.dispose.call(r.value);
            if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) {
              fail(e);
              return next();
            });
          } else s |= 1;
        } catch (e) {
          fail(e);
        }
      }
      if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
      if (env.hasError) throw env.error;
    }
    return next();
  };
})(typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
  var e = new Error(message);
  return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
polyfillSymbolDispose();
var lastVideoGcErrorLog = -Infinity;
var lastAudioGcErrorLog = -Infinity;
var finalizationRegistry = null;
if (typeof FinalizationRegistry !== "undefined") {
  finalizationRegistry = new FinalizationRegistry((value) => {
    const now = performance.now();
    if (value.type === "video") {
      if (now - lastVideoGcErrorLog >= 1e3) {
        console.error(`A VideoSample was garbage collected without first being closed. For proper resource management, make sure to call close() on all your VideoSamples as soon as you're done using them.`);
        lastVideoGcErrorLog = now;
      }
      if (typeof VideoFrame !== "undefined" && value.data instanceof VideoFrame) {
        value.data.close();
      }
    } else {
      if (now - lastAudioGcErrorLog >= 1e3) {
        console.error(`An AudioSample was garbage collected without first being closed. For proper resource management, make sure to call close() on all your AudioSamples as soon as you're done using them.`);
        lastAudioGcErrorLog = now;
      }
      if (typeof AudioData !== "undefined" && value.data instanceof AudioData) {
        value.data.close();
      }
    }
  });
}
var VideoSampleResource = class {
  constructor() {
    this._referenceCount = 0;
    this._lastAllocationBuffer = null;
  }
};
var VIDEO_SAMPLE_PIXEL_FORMATS = [
  // 4:2:0 Y, U, V
  "I420",
  "I420P10",
  "I420P12",
  // 4:2:0 Y, U, V, A
  "I420A",
  "I420AP10",
  "I420AP12",
  // 4:2:2 Y, U, V
  "I422",
  "I422P10",
  "I422P12",
  // 4:2:2 Y, U, V, A
  "I422A",
  "I422AP10",
  "I422AP12",
  // 4:4:4 Y, U, V
  "I444",
  "I444P10",
  "I444P12",
  // 4:4:4 Y, U, V, A
  "I444A",
  "I444AP10",
  "I444AP12",
  // 4:2:0 Y, UV
  "NV12",
  // 4:4:4 RGBA
  "RGBA",
  // 4:4:4 RGBX (opaque)
  "RGBX",
  // 4:4:4 BGRA
  "BGRA",
  // 4:4:4 BGRX (opaque)
  "BGRX"
];
var VIDEO_SAMPLE_PIXEL_FORMATS_SET = new Set(VIDEO_SAMPLE_PIXEL_FORMATS);
var VideoSample = class _VideoSample {
  /** The width of the frame in pixels. */
  get codedWidth() {
    return this.visibleRect.width;
  }
  /** The height of the frame in pixels. */
  get codedHeight() {
    return this.visibleRect.height;
  }
  /** The display width of the frame in pixels, after aspect ratio adjustment and rotation. */
  get displayWidth() {
    return this.rotation % 180 === 0 ? this.squarePixelWidth : this.squarePixelHeight;
  }
  /** The display height of the frame in pixels, after aspect ratio adjustment and rotation. */
  get displayHeight() {
    return this.rotation % 180 === 0 ? this.squarePixelHeight : this.squarePixelWidth;
  }
  /** The presentation timestamp of the frame in microseconds. */
  get microsecondTimestamp() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.timestamp);
  }
  /** The duration of the frame in microseconds. */
  get microsecondDuration() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.duration);
  }
  /**
   * Whether this sample uses a pixel format that can hold transparency data. Note that this doesn't necessarily mean
   * that the sample is transparent.
   */
  get hasAlpha() {
    return this.format && this.format.includes("A");
  }
  constructor(data, init) {
    this._closed = false;
    if (data instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && data instanceof SharedArrayBuffer || ArrayBuffer.isView(data)) {
      if (!init || typeof init !== "object") {
        throw new TypeError("init must be an object.");
      }
      if (init.format === void 0 || !VIDEO_SAMPLE_PIXEL_FORMATS_SET.has(init.format)) {
        throw new TypeError("init.format must be one of: " + VIDEO_SAMPLE_PIXEL_FORMATS.join(", "));
      }
      if (!Number.isInteger(init.codedWidth) || init.codedWidth <= 0) {
        throw new TypeError("init.codedWidth must be a positive integer.");
      }
      if (!Number.isInteger(init.codedHeight) || init.codedHeight <= 0) {
        throw new TypeError("init.codedHeight must be a positive integer.");
      }
      if (init.rotation !== void 0 && ![0, 90, 180, 270].includes(init.rotation)) {
        throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
      }
      if (!Number.isFinite(init.timestamp)) {
        throw new TypeError("init.timestamp must be a number.");
      }
      if (init.duration !== void 0 && (!Number.isFinite(init.duration) || init.duration < 0)) {
        throw new TypeError("init.duration, when provided, must be a non-negative number.");
      }
      if (init.layout !== void 0) {
        if (!Array.isArray(init.layout)) {
          throw new TypeError("init.layout, when provided, must be an array.");
        }
        for (const plane of init.layout) {
          if (!plane || typeof plane !== "object" || Array.isArray(plane)) {
            throw new TypeError("Each entry in init.layout must be an object.");
          }
          if (!Number.isInteger(plane.offset) || plane.offset < 0) {
            throw new TypeError("plane.offset must be a non-negative integer.");
          }
          if (!Number.isInteger(plane.stride) || plane.stride < 0) {
            throw new TypeError("plane.stride must be a non-negative integer.");
          }
        }
      }
      if (init.visibleRect !== void 0) {
        validateRectangle(init.visibleRect, "init.visibleRect");
      }
      if (init.displayWidth !== void 0 && (!Number.isInteger(init.displayWidth) || init.displayWidth <= 0)) {
        throw new TypeError("init.displayWidth, when provided, must be a positive integer.");
      }
      if (init.displayHeight !== void 0 && (!Number.isInteger(init.displayHeight) || init.displayHeight <= 0)) {
        throw new TypeError("init.displayHeight, when provided, must be a positive integer.");
      }
      if (init.displayWidth !== void 0 !== (init.displayHeight !== void 0)) {
        throw new TypeError("init.displayWidth and init.displayHeight must be either both provided or both omitted.");
      }
      this._data = toUint8Array(data).slice();
      this._layout = init.layout ?? createDefaultPlaneLayout(init.format, init.codedWidth, init.codedHeight);
      this.format = init.format;
      this.rotation = init.rotation ?? 0;
      this.timestamp = init.timestamp;
      this.duration = init.duration ?? 0;
      let colorSpaceInit = init.colorSpace ?? null;
      if (colorSpaceInit === null) {
        if (this.format === "RGBA" || this.format === "RGBX" || this.format === "BGRA" || this.format === "BGRX") {
          colorSpaceInit = {
            primaries: "bt709",
            transfer: "iec61966-2-1",
            matrix: "rgb",
            fullRange: true
          };
        } else {
          colorSpaceInit = {
            primaries: "bt709",
            transfer: "bt709",
            matrix: "bt709",
            fullRange: false
          };
        }
      }
      this.colorSpace = new VideoSampleColorSpace(colorSpaceInit);
      this.visibleRect = {
        left: init.visibleRect?.left ?? 0,
        top: init.visibleRect?.top ?? 0,
        width: init.visibleRect?.width ?? init.codedWidth,
        height: init.visibleRect?.height ?? init.codedHeight
      };
      if (init.displayWidth !== void 0) {
        this.squarePixelWidth = this.rotation % 180 === 0 ? init.displayWidth : init.displayHeight;
        this.squarePixelHeight = this.rotation % 180 === 0 ? init.displayHeight : init.displayWidth;
      } else {
        this.squarePixelWidth = this.visibleRect.width;
        this.squarePixelHeight = this.visibleRect.height;
      }
    } else if (typeof VideoFrame !== "undefined" && data instanceof VideoFrame) {
      if (init?.rotation !== void 0 && ![0, 90, 180, 270].includes(init.rotation)) {
        throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
      }
      if (init?.timestamp !== void 0 && !Number.isFinite(init?.timestamp)) {
        throw new TypeError("init.timestamp, when provided, must be a number.");
      }
      if (init?.duration !== void 0 && (!Number.isFinite(init.duration) || init.duration < 0)) {
        throw new TypeError("init.duration, when provided, must be a non-negative number.");
      }
      if (init?.visibleRect !== void 0) {
        validateRectangle(init.visibleRect, "init.visibleRect");
      }
      this._data = data;
      this._layout = null;
      this.format = data.format;
      this.visibleRect = {
        left: data.visibleRect?.x ?? 0,
        top: data.visibleRect?.y ?? 0,
        width: data.visibleRect?.width ?? data.codedWidth,
        height: data.visibleRect?.height ?? data.codedHeight
      };
      this.rotation = init?.rotation ?? 0;
      this.squarePixelWidth = data.displayWidth;
      this.squarePixelHeight = data.displayHeight;
      this.timestamp = init?.timestamp ?? data.timestamp / 1e6;
      this.duration = init?.duration ?? (data.duration ?? 0) / 1e6;
      this.colorSpace = new VideoSampleColorSpace(data.colorSpace);
    } else if (typeof HTMLImageElement !== "undefined" && data instanceof HTMLImageElement || typeof SVGImageElement !== "undefined" && data instanceof SVGImageElement || typeof ImageBitmap !== "undefined" && data instanceof ImageBitmap || typeof HTMLVideoElement !== "undefined" && data instanceof HTMLVideoElement || typeof HTMLCanvasElement !== "undefined" && data instanceof HTMLCanvasElement || typeof OffscreenCanvas !== "undefined" && data instanceof OffscreenCanvas) {
      if (!init || typeof init !== "object") {
        throw new TypeError("init must be an object.");
      }
      if (init.rotation !== void 0 && ![0, 90, 180, 270].includes(init.rotation)) {
        throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
      }
      if (!Number.isFinite(init.timestamp)) {
        throw new TypeError("init.timestamp must be a number.");
      }
      if (init.duration !== void 0 && (!Number.isFinite(init.duration) || init.duration < 0)) {
        throw new TypeError("init.duration, when provided, must be a non-negative number.");
      }
      if (typeof VideoFrame !== "undefined") {
        return new _VideoSample(new VideoFrame(data, {
          timestamp: Math.trunc(init.timestamp * SECOND_TO_MICROSECOND_FACTOR),
          // Drag 0 to undefined
          duration: Math.trunc((init.duration ?? 0) * SECOND_TO_MICROSECOND_FACTOR) || void 0
        }), init);
      }
      let width = 0;
      let height = 0;
      if ("naturalWidth" in data) {
        width = data.naturalWidth;
        height = data.naturalHeight;
      } else if ("videoWidth" in data) {
        width = data.videoWidth;
        height = data.videoHeight;
      } else if ("width" in data) {
        width = Number(data.width);
        height = Number(data.height);
      }
      if (!width || !height) {
        throw new TypeError("Could not determine dimensions.");
      }
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", {
        alpha: isFirefox(),
        // Firefox has VideoFrame glitches with opaque canvases
        willReadFrequently: true
      });
      assert(context);
      context.drawImage(data, 0, 0);
      this._data = canvas;
      this._layout = null;
      this.format = "RGBX";
      this.visibleRect = { left: 0, top: 0, width, height };
      this.squarePixelWidth = width;
      this.squarePixelHeight = height;
      this.rotation = init.rotation ?? 0;
      this.timestamp = init.timestamp;
      this.duration = init.duration ?? 0;
      this.colorSpace = new VideoSampleColorSpace({
        matrix: "rgb",
        primaries: "bt709",
        transfer: "iec61966-2-1",
        fullRange: true
      });
    } else if (data instanceof VideoSampleResource) {
      if (!init || typeof init !== "object") {
        throw new TypeError("init must be an object.");
      }
      if (init.rotation !== void 0 && ![0, 90, 180, 270].includes(init.rotation)) {
        throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
      }
      if (!Number.isFinite(init.timestamp)) {
        throw new TypeError("init.timestamp must be a number.");
      }
      if (init.duration !== void 0 && (!Number.isFinite(init.duration) || init.duration < 0)) {
        throw new TypeError("init.duration, when provided, must be a non-negative number.");
      }
      this._data = data;
      data._referenceCount++;
      this.format = data.getFormat();
      if (this.format !== null && !VIDEO_SAMPLE_PIXEL_FORMATS.includes(this.format)) {
        throw new TypeError("getFormat() must return a VideoSamplePixelFormat or null.");
      }
      this.visibleRect = {
        left: 0,
        top: 0,
        width: data.getCodedWidth(),
        height: data.getCodedHeight()
      };
      if (!Number.isInteger(this.visibleRect.width) || this.visibleRect.width <= 0) {
        throw new TypeError("getCodedWidth() must return a positive integer.");
      }
      if (!Number.isInteger(this.visibleRect.height) || this.visibleRect.height <= 0) {
        throw new TypeError("getCodedHeight() must return a positive integer.");
      }
      this.squarePixelWidth = data.getSquarePixelWidth();
      if (!Number.isInteger(this.squarePixelWidth) || this.squarePixelWidth <= 0) {
        throw new TypeError("getSquarePixelWidth() must return a positive integer.");
      }
      this.squarePixelHeight = data.getSquarePixelHeight();
      if (!Number.isInteger(this.squarePixelHeight) || this.squarePixelHeight <= 0) {
        throw new TypeError("getSquarePixelHeight() must return a positive integer.");
      }
      this.rotation = init.rotation ?? 0;
      this.timestamp = init.timestamp;
      this.duration = init.duration ?? 0;
      this.colorSpace = data.getColorSpace();
    } else {
      throw new TypeError("Invalid data type: Must be a BufferSource, CanvasImageSource, or VideoSampleResource.");
    }
    this.pixelAspectRatio = simplifyRational({
      num: this.squarePixelWidth * this.codedHeight,
      den: this.squarePixelHeight * this.codedWidth
    });
    finalizationRegistry?.register(this, { type: "video", data: this._data }, this);
  }
  /** Clones this video sample. */
  clone() {
    if (this._closed) {
      throw new Error("VideoSample is closed.");
    }
    assert(this._data !== null);
    if (this._data instanceof VideoSampleResource) {
      return new _VideoSample(this._data, {
        timestamp: this.timestamp,
        duration: this.duration,
        rotation: this.rotation
      });
    } else if (isVideoFrame(this._data)) {
      return new _VideoSample(this._data.clone(), {
        timestamp: this.timestamp,
        duration: this.duration,
        rotation: this.rotation
      });
    } else if (this._data instanceof Uint8Array) {
      assert(this._layout);
      return new _VideoSample(this._data, {
        format: this.format,
        layout: this._layout,
        codedWidth: this.codedWidth,
        codedHeight: this.codedHeight,
        timestamp: this.timestamp,
        duration: this.duration,
        colorSpace: this.colorSpace,
        rotation: this.rotation,
        visibleRect: this.visibleRect,
        displayWidth: this.displayWidth,
        displayHeight: this.displayHeight
      });
    } else {
      return new _VideoSample(this._data, {
        format: this.format,
        codedWidth: this.codedWidth,
        codedHeight: this.codedHeight,
        timestamp: this.timestamp,
        duration: this.duration,
        colorSpace: this.colorSpace,
        rotation: this.rotation,
        visibleRect: this.visibleRect,
        displayWidth: this.displayWidth,
        displayHeight: this.displayHeight
      });
    }
  }
  /**
   * Closes this video sample, releasing held resources. Video samples should be closed as soon as they are not
   * needed anymore.
   */
  close() {
    if (this._closed) {
      return;
    }
    finalizationRegistry?.unregister(this);
    if (this._data instanceof VideoSampleResource) {
      this._data._referenceCount--;
      if (this._data._referenceCount === 0) {
        this._data.close();
      }
    } else if (isVideoFrame(this._data)) {
      this._data.close();
    } else {
      this._data = null;
    }
    this._closed = true;
  }
  /**
   * Returns the number of bytes required to hold this video sample's pixel data.
   */
  allocationSize(options = {}) {
    validateVideoFrameCopyToOptions(options);
    if (this._closed) {
      throw new Error("VideoSample is closed.");
    }
    if ((options.format ?? this.format) == null) {
      throw new Error("Cannot get allocation size when format is null.");
    }
    if (isVideoFrame(this._data)) {
      return this._data.allocationSize(options);
    }
    const combinedLayout = ParseVideoFrameCopyToOptions(this, options);
    return combinedLayout.allocationSize;
  }
  /**
   * Copies this video sample's pixel data to an ArrayBuffer or ArrayBufferView.
   * @returns The byte layout of the planes of the copied data.
   */
  async copyTo(destination, options = {}) {
    if (!isAllowSharedBufferSource(destination)) {
      throw new TypeError("destination must be an ArrayBuffer or an ArrayBuffer view.");
    }
    validateVideoFrameCopyToOptions(options);
    if (this._closed) {
      throw new Error("VideoSample is closed.");
    }
    if ((options.format ?? this.format) == null) {
      throw new Error("Cannot copy video sample data when format is null.");
    }
    assert(this._data !== null);
    if (isVideoFrame(this._data)) {
      return this._data.copyTo(destination, options);
    }
    if (options.format && !["RGBA", "RGBX", "BGRA", "BGRX"].includes(this.format) && ["RGBA", "RGBX", "BGRA", "BGRX"].includes(options.format)) {
      if (this._data instanceof VideoSampleResource) {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
          const rgbSample = __addDisposableResource(env_1, await this._data.toRgbSample({
            timestamp: this.timestamp,
            duration: this.duration,
            rotation: this.rotation
          }, options.colorSpace ?? "srgb"), false);
          if (!(rgbSample instanceof _VideoSample)) {
            throw new TypeError("toRgbSample() must return a VideoSample.");
          }
          if (!["RGBA", "RGBX", "BGRA", "BGRX"].includes(rgbSample.format)) {
            throw new Error(`Sample returned by toRgbSample was expected to have an RGB format, got '${rgbSample.format}' instead.`);
          }
          return await rgbSample.copyTo(destination, options);
        } catch (e_1) {
          env_1.error = e_1;
          env_1.hasError = true;
        } finally {
          __disposeResources(env_1);
        }
      } else {
        if (typeof VideoFrame === "undefined") {
          throw new Error("For this sample, converting from a non-RGB to an RGB format requires VideoFrame to be defined.");
        }
        const tempFrame = this.toVideoFrame();
        const result = await tempFrame.copyTo(destination, options);
        tempFrame.close();
        return result;
      }
    }
    const combinedLayout = ParseVideoFrameCopyToOptions(this, options);
    assert(this.format);
    const destBytes = toUint8Array(destination);
    if (destBytes.byteLength < combinedLayout.allocationSize) {
      throw new TypeError(`Destination buffer too small. Required: ${combinedLayout.allocationSize}, Available: ${destBytes.byteLength}`);
    }
    const planeConfigs = getPlaneConfigs(this.format);
    let dataPlanes;
    if (this._data instanceof VideoSampleResource) {
      let result = this._data.getDataPlanes();
      if (result instanceof Promise)
        result = await result;
      if (!Array.isArray(result) || result.some((x) => !(x.data instanceof Uint8Array) || !Number.isInteger(x.stride) || x.stride < 0)) {
        throw new TypeError('getDataPlanes() must return an array of objects with a Uint8Array "data" property and a non-negative integer "stride" property.');
      }
      dataPlanes = result;
    } else if (this._data instanceof Uint8Array) {
      assert(this._layout);
      assert(this._layout.length === planeConfigs.length);
      dataPlanes = this._layout.map((planeLayout, i) => {
        const height = Math.ceil(this.codedHeight / planeConfigs[i].heightDivisor);
        return {
          data: this._data.subarray(planeLayout.offset, planeLayout.offset + planeLayout.stride * height),
          stride: planeLayout.stride
        };
      });
    } else {
      const canvas = this._data;
      const context = canvas.getContext("2d");
      assert(context);
      const imageData = context.getImageData(0, 0, this.codedWidth, this.codedHeight);
      dataPlanes = [{
        data: toUint8Array(imageData.data),
        stride: 4 * this.codedWidth
      }];
    }
    const planeLayouts = [];
    const numPlanes = planeConfigs.length;
    for (let planeIndex = 0; planeIndex < numPlanes; planeIndex++) {
      const computedLayout = combinedLayout.computedLayouts[planeIndex];
      const sourceStride = dataPlanes[planeIndex].stride;
      const sourceData = dataPlanes[planeIndex].data;
      let sourceOffset = computedLayout.sourceTop * sourceStride;
      sourceOffset += computedLayout.sourceLeftBytes;
      let destinationOffset = computedLayout.destinationOffset;
      const rowBytes = computedLayout.sourceWidthBytes;
      const layout = {
        offset: destinationOffset,
        stride: computedLayout.destinationStride
      };
      for (let row = 0; row < computedLayout.sourceHeight; row++) {
        if (sourceOffset + rowBytes > sourceData.byteLength) {
          throw new Error(`Source buffer OOB read.`);
        }
        if (destinationOffset + rowBytes > destBytes.byteLength) {
          throw new Error(`Destination buffer OOB write.`);
        }
        const srcSub = sourceData.subarray(sourceOffset, sourceOffset + rowBytes);
        destBytes.set(srcSub, destinationOffset);
        sourceOffset += sourceStride;
        destinationOffset += computedLayout.destinationStride;
      }
      planeLayouts.push(layout);
    }
    if (options.format !== void 0) {
      const needsRgbConversion = this.format.startsWith("RGB") !== options.format.startsWith("RGB");
      const needsAlphaConversion = this.format.includes("X") && options.format.includes("A");
      if (needsRgbConversion || needsAlphaConversion) {
        for (let i = 0; i < combinedLayout.allocationSize; i += 4) {
          if (needsRgbConversion) {
            const r = destBytes[i];
            const b = destBytes[i + 2];
            destBytes[i] = b;
            destBytes[i + 2] = r;
          }
          if (needsAlphaConversion) {
            destBytes[i + 3] = 255;
          }
        }
      }
    }
    return planeLayouts;
  }
  /**
   * Converts this video sample to a VideoFrame for use with the WebCodecs API. The VideoFrame returned by this
   * method *must* be closed separately from this video sample.
   */
  toVideoFrame() {
    if (this._closed) {
      throw new Error("VideoSample is closed.");
    }
    assert(this._data !== null);
    if (this._data instanceof VideoSampleResource) {
      if (this.format === null) {
        throw new Error("Cannot convert a VideoSampleResource-backed VideoSample to VideoFrame if format is null.");
      }
      const planes = this._data.getDataPlanes();
      if (planes instanceof Promise) {
        throw new Error("Cannot convert a VideoSampleResource-backed VideoSample to VideoFrame if getDataPlanes() returns a promise.");
      }
      const size = planes.reduce((a, b) => a + b.data.byteLength, 0);
      const buffer = new Uint8Array(size);
      let offset = 0;
      const offsets = [];
      for (const plane of planes) {
        buffer.set(plane.data, offset);
        offsets.push(offset);
        offset += plane.data.byteLength;
      }
      return new VideoFrame(buffer, {
        format: this.format,
        layout: planes.map((x, i) => ({
          offset: offsets[i],
          stride: x.stride
        })),
        codedWidth: this.codedWidth,
        codedHeight: this.codedHeight,
        timestamp: this.microsecondTimestamp,
        duration: this.microsecondDuration,
        colorSpace: this.colorSpace,
        displayWidth: this.squarePixelWidth,
        // Not display* since we're not passing rotation
        displayHeight: this.squarePixelHeight
      });
    } else if (isVideoFrame(this._data)) {
      return new VideoFrame(this._data, {
        timestamp: this.microsecondTimestamp,
        duration: this.microsecondDuration || void 0
        // Drag 0 duration to undefined, glitches some codecs
      });
    } else if (this._data instanceof Uint8Array) {
      return new VideoFrame(this._data, {
        format: this.format,
        codedWidth: this.codedWidth,
        codedHeight: this.codedHeight,
        timestamp: this.microsecondTimestamp,
        duration: this.microsecondDuration || void 0,
        colorSpace: this.colorSpace,
        displayWidth: this.squarePixelWidth,
        // Not display* since we're not passing rotation
        displayHeight: this.squarePixelHeight
      });
    } else {
      return new VideoFrame(this._data, {
        timestamp: this.microsecondTimestamp,
        duration: this.microsecondDuration || void 0
      });
    }
  }
  draw(context, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
    let sx = 0;
    let sy = 0;
    let sWidth = this.displayWidth;
    let sHeight = this.displayHeight;
    let dx = 0;
    let dy = 0;
    let dWidth = this.displayWidth;
    let dHeight = this.displayHeight;
    if (arg5 !== void 0) {
      sx = arg1;
      sy = arg2;
      sWidth = arg3;
      sHeight = arg4;
      dx = arg5;
      dy = arg6;
      if (arg7 !== void 0) {
        dWidth = arg7;
        dHeight = arg8;
      } else {
        dWidth = sWidth;
        dHeight = sHeight;
      }
    } else {
      dx = arg1;
      dy = arg2;
      if (arg3 !== void 0) {
        dWidth = arg3;
        dHeight = arg4;
      }
    }
    if (!(typeof CanvasRenderingContext2D !== "undefined" && context instanceof CanvasRenderingContext2D || typeof OffscreenCanvasRenderingContext2D !== "undefined" && context instanceof OffscreenCanvasRenderingContext2D)) {
      throw new TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");
    }
    if (!Number.isFinite(sx)) {
      throw new TypeError("sx must be a number.");
    }
    if (!Number.isFinite(sy)) {
      throw new TypeError("sy must be a number.");
    }
    if (!Number.isFinite(sWidth) || sWidth < 0) {
      throw new TypeError("sWidth must be a non-negative number.");
    }
    if (!Number.isFinite(sHeight) || sHeight < 0) {
      throw new TypeError("sHeight must be a non-negative number.");
    }
    if (!Number.isFinite(dx)) {
      throw new TypeError("dx must be a number.");
    }
    if (!Number.isFinite(dy)) {
      throw new TypeError("dy must be a number.");
    }
    if (!Number.isFinite(dWidth) || dWidth < 0) {
      throw new TypeError("dWidth must be a non-negative number.");
    }
    if (!Number.isFinite(dHeight) || dHeight < 0) {
      throw new TypeError("dHeight must be a non-negative number.");
    }
    if (this._closed) {
      throw new Error("VideoSample is closed.");
    }
    ({ sx, sy, sWidth, sHeight } = this._rotateSourceRegion(sx, sy, sWidth, sHeight, this.rotation));
    const source = this.toCanvasImageSource();
    context.save();
    const centerX = dx + dWidth / 2;
    const centerY = dy + dHeight / 2;
    context.translate(centerX, centerY);
    context.rotate(this.rotation * Math.PI / 180);
    const aspectRatioChange = this.rotation % 180 === 0 ? 1 : dWidth / dHeight;
    context.scale(1 / aspectRatioChange, aspectRatioChange);
    context.drawImage(source, sx, sy, sWidth, sHeight, -dWidth / 2, -dHeight / 2, dWidth, dHeight);
    context.restore();
  }
  /**
   * Draws the sample in the middle of the canvas corresponding to the context with the specified fit behavior.
   */
  drawWithFit(context, options) {
    if (!(typeof CanvasRenderingContext2D !== "undefined" && context instanceof CanvasRenderingContext2D || typeof OffscreenCanvasRenderingContext2D !== "undefined" && context instanceof OffscreenCanvasRenderingContext2D)) {
      throw new TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");
    }
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!["fill", "contain", "cover"].includes(options.fit)) {
      throw new TypeError("options.fit must be 'fill', 'contain', or 'cover'.");
    }
    if (options.rotation !== void 0 && ![0, 90, 180, 270].includes(options.rotation)) {
      throw new TypeError("options.rotation, when provided, must be 0, 90, 180, or 270.");
    }
    if (options.crop !== void 0) {
      validateCropRectangle(options.crop, "options.");
    }
    const canvasWidth = context.canvas.width;
    const canvasHeight = context.canvas.height;
    const rotation = options.rotation ?? this.rotation;
    const [rotatedWidth, rotatedHeight] = rotation % 180 === 0 ? [this.squarePixelWidth, this.squarePixelHeight] : [this.squarePixelHeight, this.squarePixelWidth];
    let finalCrop = options.crop;
    if (finalCrop) {
      finalCrop = clampCropRectangle(finalCrop, rotatedWidth, rotatedHeight);
    }
    let dx;
    let dy;
    let newWidth;
    let newHeight;
    const { sx, sy, sWidth, sHeight } = this._rotateSourceRegion(options.crop?.left ?? 0, options.crop?.top ?? 0, options.crop?.width ?? rotatedWidth, options.crop?.height ?? rotatedHeight, rotation);
    if (options.fit === "fill") {
      dx = 0;
      dy = 0;
      newWidth = canvasWidth;
      newHeight = canvasHeight;
    } else {
      const [sampleWidth, sampleHeight] = options.crop ? [options.crop.width, options.crop.height] : [rotatedWidth, rotatedHeight];
      const scale = options.fit === "contain" ? Math.min(canvasWidth / sampleWidth, canvasHeight / sampleHeight) : Math.max(canvasWidth / sampleWidth, canvasHeight / sampleHeight);
      newWidth = sampleWidth * scale;
      newHeight = sampleHeight * scale;
      dx = (canvasWidth - newWidth) / 2;
      dy = (canvasHeight - newHeight) / 2;
    }
    context.save();
    const aspectRatioChange = rotation % 180 === 0 ? 1 : newWidth / newHeight;
    context.translate(canvasWidth / 2, canvasHeight / 2);
    context.rotate(rotation * Math.PI / 180);
    context.scale(1 / aspectRatioChange, aspectRatioChange);
    context.translate(-canvasWidth / 2, -canvasHeight / 2);
    context.drawImage(this.toCanvasImageSource(), sx, sy, sWidth, sHeight, dx, dy, newWidth, newHeight);
    context.restore();
  }
  /** @internal */
  _rotateSourceRegion(sx, sy, sWidth, sHeight, rotation) {
    if (rotation === 90) {
      [sx, sy, sWidth, sHeight] = [
        sy,
        this.squarePixelHeight - sx - sWidth,
        sHeight,
        sWidth
      ];
    } else if (rotation === 180) {
      [sx, sy] = [
        this.squarePixelWidth - sx - sWidth,
        this.squarePixelHeight - sy - sHeight
      ];
    } else if (rotation === 270) {
      [sx, sy, sWidth, sHeight] = [
        this.squarePixelWidth - sy - sHeight,
        sx,
        sHeight,
        sWidth
      ];
    }
    return { sx, sy, sWidth, sHeight };
  }
  /**
   * Converts this video sample to a
   * [`CanvasImageSource`](https://udn.realityripple.com/docs/Web/API/CanvasImageSource) for drawing to a canvas.
   *
   * You must use the value returned by this method immediately, as any VideoFrame created internally may
   * automatically be closed in the next microtask.
   */
  toCanvasImageSource() {
    if (this._closed) {
      throw new Error("VideoSample is closed.");
    }
    assert(this._data !== null);
    if (this._data instanceof VideoSampleResource || this._data instanceof Uint8Array) {
      const videoFrame = this.toVideoFrame();
      queueMicrotask(() => videoFrame.close());
      return videoFrame;
    } else {
      return this._data;
    }
  }
  /**
   * Transform this video sample to a new video sample given the options. Can be used to resize, rotate, and crop
   * the sample.
   *
   * In non-browser environments, this method will not work by default. To make it work, register a custom
   * transformer function via {@link registerVideoSampleTransformer}.
   */
  async transform(options) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.width !== void 0 && (!Number.isInteger(options.width) || options.width <= 0)) {
      throw new TypeError("options.width, when provided, must be a positive integer.");
    }
    if (options.height !== void 0 && (!Number.isInteger(options.height) || options.height <= 0)) {
      throw new TypeError("options.height, when provided, must be a positive integer.");
    }
    if (options.roundDimensionsTo !== void 0 && (!Number.isInteger(options.roundDimensionsTo) || options.roundDimensionsTo <= 0)) {
      throw new TypeError("options.roundDimensionsTo, when provided, must be a positive integer.");
    }
    if (options.fit !== void 0 && !["fill", "contain", "cover"].includes(options.fit)) {
      throw new TypeError('options.fit, when provided, must be one of "fill", "contain", or "cover".');
    }
    if (options.width !== void 0 && options.height !== void 0 && options.fit === void 0) {
      throw new TypeError("When both options.width and options.height are provided, options.fit must also be provided.");
    }
    if (options.rotate !== void 0 && ![0, 90, 180, 270].includes(options.rotate)) {
      throw new TypeError("options.rotate, when provided, must be 0, 90, 180 or 270.");
    }
    if (options.crop !== void 0) {
      validateCropRectangle(options.crop, "options.");
    }
    if (options.alpha !== void 0 && !["keep", "discard"].includes(options.alpha)) {
      throw new TypeError("options.alpha, when provided, must be 'keep' or 'discard'.");
    }
    const rotation = normalizeRotation(this.rotation + (options.rotate ?? 0));
    const [rotatedWidth, rotatedHeight] = rotation % 180 === 0 ? [this.squarePixelWidth, this.squarePixelHeight] : [this.squarePixelHeight, this.squarePixelWidth];
    let finalCrop = options.crop;
    if (finalCrop) {
      finalCrop = clampCropRectangle(finalCrop, rotatedWidth, rotatedHeight);
    }
    const cropWidth = finalCrop ? finalCrop.width : rotatedWidth;
    const cropHeight = finalCrop ? finalCrop.height : rotatedHeight;
    const originalAspectRatio = cropWidth / cropHeight;
    let targetWidth;
    let targetHeight;
    if (options.width !== void 0 && options.height === void 0) {
      targetWidth = options.width;
      targetHeight = targetWidth / originalAspectRatio;
    } else if (options.width === void 0 && options.height !== void 0) {
      targetHeight = options.height;
      targetWidth = targetHeight * originalAspectRatio;
    } else if (options.width !== void 0 && options.height !== void 0) {
      targetWidth = options.width;
      targetHeight = options.height;
    } else {
      targetWidth = cropWidth;
      targetHeight = cropHeight;
    }
    targetWidth = roundToMultiple(targetWidth, options.roundDimensionsTo ?? 1);
    targetHeight = roundToMultiple(targetHeight, options.roundDimensionsTo ?? 1);
    const description = {
      width: targetWidth,
      height: targetHeight,
      fit: options.fit ?? "fill",
      rotation,
      crop: finalCrop ?? {
        left: 0,
        top: 0,
        width: rotatedWidth,
        height: rotatedHeight
      },
      alpha: options.alpha ?? "keep"
    };
    for (const transformer of registeredVideoSampleTransformers) {
      let result = transformer(this, description);
      if (result instanceof Promise)
        result = await result;
      if (result !== null) {
        return result;
      }
    }
    let canvas = null;
    let canvasIsNew = false;
    for (const entry of transformationCanvasCache) {
      if (entry.canvas.width === description.width && entry.canvas.height === description.height) {
        canvas = entry.canvas;
        entry.age = transformationCanvasCacheNextAge++;
        break;
      }
    }
    if (canvas === null) {
      if (typeof OffscreenCanvas !== "undefined") {
        canvas = new OffscreenCanvas(description.width, description.height);
      } else {
        if (typeof window === "undefined" || typeof document === "undefined") {
          throw new Error("Cannot transform VideoSamples in this environment. Either run in an environment with OffscreenCanvas or HTMLCanvasElement, or supply a custom VideoSample transformer using registerVideoSampleTransformer().");
        }
        canvas = document.createElement("canvas");
        canvas.width = description.width;
        canvas.height = description.height;
      }
      canvasIsNew = true;
      if (transformationCanvasCache.length >= TRANSFORMATION_CANVAS_CACHE_MAX_SIZE) {
        transformationCanvasCache.splice(arrayArgmin(transformationCanvasCache, (x) => x.age), 1);
      }
      transformationCanvasCache.push({
        canvas,
        age: transformationCanvasCacheNextAge++
      });
    }
    const context = canvas.getContext("2d", {
      alpha: true
    });
    assert(context);
    if (description.alpha === "discard") {
      context.fillStyle = "black";
      context.fillRect(0, 0, description.width, description.height);
    } else if (!canvasIsNew) {
      context.clearRect(0, 0, description.width, description.height);
    }
    this.drawWithFit(context, {
      fit: description.fit,
      rotation: description.rotation,
      crop: description.crop
    });
    return new _VideoSample(canvas, {
      timestamp: this.timestamp,
      duration: this.duration,
      rotation: 0
      // Any previous rotation is now baked in
    });
  }
  /** Sets the rotation metadata of this video sample. */
  setRotation(newRotation) {
    if (![0, 90, 180, 270].includes(newRotation)) {
      throw new TypeError("newRotation must be 0, 90, 180, or 270.");
    }
    this.rotation = newRotation;
  }
  /** Sets the presentation timestamp of this video sample, in seconds. */
  setTimestamp(newTimestamp) {
    if (!Number.isFinite(newTimestamp)) {
      throw new TypeError("newTimestamp must be a number.");
    }
    this.timestamp = newTimestamp;
  }
  /** Sets the duration of this video sample, in seconds. */
  setDuration(newDuration) {
    if (!Number.isFinite(newDuration) || newDuration < 0) {
      throw new TypeError("newDuration must be a non-negative number.");
    }
    this.duration = newDuration;
  }
  /** Calls `.close()`. */
  [Symbol.dispose]() {
    this.close();
  }
};
var registeredVideoSampleTransformers = [];
var TRANSFORMATION_CANVAS_CACHE_MAX_SIZE = 3;
var transformationCanvasCache = [];
var transformationCanvasCacheNextAge = 0;
var VideoSampleColorSpace = class {
  /** Creates a new VideoSampleColorSpace. */
  constructor(init) {
    if (init !== void 0) {
      if (!init || typeof init !== "object") {
        throw new TypeError("init.colorSpace, when provided, must be an object.");
      }
      const primariesValues = Object.keys(COLOR_PRIMARIES_MAP);
      if (init.primaries != null && !primariesValues.includes(init.primaries)) {
        throw new TypeError(`init.colorSpace.primaries, when provided, must be one of ${primariesValues.join(", ")}.`);
      }
      const transferValues = Object.keys(TRANSFER_CHARACTERISTICS_MAP);
      if (init.transfer != null && !transferValues.includes(init.transfer)) {
        throw new TypeError(`init.colorSpace.transfer, when provided, must be one of ${transferValues.join(", ")}.`);
      }
      const matrixValues = Object.keys(MATRIX_COEFFICIENTS_MAP);
      if (init.matrix != null && !matrixValues.includes(init.matrix)) {
        throw new TypeError(`init.colorSpace.matrix, when provided, must be one of ${matrixValues.join(", ")}.`);
      }
      if (init.fullRange != null && typeof init.fullRange !== "boolean") {
        throw new TypeError("init.colorSpace.fullRange, when provided, must be a boolean.");
      }
    }
    this.primaries = init?.primaries ?? null;
    this.transfer = init?.transfer ?? null;
    this.matrix = init?.matrix ?? null;
    this.fullRange = init?.fullRange ?? null;
  }
  /** Serializes the color space to a JSON object. */
  toJSON() {
    return {
      primaries: this.primaries,
      transfer: this.transfer,
      matrix: this.matrix,
      fullRange: this.fullRange
    };
  }
};
var isVideoFrame = (x) => {
  return typeof VideoFrame !== "undefined" && x instanceof VideoFrame;
};
var clampCropRectangle = (crop, outerWidth, outerHeight) => {
  const left = Math.min(crop.left, outerWidth);
  const top = Math.min(crop.top, outerHeight);
  const width = Math.min(crop.width, outerWidth - left);
  const height = Math.min(crop.height, outerHeight - top);
  assert(width >= 0);
  assert(height >= 0);
  return { left, top, width, height };
};
var validateCropRectangle = (crop, prefix) => {
  if (!crop || typeof crop !== "object") {
    throw new TypeError(prefix + "crop, when provided, must be an object.");
  }
  if (!Number.isInteger(crop.left) || crop.left < 0) {
    throw new TypeError(prefix + "crop.left must be a non-negative integer.");
  }
  if (!Number.isInteger(crop.top) || crop.top < 0) {
    throw new TypeError(prefix + "crop.top must be a non-negative integer.");
  }
  if (!Number.isInteger(crop.width) || crop.width < 0) {
    throw new TypeError(prefix + "crop.width must be a non-negative integer.");
  }
  if (!Number.isInteger(crop.height) || crop.height < 0) {
    throw new TypeError(prefix + "crop.height must be a non-negative integer.");
  }
};
var validateVideoFrameCopyToOptions = (options) => {
  if (!options || typeof options !== "object") {
    throw new TypeError("options must be an object.");
  }
  if (options.colorSpace !== void 0 && !["display-p3", "srgb"].includes(options.colorSpace)) {
    throw new TypeError("options.colorSpace, when provided, must be 'display-p3' or 'srgb'.");
  }
  if (options.format !== void 0 && typeof options.format !== "string") {
    throw new TypeError("options.format, when provided, must be a string.");
  }
  if (options.layout !== void 0) {
    if (!Array.isArray(options.layout)) {
      throw new TypeError("options.layout, when provided, must be an array.");
    }
    for (const plane of options.layout) {
      if (!plane || typeof plane !== "object") {
        throw new TypeError("Each entry in options.layout must be an object.");
      }
      if (!Number.isInteger(plane.offset) || plane.offset < 0) {
        throw new TypeError("plane.offset must be a non-negative integer.");
      }
      if (!Number.isInteger(plane.stride) || plane.stride < 0) {
        throw new TypeError("plane.stride must be a non-negative integer.");
      }
    }
  }
  if (options.rect !== void 0) {
    if (!options.rect || typeof options.rect !== "object") {
      throw new TypeError("options.rect, when provided, must be an object.");
    }
    if (options.rect.x !== void 0 && (!Number.isInteger(options.rect.x) || options.rect.x < 0)) {
      throw new TypeError("options.rect.x, when provided, must be a non-negative integer.");
    }
    if (options.rect.y !== void 0 && (!Number.isInteger(options.rect.y) || options.rect.y < 0)) {
      throw new TypeError("options.rect.y, when provided, must be a non-negative integer.");
    }
    if (options.rect.width !== void 0 && (!Number.isInteger(options.rect.width) || options.rect.width < 0)) {
      throw new TypeError("options.rect.width, when provided, must be a non-negative integer.");
    }
    if (options.rect.height !== void 0 && (!Number.isInteger(options.rect.height) || options.rect.height < 0)) {
      throw new TypeError("options.rect.height, when provided, must be a non-negative integer.");
    }
  }
};
var createDefaultPlaneLayout = (format, codedWidth, codedHeight) => {
  const planes = getPlaneConfigs(format);
  const layouts = [];
  let currentOffset = 0;
  for (const plane of planes) {
    const planeWidth = Math.ceil(codedWidth / plane.widthDivisor);
    const planeHeight = Math.ceil(codedHeight / plane.heightDivisor);
    const stride = planeWidth * plane.sampleBytes;
    const planeSize = stride * planeHeight;
    layouts.push({
      offset: currentOffset,
      stride
    });
    currentOffset += planeSize;
  }
  return layouts;
};
var getPlaneConfigs = (format) => {
  const yuv = (yBytes, uvBytes, subX, subY, hasAlpha) => {
    const configs = [
      { sampleBytes: yBytes, widthDivisor: 1, heightDivisor: 1 },
      { sampleBytes: uvBytes, widthDivisor: subX, heightDivisor: subY },
      { sampleBytes: uvBytes, widthDivisor: subX, heightDivisor: subY }
    ];
    if (hasAlpha) {
      configs.push({ sampleBytes: yBytes, widthDivisor: 1, heightDivisor: 1 });
    }
    return configs;
  };
  switch (format) {
    case "I420":
      return yuv(1, 1, 2, 2, false);
    case "I420P10":
    case "I420P12":
      return yuv(2, 2, 2, 2, false);
    case "I420A":
      return yuv(1, 1, 2, 2, true);
    case "I420AP10":
    case "I420AP12":
      return yuv(2, 2, 2, 2, true);
    case "I422":
      return yuv(1, 1, 2, 1, false);
    case "I422P10":
    case "I422P12":
      return yuv(2, 2, 2, 1, false);
    case "I422A":
      return yuv(1, 1, 2, 1, true);
    case "I422AP10":
    case "I422AP12":
      return yuv(2, 2, 2, 1, true);
    case "I444":
      return yuv(1, 1, 1, 1, false);
    case "I444P10":
    case "I444P12":
      return yuv(2, 2, 1, 1, false);
    case "I444A":
      return yuv(1, 1, 1, 1, true);
    case "I444AP10":
    case "I444AP12":
      return yuv(2, 2, 1, 1, true);
    case "NV12":
      return [
        { sampleBytes: 1, widthDivisor: 1, heightDivisor: 1 },
        { sampleBytes: 2, widthDivisor: 2, heightDivisor: 2 }
        // Interleaved U and V
      ];
    case "RGBA":
    case "RGBX":
    case "BGRA":
    case "BGRX":
      return [
        { sampleBytes: 4, widthDivisor: 1, heightDivisor: 1 }
      ];
    default:
      assertNever(format);
      assert(false);
  }
};
var ParseVideoFrameCopyToOptions = (sample, options) => {
  const defaultRect = {
    left: 0,
    top: 0,
    width: sample.codedWidth,
    height: sample.codedHeight
  };
  const overrideRect = options.rect;
  const parsedRect = ParseVisibleRect(defaultRect, overrideRect, sample.codedWidth, sample.codedHeight, sample.format);
  const optLayout = options.layout;
  let format;
  if (!options.format || options.format === sample.format) {
    format = sample.format;
  } else if (["RGBA", "RGBX", "BGRA", "BGRX"].includes(options.format)) {
    format = options.format;
  } else {
    throw new Error("NotSupportedError: Invalid destination format.");
  }
  return ComputeLayoutAndAllocationSize(parsedRect, format, optLayout);
};
var ParseVisibleRect = (defaultRect, overrideRect, codedWidth, codedHeight, format) => {
  const sourceRect = { ...defaultRect };
  if (overrideRect !== void 0) {
    if (overrideRect.width === 0 || overrideRect.height === 0) {
      throw new TypeError("visibleRect dimensions cannot be zero.");
    }
    if ((overrideRect.x || 0) + (overrideRect.width || 0) > codedWidth) {
      throw new TypeError("visibleRect exceeds codedWidth.");
    }
    if ((overrideRect.y || 0) + (overrideRect.height || 0) > codedHeight) {
      throw new TypeError("visibleRect exceeds codedHeight.");
    }
    sourceRect.x = overrideRect.x || 0;
    sourceRect.y = overrideRect.y || 0;
    sourceRect.width = overrideRect.width || 0;
    sourceRect.height = overrideRect.height || 0;
  }
  const validAlignment = VerifyRectOffsetAlignment(format, sourceRect);
  if (!validAlignment) {
    throw new TypeError("visibleRect alignment is invalid for the format.");
  }
  return sourceRect;
};
var VerifyRectOffsetAlignment = (format, rect) => {
  if (format === null)
    return true;
  const planes = getPlaneConfigs(format);
  for (let planeIndex = 0; planeIndex < planes.length; planeIndex++) {
    const plane = planes[planeIndex];
    const sampleWidth = plane.widthDivisor;
    const sampleHeight = plane.heightDivisor;
    if ((rect.x || 0) % sampleWidth !== 0)
      return false;
    if ((rect.y || 0) % sampleHeight !== 0)
      return false;
  }
  return true;
};
var ComputeLayoutAndAllocationSize = (parsedRect, format, layout) => {
  const planes = getPlaneConfigs(format);
  const numPlanes = planes.length;
  if (layout !== void 0 && layout.length !== numPlanes) {
    throw new TypeError(`Layout must have ${numPlanes} planes.`);
  }
  let minAllocationSize = 0;
  const computedLayouts = [];
  const endOffsets = [];
  for (let planeIndex = 0; planeIndex < numPlanes; planeIndex++) {
    const plane = planes[planeIndex];
    const sampleBytes = plane.sampleBytes;
    const sampleWidth = plane.widthDivisor;
    const sampleHeight = plane.heightDivisor;
    const computedLayout = {
      destinationOffset: 0,
      destinationStride: 0,
      sourceTop: 0,
      sourceHeight: 0,
      sourceLeftBytes: 0,
      sourceWidthBytes: 0
    };
    computedLayout.sourceTop = Math.ceil(Math.trunc(parsedRect.y || 0) / sampleHeight);
    computedLayout.sourceHeight = Math.ceil(Math.trunc(parsedRect.height || 0) / sampleHeight);
    computedLayout.sourceLeftBytes = Math.floor(Math.trunc(parsedRect.x || 0) / sampleWidth) * sampleBytes;
    computedLayout.sourceWidthBytes = Math.floor(Math.trunc(parsedRect.width || 0) / sampleWidth) * sampleBytes;
    if (layout !== void 0) {
      const planeLayout = layout[planeIndex];
      if (planeLayout.stride < computedLayout.sourceWidthBytes) {
        throw new TypeError(`Stride for plane ${planeIndex} is too small.`);
      }
      computedLayout.destinationOffset = planeLayout.offset;
      computedLayout.destinationStride = planeLayout.stride;
    } else {
      computedLayout.destinationOffset = minAllocationSize;
      computedLayout.destinationStride = computedLayout.sourceWidthBytes;
    }
    const planeSize = computedLayout.destinationStride * computedLayout.sourceHeight;
    const planeEnd = planeSize + computedLayout.destinationOffset;
    if (planeEnd > 4294967295) {
      throw new TypeError("Allocation size exceeds limit.");
    }
    endOffsets.push(planeEnd);
    minAllocationSize = Math.max(minAllocationSize, planeEnd);
    for (let earlierPlaneIndex = 0; earlierPlaneIndex < planeIndex; earlierPlaneIndex++) {
      const earlierLayout = computedLayouts[earlierPlaneIndex];
      if (endOffsets[planeIndex] <= earlierLayout.destinationOffset || endOffsets[earlierPlaneIndex] <= computedLayout.destinationOffset) {
        continue;
      }
      throw new TypeError("Planes overlap.");
    }
    computedLayouts.push(computedLayout);
  }
  return {
    allocationSize: minAllocationSize,
    computedLayouts
  };
};
var AUDIO_SAMPLE_FORMATS = /* @__PURE__ */ new Set(["f32", "f32-planar", "s16", "s16-planar", "s32", "s32-planar", "u8", "u8-planar"]);
var AudioSampleResource = class {
  constructor() {
    this._referenceCount = 0;
  }
};
var AudioSample = class _AudioSample {
  /** The presentation timestamp of the sample in microseconds. */
  get microsecondTimestamp() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.timestamp);
  }
  /** The duration of the sample in microseconds. */
  get microsecondDuration() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.duration);
  }
  constructor(init) {
    this._closed = false;
    if (isAudioData(init)) {
      if (init.format === null) {
        throw new TypeError("AudioData with null format is not supported.");
      }
      this._data = init;
      this.format = init.format;
      this.sampleRate = init.sampleRate;
      this.numberOfFrames = init.numberOfFrames;
      this.numberOfChannels = init.numberOfChannels;
      this.timestamp = init.timestamp / 1e6;
      this.duration = init.numberOfFrames / init.sampleRate;
    } else if (init instanceof AudioSampleResource) {
      this._data = init;
      init._referenceCount++;
      this.format = init.getFormat();
      if (!AUDIO_SAMPLE_FORMATS.has(this.format)) {
        throw new TypeError("getFormat() must return an AudioSampleFormat.");
      }
      this.sampleRate = init.getSampleRate();
      if (!Number.isInteger(this.sampleRate) || this.sampleRate <= 0) {
        throw new TypeError("getSampleRate() must return a positive integer.");
      }
      this.numberOfFrames = init.getNumberOfFrames();
      if (!Number.isInteger(this.numberOfFrames) || this.numberOfFrames < 0) {
        throw new TypeError("getNumberOfFrames() must return a non-negative integer.");
      }
      this.numberOfChannels = init.getNumberOfChannels();
      if (!Number.isInteger(this.numberOfChannels) || this.numberOfChannels <= 0) {
        throw new TypeError("getNumberOfChannels() must return a positive integer.");
      }
      this.timestamp = init.getTimestamp();
      if (!Number.isFinite(this.timestamp)) {
        throw new TypeError("getTimestamp() must return a finite number.");
      }
      this.duration = this.numberOfFrames / this.sampleRate;
    } else {
      if (!init || typeof init !== "object") {
        throw new TypeError("Invalid AudioDataInit: must be an object.");
      }
      if (!AUDIO_SAMPLE_FORMATS.has(init.format)) {
        throw new TypeError("Invalid AudioDataInit: invalid format.");
      }
      if (!Number.isFinite(init.sampleRate) || init.sampleRate <= 0) {
        throw new TypeError("Invalid AudioDataInit: sampleRate must be > 0.");
      }
      if (!Number.isInteger(init.numberOfChannels) || init.numberOfChannels === 0) {
        throw new TypeError("Invalid AudioDataInit: numberOfChannels must be an integer > 0.");
      }
      if (!Number.isFinite(init?.timestamp)) {
        throw new TypeError("init.timestamp must be a number.");
      }
      const numberOfFrames = init.data.byteLength / (getBytesPerSample(init.format) * init.numberOfChannels);
      if (!Number.isInteger(numberOfFrames)) {
        throw new TypeError("Invalid AudioDataInit: data size is not a multiple of frame size.");
      }
      this.format = init.format;
      this.sampleRate = init.sampleRate;
      this.numberOfFrames = numberOfFrames;
      this.numberOfChannels = init.numberOfChannels;
      this.timestamp = init.timestamp;
      this.duration = numberOfFrames / init.sampleRate;
      let dataBuffer;
      if (init.data instanceof ArrayBuffer) {
        dataBuffer = new Uint8Array(init.data);
      } else if (ArrayBuffer.isView(init.data)) {
        dataBuffer = new Uint8Array(init.data.buffer, init.data.byteOffset, init.data.byteLength);
      } else {
        throw new TypeError("Invalid AudioDataInit: data is not a BufferSource.");
      }
      const expectedSize = this.numberOfFrames * this.numberOfChannels * getBytesPerSample(this.format);
      if (dataBuffer.byteLength < expectedSize) {
        throw new TypeError("Invalid AudioDataInit: insufficient data size.");
      }
      this._data = dataBuffer;
    }
    finalizationRegistry?.register(this, { type: "audio", data: this._data }, this);
  }
  /** Returns the number of bytes required to hold the audio sample's data as specified by the given options. */
  allocationSize(options) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!Number.isInteger(options.planeIndex) || options.planeIndex < 0) {
      throw new TypeError("planeIndex must be a non-negative integer.");
    }
    if (options.format !== void 0 && !AUDIO_SAMPLE_FORMATS.has(options.format)) {
      throw new TypeError("Invalid format.");
    }
    if (options.frameOffset !== void 0 && (!Number.isInteger(options.frameOffset) || options.frameOffset < 0)) {
      throw new TypeError("frameOffset must be a non-negative integer.");
    }
    if (options.frameCount !== void 0 && (!Number.isInteger(options.frameCount) || options.frameCount < 0)) {
      throw new TypeError("frameCount must be a non-negative integer.");
    }
    if (this._closed) {
      throw new Error("AudioSample is closed.");
    }
    const destFormat = options.format ?? this.format;
    const frameOffset = options.frameOffset ?? 0;
    if (frameOffset >= this.numberOfFrames) {
      throw new RangeError("frameOffset out of range");
    }
    const copyFrameCount = options.frameCount !== void 0 ? options.frameCount : this.numberOfFrames - frameOffset;
    if (copyFrameCount > this.numberOfFrames - frameOffset) {
      throw new RangeError("frameCount out of range");
    }
    const bytesPerSample = getBytesPerSample(destFormat);
    const isPlanar = formatIsPlanar(destFormat);
    if (isPlanar && options.planeIndex >= this.numberOfChannels) {
      throw new RangeError("planeIndex out of range");
    }
    if (!isPlanar && options.planeIndex !== 0) {
      throw new RangeError("planeIndex out of range");
    }
    const elementCount = isPlanar ? copyFrameCount : copyFrameCount * this.numberOfChannels;
    return elementCount * bytesPerSample;
  }
  /** Copies the audio sample's data to an ArrayBuffer or ArrayBufferView as specified by the given options. */
  copyTo(destination, options) {
    if (!isAllowSharedBufferSource(destination)) {
      throw new TypeError("destination must be an ArrayBuffer or an ArrayBuffer view.");
    }
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!Number.isInteger(options.planeIndex) || options.planeIndex < 0) {
      throw new TypeError("planeIndex must be a non-negative integer.");
    }
    if (options.format !== void 0 && !AUDIO_SAMPLE_FORMATS.has(options.format)) {
      throw new TypeError("Invalid format.");
    }
    if (options.frameOffset !== void 0 && (!Number.isInteger(options.frameOffset) || options.frameOffset < 0)) {
      throw new TypeError("frameOffset must be a non-negative integer.");
    }
    if (options.frameCount !== void 0 && (!Number.isInteger(options.frameCount) || options.frameCount < 0)) {
      throw new TypeError("frameCount must be a non-negative integer.");
    }
    if (this._closed) {
      throw new Error("AudioSample is closed.");
    }
    const { format, frameCount: optFrameCount, frameOffset: optFrameOffset } = options;
    let { planeIndex } = options;
    const srcFormat = this.format;
    const destFormat = format ?? this.format;
    if (!destFormat)
      throw new Error("Destination format not determined");
    const numFrames = this.numberOfFrames;
    const numChannels = this.numberOfChannels;
    const frameOffset = optFrameOffset ?? 0;
    if (frameOffset >= numFrames) {
      throw new RangeError("frameOffset out of range");
    }
    const copyFrameCount = optFrameCount !== void 0 ? optFrameCount : numFrames - frameOffset;
    if (copyFrameCount > numFrames - frameOffset) {
      throw new RangeError("frameCount out of range");
    }
    const destBytesPerSample = getBytesPerSample(destFormat);
    const destIsPlanar = formatIsPlanar(destFormat);
    if (destIsPlanar && planeIndex >= numChannels) {
      throw new RangeError("planeIndex out of range");
    }
    if (!destIsPlanar && planeIndex !== 0) {
      throw new RangeError("planeIndex out of range");
    }
    const destElementCount = destIsPlanar ? copyFrameCount : copyFrameCount * numChannels;
    const requiredSize = destElementCount * destBytesPerSample;
    if (destination.byteLength < requiredSize) {
      throw new RangeError("Destination buffer is too small");
    }
    const destView = toDataView(destination);
    const writeFn = getWriteFunction(destFormat);
    if (isAudioData(this._data)) {
      if (isWebKit() && numChannels > 2 && destFormat !== srcFormat) {
        doAudioDataCopyToWebKitWorkaround(this._data, destView, srcFormat, destFormat, numChannels, planeIndex, frameOffset, copyFrameCount);
      } else {
        this._data.copyTo(destination, {
          planeIndex,
          frameOffset,
          frameCount: copyFrameCount,
          format: destFormat
        });
      }
    } else {
      const readFn = getReadFunction(srcFormat);
      const srcBytesPerSample = getBytesPerSample(srcFormat);
      const srcIsPlanar = formatIsPlanar(srcFormat);
      let uint8Data;
      if (this._data instanceof AudioSampleResource) {
        const getDataPlaneValidated = (index) => {
          const result = this._data.getDataPlane(index);
          if (!(result instanceof Uint8Array)) {
            throw new TypeError("getDataPlane() must return a Uint8Array.");
          }
          const expectedSize = numFrames * srcBytesPerSample * (srcIsPlanar ? 1 : numChannels);
          if (result.byteLength !== expectedSize) {
            throw new TypeError(`Data plane ${index} has invalid size. Expected exactly ${expectedSize} bytes, got ${result.byteLength} bytes.`);
          }
          return result;
        };
        if (srcIsPlanar) {
          if (destIsPlanar) {
            uint8Data = getDataPlaneValidated(planeIndex);
            planeIndex = 0;
          } else {
            uint8Data = new Uint8Array(numFrames * srcBytesPerSample * numChannels);
            for (let ch = 0; ch < numChannels; ch++) {
              const planeData = getDataPlaneValidated(ch);
              uint8Data.set(planeData, ch * numFrames * srcBytesPerSample);
            }
          }
        } else {
          uint8Data = getDataPlaneValidated(0);
        }
      } else {
        uint8Data = this._data;
      }
      const srcView = toDataView(uint8Data);
      for (let i = 0; i < copyFrameCount; i++) {
        if (destIsPlanar) {
          const destOffset = i * destBytesPerSample;
          let srcOffset;
          if (srcIsPlanar) {
            srcOffset = (planeIndex * numFrames + (i + frameOffset)) * srcBytesPerSample;
          } else {
            srcOffset = ((i + frameOffset) * numChannels + planeIndex) * srcBytesPerSample;
          }
          const normalized = readFn(srcView, srcOffset);
          writeFn(destView, destOffset, normalized);
        } else {
          for (let ch = 0; ch < numChannels; ch++) {
            const destIndex = i * numChannels + ch;
            const destOffset = destIndex * destBytesPerSample;
            let srcOffset;
            if (srcIsPlanar) {
              srcOffset = (ch * numFrames + (i + frameOffset)) * srcBytesPerSample;
            } else {
              srcOffset = ((i + frameOffset) * numChannels + ch) * srcBytesPerSample;
            }
            const normalized = readFn(srcView, srcOffset);
            writeFn(destView, destOffset, normalized);
          }
        }
      }
    }
  }
  /** Clones this audio sample. */
  clone() {
    if (this._closed) {
      throw new Error("AudioSample is closed.");
    }
    if (this._data instanceof AudioSampleResource) {
      const sample = new _AudioSample(this._data);
      sample.setTimestamp(this.timestamp);
      return sample;
    } else if (isAudioData(this._data)) {
      const sample = new _AudioSample(this._data.clone());
      sample.setTimestamp(this.timestamp);
      return sample;
    } else {
      return new _AudioSample({
        format: this.format,
        sampleRate: this.sampleRate,
        numberOfFrames: this.numberOfFrames,
        numberOfChannels: this.numberOfChannels,
        timestamp: this.timestamp,
        data: this._data
      });
    }
  }
  /**
   * Closes this audio sample, releasing held resources. Audio samples should be closed as soon as they are not
   * needed anymore.
   */
  close() {
    if (this._closed) {
      return;
    }
    finalizationRegistry?.unregister(this);
    if (this._data instanceof AudioSampleResource) {
      this._data._referenceCount--;
      if (this._data._referenceCount === 0) {
        this._data.close();
      }
    } else if (isAudioData(this._data)) {
      this._data.close();
    } else {
      this._data = new Uint8Array(0);
    }
    this._closed = true;
  }
  /**
   * Converts this audio sample to an AudioData for use with the WebCodecs API. The AudioData returned by this
   * method *must* be closed separately from this audio sample.
   */
  toAudioData() {
    if (this._closed) {
      throw new Error("AudioSample is closed.");
    }
    if (this._data instanceof AudioSampleResource) {
      return this._createAudioDataFromData();
    } else if (isAudioData(this._data)) {
      if (this._data.timestamp === this.microsecondTimestamp) {
        return this._data.clone();
      } else {
        return this._createAudioDataFromData();
      }
    } else {
      return new AudioData({
        format: this.format,
        sampleRate: this.sampleRate,
        numberOfFrames: this.numberOfFrames,
        numberOfChannels: this.numberOfChannels,
        timestamp: this.microsecondTimestamp,
        data: this._data.buffer instanceof ArrayBuffer ? this._data.buffer : this._data.slice()
        // In the case of SharedArrayBuffer, convert to ArrayBuffer
      });
    }
  }
  /** @internal */
  _createAudioDataFromData() {
    if (formatIsPlanar(this.format)) {
      const size = this.allocationSize({ planeIndex: 0, format: this.format });
      const data = new ArrayBuffer(size * this.numberOfChannels);
      for (let i = 0; i < this.numberOfChannels; i++) {
        this.copyTo(new Uint8Array(data, i * size, size), { planeIndex: i, format: this.format });
      }
      return new AudioData({
        format: this.format,
        sampleRate: this.sampleRate,
        numberOfFrames: this.numberOfFrames,
        numberOfChannels: this.numberOfChannels,
        timestamp: this.microsecondTimestamp,
        data
      });
    } else {
      const data = new ArrayBuffer(this.allocationSize({ planeIndex: 0, format: this.format }));
      this.copyTo(data, { planeIndex: 0, format: this.format });
      return new AudioData({
        format: this.format,
        sampleRate: this.sampleRate,
        numberOfFrames: this.numberOfFrames,
        numberOfChannels: this.numberOfChannels,
        timestamp: this.microsecondTimestamp,
        data
      });
    }
  }
  /** Convert this audio sample to an AudioBuffer for use with the Web Audio API. */
  toAudioBuffer() {
    if (this._closed) {
      throw new Error("AudioSample is closed.");
    }
    const audioBuffer = new AudioBuffer({
      numberOfChannels: this.numberOfChannels,
      length: this.numberOfFrames,
      sampleRate: this.sampleRate
    });
    const dataBytes = new Float32Array(this.allocationSize({ planeIndex: 0, format: "f32-planar" }) / 4);
    for (let i = 0; i < this.numberOfChannels; i++) {
      this.copyTo(dataBytes, { planeIndex: i, format: "f32-planar" });
      audioBuffer.copyToChannel(dataBytes, i);
    }
    return audioBuffer;
  }
  /** Sets the presentation timestamp of this audio sample, in seconds. */
  setTimestamp(newTimestamp) {
    if (!Number.isFinite(newTimestamp)) {
      throw new TypeError("newTimestamp must be a number.");
    }
    this.timestamp = newTimestamp;
  }
  /** Calls `.close()`. */
  [Symbol.dispose]() {
    this.close();
  }
  /** @internal */
  static *_fromAudioBuffer(audioBuffer, timestamp) {
    if (!(audioBuffer instanceof AudioBuffer)) {
      throw new TypeError("audioBuffer must be an AudioBuffer.");
    }
    const MAX_FLOAT_COUNT = 48e3 * 5;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const totalFrames = audioBuffer.length;
    const maxFramesPerChunk = Math.floor(MAX_FLOAT_COUNT / numberOfChannels);
    let currentRelativeFrame = 0;
    let remainingFrames = totalFrames;
    while (remainingFrames > 0) {
      const framesToCopy = Math.min(maxFramesPerChunk, remainingFrames);
      const chunkData = new Float32Array(numberOfChannels * framesToCopy);
      for (let channel = 0; channel < numberOfChannels; channel++) {
        audioBuffer.copyFromChannel(chunkData.subarray(channel * framesToCopy, (channel + 1) * framesToCopy), channel, currentRelativeFrame);
      }
      yield new _AudioSample({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: framesToCopy,
        numberOfChannels,
        timestamp: timestamp + currentRelativeFrame / sampleRate,
        data: chunkData
      });
      currentRelativeFrame += framesToCopy;
      remainingFrames -= framesToCopy;
    }
  }
  /**
   * Creates AudioSamples from an AudioBuffer, starting at the given timestamp in seconds. Typically creates exactly
   * one sample, but may create multiple if the AudioBuffer is exceedingly large.
   */
  static fromAudioBuffer(audioBuffer, timestamp) {
    if (!(audioBuffer instanceof AudioBuffer)) {
      throw new TypeError("audioBuffer must be an AudioBuffer.");
    }
    const MAX_FLOAT_COUNT = 48e3 * 5;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const totalFrames = audioBuffer.length;
    const maxFramesPerChunk = Math.floor(MAX_FLOAT_COUNT / numberOfChannels);
    let currentRelativeFrame = 0;
    let remainingFrames = totalFrames;
    const result = [];
    while (remainingFrames > 0) {
      const framesToCopy = Math.min(maxFramesPerChunk, remainingFrames);
      const chunkData = new Float32Array(numberOfChannels * framesToCopy);
      for (let channel = 0; channel < numberOfChannels; channel++) {
        audioBuffer.copyFromChannel(chunkData.subarray(channel * framesToCopy, (channel + 1) * framesToCopy), channel, currentRelativeFrame);
      }
      const audioSample = new _AudioSample({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: framesToCopy,
        numberOfChannels,
        timestamp: timestamp + currentRelativeFrame / sampleRate,
        data: chunkData
      });
      result.push(audioSample);
      currentRelativeFrame += framesToCopy;
      remainingFrames -= framesToCopy;
    }
    return result;
  }
};
var getBytesPerSample = (format) => {
  switch (format) {
    case "u8":
    case "u8-planar":
      return 1;
    case "s16":
    case "s16-planar":
      return 2;
    case "s32":
    case "s32-planar":
      return 4;
    case "f32":
    case "f32-planar":
      return 4;
    default:
      throw new Error("Unknown AudioSampleFormat");
  }
};
var formatIsPlanar = (format) => {
  switch (format) {
    case "u8-planar":
    case "s16-planar":
    case "s32-planar":
    case "f32-planar":
      return true;
    default:
      return false;
  }
};
var getReadFunction = (format) => {
  switch (format) {
    case "u8":
    case "u8-planar":
      return (view2, offset) => (view2.getUint8(offset) - 128) / 128;
    case "s16":
    case "s16-planar":
      return (view2, offset) => view2.getInt16(offset, true) / 32768;
    case "s32":
    case "s32-planar":
      return (view2, offset) => view2.getInt32(offset, true) / 2147483648;
    case "f32":
    case "f32-planar":
      return (view2, offset) => view2.getFloat32(offset, true);
  }
};
var getWriteFunction = (format) => {
  switch (format) {
    case "u8":
    case "u8-planar":
      return (view2, offset, value) => view2.setUint8(offset, clamp((value + 1) * 127.5, 0, 255));
    case "s16":
    case "s16-planar":
      return (view2, offset, value) => view2.setInt16(offset, clamp(Math.round(value * 32767), -32768, 32767), true);
    case "s32":
    case "s32-planar":
      return (view2, offset, value) => view2.setInt32(offset, clamp(Math.round(value * 2147483647), -2147483648, 2147483647), true);
    case "f32":
    case "f32-planar":
      return (view2, offset, value) => view2.setFloat32(offset, value, true);
  }
};
var isAudioData = (x) => {
  return typeof AudioData !== "undefined" && x instanceof AudioData;
};
var toInterleavedAudioFormat = (format) => {
  switch (format) {
    case "u8-planar":
      return "u8";
    case "s16-planar":
      return "s16";
    case "s32-planar":
      return "s32";
    case "f32-planar":
      return "f32";
    default:
      return format;
  }
};
var doAudioDataCopyToWebKitWorkaround = (audioData, destView, srcFormat, destFormat, numChannels, planeIndex, frameOffset, copyFrameCount) => {
  const readFn = getReadFunction(srcFormat);
  const writeFn = getWriteFunction(destFormat);
  const srcBytesPerSample = getBytesPerSample(srcFormat);
  const destBytesPerSample = getBytesPerSample(destFormat);
  const srcIsPlanar = formatIsPlanar(srcFormat);
  const destIsPlanar = formatIsPlanar(destFormat);
  if (destIsPlanar) {
    if (srcIsPlanar) {
      const data = new ArrayBuffer(copyFrameCount * srcBytesPerSample);
      const dataView = toDataView(data);
      audioData.copyTo(data, {
        planeIndex,
        frameOffset,
        frameCount: copyFrameCount,
        format: srcFormat
      });
      for (let i = 0; i < copyFrameCount; i++) {
        const srcOffset = i * srcBytesPerSample;
        const destOffset = i * destBytesPerSample;
        const sample = readFn(dataView, srcOffset);
        writeFn(destView, destOffset, sample);
      }
    } else {
      const data = new ArrayBuffer(copyFrameCount * numChannels * srcBytesPerSample);
      const dataView = toDataView(data);
      audioData.copyTo(data, {
        planeIndex: 0,
        frameOffset,
        frameCount: copyFrameCount,
        format: srcFormat
      });
      for (let i = 0; i < copyFrameCount; i++) {
        const srcOffset = (i * numChannels + planeIndex) * srcBytesPerSample;
        const destOffset = i * destBytesPerSample;
        const sample = readFn(dataView, srcOffset);
        writeFn(destView, destOffset, sample);
      }
    }
  } else {
    if (srcIsPlanar) {
      const planeSize = copyFrameCount * srcBytesPerSample;
      const data = new ArrayBuffer(planeSize);
      const dataView = toDataView(data);
      for (let ch = 0; ch < numChannels; ch++) {
        audioData.copyTo(data, {
          planeIndex: ch,
          frameOffset,
          frameCount: copyFrameCount,
          format: srcFormat
        });
        for (let i = 0; i < copyFrameCount; i++) {
          const srcOffset = i * srcBytesPerSample;
          const destOffset = (i * numChannels + ch) * destBytesPerSample;
          const sample = readFn(dataView, srcOffset);
          writeFn(destView, destOffset, sample);
        }
      }
    } else {
      const data = new ArrayBuffer(copyFrameCount * numChannels * srcBytesPerSample);
      const dataView = toDataView(data);
      audioData.copyTo(data, {
        planeIndex: 0,
        frameOffset,
        frameCount: copyFrameCount,
        format: srcFormat
      });
      for (let i = 0; i < copyFrameCount; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const idx = i * numChannels + ch;
          const srcOffset = idx * srcBytesPerSample;
          const destOffset = idx * destBytesPerSample;
          const sample = readFn(dataView, srcOffset);
          writeFn(destView, destOffset, sample);
        }
      }
    }
  }
};
var audioSampleToInterleavedFormat = (sample, format) => {
  const size = sample.allocationSize({ format, planeIndex: 0 });
  const buffer = new ArrayBuffer(size);
  sample.copyTo(buffer, { format, planeIndex: 0 });
  return new AudioSample({
    data: buffer,
    format,
    numberOfChannels: sample.numberOfChannels,
    sampleRate: sample.sampleRate,
    timestamp: sample.timestamp,
    duration: sample.duration
  });
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/encode.js
var canEncodeVideoMemo = /* @__PURE__ */ new Map();
var canEncodeAudioMemo = /* @__PURE__ */ new Map();
var validateVideoEncodingConfig = (config) => {
  if (!config || typeof config !== "object") {
    throw new TypeError("Encoding config must be an object.");
  }
  if (!VIDEO_CODECS.includes(config.codec)) {
    throw new TypeError(`Invalid video codec '${config.codec}'. Must be one of: ${VIDEO_CODECS.join(", ")}.`);
  }
  if (!(config.bitrate instanceof Quality) && (!Number.isInteger(config.bitrate) || config.bitrate <= 0)) {
    throw new TypeError("config.bitrate must be a positive integer or a quality.");
  }
  if (config.keyFrameInterval !== void 0 && (!Number.isFinite(config.keyFrameInterval) || config.keyFrameInterval < 0)) {
    throw new TypeError("config.keyFrameInterval, when provided, must be a non-negative number.");
  }
  if (config.sizeChangeBehavior !== void 0 && !["deny", "passThrough", "fill", "contain", "cover"].includes(config.sizeChangeBehavior)) {
    throw new TypeError("config.sizeChangeBehavior, when provided, must be 'deny', 'passThrough', 'fill', 'contain' or 'cover'.");
  }
  if (config.transform !== void 0) {
    if (typeof config.transform !== "object" || !config.transform) {
      throw new TypeError("config.transform, when provided, must be an object.");
    }
    if (config.transform.width !== void 0 && (!Number.isInteger(config.transform.width) || config.transform.width <= 0)) {
      throw new TypeError("config.transform.width, when provided, must be a positive integer.");
    }
    if (config.transform.height !== void 0 && (!Number.isInteger(config.transform.height) || config.transform.height <= 0)) {
      throw new TypeError("config.transform.height, when provided, must be a positive integer.");
    }
    if (config.transform.fit !== void 0 && !["fill", "contain", "cover"].includes(config.transform.fit)) {
      throw new TypeError('config.transform.fit, when provided, must be one of "fill", "contain", or "cover".');
    }
    if (config.transform.width !== void 0 && config.transform.height !== void 0 && config.transform.fit === void 0 && !["fill", "contain", "cover"].includes(config.sizeChangeBehavior)) {
      throw new TypeError("When both config.transform.width and config.transform.height are provided, config.transform.fit must also be provided.");
    }
    if (config.transform.fit !== void 0 && ["fill", "contain", "cover"].includes(config.sizeChangeBehavior) && config.transform.fit !== config.sizeChangeBehavior) {
      throw new TypeError("config.transform.fit, when provided, cannot differ from config.sizeChangeBehavior when config.sizeChangeBehavior is 'fill', 'contain' or 'cover', as sizeChangeBehavior already determines the fitting algorithm.");
    }
    if (config.transform.rotate !== void 0 && ![0, 90, 180, 270].includes(config.transform.rotate)) {
      throw new TypeError("config.transform.rotate, when provided, must be 0, 90, 180 or 270.");
    }
    if (config.transform.crop !== void 0) {
      validateCropRectangle(config.transform.crop, "config.transform.");
    }
    if (config.transform.process !== void 0 && typeof config.transform.process !== "function") {
      throw new TypeError("config.transform.process, when provided, must be a function.");
    }
    if (config.transform.frameRate !== void 0 && (!Number.isFinite(config.transform.frameRate) || config.transform.frameRate <= 0)) {
      throw new TypeError("config.transform.frameRate, when provided, must be a finite positive number.");
    }
    if (config.transform.force !== void 0 && typeof config.transform.force !== "boolean") {
      throw new TypeError("config.transform.force, when provided, must be a boolean.");
    }
  }
  if (config.onEncodedPacket !== void 0 && typeof config.onEncodedPacket !== "function") {
    throw new TypeError("config.onEncodedPacket, when provided, must be a function.");
  }
  if (config.onEncoderConfig !== void 0 && typeof config.onEncoderConfig !== "function") {
    throw new TypeError("config.onEncoderConfig, when provided, must be a function.");
  }
  validateVideoEncodingAdditionalOptions(config.codec, config);
};
var validateVideoEncodingAdditionalOptions = (codec, options) => {
  if (!options || typeof options !== "object") {
    throw new TypeError("Encoding options must be an object.");
  }
  if (options.alpha !== void 0 && !["discard", "keep"].includes(options.alpha)) {
    throw new TypeError("options.alpha, when provided, must be 'discard' or 'keep'.");
  }
  if (options.bitrateMode !== void 0 && !["constant", "variable"].includes(options.bitrateMode)) {
    throw new TypeError("bitrateMode, when provided, must be 'constant' or 'variable'.");
  }
  if (options.latencyMode !== void 0 && !["quality", "realtime"].includes(options.latencyMode)) {
    throw new TypeError("latencyMode, when provided, must be 'quality' or 'realtime'.");
  }
  if (options.fullCodecString !== void 0 && typeof options.fullCodecString !== "string") {
    throw new TypeError("fullCodecString, when provided, must be a string.");
  }
  if (options.fullCodecString !== void 0 && inferCodecFromCodecString(options.fullCodecString) !== codec) {
    throw new TypeError(`fullCodecString, when provided, must be a string that matches the specified codec (${codec}).`);
  }
  if (options.hardwareAcceleration !== void 0 && !["no-preference", "prefer-hardware", "prefer-software"].includes(options.hardwareAcceleration)) {
    throw new TypeError("hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");
  }
  if (options.scalabilityMode !== void 0 && typeof options.scalabilityMode !== "string") {
    throw new TypeError("scalabilityMode, when provided, must be a string.");
  }
  if (options.contentHint !== void 0 && typeof options.contentHint !== "string") {
    throw new TypeError("contentHint, when provided, must be a string.");
  }
};
var buildVideoEncoderConfig = (options) => {
  const resolvedBitrate = options.bitrate instanceof Quality ? options.bitrate._toVideoBitrate(options.codec, options.width, options.height) : options.bitrate;
  return {
    codec: options.fullCodecString ?? buildVideoCodecString(options.codec, options.width, options.height, resolvedBitrate),
    width: options.width,
    height: options.height,
    displayWidth: options.squarePixelWidth,
    displayHeight: options.squarePixelHeight,
    bitrate: resolvedBitrate,
    bitrateMode: options.bitrateMode,
    alpha: options.alpha ?? "discard",
    framerate: options.framerate,
    latencyMode: options.latencyMode,
    hardwareAcceleration: options.hardwareAcceleration,
    scalabilityMode: options.scalabilityMode,
    contentHint: options.contentHint,
    ...getVideoEncoderConfigExtension(options.codec)
  };
};
var validateAudioEncodingConfig = (config) => {
  if (!config || typeof config !== "object") {
    throw new TypeError("Encoding config must be an object.");
  }
  if (!AUDIO_CODECS.includes(config.codec)) {
    throw new TypeError(`Invalid audio codec '${config.codec}'. Must be one of: ${AUDIO_CODECS.join(", ")}.`);
  }
  if (config.bitrate === void 0 && !(PCM_AUDIO_CODECS.includes(config.codec) || config.codec === "flac")) {
    throw new TypeError("config.bitrate must be provided for compressed audio codecs.");
  }
  if (config.bitrate !== void 0 && !(config.bitrate instanceof Quality) && (!Number.isInteger(config.bitrate) || config.bitrate <= 0)) {
    throw new TypeError("config.bitrate, when provided, must be a positive integer or a quality.");
  }
  if (config.transform !== void 0) {
    if (typeof config.transform !== "object" || !config.transform) {
      throw new TypeError("config.transform, when provided, must be an object.");
    }
    if (config.transform.numberOfChannels !== void 0 && (!Number.isInteger(config.transform.numberOfChannels) || config.transform.numberOfChannels <= 0)) {
      throw new TypeError("config.transform.numberOfChannels, when provided, must be a positive integer.");
    }
    if (config.transform.sampleRate !== void 0 && (!Number.isInteger(config.transform.sampleRate) || config.transform.sampleRate <= 0)) {
      throw new TypeError("config.transform.sampleRate, when provided, must be a positive integer.");
    }
    if (config.transform.sampleFormat !== void 0 && !["u8", "s16", "s32", "f32"].includes(config.transform.sampleFormat)) {
      throw new TypeError("config.transform.sampleFormat, when provided, must be one of: u8, s16, s32, f32.");
    }
    if (config.transform.process !== void 0 && typeof config.transform.process !== "function") {
      throw new TypeError("config.transform.process, when provided, must be a function.");
    }
  }
  if (config.onEncodedPacket !== void 0 && typeof config.onEncodedPacket !== "function") {
    throw new TypeError("config.onEncodedPacket, when provided, must be a function.");
  }
  if (config.onEncoderConfig !== void 0 && typeof config.onEncoderConfig !== "function") {
    throw new TypeError("config.onEncoderConfig, when provided, must be a function.");
  }
  validateAudioEncodingAdditionalOptions(config.codec, config);
};
var validateAudioEncodingAdditionalOptions = (codec, options) => {
  if (!options || typeof options !== "object") {
    throw new TypeError("Encoding options must be an object.");
  }
  if (options.bitrateMode !== void 0 && !["constant", "variable"].includes(options.bitrateMode)) {
    throw new TypeError("bitrateMode, when provided, must be 'constant' or 'variable'.");
  }
  if (options.fullCodecString !== void 0 && typeof options.fullCodecString !== "string") {
    throw new TypeError("fullCodecString, when provided, must be a string.");
  }
  if (options.fullCodecString !== void 0 && inferCodecFromCodecString(options.fullCodecString) !== codec) {
    throw new TypeError(`fullCodecString, when provided, must be a string that matches the specified codec (${codec}).`);
  }
};
var buildAudioEncoderConfig = (options) => {
  const resolvedBitrate = options.bitrate instanceof Quality ? options.bitrate._toAudioBitrate(options.codec) : options.bitrate;
  return {
    codec: options.fullCodecString ?? buildAudioCodecString(options.codec, options.numberOfChannels, options.sampleRate),
    numberOfChannels: options.numberOfChannels,
    sampleRate: options.sampleRate,
    bitrate: resolvedBitrate,
    bitrateMode: options.bitrateMode,
    ...getAudioEncoderConfigExtension(options.codec)
  };
};
var Quality = class {
  /** @internal */
  constructor(factor) {
    this._factor = factor;
  }
  /** @internal */
  _toVideoBitrate(codec, width, height) {
    const pixels = width * height;
    const codecEfficiencyFactors = {
      avc: 1,
      // H.264/AVC (baseline)
      hevc: 0.6,
      // H.265/HEVC (~40% more efficient than AVC)
      vp9: 0.6,
      // Similar to HEVC
      av1: 0.4,
      // ~60% more efficient than AVC
      vp8: 1.2
      // Slightly less efficient than AVC
    };
    const referencePixels = 1920 * 1080;
    const referenceBitrate = 3e6;
    const scaleFactor = Math.pow(pixels / referencePixels, 0.95);
    const baseBitrate = referenceBitrate * scaleFactor;
    const codecAdjustedBitrate = baseBitrate * codecEfficiencyFactors[codec];
    const finalBitrate = codecAdjustedBitrate * this._factor;
    return Math.ceil(finalBitrate / 1e3) * 1e3;
  }
  /** @internal */
  _toAudioBitrate(codec) {
    if (PCM_AUDIO_CODECS.includes(codec) || codec === "flac") {
      return void 0;
    }
    const baseRates = {
      aac: 128e3,
      // 128kbps base for AAC
      opus: 64e3,
      // 64kbps base for Opus
      mp3: 16e4,
      // 160kbps base for MP3
      vorbis: 64e3,
      // 64kbps base for Vorbis
      ac3: 384e3,
      // 384kbps base for AC-3
      eac3: 192e3
      // 192kbps base for E-AC-3
    };
    const baseBitrate = baseRates[codec];
    if (!baseBitrate) {
      throw new Error(`Unhandled codec: ${codec}`);
    }
    let finalBitrate = baseBitrate * this._factor;
    if (codec === "aac") {
      const validRates = [96e3, 128e3, 16e4, 192e3];
      finalBitrate = validRates.reduce((prev, curr) => Math.abs(curr - finalBitrate) < Math.abs(prev - finalBitrate) ? curr : prev);
    } else if (codec === "opus" || codec === "vorbis") {
      finalBitrate = Math.max(6e3, finalBitrate);
    } else if (codec === "mp3") {
      const validRates = [
        8e3,
        16e3,
        24e3,
        32e3,
        4e4,
        48e3,
        64e3,
        8e4,
        96e3,
        112e3,
        128e3,
        16e4,
        192e3,
        224e3,
        256e3,
        32e4
      ];
      finalBitrate = validRates.reduce((prev, curr) => Math.abs(curr - finalBitrate) < Math.abs(prev - finalBitrate) ? curr : prev);
    }
    return Math.round(finalBitrate / 1e3) * 1e3;
  }
};
var QUALITY_HIGH = /* @__PURE__ */ new Quality(2);
var canEncodeVideo = async (codec, options = {}) => {
  const { width = 1280, height = 720, bitrate = 1e6, ...restOptions } = options;
  if (!VIDEO_CODECS.includes(codec)) {
    return false;
  }
  if (!Number.isInteger(width) || width <= 0) {
    throw new TypeError("width must be a positive integer.");
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new TypeError("height must be a positive integer.");
  }
  if (!(bitrate instanceof Quality) && (!Number.isInteger(bitrate) || bitrate <= 0)) {
    throw new TypeError("bitrate must be a positive integer or a quality.");
  }
  validateVideoEncodingAdditionalOptions(codec, restOptions);
  const encoderConfig = buildVideoEncoderConfig({
    codec,
    width,
    height,
    bitrate,
    framerate: void 0,
    ...restOptions,
    alpha: "discard"
    // Since we handle alpha ourselves
  });
  const key = JSON.stringify(encoderConfig);
  const memoized = canEncodeVideoMemo.get(key);
  if (memoized) {
    return memoized;
  }
  const promise = (async () => {
    if (customVideoEncoders.some((x) => x.supports(codec, encoderConfig))) {
      return true;
    }
    if (typeof VideoEncoder === "undefined") {
      return false;
    }
    const hasOddDimension = width % 2 === 1 || height % 2 === 1;
    if (hasOddDimension && (codec === "avc" || codec === "hevc")) {
      return false;
    }
    const support = await VideoEncoder.isConfigSupported(encoderConfig);
    if (!support.supported) {
      return false;
    }
    if (isFirefox()) {
      return new Promise(async (resolve) => {
        try {
          const encoder = new VideoEncoder({
            output: () => {
            },
            error: () => resolve(false)
          });
          encoder.configure(encoderConfig);
          const frameData = new Uint8Array(width * height * 4);
          const frame = new VideoFrame(frameData, {
            format: "RGBA",
            codedWidth: width,
            codedHeight: height,
            timestamp: 0
          });
          encoder.encode(frame);
          frame.close();
          await encoder.flush();
          resolve(true);
        } catch {
          resolve(false);
        }
      });
    }
    return true;
  })();
  canEncodeVideoMemo.set(key, promise);
  return promise;
};
var canEncodeAudio = async (codec, options = {}) => {
  const { numberOfChannels = 2, sampleRate = 48e3, bitrate = 128e3, ...restOptions } = options;
  if (!AUDIO_CODECS.includes(codec)) {
    return false;
  }
  if (!Number.isInteger(numberOfChannels) || numberOfChannels <= 0) {
    throw new TypeError("numberOfChannels must be a positive integer.");
  }
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new TypeError("sampleRate must be a positive integer.");
  }
  if (!(bitrate instanceof Quality) && (!Number.isInteger(bitrate) || bitrate <= 0)) {
    throw new TypeError("bitrate must be a positive integer.");
  }
  validateAudioEncodingAdditionalOptions(codec, restOptions);
  const encoderConfig = buildAudioEncoderConfig({
    codec,
    numberOfChannels,
    sampleRate,
    bitrate,
    ...restOptions
  });
  const key = JSON.stringify(encoderConfig);
  const memoized = canEncodeAudioMemo.get(key);
  if (memoized) {
    return memoized;
  }
  const promise = (async () => {
    if (customAudioEncoders.some((x) => x.supports(codec, encoderConfig))) {
      return true;
    }
    if (PCM_AUDIO_CODECS.includes(codec)) {
      return true;
    }
    if (typeof AudioEncoder === "undefined") {
      return false;
    }
    const support = await AudioEncoder.isConfigSupported(encoderConfig);
    return support.supported === true;
  })();
  canEncodeAudioMemo.set(key, promise);
  return promise;
};
var getEncodableAudioCodecs = async (checkedCodecs = AUDIO_CODECS, options) => {
  const bools = await Promise.all(checkedCodecs.map((codec) => canEncodeAudio(codec, options)));
  return checkedCodecs.filter((_, i) => bools[i]);
};
var getFirstEncodableVideoCodec = async (checkedCodecs, options) => {
  for (const codec of checkedCodecs) {
    if (await canEncodeVideo(codec, options)) {
      return codec;
    }
  }
  return null;
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/custom-coder.js
var customVideoDecoders = [];
var customAudioDecoders = [];
var customVideoEncoders = [];
var customAudioEncoders = [];

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/pcm.js
var toUlaw = (s16) => {
  const MULAW_MAX = 8191;
  const MULAW_BIAS = 33;
  let number = s16;
  let mask = 4096;
  let sign = 0;
  let position = 12;
  let lsb = 0;
  if (number < 0) {
    number = -number;
    sign = 128;
  }
  number += MULAW_BIAS;
  if (number > MULAW_MAX) {
    number = MULAW_MAX;
  }
  while ((number & mask) !== mask && position >= 5) {
    mask >>= 1;
    position--;
  }
  lsb = number >> position - 4 & 15;
  return ~(sign | position - 5 << 4 | lsb) & 255;
};
var fromUlaw = (u82) => {
  const MULAW_BIAS = 33;
  let sign = 0;
  let position = 0;
  let number = ~u82;
  if (number & 128) {
    number &= ~(1 << 7);
    sign = -1;
  }
  position = ((number & 240) >> 4) + 5;
  const decoded = (1 << position | (number & 15) << position - 4 | 1 << position - 5) - MULAW_BIAS;
  return sign === 0 ? decoded : -decoded;
};
var toAlaw = (s16) => {
  const ALAW_MAX = 4095;
  let mask = 2048;
  let sign = 0;
  let position = 11;
  let lsb = 0;
  let number = s16;
  if (number < 0) {
    number = -number;
    sign = 128;
  }
  if (number > ALAW_MAX) {
    number = ALAW_MAX;
  }
  while ((number & mask) !== mask && position >= 5) {
    mask >>= 1;
    position--;
  }
  lsb = number >> (position === 4 ? 1 : position - 4) & 15;
  return (sign | position - 4 << 4 | lsb) ^ 85;
};
var fromAlaw = (u82) => {
  let sign = 0;
  let position = 0;
  let number = u82 ^ 85;
  if (number & 128) {
    number &= ~(1 << 7);
    sign = -1;
  }
  position = ((number & 240) >> 4) + 4;
  let decoded = 0;
  if (position !== 4) {
    decoded = 1 << position | (number & 15) << position - 4 | 1 << position - 5;
  } else {
    decoded = number << 1 | 1;
  }
  return sign === 0 ? decoded : -decoded;
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/media-sink.js
var validatePacketRetrievalOptions = (options) => {
  if (!options || typeof options !== "object") {
    throw new TypeError("options must be an object.");
  }
  if (options.metadataOnly !== void 0 && typeof options.metadataOnly !== "boolean") {
    throw new TypeError("options.metadataOnly, when defined, must be a boolean.");
  }
  if (options.verifyKeyPackets !== void 0 && typeof options.verifyKeyPackets !== "boolean") {
    throw new TypeError("options.verifyKeyPackets, when defined, must be a boolean.");
  }
  if (options.verifyKeyPackets && options.metadataOnly) {
    throw new TypeError("options.verifyKeyPackets and options.metadataOnly cannot be enabled together.");
  }
  if (options.skipLiveWait !== void 0 && typeof options.skipLiveWait !== "boolean") {
    throw new TypeError("options.skipLiveWait, when defined, must be a boolean.");
  }
};
var validateTimestamp = (timestamp) => {
  if (!isNumber(timestamp)) {
    throw new TypeError("timestamp must be a number.");
  }
};
var maybeFixPacketType = (track, promise, options) => {
  if (options.verifyKeyPackets) {
    return promise.then(async (packet) => {
      if (!packet || packet.type === "delta") {
        return packet;
      }
      const determinedType = await track.determinePacketType(packet);
      if (determinedType) {
        packet.type = determinedType;
      }
      return packet;
    });
  } else {
    return promise;
  }
};
var EncodedPacketSink = class {
  /** Creates a new {@link EncodedPacketSink} for the given {@link InputTrack}. */
  constructor(track) {
    if (!(track instanceof InputTrack)) {
      throw new TypeError("track must be an InputTrack.");
    }
    this._track = track;
  }
  /**
   * Retrieves the track's first packet (in decode order), or null if it has no packets. The first packet is very
   * likely to be a key packet, but it doesn't have to be.
   */
  async getFirstPacket(options = {}) {
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    return maybeFixPacketType(this._track, this._track._backing.getFirstPacket(options), options);
  }
  /** Retrieves the track's first key packet (in decode order), or null if it has no key packets. */
  async getFirstKeyPacket(options = {}) {
    validatePacketRetrievalOptions(options);
    const firstPacket = await this.getFirstPacket(options);
    if (!firstPacket) {
      return null;
    }
    if (firstPacket.type === "key") {
      return firstPacket;
    }
    return this.getNextKeyPacket(firstPacket, options);
  }
  /**
   * Retrieves the packet corresponding to the given timestamp, in seconds. More specifically, returns the last packet
   * (in presentation order) with a start timestamp less than or equal to the given timestamp. This method can be
   * used to retrieve a track's last packet using `getPacket(Infinity)`. The method returns null if the timestamp
   * is before the first packet in the track.
   *
   * @param timestamp - The timestamp used for retrieval, in seconds.
   */
  async getPacket(timestamp, options = {}) {
    validateTimestamp(timestamp);
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    return maybeFixPacketType(this._track, this._track._backing.getPacket(timestamp, options), options);
  }
  /**
   * Retrieves the packet following the given packet (in decode order), or null if the given packet is the
   * last packet.
   */
  async getNextPacket(packet, options = {}) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    return maybeFixPacketType(this._track, this._track._backing.getNextPacket(packet, options), options);
  }
  /**
   * Retrieves the key packet corresponding to the given timestamp, in seconds. More specifically, returns the last
   * key packet (in presentation order) with a start timestamp less than or equal to the given timestamp. A key packet
   * is a packet that doesn't require previous packets to be decoded. This method can be used to retrieve a track's
   * last key packet using `getKeyPacket(Infinity)`. The method returns null if the timestamp is before the first
   * key packet in the track.
   *
   * To ensure that the returned packet is guaranteed to be a real key frame, enable `options.verifyKeyPackets`.
   *
   * @param timestamp - The timestamp used for retrieval, in seconds.
   */
  async getKeyPacket(timestamp, options = {}) {
    validateTimestamp(timestamp);
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    if (!options.verifyKeyPackets) {
      return this._track._backing.getKeyPacket(timestamp, options);
    }
    const packet = await this._track._backing.getKeyPacket(timestamp, options);
    if (!packet) {
      return packet;
    }
    assert(packet.type === "key");
    const determinedType = await this._track.determinePacketType(packet);
    if (determinedType === "delta") {
      return this.getKeyPacket(packet.timestamp - 1 / await this._track.getTimeResolution(), options);
    }
    return packet;
  }
  /**
   * Retrieves the key packet following the given packet (in decode order), or null if the given packet is the last
   * key packet.
   *
   * To ensure that the returned packet is guaranteed to be a real key frame, enable `options.verifyKeyPackets`.
   */
  async getNextKeyPacket(packet, options = {}) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    if (!options.verifyKeyPackets) {
      return this._track._backing.getNextKeyPacket(packet, options);
    }
    const nextPacket = await this._track._backing.getNextKeyPacket(packet, options);
    if (!nextPacket) {
      return nextPacket;
    }
    assert(nextPacket.type === "key");
    const determinedType = await this._track.determinePacketType(nextPacket);
    if (determinedType === "delta") {
      return this.getNextKeyPacket(nextPacket, options);
    }
    return nextPacket;
  }
  /**
   * Creates an async iterator that yields the packets in this track in decode order. To enable fast iteration, this
   * method will intelligently preload packets based on the speed of the consumer.
   *
   * @param startPacket - (optional) The packet from which iteration should begin. This packet will also be yielded.
   * @param endPacket - (optional) The packet at which iteration should end. This packet will _not_ be yielded.
   */
  packets(startPacket, endPacket, options = {}) {
    if (startPacket !== void 0 && !(startPacket instanceof EncodedPacket)) {
      throw new TypeError("startPacket must be an EncodedPacket.");
    }
    if (startPacket !== void 0 && startPacket.isMetadataOnly && !options?.metadataOnly) {
      throw new TypeError("startPacket can only be metadata-only if options.metadataOnly is enabled.");
    }
    if (endPacket !== void 0 && !(endPacket instanceof EncodedPacket)) {
      throw new TypeError("endPacket must be an EncodedPacket.");
    }
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    const packetQueue = [];
    let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
    let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
    let ended = false;
    let terminated = false;
    let outOfBandError = null;
    const timestamps = [];
    const maxQueueSize = () => Math.max(2, timestamps.length);
    (async () => {
      let packet = startPacket ?? await this.getFirstPacket(options);
      while (packet && !terminated && !this._track.input._disposed) {
        if (endPacket && packet.sequenceNumber >= endPacket?.sequenceNumber) {
          break;
        }
        if (packetQueue.length > maxQueueSize()) {
          ({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
          await queueDequeue;
          continue;
        }
        packetQueue.push(packet);
        onQueueNotEmpty();
        ({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
        packet = await this.getNextPacket(packet, options);
      }
      ended = true;
      onQueueNotEmpty();
    })().catch((error) => {
      if (!outOfBandError) {
        outOfBandError = error;
        onQueueNotEmpty();
      }
    });
    const track = this._track;
    return {
      async next() {
        while (true) {
          if (track.input._disposed) {
            throw new InputDisposedError();
          } else if (terminated) {
            return { value: void 0, done: true };
          } else if (outOfBandError) {
            throw outOfBandError;
          } else if (packetQueue.length > 0) {
            const value = packetQueue.shift();
            const now = performance.now();
            timestamps.push(now);
            while (timestamps.length > 0 && now - timestamps[0] >= 1e3) {
              timestamps.shift();
            }
            onQueueDequeue();
            return { value, done: false };
          } else if (ended) {
            return { value: void 0, done: true };
          } else {
            await queueNotEmpty;
          }
        }
      },
      async return() {
        terminated = true;
        onQueueDequeue();
        onQueueNotEmpty();
        return { value: void 0, done: true };
      },
      async throw(error) {
        throw error;
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
};
var DecoderWrapper = class {
  constructor(onSample, onError) {
    this.onSample = onSample;
    this.onError = onError;
  }
};
var BaseMediaSampleSink = class {
  /** @internal */
  mediaSamplesInRange(startTimestamp = -Infinity, endTimestamp = Infinity, options) {
    validateTimestamp(startTimestamp);
    validateTimestamp(endTimestamp);
    const sampleQueue = [];
    let firstSampleQueued = false;
    let lastSample = null;
    let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
    let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
    let decoderIsFlushed = false;
    let ended = false;
    let terminated = false;
    let outOfBandError = null;
    const packetRetrievalOptions = {
      ...options,
      verifyKeyPackets: true,
      metadataOnly: false
    };
    (async () => {
      const decoder = await this._createDecoder((sample) => {
        onQueueDequeue();
        if (sample.timestamp >= endTimestamp) {
          ended = true;
        }
        if (ended) {
          sample.close();
          return;
        }
        if (lastSample) {
          if (sample.timestamp > startTimestamp) {
            sampleQueue.push(lastSample);
            firstSampleQueued = true;
          } else {
            lastSample.close();
          }
        }
        if (sample.timestamp >= startTimestamp) {
          sampleQueue.push(sample);
          firstSampleQueued = true;
        }
        lastSample = firstSampleQueued ? null : sample;
        if (sampleQueue.length > 0) {
          onQueueNotEmpty();
          ({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
        }
      }, (error) => {
        if (!outOfBandError) {
          outOfBandError = error;
          onQueueNotEmpty();
        }
      });
      const packetSink = this._createPacketSink();
      const keyPacket = await packetSink.getKeyPacket(startTimestamp, packetRetrievalOptions) ?? await packetSink.getFirstKeyPacket(packetRetrievalOptions);
      let currentPacket = keyPacket;
      const endPacket = void 0;
      const packets = packetSink.packets(keyPacket ?? void 0, endPacket, packetRetrievalOptions);
      await packets.next();
      while (currentPacket && !ended && !this._track.input._disposed) {
        const maxQueueSize = computeMaxQueueSize(sampleQueue.length);
        if (sampleQueue.length + decoder.getDecodeQueueSize() > maxQueueSize) {
          ({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
          await queueDequeue;
          continue;
        }
        decoder.decode(currentPacket);
        const packetResult = await packets.next();
        if (packetResult.done) {
          break;
        }
        currentPacket = packetResult.value;
      }
      await packets.return();
      if (!terminated && !this._track.input._disposed) {
        await decoder.flush();
      }
      decoder.close();
      if (!firstSampleQueued && lastSample) {
        sampleQueue.push(lastSample);
      }
      decoderIsFlushed = true;
      onQueueNotEmpty();
    })().catch((error) => {
      if (!outOfBandError) {
        outOfBandError = error;
        onQueueNotEmpty();
      }
    });
    const track = this._track;
    const closeSamples = () => {
      lastSample?.close();
      for (const sample of sampleQueue) {
        sample.close();
      }
    };
    return {
      async next() {
        while (true) {
          if (track.input._disposed) {
            closeSamples();
            throw new InputDisposedError();
          } else if (terminated) {
            return { value: void 0, done: true };
          } else if (outOfBandError) {
            closeSamples();
            throw outOfBandError;
          } else if (sampleQueue.length > 0) {
            const value = sampleQueue.shift();
            onQueueDequeue();
            return { value, done: false };
          } else if (!decoderIsFlushed) {
            await queueNotEmpty;
          } else {
            return { value: void 0, done: true };
          }
        }
      },
      async return() {
        terminated = true;
        ended = true;
        onQueueDequeue();
        onQueueNotEmpty();
        closeSamples();
        return { value: void 0, done: true };
      },
      async throw(error) {
        throw error;
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
  /** @internal */
  mediaSamplesAtTimestamps(timestamps, options) {
    validateAnyIterable(timestamps);
    const timestampIterator = toAsyncIterator(timestamps);
    const timestampsOfInterest = [];
    const sampleQueue = [];
    let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
    let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
    let decoderIsFlushed = false;
    let terminated = false;
    let outOfBandError = null;
    const pushToQueue = (sample) => {
      sampleQueue.push(sample);
      onQueueNotEmpty();
      ({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
    };
    const retrievalOptions = {
      ...options,
      verifyKeyPackets: true,
      metadataOnly: false
    };
    (async () => {
      const decoder = await this._createDecoder((sample) => {
        onQueueDequeue();
        if (terminated) {
          sample.close();
          return;
        }
        let sampleUses = 0;
        while (timestampsOfInterest.length > 0 && sample.timestamp - timestampsOfInterest[0] > -1e-10) {
          sampleUses++;
          timestampsOfInterest.shift();
        }
        if (sampleUses > 0) {
          for (let i = 0; i < sampleUses; i++) {
            pushToQueue(i < sampleUses - 1 ? sample.clone() : sample);
          }
        } else {
          sample.close();
        }
      }, (error) => {
        if (!outOfBandError) {
          outOfBandError = error;
          onQueueNotEmpty();
        }
      });
      const packetSink = this._createPacketSink();
      let lastPacket = null;
      let lastKeyPacket = null;
      let maxSequenceNumber = -1;
      const decodePackets = async () => {
        assert(lastKeyPacket);
        let currentPacket = lastKeyPacket;
        decoder.decode(currentPacket);
        while (currentPacket.sequenceNumber < maxSequenceNumber) {
          const maxQueueSize = computeMaxQueueSize(sampleQueue.length);
          while (sampleQueue.length + decoder.getDecodeQueueSize() > maxQueueSize && !terminated) {
            ({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
            await queueDequeue;
          }
          if (terminated) {
            break;
          }
          const nextPacket = await packetSink.getNextPacket(currentPacket, retrievalOptions);
          assert(nextPacket);
          decoder.decode(nextPacket);
          currentPacket = nextPacket;
        }
        maxSequenceNumber = -1;
      };
      const flushDecoder = async () => {
        await decoder.flush();
        for (let i = 0; i < timestampsOfInterest.length; i++) {
          pushToQueue(null);
        }
        timestampsOfInterest.length = 0;
      };
      for await (const timestamp of timestampIterator) {
        validateTimestamp(timestamp);
        if (terminated || this._track.input._disposed) {
          break;
        }
        const targetPacket = await packetSink.getPacket(timestamp, retrievalOptions);
        const keyPacket = targetPacket && await packetSink.getKeyPacket(timestamp, retrievalOptions);
        if (!keyPacket) {
          if (maxSequenceNumber !== -1) {
            await decodePackets();
            await flushDecoder();
          }
          pushToQueue(null);
          lastPacket = null;
          continue;
        }
        if (lastPacket && (keyPacket.sequenceNumber !== lastKeyPacket.sequenceNumber || targetPacket.timestamp < lastPacket.timestamp)) {
          await decodePackets();
          await flushDecoder();
        }
        timestampsOfInterest.push(targetPacket.timestamp);
        maxSequenceNumber = Math.max(targetPacket.sequenceNumber, maxSequenceNumber);
        lastPacket = targetPacket;
        lastKeyPacket = keyPacket;
      }
      if (!terminated && !this._track.input._disposed) {
        if (maxSequenceNumber !== -1) {
          await decodePackets();
        }
        await flushDecoder();
      }
      decoder.close();
      decoderIsFlushed = true;
      onQueueNotEmpty();
    })().catch((error) => {
      if (!outOfBandError) {
        outOfBandError = error;
        onQueueNotEmpty();
      }
    });
    const track = this._track;
    const closeSamples = () => {
      for (const sample of sampleQueue) {
        sample?.close();
      }
    };
    return {
      async next() {
        while (true) {
          if (track.input._disposed) {
            closeSamples();
            throw new InputDisposedError();
          } else if (terminated) {
            return { value: void 0, done: true };
          } else if (outOfBandError) {
            closeSamples();
            throw outOfBandError;
          } else if (sampleQueue.length > 0) {
            const value = sampleQueue.shift();
            assert(value !== void 0);
            onQueueDequeue();
            return { value, done: false };
          } else if (!decoderIsFlushed) {
            await queueNotEmpty;
          } else {
            return { value: void 0, done: true };
          }
        }
      },
      async return() {
        terminated = true;
        onQueueDequeue();
        onQueueNotEmpty();
        closeSamples();
        return { value: void 0, done: true };
      },
      async throw(error) {
        throw error;
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
};
var computeMaxQueueSize = (decodedSampleQueueSize) => {
  return decodedSampleQueueSize === 0 ? 40 : 8;
};
var VideoDecoderWrapper = class extends DecoderWrapper {
  constructor(onSample, onError, codec, decoderConfig, rotation, timeResolution) {
    super(onSample, onError);
    this.codec = codec;
    this.decoderConfig = decoderConfig;
    this.rotation = rotation;
    this.timeResolution = timeResolution;
    this.decoder = null;
    this.customDecoder = null;
    this.customDecoderCallSerializer = new CallSerializer();
    this.customDecoderQueueSize = 0;
    this.inputTimestamps = [];
    this.sampleQueue = [];
    this.currentPacketIndex = 0;
    this.raslSkipped = false;
    this.alphaDecoder = null;
    this.alphaHadKeyframe = false;
    this.colorQueue = [];
    this.alphaQueue = [];
    this.merger = null;
    this.decodedAlphaChunkCount = 0;
    this.alphaDecoderQueueSize = 0;
    this.nullAlphaFrameQueue = [];
    this.currentAlphaPacketIndex = 0;
    this.alphaRaslSkipped = false;
    this.frameHandlerSerializer = new CallSerializer();
    const MatchingCustomDecoder = customVideoDecoders.find((x) => x.supports(codec, decoderConfig));
    if (MatchingCustomDecoder) {
      this.customDecoder = new MatchingCustomDecoder();
      this.customDecoder.codec = codec;
      this.customDecoder.config = decoderConfig;
      this.customDecoder.onSample = (sample) => {
        if (!(sample instanceof VideoSample)) {
          throw new TypeError("The argument passed to onSample must be a VideoSample.");
        }
        this.finalizeAndEmitSample(sample);
      };
      void this.customDecoderCallSerializer.call(() => this.customDecoder.init());
    } else {
      const colorHandler = (frame) => {
        this.frameHandlerSerializer.call(async () => {
          if (this.alphaQueue.length > 0) {
            const alphaFrame = this.alphaQueue.shift();
            assert(alphaFrame !== void 0);
            await this.mergeAlpha(frame, alphaFrame);
          } else {
            this.colorQueue.push(frame);
          }
        }).catch((error) => this.onError(error));
      };
      if (codec === "avc" && this.decoderConfig.description && isChromium()) {
        const record = deserializeAvcDecoderConfigurationRecord(toUint8Array(this.decoderConfig.description));
        if (record && record.sequenceParameterSets.length > 0) {
          const sps = parseAvcSps(record.sequenceParameterSets[0]);
          if (sps && sps.frameMbsOnlyFlag === 0) {
            this.decoderConfig = {
              ...this.decoderConfig,
              hardwareAcceleration: "prefer-software"
            };
          }
        }
      }
      const stack = new Error("Decoding error").stack;
      this.decoder = new VideoDecoder({
        output: (frame) => {
          try {
            colorHandler(frame);
          } catch (error) {
            this.onError(error);
          }
        },
        error: (error) => {
          error.stack = stack;
          this.onError(error);
        }
      });
      this.decoder.configure(this.decoderConfig);
    }
  }
  getDecodeQueueSize() {
    if (this.customDecoder) {
      return this.customDecoderQueueSize;
    } else {
      assert(this.decoder);
      return Math.max(this.decoder.decodeQueueSize, this.alphaDecoder?.decodeQueueSize ?? 0);
    }
  }
  decode(packet) {
    if (this.codec === "hevc" && this.currentPacketIndex > 0 && !this.raslSkipped) {
      if (this.hasHevcRaslPicture(packet.data)) {
        return;
      }
      this.raslSkipped = true;
    }
    if (this.customDecoder) {
      this.customDecoderQueueSize++;
      void this.customDecoderCallSerializer.call(() => this.customDecoder.decode(packet)).then(() => this.customDecoderQueueSize--);
    } else {
      assert(this.decoder);
      if (!isWebKit()) {
        insertSorted(this.inputTimestamps, packet.timestamp, (x) => x);
      }
      if (isChromium() && this.currentPacketIndex === 0) {
        if (this.codec === "avc") {
          const filteredNalUnits = [];
          for (const loc of iterateAvcNalUnits(packet.data, this.decoderConfig)) {
            const type = extractNalUnitTypeForAvc(packet.data[loc.offset]);
            if (!(type >= 20 && type <= 31)) {
              filteredNalUnits.push(packet.data.subarray(loc.offset, loc.offset + loc.length));
            }
          }
          const newData = concatAvcNalUnits(filteredNalUnits, this.decoderConfig);
          packet = new EncodedPacket(newData, packet.type, packet.timestamp, packet.duration);
        } else if (this.codec === "hevc") {
          const sanitizedData = sanitizeHevcPacketForChromium(packet.data, this.decoderConfig);
          if (sanitizedData) {
            packet = new EncodedPacket(sanitizedData, packet.type, packet.timestamp, packet.duration);
          }
        }
      }
      this.decoder.decode(packet.toEncodedVideoChunk());
      this.decodeAlphaData(packet);
    }
    this.currentPacketIndex++;
  }
  decodeAlphaData(packet) {
    if (!packet.sideData.alpha) {
      this.pushNullAlphaFrame();
      return;
    }
    if (!this.merger) {
      this.merger = new ColorAlphaMerger();
    }
    if (!this.alphaDecoder) {
      const alphaHandler = (frame) => {
        this.frameHandlerSerializer.call(async () => {
          if (this.colorQueue.length > 0) {
            const colorFrame = this.colorQueue.shift();
            assert(colorFrame !== void 0);
            await this.mergeAlpha(colorFrame, frame);
          } else {
            this.alphaQueue.push(frame);
          }
          this.decodedAlphaChunkCount++;
          while (this.nullAlphaFrameQueue.length > 0 && this.nullAlphaFrameQueue[0] === this.decodedAlphaChunkCount) {
            this.nullAlphaFrameQueue.shift();
            if (this.colorQueue.length > 0) {
              const colorFrame = this.colorQueue.shift();
              assert(colorFrame !== void 0);
              await this.mergeAlpha(colorFrame, null);
            } else {
              this.alphaQueue.push(null);
            }
          }
          this.alphaDecoderQueueSize--;
        }).catch((error) => this.onError(error));
      };
      const stack = new Error("Decoding error").stack;
      this.alphaDecoder = new VideoDecoder({
        output: (frame) => {
          try {
            alphaHandler(frame);
          } catch (error) {
            this.onError(error);
          }
        },
        error: (error) => {
          error.stack = stack;
          this.onError(error);
        }
      });
      this.alphaDecoder.configure(this.decoderConfig);
    }
    const type = determineVideoPacketType(this.codec, this.decoderConfig, packet.sideData.alpha);
    if (!this.alphaHadKeyframe) {
      this.alphaHadKeyframe = type === "key";
    }
    if (this.alphaHadKeyframe) {
      if (this.codec === "hevc" && this.currentAlphaPacketIndex > 0 && !this.alphaRaslSkipped) {
        if (this.hasHevcRaslPicture(packet.sideData.alpha)) {
          this.pushNullAlphaFrame();
          return;
        }
        this.alphaRaslSkipped = true;
      }
      this.currentAlphaPacketIndex++;
      this.alphaDecoder.decode(packet.alphaToEncodedVideoChunk(type ?? packet.type));
      this.alphaDecoderQueueSize++;
    } else {
      this.pushNullAlphaFrame();
    }
  }
  pushNullAlphaFrame() {
    if (this.alphaDecoderQueueSize === 0) {
      this.alphaQueue.push(null);
    } else {
      this.nullAlphaFrameQueue.push(this.decodedAlphaChunkCount + this.alphaDecoderQueueSize);
    }
  }
  /**
   * If we're using HEVC, we need to make sure to skip any RASL slices that follow a non-IDR key frame such as
   * CRA_NUT. This is because RASL slices cannot be decoded without data before the CRA_NUT. Browsers behave
   * differently here: Chromium drops the packets, Safari throws a decoder error. Either way, it's not good
   * and causes bugs upstream. So, let's take the dropping into our own hands.
   */
  hasHevcRaslPicture(packetData) {
    for (const loc of iterateHevcNalUnits(packetData, this.decoderConfig)) {
      const type = extractNalUnitTypeForHevc(packetData[loc.offset]);
      if (type === HevcNalUnitType.RASL_N || type === HevcNalUnitType.RASL_R) {
        return true;
      }
    }
    return false;
  }
  /** Handler for the WebCodecs VideoDecoder for ironing out browser differences. */
  sampleHandler(sample) {
    if (isWebKit()) {
      if (this.sampleQueue.length > 0 && sample.timestamp >= last(this.sampleQueue).timestamp) {
        for (const sample2 of this.sampleQueue) {
          this.finalizeAndEmitSample(sample2);
        }
        this.sampleQueue.length = 0;
      }
      insertSorted(this.sampleQueue, sample, (x) => x.timestamp);
    } else {
      const timestamp = this.inputTimestamps.shift();
      assert(timestamp !== void 0);
      sample.setTimestamp(timestamp);
      this.finalizeAndEmitSample(sample);
    }
  }
  finalizeAndEmitSample(sample) {
    sample.setTimestamp(Math.round(sample.timestamp * this.timeResolution) / this.timeResolution);
    sample.setDuration(Math.round(sample.duration * this.timeResolution) / this.timeResolution);
    sample.setRotation(this.rotation);
    this.onSample(sample);
  }
  async mergeAlpha(color, alpha) {
    if (!alpha) {
      const finalSample2 = new VideoSample(color);
      this.sampleHandler(finalSample2);
      return;
    }
    assert(this.merger);
    const finalFrame = await this.merger.update(color, alpha);
    const finalSample = new VideoSample(finalFrame);
    this.sampleHandler(finalSample);
  }
  async flush() {
    if (this.customDecoder) {
      await this.customDecoderCallSerializer.call(() => this.customDecoder.flush());
    } else {
      assert(this.decoder);
      await Promise.all([
        this.decoder.flush(),
        this.alphaDecoder?.flush()
      ]);
      await this.frameHandlerSerializer.currentPromise;
      this.colorQueue.forEach((x) => x.close());
      this.colorQueue.length = 0;
      this.alphaQueue.forEach((x) => x?.close());
      this.alphaQueue.length = 0;
      this.alphaHadKeyframe = false;
      this.decodedAlphaChunkCount = 0;
      this.alphaDecoderQueueSize = 0;
      this.nullAlphaFrameQueue.length = 0;
      this.currentAlphaPacketIndex = 0;
      this.alphaRaslSkipped = false;
    }
    if (isWebKit()) {
      for (const sample of this.sampleQueue) {
        this.finalizeAndEmitSample(sample);
      }
      this.sampleQueue.length = 0;
    }
    this.currentPacketIndex = 0;
    this.raslSkipped = false;
  }
  close() {
    if (this.customDecoder) {
      void this.customDecoderCallSerializer.call(() => this.customDecoder.close());
    } else {
      assert(this.decoder);
      this.decoder.close();
      this.alphaDecoder?.close();
      this.colorQueue.forEach((x) => x.close());
      this.colorQueue.length = 0;
      this.alphaQueue.forEach((x) => x?.close());
      this.alphaQueue.length = 0;
      this.merger?.close();
    }
    for (const sample of this.sampleQueue) {
      sample.close();
    }
    this.sampleQueue.length = 0;
  }
};
var mergerGpuUnavailable = false;
var ColorAlphaMerger = class _ColorAlphaMerger {
  constructor() {
    this.canvas = null;
    this.gl = null;
    this.program = null;
    this.vao = null;
    this.colorTexture = null;
    this.alphaTexture = null;
    this.worker = null;
    this.pendingRequests = /* @__PURE__ */ new Map();
    this.nextRequestId = 0;
    const canMakeCanvas = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined" && typeof document.createElement === "function";
    if (!_ColorAlphaMerger.forceCpu && canMakeCanvas && !mergerGpuUnavailable) {
      try {
        if (typeof OffscreenCanvas !== "undefined") {
          this.canvas = new OffscreenCanvas(300, 150);
        } else {
          this.canvas = document.createElement("canvas");
        }
        const gl = this.canvas.getContext("webgl2", {
          premultipliedAlpha: false
        });
        if (!gl) {
          throw new Error("Couldn't acquire WebGL 2 context.");
        }
        this.gl = gl;
        this.program = this.createProgram();
        this.vao = this.createVAO();
        this.colorTexture = this.createTexture();
        this.alphaTexture = this.createTexture();
        this.gl.useProgram(this.program);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, "u_colorTexture"), 0);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, "u_alphaTexture"), 1);
      } catch (error) {
        this.gl = null;
        this.canvas = null;
        mergerGpuUnavailable = true;
        console.warn("Falling back to CPU for color/alpha merging.", error);
      }
    }
  }
  async update(color, alpha) {
    if (this.gl) {
      return this.updateGpu(color, alpha);
    } else {
      return this.updateCpu(color, alpha);
    }
  }
  createProgram() {
    assert(this.gl);
    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, `#version 300 es
			in vec2 a_position;
			in vec2 a_texCoord;
			out vec2 v_texCoord;
			
			void main() {
				gl_Position = vec4(a_position, 0.0, 1.0);
				v_texCoord = a_texCoord;
			}
		`);
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, `#version 300 es
			precision highp float;
			
			uniform sampler2D u_colorTexture;
			uniform sampler2D u_alphaTexture;
			in vec2 v_texCoord;
			out vec4 fragColor;
			
			void main() {
				vec3 color = texture(u_colorTexture, v_texCoord).rgb;
				float alpha = texture(u_alphaTexture, v_texCoord).r;
				fragColor = vec4(color, alpha);
			}
		`);
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    return program;
  }
  createShader(type, source) {
    assert(this.gl);
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    return shader;
  }
  createVAO() {
    assert(this.gl);
    assert(this.program);
    const vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(vao);
    const vertices = new Float32Array([
      -1,
      -1,
      0,
      1,
      1,
      -1,
      1,
      1,
      -1,
      1,
      0,
      0,
      1,
      1,
      1,
      0
    ]);
    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    const positionLocation = this.gl.getAttribLocation(this.program, "a_position");
    const texCoordLocation = this.gl.getAttribLocation(this.program, "a_texCoord");
    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(texCoordLocation);
    this.gl.vertexAttribPointer(texCoordLocation, 2, this.gl.FLOAT, false, 16, 8);
    return vao;
  }
  createTexture() {
    assert(this.gl);
    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    return texture;
  }
  updateGpu(color, alpha) {
    assert(this.gl);
    assert(this.canvas);
    if (color.displayWidth !== this.canvas.width || color.displayHeight !== this.canvas.height) {
      this.canvas.width = color.displayWidth;
      this.canvas.height = color.displayHeight;
    }
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.colorTexture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, color);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.alphaTexture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, alpha);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    const finalFrame = new VideoFrame(this.canvas, {
      timestamp: color.timestamp,
      duration: color.duration ?? void 0
    });
    color.close();
    alpha.close();
    return finalFrame;
  }
  updateCpu(color, alpha) {
    if (!this.worker) {
      const blob = new Blob([`(${colorAlphaMergerWorkerCode.toString()})()`], { type: "application/javascript" });
      const url2 = URL.createObjectURL(blob);
      this.worker = new Worker(url2);
      URL.revokeObjectURL(url2);
      this.worker.addEventListener("message", (event) => {
        const data = event.data;
        const pending2 = this.pendingRequests.get(data.id);
        if (!pending2) {
          return;
        }
        this.pendingRequests.delete(data.id);
        if ("error" in data) {
          pending2.reject(new Error(data.error));
        } else {
          pending2.resolve(data.frame);
        }
      });
      this.worker.addEventListener("error", (event) => {
        const error = new Error(event.message || "Color/alpha merge worker error.");
        for (const pending2 of this.pendingRequests.values()) {
          pending2.reject(error);
        }
        this.pendingRequests.clear();
      });
    }
    const id = this.nextRequestId++;
    const pending = promiseWithResolvers();
    this.pendingRequests.set(id, pending);
    this.worker.postMessage({ id, color, alpha }, { transfer: [color, alpha] });
    return pending.promise;
  }
  close() {
    this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
    this.canvas = null;
    this.worker?.terminate();
    this.worker = null;
    const error = new Error("Color/alpha merger closed.");
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
};
ColorAlphaMerger.forceCpu = true;
var colorAlphaMergerWorkerCode = () => {
  let cpuAlphaBuffer = null;
  let cpuColorBuffer = null;
  let chain = Promise.resolve();
  self.addEventListener("message", (event) => {
    const { id, color, alpha } = event.data;
    chain = chain.then(async () => {
      try {
        const frame = await merge(color, alpha);
        self.postMessage({ id, frame }, { transfer: [frame] });
      } catch (error) {
        self.postMessage({ id, error: error.message });
      } finally {
        color.close();
        alpha.close();
      }
    });
  });
  const merge = async (color, alpha) => {
    const format = color.format;
    const alphaFormat = alpha.format;
    if (!format || !alphaFormat) {
      throw new Error("CPU color/alpha merging requires a known VideoFrame format.");
    }
    const colorIs10 = format.includes("P10");
    const colorIs12 = format.includes("P12");
    const alphaIs10 = alphaFormat.includes("P10");
    const alphaIs12 = alphaFormat.includes("P12");
    if (alphaIs10 !== colorIs10 || alphaIs12 !== colorIs12) {
      throw new Error(`CPU color/alpha merging requires the alpha frame to have the same bit depth as the color frame (color: '${format}', alpha: '${alphaFormat}').`);
    }
    const width = color.codedWidth;
    const height = color.codedHeight;
    if (format === "RGBX" || format === "RGBA" || format === "BGRX" || format === "BGRA") {
      return await mergeInterleavedRgba(color, alpha, width, height, format);
    } else if (format === "I420" || format === "I420P10" || format === "I420P12" || format === "I422" || format === "I422P10" || format === "I422P12" || format === "I444" || format === "I444P10" || format === "I444P12") {
      return await mergePlanarYuv(color, alpha, width, height, format);
    } else if (format === "NV12") {
      return await mergeNv12(color, alpha, width, height);
    }
    throw new Error(`CPU color/alpha merging does not support format '${format}'.`);
  };
  const mergeInterleavedRgba = async (color, alpha, width, height, format) => {
    const pixelCount = width * height;
    const output = new Uint8Array(pixelCount * 4);
    await color.copyTo(output);
    const alphaY = await readAlpha(alpha, width, height, 1);
    for (let i = 0, j = 3; i < pixelCount; i++, j += 4) {
      output[j] = alphaY[i];
    }
    const outputFormat = format === "RGBX" || format === "RGBA" ? "RGBA" : "BGRA";
    const init = {
      format: outputFormat,
      codedWidth: width,
      codedHeight: height,
      timestamp: color.timestamp,
      duration: color.duration ?? void 0,
      transfer: [output.buffer]
    };
    return new VideoFrame(output, init);
  };
  const mergePlanarYuv = async (color, alpha, width, height, format) => {
    const is10 = format.includes("P10");
    const is12 = format.includes("P12");
    const bytesPerSample = is10 || is12 ? 2 : 1;
    let chromaW;
    let chromaH;
    if (format.startsWith("I420")) {
      chromaW = Math.ceil(width / 2);
      chromaH = Math.ceil(height / 2);
    } else if (format.startsWith("I422")) {
      chromaW = Math.ceil(width / 2);
      chromaH = height;
    } else {
      chromaW = width;
      chromaH = height;
    }
    const ySamples = width * height;
    const uvSamples = chromaW * chromaH;
    const yBytes = ySamples * bytesPerSample;
    const uvBytes = uvSamples * bytesPerSample;
    const aBytes = ySamples * bytesPerSample;
    const outputBytes = yBytes + 2 * uvBytes + aBytes;
    const output = new Uint8Array(outputBytes);
    await color.copyTo(output);
    const alphaY = await readAlpha(alpha, width, height, bytesPerSample);
    const aOffset = yBytes + 2 * uvBytes;
    output.set(alphaY, aOffset);
    const outputFormat = format.slice(0, 4) + "A" + format.slice(4);
    const init = {
      format: outputFormat,
      codedWidth: width,
      codedHeight: height,
      timestamp: color.timestamp,
      duration: color.duration ?? void 0,
      transfer: [output.buffer]
    };
    return new VideoFrame(output, init);
  };
  const mergeNv12 = async (color, alpha, width, height) => {
    const ySize = width * height;
    const chromaW = Math.ceil(width / 2);
    const chromaH = Math.ceil(height / 2);
    const uvSize = chromaW * chromaH;
    const sourceSize = color.allocationSize();
    if (!cpuColorBuffer || cpuColorBuffer.byteLength !== sourceSize) {
      cpuColorBuffer = new Uint8Array(sourceSize);
    }
    await color.copyTo(cpuColorBuffer);
    const output = new Uint8Array(ySize + 2 * uvSize + ySize);
    output.set(cpuColorBuffer.subarray(0, ySize), 0);
    const uOffset = ySize;
    const vOffset = ySize + uvSize;
    const uvStart = ySize;
    for (let i = 0; i < uvSize; i++) {
      output[uOffset + i] = cpuColorBuffer[uvStart + i * 2];
      output[vOffset + i] = cpuColorBuffer[uvStart + i * 2 + 1];
    }
    const alphaY = await readAlpha(alpha, width, height, 1);
    output.set(alphaY, ySize + 2 * uvSize);
    const init = {
      format: "I420A",
      codedWidth: width,
      codedHeight: height,
      timestamp: color.timestamp,
      duration: color.duration ?? void 0,
      transfer: [output.buffer]
    };
    return new VideoFrame(output, init);
  };
  const readAlpha = async (alpha, width, height, bytesPerSample) => {
    const size = alpha.allocationSize();
    if (!cpuAlphaBuffer || cpuAlphaBuffer.byteLength !== size) {
      cpuAlphaBuffer = new Uint8Array(size);
    }
    await alpha.copyTo(cpuAlphaBuffer);
    const format = alpha.format;
    if (format === "RGBA" || format === "BGRA" || format === "RGBX" || format === "BGRX") {
      const rOffset = format === "RGBA" || format === "RGBX" ? 0 : 2;
      const pixelCount = width * height;
      for (let i = 0; i < pixelCount; i++) {
        cpuAlphaBuffer[i] = cpuAlphaBuffer[i * 4 + rOffset];
      }
      return cpuAlphaBuffer.subarray(0, pixelCount);
    } else {
      return cpuAlphaBuffer.subarray(0, width * height * bytesPerSample);
    }
  };
};
var VideoSampleSink = class extends BaseMediaSampleSink {
  /** Creates a new {@link VideoSampleSink} for the given {@link InputVideoTrack}. */
  constructor(videoTrack) {
    if (!(videoTrack instanceof InputVideoTrack)) {
      throw new TypeError("videoTrack must be an InputVideoTrack.");
    }
    super();
    this._track = videoTrack;
  }
  /** @internal */
  async _createDecoder(onSample, onError) {
    if (!await this._track.canDecode()) {
      throw new Error("This video track cannot be decoded by this browser. Make sure to check decodability before using a track.");
    }
    const codec = await this._track.getCodec();
    const rotation = await this._track.getRotation();
    const decoderConfig = await this._track.getDecoderConfig();
    const timeResolution = await this._track.getTimeResolution();
    assert(codec && decoderConfig);
    return new VideoDecoderWrapper(onSample, onError, codec, decoderConfig, rotation, timeResolution);
  }
  /** @internal */
  _createPacketSink() {
    return new EncodedPacketSink(this._track);
  }
  /**
   * Retrieves the video sample (frame) corresponding to the given timestamp, in seconds. More specifically, returns
   * the last video sample (in presentation order) with a start timestamp less than or equal to the given timestamp.
   * Returns null if the timestamp is before the track's first timestamp.
   *
   * @param timestamp - The timestamp used for retrieval, in seconds.
   * @param options - Options used for the underlying packet retrieval.
   */
  async getSample(timestamp, options = {}) {
    validateTimestamp(timestamp);
    for await (const sample of this.mediaSamplesAtTimestamps([timestamp], options)) {
      return sample;
    }
    throw new Error("Internal error: Iterator returned nothing.");
  }
  /**
   * Creates an async iterator that yields the video samples (frames) of this track in presentation order. This method
   * will intelligently pre-decode a few frames ahead to enable fast iteration.
   *
   * @param startTimestamp - The timestamp in seconds at which to start yielding samples (inclusive).
   * @param endTimestamp - The timestamp in seconds at which to stop yielding samples (exclusive).
   * @param options - Options used for the underlying packet retrieval.
   */
  samples(startTimestamp, endTimestamp, options = {}) {
    return this.mediaSamplesInRange(startTimestamp, endTimestamp, options);
  }
  /**
   * Creates an async iterator that yields a video sample (frame) for each timestamp in the argument. This method
   * uses an optimized decoding pipeline if these timestamps are monotonically sorted, decoding each packet at most
   * once, and is therefore more efficient than manually getting the sample for every timestamp. The iterator may
   * yield null if no frame is available for a given timestamp.
   *
   * This method is good for sparse access of media data. If you want primarily sequential media access, prefer
   * {@link VideoSampleSink.samples} instead.
   *
   * @param timestamps - An iterable or async iterable of timestamps in seconds.
   * @param options - Options used for the underlying packet retrieval.
   */
  samplesAtTimestamps(timestamps, options = {}) {
    return this.mediaSamplesAtTimestamps(timestamps, options);
  }
};
var AudioDecoderWrapper = class extends DecoderWrapper {
  constructor(onSample, onError, codec, decoderConfig) {
    super(onSample, onError);
    this.decoder = null;
    this.customDecoder = null;
    this.customDecoderCallSerializer = new CallSerializer();
    this.customDecoderQueueSize = 0;
    this.currentTimestamp = null;
    this.expectedFirstTimestamp = null;
    this.timestampOffset = 0;
    const sampleHandler = (sample) => {
      let sampleTimestamp = sample.timestamp;
      if (this.expectedFirstTimestamp && this.currentTimestamp === null) {
        this.timestampOffset = this.expectedFirstTimestamp - sampleTimestamp;
        ;
      }
      sampleTimestamp += this.timestampOffset;
      if (this.currentTimestamp === null || Math.abs(sampleTimestamp - this.currentTimestamp) >= sample.duration) {
        this.currentTimestamp = sampleTimestamp;
      }
      const preciseTimestamp = this.currentTimestamp;
      this.currentTimestamp += sample.duration;
      if (sample.numberOfFrames === 0) {
        sample.close();
        return;
      }
      const sampleRate = decoderConfig.sampleRate;
      sample.setTimestamp(Math.round(preciseTimestamp * sampleRate) / sampleRate);
      onSample(sample);
    };
    const MatchingCustomDecoder = customAudioDecoders.find((x) => x.supports(codec, decoderConfig));
    if (MatchingCustomDecoder) {
      this.customDecoder = new MatchingCustomDecoder();
      this.customDecoder.codec = codec;
      this.customDecoder.config = decoderConfig;
      this.customDecoder.onSample = (sample) => {
        if (!(sample instanceof AudioSample)) {
          throw new TypeError("The argument passed to onSample must be an AudioSample.");
        }
        sampleHandler(sample);
      };
      void this.customDecoderCallSerializer.call(() => this.customDecoder.init());
    } else {
      const stack = new Error("Decoding error").stack;
      this.decoder = new AudioDecoder({
        output: (data) => {
          try {
            sampleHandler(new AudioSample(data));
          } catch (error) {
            this.onError(error);
          }
        },
        error: (error) => {
          error.stack = stack;
          this.onError(error);
        }
      });
      this.decoder.configure(decoderConfig);
    }
  }
  getDecodeQueueSize() {
    if (this.customDecoder) {
      return this.customDecoderQueueSize;
    } else {
      assert(this.decoder);
      return this.decoder.decodeQueueSize;
    }
  }
  decode(packet) {
    if (this.customDecoder) {
      this.customDecoderQueueSize++;
      void this.customDecoderCallSerializer.call(() => this.customDecoder.decode(packet)).then(() => this.customDecoderQueueSize--);
    } else {
      assert(this.decoder);
      this.expectedFirstTimestamp ??= packet.timestamp;
      this.decoder.decode(packet.toEncodedAudioChunk());
    }
  }
  async flush() {
    if (this.customDecoder) {
      await this.customDecoderCallSerializer.call(() => this.customDecoder.flush());
    } else {
      assert(this.decoder);
      await this.decoder.flush();
    }
    this.currentTimestamp = null;
    this.expectedFirstTimestamp = null;
    this.timestampOffset = 0;
  }
  close() {
    if (this.customDecoder) {
      void this.customDecoderCallSerializer.call(() => this.customDecoder.close());
    } else {
      assert(this.decoder);
      this.decoder.close();
    }
  }
};
var PcmAudioDecoderWrapper = class extends DecoderWrapper {
  constructor(onSample, onError, decoderConfig) {
    super(onSample, onError);
    this.decoderConfig = decoderConfig;
    this.currentTimestamp = null;
    assert(PCM_AUDIO_CODECS.includes(decoderConfig.codec));
    this.codec = decoderConfig.codec;
    const { dataType, sampleSize, littleEndian } = parsePcmCodec(this.codec);
    this.inputSampleSize = sampleSize;
    switch (sampleSize) {
      case 1:
        {
          if (dataType === "unsigned") {
            this.readInputValue = (view2, byteOffset) => view2.getUint8(byteOffset) - 2 ** 7;
          } else if (dataType === "signed") {
            this.readInputValue = (view2, byteOffset) => view2.getInt8(byteOffset);
          } else if (dataType === "ulaw") {
            this.readInputValue = (view2, byteOffset) => fromUlaw(view2.getUint8(byteOffset));
          } else if (dataType === "alaw") {
            this.readInputValue = (view2, byteOffset) => fromAlaw(view2.getUint8(byteOffset));
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 2:
        {
          if (dataType === "unsigned") {
            this.readInputValue = (view2, byteOffset) => view2.getUint16(byteOffset, littleEndian) - 2 ** 15;
          } else if (dataType === "signed") {
            this.readInputValue = (view2, byteOffset) => view2.getInt16(byteOffset, littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 3:
        {
          if (dataType === "unsigned") {
            this.readInputValue = (view2, byteOffset) => getUint24(view2, byteOffset, littleEndian) - 2 ** 23;
          } else if (dataType === "signed") {
            this.readInputValue = (view2, byteOffset) => getInt24(view2, byteOffset, littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 4:
        {
          if (dataType === "unsigned") {
            this.readInputValue = (view2, byteOffset) => view2.getUint32(byteOffset, littleEndian) - 2 ** 31;
          } else if (dataType === "signed") {
            this.readInputValue = (view2, byteOffset) => view2.getInt32(byteOffset, littleEndian);
          } else if (dataType === "float") {
            this.readInputValue = (view2, byteOffset) => view2.getFloat32(byteOffset, littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 8:
        {
          if (dataType === "float") {
            this.readInputValue = (view2, byteOffset) => view2.getFloat64(byteOffset, littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      default:
        {
          assertNever(sampleSize);
          assert(false);
        }
        ;
    }
    switch (sampleSize) {
      case 1:
        {
          if (dataType === "ulaw" || dataType === "alaw") {
            this.outputSampleSize = 2;
            this.outputFormat = "s16";
            this.writeOutputValue = (view2, byteOffset, value) => view2.setInt16(byteOffset, value, true);
          } else {
            this.outputSampleSize = 1;
            this.outputFormat = "u8";
            this.writeOutputValue = (view2, byteOffset, value) => view2.setUint8(byteOffset, value + 2 ** 7);
          }
        }
        ;
        break;
      case 2:
        {
          this.outputSampleSize = 2;
          this.outputFormat = "s16";
          this.writeOutputValue = (view2, byteOffset, value) => view2.setInt16(byteOffset, value, true);
        }
        ;
        break;
      case 3:
        {
          this.outputSampleSize = 4;
          this.outputFormat = "s32";
          this.writeOutputValue = (view2, byteOffset, value) => view2.setInt32(byteOffset, value << 8, true);
        }
        ;
        break;
      case 4:
        {
          this.outputSampleSize = 4;
          if (dataType === "float") {
            this.outputFormat = "f32";
            this.writeOutputValue = (view2, byteOffset, value) => view2.setFloat32(byteOffset, value, true);
          } else {
            this.outputFormat = "s32";
            this.writeOutputValue = (view2, byteOffset, value) => view2.setInt32(byteOffset, value, true);
          }
        }
        ;
        break;
      case 8:
        {
          this.outputSampleSize = 4;
          this.outputFormat = "f32";
          this.writeOutputValue = (view2, byteOffset, value) => view2.setFloat32(byteOffset, value, true);
        }
        ;
        break;
      default:
        {
          assertNever(sampleSize);
          assert(false);
        }
        ;
    }
    ;
  }
  getDecodeQueueSize() {
    return 0;
  }
  decode(packet) {
    const inputView = toDataView(packet.data);
    const numberOfFrames = packet.byteLength / this.decoderConfig.numberOfChannels / this.inputSampleSize;
    const outputBufferSize = numberOfFrames * this.decoderConfig.numberOfChannels * this.outputSampleSize;
    const outputBuffer = new ArrayBuffer(outputBufferSize);
    const outputView = new DataView(outputBuffer);
    for (let i = 0; i < numberOfFrames * this.decoderConfig.numberOfChannels; i++) {
      const inputIndex = i * this.inputSampleSize;
      const outputIndex = i * this.outputSampleSize;
      const value = this.readInputValue(inputView, inputIndex);
      this.writeOutputValue(outputView, outputIndex, value);
    }
    const preciseDuration = numberOfFrames / this.decoderConfig.sampleRate;
    if (this.currentTimestamp === null || Math.abs(packet.timestamp - this.currentTimestamp) >= preciseDuration) {
      this.currentTimestamp = packet.timestamp;
    }
    const preciseTimestamp = this.currentTimestamp;
    this.currentTimestamp += preciseDuration;
    const audioSample = new AudioSample({
      format: this.outputFormat,
      data: outputBuffer,
      numberOfChannels: this.decoderConfig.numberOfChannels,
      sampleRate: this.decoderConfig.sampleRate,
      numberOfFrames,
      timestamp: preciseTimestamp
    });
    this.onSample(audioSample);
  }
  async flush() {
  }
  close() {
  }
};
var AudioSampleSink = class extends BaseMediaSampleSink {
  /** Creates a new {@link AudioSampleSink} for the given {@link InputAudioTrack}. */
  constructor(audioTrack) {
    if (!(audioTrack instanceof InputAudioTrack)) {
      throw new TypeError("audioTrack must be an InputAudioTrack.");
    }
    super();
    this._track = audioTrack;
  }
  /** @internal */
  async _createDecoder(onSample, onError) {
    if (!await this._track.canDecode()) {
      throw new Error("This audio track cannot be decoded by this browser. Make sure to check decodability before using a track.");
    }
    const codec = await this._track.getCodec();
    const decoderConfig = await this._track.getDecoderConfig();
    assert(codec && decoderConfig);
    if (PCM_AUDIO_CODECS.includes(decoderConfig.codec)) {
      return new PcmAudioDecoderWrapper(onSample, onError, decoderConfig);
    } else {
      return new AudioDecoderWrapper(onSample, onError, codec, decoderConfig);
    }
  }
  /** @internal */
  _createPacketSink() {
    return new EncodedPacketSink(this._track);
  }
  /**
   * Retrieves the audio sample corresponding to the given timestamp, in seconds. More specifically, returns
   * the last audio sample (in presentation order) with a start timestamp less than or equal to the given timestamp.
   * Returns null if the timestamp is before the track's first timestamp.
   *
   * @param timestamp - The timestamp used for retrieval, in seconds.
   * @param options - Options used for the underlying packet retrieval.
   */
  async getSample(timestamp, options = {}) {
    validateTimestamp(timestamp);
    for await (const sample of this.mediaSamplesAtTimestamps([timestamp], options)) {
      return sample;
    }
    throw new Error("Internal error: Iterator returned nothing.");
  }
  /**
   * Creates an async iterator that yields the audio samples of this track in presentation order. This method
   * will intelligently pre-decode a few samples ahead to enable fast iteration.
   *
   * @param startTimestamp - The timestamp in seconds at which to start yielding samples (inclusive).
   * @param endTimestamp - The timestamp in seconds at which to stop yielding samples (exclusive).
   * @param options - Options used for the underlying packet retrieval.
   */
  samples(startTimestamp, endTimestamp, options = {}) {
    return this.mediaSamplesInRange(startTimestamp, endTimestamp, options);
  }
  /**
   * Creates an async iterator that yields an audio sample for each timestamp in the argument. This method
   * uses an optimized decoding pipeline if these timestamps are monotonically sorted, decoding each packet at most
   * once, and is therefore more efficient than manually getting the sample for every timestamp. The iterator may
   * yield null if no sample is available for a given timestamp.
   *
   * This method is good for sparse access of media data. If you want primarily sequential media access, prefer
   * {@link AudioSampleSink.samples} instead.
   *
   * @param timestamps - An iterable or async iterable of timestamps in seconds.
   * @param options - Options used for the underlying packet retrieval.
   */
  samplesAtTimestamps(timestamps, options = {}) {
    return this.mediaSamplesAtTimestamps(timestamps, options);
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/input-track.js
var InputTrack = class _InputTrack {
  /** @internal */
  constructor(input, backing) {
    this.input = input;
    this._backing = backing;
  }
  /** Returns true if and only if this track is a video track. */
  isVideoTrack() {
    return this instanceof InputVideoTrack;
  }
  /** Returns true if and only if this track is an audio track. */
  isAudioTrack() {
    return this instanceof InputAudioTrack;
  }
  /** The unique ID of this track in the input file. */
  get id() {
    return this._backing.getId();
  }
  /**
   * The 1-based index of this track among all tracks of the same type in the input file. For example, the first
   * video track has number 1, the second video track has number 2, and so on. The index refers to the order in
   * which the tracks are returned by {@link Input.getTracks}.
   */
  get number() {
    return this._backing.getNumber();
  }
  /**
   * Returns the identifier of the codec used internally by the container. It is not homogenized by Mediabunny
   * and depends entirely on the container format.
   *
   * This method can be used to determine the codec of a track in case Mediabunny doesn't know that codec.
   *
   * - For ISOBMFF files, this resolves to the name of the Sample Description Box (e.g. `'avc1'`).
   * - For Matroska files, this resolves to the value of the `CodecID` element.
   * - For WAVE files, this resolves to the value of the format tag in the `'fmt '` chunk.
   * - For ADTS files, this resolves to the `MPEG-4 Audio Object Type`.
   * - For MPEG-TS files, this resolves to the `streamType` value from the Program Map Table.
   * - In all other cases, this resolves to `null`.
   */
  async getInternalCodecId() {
    return this._backing.getInternalCodecId();
  }
  /**
   * See {@link InputTrack.getInternalCodecId}.
   * @deprecated Use {@link InputTrack.getInternalCodecId} instead.
   */
  get internalCodecId() {
    return requireSync(this._backing.getInternalCodecId(), "internalCodecId", "getInternalCodecId");
  }
  /**
   * Returns the ISO 639-2/T language code for this track. If the language is unknown, this resolves to `'und'`
   * (undetermined).
   */
  async getLanguageCode() {
    return this._backing.getLanguageCode();
  }
  /**
   * The ISO 639-2/T language code for this track. If the language is unknown, this field is `'und'` (undetermined).
   * @deprecated Use {@link InputTrack.getLanguageCode} instead.
   */
  get languageCode() {
    return requireSync(this._backing.getLanguageCode(), "languageCode", "getLanguageCode");
  }
  /** Returns the user-defined name for this track. */
  async getName() {
    return this._backing.getName();
  }
  /**
   * A user-defined name for this track.
   * @deprecated Use {@link InputTrack.getName} instead.
   */
  get name() {
    return requireSync(this._backing.getName(), "name", "getName");
  }
  /**
   * Returns a positive number x such that all timestamps and durations of all packets of this track are
   * integer multiples of 1/x.
   */
  async getTimeResolution() {
    return this._backing.getTimeResolution();
  }
  /**
   * A positive number x such that all timestamps and durations of all packets of this track are
   * integer multiples of 1/x.
   * @deprecated Use {@link InputTrack.getTimeResolution} instead.
   */
  get timeResolution() {
    return requireSync(this._backing.getTimeResolution(), "timeResolution", "getTimeResolution");
  }
  /**
   * Returns whether the timestamps of this track are relative to the Unix epoch (January 1, 1970 00:00:00 UTC).
   * When `true`, each timestamp maps to a definitive point in time.
   */
  async isRelativeToUnixEpoch() {
    return this._backing.isRelativeToUnixEpoch();
  }
  /** Returns the track's disposition, i.e. information about its intended usage. */
  async getDisposition() {
    return this._backing.getDisposition();
  }
  /**
   * The track's disposition, i.e. information about its intended usage.
   * @deprecated Use {@link InputTrack.getDisposition} instead.
   */
  get disposition() {
    return requireSync(this._backing.getDisposition(), "disposition", "getDisposition");
  }
  /**
   * Returns the peak bitrate of the track in bits per second, as specified in the track's metadata. This might not
   * match the actual media data's bitrate.
   */
  async getBitrate() {
    return this._backing.getBitrate();
  }
  /**
   * Returns the average bitrate of the track in bits per second, as specified in the track's metadata. This might
   * not match the actual media data's bitrate.
   */
  async getAverageBitrate() {
    return this._backing.getAverageBitrate();
  }
  /**
   * Returns the start timestamp of the first packet of this track, in seconds. While often near zero, this value
   * may be positive or even negative. A negative starting timestamp means the track's timing has been offset. Samples
   * with a negative timestamp should not be presented.
   */
  async getFirstTimestamp() {
    const firstPacket = await this._backing.getFirstPacket({ metadataOnly: true });
    return firstPacket?.timestamp ?? 0;
  }
  /**
   * Returns the end timestamp of the last packet of this track, in seconds.
   *
   * By default, when the underlying media is live, this method will only resolve once the live stream ends. If you
   * want to query the current end timestamp of the stream, set {@link PacketRetrievalOptions.skipLiveWait} to `true`
   * in the options.
   */
  async computeDuration(options) {
    const lastPacket = await this._backing.getPacket(Infinity, { metadataOnly: true, ...options });
    const result = (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
    return roundToDivisor(result, await this.getTimeResolution());
  }
  /**
   * Gets the duration (end timestamp) in seconds of this track from metadata stored in the file. This value may be
   * approximate or diverge from the actual, precise duration returned by `.computeDuration()`, but compared to that
   * method, this method is cheaper. When the duration cannot be determined from the file metadata, `null`
   * is returned.
   *
   * By default, when the underlying media is live, this method will only resolve once the live stream
   * ends. If you want to query the current duration of the media, set
   * {@link DurationMetadataRequestOptions.skipLiveWait} to `true` in the options.
   */
  async getDurationFromMetadata(options = {}) {
    return this._backing.getDurationFromMetadata(options);
  }
  /**
   * Computes aggregate packet statistics for this track, such as average packet rate or bitrate.
   *
   * @param targetPacketCount - This optional parameter sets a target for how many packets this method must have
   * looked at before it can return early; this means, you can use it to aggregate only a subset (prefix) of all
   * packets. This is very useful for getting a great estimate of video frame rate without having to scan through the
   * entire file.
   *
   * By default, when the underlying media is live and `targetPacketCount` is not set, this method will only resolve
   * once the live stream ends. If you want to query the current packet statistics of the stream, set
   * {@link PacketRetrievalOptions.skipLiveWait} to `true` in the options.
   */
  async computePacketStats(targetPacketCount = Infinity, options) {
    const sink = new EncodedPacketSink(this);
    let startTimestamp = Infinity;
    let endTimestamp = -Infinity;
    let packetCount = 0;
    let totalPacketBytes = 0;
    for await (const packet of sink.packets(void 0, void 0, { metadataOnly: true, ...options })) {
      if (packetCount >= targetPacketCount && packet.timestamp >= endTimestamp) {
        break;
      }
      startTimestamp = Math.min(startTimestamp, packet.timestamp);
      endTimestamp = Math.max(endTimestamp, packet.timestamp + packet.duration);
      packetCount++;
      totalPacketBytes += packet.byteLength;
    }
    return {
      packetCount,
      averagePacketRate: packetCount ? Number((packetCount / (endTimestamp - startTimestamp)).toPrecision(16)) : 0,
      averageBitrate: packetCount ? Number((8 * totalPacketBytes / (endTimestamp - startTimestamp)).toPrecision(16)) : 0
    };
  }
  /**
   * Whether or not this track is currently live, meaning the media's end is still unknown.
   *
   * The value returned by this method may change over time as the track stops being live. To keep track of the
   * track's live status, poll this method at the track's refresh interval
   * via {@link InputTrack.getLiveRefreshInterval}.
   */
  async isLive() {
    return await this._backing.getLiveRefreshInterval() !== null;
  }
  /**
   * Returns the track's live refresh interval in seconds, or `null` if the track is not live. This interval describes
   * the time it takes, on average, for new live media data to become available.
   */
  async getLiveRefreshInterval() {
    return this._backing.getLiveRefreshInterval();
  }
  /**
   * Returns `true` if this track can be paired with the given track. Two tracks being pairable means they can be
   * presented (displayed) together.
   *
   * Returns `false` if `other` equals `this`.
   */
  canBePairedWith(other) {
    if (!(other instanceof _InputTrack)) {
      throw new TypeError("other must be an InputTrack.");
    }
    if (this.input !== other.input || this === other) {
      return false;
    }
    return (this._backing.getPairingMask() & other._backing.getPairingMask()) !== 0n;
  }
  /**
   * Gets the list of other tracks that can be paired with this track. An optional query can be provided to narrow
   * down the results.
   */
  async getPairableTracks(query) {
    return this.input.getTracks(mergeInputTrackQueries({
      filter: (t) => t.canBePairedWith(this)
    }, query));
  }
  /**
   * Gets the list of other video tracks that can be paired with this track. An optional query can be provided to
   * narrow down the results.
   */
  async getPairableVideoTracks(query) {
    return this.input.getVideoTracks(mergeInputTrackQueries({
      filter: (t) => t.canBePairedWith(this)
    }, query));
  }
  /**
   * Gets the list of other audio tracks that can be paired with this track. An optional query can be provided to
   * narrow down the results.
   */
  async getPairableAudioTracks(query) {
    return this.input.getAudioTracks(mergeInputTrackQueries({
      filter: (t) => t.canBePairedWith(this)
    }, query));
  }
  /** Returns the primary track that can be paired with this track, optionally steered by the provided query. */
  async getPrimaryPairableVideoTrack(query) {
    return this.input.getPrimaryVideoTrack(mergeInputTrackQueries({
      filter: (t) => t.canBePairedWith(this)
    }, query));
  }
  /** Returns the primary track that can be paired with this track, optionally steered by the provided query. */
  async getPrimaryPairableAudioTrack(query) {
    return this.input.getPrimaryAudioTrack(mergeInputTrackQueries({
      filter: (t) => t.canBePairedWith(this)
    }, query));
  }
  /** Returns `true` if there is another track that can be paired with this track. */
  async hasPairableTrack(predicate) {
    predicate &&= toValidatedPredicate(predicate);
    const tracks = await this.input.getTracks();
    for (const track of tracks) {
      if (!this.canBePairedWith(track)) {
        continue;
      }
      if (!predicate || await predicate(track)) {
        return true;
      }
    }
    return false;
  }
  /** Returns `true` if there is a video track that can be paired with this track. */
  hasPairableVideoTrack(predicate) {
    predicate &&= toValidatedPredicate(predicate);
    return this.hasPairableTrack(async (x) => x.isVideoTrack() && (!predicate || await predicate(x)));
  }
  /** Returns `true` if there is an audio track that can be paired with this track. */
  hasPairableAudioTrack(predicate) {
    predicate &&= toValidatedPredicate(predicate);
    return this.hasPairableTrack(async (x) => x.isAudioTrack() && (!predicate || await predicate(x)));
  }
};
var requireSync = (value, getterName, asyncName) => {
  if (value instanceof Promise) {
    throw new Error(`'${getterName}' is deprecated and not available synchronously for this track. Use the preferred '${asyncName}()' instead.`);
  }
  return value;
};
var toValidatedPredicate = (predicate) => {
  if (predicate !== void 0 && typeof predicate !== "function") {
    throw new TypeError("predicate, when provided, must be a function.");
  }
  return predicate ? (track) => {
    const handle = (result2) => {
      if (typeof result2 !== "boolean") {
        throw new TypeError("predicate must return or resolve to a boolean value.");
      }
      return result2;
    };
    const result = predicate(track);
    if (result instanceof Promise) {
      return result.then(handle);
    }
    return handle(result);
  } : void 0;
};
var InputVideoTrack = class extends InputTrack {
  /** @internal */
  constructor(input, backing) {
    super(input, backing);
    this._pixelAspectRatioCache = null;
    this._backing = backing;
  }
  get type() {
    return "video";
  }
  /** The codec of the track's packets. */
  async getCodec() {
    return this._backing.getCodec();
  }
  /**
   * The codec of the track's packets.
   * @deprecated Use {@link InputVideoTrack.getCodec} instead.
   */
  get codec() {
    return requireSync(this._backing.getCodec(), "codec", "getCodec");
  }
  async hasOnlyKeyPackets() {
    return await this._backing.getHasOnlyKeyPackets?.() ?? false;
  }
  /** Returns the width in pixels of the track's coded samples, before any transformations or rotations. */
  async getCodedWidth() {
    return this._backing.getCodedWidth();
  }
  /**
   * The width in pixels of the track's coded samples, before any transformations or rotations.
   * @deprecated Use {@link InputVideoTrack.getCodedWidth} instead.
   */
  get codedWidth() {
    return requireSync(this._backing.getCodedWidth(), "codedWidth", "getCodedWidth");
  }
  /** Returns the height in pixels of the track's coded samples, before any transformations or rotations. */
  async getCodedHeight() {
    return this._backing.getCodedHeight();
  }
  /**
   * The height in pixels of the track's coded samples, before any transformations or rotations.
   * @deprecated Use {@link InputVideoTrack.getCodedHeight} instead.
   */
  get codedHeight() {
    return requireSync(this._backing.getCodedHeight(), "codedHeight", "getCodedHeight");
  }
  /** Returns the angle in degrees by which the track's frames should be rotated (clockwise). */
  async getRotation() {
    return this._backing.getRotation();
  }
  /**
   * The angle in degrees by which the track's frames should be rotated (clockwise).
   * @deprecated Use {@link InputVideoTrack.getRotation} instead.
   */
  get rotation() {
    return requireSync(this._backing.getRotation(), "rotation", "getRotation");
  }
  /**
   * Returns the width of the track's frames in square pixels, adjusted for pixel aspect ratio but before rotation.
   */
  async getSquarePixelWidth() {
    return this._backing.getSquarePixelWidth();
  }
  /**
   * The width of the track's frames in square pixels, adjusted for pixel aspect ratio but before rotation.
   * @deprecated Use {@link InputVideoTrack.getSquarePixelWidth} instead.
   */
  get squarePixelWidth() {
    return requireSync(this._backing.getSquarePixelWidth(), "squarePixelWidth", "getSquarePixelWidth");
  }
  /**
   * Returns the height of the track's frames in square pixels, adjusted for pixel aspect ratio but before rotation.
   */
  async getSquarePixelHeight() {
    return this._backing.getSquarePixelHeight();
  }
  /**
   * The height of the track's frames in square pixels, adjusted for pixel aspect ratio but before rotation.
   * @deprecated Use {@link InputVideoTrack.getSquarePixelHeight} instead.
   */
  get squarePixelHeight() {
    return requireSync(this._backing.getSquarePixelHeight(), "squarePixelHeight", "getSquarePixelHeight");
  }
  /**
   * Returns the pixel aspect ratio of the track's frames as a rational number in its reduced form. Most videos use
   * square pixels (1:1).
   */
  async getPixelAspectRatio() {
    return this._pixelAspectRatioCache ??= simplifyRational({
      num: await this.getSquarePixelWidth() * await this.getCodedHeight(),
      den: await this.getSquarePixelHeight() * await this.getCodedWidth()
    });
  }
  /**
   * The pixel aspect ratio of the track's frames, as a rational number in its reduced form. Most videos use
   * square pixels (1:1).
   * @deprecated Use {@link InputVideoTrack.getPixelAspectRatio} instead.
   */
  get pixelAspectRatio() {
    return this._pixelAspectRatioCache ??= simplifyRational({
      num: requireSync(this._backing.getSquarePixelWidth(), "pixelAspectRatio", "getPixelAspectRatio") * requireSync(this._backing.getCodedHeight(), "pixelAspectRatio", "getPixelAspectRatio"),
      den: requireSync(this._backing.getSquarePixelHeight(), "pixelAspectRatio", "getPixelAspectRatio") * requireSync(this._backing.getCodedWidth(), "pixelAspectRatio", "getPixelAspectRatio")
    });
  }
  /** Returns the display width of the track's frames in pixels, after aspect ratio adjustment and rotation. */
  async getDisplayWidth() {
    const metadata = await this._backing.getMetadataDisplayWidth?.();
    if (metadata != null) {
      return metadata;
    }
    const rotation = await this.getRotation();
    return rotation % 180 === 0 ? this.getSquarePixelWidth() : this.getSquarePixelHeight();
  }
  /**
   * The display width of the track's frames in pixels, after aspect ratio adjustment and rotation.
   * @deprecated Use {@link InputVideoTrack.getDisplayWidth} instead.
   */
  get displayWidth() {
    const metadataRaw = this._backing.getMetadataDisplayWidth?.();
    if (metadataRaw !== void 0) {
      const metadata = requireSync(metadataRaw, "displayWidth", "getDisplayWidth");
      if (metadata !== null) {
        return metadata;
      }
    }
    const rotation = requireSync(this._backing.getRotation(), "displayWidth", "getDisplayWidth");
    const value = rotation % 180 === 0 ? this._backing.getSquarePixelWidth() : this._backing.getSquarePixelHeight();
    return requireSync(value, "displayWidth", "getDisplayWidth");
  }
  /** Returns the display height of the track's frames in pixels, after aspect ratio adjustment and rotation. */
  async getDisplayHeight() {
    const metadata = await this._backing.getMetadataDisplayHeight?.();
    if (metadata != null) {
      return metadata;
    }
    const rotation = await this.getRotation();
    return rotation % 180 === 0 ? this.getSquarePixelHeight() : this.getSquarePixelWidth();
  }
  /**
   * The display height of the track's frames in pixels, after aspect ratio adjustment and rotation.
   * @deprecated Use {@link InputVideoTrack.getDisplayHeight} instead.
   */
  get displayHeight() {
    const metadataRaw = this._backing.getMetadataDisplayHeight?.();
    if (metadataRaw !== void 0) {
      const metadata = requireSync(metadataRaw, "displayHeight", "getDisplayHeight");
      if (metadata !== null) {
        return metadata;
      }
    }
    const rotation = requireSync(this._backing.getRotation(), "displayHeight", "getDisplayHeight");
    const value = rotation % 180 === 0 ? this._backing.getSquarePixelHeight() : this._backing.getSquarePixelWidth();
    return requireSync(value, "displayHeight", "getDisplayHeight");
  }
  /** Returns the color space of the track's samples. */
  async getColorSpace() {
    return this._backing.getColorSpace();
  }
  /** If this method returns true, the track's samples use a high dynamic range (HDR). */
  async hasHighDynamicRange() {
    const colorSpace = await this._backing.getColorSpace();
    return colorSpace.primaries === "bt2020" || colorSpace.primaries === "smpte432" || colorSpace.transfer === "pg" || colorSpace.transfer === "hlg" || colorSpace.matrix === "bt2020-ncl";
  }
  /** Checks if this track may contain transparent samples with alpha data. */
  async canBeTransparent() {
    return this._backing.canBeTransparent();
  }
  /**
   * Returns the [decoder configuration](https://www.w3.org/TR/webcodecs/#video-decoder-config) for decoding the
   * track's packets using a [`VideoDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder). Returns
   * null if the track's codec is unknown.
   */
  async getDecoderConfig() {
    return this._backing.getDecoderConfig();
  }
  async getCodecParameterString() {
    const fromMetadata = await this._backing.getMetadataCodecParameterString?.();
    if (fromMetadata != null) {
      return fromMetadata;
    }
    const decoderConfig = await this._backing.getDecoderConfig();
    return decoderConfig?.codec ?? null;
  }
  async canDecode() {
    try {
      const decoderConfig = await this._backing.getDecoderConfig();
      if (!decoderConfig) {
        return false;
      }
      const codec = await this._backing.getCodec();
      assert(codec !== null);
      if (customVideoDecoders.some((x) => x.supports(codec, decoderConfig))) {
        return true;
      }
      if (typeof VideoDecoder === "undefined") {
        return false;
      }
      const support = await VideoDecoder.isConfigSupported(decoderConfig);
      return support.supported === true;
    } catch (error) {
      console.error("Error during decodability check:", error);
      return false;
    }
  }
  async determinePacketType(packet) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    if (packet.isMetadataOnly) {
      throw new TypeError("packet must not be metadata-only to determine its type.");
    }
    const codec = await this.getCodec();
    if (codec === null) {
      return null;
    }
    const decoderConfig = await this.getDecoderConfig();
    assert(decoderConfig);
    return determineVideoPacketType(codec, decoderConfig, packet.data);
  }
};
var InputAudioTrack = class extends InputTrack {
  /** @internal */
  constructor(input, backing) {
    super(input, backing);
    this._backing = backing;
  }
  get type() {
    return "audio";
  }
  /** The codec of the track's packets. */
  async getCodec() {
    return this._backing.getCodec();
  }
  /**
   * The codec of the track's packets.
   * @deprecated Use {@link InputAudioTrack.getCodec} instead.
   */
  get codec() {
    return requireSync(this._backing.getCodec(), "codec", "getCodec");
  }
  async hasOnlyKeyPackets() {
    return await this._backing.getHasOnlyKeyPackets?.() ?? true;
  }
  /** Returns the number of audio channels in the track. */
  async getNumberOfChannels() {
    return this._backing.getNumberOfChannels();
  }
  /**
   * The number of audio channels in the track.
   * @deprecated Use {@link InputAudioTrack.getNumberOfChannels} instead.
   */
  get numberOfChannels() {
    return requireSync(this._backing.getNumberOfChannels(), "numberOfChannels", "getNumberOfChannels");
  }
  /** Returns the track's audio sample rate in hertz. */
  async getSampleRate() {
    return this._backing.getSampleRate();
  }
  /**
   * The track's audio sample rate in hertz.
   * @deprecated Use {@link InputAudioTrack.getSampleRate} instead.
   */
  get sampleRate() {
    return requireSync(this._backing.getSampleRate(), "sampleRate", "getSampleRate");
  }
  /**
   * Returns the [decoder configuration](https://www.w3.org/TR/webcodecs/#audio-decoder-config) for decoding the
   * track's packets using an [`AudioDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/AudioDecoder). Returns
   * null if the track's codec is unknown.
   */
  async getDecoderConfig() {
    return this._backing.getDecoderConfig();
  }
  async getCodecParameterString() {
    const fromMetadata = await this._backing.getMetadataCodecParameterString?.();
    if (fromMetadata != null) {
      return fromMetadata;
    }
    const decoderConfig = await this._backing.getDecoderConfig();
    return decoderConfig?.codec ?? null;
  }
  async canDecode() {
    try {
      const decoderConfig = await this._backing.getDecoderConfig();
      if (!decoderConfig) {
        return false;
      }
      const codec = await this._backing.getCodec();
      assert(codec !== null);
      if (customAudioDecoders.some((x) => x.supports(codec, decoderConfig))) {
        return true;
      }
      if (decoderConfig.codec.startsWith("pcm-")) {
        return true;
      } else {
        if (typeof AudioDecoder === "undefined") {
          return false;
        }
        const support = await AudioDecoder.isConfigSupported(decoderConfig);
        return support.supported === true;
      }
    } catch (error) {
      console.error("Error during decodability check:", error);
      return false;
    }
  }
  async determinePacketType(packet) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    if (await this.getCodec() === null) {
      return null;
    }
    return "key";
  }
};
var desc = (value) => {
  return -(value ?? -Infinity);
};
var prefer = (value) => {
  return -value;
};
var toValidatedInputTrackQuery = (query) => {
  if (typeof query !== "object" || !query) {
    throw new TypeError("query must be an object.");
  }
  if (query.filter !== void 0 && typeof query.filter !== "function") {
    throw new TypeError("query.filter, when provided, must be a function.");
  }
  if (query.sortBy !== void 0 && typeof query.sortBy !== "function") {
    throw new TypeError("query.sortBy, when provided, must be a function.");
  }
  return {
    filter: query.filter ? (track) => {
      const handle = (bool) => {
        if (typeof bool !== "boolean") {
          throw new TypeError("query.filter must return or resolve to a boolean.");
        }
        return bool;
      };
      const result = query.filter(track);
      if (result instanceof Promise) {
        return result.then(handle);
      } else {
        return handle(result);
      }
    } : void 0,
    sortBy: query.sortBy ? (track) => {
      const handle = (value) => {
        if (typeof value !== "number" && (!Array.isArray(value) || !value.every((x) => typeof x === "number"))) {
          throw new TypeError("query.sortBy must return or resolve to a number or an array of numbers.");
        }
        return value;
      };
      const result = query.sortBy(track);
      if (result instanceof Promise) {
        return result.then(handle);
      } else {
        return handle(result);
      }
    } : void 0
  };
};
var mergeInputTrackQueries = (queryA, queryB) => {
  return {
    filter: queryA?.filter || queryB?.filter ? (track) => {
      const resultA = queryA?.filter?.(track) ?? true;
      const handleResultA = (resultA2) => {
        if (resultA2 === false) {
          return false;
        }
        return queryB?.filter?.(track) ?? true;
      };
      if (resultA instanceof Promise) {
        return resultA.then(handleResultA);
      } else {
        return handleResultA(resultA);
      }
    } : void 0,
    sortBy: queryA?.sortBy || queryB?.sortBy ? (track) => {
      const resultA = queryA?.sortBy?.(track) ?? [];
      const resultB = queryB?.sortBy?.(track) ?? [];
      const join = (resultA2, resultB2) => {
        return [
          ...Array.isArray(resultA2) ? resultA2 : [resultA2],
          ...Array.isArray(resultB2) ? resultB2 : [resultB2]
        ];
      };
      if (resultA instanceof Promise || resultB instanceof Promise) {
        return Promise.all([resultA, resultB]).then(([resultA2, resultB2]) => {
          return join(resultA2, resultB2);
        });
      } else {
        return join(resultA, resultB);
      }
    } : void 0
  };
};
var queryInputTracks = async (tracks, query) => {
  let matched = tracks;
  if (query?.filter) {
    const filterMatches = tracks.map((t) => query.filter(t));
    const hasAsyncFilter = filterMatches.some((x) => x instanceof Promise);
    if (hasAsyncFilter) {
      const resolvedFilterMatches = await Promise.all(filterMatches);
      matched = tracks.filter((_, i) => resolvedFilterMatches[i]);
    } else {
      matched = tracks.filter((_, i) => filterMatches[i]);
    }
  }
  if (!query?.sortBy) {
    return matched;
  }
  const sortValues = matched.map((t) => query.sortBy(t));
  const hasAsyncSort = sortValues.some((x) => x instanceof Promise);
  const resolvedSortValues = hasAsyncSort ? await Promise.all(sortValues) : sortValues;
  return matched.map((track, i) => ({ track, sortValue: resolvedSortValues[i] })).sort((a, b) => {
    const aValues = Array.isArray(a.sortValue) ? a.sortValue : [a.sortValue];
    const bValues = Array.isArray(b.sortValue) ? b.sortValue : [b.sortValue];
    const maxLength = Math.max(aValues.length, bValues.length);
    for (let i = 0; i < maxLength; i++) {
      const aValue = aValues[i] ?? 0;
      const bValue = bValues[i] ?? 0;
      if (aValue === bValue) {
        continue;
      }
      return aValue - bValue;
    }
    return 0;
  }).map((x) => x.track);
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/input.js
polyfillSymbolDispose();
var DEFAULT_SOURCE_CACHE_GROUP = 1;
var Input = class _Input extends EventEmitter {
  /** True if the input has been disposed. */
  get disposed() {
    return this._disposed;
  }
  /**
   * Creates a new input file from the specified options. No reading operations will be performed until methods are
   * called on this instance.
   */
  constructor(options) {
    super();
    this._demuxerPromise = null;
    this._format = null;
    this._trackBackingsCache = null;
    this._backingToTrack = /* @__PURE__ */ new Map();
    this._disposed = false;
    this._nextSourceCacheAge = 0;
    this._sourceRefs = [];
    this._sourceCache = [];
    this._sourceCachePromises = [];
    this._onFormatDetermined = null;
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!Array.isArray(options.formats) || options.formats.some((x) => !(x instanceof InputFormat))) {
      throw new TypeError("options.formats must be an array of InputFormat.");
    }
    if (!(options.source instanceof Source || options.source instanceof SourceRef)) {
      throw new TypeError("options.source must be a Source or SourceRef.");
    }
    if (options.source instanceof Source && options.source._disposed) {
      throw new TypeError("options.source must not be a disposed Source.");
    }
    if (options.initInput !== void 0 && !(options.initInput instanceof _Input)) {
      throw new TypeError("options.initInput, when provided, must be an Input.");
    }
    if (options.formatOptions !== void 0) {
      validateInputFormatOptions(options.formatOptions, "formatOptions");
    }
    this._formats = options.formats;
    this._initInput = options.initInput ?? null;
    this._formatOptions = options.formatOptions ?? {};
    if (options.source instanceof Source) {
      this._rootRef = options.source.ref();
    } else {
      this._rootRef = options.source;
    }
    this._sourceRefs.push(this._rootRef);
  }
  /** @internal */
  get _rootSource() {
    return this._rootRef.source;
  }
  /** @internal */
  async _getSourceUncached(request) {
    assert(this._rootSource instanceof PathedSource);
    const ref = await this._rootSource._resolveRequest(request);
    this._emit("source", { source: ref.source, request, isRoot: request.isRoot });
    return ref;
  }
  /** @internal */
  _getSourceCached(request, cacheGroup = DEFAULT_SOURCE_CACHE_GROUP) {
    const cachedEntry = this._sourceCache.find((x) => x.cacheGroup === cacheGroup && sourceRequestsAreEqual(x.request, request));
    if (cachedEntry) {
      cachedEntry.age++;
      return Promise.resolve(cachedEntry.sourceRef.source.ref());
    }
    const cachedPromiseEntry = this._sourceCachePromises.find((x) => x.cacheGroup === cacheGroup && sourceRequestsAreEqual(x.request, request));
    if (cachedPromiseEntry) {
      return cachedPromiseEntry.promise.then((x) => x.sourceRef.source.ref());
    }
    const promise = (async () => {
      const sourceRef = await this._getSourceUncached(request);
      const MAX_SOURCE_CACHE_SIZE = 4;
      const count = arrayCount(this._sourceCache, (x) => x.cacheGroup === cacheGroup && x.sourceRef.source._refCount === 1);
      if (count >= MAX_SOURCE_CACHE_SIZE) {
        const minAgeIndex = arrayArgmin(this._sourceCache, (x) => x.cacheGroup === cacheGroup && x.sourceRef.source._refCount === 1 ? x.age : Infinity);
        assert(minAgeIndex !== -1);
        const entry = this._sourceCache[minAgeIndex];
        this._sourceCache.splice(minAgeIndex, 1);
        entry.sourceRef.free();
        removeItem(this._sourceRefs, entry.sourceRef);
      }
      this._sourceRefs.push(sourceRef);
      const promiseIndex = this._sourceCachePromises.findIndex((x) => x.request === request);
      assert(promiseIndex !== -1);
      this._sourceCachePromises.splice(promiseIndex, 1);
      const cacheEntry = {
        request,
        sourceRef,
        age: this._nextSourceCacheAge++,
        cacheGroup
      };
      return cacheEntry;
    })();
    this._sourceCachePromises.push({
      request,
      cacheGroup,
      promise
    });
    return promise.then((entry) => {
      const ref = entry.sourceRef.source.ref();
      this._sourceCache.push(entry);
      return ref;
    });
  }
  /** @internal */
  _getDemuxer() {
    return this._demuxerPromise ??= (async () => {
      this._reader = new Reader(this._rootSource);
      this._emit("source", { source: this._rootSource, request: null, isRoot: true });
      for (const format of this._formats) {
        const canRead = await format._canReadInput(this);
        if (canRead) {
          this._format = format;
          this._onFormatDetermined?.(format);
          return format._createDemuxer(this);
        }
      }
      throw new UnsupportedInputFormatError();
    })();
  }
  /**
   * Returns the source from which this input file reads data for the root path.
   */
  get source() {
    return this._rootSource;
  }
  /**
   * Returns the format of the input file. You can compare this result directly to the {@link InputFormat} singletons
   * or use `instanceof` checks for subset-aware logic (for example, `format instanceof MatroskaInputFormat` is true
   * for both MKV and WebM).
   */
  async getFormat() {
    await this._getDemuxer();
    assert(this._format);
    return this._format;
  }
  /** Returns `true` if the format of the input file is known and the file can be read, `false` otherwise. */
  async canRead() {
    try {
      await this._getDemuxer();
      return true;
    } catch (error) {
      if (error instanceof UnsupportedInputFormatError) {
        return false;
      }
      throw error;
    }
  }
  /**
   * Returns the timestamp at which the input file starts. More precisely, returns the smallest starting timestamp
   * among all tracks.
   *
   * Optionally, you can pass in the list of tracks for which you want to compute the starting timestamp.
   *
   * Note that this method is potentially expensive for inputs with many tracks (such as HLS manifests), since it
   * probes every track.
   */
  async getFirstTimestamp(tracks) {
    tracks ??= await this.getTracks();
    const filtered = tracks.filter((x) => x !== null);
    if (filtered.length === 0) {
      return 0;
    }
    const firstTimestamps = await Promise.all(filtered.map((x) => x.getFirstTimestamp()));
    return Math.min(...firstTimestamps);
  }
  /**
   * Computes the duration of the input file, in seconds. More precisely, returns the largest end timestamp among
   * all tracks.
   *
   * Optionally, you can pass in the list of tracks for which you want to compute the duration.
   *
   * This method can be potentially expensive depending on the underlying file format, because it returns the most
   * accurate duration possible and must check all tracks. Use {@link Input.getDurationFromMetadata} for a faster but
   * less accurate estimate of duration.
   *
   * By default, when any track in the underlying media is live, this method will only resolve once the live stream
   * ends. If you want to query the current duration of the media, set {@link PacketRetrievalOptions.skipLiveWait}
   * to `true` in the options.
   */
  async computeDuration(tracks, options) {
    tracks ??= await this.getTracks();
    const filtered = tracks.filter((x) => x !== null);
    if (filtered.length === 0) {
      return 0;
    }
    const tracksDurations = await Promise.all(filtered.map((x) => x.computeDuration(options)));
    return Math.max(...tracksDurations);
  }
  /**
   * Gets the duration (end timestamp) in seconds of the input file from metadata stored in the file. This value may
   * be approximate or diverge from the actual, precise duration returned by `.computeDuration()`, but compared to
   * that method, this method is cheaper. When the duration cannot be determined from the file metadata, `null`
   * is returned.
   *
   * Optionally, you can pass in the list of tracks for which you want to get the duration from metadata.
   *
   * By default, when the underlying media is live, this method will only resolve once the live stream
   * ends. If you want to query the current duration of the media, set
   * {@link DurationMetadataRequestOptions.skipLiveWait} to `true` in the options.
   */
  async getDurationFromMetadata(tracks, options) {
    tracks ??= await this.getTracks();
    const filtered = tracks.filter((x) => x !== null);
    const tracksDurations = await Promise.all(filtered.map((x) => x.getDurationFromMetadata(options)));
    const nonNullDurations = tracksDurations.filter((x) => x !== null);
    if (nonNullDurations.length === 0) {
      return null;
    }
    return Math.max(...nonNullDurations);
  }
  /**
   * Returns the list of all tracks of this input file in the order in which they appear in the file. An optional
   * query can be provided.
   */
  async getTracks(query) {
    query &&= toValidatedInputTrackQuery(query);
    const backings = await this._getTrackBackings();
    const tracks = backings.map((backing) => this._wrapBackingAsTrack(backing));
    return queryInputTracks(tracks, query);
  }
  /** Returns the list of all video tracks of this input file. An optional query can be provided. */
  async getVideoTracks(query) {
    query &&= toValidatedInputTrackQuery(query);
    const tracks = await this.getTracks();
    const videoTracks = tracks.filter((x) => x.isVideoTrack());
    return queryInputTracks(videoTracks, query);
  }
  /** Returns the list of all audio tracks of this input file. An optional query can be provided. */
  async getAudioTracks(query) {
    query &&= toValidatedInputTrackQuery(query);
    const tracks = await this.getTracks();
    const audioTracks = tracks.filter((x) => x.isAudioTrack());
    return queryInputTracks(audioTracks, query);
  }
  /**
   * Returns the primary video track of this input file, or null if there are no video tracks.
   *
   * Multiple factors determine which track is considered primary, including its position in the file, disposition,
   * bitrate (higher bitrate is preferred), and if it can be paired with an audio track.
   */
  async getPrimaryVideoTrack(query) {
    query &&= toValidatedInputTrackQuery(query);
    const merged = mergeInputTrackQueries(query, {
      sortBy: async (t) => [
        prefer((await t.getDisposition()).default),
        prefer(await t.hasPairableAudioTrack()),
        prefer(!await t.hasOnlyKeyPackets()),
        desc(await t.getBitrate())
      ]
    });
    const sorted = await this.getVideoTracks(merged);
    return sorted[0] ?? null;
  }
  /**
   * Returns the primary audio track of this input file, or null if there are no audio tracks.
   *
   * Multiple factors determine which track is considered primary, including its position in the file, disposition,
   * bitrate (higher bitrate is preferred), and if it can be paired with the primary video track.
   */
  async getPrimaryAudioTrack(query) {
    query &&= toValidatedInputTrackQuery(query);
    const primaryVideoTrack = await this.getPrimaryVideoTrack();
    const merged = mergeInputTrackQueries(query, {
      sortBy: async (t) => [
        prefer(!primaryVideoTrack || t.canBePairedWith(primaryVideoTrack)),
        prefer((await t.getDisposition()).default),
        desc(await t.getBitrate())
      ]
    });
    const sorted = await this.getAudioTracks(merged);
    return sorted[0] ?? null;
  }
  /** @internal */
  async _getTrackBackings() {
    const demuxer = await this._getDemuxer();
    return this._trackBackingsCache ??= await demuxer.getTrackBackings();
  }
  /** @internal */
  _wrapBackingAsTrack(backing) {
    const existing = this._backingToTrack.get(backing);
    if (existing) {
      return existing;
    }
    const type = backing.getType();
    const track = type === "video" ? new InputVideoTrack(this, backing) : new InputAudioTrack(this, backing);
    this._backingToTrack.set(backing, track);
    return track;
  }
  /** Returns the full MIME type of this input file, including track codecs. */
  async getMimeType() {
    const demuxer = await this._getDemuxer();
    return demuxer.getMimeType();
  }
  /**
   * Returns descriptive metadata tags about the media file, such as title, author, date, cover art, or other
   * attached files.
   */
  async getMetadataTags() {
    const demuxer = await this._getDemuxer();
    return demuxer.getMetadataTags();
  }
  /**
   * Disposes this input and frees connected resources. When an input is disposed, ongoing read operations will be
   * canceled, all future read operations will fail, any open decoders will be closed, and all ongoing media sink
   * operations will be canceled. Disallowed and canceled operations will throw an {@link InputDisposedError}.
   *
   * You are expected not to use an input after disposing it. While some operations may still work, it is not
   * specified and may change in any future update.
   */
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    for (const ref of this._sourceRefs) {
      ref.free();
    }
    this._sourceRefs.length = 0;
    void this._demuxerPromise?.then((demuxer) => demuxer.dispose());
  }
  /**
   * Calls `.dispose()` on the input, implementing the `Disposable` interface for use with
   * JavaScript Explicit Resource Management features.
   */
  [Symbol.dispose]() {
    this.dispose();
  }
};
var UnsupportedInputFormatError = class extends Error {
  /** Creates a new {@link UnsupportedInputFormatError}. */
  constructor(message = "Input has an unsupported or unrecognizable format.") {
    super(message);
    this.name = "UnsupportedInputFormatError";
  }
};
var InputDisposedError = class extends Error {
  /** Creates a new {@link InputDisposedError}. */
  constructor(message = "Input has been disposed.") {
    super(message);
    this.name = "InputDisposedError";
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/reader.js
var Reader = class {
  constructor(source) {
    this.source = source;
  }
  get fileSize() {
    const size = this.source._getFileSize();
    if (size === void 0) {
      throw new Error("Reading file size too early; read required first.");
    }
    return size;
  }
  get fileSizeNonStrict() {
    return this.source._getFileSize() ?? null;
  }
  requestSlice(start, length) {
    if (this.source._disposed) {
      throw new InputDisposedError();
    }
    if (start < 0) {
      return null;
    }
    if (this.fileSizeNonStrict !== null && start + length > this.fileSizeNonStrict) {
      return null;
    }
    if (length === 0) {
      const buffer = new Uint8Array(0);
      return new FileSlice(buffer, toDataView(buffer), 0, start, start);
    }
    const end = start + length;
    const result = this.source._read(start, end, DEFAULT_MIN_READ_POSITION, DEFAULT_MAX_READ_POSITION);
    if (result instanceof Promise) {
      return result.then((x) => {
        if (!x) {
          return null;
        }
        return new FileSlice(x.bytes, x.view, x.offset, start, end);
      });
    } else {
      if (!result) {
        return null;
      }
      return new FileSlice(result.bytes, result.view, result.offset, start, end);
    }
  }
  requestSliceRange(start, minLength, maxLength) {
    if (this.source._disposed) {
      throw new InputDisposedError();
    }
    if (start < 0) {
      return null;
    }
    if (this.fileSizeNonStrict !== null) {
      return this.requestSlice(start, clamp(this.fileSizeNonStrict - start, minLength, maxLength));
    } else {
      const promisedAttempt = this.requestSlice(start, maxLength);
      const handleAttempt = (attempt) => {
        if (attempt) {
          return attempt;
        }
        assert(this.fileSizeNonStrict !== null);
        return this.requestSlice(start, clamp(this.fileSizeNonStrict - start, minLength, maxLength));
      };
      if (promisedAttempt instanceof Promise) {
        return promisedAttempt.then(handleAttempt);
      } else {
        return handleAttempt(promisedAttempt);
      }
    }
  }
  requestEntireFile() {
    if (this.fileSizeNonStrict !== null) {
      return this.requestSlice(0, this.fileSizeNonStrict);
    }
    const CHUNK_SIZE = 1024;
    return (async () => {
      const chunks = [];
      let currentSize = 0;
      while (true) {
        if (chunks.length === 1 && this.fileSizeNonStrict !== null) {
          return this.requestSlice(0, this.fileSizeNonStrict);
        }
        const startOffset = chunks.length * CHUNK_SIZE;
        let slice = this.requestSliceRange(startOffset, 0, CHUNK_SIZE);
        if (slice instanceof Promise)
          slice = await slice;
        if (!slice) {
          break;
        }
        chunks.push(readBytes(slice, slice.length));
        currentSize += slice.length;
      }
      const joined = new Uint8Array(currentSize);
      let offset = 0;
      for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.length;
      }
      return new FileSlice(joined, toDataView(joined), 0, 0, currentSize);
    })();
  }
};
var FileSlice = class _FileSlice {
  constructor(bytes2, view2, offset, start, end) {
    this.bytes = bytes2;
    this.view = view2;
    this.offset = offset;
    this.start = start;
    this.end = end;
    this.bufferPos = start - offset;
  }
  static tempFromBytes(bytes2) {
    return new _FileSlice(bytes2, toDataView(bytes2), 0, 0, bytes2.length);
  }
  get length() {
    return this.end - this.start;
  }
  get filePos() {
    return this.offset + this.bufferPos;
  }
  set filePos(value) {
    this.bufferPos = value - this.offset;
  }
  /** The number of bytes left from the current pos to the end of the slice. */
  get remainingLength() {
    return Math.max(this.end - this.filePos, 0);
  }
  skip(byteCount) {
    this.bufferPos += byteCount;
  }
  /** Creates a new subslice of this slice whose byte range must be contained within this slice. */
  slice(filePos, length = this.end - filePos) {
    if (filePos < this.start || filePos + length > this.end) {
      throw new RangeError("Slicing outside of original slice.");
    }
    return new _FileSlice(this.bytes, this.view, this.offset, filePos, filePos + length);
  }
};
var checkIsInRange = (slice, bytesToRead) => {
  if (slice.filePos < slice.start || slice.filePos + bytesToRead > slice.end) {
    throw new RangeError(`Tried reading [${slice.filePos}, ${slice.filePos + bytesToRead}), but slice is [${slice.start}, ${slice.end}). This is likely an internal error, please report it alongside the file that caused it.`);
  }
};
var readBytes = (slice, length) => {
  checkIsInRange(slice, length);
  const bytes2 = slice.bytes.subarray(slice.bufferPos, slice.bufferPos + length);
  slice.bufferPos += length;
  return bytes2;
};
var readU8 = (slice) => {
  checkIsInRange(slice, 1);
  return slice.view.getUint8(slice.bufferPos++);
};
var readU16Be = (slice) => {
  checkIsInRange(slice, 2);
  const value = slice.view.getUint16(slice.bufferPos, false);
  slice.bufferPos += 2;
  return value;
};
var readU24Be = (slice) => {
  checkIsInRange(slice, 3);
  const value = getUint24(slice.view, slice.bufferPos, false);
  slice.bufferPos += 3;
  return value;
};
var readI16Be = (slice) => {
  checkIsInRange(slice, 2);
  const value = slice.view.getInt16(slice.bufferPos, false);
  slice.bufferPos += 2;
  return value;
};
var readU32Be = (slice) => {
  checkIsInRange(slice, 4);
  const value = slice.view.getUint32(slice.bufferPos, false);
  slice.bufferPos += 4;
  return value;
};
var readI32Be = (slice) => {
  checkIsInRange(slice, 4);
  const value = slice.view.getInt32(slice.bufferPos, false);
  slice.bufferPos += 4;
  return value;
};
var readU64Be = (slice) => {
  const high = readU32Be(slice);
  const low = readU32Be(slice);
  return high * 4294967296 + low;
};
var readI64Be = (slice) => {
  const high = readI32Be(slice);
  const low = readU32Be(slice);
  return high * 4294967296 + low;
};
var readF64Be = (slice) => {
  checkIsInRange(slice, 8);
  const value = slice.view.getFloat64(slice.bufferPos, false);
  slice.bufferPos += 8;
  return value;
};
var readAscii = (slice, length) => {
  checkIsInRange(slice, length);
  let str = "";
  for (let i = 0; i < length; i++) {
    str += String.fromCharCode(slice.bytes[slice.bufferPos++]);
  }
  return str;
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/muxer.js
var Muxer = class {
  constructor(output) {
    this.mutex = new AsyncMutex();
    this.trackTimestampInfo = /* @__PURE__ */ new WeakMap();
    this.output = output;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTrackClose(track) {
  }
  validateTimestamp(track, timestampInSeconds, isKeyPacket) {
    if (timestampInSeconds < 0) {
      throw new Error(`Timestamps must be non-negative (got ${timestampInSeconds}s).`);
    }
    let timestampInfo = this.trackTimestampInfo.get(track);
    if (!timestampInfo) {
      if (!isKeyPacket) {
        throw new Error("First packet must be a key packet.");
      }
      timestampInfo = {
        maxTimestamp: timestampInSeconds,
        maxTimestampBeforeLastKeyPacket: null
      };
      this.trackTimestampInfo.set(track, timestampInfo);
    } else {
      if (isKeyPacket) {
        timestampInfo.maxTimestampBeforeLastKeyPacket = timestampInfo.maxTimestamp;
      }
      if (timestampInfo.maxTimestampBeforeLastKeyPacket !== null && timestampInSeconds < timestampInfo.maxTimestampBeforeLastKeyPacket) {
        throw new Error(`Timestamps cannot be smaller than the largest timestamp of the previous GOP (a GOP begins with a key packet and ends right before the next key packet). Got ${timestampInSeconds}s, but largest timestamp is ${timestampInfo.maxTimestampBeforeLastKeyPacket}s.`);
      }
      timestampInfo.maxTimestamp = Math.max(timestampInfo.maxTimestamp, timestampInSeconds);
    }
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/subtitles.js
var inlineTimestampRegex = /<(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})>/g;
var formatSubtitleTimestamp = (timestamp) => {
  const hours = Math.floor(timestamp / (60 * 60 * 1e3));
  const minutes = Math.floor(timestamp % (60 * 60 * 1e3) / (60 * 1e3));
  const seconds = Math.floor(timestamp % (60 * 1e3) / 1e3);
  const milliseconds = timestamp % 1e3;
  return hours.toString().padStart(2, "0") + ":" + minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0") + "." + milliseconds.toString().padStart(3, "0");
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/isobmff/isobmff-boxes.js
var IsobmffBoxWriter = class {
  constructor(writer) {
    this.writer = writer;
    this.helper = new Uint8Array(8);
    this.helperView = new DataView(this.helper.buffer);
    this.offsets = /* @__PURE__ */ new WeakMap();
  }
  writeU32(value) {
    this.helperView.setUint32(0, value, false);
    this.writer.write(this.helper.subarray(0, 4));
  }
  writeU64(value) {
    this.helperView.setUint32(0, Math.floor(value / 2 ** 32), false);
    this.helperView.setUint32(4, value, false);
    this.writer.write(this.helper.subarray(0, 8));
  }
  writeAscii(text) {
    for (let i = 0; i < text.length; i++) {
      this.helperView.setUint8(i % 8, text.charCodeAt(i));
      if (i % 8 === 7)
        this.writer.write(this.helper);
    }
    if (text.length % 8 !== 0) {
      this.writer.write(this.helper.subarray(0, text.length % 8));
    }
  }
  writeBox(box2) {
    this.offsets.set(box2, this.writer.getPos());
    if (box2.contents && !box2.children) {
      this.writeBoxHeader(box2, box2.size ?? box2.contents.byteLength + 8);
      this.writer.write(box2.contents);
    } else {
      const startPos = this.writer.getPos();
      this.writeBoxHeader(box2, 0);
      if (box2.contents)
        this.writer.write(box2.contents);
      if (box2.children) {
        for (const child of box2.children)
          if (child)
            this.writeBox(child);
      }
      const endPos = this.writer.getPos();
      const size = box2.size ?? endPos - startPos;
      this.writer.seek(startPos);
      this.writeBoxHeader(box2, size);
      this.writer.seek(endPos);
    }
  }
  writeBoxHeader(box2, size) {
    this.writeU32(box2.largeSize ? 1 : size);
    this.writeAscii(box2.type);
    if (box2.largeSize)
      this.writeU64(size);
  }
  measureBoxHeader(box2) {
    return 8 + (box2.largeSize ? 8 : 0);
  }
  patchBox(box2) {
    const boxOffset = this.offsets.get(box2);
    assert(boxOffset !== void 0);
    const endPos = this.writer.getPos();
    this.writer.seek(boxOffset);
    this.writeBox(box2);
    this.writer.seek(endPos);
  }
  measureBox(box2) {
    if (box2.contents && !box2.children) {
      const headerSize = this.measureBoxHeader(box2);
      return headerSize + box2.contents.byteLength;
    } else {
      let result = this.measureBoxHeader(box2);
      if (box2.contents)
        result += box2.contents.byteLength;
      if (box2.children) {
        for (const child of box2.children)
          if (child)
            result += this.measureBox(child);
      }
      return result;
    }
  }
};
var bytes = /* @__PURE__ */ new Uint8Array(8);
var view = /* @__PURE__ */ new DataView(bytes.buffer);
var u8 = (value) => {
  return [(value % 256 + 256) % 256];
};
var u16 = (value) => {
  view.setUint16(0, value, false);
  return [bytes[0], bytes[1]];
};
var i16 = (value) => {
  view.setInt16(0, value, false);
  return [bytes[0], bytes[1]];
};
var u24 = (value) => {
  view.setUint32(0, value, false);
  return [bytes[1], bytes[2], bytes[3]];
};
var u32 = (value) => {
  view.setUint32(0, value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
};
var i32 = (value) => {
  view.setInt32(0, value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
};
var u64 = (value) => {
  view.setUint32(0, Math.floor(value / 2 ** 32), false);
  view.setUint32(4, value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]];
};
var i64 = (value) => {
  view.setInt32(0, Math.floor(value / 2 ** 32), false);
  view.setUint32(4, value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]];
};
var fixed_8_8 = (value) => {
  view.setInt16(0, 2 ** 8 * value, false);
  return [bytes[0], bytes[1]];
};
var fixed_16_16 = (value) => {
  view.setInt32(0, 2 ** 16 * value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
};
var fixed_2_30 = (value) => {
  view.setInt32(0, 2 ** 30 * value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
};
var variableUnsignedInt = (value, byteLength) => {
  const bytes2 = [];
  let remaining = value;
  do {
    let byte = remaining & 127;
    remaining >>= 7;
    if (bytes2.length > 0) {
      byte |= 128;
    }
    bytes2.push(byte);
    if (byteLength !== void 0) {
      byteLength--;
    }
  } while (remaining > 0 || byteLength);
  return bytes2.reverse();
};
var ascii = (text, nullTerminated = false) => {
  const bytes2 = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
  if (nullTerminated)
    bytes2.push(0);
  return bytes2;
};
var rotationMatrix = (rotationInDegrees) => {
  const theta = rotationInDegrees * (Math.PI / 180);
  const cosTheta = Math.round(Math.cos(theta));
  const sinTheta = Math.round(Math.sin(theta));
  return [
    cosTheta,
    sinTheta,
    0,
    -sinTheta,
    cosTheta,
    0,
    0,
    0,
    1
  ];
};
var IDENTITY_MATRIX = /* @__PURE__ */ rotationMatrix(0);
var matrixToBytes = (matrix) => {
  return [
    fixed_16_16(matrix[0]),
    fixed_16_16(matrix[1]),
    fixed_2_30(matrix[2]),
    fixed_16_16(matrix[3]),
    fixed_16_16(matrix[4]),
    fixed_2_30(matrix[5]),
    fixed_16_16(matrix[6]),
    fixed_16_16(matrix[7]),
    fixed_2_30(matrix[8])
  ];
};
var box = (type, contents, children) => ({
  type,
  contents: contents && new Uint8Array(contents.flat(10)),
  children
});
var fullBox = (type, version, flags, contents, children) => box(type, [u8(version), u24(flags), contents ?? []], children);
var ftyp = (details) => {
  const minorVersion = 512;
  if (details.isQuickTime) {
    return box("ftyp", [
      ascii("qt  "),
      // Major brand
      u32(minorVersion),
      // Minor version
      // Compatible brands
      ascii("qt  ")
    ]);
  }
  if (details.fragmented) {
    if (details.cmaf) {
      return box("ftyp", [
        ascii("iso5"),
        // Major brand
        u32(minorVersion),
        // Minor version
        // Compatible brands
        ascii("iso5"),
        ascii("iso6"),
        ascii("mp41"),
        ascii("cmfc"),
        ascii("dash")
      ]);
    } else {
      return box("ftyp", [
        ascii("iso5"),
        // Major brand
        u32(minorVersion),
        // Minor version
        // Compatible brands
        ascii("iso5"),
        ascii("iso6"),
        ascii("mp41")
      ]);
    }
  }
  return box("ftyp", [
    ascii("isom"),
    // Major brand
    u32(minorVersion),
    // Minor version
    // Compatible brands
    ascii("isom"),
    details.holdsAvc ? ascii("avc1") : [],
    ascii("mp41")
  ]);
};
var styp = () => box("styp", [
  ascii("iso5"),
  // Major brand
  u32(0),
  // Minor version
  // Compatible brands
  ascii("iso5"),
  ascii("iso6"),
  ascii("mp41"),
  ascii("cmfc"),
  ascii("dash")
]);
var sidx = (muxer, referencedSize) => {
  let duration = muxer.maxWrittenEndTimestamp - muxer.minWrittenTimestamp;
  if (!Number.isFinite(duration)) {
    duration = 0;
  }
  return fullBox("sidx", 1, 0, [
    u32(1),
    // Reference ID
    u32(GLOBAL_TIMESCALE),
    // Timescale
    u64(intoTimescale(muxer.minWrittenTimestamp, GLOBAL_TIMESCALE)),
    // Earliest presentation time
    u64(0),
    // First offset
    u16(0),
    // Reserved
    u16(1),
    // Reference count
    u32(referencedSize & 2147483647),
    // Reference type (0) + referenced size
    u32(intoTimescale(duration, GLOBAL_TIMESCALE)),
    // Subsegment duration
    u32(0)
    // Starts with SAP + SAP type + SAP delta time (no information provided)
  ]);
};
var mdat = (reserveLargeSize) => ({ type: "mdat", largeSize: reserveLargeSize });
var free = (size) => ({ type: "free", size });
var moov = (muxer) => box("moov", void 0, [
  mvhd(muxer.creationTime, muxer.trackDatas),
  ...muxer.trackDatas.map((x) => trak(x, muxer.creationTime)),
  muxer.isFragmented ? mvex(muxer.trackDatas) : null,
  udta(muxer)
]);
var mvhd = (creationTime, trackDatas) => {
  const duration = Math.max(0, ...trackDatas.map((trackData) => intoTimescale(presentationSpan(trackData), GLOBAL_TIMESCALE) + intoTimescale(trackData.startTimestampOffset ?? 0, GLOBAL_TIMESCALE)));
  const nextTrackId = Math.max(0, ...trackDatas.map((x) => x.track.id)) + 1;
  const needsU64 = !isU32(creationTime) || !isU32(duration);
  const u32OrU64 = needsU64 ? u64 : u32;
  return fullBox("mvhd", +needsU64, 0, [
    u32OrU64(creationTime),
    // Creation time
    u32OrU64(creationTime),
    // Modification time
    u32(GLOBAL_TIMESCALE),
    // Timescale
    u32OrU64(duration),
    // Duration
    fixed_16_16(1),
    // Preferred rate
    fixed_8_8(1),
    // Preferred volume
    Array(10).fill(0),
    // Reserved
    matrixToBytes(IDENTITY_MATRIX),
    // Matrix
    Array(24).fill(0),
    // Pre-defined
    u32(nextTrackId)
    // Next track ID
  ]);
};
var presentationSpan = (trackData) => {
  if (trackData.samples.length === 0) {
    return 0;
  }
  let minTimestamp = Infinity;
  let maxEndTimestamp = -Infinity;
  for (let i = 0; i < trackData.samples.length; i++) {
    const sample = trackData.samples[i];
    if (sample.timestamp < minTimestamp) {
      minTimestamp = sample.timestamp;
    }
    if (sample.timestamp + sample.duration > maxEndTimestamp) {
      maxEndTimestamp = sample.timestamp + sample.duration;
    }
  }
  if (minTimestamp === Infinity) {
    return 0;
  }
  return maxEndTimestamp - minTimestamp;
};
var trak = (trackData, creationTime) => {
  const trackMetadata = getTrackMetadata(trackData);
  const needsEditList = trackData.startTimestampOffset !== null && trackData.startTimestampOffset > 0;
  return box("trak", void 0, [
    tkhd(trackData, creationTime),
    needsEditList ? edts(trackData, trackData.startTimestampOffset) : null,
    mdia(trackData, creationTime),
    trackMetadata.name !== void 0 ? box("udta", void 0, [
      box("name", [
        ...textEncoder.encode(trackMetadata.name)
      ])
    ]) : null
  ]);
};
var tkhd = (trackData, creationTime) => {
  const durationInGlobalTimescale = intoTimescale(presentationSpan(trackData), GLOBAL_TIMESCALE) + intoTimescale(trackData.startTimestampOffset ?? 0, GLOBAL_TIMESCALE);
  const needsU64 = !isU32(creationTime) || !isU32(durationInGlobalTimescale);
  const u32OrU64 = needsU64 ? u64 : u32;
  let matrix;
  if (trackData.type === "video") {
    const rotation = trackData.track.metadata.rotation;
    matrix = rotationMatrix(rotation ?? 0);
  } else {
    matrix = IDENTITY_MATRIX;
  }
  let flags = 2;
  if (trackData.track.metadata.disposition?.default !== false) {
    flags |= 1;
  }
  return fullBox("tkhd", +needsU64, flags, [
    u32OrU64(creationTime),
    // Creation time
    u32OrU64(creationTime),
    // Modification time
    u32(trackData.track.id),
    // Track ID
    u32(0),
    // Reserved
    u32OrU64(durationInGlobalTimescale),
    // Duration
    Array(8).fill(0),
    // Reserved
    u16(0),
    // Layer
    u16(trackData.track.id),
    // Alternate group
    fixed_8_8(trackData.type === "audio" ? 1 : 0),
    // Volume
    u16(0),
    // Reserved
    matrixToBytes(matrix),
    // Matrix
    fixed_16_16(trackData.type === "video" ? trackData.info.width : 0),
    // Track width
    fixed_16_16(trackData.type === "video" ? trackData.info.height : 0)
    // Track height
  ]);
};
var edts = (trackData, offset) => {
  const startOffset = intoTimescale(offset, GLOBAL_TIMESCALE);
  const mediaDuration = intoTimescale(presentationSpan(trackData), GLOBAL_TIMESCALE);
  const needs64Bits = !isU32(startOffset) || !isU32(mediaDuration);
  const u32OrU64 = needs64Bits ? u64 : u32;
  const i32OrI64 = needs64Bits ? i64 : i32;
  return box("edts", void 0, [
    fullBox("elst", needs64Bits ? 1 : 0, 0, [
      u32(2),
      // Entry count
      // #1
      u32OrU64(startOffset),
      // Segment duration
      i32OrI64(-1),
      // Media time
      fixed_16_16(1),
      // Media rate
      // #2
      u32OrU64(mediaDuration),
      // Segment duration
      i32OrI64(0),
      // Media time
      fixed_16_16(1)
      // Media rate
    ])
  ]);
};
var mdia = (trackData, creationTime) => box("mdia", void 0, [
  mdhd(trackData, creationTime),
  hdlr(true, TRACK_TYPE_TO_COMPONENT_SUBTYPE[trackData.type], TRACK_TYPE_TO_HANDLER_NAME[trackData.type]),
  minf(trackData)
]);
var mdhd = (trackData, creationTime) => {
  const localDuration = intoTimescale(presentationSpan(trackData), trackData.timescale);
  const needsU64 = !isU32(creationTime) || !isU32(localDuration);
  const u32OrU64 = needsU64 ? u64 : u32;
  return fullBox("mdhd", +needsU64, 0, [
    u32OrU64(creationTime),
    // Creation time
    u32OrU64(creationTime),
    // Modification time
    u32(trackData.timescale),
    // Timescale
    u32OrU64(localDuration),
    // Duration
    u16(getLanguageCodeInt(trackData.track.metadata.languageCode ?? UNDETERMINED_LANGUAGE)),
    // Language
    u16(0)
    // Quality
  ]);
};
var TRACK_TYPE_TO_COMPONENT_SUBTYPE = {
  video: "vide",
  audio: "soun",
  subtitle: "text"
};
var TRACK_TYPE_TO_HANDLER_NAME = {
  video: "MediabunnyVideoHandler",
  audio: "MediabunnySoundHandler",
  subtitle: "MediabunnyTextHandler"
};
var hdlr = (hasComponentType, handlerType, name, manufacturer = "\0\0\0\0") => fullBox("hdlr", 0, 0, [
  hasComponentType ? ascii("mhlr") : u32(0),
  // Component type
  ascii(handlerType),
  // Component subtype
  ascii(manufacturer),
  // Component manufacturer
  u32(0),
  // Component flags
  u32(0),
  // Component flags mask
  ascii(name, true)
  // Component name
]);
var minf = (trackData) => box("minf", void 0, [
  TRACK_TYPE_TO_HEADER_BOX[trackData.type](),
  dinf(),
  stbl(trackData)
]);
var vmhd = () => fullBox("vmhd", 0, 1, [
  u16(0),
  // Graphics mode
  u16(0),
  // Opcolor R
  u16(0),
  // Opcolor G
  u16(0)
  // Opcolor B
]);
var smhd = () => fullBox("smhd", 0, 0, [
  u16(0),
  // Balance
  u16(0)
  // Reserved
]);
var nmhd = () => fullBox("nmhd", 0, 0);
var TRACK_TYPE_TO_HEADER_BOX = {
  video: vmhd,
  audio: smhd,
  subtitle: nmhd
};
var dinf = () => box("dinf", void 0, [
  dref()
]);
var dref = () => fullBox("dref", 0, 0, [
  u32(1)
  // Entry count
], [
  url()
]);
var url = () => fullBox("url ", 0, 1);
var stbl = (trackData) => {
  const needsCtts = trackData.compositionTimeOffsetTable.length > 1 || trackData.compositionTimeOffsetTable.some((x) => x.sampleCompositionTimeOffset !== 0);
  return box("stbl", void 0, [
    stsd(trackData),
    stts(trackData),
    needsCtts ? ctts(trackData) : null,
    needsCtts ? cslg(trackData) : null,
    stsc(trackData),
    stsz(trackData),
    stco(trackData),
    stss(trackData)
  ]);
};
var stsd = (trackData) => {
  let sampleDescription;
  if (trackData.type === "video") {
    sampleDescription = videoSampleDescription(videoCodecToBoxName(trackData.track.source._codec, trackData.info.decoderConfig.codec), trackData);
  } else if (trackData.type === "audio") {
    const boxName = audioCodecToBoxName(trackData.track.source._codec, trackData.muxer.isQuickTime);
    assert(boxName);
    sampleDescription = soundSampleDescription(boxName, trackData);
  } else if (trackData.type === "subtitle") {
    sampleDescription = subtitleSampleDescription(SUBTITLE_CODEC_TO_BOX_NAME[trackData.track.source._codec], trackData);
  }
  assert(sampleDescription);
  return fullBox("stsd", 0, 0, [
    u32(1)
    // Entry count
  ], [
    sampleDescription
  ]);
};
var videoSampleDescription = (compressionType, trackData) => box(compressionType, [
  Array(6).fill(0),
  // Reserved
  u16(1),
  // Data reference index
  u16(0),
  // Pre-defined
  u16(0),
  // Reserved
  Array(12).fill(0),
  // Pre-defined
  u16(trackData.info.width),
  // Width
  u16(trackData.info.height),
  // Height
  u32(4718592),
  // Horizontal resolution
  u32(4718592),
  // Vertical resolution
  u32(0),
  // Reserved
  u16(1),
  // Frame count
  Array(32).fill(0),
  // Compressor name
  u16(24),
  // Depth
  i16(65535)
  // Pre-defined
], [
  VIDEO_CODEC_TO_CONFIGURATION_BOX[trackData.track.source._codec](trackData),
  pasp(trackData),
  colorSpaceIsComplete(trackData.info.decoderConfig.colorSpace) ? colr(trackData) : null
]);
var pasp = (trackData) => {
  if (trackData.info.pixelAspectRatio.num === trackData.info.pixelAspectRatio.den) {
    return null;
  }
  return box("pasp", [
    u32(trackData.info.pixelAspectRatio.num),
    u32(trackData.info.pixelAspectRatio.den)
  ]);
};
var colr = (trackData) => box("colr", [
  ascii("nclx"),
  // Colour type
  u16(COLOR_PRIMARIES_MAP[trackData.info.decoderConfig.colorSpace.primaries]),
  // Colour primaries
  u16(TRANSFER_CHARACTERISTICS_MAP[trackData.info.decoderConfig.colorSpace.transfer]),
  // Transfer characteristics
  u16(MATRIX_COEFFICIENTS_MAP[trackData.info.decoderConfig.colorSpace.matrix]),
  // Matrix coefficients
  u8((trackData.info.decoderConfig.colorSpace.fullRange ? 1 : 0) << 7)
  // Full range flag
]);
var avcC = (trackData) => trackData.info.decoderConfig && box("avcC", [
  // For AVC, description is an AVCDecoderConfigurationRecord, so nothing else to do here
  ...toUint8Array(trackData.info.decoderConfig.description)
]);
var hvcC = (trackData) => trackData.info.decoderConfig && box("hvcC", [
  // For HEVC, description is an HEVCDecoderConfigurationRecord, so nothing else to do here
  ...toUint8Array(trackData.info.decoderConfig.description)
]);
var vpcC = (trackData) => {
  if (!trackData.info.decoderConfig) {
    return null;
  }
  const decoderConfig = trackData.info.decoderConfig;
  const parts = decoderConfig.codec.split(".");
  const profile = Number(parts[1]);
  const level = Number(parts[2]);
  const bitDepth = Number(parts[3]);
  const chromaSubsampling = parts[4] ? Number(parts[4]) : 1;
  const videoFullRangeFlag = parts[8] ? Number(parts[8]) : Number(decoderConfig.colorSpace?.fullRange ?? 0);
  const thirdByte = (bitDepth << 4) + (chromaSubsampling << 1) + videoFullRangeFlag;
  const colourPrimaries = parts[5] ? Number(parts[5]) : decoderConfig.colorSpace?.primaries ? COLOR_PRIMARIES_MAP[decoderConfig.colorSpace.primaries] : 2;
  const transferCharacteristics = parts[6] ? Number(parts[6]) : decoderConfig.colorSpace?.transfer ? TRANSFER_CHARACTERISTICS_MAP[decoderConfig.colorSpace.transfer] : 2;
  const matrixCoefficients = parts[7] ? Number(parts[7]) : decoderConfig.colorSpace?.matrix ? MATRIX_COEFFICIENTS_MAP[decoderConfig.colorSpace.matrix] : 2;
  return fullBox("vpcC", 1, 0, [
    u8(profile),
    // Profile
    u8(level),
    // Level
    u8(thirdByte),
    // Bit depth, chroma subsampling, full range
    u8(colourPrimaries),
    // Colour primaries
    u8(transferCharacteristics),
    // Transfer characteristics
    u8(matrixCoefficients),
    // Matrix coefficients
    u16(0)
    // Codec initialization data size
  ]);
};
var av1C = (trackData) => {
  return box("av1C", generateAv1CodecConfigurationFromCodecString(trackData.info.decoderConfig.codec));
};
var soundSampleDescription = (compressionType, trackData) => {
  let version = 0;
  let contents;
  let sampleSizeInBits = 16;
  const isPcmCodec = PCM_AUDIO_CODECS.includes(trackData.track.source._codec);
  if (isPcmCodec) {
    const codec = trackData.track.source._codec;
    const { sampleSize } = parsePcmCodec(codec);
    sampleSizeInBits = 8 * sampleSize;
    if (sampleSizeInBits > 16) {
      version = 1;
    }
  }
  if (trackData.muxer.isQuickTime) {
    version = 1;
  }
  if (version === 0) {
    contents = [
      Array(6).fill(0),
      // Reserved
      u16(1),
      // Data reference index
      u16(version),
      // Version
      u16(0),
      // Revision level
      u32(0),
      // Vendor
      u16(trackData.info.numberOfChannels),
      // Number of channels
      u16(sampleSizeInBits),
      // Sample size (bits)
      u16(0),
      // Compression ID
      u16(0),
      // Packet size
      u16(trackData.info.sampleRate < 2 ** 16 ? trackData.info.sampleRate : 0),
      // Sample rate (upper)
      u16(0)
      // Sample rate (lower)
    ];
  } else {
    const compressionId = isPcmCodec ? 0 : -2;
    contents = [
      Array(6).fill(0),
      // Reserved
      u16(1),
      // Data reference index
      u16(version),
      // Version
      u16(0),
      // Revision level
      u32(0),
      // Vendor
      u16(trackData.info.numberOfChannels),
      // Number of channels
      u16(Math.min(sampleSizeInBits, 16)),
      // Sample size (bits)
      i16(compressionId),
      // Compression ID
      u16(0),
      // Packet size
      u16(trackData.info.sampleRate < 2 ** 16 ? trackData.info.sampleRate : 0),
      // Sample rate (upper)
      u16(0),
      // Sample rate (lower)
      isPcmCodec ? [
        u32(1),
        // Samples per packet (must be 1 for uncompressed formats)
        u32(sampleSizeInBits / 8),
        // Bytes per packet
        u32(trackData.info.numberOfChannels * sampleSizeInBits / 8)
        // Bytes per frame
      ] : [
        u32(0),
        // Samples per packet (don't bother, still works with 0)
        u32(0),
        // Bytes per packet (variable)
        u32(0)
        // Bytes per frame (variable)
      ],
      u32(2)
      // Bytes per sample (constant in FFmpeg)
    ];
  }
  return box(compressionType, contents, [
    audioCodecToConfigurationBox(trackData.track.source._codec, trackData.muxer.isQuickTime)?.(trackData) ?? null
  ]);
};
var esds = (trackData) => {
  let objectTypeIndication;
  switch (trackData.track.source._codec) {
    case "aac":
      {
        objectTypeIndication = 64;
      }
      ;
      break;
    case "mp3":
      {
        objectTypeIndication = 107;
      }
      ;
      break;
    case "vorbis":
      {
        objectTypeIndication = 221;
      }
      ;
      break;
    default:
      throw new Error(`Unhandled audio codec: ${trackData.track.source._codec}`);
  }
  let bytes2 = [
    ...u8(objectTypeIndication),
    // Object type indication
    ...u8(21),
    // stream type(6bits)=5 audio, flags(2bits)=1
    ...u24(0),
    // 24bit buffer size
    ...u32(0),
    // max bitrate
    ...u32(0)
    // avg bitrate
  ];
  if (trackData.info.decoderConfig.description) {
    const description = toUint8Array(trackData.info.decoderConfig.description);
    bytes2 = [
      ...bytes2,
      ...u8(5),
      // TAG(5) = DecoderSpecificInfo
      ...variableUnsignedInt(description.byteLength),
      ...description
    ];
  }
  bytes2 = [
    ...u16(1),
    // ES_ID = 1
    ...u8(0),
    // flags etc = 0
    ...u8(4),
    // TAG(4) = ES Descriptor
    ...variableUnsignedInt(bytes2.length),
    ...bytes2,
    ...u8(6),
    // TAG(6)
    ...u8(1),
    // length
    ...u8(2)
    // data
  ];
  bytes2 = [
    ...u8(3),
    // TAG(3) = Object Descriptor
    ...variableUnsignedInt(bytes2.length),
    ...bytes2
  ];
  return fullBox("esds", 0, 0, bytes2);
};
var wave = (trackData) => {
  return box("wave", void 0, [
    frma(trackData),
    enda(trackData),
    box("\0\0\0\0")
    // NULL tag at the end
  ]);
};
var frma = (trackData) => {
  return box("frma", [
    ascii(audioCodecToBoxName(trackData.track.source._codec, trackData.muxer.isQuickTime))
  ]);
};
var enda = (trackData) => {
  const { littleEndian } = parsePcmCodec(trackData.track.source._codec);
  return box("enda", [
    u16(+littleEndian)
  ]);
};
var dOps = (trackData) => {
  let outputChannelCount = trackData.info.numberOfChannels;
  let preSkip = 3840;
  let inputSampleRate = trackData.info.sampleRate;
  let outputGain = 0;
  let channelMappingFamily = 0;
  let channelMappingTable = new Uint8Array(0);
  const description = trackData.info.decoderConfig?.description;
  if (description) {
    assert(description.byteLength >= 18);
    const bytes2 = toUint8Array(description);
    const header = parseOpusIdentificationHeader(bytes2);
    outputChannelCount = header.outputChannelCount;
    preSkip = header.preSkip;
    inputSampleRate = header.inputSampleRate;
    outputGain = header.outputGain;
    channelMappingFamily = header.channelMappingFamily;
    if (header.channelMappingTable) {
      channelMappingTable = header.channelMappingTable;
    }
  }
  return box("dOps", [
    u8(0),
    // Version
    u8(outputChannelCount),
    // OutputChannelCount
    u16(preSkip),
    // PreSkip
    u32(inputSampleRate),
    // InputSampleRate
    i16(outputGain),
    // OutputGain
    u8(channelMappingFamily),
    // ChannelMappingFamily
    ...channelMappingTable
  ]);
};
var dfLa = (trackData) => {
  const description = trackData.info.decoderConfig?.description;
  assert(description);
  const bytes2 = toUint8Array(description);
  return fullBox("dfLa", 0, 0, [
    ...bytes2.subarray(4)
  ]);
};
var pcmC = (trackData) => {
  const { littleEndian, sampleSize } = parsePcmCodec(trackData.track.source._codec);
  const formatFlags = +littleEndian;
  return fullBox("pcmC", 0, 0, [
    u8(formatFlags),
    u8(8 * sampleSize)
  ]);
};
var dac3 = (trackData) => {
  const frameInfo = parseAc3SyncFrame(trackData.info.firstPacket.data);
  if (!frameInfo) {
    throw new Error("Couldn't extract AC-3 frame info from the audio packet. Ensure the packets contain valid AC-3 sync frames (as specified in ETSI TS 102 366).");
  }
  const bytes2 = new Uint8Array(3);
  const bitstream = new Bitstream(bytes2);
  bitstream.writeBits(2, frameInfo.fscod);
  bitstream.writeBits(5, frameInfo.bsid);
  bitstream.writeBits(3, frameInfo.bsmod);
  bitstream.writeBits(3, frameInfo.acmod);
  bitstream.writeBits(1, frameInfo.lfeon);
  bitstream.writeBits(5, frameInfo.bitRateCode);
  bitstream.writeBits(5, 0);
  return box("dac3", [...bytes2]);
};
var dec3 = (trackData) => {
  const frameInfo = parseEac3SyncFrame(trackData.info.firstPacket.data);
  if (!frameInfo) {
    throw new Error("Couldn't extract E-AC-3 frame info from the audio packet. Ensure the packets contain valid E-AC-3 sync frames (as specified in ETSI TS 102 366).");
  }
  let totalBits = 16;
  for (const sub of frameInfo.substreams) {
    totalBits += 23;
    if (sub.numDepSub > 0) {
      totalBits += 9;
    } else {
      totalBits += 1;
    }
  }
  const size = Math.ceil(totalBits / 8);
  const bytes2 = new Uint8Array(size);
  const bitstream = new Bitstream(bytes2);
  bitstream.writeBits(13, frameInfo.dataRate);
  bitstream.writeBits(3, frameInfo.substreams.length - 1);
  for (const sub of frameInfo.substreams) {
    bitstream.writeBits(2, sub.fscod);
    bitstream.writeBits(5, sub.bsid);
    bitstream.writeBits(1, 0);
    bitstream.writeBits(1, 0);
    bitstream.writeBits(3, sub.bsmod);
    bitstream.writeBits(3, sub.acmod);
    bitstream.writeBits(1, sub.lfeon);
    bitstream.writeBits(3, 0);
    bitstream.writeBits(4, sub.numDepSub);
    if (sub.numDepSub > 0) {
      bitstream.writeBits(9, sub.chanLoc);
    } else {
      bitstream.writeBits(1, 0);
    }
  }
  return box("dec3", [...bytes2]);
};
var subtitleSampleDescription = (compressionType, trackData) => box(compressionType, [
  Array(6).fill(0),
  // Reserved
  u16(1)
  // Data reference index
], [
  SUBTITLE_CODEC_TO_CONFIGURATION_BOX[trackData.track.source._codec](trackData)
]);
var vttC = (trackData) => box("vttC", [
  ...textEncoder.encode(trackData.info.config.description)
]);
var stts = (trackData) => {
  return fullBox("stts", 0, 0, [
    u32(trackData.timeToSampleTable.length),
    // Number of entries
    trackData.timeToSampleTable.map((x) => [
      u32(x.sampleCount),
      // Sample count
      u32(x.sampleDelta)
      // Sample duration
    ])
  ]);
};
var stss = (trackData) => {
  if (trackData.samples.every((x) => x.type === "key"))
    return null;
  const keySamples = [...trackData.samples.entries()].filter(([, sample]) => sample.type === "key");
  return fullBox("stss", 0, 0, [
    u32(keySamples.length),
    // Number of entries
    keySamples.map(([index]) => u32(index + 1))
    // Sync sample table
  ]);
};
var stsc = (trackData) => {
  return fullBox("stsc", 0, 0, [
    u32(trackData.compactlyCodedChunkTable.length),
    // Number of entries
    trackData.compactlyCodedChunkTable.map((x) => [
      u32(x.firstChunk),
      // First chunk
      u32(x.samplesPerChunk),
      // Samples per chunk
      u32(1)
      // Sample description index
    ])
  ]);
};
var stsz = (trackData) => {
  if (trackData.type === "audio" && trackData.info.requiresPcmTransformation) {
    const { sampleSize } = parsePcmCodec(trackData.track.source._codec);
    return fullBox("stsz", 0, 0, [
      u32(sampleSize * trackData.info.numberOfChannels),
      // Sample size
      u32(trackData.samples.reduce((acc, x) => acc + intoTimescale(x.duration, trackData.timescale), 0))
    ]);
  }
  return fullBox("stsz", 0, 0, [
    u32(0),
    // Sample size (0 means non-constant size)
    u32(trackData.samples.length),
    // Number of entries
    trackData.samples.map((x) => u32(x.size))
    // Sample size table
  ]);
};
var stco = (trackData) => {
  if (trackData.finalizedChunks.length > 0 && last(trackData.finalizedChunks).offset >= 2 ** 32) {
    return fullBox("co64", 0, 0, [
      u32(trackData.finalizedChunks.length),
      // Number of entries
      trackData.finalizedChunks.map((x) => u64(x.offset))
      // Chunk offset table
    ]);
  }
  return fullBox("stco", 0, 0, [
    u32(trackData.finalizedChunks.length),
    // Number of entries
    trackData.finalizedChunks.map((x) => u32(x.offset))
    // Chunk offset table
  ]);
};
var ctts = (trackData) => {
  return fullBox("ctts", 1, 0, [
    u32(trackData.compositionTimeOffsetTable.length),
    // Number of entries
    trackData.compositionTimeOffsetTable.map((x) => [
      u32(x.sampleCount),
      // Sample count
      i32(x.sampleCompositionTimeOffset)
      // Sample offset
    ])
  ]);
};
var cslg = (trackData) => {
  let leastDecodeToDisplayDelta = Infinity;
  let greatestDecodeToDisplayDelta = -Infinity;
  let compositionStartTime = Infinity;
  let compositionEndTime = -Infinity;
  assert(trackData.compositionTimeOffsetTable.length > 0);
  assert(trackData.samples.length > 0);
  for (let i = 0; i < trackData.compositionTimeOffsetTable.length; i++) {
    const entry = trackData.compositionTimeOffsetTable[i];
    leastDecodeToDisplayDelta = Math.min(leastDecodeToDisplayDelta, entry.sampleCompositionTimeOffset);
    greatestDecodeToDisplayDelta = Math.max(greatestDecodeToDisplayDelta, entry.sampleCompositionTimeOffset);
  }
  for (let i = 0; i < trackData.samples.length; i++) {
    const sample = trackData.samples[i];
    compositionStartTime = Math.min(compositionStartTime, intoTimescale(sample.timestamp, trackData.timescale));
    compositionEndTime = Math.max(compositionEndTime, intoTimescale(sample.timestamp + sample.duration, trackData.timescale));
  }
  const compositionToDtsShift = Math.max(-leastDecodeToDisplayDelta, 0);
  if (compositionEndTime >= 2 ** 31) {
    return null;
  }
  return fullBox("cslg", 0, 0, [
    i32(compositionToDtsShift),
    // Composition to DTS shift
    i32(leastDecodeToDisplayDelta),
    // Least decode to display delta
    i32(greatestDecodeToDisplayDelta),
    // Greatest decode to display delta
    i32(compositionStartTime),
    // Composition start time
    i32(compositionEndTime)
    // Composition end time
  ]);
};
var mvex = (trackDatas) => {
  return box("mvex", void 0, trackDatas.map(trex));
};
var trex = (trackData) => {
  return fullBox("trex", 0, 0, [
    u32(trackData.track.id),
    // Track ID
    u32(1),
    // Default sample description index
    u32(0),
    // Default sample duration
    u32(0),
    // Default sample size
    u32(0)
    // Default sample flags
  ]);
};
var moof = (sequenceNumber, trackDatas) => {
  return box("moof", void 0, [
    mfhd(sequenceNumber),
    ...trackDatas.map(traf)
  ]);
};
var mfhd = (sequenceNumber) => {
  return fullBox("mfhd", 0, 0, [
    u32(sequenceNumber)
    // Sequence number
  ]);
};
var fragmentSampleFlags = (sample) => {
  let byte1 = 0;
  let byte2 = 0;
  const byte3 = 0;
  const byte4 = 0;
  const sampleIsDifferenceSample = sample.type === "delta";
  byte2 |= +sampleIsDifferenceSample;
  if (sampleIsDifferenceSample) {
    byte1 |= 1;
  } else {
    byte1 |= 2;
  }
  return byte1 << 24 | byte2 << 16 | byte3 << 8 | byte4;
};
var traf = (trackData) => {
  return box("traf", void 0, [
    tfhd(trackData),
    tfdt(trackData),
    trun(trackData)
  ]);
};
var tfhd = (trackData) => {
  assert(trackData.currentChunk);
  let tfFlags = 0;
  tfFlags |= 8;
  tfFlags |= 16;
  tfFlags |= 32;
  tfFlags |= 131072;
  const referenceSample = trackData.currentChunk.samples[1] ?? trackData.currentChunk.samples[0];
  const referenceSampleInfo = {
    duration: referenceSample.timescaleUnitsToNextSample,
    size: referenceSample.size,
    flags: fragmentSampleFlags(referenceSample)
  };
  return fullBox("tfhd", 0, tfFlags, [
    u32(trackData.track.id),
    // Track ID
    u32(referenceSampleInfo.duration),
    // Default sample duration
    u32(referenceSampleInfo.size),
    // Default sample size
    u32(referenceSampleInfo.flags)
    // Default sample flags
  ]);
};
var tfdt = (trackData) => {
  assert(trackData.currentChunk);
  return fullBox("tfdt", 1, 0, [
    u64(intoTimescale(trackData.currentChunk.startTimestamp, trackData.timescale))
    // Base Media Decode Time
  ]);
};
var trun = (trackData) => {
  assert(trackData.currentChunk);
  const allSampleDurations = trackData.currentChunk.samples.map((x) => x.timescaleUnitsToNextSample);
  const allSampleSizes = trackData.currentChunk.samples.map((x) => x.size);
  const allSampleFlags = trackData.currentChunk.samples.map(fragmentSampleFlags);
  const allSampleCompositionTimeOffsets = trackData.currentChunk.samples.map((x) => intoTimescale(x.timestamp - x.decodeTimestamp, trackData.timescale));
  const uniqueSampleDurations = new Set(allSampleDurations);
  const uniqueSampleSizes = new Set(allSampleSizes);
  const uniqueSampleFlags = new Set(allSampleFlags);
  const uniqueSampleCompositionTimeOffsets = new Set(allSampleCompositionTimeOffsets);
  const firstSampleFlagsPresent = uniqueSampleFlags.size === 2 && allSampleFlags[0] !== allSampleFlags[1];
  const sampleDurationPresent = uniqueSampleDurations.size > 1;
  const sampleSizePresent = uniqueSampleSizes.size > 1;
  const sampleFlagsPresent = !firstSampleFlagsPresent && uniqueSampleFlags.size > 1;
  const sampleCompositionTimeOffsetsPresent = uniqueSampleCompositionTimeOffsets.size > 1 || [...uniqueSampleCompositionTimeOffsets].some((x) => x !== 0);
  let flags = 0;
  flags |= 1;
  flags |= 4 * +firstSampleFlagsPresent;
  flags |= 256 * +sampleDurationPresent;
  flags |= 512 * +sampleSizePresent;
  flags |= 1024 * +sampleFlagsPresent;
  flags |= 2048 * +sampleCompositionTimeOffsetsPresent;
  return fullBox("trun", 1, flags, [
    u32(trackData.currentChunk.samples.length),
    // Sample count
    u32(trackData.currentChunk.offset - trackData.currentChunk.moofOffset || 0),
    // Data offset
    firstSampleFlagsPresent ? u32(allSampleFlags[0]) : [],
    trackData.currentChunk.samples.map((_, i) => [
      sampleDurationPresent ? u32(allSampleDurations[i]) : [],
      // Sample duration
      sampleSizePresent ? u32(allSampleSizes[i]) : [],
      // Sample size
      sampleFlagsPresent ? u32(allSampleFlags[i]) : [],
      // Sample flags
      // Sample composition time offsets
      sampleCompositionTimeOffsetsPresent ? i32(allSampleCompositionTimeOffsets[i]) : []
    ])
  ]);
};
var mfra = (trackDatas) => {
  return box("mfra", void 0, [
    ...trackDatas.map(tfra),
    mfro()
  ]);
};
var tfra = (trackData, trackIndex) => {
  const version = 1;
  return fullBox("tfra", version, 0, [
    u32(trackData.track.id),
    // Track ID
    u32(63),
    // This specifies that traf number, trun number and sample number are 32-bit ints
    u32(trackData.finalizedChunks.length),
    // Number of entries
    trackData.finalizedChunks.map((chunk) => [
      u64(intoTimescale(chunk.samples[0].timestamp, trackData.timescale)),
      // Time (in presentation time)
      u64(chunk.moofOffset),
      // moof offset
      u32(trackIndex + 1),
      // traf number
      u32(1),
      // trun number
      u32(1)
      // Sample number
    ])
  ]);
};
var mfro = () => {
  return fullBox("mfro", 0, 0, [
    // This value needs to be overwritten manually from the outside, where the actual size of the enclosing mfra box
    // is known
    u32(0)
    // Size
  ]);
};
var vtte = () => box("vtte");
var vttc = (payload, timestamp, identifier, settings, sourceId) => box("vttc", void 0, [
  sourceId !== null ? box("vsid", [i32(sourceId)]) : null,
  identifier !== null ? box("iden", [...textEncoder.encode(identifier)]) : null,
  timestamp !== null ? box("ctim", [...textEncoder.encode(formatSubtitleTimestamp(timestamp))]) : null,
  settings !== null ? box("sttg", [...textEncoder.encode(settings)]) : null,
  box("payl", [...textEncoder.encode(payload)])
]);
var vtta = (notes) => box("vtta", [...textEncoder.encode(notes)]);
var udta = (muxer) => {
  const boxes = [];
  const metadataFormat = muxer.format._options.metadataFormat ?? "auto";
  const metadataTags = muxer.output._metadataTags;
  if (metadataFormat === "mdir" || metadataFormat === "auto" && !muxer.isQuickTime) {
    const metaBox = metaMdir(metadataTags);
    if (metaBox)
      boxes.push(metaBox);
  } else if (metadataFormat === "mdta") {
    const metaBox = metaMdta(metadataTags);
    if (metaBox)
      boxes.push(metaBox);
  } else if (metadataFormat === "udta" || metadataFormat === "auto" && muxer.isQuickTime) {
    addQuickTimeMetadataTagBoxes(boxes, muxer.output._metadataTags);
  }
  if (boxes.length === 0) {
    return null;
  }
  return box("udta", void 0, boxes);
};
var addQuickTimeMetadataTagBoxes = (boxes, tags) => {
  for (const { key, value } of keyValueIterator(tags)) {
    switch (key) {
      case "title":
        {
          boxes.push(metadataTagStringBoxShort("\xA9nam", value));
        }
        ;
        break;
      case "description":
        {
          boxes.push(metadataTagStringBoxShort("\xA9des", value));
        }
        ;
        break;
      case "artist":
        {
          boxes.push(metadataTagStringBoxShort("\xA9ART", value));
        }
        ;
        break;
      case "album":
        {
          boxes.push(metadataTagStringBoxShort("\xA9alb", value));
        }
        ;
        break;
      case "albumArtist":
        {
          boxes.push(metadataTagStringBoxShort("albr", value));
        }
        ;
        break;
      case "genre":
        {
          boxes.push(metadataTagStringBoxShort("\xA9gen", value));
        }
        ;
        break;
      case "date":
        {
          boxes.push(metadataTagStringBoxShort("\xA9day", value.toISOString().slice(0, 10)));
        }
        ;
        break;
      case "comment":
        {
          boxes.push(metadataTagStringBoxShort("\xA9cmt", value));
        }
        ;
        break;
      case "lyrics":
        {
          boxes.push(metadataTagStringBoxShort("\xA9lyr", value));
        }
        ;
        break;
      case "raw":
        {
        }
        ;
        break;
      case "discNumber":
      case "discsTotal":
      case "trackNumber":
      case "tracksTotal":
      case "images":
        {
        }
        ;
        break;
      default:
        assertNever(key);
    }
  }
  if (tags.raw) {
    for (const key in tags.raw) {
      const value = tags.raw[key];
      if (value == null || key.length !== 4 || boxes.some((x) => x.type === key)) {
        continue;
      }
      if (typeof value === "string") {
        boxes.push(metadataTagStringBoxShort(key, value));
      } else if (value instanceof Uint8Array) {
        boxes.push(box(key, Array.from(value)));
      }
    }
  }
};
var metadataTagStringBoxShort = (name, value) => {
  const encoded = textEncoder.encode(value);
  return box(name, [
    u16(encoded.length),
    u16(getLanguageCodeInt("und")),
    Array.from(encoded)
  ]);
};
var DATA_BOX_MIME_TYPE_MAP = {
  "image/jpeg": 13,
  "image/png": 14,
  "image/bmp": 27
};
var generateMetadataPairs = (tags, isMdta) => {
  const pairs = [];
  for (const { key, value } of keyValueIterator(tags)) {
    switch (key) {
      case "title":
        {
          pairs.push({ key: isMdta ? "title" : "\xA9nam", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "description":
        {
          pairs.push({ key: isMdta ? "description" : "\xA9des", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "artist":
        {
          pairs.push({ key: isMdta ? "artist" : "\xA9ART", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "album":
        {
          pairs.push({ key: isMdta ? "album" : "\xA9alb", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "albumArtist":
        {
          pairs.push({ key: isMdta ? "album_artist" : "aART", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "comment":
        {
          pairs.push({ key: isMdta ? "comment" : "\xA9cmt", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "genre":
        {
          pairs.push({ key: isMdta ? "genre" : "\xA9gen", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "lyrics":
        {
          pairs.push({ key: isMdta ? "lyrics" : "\xA9lyr", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "date":
        {
          pairs.push({
            key: isMdta ? "date" : "\xA9day",
            value: dataStringBoxLong(value.toISOString().slice(0, 10))
          });
        }
        ;
        break;
      case "images":
        {
          for (const image of value) {
            if (image.kind !== "coverFront") {
              continue;
            }
            pairs.push({ key: "covr", value: box("data", [
              u32(DATA_BOX_MIME_TYPE_MAP[image.mimeType] ?? 0),
              // Type indicator
              u32(0),
              // Locale indicator
              Array.from(image.data)
              // Kinda slow, hopefully temp
            ]) });
          }
        }
        ;
        break;
      case "trackNumber":
        {
          if (isMdta) {
            const string = tags.tracksTotal !== void 0 ? `${value}/${tags.tracksTotal}` : value.toString();
            pairs.push({ key: "track", value: dataStringBoxLong(string) });
          } else {
            pairs.push({ key: "trkn", value: box("data", [
              u32(0),
              // 8 bytes empty
              u32(0),
              u16(0),
              // Empty
              u16(value),
              u16(tags.tracksTotal ?? 0),
              u16(0)
              // Empty
            ]) });
          }
        }
        ;
        break;
      case "discNumber":
        {
          if (!isMdta) {
            pairs.push({ key: "disc", value: box("data", [
              u32(0),
              // 8 bytes empty
              u32(0),
              u16(0),
              // Empty
              u16(value),
              u16(tags.discsTotal ?? 0),
              u16(0)
              // Empty
            ]) });
          }
        }
        ;
        break;
      case "tracksTotal":
      case "discsTotal":
        {
        }
        ;
        break;
      case "raw":
        {
        }
        ;
        break;
      default:
        assertNever(key);
    }
  }
  if (tags.raw) {
    for (const key in tags.raw) {
      const value = tags.raw[key];
      if (value == null || !isMdta && key.length !== 4 || pairs.some((x) => x.key === key)) {
        continue;
      }
      if (typeof value === "string") {
        pairs.push({ key, value: dataStringBoxLong(value) });
      } else if (value instanceof Uint8Array) {
        pairs.push({ key, value: box("data", [
          u32(0),
          // Type indicator
          u32(0),
          // Locale indicator
          Array.from(value)
        ]) });
      } else if (value instanceof RichImageData) {
        pairs.push({ key, value: box("data", [
          u32(DATA_BOX_MIME_TYPE_MAP[value.mimeType] ?? 0),
          // Type indicator
          u32(0),
          // Locale indicator
          Array.from(value.data)
          // Kinda slow, hopefully temp
        ]) });
      }
    }
  }
  return pairs;
};
var metaMdir = (tags) => {
  const pairs = generateMetadataPairs(tags, false);
  if (pairs.length === 0) {
    return null;
  }
  return fullBox("meta", 0, 0, void 0, [
    hdlr(false, "mdir", "", "appl"),
    // mdir handler
    box("ilst", void 0, pairs.map((pair) => box(pair.key, void 0, [pair.value])))
    // Item list without keys box
  ]);
};
var metaMdta = (tags) => {
  const pairs = generateMetadataPairs(tags, true);
  if (pairs.length === 0) {
    return null;
  }
  return box("meta", void 0, [
    hdlr(false, "mdta", ""),
    // mdta handler
    fullBox("keys", 0, 0, [
      u32(pairs.length)
    ], pairs.map((pair) => box("mdta", [
      ...textEncoder.encode(pair.key)
    ]))),
    box("ilst", void 0, pairs.map((pair, i) => {
      const boxName = String.fromCharCode(...u32(i + 1));
      return box(boxName, void 0, [pair.value]);
    }))
  ]);
};
var dataStringBoxLong = (value) => {
  return box("data", [
    u32(1),
    // Type indicator (UTF-8)
    u32(0),
    // Locale indicator
    ...textEncoder.encode(value)
  ]);
};
var videoCodecToBoxName = (codec, fullCodecString) => {
  switch (codec) {
    case "avc":
      return fullCodecString.startsWith("avc3") ? "avc3" : "avc1";
    case "hevc":
      return "hvc1";
    case "vp8":
      return "vp08";
    case "vp9":
      return "vp09";
    case "av1":
      return "av01";
  }
};
var VIDEO_CODEC_TO_CONFIGURATION_BOX = {
  avc: avcC,
  hevc: hvcC,
  vp8: vpcC,
  vp9: vpcC,
  av1: av1C
};
var audioCodecToBoxName = (codec, isQuickTime) => {
  switch (codec) {
    case "aac":
      return "mp4a";
    case "mp3":
      return "mp4a";
    case "opus":
      return "Opus";
    case "vorbis":
      return "mp4a";
    case "flac":
      return "fLaC";
    case "ulaw":
      return "ulaw";
    case "alaw":
      return "alaw";
    case "pcm-u8":
      return "raw ";
    case "pcm-s8":
      return "sowt";
    case "ac3":
      return "ac-3";
    case "eac3":
      return "ec-3";
  }
  if (isQuickTime) {
    switch (codec) {
      case "pcm-s16":
        return "sowt";
      case "pcm-s16be":
        return "twos";
      case "pcm-s24":
        return "in24";
      case "pcm-s24be":
        return "in24";
      case "pcm-s32":
        return "in32";
      case "pcm-s32be":
        return "in32";
      case "pcm-f32":
        return "fl32";
      case "pcm-f32be":
        return "fl32";
      case "pcm-f64":
        return "fl64";
      case "pcm-f64be":
        return "fl64";
    }
  } else {
    switch (codec) {
      case "pcm-s16":
        return "ipcm";
      case "pcm-s16be":
        return "ipcm";
      case "pcm-s24":
        return "ipcm";
      case "pcm-s24be":
        return "ipcm";
      case "pcm-s32":
        return "ipcm";
      case "pcm-s32be":
        return "ipcm";
      case "pcm-f32":
        return "fpcm";
      case "pcm-f32be":
        return "fpcm";
      case "pcm-f64":
        return "fpcm";
      case "pcm-f64be":
        return "fpcm";
    }
  }
};
var audioCodecToConfigurationBox = (codec, isQuickTime) => {
  switch (codec) {
    case "aac":
      return esds;
    case "mp3":
      return esds;
    case "opus":
      return dOps;
    case "vorbis":
      return esds;
    case "flac":
      return dfLa;
    case "ac3":
      return dac3;
    case "eac3":
      return dec3;
  }
  if (isQuickTime) {
    switch (codec) {
      case "pcm-s24":
        return wave;
      case "pcm-s24be":
        return wave;
      case "pcm-s32":
        return wave;
      case "pcm-s32be":
        return wave;
      case "pcm-f32":
        return wave;
      case "pcm-f32be":
        return wave;
      case "pcm-f64":
        return wave;
      case "pcm-f64be":
        return wave;
    }
  } else {
    switch (codec) {
      case "pcm-s16":
        return pcmC;
      case "pcm-s16be":
        return pcmC;
      case "pcm-s24":
        return pcmC;
      case "pcm-s24be":
        return pcmC;
      case "pcm-s32":
        return pcmC;
      case "pcm-s32be":
        return pcmC;
      case "pcm-f32":
        return pcmC;
      case "pcm-f32be":
        return pcmC;
      case "pcm-f64":
        return pcmC;
      case "pcm-f64be":
        return pcmC;
    }
  }
  return null;
};
var SUBTITLE_CODEC_TO_BOX_NAME = {
  webvtt: "wvtt"
};
var SUBTITLE_CODEC_TO_CONFIGURATION_BOX = {
  webvtt: vttC
};
var getLanguageCodeInt = (code) => {
  assert(code.length === 3);
  ;
  let language = 0;
  for (let i = 0; i < 3; i++) {
    language <<= 5;
    language += code.charCodeAt(i) - 96;
  }
  return language;
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/writer.js
var Writer = class {
  constructor(target, isMonotonic) {
    this.finalized = false;
    this.started = false;
    this.pos = 0;
    this.trackedWrites = null;
    this.trackedStart = -1;
    this.trackedEnd = -1;
    if (target._writerAcquired) {
      throw new Error("Can't have multiple Writers for the same Target.");
    }
    this.target = target;
    target._setMonotonicity(isMonotonic);
    target._writerAcquired = true;
  }
  start() {
    assert(!this.started);
    this.target._start();
    this.started = true;
  }
  /** Writes the given data to the target, at the current position. */
  write(data) {
    assert(this.started && !this.finalized);
    this.maybeTrackWrites(data);
    this.target._write(data, this.pos);
    this.pos += data.byteLength;
  }
  /** Sets the current position for future writes to a new one. */
  seek(newPos) {
    this.pos = newPos;
  }
  /** Returns the current position. */
  getPos() {
    return this.pos;
  }
  /** Signals to the writer that it may be time to flush. */
  async flush() {
    assert(this.started && !this.finalized);
    return this.target._flush();
  }
  /** Called after muxing has finished. */
  async finalize() {
    assert(this.started && !this.finalized);
    await this.target._finalize();
    this.finalized = true;
  }
  maybeTrackWrites(data) {
    if (!this.trackedWrites) {
      return;
    }
    let pos = this.getPos();
    if (pos < this.trackedStart) {
      if (pos + data.byteLength <= this.trackedStart) {
        return;
      }
      data = data.subarray(this.trackedStart - pos);
      pos = 0;
    }
    const neededSize = pos + data.byteLength - this.trackedStart;
    let newLength = this.trackedWrites.byteLength;
    while (newLength < neededSize) {
      newLength *= 2;
    }
    if (newLength !== this.trackedWrites.byteLength) {
      const copy = new Uint8Array(newLength);
      copy.set(this.trackedWrites, 0);
      this.trackedWrites = copy;
    }
    this.trackedWrites.set(data, pos - this.trackedStart);
    this.trackedEnd = Math.max(this.trackedEnd, pos + data.byteLength);
  }
  startTrackingWrites() {
    this.trackedWrites = new Uint8Array(2 ** 10);
    this.trackedStart = this.getPos();
    this.trackedEnd = this.trackedStart;
  }
  stopTrackingWrites() {
    if (!this.trackedWrites) {
      throw new Error("Internal error: Can't get tracked writes since nothing was tracked.");
    }
    const slice = this.trackedWrites.subarray(0, this.trackedEnd - this.trackedStart);
    const result = {
      data: slice,
      start: this.trackedStart,
      end: this.trackedEnd
    };
    this.trackedWrites = null;
    return result;
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/target.js
var Target = class extends EventEmitter {
  constructor() {
    super(...arguments);
    this._writerAcquired = false;
    this._monotonicity = null;
    this.onwrite = null;
  }
  /** @internal */
  _setMonotonicity(monotonicity) {
    if (this._monotonicity !== false) {
      this._monotonicity = monotonicity;
    } else {
    }
  }
  /** @internal */
  _dispatchWrite(start, end) {
    this.onwrite?.(start, end);
    this._emit("write", { start, end });
  }
  /**
   * Returns a new {@link RangedTarget} that writes data to this target using the given offset.
   *
   * Useful for writing a file into a section of a larger file.
   */
  slice(offset) {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new TypeError("offset must be a non-negative integer.");
    }
    return new RangedTarget(this, offset);
  }
};
var ARRAY_BUFFER_INITIAL_SIZE = 2 ** 16;
var ARRAY_BUFFER_MAX_SIZE = 2 ** 32;
var BufferTarget = class extends Target {
  /** Creates a new {@link BufferTarget}. The buffer holding the data will be created and managed internally. */
  constructor(options = {}) {
    super();
    this.buffer = null;
    this._maxPos = 0;
    if (!options || typeof options !== "object") {
      throw new TypeError("BufferTarget options, when provided, must be an object.");
    }
    if (options.onFinalize !== void 0 && typeof options.onFinalize !== "function") {
      throw new TypeError("options.onFinalize, when provided, must be a function.");
    }
    this._options = options;
    this._supportsResize = "resize" in new ArrayBuffer(0);
    if (this._supportsResize) {
      try {
        this._buffer = new ArrayBuffer(ARRAY_BUFFER_INITIAL_SIZE, { maxByteLength: ARRAY_BUFFER_MAX_SIZE });
      } catch {
        this._buffer = new ArrayBuffer(ARRAY_BUFFER_INITIAL_SIZE);
        this._supportsResize = false;
      }
    } else {
      this._buffer = new ArrayBuffer(ARRAY_BUFFER_INITIAL_SIZE);
    }
    this._bytes = new Uint8Array(this._buffer);
  }
  /** @internal */
  _ensureSize(size) {
    let newLength = this._buffer.byteLength;
    while (newLength < size)
      newLength *= 2;
    if (newLength === this._buffer.byteLength)
      return;
    if (newLength > ARRAY_BUFFER_MAX_SIZE) {
      throw new Error(`ArrayBuffer exceeded maximum size of ${ARRAY_BUFFER_MAX_SIZE} bytes. Please consider using another target.`);
    }
    if (this._supportsResize) {
      this._buffer.resize(newLength);
    } else {
      const newBuffer = new ArrayBuffer(newLength);
      const newBytes = new Uint8Array(newBuffer);
      newBytes.set(this._bytes, 0);
      this._buffer = newBuffer;
      this._bytes = newBytes;
    }
  }
  /** @internal */
  _start() {
  }
  /** @internal */
  _write(data, pos) {
    this._ensureSize(pos + data.byteLength);
    this._bytes.set(data, pos);
    this._maxPos = Math.max(this._maxPos, pos + data.byteLength);
    this._dispatchWrite(pos, pos + data.byteLength);
  }
  /** @internal */
  async _flush() {
  }
  /** @internal */
  async _finalize() {
    this.buffer = this._buffer.slice(0, this._maxPos);
    if (this._options.onFinalize) {
      await this._options.onFinalize(this.buffer);
    }
    this._emit("finalized");
  }
  /** @internal */
  async _close() {
  }
  /** @internal */
  _getSlice(start, end) {
    return this._bytes.slice(start, end);
  }
};
var DEFAULT_CHUNK_SIZE = 2 ** 24;
var NullTarget = class extends Target {
  /** @internal */
  _start() {
  }
  /** @internal */
  _write(data, pos) {
    this._dispatchWrite(pos, pos + data.byteLength);
  }
  /** @internal */
  async _flush() {
  }
  /** @internal */
  async _finalize() {
    this._emit("finalized");
  }
  /** @internal */
  async _close() {
  }
};
var RangedTarget = class extends Target {
  /** @internal */
  constructor(baseTarget, offset) {
    super();
    this._baseTarget = baseTarget;
    this._offset = offset;
  }
  /** @internal */
  _start() {
  }
  /** @internal */
  _write(data, pos) {
    this._baseTarget._write(data, this._offset + pos);
    this._dispatchWrite(pos, pos + data.byteLength);
  }
  /** @internal */
  _flush() {
    return this._baseTarget._flush();
  }
  /** @internal */
  async _finalize() {
    this._emit("finalized");
  }
  /** @internal */
  async _close() {
  }
  /** @internal */
  _setMonotonicity(monotonicity) {
    super._setMonotonicity(monotonicity);
    this._baseTarget._setMonotonicity(monotonicity);
  }
};
var PathedTarget = class {
  /** Creates a new {@link PathedTarget} from a root path and a callback. */
  constructor(rootPath, getTarget) {
    this.rootPath = rootPath;
    this.getTarget = getTarget;
    if (typeof rootPath !== "string") {
      throw new TypeError("rootPath must be a string.");
    }
    if (typeof getTarget !== "function") {
      throw new TypeError("getTarget must be a function.");
    }
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/isobmff/isobmff-muxer.js
var GLOBAL_TIMESCALE = 57600;
var TIMESTAMP_OFFSET = 2082844800;
var getTrackMetadata = (trackData) => {
  const metadata = {};
  const track = trackData.track;
  if (track.metadata.name !== void 0) {
    metadata.name = track.metadata.name;
  }
  return metadata;
};
var intoTimescale = (timeInSeconds, timescale, round = true) => {
  const value = timeInSeconds * timescale;
  return round ? Math.round(value) : value;
};
var IsobmffMuxer = class extends Muxer {
  constructor(output, format) {
    super(output);
    this.writer = null;
    this.boxWriter = null;
    this.initWriter = null;
    this.initBoxWriter = null;
    this.auxTarget = new BufferTarget();
    this.auxWriter = new Writer(this.auxTarget, false);
    this.auxBoxWriter = new IsobmffBoxWriter(this.auxWriter);
    this.mdat = null;
    this.ftypSize = null;
    this.trackDatas = [];
    this.allTracksKnown = promiseWithResolvers();
    this.creationTime = Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET;
    this.finalizedChunks = [];
    this.nextFragmentNumber = 1;
    this.maxWrittenTimestamp = -Infinity;
    this.minWrittenTimestamp = Infinity;
    this.maxWrittenEndTimestamp = -Infinity;
    this.segmentHeaderSize = null;
    this.format = format;
    this.isQuickTime = format instanceof MovOutputFormat;
    this.isCmaf = format instanceof CmafOutputFormat;
    this.minimumFragmentDuration = format._options.minimumFragmentDuration ?? (format instanceof CmafOutputFormat ? Infinity : 1);
  }
  async start() {
    const release = await this.mutex.acquire();
    if (!this.isCmaf) {
      this.writer = await this.output._getRootWriter((target) => this.format._options.fastStart !== void 0 ? this.format._options.fastStart === "fragmented" : target instanceof BufferTarget);
      this.boxWriter = new IsobmffBoxWriter(this.writer);
      this.fastStart = this.format._options.fastStart ?? (this.writer.target instanceof BufferTarget ? "in-memory" : false);
      this.isFragmented = this.fastStart === "fragmented";
    } else {
      this.fastStart = "fragmented";
      this.isFragmented = true;
    }
    if (this.isCmaf) {
      if (!this.output._hasInitTarget()) {
        throw new Error(`CMAF outputs require the initTarget field in OutputOptions to be set; the init segment will be written to it.`);
      }
      const initTarget = await this.output._getInitTarget();
      const initWriter = new Writer(initTarget, true);
      initWriter.start();
      this.initWriter = initWriter;
      this.initBoxWriter = new IsobmffBoxWriter(initWriter);
    }
    const holdsAvc = this.output._tracks.some((x) => x.isVideoTrack() && x.source._codec === "avc");
    {
      const boxWriter = this.initBoxWriter ?? this.boxWriter;
      assert(boxWriter);
      if (this.format._options.onFtyp) {
        boxWriter.writer.startTrackingWrites();
      }
      boxWriter.writeBox(ftyp({
        isQuickTime: this.isQuickTime,
        holdsAvc,
        fragmented: this.isFragmented,
        cmaf: this.isCmaf
      }));
      if (this.format._options.onFtyp) {
        const { data, start } = boxWriter.writer.stopTrackingWrites();
        this.format._options.onFtyp(data, start);
      }
      this.ftypSize = boxWriter.writer.getPos();
      if (this.isCmaf) {
        await this.initWriter.flush();
      }
    }
    if (this.fastStart === "in-memory") {
    } else if (this.fastStart === "reserve") {
      for (const track of this.output._tracks) {
        if (track.metadata.maximumPacketCount === void 0) {
          throw new Error("All tracks must specify maximumPacketCount in their metadata when using fastStart: 'reserve'.");
        }
      }
    } else if (this.isFragmented) {
    } else {
      assert(this.writer);
      assert(this.boxWriter);
      if (this.format._options.onMdat) {
        this.writer.startTrackingWrites();
      }
      this.mdat = mdat(true);
      this.boxWriter.writeBox(this.mdat);
    }
    await this.writer?.flush();
    release();
  }
  allTracksAreKnown() {
    for (const track of this.output._tracks) {
      if (!track.source._closed && !this.trackDatas.some((x) => x.track === track)) {
        return false;
      }
    }
    return true;
  }
  async getMimeType() {
    await this.allTracksKnown.promise;
    const codecStrings = this.trackDatas.map((trackData) => {
      if (trackData.type === "video") {
        return trackData.info.decoderConfig.codec;
      } else if (trackData.type === "audio") {
        return trackData.info.decoderConfig.codec;
      } else {
        const map = {
          webvtt: "wvtt"
        };
        return map[trackData.track.source._codec];
      }
    });
    return buildIsobmffMimeType({
      isQuickTime: this.isQuickTime,
      hasVideo: this.trackDatas.some((x) => x.type === "video"),
      hasAudio: this.trackDatas.some((x) => x.type === "audio"),
      codecStrings
    });
  }
  getVideoTrackData(track, packet, meta) {
    const existingTrackData = this.trackDatas.find((x) => x.track === track);
    if (existingTrackData) {
      return existingTrackData;
    }
    validateVideoChunkMetadata(meta);
    assert(meta);
    assert(meta.decoderConfig);
    const decoderConfig = { ...meta.decoderConfig };
    assert(decoderConfig.codedWidth !== void 0);
    assert(decoderConfig.codedHeight !== void 0);
    let requiresAnnexBTransformation = false;
    if (track.source._codec === "avc" && !decoderConfig.description) {
      const decoderConfigurationRecord = extractAvcDecoderConfigurationRecord(packet.data);
      if (!decoderConfigurationRecord) {
        throw new Error("Couldn't extract an AVCDecoderConfigurationRecord from the AVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.264) when not providing a description, or provide a description (must be an AVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in AVCC format.");
      }
      decoderConfig.description = serializeAvcDecoderConfigurationRecord(decoderConfigurationRecord);
      requiresAnnexBTransformation = true;
    } else if (track.source._codec === "hevc" && !decoderConfig.description) {
      const decoderConfigurationRecord = extractHevcDecoderConfigurationRecord(packet.data);
      if (!decoderConfigurationRecord) {
        throw new Error("Couldn't extract an HEVCDecoderConfigurationRecord from the HEVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.265) when not providing a description, or provide a description (must be an HEVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in HEVC format.");
      }
      decoderConfig.description = serializeHevcDecoderConfigurationRecord(decoderConfigurationRecord);
      requiresAnnexBTransformation = true;
    }
    const timescale = computeRationalApproximation(1 / (track.metadata.frameRate ?? GLOBAL_TIMESCALE), 1e6).den;
    const displayAspectWidth = decoderConfig.displayAspectWidth;
    const displayAspectHeight = decoderConfig.displayAspectHeight;
    const pixelAspectRatio = displayAspectWidth === void 0 || displayAspectHeight === void 0 ? { num: 1, den: 1 } : simplifyRational({
      num: displayAspectWidth * decoderConfig.codedHeight,
      den: displayAspectHeight * decoderConfig.codedWidth
    });
    const newTrackData = {
      muxer: this,
      track,
      type: "video",
      info: {
        width: decoderConfig.codedWidth,
        height: decoderConfig.codedHeight,
        pixelAspectRatio,
        decoderConfig,
        requiresAnnexBTransformation
      },
      timescale,
      samples: [],
      sampleQueue: [],
      timestampProcessingQueue: [],
      timeToSampleTable: [],
      compositionTimeOffsetTable: [],
      lastTimescaleUnits: null,
      lastSample: null,
      startTimestampOffset: null,
      finalizedChunks: [],
      currentChunk: null,
      compactlyCodedChunkTable: [],
      closed: false
    };
    this.trackDatas.push(newTrackData);
    this.trackDatas.sort((a, b) => a.track.id - b.track.id);
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
    return newTrackData;
  }
  getAudioTrackData(track, packet, meta) {
    const existingTrackData = this.trackDatas.find((x) => x.track === track);
    if (existingTrackData) {
      return existingTrackData;
    }
    validateAudioChunkMetadata(meta);
    assert(meta);
    assert(meta.decoderConfig);
    const decoderConfig = { ...meta.decoderConfig };
    let requiresAdtsStripping = false;
    if (track.source._codec === "aac" && !decoderConfig.description) {
      const adtsFrame = readAdtsFrameHeader(FileSlice.tempFromBytes(packet.data));
      if (!adtsFrame) {
        throw new Error("Couldn't parse ADTS header from the AAC packet. Make sure the packets are in ADTS format (as specified in ISO 13818-7) when not providing a description, or provide a description (must be an AudioSpecificConfig as specified in ISO 14496-3) and ensure the packets are raw AAC data.");
      }
      const sampleRate = aacFrequencyTable[adtsFrame.samplingFrequencyIndex];
      const numberOfChannels = aacChannelMap[adtsFrame.channelConfiguration];
      if (sampleRate === void 0 || numberOfChannels === void 0) {
        throw new Error("Invalid ADTS frame header.");
      }
      decoderConfig.description = buildAacAudioSpecificConfig({
        objectType: adtsFrame.objectType,
        sampleRate,
        numberOfChannels
      });
      requiresAdtsStripping = true;
    }
    const newTrackData = {
      muxer: this,
      track,
      type: "audio",
      info: {
        numberOfChannels: meta.decoderConfig.numberOfChannels,
        sampleRate: meta.decoderConfig.sampleRate,
        decoderConfig,
        requiresPcmTransformation: !this.isFragmented && PCM_AUDIO_CODECS.includes(track.source._codec),
        expectedNextPcmPacketTimestamp: null,
        requiresAdtsStripping,
        firstPacket: packet
      },
      timescale: decoderConfig.sampleRate,
      samples: [],
      sampleQueue: [],
      timestampProcessingQueue: [],
      timeToSampleTable: [],
      compositionTimeOffsetTable: [],
      lastTimescaleUnits: null,
      lastSample: null,
      startTimestampOffset: null,
      finalizedChunks: [],
      currentChunk: null,
      compactlyCodedChunkTable: [],
      closed: false
    };
    this.trackDatas.push(newTrackData);
    this.trackDatas.sort((a, b) => a.track.id - b.track.id);
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
    return newTrackData;
  }
  getSubtitleTrackData(track, meta) {
    const existingTrackData = this.trackDatas.find((x) => x.track === track);
    if (existingTrackData) {
      return existingTrackData;
    }
    validateSubtitleMetadata(meta);
    assert(meta);
    assert(meta.config);
    const newTrackData = {
      muxer: this,
      track,
      type: "subtitle",
      info: {
        config: meta.config
      },
      timescale: 1e3,
      // Reasonable
      samples: [],
      sampleQueue: [],
      timestampProcessingQueue: [],
      timeToSampleTable: [],
      compositionTimeOffsetTable: [],
      lastTimescaleUnits: null,
      lastSample: null,
      startTimestampOffset: null,
      finalizedChunks: [],
      currentChunk: null,
      compactlyCodedChunkTable: [],
      closed: false,
      lastCueEndTimestamp: 0,
      cueQueue: [],
      nextSourceId: 0,
      cueToSourceId: /* @__PURE__ */ new WeakMap()
    };
    this.trackDatas.push(newTrackData);
    this.trackDatas.sort((a, b) => a.track.id - b.track.id);
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
    return newTrackData;
  }
  async addEncodedVideoPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getVideoTrackData(track, packet, meta);
      let packetData = packet.data;
      if (trackData.info.requiresAnnexBTransformation) {
        const nalUnits = [...iterateNalUnitsInAnnexB(packetData)].map((loc) => packetData.subarray(loc.offset, loc.offset + loc.length));
        if (nalUnits.length === 0) {
          throw new Error("Failed to transform packet data. Make sure all packets are provided in Annex B format, as specified in ITU-T-REC-H.264 and ITU-T-REC-H.265.");
        }
        packetData = concatNalUnitsInLengthPrefixed(nalUnits, 4);
      }
      this.validateTimestamp(trackData.track, packet.timestamp, packet.type === "key");
      const internalSample = this.createSampleForTrack(trackData, packetData, packet.timestamp, packet.duration, packet.type);
      await this.registerSample(trackData, internalSample);
    } finally {
      release();
    }
  }
  async addEncodedAudioPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getAudioTrackData(track, packet, meta);
      let packetData = packet.data;
      if (trackData.info.requiresAdtsStripping) {
        const adtsFrame = readAdtsFrameHeader(FileSlice.tempFromBytes(packetData));
        if (!adtsFrame) {
          throw new Error("Expected ADTS frame, didn't get one.");
        }
        const headerLength = adtsFrame.crcCheck === null ? MIN_ADTS_FRAME_HEADER_SIZE : MAX_ADTS_FRAME_HEADER_SIZE;
        packetData = packetData.subarray(headerLength);
      }
      this.validateTimestamp(trackData.track, packet.timestamp, packet.type === "key");
      let timestamp = packet.timestamp;
      let duration = packet.duration;
      if (trackData.info.requiresPcmTransformation) {
        const pcmInfo = parsePcmCodec(trackData.info.decoderConfig.codec);
        const frameSize = pcmInfo.sampleSize * trackData.info.numberOfChannels;
        duration = packetData.byteLength / frameSize / trackData.info.sampleRate;
        if (trackData.info.expectedNextPcmPacketTimestamp !== null) {
          const diff = timestamp - trackData.info.expectedNextPcmPacketTimestamp;
          if (diff < 0.01) {
            timestamp = trackData.info.expectedNextPcmPacketTimestamp;
          } else {
            const paddedDuration = await this.padWithSilence(trackData, trackData.info.expectedNextPcmPacketTimestamp, diff);
            timestamp = trackData.info.expectedNextPcmPacketTimestamp + paddedDuration;
          }
        }
        trackData.info.expectedNextPcmPacketTimestamp = timestamp + duration;
      }
      const internalSample = this.createSampleForTrack(trackData, packetData, timestamp, duration, packet.type);
      await this.registerSample(trackData, internalSample);
    } finally {
      release();
    }
  }
  async padWithSilence(trackData, timestamp, duration) {
    const deltaInTimescale = intoTimescale(duration, trackData.timescale);
    duration = deltaInTimescale / trackData.timescale;
    if (deltaInTimescale > 0) {
      const { sampleSize, silentValue } = parsePcmCodec(trackData.info.decoderConfig.codec);
      const samplesNeeded = deltaInTimescale * trackData.info.numberOfChannels;
      const data = new Uint8Array(sampleSize * samplesNeeded).fill(silentValue);
      const paddingSample = this.createSampleForTrack(trackData, new Uint8Array(data.buffer), timestamp, duration, "key");
      await this.registerSample(trackData, paddingSample);
    }
    return duration;
  }
  async addSubtitleCue(track, cue, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getSubtitleTrackData(track, meta);
      this.validateTimestamp(trackData.track, cue.timestamp, true);
      if (track.source._codec === "webvtt") {
        trackData.cueQueue.push(cue);
        await this.processWebVTTCues(trackData, cue.timestamp);
      } else {
      }
    } finally {
      release();
    }
  }
  async processWebVTTCues(trackData, until) {
    while (trackData.cueQueue.length > 0) {
      const timestamps = /* @__PURE__ */ new Set([]);
      for (const cue of trackData.cueQueue) {
        assert(cue.timestamp <= until);
        assert(trackData.lastCueEndTimestamp <= cue.timestamp + cue.duration);
        timestamps.add(Math.max(cue.timestamp, trackData.lastCueEndTimestamp));
        timestamps.add(cue.timestamp + cue.duration);
      }
      const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
      const sampleStart = sortedTimestamps[0];
      const sampleEnd = sortedTimestamps[1] ?? sampleStart;
      if (until < sampleEnd) {
        break;
      }
      if (trackData.lastCueEndTimestamp < sampleStart) {
        this.auxWriter.seek(0);
        const box2 = vtte();
        this.auxBoxWriter.writeBox(box2);
        const body2 = this.auxTarget._getSlice(0, this.auxWriter.getPos());
        const sample2 = this.createSampleForTrack(trackData, body2, trackData.lastCueEndTimestamp, sampleStart - trackData.lastCueEndTimestamp, "key");
        await this.registerSample(trackData, sample2);
        trackData.lastCueEndTimestamp = sampleStart;
      }
      this.auxWriter.seek(0);
      for (let i = 0; i < trackData.cueQueue.length; i++) {
        const cue = trackData.cueQueue[i];
        if (cue.timestamp >= sampleEnd) {
          break;
        }
        inlineTimestampRegex.lastIndex = 0;
        const containsTimestamp = inlineTimestampRegex.test(cue.text);
        const endTimestamp = cue.timestamp + cue.duration;
        let sourceId = trackData.cueToSourceId.get(cue);
        if (sourceId === void 0 && sampleEnd < endTimestamp) {
          sourceId = trackData.nextSourceId++;
          trackData.cueToSourceId.set(cue, sourceId);
        }
        if (cue.notes) {
          const box3 = vtta(cue.notes);
          this.auxBoxWriter.writeBox(box3);
        }
        const box2 = vttc(cue.text, containsTimestamp ? sampleStart : null, cue.identifier ?? null, cue.settings ?? null, sourceId ?? null);
        this.auxBoxWriter.writeBox(box2);
        if (endTimestamp === sampleEnd) {
          trackData.cueQueue.splice(i--, 1);
        }
      }
      const body = this.auxTarget._getSlice(0, this.auxWriter.getPos());
      const sample = this.createSampleForTrack(trackData, body, sampleStart, sampleEnd - sampleStart, "key");
      await this.registerSample(trackData, sample);
      trackData.lastCueEndTimestamp = sampleEnd;
    }
  }
  createSampleForTrack(trackData, data, timestamp, duration, type) {
    const sample = {
      timestamp,
      decodeTimestamp: timestamp,
      // This may be refined later
      duration,
      data,
      size: data.byteLength,
      type,
      timescaleUnitsToNextSample: intoTimescale(duration, trackData.timescale)
      // Will be refined
    };
    return sample;
  }
  processTimestamps(trackData, nextSample) {
    if (trackData.timestampProcessingQueue.length === 0) {
      return;
    }
    if (trackData.type === "audio" && trackData.info.requiresPcmTransformation) {
      if (!this.isFragmented) {
        trackData.startTimestampOffset ??= trackData.timestampProcessingQueue[0].timestamp;
      }
      let totalDuration = 0;
      for (let i = 0; i < trackData.timestampProcessingQueue.length; i++) {
        const sample = trackData.timestampProcessingQueue[i];
        const duration = intoTimescale(sample.duration, trackData.timescale);
        totalDuration += duration;
      }
      if (trackData.timeToSampleTable.length === 0) {
        trackData.timeToSampleTable.push({
          sampleCount: totalDuration,
          sampleDelta: 1
        });
      } else {
        const lastEntry = last(trackData.timeToSampleTable);
        lastEntry.sampleCount += totalDuration;
      }
      trackData.timestampProcessingQueue.length = 0;
      return;
    }
    const sortedTimestamps = trackData.timestampProcessingQueue.map((x) => x.timestamp).sort((a, b) => a - b);
    if (!this.isFragmented) {
      trackData.startTimestampOffset ??= sortedTimestamps[0];
    }
    for (let i = 0; i < trackData.timestampProcessingQueue.length; i++) {
      const sample = trackData.timestampProcessingQueue[i];
      sample.decodeTimestamp = sortedTimestamps[i];
      const sampleCompositionTimeOffset = intoTimescale(sample.timestamp - sample.decodeTimestamp, trackData.timescale);
      const durationInTimescale = intoTimescale(sample.duration, trackData.timescale);
      if (trackData.lastTimescaleUnits !== null) {
        assert(trackData.lastSample);
        const timescaleUnits = intoTimescale(sample.decodeTimestamp, trackData.timescale, false);
        const delta = Math.round(timescaleUnits - trackData.lastTimescaleUnits);
        assert(delta >= 0);
        trackData.lastTimescaleUnits += delta;
        trackData.lastSample.timescaleUnitsToNextSample = delta;
        if (!this.isFragmented) {
          let lastTableEntry = last(trackData.timeToSampleTable);
          assert(lastTableEntry);
          if (lastTableEntry.sampleCount === 1) {
            lastTableEntry.sampleDelta = delta;
            const entryBefore = trackData.timeToSampleTable[trackData.timeToSampleTable.length - 2];
            if (entryBefore && entryBefore.sampleDelta === delta) {
              entryBefore.sampleCount++;
              trackData.timeToSampleTable.pop();
              lastTableEntry = entryBefore;
            }
          } else if (lastTableEntry.sampleDelta !== delta) {
            lastTableEntry.sampleCount--;
            trackData.timeToSampleTable.push(lastTableEntry = {
              sampleCount: 1,
              sampleDelta: delta
            });
          }
          if (lastTableEntry.sampleDelta === durationInTimescale) {
            lastTableEntry.sampleCount++;
          } else {
            trackData.timeToSampleTable.push({
              sampleCount: 1,
              sampleDelta: durationInTimescale
            });
          }
          const lastCompositionTimeOffsetTableEntry = last(trackData.compositionTimeOffsetTable);
          assert(lastCompositionTimeOffsetTableEntry);
          if (lastCompositionTimeOffsetTableEntry.sampleCompositionTimeOffset === sampleCompositionTimeOffset) {
            lastCompositionTimeOffsetTableEntry.sampleCount++;
          } else {
            trackData.compositionTimeOffsetTable.push({
              sampleCount: 1,
              sampleCompositionTimeOffset
            });
          }
        }
      } else {
        trackData.lastTimescaleUnits = intoTimescale(sample.decodeTimestamp, trackData.timescale, false);
        if (!this.isFragmented) {
          trackData.timeToSampleTable.push({
            sampleCount: 1,
            sampleDelta: durationInTimescale
          });
          trackData.compositionTimeOffsetTable.push({
            sampleCount: 1,
            sampleCompositionTimeOffset
          });
        }
      }
      trackData.lastSample = sample;
    }
    trackData.timestampProcessingQueue.length = 0;
    assert(trackData.lastSample);
    assert(trackData.lastTimescaleUnits !== null);
    if (nextSample !== void 0 && trackData.lastSample.timescaleUnitsToNextSample === 0) {
      assert(nextSample.type === "key");
      const timescaleUnits = intoTimescale(nextSample.timestamp, trackData.timescale, false);
      const delta = Math.round(timescaleUnits - trackData.lastTimescaleUnits);
      trackData.lastSample.timescaleUnitsToNextSample = delta;
    }
  }
  async registerSample(trackData, sample) {
    if (sample.type === "key") {
      this.processTimestamps(trackData, sample);
    }
    trackData.timestampProcessingQueue.push(sample);
    if (this.isFragmented) {
      trackData.sampleQueue.push(sample);
      await this.interleaveSamples();
    } else if (this.fastStart === "reserve") {
      await this.registerSampleFastStartReserve(trackData, sample);
    } else {
      await this.addSampleToTrack(trackData, sample);
    }
  }
  async addSampleToTrack(trackData, sample) {
    if (!this.isFragmented) {
      trackData.samples.push(sample);
      if (this.fastStart === "reserve") {
        const maximumPacketCount = trackData.track.metadata.maximumPacketCount;
        assert(maximumPacketCount !== void 0);
        if (trackData.samples.length > maximumPacketCount) {
          throw new Error(`Track #${trackData.track.id} has already reached the maximum packet count (${maximumPacketCount}). Either add less packets or increase the maximum packet count.`);
        }
      }
    }
    let beginNewChunk = false;
    if (!trackData.currentChunk) {
      beginNewChunk = true;
    } else {
      trackData.currentChunk.startTimestamp = Math.min(trackData.currentChunk.startTimestamp, sample.timestamp);
      const currentChunkDuration = sample.timestamp - trackData.currentChunk.startTimestamp;
      if (this.isFragmented) {
        const keyFrameQueuedEverywhere = this.trackDatas.every((otherTrackData) => {
          if (trackData === otherTrackData) {
            return sample.type === "key";
          }
          const firstQueuedSample = otherTrackData.sampleQueue[0];
          if (firstQueuedSample) {
            return firstQueuedSample.type === "key";
          }
          return otherTrackData.closed;
        });
        if (currentChunkDuration >= this.minimumFragmentDuration && keyFrameQueuedEverywhere && sample.timestamp > this.maxWrittenTimestamp) {
          beginNewChunk = true;
          await this.finalizeFragment();
        }
      } else {
        beginNewChunk = currentChunkDuration >= 0.5;
      }
    }
    if (beginNewChunk) {
      if (trackData.currentChunk) {
        await this.finalizeCurrentChunk(trackData);
      }
      trackData.currentChunk = {
        startTimestamp: sample.timestamp,
        samples: [],
        offset: null,
        moofOffset: null
      };
    }
    assert(trackData.currentChunk);
    trackData.currentChunk.samples.push(sample);
    if (this.isFragmented) {
      this.maxWrittenTimestamp = Math.max(this.maxWrittenTimestamp, sample.timestamp);
      this.maxWrittenEndTimestamp = Math.max(this.maxWrittenEndTimestamp, sample.timestamp + sample.duration);
      this.minWrittenTimestamp = Math.min(this.minWrittenTimestamp, sample.timestamp);
    }
  }
  async finalizeCurrentChunk(trackData) {
    assert(!this.isFragmented);
    assert(this.writer);
    if (!trackData.currentChunk)
      return;
    trackData.finalizedChunks.push(trackData.currentChunk);
    this.finalizedChunks.push(trackData.currentChunk);
    let sampleCount = trackData.currentChunk.samples.length;
    if (trackData.type === "audio" && trackData.info.requiresPcmTransformation) {
      sampleCount = trackData.currentChunk.samples.reduce((acc, sample) => acc + intoTimescale(sample.duration, trackData.timescale), 0);
    }
    if (trackData.compactlyCodedChunkTable.length === 0 || last(trackData.compactlyCodedChunkTable).samplesPerChunk !== sampleCount) {
      trackData.compactlyCodedChunkTable.push({
        firstChunk: trackData.finalizedChunks.length,
        // 1-indexed
        samplesPerChunk: sampleCount
      });
    }
    if (this.fastStart === "in-memory") {
      trackData.currentChunk.offset = 0;
      return;
    }
    trackData.currentChunk.offset = this.writer.getPos();
    for (const sample of trackData.currentChunk.samples) {
      assert(sample.data);
      this.writer.write(sample.data);
      sample.data = null;
    }
    await this.writer.flush();
  }
  async interleaveSamples(isFinalCall = false) {
    assert(this.isFragmented);
    if (!isFinalCall && !this.allTracksAreKnown()) {
      return;
    }
    outer: while (true) {
      let trackWithMinTimestamp = null;
      let minTimestamp = Infinity;
      for (const trackData of this.trackDatas) {
        if (!isFinalCall && trackData.sampleQueue.length === 0 && !trackData.closed) {
          break outer;
        }
        if (trackData.sampleQueue.length > 0 && trackData.sampleQueue[0].timestamp < minTimestamp) {
          trackWithMinTimestamp = trackData;
          minTimestamp = trackData.sampleQueue[0].timestamp;
        }
      }
      if (!trackWithMinTimestamp) {
        break;
      }
      const sample = trackWithMinTimestamp.sampleQueue.shift();
      await this.addSampleToTrack(trackWithMinTimestamp, sample);
    }
  }
  async finalizeFragment(flushWriter = !this.isCmaf) {
    assert(this.isFragmented);
    const fragmentNumber = this.nextFragmentNumber++;
    if (fragmentNumber === 1) {
      const boxWriter = this.initBoxWriter ?? this.boxWriter;
      assert(boxWriter);
      if (this.format._options.onMoov) {
        boxWriter.writer.startTrackingWrites();
      }
      const movieBox = moov(this);
      boxWriter.writeBox(movieBox);
      if (this.format._options.onMoov) {
        const { data, start } = boxWriter.writer.stopTrackingWrites();
        this.format._options.onMoov(data, start);
      }
      if (this.isCmaf) {
        assert(this.initWriter);
        await this.initWriter.flush();
        await this.initWriter.finalize();
        this.writer = await this.output._getRootWriter(true);
        this.boxWriter = new IsobmffBoxWriter(this.writer);
        const stypSize = this.boxWriter.measureBox(styp());
        const sidxSize = this.boxWriter.measureBox(sidx(this, 0));
        this.segmentHeaderSize = stypSize + sidxSize;
        this.writer.seek(this.segmentHeaderSize);
      }
    }
    assert(this.writer);
    assert(this.boxWriter);
    const tracksInFragment = this.trackDatas.filter((x) => x.currentChunk);
    const moofBox = moof(fragmentNumber, tracksInFragment);
    const moofOffset = this.writer.getPos();
    const mdatStartPos = moofOffset + this.boxWriter.measureBox(moofBox);
    let currentPos = mdatStartPos + MIN_BOX_HEADER_SIZE;
    let fragmentStartTimestamp = Infinity;
    for (const trackData of tracksInFragment) {
      trackData.currentChunk.offset = currentPos;
      trackData.currentChunk.moofOffset = moofOffset;
      for (const sample of trackData.currentChunk.samples) {
        currentPos += sample.size;
      }
      fragmentStartTimestamp = Math.min(fragmentStartTimestamp, trackData.currentChunk.startTimestamp);
    }
    const mdatSize = currentPos - mdatStartPos;
    const needsLargeMdatSize = mdatSize >= 2 ** 32;
    if (needsLargeMdatSize) {
      for (const trackData of tracksInFragment) {
        trackData.currentChunk.offset += MAX_BOX_HEADER_SIZE - MIN_BOX_HEADER_SIZE;
      }
    }
    if (this.format._options.onMoof) {
      this.writer.startTrackingWrites();
    }
    const newMoofBox = moof(fragmentNumber, tracksInFragment);
    this.boxWriter.writeBox(newMoofBox);
    if (this.format._options.onMoof) {
      const { data, start } = this.writer.stopTrackingWrites();
      this.format._options.onMoof(data, start, fragmentStartTimestamp);
    }
    assert(this.writer.getPos() === mdatStartPos);
    if (this.format._options.onMdat) {
      this.writer.startTrackingWrites();
    }
    const mdatBox = mdat(needsLargeMdatSize);
    mdatBox.size = mdatSize;
    this.boxWriter.writeBox(mdatBox);
    this.writer.seek(mdatStartPos + (needsLargeMdatSize ? MAX_BOX_HEADER_SIZE : MIN_BOX_HEADER_SIZE));
    for (const trackData of tracksInFragment) {
      for (const sample of trackData.currentChunk.samples) {
        this.writer.write(sample.data);
        sample.data = null;
      }
    }
    if (this.format._options.onMdat) {
      const { data, start } = this.writer.stopTrackingWrites();
      this.format._options.onMdat(data, start);
    }
    for (const trackData of tracksInFragment) {
      trackData.finalizedChunks.push(trackData.currentChunk);
      this.finalizedChunks.push(trackData.currentChunk);
      trackData.currentChunk = null;
    }
    if (flushWriter) {
      await this.writer.flush();
    }
  }
  async registerSampleFastStartReserve(trackData, sample) {
    assert(this.writer);
    assert(this.boxWriter);
    if (this.allTracksAreKnown()) {
      if (!this.mdat) {
        const moovBox = moov(this);
        const moovSize = this.boxWriter.measureBox(moovBox);
        const reservedSize = moovSize + this.computeSampleTableSizeUpperBound() + 4096;
        assert(this.ftypSize !== null);
        this.writer.seek(this.ftypSize + reservedSize);
        if (this.format._options.onMdat) {
          this.writer.startTrackingWrites();
        }
        this.mdat = mdat(true);
        this.boxWriter.writeBox(this.mdat);
        for (const trackData2 of this.trackDatas) {
          for (const sample2 of trackData2.sampleQueue) {
            await this.addSampleToTrack(trackData2, sample2);
          }
          trackData2.sampleQueue.length = 0;
        }
      }
      await this.addSampleToTrack(trackData, sample);
    } else {
      trackData.sampleQueue.push(sample);
    }
  }
  computeSampleTableSizeUpperBound() {
    assert(this.fastStart === "reserve");
    let upperBound = 0;
    for (const trackData of this.trackDatas) {
      const n = trackData.track.metadata.maximumPacketCount;
      assert(n !== void 0);
      upperBound += (4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += 4 * n;
      upperBound += (4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += (4 + 4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += 4 * n;
      upperBound += 8 * n;
    }
    return upperBound;
  }
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async onTrackClose(track) {
    const release = await this.mutex.acquire();
    const trackData = this.trackDatas.find((x) => x.track === track);
    if (trackData) {
      trackData.closed = true;
      if (trackData.type === "subtitle" && track.source._codec === "webvtt") {
        await this.processWebVTTCues(trackData, Infinity);
      }
      this.processTimestamps(trackData);
    }
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
    if (this.isFragmented) {
      await this.interleaveSamples();
    }
    release();
  }
  /** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
  async finalize() {
    const release = await this.mutex.acquire();
    this.allTracksKnown.resolve();
    for (const trackData of this.trackDatas) {
      trackData.closed = true;
      if (trackData.type === "subtitle" && trackData.track.source._codec === "webvtt") {
        await this.processWebVTTCues(trackData, Infinity);
      }
      this.processTimestamps(trackData);
    }
    if (this.isFragmented) {
      await this.interleaveSamples(true);
      await this.finalizeFragment(false);
    } else {
      for (const trackData of this.trackDatas) {
        await this.finalizeCurrentChunk(trackData);
        assert(trackData.startTimestampOffset !== null);
        for (let i = 0; i < trackData.samples.length; i++) {
          const sample = trackData.samples[i];
          sample.timestamp -= trackData.startTimestampOffset;
          sample.decodeTimestamp -= trackData.startTimestampOffset;
        }
      }
    }
    assert(this.writer);
    assert(this.boxWriter);
    if (this.fastStart === "in-memory") {
      this.mdat = mdat(false);
      let mdatSize;
      for (let i = 0; i < 2; i++) {
        const movieBox2 = moov(this);
        const movieBoxSize = this.boxWriter.measureBox(movieBox2);
        mdatSize = this.boxWriter.measureBox(this.mdat);
        let currentChunkPos = this.writer.getPos() + movieBoxSize + mdatSize;
        for (const chunk of this.finalizedChunks) {
          chunk.offset = currentChunkPos;
          for (const { data } of chunk.samples) {
            assert(data);
            currentChunkPos += data.byteLength;
            mdatSize += data.byteLength;
          }
        }
        if (currentChunkPos < 2 ** 32)
          break;
        if (mdatSize >= 2 ** 32)
          this.mdat.largeSize = true;
      }
      if (this.format._options.onMoov) {
        this.writer.startTrackingWrites();
      }
      const movieBox = moov(this);
      this.boxWriter.writeBox(movieBox);
      if (this.format._options.onMoov) {
        const { data, start } = this.writer.stopTrackingWrites();
        this.format._options.onMoov(data, start);
      }
      if (this.format._options.onMdat) {
        this.writer.startTrackingWrites();
      }
      this.mdat.size = mdatSize;
      this.boxWriter.writeBox(this.mdat);
      for (const chunk of this.finalizedChunks) {
        for (const sample of chunk.samples) {
          assert(sample.data);
          this.writer.write(sample.data);
          sample.data = null;
        }
      }
      if (this.format._options.onMdat) {
        const { data, start } = this.writer.stopTrackingWrites();
        this.format._options.onMdat(data, start);
      }
    } else if (this.isFragmented) {
      if (this.isCmaf) {
        const contentSize = this.segmentHeaderSize !== null ? this.writer.getPos() - this.segmentHeaderSize : 0;
        this.writer.seek(0);
        this.boxWriter.writeBox(styp());
        this.boxWriter.writeBox(sidx(this, contentSize));
      } else {
        const startPos = this.writer.getPos();
        const mfraBox = mfra(this.trackDatas);
        this.boxWriter.writeBox(mfraBox);
        const mfraBoxSize = this.writer.getPos() - startPos;
        this.writer.seek(this.writer.getPos() - 4);
        this.boxWriter.writeU32(mfraBoxSize);
      }
    } else {
      assert(this.mdat);
      const mdatPos = this.boxWriter.offsets.get(this.mdat);
      assert(mdatPos !== void 0);
      const mdatSize = this.writer.getPos() - mdatPos;
      this.mdat.size = mdatSize;
      this.mdat.largeSize = mdatSize >= 2 ** 32;
      this.boxWriter.patchBox(this.mdat);
      if (this.format._options.onMdat) {
        const { data, start } = this.writer.stopTrackingWrites();
        this.format._options.onMdat(data, start);
      }
      const movieBox = moov(this);
      if (this.fastStart === "reserve") {
        assert(this.ftypSize !== null);
        this.writer.seek(this.ftypSize);
        if (this.format._options.onMoov) {
          this.writer.startTrackingWrites();
        }
        this.boxWriter.writeBox(movieBox);
        const remainingSpace = this.boxWriter.offsets.get(this.mdat) - this.writer.getPos();
        this.boxWriter.writeBox(free(remainingSpace));
      } else {
        if (this.format._options.onMoov) {
          this.writer.startTrackingWrites();
        }
        this.boxWriter.writeBox(movieBox);
      }
      if (this.format._options.onMoov) {
        const { data, start } = this.writer.stopTrackingWrites();
        this.format._options.onMoov(data, start);
      }
    }
    release();
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/mpeg-ts/mpeg-ts-muxer.js
var PAT_PID = 0;
var PMT_PID = 4096;
var FIRST_TRACK_PID = 256;
var VIDEO_STREAM_ID_BASE = 224;
var AUDIO_STREAM_ID_BASE = 192;
var AVC_AUD_NAL = new Uint8Array([9, 240]);
var HEVC_AUD_NAL = new Uint8Array([70, 1]);
var MpegTsMuxer = class extends Muxer {
  constructor(output, format) {
    super(output);
    this.trackDatas = [];
    this.tablesWritten = false;
    this.continuityCounters = /* @__PURE__ */ new Map();
    this.packetBuffer = new Uint8Array(TS_PACKET_SIZE);
    this.packetView = toDataView(this.packetBuffer);
    this.allTracksKnown = promiseWithResolvers();
    this.videoTrackIndex = 0;
    this.audioTrackIndex = 0;
    this.adaptationFieldBuffer = new Uint8Array(184);
    this.payloadBuffer = new Uint8Array(184);
    this.format = format;
  }
  async start() {
    const release = await this.mutex.acquire();
    this.writer = await this.output._getRootWriter(true);
    release();
  }
  async getMimeType() {
    await this.allTracksKnown.promise;
    return buildMpegTsMimeType(this.trackDatas.map((x) => x.codecString));
  }
  getVideoTrackData(track, meta) {
    const existingTrackData = this.trackDatas.find((x) => x.track === track);
    if (existingTrackData) {
      return existingTrackData;
    }
    validateVideoChunkMetadata(meta);
    assert(meta?.decoderConfig);
    const codec = track.source._codec;
    assert(codec === "avc" || codec === "hevc");
    const streamType = codec === "avc" ? 27 : 36;
    const pid = FIRST_TRACK_PID + this.trackDatas.length;
    const streamId = VIDEO_STREAM_ID_BASE + this.videoTrackIndex++;
    const newTrackData = {
      track,
      pid,
      streamType,
      streamId,
      codecString: meta.decoderConfig.codec,
      timestampProcessingQueue: [],
      packetQueue: [],
      inputIsAnnexB: null,
      inputIsAdts: null,
      avcDecoderConfig: null,
      hevcDecoderConfig: null,
      adtsHeader: null,
      adtsHeaderBitstream: null,
      firstPacketWritten: false,
      closed: false
    };
    this.trackDatas.push(newTrackData);
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
    return newTrackData;
  }
  getAudioTrackData(track, meta) {
    const existingTrackData = this.trackDatas.find((x) => x.track === track);
    if (existingTrackData) {
      return existingTrackData;
    }
    validateAudioChunkMetadata(meta);
    assert(meta?.decoderConfig);
    const codec = track.source._codec;
    assert(codec === "aac" || codec === "mp3" || codec === "ac3" || codec === "eac3");
    let streamType;
    let streamId;
    switch (codec) {
      case "aac":
        {
          streamType = 15;
          streamId = AUDIO_STREAM_ID_BASE + this.audioTrackIndex++;
        }
        ;
        break;
      case "mp3":
        {
          streamType = 3;
          streamId = AUDIO_STREAM_ID_BASE + this.audioTrackIndex++;
        }
        ;
        break;
      case "ac3":
        {
          streamType = 129;
          streamId = 189;
        }
        ;
        break;
      case "eac3":
        {
          streamType = 135;
          streamId = 189;
        }
        ;
        break;
    }
    const pid = FIRST_TRACK_PID + this.trackDatas.length;
    const newTrackData = {
      track,
      pid,
      streamType,
      streamId,
      codecString: meta.decoderConfig.codec,
      timestampProcessingQueue: [],
      packetQueue: [],
      inputIsAnnexB: null,
      inputIsAdts: null,
      avcDecoderConfig: null,
      hevcDecoderConfig: null,
      adtsHeader: null,
      adtsHeaderBitstream: null,
      firstPacketWritten: false,
      closed: false
    };
    this.trackDatas.push(newTrackData);
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
    return newTrackData;
  }
  async addEncodedVideoPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getVideoTrackData(track, meta);
      this.validateTimestamp(trackData.track, packet.timestamp, packet.type === "key");
      const preparedData = this.prepareVideoPacket(trackData, packet, meta);
      if (packet.type === "key") {
        await this.flushTimestampQueue(trackData);
      }
      trackData.timestampProcessingQueue.push({
        data: preparedData,
        presentationTimestamp: packet.timestamp,
        decodeTimestamp: null,
        isKeyframe: packet.type === "key"
      });
    } finally {
      release();
    }
  }
  async addEncodedAudioPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getAudioTrackData(track, meta);
      this.validateTimestamp(trackData.track, packet.timestamp, packet.type === "key");
      const preparedData = this.prepareAudioPacket(trackData, packet, meta);
      if (packet.type === "key") {
        await this.flushTimestampQueue(trackData);
      }
      trackData.timestampProcessingQueue.push({
        data: preparedData,
        presentationTimestamp: packet.timestamp,
        decodeTimestamp: null,
        isKeyframe: packet.type === "key"
      });
    } finally {
      release();
    }
  }
  async addSubtitleCue() {
    throw new Error("MPEG-TS does not support subtitles.");
  }
  prepareVideoPacket(trackData, packet, meta) {
    const codec = trackData.track.source._codec;
    if (trackData.inputIsAnnexB === null) {
      const description = meta?.decoderConfig?.description;
      trackData.inputIsAnnexB = !description;
      if (!trackData.inputIsAnnexB) {
        const bytes2 = toUint8Array(description);
        if (codec === "avc") {
          trackData.avcDecoderConfig = deserializeAvcDecoderConfigurationRecord(bytes2);
        } else {
          trackData.hevcDecoderConfig = deserializeHevcDecoderConfigurationRecord(bytes2);
        }
      }
    }
    if (trackData.inputIsAnnexB) {
      return this.prepareAnnexBVideoPacket(packet.data, codec);
    } else {
      return this.prepareLengthPrefixedVideoPacket(trackData, packet, codec);
    }
  }
  prepareAnnexBVideoPacket(data, codec) {
    const nalUnits = [];
    for (const loc of iterateNalUnitsInAnnexB(data)) {
      const nalUnit = data.subarray(loc.offset, loc.offset + loc.length);
      const isAud = codec === "avc" ? extractNalUnitTypeForAvc(nalUnit[0]) === AvcNalUnitType.AUD : extractNalUnitTypeForHevc(nalUnit[0]) === HevcNalUnitType.AUD_NUT;
      if (!isAud) {
        nalUnits.push(nalUnit);
      }
    }
    const aud = codec === "avc" ? AVC_AUD_NAL : HEVC_AUD_NAL;
    nalUnits.unshift(aud);
    return concatNalUnitsInAnnexB(nalUnits);
  }
  prepareLengthPrefixedVideoPacket(trackData, packet, codec) {
    const data = packet.data;
    const lengthSize = codec === "avc" ? trackData.avcDecoderConfig.lengthSizeMinusOne + 1 : trackData.hevcDecoderConfig.lengthSizeMinusOne + 1;
    const nalUnits = [];
    for (const loc of iterateNalUnitsInLengthPrefixed(data, lengthSize)) {
      const nalUnit = data.subarray(loc.offset, loc.offset + loc.length);
      const isAud = codec === "avc" ? extractNalUnitTypeForAvc(nalUnit[0]) === AvcNalUnitType.AUD : extractNalUnitTypeForHevc(nalUnit[0]) === HevcNalUnitType.AUD_NUT;
      if (!isAud) {
        nalUnits.push(nalUnit);
      }
    }
    if (packet.type === "key") {
      if (codec === "avc") {
        const config = trackData.avcDecoderConfig;
        for (const pps of config.pictureParameterSets) {
          nalUnits.unshift(pps);
        }
        for (const sps of config.sequenceParameterSets) {
          nalUnits.unshift(sps);
        }
      } else {
        const config = trackData.hevcDecoderConfig;
        for (const arr of config.arrays) {
          if (arr.nalUnitType === HevcNalUnitType.PPS_NUT) {
            for (const nal of arr.nalUnits) {
              nalUnits.unshift(nal);
            }
          }
        }
        for (const arr of config.arrays) {
          if (arr.nalUnitType === HevcNalUnitType.SPS_NUT) {
            for (const nal of arr.nalUnits) {
              nalUnits.unshift(nal);
            }
          }
        }
        for (const arr of config.arrays) {
          if (arr.nalUnitType === HevcNalUnitType.VPS_NUT) {
            for (const nal of arr.nalUnits) {
              nalUnits.unshift(nal);
            }
          }
        }
      }
    }
    const aud = codec === "avc" ? AVC_AUD_NAL : HEVC_AUD_NAL;
    nalUnits.unshift(aud);
    return concatNalUnitsInAnnexB(nalUnits);
  }
  prepareAudioPacket(trackData, packet, meta) {
    const codec = trackData.track.source._codec;
    if (codec === "mp3" || codec === "ac3" || codec === "eac3") {
      return packet.data;
    }
    if (trackData.inputIsAdts === null) {
      const description = meta?.decoderConfig?.description;
      trackData.inputIsAdts = !description;
      if (!trackData.inputIsAdts) {
        const config = parseAacAudioSpecificConfig(toUint8Array(description));
        const template = buildAdtsHeaderTemplate(config);
        trackData.adtsHeader = template.header;
        trackData.adtsHeaderBitstream = template.bitstream;
      }
    }
    if (trackData.inputIsAdts) {
      return packet.data;
    }
    assert(trackData.adtsHeader);
    assert(trackData.adtsHeaderBitstream);
    const header = trackData.adtsHeader;
    const frameLength = packet.data.byteLength + header.byteLength;
    writeAdtsFrameLength(trackData.adtsHeaderBitstream, frameLength);
    const result = new Uint8Array(frameLength);
    result.set(header, 0);
    result.set(packet.data, header.byteLength);
    return result;
  }
  allTracksAreKnown() {
    for (const track of this.output._tracks) {
      if (!track.source._closed && !this.trackDatas.some((x) => x.track === track)) {
        return false;
      }
    }
    return true;
  }
  async flushTimestampQueue(trackData, alsoInterleave = true) {
    if (trackData.timestampProcessingQueue.length === 0) {
      return;
    }
    const sortedTimestamps = trackData.timestampProcessingQueue.map((packet) => packet.presentationTimestamp).sort((a, b) => a - b);
    for (let i = 0; i < trackData.timestampProcessingQueue.length; i++) {
      const queuedPacket = trackData.timestampProcessingQueue[i];
      queuedPacket.decodeTimestamp = sortedTimestamps[i];
      trackData.packetQueue.push(queuedPacket);
    }
    trackData.timestampProcessingQueue.length = 0;
    if (alsoInterleave) {
      await this.interleavePackets();
    }
  }
  async interleavePackets(isFinalCall = false) {
    if (!this.tablesWritten) {
      if (!this.allTracksAreKnown() && !isFinalCall) {
        return;
      }
      this.writeTables();
    }
    outer: while (true) {
      let trackWithMinTimestamp = null;
      let minTimestamp = Infinity;
      for (const trackData of this.trackDatas) {
        if (!isFinalCall && trackData.packetQueue.length === 0 && !trackData.closed) {
          break outer;
        }
        if (trackData.packetQueue.length > 0 && trackData.packetQueue[0].presentationTimestamp < minTimestamp) {
          trackWithMinTimestamp = trackData;
          minTimestamp = trackData.packetQueue[0].presentationTimestamp;
        }
      }
      if (!trackWithMinTimestamp) {
        break;
      }
      const queuedPacket = trackWithMinTimestamp.packetQueue.shift();
      this.writePesPacket(trackWithMinTimestamp, queuedPacket);
    }
    if (!isFinalCall) {
      await this.writer.flush();
    }
  }
  writeTables() {
    assert(!this.tablesWritten);
    this.writePsiSection(PAT_PID, PAT_SECTION);
    this.writePsiSection(PMT_PID, buildPmt(this.trackDatas));
    this.tablesWritten = true;
  }
  writePsiSection(pid, section) {
    let offset = 0;
    let isFirst = true;
    while (offset < section.length) {
      const pointerFieldSize = isFirst ? 1 : 0;
      const availablePayload = 184 - pointerFieldSize;
      const remainingData = section.length - offset;
      const chunkSize = Math.min(availablePayload, remainingData);
      let payload;
      if (isFirst) {
        payload = this.payloadBuffer.subarray(0, 1 + chunkSize);
        payload[0] = 0;
        payload.set(section.subarray(offset, offset + chunkSize), 1);
      } else {
        payload = section.subarray(offset, offset + chunkSize);
      }
      this.writeTsPacket(pid, isFirst, null, payload);
      offset += chunkSize;
      isFirst = false;
    }
  }
  writePesPacket(trackData, queuedPacket) {
    const includeDts = trackData.track.type === "video";
    const headerDataLength = includeDts ? 10 : 5;
    const pesHeaderBuffer = new Uint8Array(9 + headerDataLength);
    const pesView = toDataView(pesHeaderBuffer);
    const ptsDtsBitstream = new Bitstream(pesHeaderBuffer.subarray(9));
    setUint24(pesView, 0, 1, false);
    pesHeaderBuffer[3] = trackData.streamId;
    const pesPacketLength = trackData.track.type === "video" ? 0 : Math.min(8 + queuedPacket.data.length, 65535);
    pesView.setUint16(4, pesPacketLength, false);
    pesView.setUint8(6, 132);
    pesView.setUint8(7, includeDts ? 192 : 128);
    pesView.setUint8(8, headerDataLength);
    const pts = Math.round(queuedPacket.presentationTimestamp * TIMESCALE);
    ptsDtsBitstream.pos = 0;
    ptsDtsBitstream.writeBits(4, includeDts ? 3 : 2);
    ptsDtsBitstream.writeBits(3, pts >>> 30 & 7);
    ptsDtsBitstream.writeBits(1, 1);
    ptsDtsBitstream.writeBits(15, pts >>> 15 & 32767);
    ptsDtsBitstream.writeBits(1, 1);
    ptsDtsBitstream.writeBits(15, pts & 32767);
    ptsDtsBitstream.writeBits(1, 1);
    if (includeDts) {
      assert(queuedPacket.decodeTimestamp !== null);
      const dts = Math.round(queuedPacket.decodeTimestamp * TIMESCALE);
      ptsDtsBitstream.writeBits(4, 1);
      ptsDtsBitstream.writeBits(3, dts >>> 30 & 7);
      ptsDtsBitstream.writeBits(1, 1);
      ptsDtsBitstream.writeBits(15, dts >>> 15 & 32767);
      ptsDtsBitstream.writeBits(1, 1);
      ptsDtsBitstream.writeBits(15, dts & 32767);
      ptsDtsBitstream.writeBits(1, 1);
    }
    const totalLength = pesHeaderBuffer.length + queuedPacket.data.length;
    let offset = 0;
    let isFirstTsPacket = true;
    while (offset < totalLength) {
      const pusi = isFirstTsPacket;
      const remainingData = totalLength - offset;
      const randomAccessIndicator = isFirstTsPacket && queuedPacket.isKeyframe;
      const discontinuityIndicator = isFirstTsPacket && !trackData.firstPacketWritten;
      const basePaddingNeeded = Math.max(0, 184 - remainingData);
      let adaptationFieldSize;
      if (randomAccessIndicator || discontinuityIndicator) {
        adaptationFieldSize = Math.max(2, basePaddingNeeded);
      } else {
        adaptationFieldSize = basePaddingNeeded;
      }
      let adaptationField = null;
      if (adaptationFieldSize > 0) {
        const buf = this.adaptationFieldBuffer;
        if (adaptationFieldSize === 1) {
          buf[0] = 0;
        } else {
          buf[0] = adaptationFieldSize - 1;
          buf[1] = Number(discontinuityIndicator) << 7 | Number(randomAccessIndicator) << 6;
          buf.fill(255, 2, adaptationFieldSize);
        }
        adaptationField = buf.subarray(0, adaptationFieldSize);
      }
      const payloadSize = Math.min(184 - adaptationFieldSize, remainingData);
      const payload = this.payloadBuffer.subarray(0, payloadSize);
      let payloadOffset = 0;
      if (offset < pesHeaderBuffer.length) {
        const headerBytes = Math.min(pesHeaderBuffer.length - offset, payloadSize);
        payload.set(pesHeaderBuffer.subarray(offset, offset + headerBytes), 0);
        payloadOffset = headerBytes;
      }
      const dataStart = Math.max(0, offset - pesHeaderBuffer.length);
      const dataEnd = dataStart + (payloadSize - payloadOffset);
      if (payloadOffset < payloadSize) {
        payload.set(queuedPacket.data.subarray(dataStart, dataEnd), payloadOffset);
      }
      this.writeTsPacket(trackData.pid, pusi, adaptationField, payload);
      offset += payloadSize;
      isFirstTsPacket = false;
    }
    trackData.firstPacketWritten = true;
  }
  writeTsPacket(pid, pusi, adaptationField, payload) {
    const cc = this.continuityCounters.get(pid) ?? 0;
    const hasPayload = payload.length > 0;
    const adaptCtrl = adaptationField ? hasPayload ? 3 : 2 : hasPayload ? 1 : 0;
    this.packetBuffer[0] = 71;
    this.packetView.setUint16(1, (pusi ? 16384 : 0) | pid & 8191, false);
    this.packetBuffer[3] = adaptCtrl << 4 | cc & 15;
    if (hasPayload) {
      this.continuityCounters.set(pid, cc + 1 & 15);
    }
    let offset = 4;
    if (adaptationField) {
      this.packetBuffer.set(adaptationField, offset);
      offset += adaptationField.length;
    }
    this.packetBuffer.set(payload, offset);
    offset += payload.length;
    if (offset < TS_PACKET_SIZE) {
      this.packetBuffer.fill(255, offset);
    }
    const startPos = this.writer.getPos();
    this.writer.write(this.packetBuffer);
    if (this.format._options.onPacket) {
      this.format._options.onPacket(this.packetBuffer.slice(), startPos);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async onTrackClose(track) {
    const release = await this.mutex.acquire();
    const trackData = this.trackDatas.find((x) => x.track === track);
    if (trackData) {
      trackData.closed = true;
      await this.flushTimestampQueue(trackData, false);
    }
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
    await this.interleavePackets();
    release();
  }
  async finalize() {
    const release = await this.mutex.acquire();
    this.allTracksKnown.resolve();
    for (const trackData of this.trackDatas) {
      trackData.closed = true;
      await this.flushTimestampQueue(trackData, false);
    }
    await this.interleavePackets(true);
    release();
  }
};
var MPEG_TS_CRC_POLYNOMIAL = 79764919;
var MPEG_TS_CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let crc = n << 24;
  for (let k = 0; k < 8; k++) {
    crc = crc & 2147483648 ? crc << 1 ^ MPEG_TS_CRC_POLYNOMIAL : crc << 1;
  }
  MPEG_TS_CRC_TABLE[n] = crc >>> 0 & 4294967295;
}
var computeMpegTsCrc32 = (data) => {
  let crc = 4294967295;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    crc = (crc << 8 ^ MPEG_TS_CRC_TABLE[crc >>> 24 ^ byte]) >>> 0;
  }
  return crc;
};
var PAT_SECTION = new Uint8Array(16);
{
  const view2 = toDataView(PAT_SECTION);
  PAT_SECTION[0] = 0;
  view2.setUint16(1, 45069, false);
  view2.setUint16(3, 1, false);
  PAT_SECTION[5] = 193;
  PAT_SECTION[6] = 0;
  PAT_SECTION[7] = 0;
  view2.setUint16(8, 1, false);
  view2.setUint16(10, 57344 | PMT_PID & 8191, false);
  view2.setUint32(12, computeMpegTsCrc32(PAT_SECTION.subarray(0, 12)), false);
}
var buildPmt = (trackDatas) => {
  let totalEsBytes = 0;
  for (const trackData of trackDatas) {
    totalEsBytes += 5;
    if (trackData.streamType === 129) {
      totalEsBytes += AC3_REGISTRATION_DESCRIPTOR.length;
    } else if (trackData.streamType === 135) {
      totalEsBytes += EAC3_REGISTRATION_DESCRIPTOR.length;
    }
  }
  const sectionLength = 9 + totalEsBytes + 4;
  const section = new Uint8Array(3 + sectionLength - 4);
  const view2 = toDataView(section);
  section[0] = 2;
  view2.setUint16(1, 45056 | sectionLength & 4095, false);
  view2.setUint16(3, 1, false);
  section[5] = 193;
  section[6] = 0;
  section[7] = 0;
  view2.setUint16(8, 57344 | 8191, false);
  view2.setUint16(10, 61440, false);
  let offset = 12;
  for (const trackData of trackDatas) {
    section[offset++] = trackData.streamType;
    view2.setUint16(offset, 57344 | trackData.pid & 8191, false);
    offset += 2;
    if (trackData.streamType === 129) {
      view2.setUint16(offset, 61440 | AC3_REGISTRATION_DESCRIPTOR.length, false);
      offset += 2;
      section.set(AC3_REGISTRATION_DESCRIPTOR, offset);
      offset += AC3_REGISTRATION_DESCRIPTOR.length;
    } else if (trackData.streamType === 135) {
      view2.setUint16(offset, 61440 | EAC3_REGISTRATION_DESCRIPTOR.length, false);
      offset += 2;
      section.set(EAC3_REGISTRATION_DESCRIPTOR, offset);
      offset += EAC3_REGISTRATION_DESCRIPTOR.length;
    } else {
      view2.setUint16(offset, 61440, false);
      offset += 2;
    }
  }
  const crc = computeMpegTsCrc32(section);
  const result = new Uint8Array(section.length + 4);
  result.set(section, 0);
  toDataView(result).setUint32(section.length, crc, false);
  return result;
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/resample.js
var AudioResampler = class {
  constructor(options) {
    this.sourceSampleRate = null;
    this.sourceNumberOfChannels = null;
    this.maxWrittenFrame = null;
    this.targetSampleRate = options.targetSampleRate;
    this.targetNumberOfChannels = options.targetNumberOfChannels;
    this.endTime = options.endTime;
    this.onSample = options.onSample;
    this.bufferSizeInFrames = Math.floor(this.targetSampleRate * 5);
    this.bufferSizeInSamples = this.bufferSizeInFrames * this.targetNumberOfChannels;
    this.outputBuffer = new Float32Array(this.bufferSizeInSamples);
    this.bufferStartFrame = Math.floor(options.startTime * this.targetSampleRate);
    this.timestampOffset = options.startTime - this.bufferStartFrame / this.targetSampleRate;
  }
  /**
   * Sets up the channel mixer to handle up/downmixing in the case where input and output channel counts don't match.
   */
  doChannelMixerSetup() {
    assert(this.sourceNumberOfChannels !== null);
    const sourceNum = this.sourceNumberOfChannels;
    const targetNum = this.targetNumberOfChannels;
    if (sourceNum === 1 && targetNum === 2) {
      this.channelMixer = (sourceData, sourceFrameIndex) => {
        return sourceData[sourceFrameIndex * sourceNum];
      };
    } else if (sourceNum === 1 && targetNum === 4) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        return sourceData[sourceFrameIndex * sourceNum] * +(targetChannelIndex < 2);
      };
    } else if (sourceNum === 1 && targetNum === 6) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        return sourceData[sourceFrameIndex * sourceNum] * +(targetChannelIndex === 2);
      };
    } else if (sourceNum === 2 && targetNum === 1) {
      this.channelMixer = (sourceData, sourceFrameIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        return 0.5 * (sourceData[baseIdx] + sourceData[baseIdx + 1]);
      };
    } else if (sourceNum === 2 && targetNum === 4) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        return sourceData[sourceFrameIndex * sourceNum + targetChannelIndex] * +(targetChannelIndex < 2);
      };
    } else if (sourceNum === 2 && targetNum === 6) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        return sourceData[sourceFrameIndex * sourceNum + targetChannelIndex] * +(targetChannelIndex < 2);
      };
    } else if (sourceNum === 4 && targetNum === 1) {
      this.channelMixer = (sourceData, sourceFrameIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        return 0.25 * (sourceData[baseIdx] + sourceData[baseIdx + 1] + sourceData[baseIdx + 2] + sourceData[baseIdx + 3]);
      };
    } else if (sourceNum === 4 && targetNum === 2) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        return 0.5 * (sourceData[baseIdx + targetChannelIndex] + sourceData[baseIdx + targetChannelIndex + 2]);
      };
    } else if (sourceNum === 4 && targetNum === 6) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        if (targetChannelIndex < 2)
          return sourceData[baseIdx + targetChannelIndex];
        if (targetChannelIndex === 2 || targetChannelIndex === 3)
          return 0;
        return sourceData[baseIdx + targetChannelIndex - 2];
      };
    } else if (sourceNum === 6 && targetNum === 1) {
      this.channelMixer = (sourceData, sourceFrameIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        return Math.SQRT1_2 * (sourceData[baseIdx] + sourceData[baseIdx + 1]) + sourceData[baseIdx + 2] + 0.5 * (sourceData[baseIdx + 4] + sourceData[baseIdx + 5]);
      };
    } else if (sourceNum === 6 && targetNum === 2) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        return sourceData[baseIdx + targetChannelIndex] + Math.SQRT1_2 * (sourceData[baseIdx + 2] + sourceData[baseIdx + targetChannelIndex + 4]);
      };
    } else if (sourceNum === 6 && targetNum === 4) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        if (targetChannelIndex < 2) {
          return sourceData[baseIdx + targetChannelIndex] + Math.SQRT1_2 * sourceData[baseIdx + 2];
        }
        return sourceData[baseIdx + targetChannelIndex + 2];
      };
    } else {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        return targetChannelIndex < sourceNum ? sourceData[sourceFrameIndex * sourceNum + targetChannelIndex] : 0;
      };
    }
  }
  ensureTempBufferSize(requiredSamples) {
    let length = this.tempSourceBuffer.length;
    while (length < requiredSamples) {
      length *= 2;
    }
    if (length !== this.tempSourceBuffer.length) {
      const newBuffer = new Float32Array(length);
      newBuffer.set(this.tempSourceBuffer);
      this.tempSourceBuffer = newBuffer;
    }
  }
  async add(audioSample) {
    if (this.sourceSampleRate === null) {
      this.sourceSampleRate = audioSample.sampleRate;
      this.sourceNumberOfChannels = audioSample.numberOfChannels;
      this.tempSourceBuffer = new Float32Array(this.sourceSampleRate * this.sourceNumberOfChannels);
      this.doChannelMixerSetup();
    }
    const requiredSamples = audioSample.numberOfFrames * audioSample.numberOfChannels;
    this.ensureTempBufferSize(requiredSamples);
    const sourceDataSize = audioSample.allocationSize({ planeIndex: 0, format: "f32" });
    const sourceView = new Float32Array(this.tempSourceBuffer.buffer, 0, sourceDataSize / 4);
    audioSample.copyTo(sourceView, { planeIndex: 0, format: "f32" });
    const inputStartTime = audioSample.timestamp;
    const inputEndTime = Math.min(audioSample.timestamp + audioSample.duration, this.endTime);
    const outputStartFrame = Math.floor(inputStartTime * this.targetSampleRate);
    const outputEndFrame = Math.ceil(inputEndTime * this.targetSampleRate);
    for (let outputFrame = outputStartFrame; outputFrame < outputEndFrame; outputFrame++) {
      if (outputFrame < this.bufferStartFrame) {
        continue;
      }
      while (outputFrame >= this.bufferStartFrame + this.bufferSizeInFrames) {
        await this.finalizeCurrentBuffer();
        this.bufferStartFrame += this.bufferSizeInFrames;
      }
      const bufferFrameIndex = outputFrame - this.bufferStartFrame;
      assert(bufferFrameIndex < this.bufferSizeInFrames);
      const outputTime = outputFrame / this.targetSampleRate;
      const inputTime = outputTime - inputStartTime;
      const sourcePosition = inputTime * this.sourceSampleRate;
      const sourceLowerFrame = Math.floor(sourcePosition);
      const sourceUpperFrame = Math.ceil(sourcePosition);
      const fraction = sourcePosition - sourceLowerFrame;
      for (let targetChannel = 0; targetChannel < this.targetNumberOfChannels; targetChannel++) {
        let lowerSample = 0;
        let upperSample = 0;
        if (sourceLowerFrame >= 0 && sourceLowerFrame < audioSample.numberOfFrames) {
          lowerSample = this.channelMixer(sourceView, sourceLowerFrame, targetChannel);
        }
        if (sourceUpperFrame >= 0 && sourceUpperFrame < audioSample.numberOfFrames) {
          upperSample = this.channelMixer(sourceView, sourceUpperFrame, targetChannel);
        }
        const outputSample = lowerSample + fraction * (upperSample - lowerSample);
        const outputIndex = bufferFrameIndex * this.targetNumberOfChannels + targetChannel;
        this.outputBuffer[outputIndex] += outputSample;
      }
      if (this.maxWrittenFrame === null) {
        this.maxWrittenFrame = bufferFrameIndex;
      } else {
        this.maxWrittenFrame = Math.max(this.maxWrittenFrame, bufferFrameIndex);
      }
    }
  }
  async finalizeCurrentBuffer() {
    if (this.maxWrittenFrame === null) {
      return;
    }
    const samplesWritten = (this.maxWrittenFrame + 1) * this.targetNumberOfChannels;
    const outputData = new Float32Array(samplesWritten);
    outputData.set(this.outputBuffer.subarray(0, samplesWritten));
    const timestampSeconds = this.bufferStartFrame / this.targetSampleRate;
    const audioSample = new AudioSample({
      format: "f32",
      sampleRate: this.targetSampleRate,
      numberOfChannels: this.targetNumberOfChannels,
      timestamp: timestampSeconds + this.timestampOffset,
      data: outputData
    });
    await this.onSample(audioSample);
    this.outputBuffer.fill(0);
    this.maxWrittenFrame = null;
  }
  finalize() {
    return this.finalizeCurrentBuffer();
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/media-source.js
var MediaSource = class {
  constructor() {
    this._connectedTrack = null;
    this._closingPromise = null;
    this._closed = false;
  }
  /** @internal */
  _ensureValidAdd() {
    if (!this._connectedTrack) {
      throw new Error("Source is not connected to an output track.");
    }
    if (this._connectedTrack.output.state === "canceled") {
      throw new Error("Output has been canceled.");
    }
    if (this._connectedTrack.output.state === "finalizing" || this._connectedTrack.output.state === "finalized") {
      throw new Error("Output has been finalized.");
    }
    if (this._connectedTrack.output.state === "pending") {
      throw new Error("Output has not started.");
    }
    if (this._closed) {
      throw new Error("Source is closed.");
    }
  }
  /** @internal */
  async _start() {
  }
  /** @internal */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async _flushAndClose(forceClose) {
  }
  /**
   * Closes this source. This prevents future samples from being added and signals to the output file that no further
   * samples will come in for this track. Calling `.close()` is optional but recommended after adding the
   * last sample - for improved performance and reduced memory usage.
   */
  close() {
    if (this._closingPromise) {
      return;
    }
    const connectedTrack = this._connectedTrack;
    if (!connectedTrack) {
      throw new Error("Cannot call close without connecting the source to an output track.");
    }
    if (connectedTrack.output.state === "pending") {
      throw new Error("Cannot call close before output has been started.");
    }
    this._closingPromise = (async () => {
      await this._flushAndClose(false);
      this._closed = true;
      if (connectedTrack.output.state === "finalizing" || connectedTrack.output.state === "finalized") {
        return;
      }
      connectedTrack.output._muxer.onTrackClose(connectedTrack);
    })();
  }
  /** @internal */
  async _flushOrWaitForOngoingClose(forceClose) {
    return this._closingPromise ??= (async () => {
      await this._flushAndClose(forceClose);
      this._closed = true;
    })();
  }
};
var VideoSource = class extends MediaSource {
  /** Internal constructor. */
  constructor(codec) {
    super();
    this._connectedTrack = null;
    if (!VIDEO_CODECS.includes(codec)) {
      throw new TypeError(`Invalid video codec '${codec}'. Must be one of: ${VIDEO_CODECS.join(", ")}.`);
    }
    this._codec = codec;
  }
};
var maybeEnsureIsKeyPacket = (track, packet) => {
  if (track.metadata.hasOnlyKeyPackets && packet.type !== "key") {
    throw new Error("Cannot add non-key packets to a hasOnlyKeyPackets video track.");
  }
};
var EncodedVideoPacketSource = class extends VideoSource {
  /** Creates a new {@link EncodedVideoPacketSource} whose packets are encoded using `codec`. */
  constructor(codec) {
    super(codec);
  }
  /**
   * Adds an encoded packet to the output video track. Packets must be added in *decode order*, while a packet's
   * timestamp must be its *presentation timestamp*. B-frames are handled automatically.
   *
   * @param meta - Additional metadata from the encoder. You should pass this for the first call, including a valid
   * decoder config.
   *
   * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
   * to respect writer and encoder backpressure.
   */
  add(packet, meta) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    if (packet.isMetadataOnly) {
      throw new TypeError("Metadata-only packets cannot be added.");
    }
    if (meta !== void 0 && (!meta || typeof meta !== "object")) {
      throw new TypeError("meta, when provided, must be an object.");
    }
    this._ensureValidAdd();
    maybeEnsureIsKeyPacket(this._connectedTrack, packet);
    return this._connectedTrack.output._muxer.addEncodedVideoPacket(this._connectedTrack, packet, meta);
  }
};
var VideoEncoderWrapper = class {
  constructor(source, encodingConfig) {
    this.source = source;
    this.encodingConfig = encodingConfig;
    this.ensureEncoderPromise = null;
    this.encoderInitialized = false;
    this.encoder = null;
    this.muxer = null;
    this.lastMultipleOfKeyFrameInterval = -1;
    this.emittedEncoderPackets = 0;
    this.codedWidth = null;
    this.codedHeight = null;
    this.outputWidth = null;
    this.outputHeight = null;
    this.frameRateLastSample = null;
    this.frameRateLastTimestamp = null;
    this.frameRateLastEndTimestamp = null;
    this.preciseTimings = [];
    this.customEncoder = null;
    this.customEncoderCallSerializer = new CallSerializer();
    this.customEncoderQueueSize = 0;
    this.alphaEncoder = null;
    this.splitter = null;
    this.splitterCreationFailed = false;
    this.alphaFrameQueue = [];
    this.error = null;
    this.lastMuxerPromise = Promise.resolve();
  }
  async add(videoSample, shouldClose, encodeOptions) {
    const originalSample = videoSample;
    try {
      this.checkForEncoderError();
      this.source._ensureValidAdd();
      const config = this.encodingConfig;
      const sizeChangeBehavior = config.sizeChangeBehavior ?? "deny";
      let isSizeChange = false;
      if (this.codedWidth !== null && this.codedHeight !== null) {
        if (videoSample.codedWidth !== this.codedWidth || videoSample.codedHeight !== this.codedHeight) {
          isSizeChange = true;
          if (sizeChangeBehavior === "deny") {
            throw new Error(`Video sample size must remain constant. Expected ${this.codedWidth}x${this.codedHeight}, got ${videoSample.codedWidth}x${videoSample.codedHeight}. To allow the sample size to change over time, set \`sizeChangeBehavior\` to a value other than 'deny' in the encoding options.`);
          }
        }
      } else {
        this.codedWidth = videoSample.codedWidth;
        this.codedHeight = videoSample.codedHeight;
      }
      const hasTransformConfig = config.transform?.width !== void 0 || config.transform?.height !== void 0 || config.transform?.rotate !== void 0 || config.transform?.crop !== void 0 || config.transform?.force === true;
      const needsTransform = hasTransformConfig || isSizeChange && sizeChangeBehavior !== "passThrough";
      if (needsTransform) {
        let targetWidth = config.transform?.width;
        let targetHeight = config.transform?.height;
        let appliedFit = config.transform?.fit ?? "fill";
        if (isSizeChange && sizeChangeBehavior !== "passThrough") {
          assert(this.outputWidth);
          assert(this.outputHeight);
          assert(sizeChangeBehavior !== "deny");
          targetWidth = this.outputWidth;
          targetHeight = this.outputHeight;
          appliedFit = sizeChangeBehavior;
        }
        const transformed = await videoSample.transform({
          width: targetWidth,
          height: targetHeight,
          roundDimensionsTo: 2,
          crop: config.transform?.crop,
          rotate: config.transform?.rotate,
          fit: appliedFit,
          alpha: config.alpha
        });
        if (this.outputWidth === null || this.outputHeight === null) {
          this.outputWidth = transformed.displayWidth;
          this.outputHeight = transformed.displayHeight;
        }
        if (shouldClose) {
          videoSample.close();
        }
        videoSample = transformed;
        shouldClose = true;
      } else {
        if (this.outputWidth === null || this.outputHeight === null) {
          this.outputWidth = videoSample.codedWidth;
          this.outputHeight = videoSample.codedHeight;
        }
      }
      const frameRate = config.transform?.frameRate;
      if (frameRate !== void 0) {
        const originalEndTimestamp = videoSample.timestamp + videoSample.duration;
        const alignedTimestamp = floorToDivisor(videoSample.timestamp, frameRate);
        if (this.frameRateLastSample !== null) {
          if (alignedTimestamp <= this.frameRateLastTimestamp) {
            this.frameRateLastSample.close();
            this.frameRateLastSample = videoSample.clone();
            this.frameRateLastEndTimestamp = originalEndTimestamp;
            return;
          } else {
            await this.padFrameRate(alignedTimestamp, encodeOptions);
          }
        }
        if (videoSample === originalSample) {
          videoSample = videoSample.clone();
          shouldClose = true;
        }
        videoSample.setTimestamp(alignedTimestamp);
        videoSample.setDuration(1 / frameRate);
        this.frameRateLastSample?.close();
        this.frameRateLastSample = videoSample.clone();
        this.frameRateLastTimestamp = alignedTimestamp;
        this.frameRateLastEndTimestamp = originalEndTimestamp;
      }
      await this.processAndEncode(videoSample, encodeOptions);
    } finally {
      if (shouldClose) {
        videoSample.close();
      }
    }
  }
  /**
   * Runs the process function (if any) and encodes the resulting samples.
   */
  async processAndEncode(videoSample, encodeOptions) {
    const config = this.encodingConfig;
    let samplesToEncode;
    if (config.transform?.process) {
      let processed = config.transform.process(videoSample);
      if (processed instanceof Promise) {
        processed = await processed;
      }
      if (processed === null) {
        return;
      }
      if (!Array.isArray(processed)) {
        processed = [processed];
      }
      samplesToEncode = processed.map((x) => {
        if (x instanceof VideoSample) {
          return x;
        }
        if (typeof VideoFrame !== "undefined" && x instanceof VideoFrame) {
          return new VideoSample(x);
        }
        return new VideoSample(x, {
          timestamp: videoSample.timestamp,
          duration: videoSample.duration
        });
      });
    } else {
      samplesToEncode = [videoSample];
    }
    try {
      for (const sampleToEncode of samplesToEncode) {
        if (!this.encoderInitialized) {
          if (!this.ensureEncoderPromise) {
            this.ensureEncoder(sampleToEncode);
          }
          if (!this.encoderInitialized) {
            await this.ensureEncoderPromise;
          }
        }
        assert(this.encoderInitialized);
        const keyFrameInterval = this.encodingConfig.keyFrameInterval ?? 2;
        const multipleOfKeyFrameInterval = Math.floor(sampleToEncode.timestamp / keyFrameInterval);
        const finalEncodeOptions = {
          ...encodeOptions,
          keyFrame: encodeOptions?.keyFrame || keyFrameInterval === 0 || multipleOfKeyFrameInterval !== this.lastMultipleOfKeyFrameInterval
        };
        this.lastMultipleOfKeyFrameInterval = multipleOfKeyFrameInterval;
        if (this.customEncoder) {
          this.customEncoderQueueSize++;
          const clonedSample = sampleToEncode.clone();
          const promise = this.customEncoderCallSerializer.call(() => this.customEncoder.encode(clonedSample, finalEncodeOptions)).then(() => this.customEncoderQueueSize--).catch((error) => this.error ??= error).finally(() => {
            clonedSample.close();
          });
          if (this.customEncoderQueueSize >= 4) {
            await promise;
          }
        } else {
          assert(this.encoder);
          const videoFrame = sampleToEncode.toVideoFrame();
          const preciseTimingIndex = binarySearchLessOrEqual(this.preciseTimings, videoFrame.timestamp, (x) => x.microsecondTimestamp);
          const existingEntry = preciseTimingIndex !== -1 ? this.preciseTimings[preciseTimingIndex] : null;
          if (existingEntry && existingEntry.microsecondTimestamp === videoFrame.timestamp) {
            if (existingEntry.timestamp !== sampleToEncode.timestamp) {
              existingEntry.timestampIsValid = false;
            }
            if (existingEntry.duration !== sampleToEncode.duration) {
              existingEntry.durationIsValid = false;
            }
          } else {
            this.preciseTimings.splice(preciseTimingIndex + 1, 0, {
              microsecondTimestamp: videoFrame.timestamp,
              timestamp: sampleToEncode.timestamp,
              duration: sampleToEncode.duration,
              timestampIsValid: true,
              durationIsValid: true
            });
            if (this.preciseTimings.length > 128) {
              this.preciseTimings.shift();
            }
          }
          if (!this.alphaEncoder) {
            this.encoder.encode(videoFrame, finalEncodeOptions);
            videoFrame.close();
          } else {
            const frameDefinitelyHasNoAlpha = !!videoFrame.format && !videoFrame.format.includes("A");
            if (frameDefinitelyHasNoAlpha || this.splitterCreationFailed) {
              this.alphaFrameQueue.push(null);
              this.encoder.encode(videoFrame, finalEncodeOptions);
              videoFrame.close();
            } else {
              const width = videoFrame.displayWidth;
              const height = videoFrame.displayHeight;
              if (!this.splitter) {
                this.splitter = new ColorAlphaSplitter(width, height);
              }
              const { colorFrame, alphaFrame } = await this.splitter.update(videoFrame);
              this.alphaFrameQueue.push(alphaFrame);
              this.encoder.encode(colorFrame, finalEncodeOptions);
              colorFrame.close();
            }
          }
          if (this.encoder.encodeQueueSize >= 4) {
            await new Promise((resolve) => this.encoder.addEventListener("dequeue", resolve, { once: true }));
          }
        }
        await this.lastMuxerPromise;
      }
    } finally {
      for (const sample of samplesToEncode) {
        if (sample !== videoSample) {
          sample.close();
        }
      }
    }
  }
  /** Repeats the last frame rate sample to fill the gap up to the given timestamp. */
  async padFrameRate(until, encodeOptions) {
    const frameRate = this.encodingConfig.transform.frameRate;
    assert(this.frameRateLastSample);
    const frameDifference = Math.round((until - this.frameRateLastTimestamp) * frameRate);
    for (let i = 1; i < frameDifference; i++) {
      const sample = this.frameRateLastSample.clone();
      sample.setTimestamp(this.frameRateLastTimestamp + i / frameRate);
      sample.setDuration(1 / frameRate);
      await this.processAndEncode(sample, encodeOptions);
      sample.close();
    }
  }
  ensureEncoder(videoSample) {
    this.ensureEncoderPromise = (async () => {
      const encoderConfig = buildVideoEncoderConfig({
        ...this.encodingConfig,
        width: videoSample.codedWidth,
        height: videoSample.codedHeight,
        squarePixelWidth: videoSample.squarePixelWidth,
        squarePixelHeight: videoSample.squarePixelHeight,
        framerate: this.source._connectedTrack?.metadata.frameRate
      });
      this.encodingConfig.onEncoderConfig?.(encoderConfig);
      const MatchingCustomEncoder = customVideoEncoders.find((x) => x.supports(this.encodingConfig.codec, encoderConfig));
      if (MatchingCustomEncoder) {
        this.customEncoder = new MatchingCustomEncoder();
        this.customEncoder.codec = this.encodingConfig.codec;
        this.customEncoder.config = encoderConfig;
        this.customEncoder.onPacket = (packet, meta) => {
          if (!(packet instanceof EncodedPacket)) {
            throw new TypeError("The first argument passed to onPacket must be an EncodedPacket.");
          }
          if (meta !== void 0 && (!meta || typeof meta !== "object")) {
            throw new TypeError("The second argument passed to onPacket must be an object or undefined.");
          }
          maybeEnsureIsKeyPacket(this.source._connectedTrack, packet);
          this.encodingConfig.onEncodedPacket?.(packet, meta);
          this.lastMuxerPromise = this.muxer.addEncodedVideoPacket(this.source._connectedTrack, packet, meta).catch((error) => {
            this.error ??= error;
          });
        };
        await this.customEncoder.init();
      } else {
        if (typeof VideoEncoder === "undefined") {
          throw new Error("VideoEncoder is not supported by this browser.");
        }
        encoderConfig.alpha = "discard";
        if (this.encodingConfig.alpha === "keep") {
          encoderConfig.latencyMode = "quality";
        }
        const hasOddDimension = encoderConfig.width % 2 === 1 || encoderConfig.height % 2 === 1;
        if (hasOddDimension && (this.encodingConfig.codec === "avc" || this.encodingConfig.codec === "hevc")) {
          throw new Error(`The dimensions ${encoderConfig.width}x${encoderConfig.height} are not supported for codec '${this.encodingConfig.codec}'; both width and height must be even numbers. Make sure to round your dimensions to the nearest even number.`);
        }
        const support = await VideoEncoder.isConfigSupported(encoderConfig);
        if (!support.supported) {
          throw new Error(`This specific encoder configuration (${encoderConfig.codec}, ${encoderConfig.bitrate} bps, ${encoderConfig.width}x${encoderConfig.height}, hardware acceleration: ${encoderConfig.hardwareAcceleration ?? "no-preference"}) is not supported by this browser. Consider using another codec or changing your video parameters.`);
        }
        const colorChunkQueue = [];
        const nullAlphaChunkQueue = [];
        let encodedAlphaChunkCount = 0;
        let alphaEncoderQueue = 0;
        const addPacket = (colorChunk, alphaChunk, meta) => {
          const sideData = {};
          if (alphaChunk) {
            const alphaData = new Uint8Array(alphaChunk.byteLength);
            alphaChunk.copyTo(alphaData);
            sideData.alpha = alphaData;
          }
          let packet = EncodedPacket.fromEncodedChunk(colorChunk, sideData);
          const preciseTimingIndex = binarySearchLessOrEqual(this.preciseTimings, colorChunk.timestamp, (x) => x.microsecondTimestamp);
          const entry = preciseTimingIndex !== -1 ? this.preciseTimings[preciseTimingIndex] : null;
          let actualType = null;
          if (this.emittedEncoderPackets === 0 && packet.type === "delta" && meta?.decoderConfig) {
            actualType = determineVideoPacketType(this.encodingConfig.codec, meta.decoderConfig, packet.data);
          }
          if (entry && entry.microsecondTimestamp === colorChunk.timestamp || actualType !== null) {
            packet = packet.clone({
              timestamp: entry?.timestampIsValid ? entry.timestamp : void 0,
              duration: entry?.durationIsValid ? entry.duration : void 0,
              type: actualType ?? void 0
            });
          }
          maybeEnsureIsKeyPacket(this.source._connectedTrack, packet);
          this.encodingConfig.onEncodedPacket?.(packet, meta);
          this.lastMuxerPromise = this.muxer.addEncodedVideoPacket(this.source._connectedTrack, packet, meta).catch((error) => {
            this.error ??= error;
          });
          this.emittedEncoderPackets++;
        };
        const stack = new Error("Encoding error").stack;
        this.encoder = new VideoEncoder({
          output: (chunk, meta) => {
            if (!this.alphaEncoder) {
              addPacket(chunk, null, meta);
              return;
            }
            const alphaFrame = this.alphaFrameQueue.shift();
            assert(alphaFrame !== void 0);
            if (alphaFrame) {
              this.alphaEncoder.encode(alphaFrame, {
                // Crucial: The alpha frame is forced to be a key frame whenever the color frame
                // also is. Without this, playback can glitch and even crash in some browsers.
                // This is the reason why the two encoders are wired in series and not in parallel.
                keyFrame: chunk.type === "key"
              });
              alphaEncoderQueue++;
              alphaFrame.close();
              colorChunkQueue.push({ chunk, meta });
            } else {
              if (alphaEncoderQueue === 0) {
                addPacket(chunk, null, meta);
              } else {
                nullAlphaChunkQueue.push(encodedAlphaChunkCount + alphaEncoderQueue);
                colorChunkQueue.push({ chunk, meta });
              }
            }
          },
          error: (error) => {
            error.stack = stack;
            this.error ??= error;
          }
        });
        this.encoder.configure(encoderConfig);
        if (this.encodingConfig.alpha === "keep") {
          const stack2 = new Error("Encoding error").stack;
          this.alphaEncoder = new VideoEncoder({
            // We ignore the alpha chunk's metadata
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            output: (chunk, meta) => {
              alphaEncoderQueue--;
              const colorChunk = colorChunkQueue.shift();
              assert(colorChunk !== void 0);
              addPacket(colorChunk.chunk, chunk, colorChunk.meta);
              encodedAlphaChunkCount++;
              while (nullAlphaChunkQueue.length > 0 && nullAlphaChunkQueue[0] === encodedAlphaChunkCount) {
                nullAlphaChunkQueue.shift();
                const colorChunk2 = colorChunkQueue.shift();
                assert(colorChunk2 !== void 0);
                addPacket(colorChunk2.chunk, null, colorChunk2.meta);
              }
            },
            error: (error) => {
              error.stack = stack2;
              this.error ??= error;
            }
          });
          this.alphaEncoder.configure(encoderConfig);
        }
      }
      assert(this.source._connectedTrack);
      this.muxer = this.source._connectedTrack.output._muxer;
      this.encoderInitialized = true;
    })();
  }
  async flushAndClose(forceClose) {
    if (!forceClose) {
      this.checkForEncoderError();
    }
    if (!forceClose && this.frameRateLastSample) {
      const frameRate = this.encodingConfig.transform.frameRate;
      const alignedEnd = floorToDivisor(this.frameRateLastEndTimestamp, frameRate);
      await this.padFrameRate(alignedEnd);
    }
    this.frameRateLastSample?.close();
    this.frameRateLastSample = null;
    if (this.customEncoder) {
      if (!forceClose) {
        void this.customEncoderCallSerializer.call(() => this.customEncoder.flush());
      }
      await this.customEncoderCallSerializer.call(() => this.customEncoder.close());
    } else if (this.encoder) {
      if (!forceClose) {
        await this.encoder.flush();
        await this.alphaEncoder?.flush();
      }
      if (this.encoder.state !== "closed") {
        this.encoder.close();
      }
      if (this.alphaEncoder && this.alphaEncoder.state !== "closed") {
        this.alphaEncoder.close();
      }
      this.alphaFrameQueue.forEach((x) => x?.close());
      this.splitter?.close();
    }
    if (!forceClose) {
      this.checkForEncoderError();
    }
  }
  getQueueSize() {
    if (this.customEncoder) {
      return this.customEncoderQueueSize;
    } else {
      return this.encoder?.encodeQueueSize ?? 0;
    }
  }
  checkForEncoderError() {
    if (this.error) {
      throw this.error;
    }
  }
};
var splitterGpuUnavailable = false;
var ColorAlphaSplitter = class _ColorAlphaSplitter {
  constructor(initialWidth, initialHeight) {
    this.canvas = null;
    this.gl = null;
    this.colorProgram = null;
    this.alphaProgram = null;
    this.vao = null;
    this.sourceTexture = null;
    this.alphaResolutionLocation = null;
    this.worker = null;
    this.pendingRequests = /* @__PURE__ */ new Map();
    this.nextRequestId = 0;
    const canMakeCanvas = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined" && typeof document.createElement === "function";
    if (!_ColorAlphaSplitter.forceCpu && canMakeCanvas && !splitterGpuUnavailable) {
      try {
        if (typeof OffscreenCanvas !== "undefined") {
          this.canvas = new OffscreenCanvas(initialWidth, initialHeight);
        } else {
          this.canvas = document.createElement("canvas");
          this.canvas.width = initialWidth;
          this.canvas.height = initialHeight;
        }
        const gl = this.canvas.getContext("webgl2", {
          alpha: true
          // Needed due to the YUV thing we do for alpha
        });
        if (!gl) {
          throw new Error("Couldn't acquire WebGL 2 context.");
        }
        this.gl = gl;
        this.colorProgram = this.createColorProgram();
        this.alphaProgram = this.createAlphaProgram();
        this.vao = this.createVAO();
        this.sourceTexture = this.createTexture();
        this.alphaResolutionLocation = this.gl.getUniformLocation(this.alphaProgram, "u_resolution");
        this.gl.useProgram(this.colorProgram);
        this.gl.uniform1i(this.gl.getUniformLocation(this.colorProgram, "u_sourceTexture"), 0);
        this.gl.useProgram(this.alphaProgram);
        this.gl.uniform1i(this.gl.getUniformLocation(this.alphaProgram, "u_sourceTexture"), 0);
      } catch (error) {
        this.gl = null;
        this.canvas = null;
        splitterGpuUnavailable = true;
        console.warn("Falling back to CPU for color/alpha splitting.", error);
      }
    }
  }
  async update(sourceFrame) {
    if (this.gl) {
      return this.updateGpu(sourceFrame);
    } else {
      return this.updateCpu(sourceFrame);
    }
  }
  updateGpu(sourceFrame) {
    assert(this.gl);
    assert(this.canvas);
    if (sourceFrame.displayWidth !== this.canvas.width || sourceFrame.displayHeight !== this.canvas.height) {
      this.canvas.width = sourceFrame.displayWidth;
      this.canvas.height = sourceFrame.displayHeight;
    }
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, sourceFrame);
    const colorFrame = this.runColorProgram(sourceFrame);
    const alphaFrame = this.runAlphaProgram(sourceFrame);
    sourceFrame.close();
    return { colorFrame, alphaFrame };
  }
  createVertexShader() {
    assert(this.gl);
    return this.createShader(this.gl.VERTEX_SHADER, `#version 300 es
			in vec2 a_position;
			in vec2 a_texCoord;
			out vec2 v_texCoord;
			
			void main() {
				gl_Position = vec4(a_position, 0.0, 1.0);
				v_texCoord = a_texCoord;
			}
		`);
  }
  createColorProgram() {
    assert(this.gl);
    const vertexShader = this.createVertexShader();
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, `#version 300 es
			precision highp float;
			
			uniform sampler2D u_sourceTexture;
			in vec2 v_texCoord;
			out vec4 fragColor;
			
			void main() {
				vec4 source = texture(u_sourceTexture, v_texCoord);
				fragColor = vec4(source.rgb, 1.0);
			}
		`);
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    return program;
  }
  createAlphaProgram() {
    assert(this.gl);
    const vertexShader = this.createVertexShader();
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, `#version 300 es
			precision highp float;
			
			uniform sampler2D u_sourceTexture;
			uniform vec2 u_resolution; // The width and height of the canvas
			in vec2 v_texCoord;
			out vec4 fragColor;

			// This function determines the value for a single byte in the YUV stream
			float getByteValue(float byteOffset) {
				float width = u_resolution.x;
				float height = u_resolution.y;

				float yPlaneSize = width * height;

				if (byteOffset < yPlaneSize) {
					// This byte is in the luma plane. Find the corresponding pixel coordinates to sample from
					float y = floor(byteOffset / width);
					float x = mod(byteOffset, width);
					
					// Add 0.5 to sample the center of the texel
					vec2 sampleCoord = (vec2(x, y) + 0.5) / u_resolution;
					
					// The luma value is the alpha from the source texture
					return texture(u_sourceTexture, sampleCoord).a;
				} else {
					// Write a fixed value for chroma and beyond
					return 128.0 / 255.0;
				}
			}
			
			void main() {
				// Each fragment writes 4 bytes (R, G, B, A)
				float pixelIndex = floor(gl_FragCoord.y) * u_resolution.x + floor(gl_FragCoord.x);
				float baseByteOffset = pixelIndex * 4.0;

				vec4 result;
				for (int i = 0; i < 4; i++) {
					float currentByteOffset = baseByteOffset + float(i);
					result[i] = getByteValue(currentByteOffset);
				}
				
				fragColor = result;
			}
		`);
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    return program;
  }
  createShader(type, source) {
    assert(this.gl);
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", this.gl.getShaderInfoLog(shader));
    }
    return shader;
  }
  createVAO() {
    assert(this.gl);
    assert(this.colorProgram);
    const vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(vao);
    const vertices = new Float32Array([
      -1,
      -1,
      0,
      1,
      1,
      -1,
      1,
      1,
      -1,
      1,
      0,
      0,
      1,
      1,
      1,
      0
    ]);
    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    const positionLocation = this.gl.getAttribLocation(this.colorProgram, "a_position");
    const texCoordLocation = this.gl.getAttribLocation(this.colorProgram, "a_texCoord");
    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(texCoordLocation);
    this.gl.vertexAttribPointer(texCoordLocation, 2, this.gl.FLOAT, false, 16, 8);
    return vao;
  }
  createTexture() {
    assert(this.gl);
    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    return texture;
  }
  runColorProgram(sourceFrame) {
    assert(this.gl);
    assert(this.canvas);
    this.gl.useProgram(this.colorProgram);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    return new VideoFrame(this.canvas, {
      timestamp: sourceFrame.timestamp,
      duration: sourceFrame.duration ?? void 0,
      alpha: "discard"
    });
  }
  runAlphaProgram(sourceFrame) {
    assert(this.gl);
    assert(this.canvas);
    this.gl.useProgram(this.alphaProgram);
    this.gl.uniform2f(this.alphaResolutionLocation, this.canvas.width, this.canvas.height);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    const { width, height } = this.canvas;
    const chromaSamples = Math.ceil(width / 2) * Math.ceil(height / 2);
    const yuvSize = width * height + chromaSamples * 2;
    const requiredHeight = Math.ceil(yuvSize / (width * 4));
    let yuv = new Uint8Array(4 * width * requiredHeight);
    this.gl.readPixels(0, 0, width, requiredHeight, this.gl.RGBA, this.gl.UNSIGNED_BYTE, yuv);
    yuv = yuv.subarray(0, yuvSize);
    assert(yuv[width * height] === 128);
    assert(yuv[yuv.length - 1] === 128);
    const init = {
      format: "I420",
      codedWidth: width,
      codedHeight: height,
      timestamp: sourceFrame.timestamp,
      duration: sourceFrame.duration ?? void 0,
      transfer: [yuv.buffer]
    };
    return new VideoFrame(yuv, init);
  }
  updateCpu(sourceFrame) {
    if (!this.worker) {
      const blob = new Blob([`(${colorAlphaSplitterWorkerCode.toString()})()`], { type: "application/javascript" });
      const url2 = URL.createObjectURL(blob);
      this.worker = new Worker(url2);
      URL.revokeObjectURL(url2);
      this.worker.addEventListener("message", (event) => {
        const data = event.data;
        const pending2 = this.pendingRequests.get(data.id);
        if (!pending2) {
          return;
        }
        this.pendingRequests.delete(data.id);
        if ("error" in data) {
          pending2.reject(new Error(data.error));
        } else {
          pending2.resolve({ colorFrame: data.colorFrame, alphaFrame: data.alphaFrame });
        }
      });
      this.worker.addEventListener("error", (event) => {
        const error = new Error(event.message || "Color/alpha splitter worker error.");
        for (const pending2 of this.pendingRequests.values()) {
          pending2.reject(error);
        }
        this.pendingRequests.clear();
      });
    }
    const id = this.nextRequestId++;
    const pending = promiseWithResolvers();
    this.pendingRequests.set(id, pending);
    this.worker.postMessage({ id, sourceFrame }, { transfer: [sourceFrame] });
    return pending.promise;
  }
  close() {
    this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
    this.canvas = null;
    this.worker?.terminate();
    this.worker = null;
    const error = new Error("Color/alpha splitter closed.");
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
};
ColorAlphaSplitter.forceCpu = true;
var colorAlphaSplitterWorkerCode = () => {
  let cpuSourceBuffer = null;
  let chain = Promise.resolve();
  self.addEventListener("message", (event) => {
    const { id, sourceFrame } = event.data;
    chain = chain.then(async () => {
      try {
        const { colorFrame, alphaFrame } = await split(sourceFrame);
        self.postMessage({ id, colorFrame, alphaFrame }, { transfer: [colorFrame, alphaFrame] });
      } catch (error) {
        self.postMessage({ id, error: error.message });
      } finally {
        sourceFrame.close();
      }
    });
  });
  const split = async (sourceFrame) => {
    const format = sourceFrame.format;
    if (!format) {
      throw new Error("CPU color/alpha splitting requires a known VideoFrame format.");
    }
    const width = sourceFrame.codedWidth;
    const height = sourceFrame.codedHeight;
    const sourceSize = sourceFrame.allocationSize();
    if (!cpuSourceBuffer || cpuSourceBuffer.byteLength !== sourceSize) {
      cpuSourceBuffer = new Uint8Array(sourceSize);
    }
    await sourceFrame.copyTo(cpuSourceBuffer);
    if (format === "RGBA" || format === "BGRA") {
      return splitInterleavedRgba(cpuSourceBuffer, width, height, format, sourceFrame);
    } else if (format === "I420A" || format === "I420AP10" || format === "I420AP12" || format === "I422A" || format === "I422AP10" || format === "I422AP12" || format === "I444A" || format === "I444AP10" || format === "I444AP12") {
      return splitPlanarYuvA(cpuSourceBuffer, width, height, format, sourceFrame);
    }
    throw new Error(`CPU color/alpha splitting does not support format '${format}'.`);
  };
  const splitInterleavedRgba = (source, width, height, format, sourceFrame) => {
    const pixelCount = width * height;
    const chromaW = Math.ceil(width / 2);
    const chromaH = Math.ceil(height / 2);
    const alphaSize = pixelCount + chromaW * chromaH * 2;
    const alphaBuffer = new Uint8Array(alphaSize);
    for (let i = 0, j = 3; i < pixelCount; i++, j += 4) {
      alphaBuffer[i] = source[j];
    }
    alphaBuffer.fill(128, pixelCount);
    const colorFrame = new VideoFrame(source, {
      format: format === "RGBA" ? "RGBX" : "BGRX",
      codedWidth: width,
      codedHeight: height,
      timestamp: sourceFrame.timestamp,
      duration: sourceFrame.duration ?? void 0
      // No transfer!
    });
    const alphaInit = {
      format: "I420",
      codedWidth: width,
      codedHeight: height,
      timestamp: sourceFrame.timestamp,
      duration: sourceFrame.duration ?? void 0,
      transfer: [alphaBuffer.buffer]
    };
    const alphaFrame = new VideoFrame(alphaBuffer, alphaInit);
    return { colorFrame, alphaFrame };
  };
  const splitPlanarYuvA = (source, width, height, format, sourceFrame) => {
    const is10 = format.includes("P10");
    const is12 = format.includes("P12");
    const bytesPerSample = is10 || is12 ? 2 : 1;
    let chromaW;
    let chromaH;
    if (format.startsWith("I420")) {
      chromaW = Math.ceil(width / 2);
      chromaH = Math.ceil(height / 2);
    } else if (format.startsWith("I422")) {
      chromaW = Math.ceil(width / 2);
      chromaH = height;
    } else {
      chromaW = width;
      chromaH = height;
    }
    const ySamples = width * height;
    const uvSamples = chromaW * chromaH;
    const yBytes = ySamples * bytesPerSample;
    const uvBytes = uvSamples * bytesPerSample;
    const aBytes = ySamples * bytesPerSample;
    const colorBytes = yBytes + uvBytes * 2;
    const colorFormat = format.replace("A", "");
    const alphaChromaW = Math.ceil(width / 2);
    const alphaChromaH = Math.ceil(height / 2);
    const alphaUvSamples = alphaChromaW * alphaChromaH;
    const alphaUvBytes = alphaUvSamples * bytesPerSample;
    const alphaSize = aBytes + 2 * alphaUvBytes;
    const alphaBuffer = new Uint8Array(alphaSize);
    const aPlaneStart = colorBytes;
    alphaBuffer.set(source.subarray(aPlaneStart, aPlaneStart + aBytes), 0);
    const uvOffset = aBytes;
    const neutralChroma = is10 ? 512 : is12 ? 2048 : 128;
    if (bytesPerSample === 1) {
      alphaBuffer.fill(neutralChroma, uvOffset);
    } else {
      const uvView = new Uint16Array(alphaBuffer.buffer, uvOffset, 2 * alphaUvSamples);
      uvView.fill(neutralChroma);
    }
    const alphaFormat = is10 ? "I420P10" : is12 ? "I420P12" : "I420";
    const colorFrame = new VideoFrame(source.subarray(0, colorBytes), {
      format: colorFormat,
      codedWidth: width,
      codedHeight: height,
      timestamp: sourceFrame.timestamp,
      duration: sourceFrame.duration ?? void 0
    });
    const alphaInit = {
      format: alphaFormat,
      codedWidth: width,
      codedHeight: height,
      timestamp: sourceFrame.timestamp,
      duration: sourceFrame.duration ?? void 0,
      transfer: [alphaBuffer.buffer]
    };
    const alphaFrame = new VideoFrame(alphaBuffer, alphaInit);
    return { colorFrame, alphaFrame };
  };
};
var VideoSampleSource = class extends VideoSource {
  /**
   * Creates a new {@link VideoSampleSource} whose samples are encoded according to the specified
   * {@link VideoEncodingConfig}.
   */
  constructor(encodingConfig) {
    validateVideoEncodingConfig(encodingConfig);
    super(encodingConfig.codec);
    this._encoder = new VideoEncoderWrapper(this, encodingConfig);
  }
  /**
   * Encodes a video sample (frame) and then adds it to the output.
   *
   * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
   * to respect writer and encoder backpressure.
   */
  add(videoSample, encodeOptions) {
    if (!(videoSample instanceof VideoSample)) {
      throw new TypeError("videoSample must be a VideoSample.");
    }
    return this._encoder.add(videoSample, false, encodeOptions);
  }
  /** @internal */
  _flushAndClose(forceClose) {
    return this._encoder.flushAndClose(forceClose);
  }
};
var AudioSource = class extends MediaSource {
  /** Internal constructor. */
  constructor(codec) {
    super();
    this._connectedTrack = null;
    if (!AUDIO_CODECS.includes(codec)) {
      throw new TypeError(`Invalid audio codec '${codec}'. Must be one of: ${AUDIO_CODECS.join(", ")}.`);
    }
    this._codec = codec;
  }
};
var EncodedAudioPacketSource = class extends AudioSource {
  /** Creates a new {@link EncodedAudioPacketSource} whose packets are encoded using `codec`. */
  constructor(codec) {
    super(codec);
  }
  /**
   * Adds an encoded packet to the output audio track. Packets must be added in *decode order*.
   *
   * @param meta - Additional metadata from the encoder. You should pass this for the first call, including a valid
   * decoder config.
   *
   * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
   * to respect writer and encoder backpressure.
   */
  add(packet, meta) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    if (packet.isMetadataOnly) {
      throw new TypeError("Metadata-only packets cannot be added.");
    }
    if (meta !== void 0 && (!meta || typeof meta !== "object")) {
      throw new TypeError("meta, when provided, must be an object.");
    }
    this._ensureValidAdd();
    return this._connectedTrack.output._muxer.addEncodedAudioPacket(this._connectedTrack, packet, meta);
  }
};
var AudioEncoderWrapper = class {
  constructor(source, encodingConfig) {
    this.source = source;
    this.encodingConfig = encodingConfig;
    this.ensureEncoderPromise = null;
    this.encoderInitialized = false;
    this.encoder = null;
    this.muxer = null;
    this.lastNumberOfChannels = null;
    this.lastSampleRate = null;
    this.isPcmEncoder = false;
    this.outputSampleSize = null;
    this.writeOutputValue = null;
    this.customEncoder = null;
    this.customEncoderCallSerializer = new CallSerializer();
    this.customEncoderQueueSize = 0;
    this.lastEndSampleIndex = null;
    this.resampler = null;
    this.error = null;
    this.lastMuxerPromise = Promise.resolve();
  }
  async add(audioSample, shouldClose) {
    try {
      this.checkForEncoderError();
      this.source._ensureValidAdd();
      if (this.lastNumberOfChannels !== null && this.lastSampleRate !== null) {
        if (audioSample.numberOfChannels !== this.lastNumberOfChannels || audioSample.sampleRate !== this.lastSampleRate) {
          throw new Error(`Audio parameters must remain constant. Expected ${this.lastNumberOfChannels} channels at ${this.lastSampleRate} Hz, got ${audioSample.numberOfChannels} channels at ${audioSample.sampleRate} Hz.`);
        }
      } else {
        this.lastNumberOfChannels = audioSample.numberOfChannels;
        this.lastSampleRate = audioSample.sampleRate;
      }
      const config = this.encodingConfig;
      const needsResample = config.transform?.numberOfChannels !== void 0 || config.transform?.sampleRate !== void 0;
      if (needsResample) {
        if (!this.resampler) {
          this.resampler = new AudioResampler({
            targetNumberOfChannels: config.transform.numberOfChannels ?? audioSample.numberOfChannels,
            targetSampleRate: config.transform.sampleRate ?? audioSample.sampleRate,
            startTime: audioSample.timestamp,
            endTime: Infinity,
            onSample: async (sample) => {
              await this.processAndEncode(sample, true);
            }
          });
        }
        await this.resampler.add(audioSample);
      } else {
        await this.processAndEncode(audioSample, shouldClose);
      }
    } finally {
      if (shouldClose) {
        audioSample.close();
      }
    }
  }
  /**
   * Runs the process function (if any) and encodes the resulting samples.
   */
  async processAndEncode(audioSample, shouldClose) {
    const config = this.encodingConfig;
    if (config.transform?.sampleFormat !== void 0 && toInterleavedAudioFormat(audioSample.format) !== config.transform.sampleFormat) {
      const newSample = audioSampleToInterleavedFormat(audioSample, config.transform.sampleFormat);
      if (shouldClose) {
        audioSample.close();
      }
      audioSample = newSample;
      shouldClose = true;
    }
    if (config.transform?.process) {
      let processed = config.transform.process(audioSample);
      if (processed instanceof Promise) {
        processed = await processed;
      }
      if (processed === null) {
        return;
      }
      if (!Array.isArray(processed)) {
        processed = [processed];
      }
      for (const sample of processed) {
        if (!(sample instanceof AudioSample)) {
          throw new TypeError("The audio process function must return an AudioSample, null, or an array of AudioSamples.");
        }
        await this.encodeSample(sample, true);
      }
      if (shouldClose) {
        audioSample.close();
      }
    } else {
      await this.encodeSample(audioSample, shouldClose);
    }
  }
  /**
   * Encodes a single audio sample, handling encoder init, gap padding, and backpressure.
   */
  async encodeSample(audioSample, shouldClose) {
    try {
      if (!this.encoderInitialized) {
        if (!this.ensureEncoderPromise) {
          this.ensureEncoder(audioSample);
        }
        if (!this.encoderInitialized) {
          await this.ensureEncoderPromise;
        }
      }
      assert(this.encoderInitialized);
      {
        const startSampleIndex = Math.round(audioSample.timestamp * audioSample.sampleRate);
        const endSampleIndex = Math.round((audioSample.timestamp + audioSample.duration) * audioSample.sampleRate);
        if (this.lastEndSampleIndex === null) {
          this.lastEndSampleIndex = endSampleIndex;
        } else {
          const sampleDiff = startSampleIndex - this.lastEndSampleIndex;
          if (sampleDiff >= 64) {
            const fillSample = new AudioSample({
              data: new Float32Array(sampleDiff * audioSample.numberOfChannels),
              format: "f32-planar",
              sampleRate: audioSample.sampleRate,
              numberOfChannels: audioSample.numberOfChannels,
              numberOfFrames: sampleDiff,
              timestamp: this.lastEndSampleIndex / audioSample.sampleRate
            });
            await this.encodeSample(fillSample, true);
          }
          this.lastEndSampleIndex += audioSample.numberOfFrames;
        }
      }
      if (this.customEncoder) {
        this.customEncoderQueueSize++;
        const clonedSample = audioSample.clone();
        const promise = this.customEncoderCallSerializer.call(() => this.customEncoder.encode(clonedSample)).then(() => this.customEncoderQueueSize--).catch((error) => this.error ??= error).finally(() => {
          clonedSample.close();
        });
        if (this.customEncoderQueueSize >= 4) {
          await promise;
        }
        await this.lastMuxerPromise;
      } else if (this.isPcmEncoder) {
        await this.doPcmEncoding(audioSample, shouldClose);
      } else {
        assert(this.encoder);
        const audioData = audioSample.toAudioData();
        this.encoder.encode(audioData);
        audioData.close();
        if (shouldClose) {
          audioSample.close();
        }
        if (this.encoder.encodeQueueSize >= 4) {
          await new Promise((resolve) => this.encoder.addEventListener("dequeue", resolve, { once: true }));
        }
        await this.lastMuxerPromise;
      }
    } finally {
      if (shouldClose) {
        audioSample.close();
      }
    }
  }
  async doPcmEncoding(audioSample, shouldClose) {
    assert(this.outputSampleSize);
    assert(this.writeOutputValue);
    const { numberOfChannels, numberOfFrames, sampleRate, timestamp } = audioSample;
    const CHUNK_SIZE = 2048;
    const outputs = [];
    for (let frame = 0; frame < numberOfFrames; frame += CHUNK_SIZE) {
      const frameCount = Math.min(CHUNK_SIZE, audioSample.numberOfFrames - frame);
      const outputSize = frameCount * numberOfChannels * this.outputSampleSize;
      const outputBuffer = new ArrayBuffer(outputSize);
      const outputView = new DataView(outputBuffer);
      outputs.push({ frameCount, view: outputView });
    }
    const allocationSize = audioSample.allocationSize({ planeIndex: 0, format: "f32-planar" });
    const floats = new Float32Array(allocationSize / Float32Array.BYTES_PER_ELEMENT);
    for (let i = 0; i < numberOfChannels; i++) {
      audioSample.copyTo(floats, { planeIndex: i, format: "f32-planar" });
      for (let j = 0; j < outputs.length; j++) {
        const { frameCount, view: view2 } = outputs[j];
        for (let k = 0; k < frameCount; k++) {
          this.writeOutputValue(view2, (k * numberOfChannels + i) * this.outputSampleSize, floats[j * CHUNK_SIZE + k]);
        }
      }
    }
    if (shouldClose) {
      audioSample.close();
    }
    const meta = {
      decoderConfig: {
        codec: this.encodingConfig.codec,
        numberOfChannels,
        sampleRate
      }
    };
    for (let i = 0; i < outputs.length; i++) {
      const { frameCount, view: view2 } = outputs[i];
      const outputBuffer = view2.buffer;
      const startFrame = i * CHUNK_SIZE;
      const packet = new EncodedPacket(new Uint8Array(outputBuffer), "key", timestamp + startFrame / sampleRate, frameCount / sampleRate);
      this.encodingConfig.onEncodedPacket?.(packet, meta);
      await this.muxer.addEncodedAudioPacket(this.source._connectedTrack, packet, meta);
    }
  }
  ensureEncoder(audioSample) {
    this.ensureEncoderPromise = (async () => {
      const { numberOfChannels, sampleRate } = audioSample;
      const encoderConfig = buildAudioEncoderConfig({
        numberOfChannels,
        sampleRate,
        ...this.encodingConfig
      });
      this.encodingConfig.onEncoderConfig?.(encoderConfig);
      const MatchingCustomEncoder = customAudioEncoders.find((x) => x.supports(this.encodingConfig.codec, encoderConfig));
      if (MatchingCustomEncoder) {
        this.customEncoder = new MatchingCustomEncoder();
        this.customEncoder.codec = this.encodingConfig.codec;
        this.customEncoder.config = encoderConfig;
        this.customEncoder.onPacket = (packet, meta) => {
          if (!(packet instanceof EncodedPacket)) {
            throw new TypeError("The first argument passed to onPacket must be an EncodedPacket.");
          }
          if (meta !== void 0 && (!meta || typeof meta !== "object")) {
            throw new TypeError("The second argument passed to onPacket must be an object or undefined.");
          }
          this.encodingConfig.onEncodedPacket?.(packet, meta);
          this.lastMuxerPromise = this.muxer.addEncodedAudioPacket(this.source._connectedTrack, packet, meta).catch((error) => {
            this.error ??= error;
          });
        };
        await this.customEncoder.init();
      } else if (PCM_AUDIO_CODECS.includes(this.encodingConfig.codec)) {
        this.initPcmEncoder();
      } else {
        if (typeof AudioEncoder === "undefined") {
          throw new Error("AudioEncoder is not supported by this browser.");
        }
        const support = await AudioEncoder.isConfigSupported(encoderConfig);
        if (!support.supported) {
          throw new Error(`This specific encoder configuration (${encoderConfig.codec}, ${encoderConfig.bitrate} bps, ${encoderConfig.numberOfChannels} channels, ${encoderConfig.sampleRate} Hz) is not supported by this browser. Consider using another codec or changing your audio parameters.`);
        }
        const stack = new Error("Encoding error").stack;
        this.encoder = new AudioEncoder({
          output: (chunk, meta) => {
            if (this.encodingConfig.codec === "aac" && meta?.decoderConfig) {
              let needsDescriptionOverwrite = false;
              if (!meta.decoderConfig.description || meta.decoderConfig.description.byteLength < 2) {
                needsDescriptionOverwrite = true;
              } else {
                const audioSpecificConfig = parseAacAudioSpecificConfig(toUint8Array(meta.decoderConfig.description));
                needsDescriptionOverwrite = audioSpecificConfig.objectType === 0;
              }
              if (needsDescriptionOverwrite) {
                const objectType = Number(last(encoderConfig.codec.split(".")));
                meta.decoderConfig.description = buildAacAudioSpecificConfig({
                  objectType,
                  numberOfChannels: meta.decoderConfig.numberOfChannels,
                  sampleRate: meta.decoderConfig.sampleRate
                });
              }
            }
            let packet = EncodedPacket.fromEncodedChunk(chunk);
            packet = packet.clone({
              timestamp: roundToDivisor(packet.timestamp, encoderConfig.sampleRate),
              duration: chunk.duration != null ? roundToDivisor(packet.duration, encoderConfig.sampleRate) : void 0
            });
            this.encodingConfig.onEncodedPacket?.(packet, meta);
            this.lastMuxerPromise = this.muxer.addEncodedAudioPacket(this.source._connectedTrack, packet, meta).catch((error) => {
              this.error ??= error;
            });
          },
          error: (error) => {
            error.stack = stack;
            this.error ??= error;
          }
        });
        this.encoder.configure(encoderConfig);
      }
      assert(this.source._connectedTrack);
      this.muxer = this.source._connectedTrack.output._muxer;
      this.encoderInitialized = true;
    })();
  }
  initPcmEncoder() {
    this.isPcmEncoder = true;
    const codec = this.encodingConfig.codec;
    const { dataType, sampleSize, littleEndian } = parsePcmCodec(codec);
    this.outputSampleSize = sampleSize;
    switch (sampleSize) {
      case 1:
        {
          if (dataType === "unsigned") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setUint8(byteOffset, clamp((value + 1) * 127.5, 0, 255));
          } else if (dataType === "signed") {
            this.writeOutputValue = (view2, byteOffset, value) => {
              view2.setInt8(byteOffset, clamp(Math.round(value * 128), -128, 127));
            };
          } else if (dataType === "ulaw") {
            this.writeOutputValue = (view2, byteOffset, value) => {
              const int16 = clamp(Math.floor(value * 32767), -32768, 32767);
              view2.setUint8(byteOffset, toUlaw(int16));
            };
          } else if (dataType === "alaw") {
            this.writeOutputValue = (view2, byteOffset, value) => {
              const int16 = clamp(Math.floor(value * 32767), -32768, 32767);
              view2.setUint8(byteOffset, toAlaw(int16));
            };
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 2:
        {
          if (dataType === "unsigned") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setUint16(byteOffset, clamp((value + 1) * 32767.5, 0, 65535), littleEndian);
          } else if (dataType === "signed") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setInt16(byteOffset, clamp(Math.round(value * 32767), -32768, 32767), littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 3:
        {
          if (dataType === "unsigned") {
            this.writeOutputValue = (view2, byteOffset, value) => setUint24(view2, byteOffset, clamp((value + 1) * 83886075e-1, 0, 16777215), littleEndian);
          } else if (dataType === "signed") {
            this.writeOutputValue = (view2, byteOffset, value) => setInt24(view2, byteOffset, clamp(Math.round(value * 8388607), -8388608, 8388607), littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 4:
        {
          if (dataType === "unsigned") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setUint32(byteOffset, clamp((value + 1) * 21474836475e-1, 0, 4294967295), littleEndian);
          } else if (dataType === "signed") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setInt32(byteOffset, clamp(Math.round(value * 2147483647), -2147483648, 2147483647), littleEndian);
          } else if (dataType === "float") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setFloat32(byteOffset, value, littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 8:
        {
          if (dataType === "float") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setFloat64(byteOffset, value, littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      default:
        {
          assertNever(sampleSize);
          assert(false);
        }
        ;
    }
  }
  async flushAndClose(forceClose) {
    if (!forceClose) {
      this.checkForEncoderError();
    }
    if (!forceClose && this.resampler) {
      await this.resampler.finalize();
    }
    this.resampler = null;
    if (this.customEncoder) {
      if (!forceClose) {
        void this.customEncoderCallSerializer.call(() => this.customEncoder.flush());
      }
      await this.customEncoderCallSerializer.call(() => this.customEncoder.close());
    } else if (this.encoder) {
      if (!forceClose) {
        await this.encoder.flush();
      }
      if (this.encoder.state !== "closed") {
        this.encoder.close();
      }
    }
    if (!forceClose) {
      this.checkForEncoderError();
    }
  }
  getQueueSize() {
    if (this.customEncoder) {
      return this.customEncoderQueueSize;
    } else if (this.isPcmEncoder) {
      return 0;
    } else {
      return this.encoder?.encodeQueueSize ?? 0;
    }
  }
  checkForEncoderError() {
    if (this.error) {
      throw this.error;
    }
  }
};
var AudioSampleSource = class extends AudioSource {
  /**
   * Creates a new {@link AudioSampleSource} whose samples are encoded according to the specified
   * {@link AudioEncodingConfig}.
   */
  constructor(encodingConfig) {
    validateAudioEncodingConfig(encodingConfig);
    super(encodingConfig.codec);
    this._encoder = new AudioEncoderWrapper(this, encodingConfig);
  }
  /**
   * Encodes an audio sample and then adds it to the output.
   *
   * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
   * to respect writer and encoder backpressure.
   */
  add(audioSample) {
    if (!(audioSample instanceof AudioSample)) {
      throw new TypeError("audioSample must be an AudioSample.");
    }
    return this._encoder.add(audioSample, false);
  }
  /** @internal */
  _flushAndClose(forceClose) {
    return this._encoder.flushAndClose(forceClose);
  }
};
var SubtitleSource = class extends MediaSource {
  /** Internal constructor. */
  constructor(codec) {
    super();
    this._connectedTrack = null;
    if (!SUBTITLE_CODECS.includes(codec)) {
      throw new TypeError(`Invalid subtitle codec '${codec}'. Must be one of: ${SUBTITLE_CODECS.join(", ")}.`);
    }
    this._codec = codec;
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/hls/hls-muxer.js
var HlsMuxer = class extends Muxer {
  constructor(output, format) {
    if (!(output._target instanceof PathedTarget)) {
      throw new TypeError("HLS outputs require `OutputOptions.target` to be a PathedTarget.");
    }
    super(output);
    this.trackDatas = [];
    this.isRelativeToUnixEpoch = false;
    this.numWrittenMasterPlaylists = 0;
    this.playlists = [];
    this.playlistDeclarations = [];
    this.format = format;
    this.targetSegmentDuration = format._options.targetDuration ?? 2;
    this.singleFilePerPlaylist = format._options.singleFilePerPlaylist ?? false;
    this.isLive = format._options.live ?? false;
    this.maxLiveSegmentCount = format._options.maxLiveSegmentCount ?? Infinity;
    this.globalTargetDuration = this.targetSegmentDuration;
    this.getPlaylistPath = format._options.getPlaylistPath ?? (({ n }) => `playlist-${n}.m3u8`);
    this.getSegmentPath = format._options.getSegmentPath ?? ((info) => info.isSingleFile ? `segments-${info.playlist.n}${info.format.fileExtension}` : `segment-${info.playlist.n}-${info.n}${info.format.fileExtension}`);
    this.getInitPath = format._options.getInitPath ?? ((playlist) => `init-${playlist.n}${playlist.segmentFormat.fileExtension}`);
  }
  async start() {
    const release = await this.mutex.acquire();
    const someRelative = this.output._tracks.some((t) => t.metadata.isRelativeToUnixEpoch);
    const someNotRelative = this.output._tracks.some((t) => !t.metadata.isRelativeToUnixEpoch);
    if (someRelative && someNotRelative) {
      throw new Error("All tracks must agree on `relativeToUnixEpoch`: some tracks are relative to the Unix epoch and some are not.");
    }
    this.isRelativeToUnixEpoch = someRelative;
    const groupAssignment = /* @__PURE__ */ new Map();
    const groups = [];
    let hasVideo = false;
    let illegalPairingDetected = false;
    let keyPacketsOnlyPairingWarned = false;
    for (const track of this.output._tracks) {
      if (track.type === "video") {
        hasVideo = true;
      }
      const pairableGroups = /* @__PURE__ */ new Map();
      for (const otherTrack of this.output._tracks) {
        if (track === otherTrack) {
          continue;
        }
        if (!track.canBePairedWith(otherTrack)) {
          continue;
        }
        if (track.type === otherTrack.type) {
          if (!illegalPairingDetected) {
            console.warn(`Illegal pairing of two ${track.type} tracks detected, which is not possible in HLS; treating them as unpaired.`);
            illegalPairingDetected = true;
          }
          continue;
        }
        if (track.isVideoTrack() && track.metadata.hasOnlyKeyPackets || otherTrack.isVideoTrack() && otherTrack.metadata.hasOnlyKeyPackets) {
          if (!keyPacketsOnlyPairingWarned) {
            console.warn(`A key-packets-only video track is pairable with another track, which is not possible in HLS; treating them as unpaired.`);
            keyPacketsOnlyPairingWarned = true;
          }
          continue;
        }
        let groupTracks = pairableGroups.get(otherTrack.source._codec);
        if (!groupTracks) {
          pairableGroups.set(otherTrack.source._codec, groupTracks = []);
        }
        groupTracks.push(otherTrack);
      }
      for (const [, pairableTracks] of pairableGroups) {
        const key = pairableTracks.map((x) => x.id).join("-");
        const group = groups.find((x) => x.key === key);
        if (!group) {
          groups.push({
            name: pairableTracks[0].type + "-" + (groups.length + 1),
            key,
            tracks: pairableTracks,
            needsEmit: false,
            firstNoUri: false
          });
        }
        let assignedGroups = groupAssignment.get(track);
        if (!assignedGroups) {
          groupAssignment.set(track, assignedGroups = []);
        }
        assignedGroups.push(key);
      }
    }
    const mainType = hasVideo ? "video" : "audio";
    const variantStreams = [];
    const unpairedVideoTracks = [];
    const unpairedAudioTracks = [];
    for (const track of this.output._tracks) {
      const assignedGroupKeys = groupAssignment.get(track);
      if (assignedGroupKeys) {
        assert(assignedGroupKeys.length > 0);
        if (track.type !== mainType) {
          continue;
        }
        for (const key of assignedGroupKeys) {
          const group = groups.find((x) => x.key === key);
          assert(group);
          if (assignedGroupKeys.length === 1 && group.tracks.length === 1) {
            const otherGroupKeys = groupAssignment.get(group.tracks[0]);
            assert(otherGroupKeys !== void 0);
            if (otherGroupKeys.length === 1) {
              const otherGroup = groups.find((x) => x.key === otherGroupKeys[0]);
              if (otherGroup.tracks.length === 1) {
                assert(otherGroup.tracks[0] === track);
                variantStreams.push({
                  tracks: [track, group.tracks[0]],
                  linkedGroup: null
                });
                continue;
              }
            }
          }
          variantStreams.push({
            tracks: [track],
            linkedGroup: group
          });
          group.needsEmit = true;
        }
      } else {
        if (track.type === "video") {
          unpairedVideoTracks.push(track);
        } else if (track.type === "audio") {
          unpairedAudioTracks.push(track);
        }
      }
    }
    const getMetadataKeyForTrack = ({ metadata }) => {
      let key = "";
      key += `${metadata.languageCode ?? UNDETERMINED_LANGUAGE}-`;
      key += `${metadata.name ?? ""}-`;
      key += `${metadata.disposition?.default ?? true}-`;
      key += `${metadata.disposition?.primary ?? false}-`;
      key += `${metadata.disposition?.forced ?? false}-`;
      return key;
    };
    if (unpairedVideoTracks.length > 0) {
      const uniqueMetadata = new Set(unpairedVideoTracks.map(getMetadataKeyForTrack));
      if (uniqueMetadata.size > 1) {
        const group = {
          key: unpairedVideoTracks.map((x) => x.id).join("-"),
          name: "video-" + (groups.length + 1),
          tracks: unpairedVideoTracks,
          needsEmit: true,
          firstNoUri: true
        };
        groups.push(group);
        variantStreams.push({
          tracks: [unpairedVideoTracks[0]],
          linkedGroup: group
        });
      } else {
        for (const track of unpairedVideoTracks) {
          variantStreams.push({
            tracks: [track],
            linkedGroup: null
          });
        }
      }
    }
    if (unpairedAudioTracks.length > 0) {
      const uniqueMetadata = new Set(unpairedAudioTracks.map(getMetadataKeyForTrack));
      if (uniqueMetadata.size > 1) {
        const group = {
          key: unpairedAudioTracks.map((x) => x.id).join("-"),
          name: "audio-" + (groups.length + 1),
          tracks: unpairedAudioTracks,
          needsEmit: true,
          firstNoUri: true
        };
        groups.push(group);
        variantStreams.push({
          tracks: [unpairedAudioTracks[0]],
          linkedGroup: group
        });
      } else {
        for (const track of unpairedAudioTracks) {
          variantStreams.push({
            tracks: [track],
            linkedGroup: null
          });
        }
      }
    }
    const deduceSegmentFormat = (tracks) => {
      const codecs = [];
      let videoCount = 0;
      let audioCount = 0;
      let requiresRotationMetadata = false;
      let candidate = null;
      let candidateScore = -Infinity;
      for (const track of tracks) {
        if (track.isVideoTrack()) {
          videoCount++;
          requiresRotationMetadata ||= (track.metadata.rotation ?? 0) !== 0;
        } else if (track.isAudioTrack()) {
          audioCount++;
        }
        codecs.push(track.source._codec);
      }
      for (const format of toArray(this.format._options.segmentFormat)) {
        const supportedCodecs = format.getSupportedCodecs();
        const trackCounts = format.getSupportedTrackCounts();
        if (codecs.some((codec) => !supportedCodecs.includes(codec))) {
          continue;
        }
        if (videoCount < trackCounts.video.min || videoCount > trackCounts.video.max) {
          continue;
        }
        if (audioCount < trackCounts.audio.min || audioCount > trackCounts.audio.max) {
          continue;
        }
        let score = 0;
        if (requiresRotationMetadata && format.supportsVideoRotationMetadata) {
          score++;
        }
        if (score > candidateScore) {
          candidate = format;
          candidateScore = score;
        }
      }
      assert(candidate);
      return candidate;
    };
    const registerPlaylist = async (tracks) => {
      if (tracks.some((track) => this.playlists.some((playlist2) => playlist2.tracks.includes(track)))) {
        throw new Error("Internal error: track is already registered in a playlist.");
      }
      const format = deduceSegmentFormat(tracks);
      const id = this.playlists.length + 1;
      const path = await this.getPlaylistPath({
        n: id,
        tracks,
        segmentFormat: format
      });
      validatePlaylistPath(path);
      const playlist = {
        id: this.playlists.length + 1,
        path,
        tracks,
        segmentFormat: format,
        currentSegmentStartTimestamp: null,
        currentSegmentStartTimestampIsFixed: false,
        nextSegmentId: 1,
        initSegment: null,
        writtenSegments: [],
        peakBitrate: null,
        averageBitrate: null,
        mediaSequence: 0,
        done: false,
        singleFile: null,
        mutex: new AsyncMutex()
      };
      this.playlists.push(playlist);
      return playlist;
    };
    for (const group of groups) {
      if (!group.needsEmit) {
        continue;
      }
      for (let i = 0; i < group.tracks.length; i++) {
        const track = group.tracks[i];
        let playlist = this.playlists.find((x) => x.tracks[0].id === track.id);
        playlist ??= await registerPlaylist([track]);
        this.playlistDeclarations.push({
          playlist,
          groupId: group.name,
          noUri: group.firstNoUri && i === 0,
          references: []
        });
      }
    }
    for (const variant of variantStreams) {
      let playlist = this.playlists.find((x) => x.tracks[0].id === variant.tracks[0].id);
      playlist ??= await registerPlaylist(variant.tracks);
      this.playlistDeclarations.push({
        playlist,
        groupId: null,
        noUri: false,
        references: variant.linkedGroup ? this.playlistDeclarations.filter((x) => x.groupId === variant.linkedGroup.name) : []
      });
    }
    release();
  }
  async getMimeType() {
    return HLS_MIME_TYPE;
  }
  allTracksAreKnown(playlist) {
    for (const track of playlist.tracks) {
      if (!track.source._closed && !this.trackDatas.some((x) => x.track === track)) {
        return false;
      }
    }
    return true;
  }
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async onTrackClose(track) {
    const trackData = this.trackDatas.find((x) => x.track === track);
    if (trackData) {
      trackData.closed = true;
    }
    const playlist = this.playlists.find((x) => x.tracks.includes(track));
    assert(playlist);
    const release = await playlist.mutex.acquire();
    try {
      await this.advancePlaylist(playlist);
    } finally {
      release();
    }
  }
  getVideoTrackData(track, meta) {
    let trackData = this.trackDatas.find((x) => x.track === track);
    if (trackData) {
      return trackData;
    }
    validateVideoChunkMetadata(meta);
    assert(meta);
    assert(meta?.decoderConfig);
    const playlists = this.playlists.filter((x) => x.tracks.includes(track));
    assert(playlists.length === 1);
    trackData = {
      track,
      packets: [],
      playlist: playlists[0],
      closed: false,
      info: {
        type: "video",
        decoderConfig: meta.decoderConfig
      }
    };
    this.trackDatas.push(trackData);
    return trackData;
  }
  getAudioTrackData(track, meta) {
    let trackData = this.trackDatas.find((x) => x.track === track);
    if (trackData) {
      return trackData;
    }
    validateAudioChunkMetadata(meta);
    assert(meta);
    assert(meta?.decoderConfig);
    const playlists = this.playlists.filter((x) => x.tracks.includes(track));
    assert(playlists.length === 1);
    trackData = {
      track,
      packets: [],
      playlist: playlists[0],
      closed: false,
      info: {
        type: "audio",
        decoderConfig: meta.decoderConfig
      }
    };
    this.trackDatas.push(trackData);
    return trackData;
  }
  async addEncodedVideoPacket(track, packet, meta) {
    const trackData = this.getVideoTrackData(track, meta);
    const playlist = trackData.playlist;
    const release = await playlist.mutex.acquire();
    try {
      this.validateTimestamp(track, packet.timestamp, packet.type === "key");
      trackData.packets.push(packet);
      if (playlist.currentSegmentStartTimestamp === null) {
        playlist.currentSegmentStartTimestamp = packet.timestamp;
      } else if (!playlist.currentSegmentStartTimestampIsFixed) {
        playlist.currentSegmentStartTimestamp = Math.min(playlist.currentSegmentStartTimestamp, packet.timestamp);
      }
      await this.advancePlaylist(playlist);
    } finally {
      release();
    }
  }
  async addEncodedAudioPacket(track, packet, meta) {
    const trackData = this.getAudioTrackData(track, meta);
    const playlist = trackData.playlist;
    const release = await playlist.mutex.acquire();
    try {
      this.validateTimestamp(track, packet.timestamp, packet.type === "key");
      trackData.packets.push(packet);
      if (playlist.currentSegmentStartTimestamp === null) {
        playlist.currentSegmentStartTimestamp = packet.timestamp;
      } else if (!playlist.currentSegmentStartTimestampIsFixed) {
        playlist.currentSegmentStartTimestamp = Math.min(playlist.currentSegmentStartTimestamp, packet.timestamp);
      }
      await this.advancePlaylist(playlist);
    } finally {
      release();
    }
  }
  async addSubtitleCue(track, cue, meta) {
    throw new Error("Unreachable.");
  }
  async advancePlaylist(playlist) {
    assert(!playlist.done);
    if (!this.allTracksAreKnown(playlist)) {
      return;
    }
    if (playlist.currentSegmentStartTimestamp === null) {
      await this.onPlaylistDone(playlist);
      return;
    }
    const trackDatas = this.trackDatas.filter((x) => playlist.tracks.includes(x.track));
    const videoTrack = trackDatas.find((x) => x.info.type === "video");
    const audioTrack = trackDatas.find((x) => x.info.type === "audio");
    while (true) {
      const currentSegmentEndTimestamp = playlist.currentSegmentStartTimestamp + this.targetSegmentDuration;
      let videoEndIndex = 0;
      let audioEndIndex = 0;
      if (videoTrack && (!videoTrack.closed || videoTrack.packets.length > 0)) {
        const allBelow = videoTrack.packets.every((x) => x.timestamp < currentSegmentEndTimestamp);
        let bestKeyPacket = null;
        let bestKeyPacketIndex = null;
        if (allBelow) {
          if (!videoTrack.closed) {
            return;
          }
        } else {
          for (let i = 0; i < videoTrack.packets.length; i++) {
            const packet = videoTrack.packets[i];
            if (bestKeyPacket !== null && packet.timestamp > currentSegmentEndTimestamp) {
              break;
            }
            if (i > 0 && packet.type === "key") {
              bestKeyPacket = packet;
              bestKeyPacketIndex = i;
            }
          }
        }
        if (bestKeyPacketIndex !== null) {
          videoEndIndex = bestKeyPacketIndex;
          if (audioTrack) {
            const index = audioTrack.packets.findIndex((x) => x.timestamp >= bestKeyPacket.timestamp);
            if (index !== -1) {
              audioEndIndex = index;
            } else {
              if (audioTrack.closed) {
                audioEndIndex = audioTrack.packets.length;
              } else {
                return;
              }
            }
          }
        } else {
          if (!videoTrack.closed) {
            return;
          }
          videoEndIndex = videoTrack.packets.length;
          const maxIndex = arrayArgmax(videoTrack.packets, (x) => x.timestamp);
          const maxPacket = videoTrack.packets[maxIndex];
          assert(maxPacket);
          if (audioTrack) {
            if (maxPacket.timestamp < currentSegmentEndTimestamp) {
              const index = audioTrack.packets.findIndex((x) => x.timestamp >= currentSegmentEndTimestamp);
              if (index !== -1) {
                audioEndIndex = index;
              } else {
                if (audioTrack.closed) {
                  audioEndIndex = audioTrack.packets.length;
                } else {
                  return;
                }
              }
            } else {
              const index = audioTrack.packets.findIndex((x) => x.timestamp > maxPacket.timestamp);
              if (index !== -1) {
                audioEndIndex = index;
              } else {
                if (audioTrack.closed) {
                  audioEndIndex = audioTrack.packets.length;
                } else {
                  return;
                }
              }
            }
          }
        }
      } else if (audioTrack && (!audioTrack.closed || audioTrack.packets.length > 0)) {
        const allBelow = audioTrack.packets.every((x) => x.timestamp < currentSegmentEndTimestamp);
        if (allBelow) {
          if (audioTrack.closed) {
            audioEndIndex = audioTrack.packets.length;
          } else {
            return;
          }
        } else {
          const index = findLastIndex(audioTrack.packets, (x) => x.timestamp <= currentSegmentEndTimestamp);
          audioEndIndex = Math.max(index, 1);
        }
      }
      if (videoEndIndex === 0 && audioEndIndex === 0) {
        const allClosed = trackDatas.every((x) => x.closed);
        if (allClosed) {
          await this.onPlaylistDone(playlist);
        }
        return;
      }
      let segmentInfo = null;
      let relativeSegmentPath;
      let fullSegmentPath;
      assert(this.output._target instanceof PathedTarget);
      const pathedTarget = this.output._target;
      if (this.singleFilePerPlaylist) {
        if (playlist.singleFile === null) {
          const segmentInfo2 = {
            n: playlist.nextSegmentId,
            format: playlist.segmentFormat,
            isSingleFile: true,
            playlist: toPlaylistInfo(playlist)
          };
          relativeSegmentPath = await this.getSegmentPath(segmentInfo2);
          validateSegmentPath(relativeSegmentPath);
          fullSegmentPath = joinPaths(joinPaths(pathedTarget.rootPath, playlist.path), relativeSegmentPath);
          const target = await this.output._getTarget({
            path: fullSegmentPath,
            isRoot: false,
            mimeType: playlist.segmentFormat.mimeType
          });
          target._start();
          playlist.singleFile = {
            target,
            path: relativeSegmentPath,
            nextOffset: 0,
            info: segmentInfo2
          };
        } else {
          relativeSegmentPath = playlist.singleFile.path;
          fullSegmentPath = joinPaths(joinPaths(pathedTarget.rootPath, playlist.path), relativeSegmentPath);
        }
      } else {
        segmentInfo = {
          n: playlist.nextSegmentId,
          format: playlist.segmentFormat,
          isSingleFile: false,
          playlist: toPlaylistInfo(playlist)
        };
        relativeSegmentPath = await this.getSegmentPath(segmentInfo);
        validateSegmentPath(relativeSegmentPath);
        fullSegmentPath = joinPaths(joinPaths(pathedTarget.rootPath, playlist.path), relativeSegmentPath);
        playlist.nextSegmentId++;
      }
      let segmentSize = 0;
      let outputTarget = null;
      const output = new Output({
        format: playlist.segmentFormat,
        target: new PathedTarget(fullSegmentPath, async (request) => {
          const proxiedRequest = {
            ...request,
            isRoot: false
          };
          if (request.isRoot) {
            if (playlist.singleFile) {
              const slice = playlist.singleFile.target.slice(playlist.singleFile.nextOffset);
              slice.on("write", ({ end }) => segmentSize = Math.max(segmentSize, end));
              return slice;
            } else {
              const target = await this.output._getTarget(proxiedRequest);
              outputTarget = target;
              target.on("write", ({ end }) => segmentSize = Math.max(segmentSize, end));
              return target;
            }
          }
          return this.output._getTarget(proxiedRequest);
        }),
        initTarget: async () => {
          if (playlist.initSegment) {
            return new NullTarget();
          }
          if (playlist.singleFile) {
            playlist.initSegment = {
              path: playlist.singleFile.path,
              duration: 0,
              timestamp: 0,
              byteSize: 0,
              byteOffset: 0,
              info: null
            };
            const slice = playlist.singleFile.target.slice(playlist.singleFile.nextOffset);
            slice.on("write", ({ end }) => {
              playlist.initSegment.byteSize = Math.max(playlist.initSegment.byteSize, end);
            });
            slice.on("finalized", () => {
              playlist.singleFile.nextOffset = playlist.initSegment.byteSize;
            });
            return slice;
          } else {
            const playlistInfo = toPlaylistInfo(playlist);
            const initPath = await this.getInitPath(playlistInfo);
            validateInitPath(initPath);
            playlist.initSegment = {
              path: initPath,
              duration: 0,
              timestamp: 0,
              byteSize: 0,
              byteOffset: null,
              info: null
            };
            const fullInitPath = joinPaths(joinPaths(pathedTarget.rootPath, playlist.path), initPath);
            const target = await this.output._getTarget({
              path: fullInitPath,
              isRoot: false,
              mimeType: playlist.segmentFormat.mimeType
            });
            target.on("write", ({ end }) => {
              playlist.initSegment.byteSize = Math.max(playlist.initSegment.byteSize, end);
            });
            target.on("finalized", () => {
              this.format._options.onInit?.(target, playlistInfo);
            });
            return target;
          }
        }
      });
      let maxEndTimestamp = -Infinity;
      try {
        let videoSource = null;
        let audioSource = null;
        if (videoTrack) {
          videoSource = new EncodedVideoPacketSource(videoTrack.track.source._codec);
          output.addVideoTrack(videoSource, videoTrack.track.metadata);
        }
        if (audioTrack) {
          audioSource = new EncodedAudioPacketSource(audioTrack.track.source._codec);
          output.addAudioTrack(audioSource, audioTrack.track.metadata);
        }
        await output.start();
        if (videoTrack) {
          assert(videoSource);
          const meta = { decoderConfig: videoTrack.info.decoderConfig };
          for (let i = 0; i < videoEndIndex; i++) {
            const packet = videoTrack.packets[i];
            await videoSource.add(packet, meta);
            maxEndTimestamp = Math.max(maxEndTimestamp, packet.timestamp + packet.duration);
          }
        }
        if (audioTrack) {
          assert(audioSource);
          const meta = { decoderConfig: audioTrack.info.decoderConfig };
          for (let i = 0; i < audioEndIndex; i++) {
            const packet = audioTrack.packets[i];
            await audioSource.add(packet, meta);
            maxEndTimestamp = Math.max(maxEndTimestamp, packet.timestamp + packet.duration);
          }
        }
        await output.finalize();
      } catch (e) {
        await output.cancel();
        throw e;
      }
      if (segmentInfo) {
        assert(outputTarget);
        this.format._options.onSegment?.(outputTarget, segmentInfo);
      }
      if (videoEndIndex > 0) {
        assert(videoTrack);
        videoTrack.packets.splice(0, videoEndIndex);
      }
      if (audioEndIndex > 0) {
        assert(audioTrack);
        audioTrack.packets.splice(0, audioEndIndex);
      }
      let minNextTimestamp = Infinity;
      if (videoTrack && videoTrack.packets.length > 0) {
        minNextTimestamp = videoTrack.packets[0].timestamp;
      }
      if (audioTrack && audioTrack.packets.length > 0) {
        minNextTimestamp = Math.min(minNextTimestamp, audioTrack.packets[0].timestamp);
      }
      const nextSegmentStartTimestamp = minNextTimestamp < Infinity ? minNextTimestamp : maxEndTimestamp;
      assert(Number.isFinite(nextSegmentStartTimestamp));
      const segmentDuration = nextSegmentStartTimestamp - playlist.currentSegmentStartTimestamp;
      assert(segmentDuration >= 0);
      playlist.writtenSegments.push({
        path: relativeSegmentPath,
        duration: segmentDuration,
        timestamp: playlist.currentSegmentStartTimestamp,
        byteSize: segmentSize,
        byteOffset: playlist.singleFile ? playlist.singleFile.nextOffset : null,
        info: segmentInfo ?? null
      });
      this.globalTargetDuration = Math.max(this.globalTargetDuration, segmentDuration);
      playlist.currentSegmentStartTimestamp = nextSegmentStartTimestamp;
      playlist.currentSegmentStartTimestampIsFixed = true;
      if (playlist.singleFile) {
        playlist.singleFile.nextOffset += segmentSize;
      }
      if (this.isLive) {
        while (playlist.writtenSegments.length > this.maxLiveSegmentCount) {
          const popped = playlist.writtenSegments.shift();
          playlist.mediaSequence++;
          if (!this.singleFilePerPlaylist) {
            assert(popped.info);
            this.format._options.onSegmentPopped?.(popped.path, popped.info);
          }
        }
        await this.writePlaylist(playlist);
        await this.tryWriteMasterPlaylist();
      }
    }
  }
  async onPlaylistDone(playlist) {
    assert(!playlist.done);
    playlist.done = true;
    if (playlist.singleFile) {
      await playlist.singleFile.target._flush();
      await playlist.singleFile.target._finalize();
      this.format._options.onSegment?.(playlist.singleFile.target, playlist.singleFile.info);
    }
    await this.writePlaylist(playlist);
    if (this.isLive && playlist.writtenSegments.length === 0) {
      await this.tryWriteMasterPlaylist();
    }
  }
  updatePlaylistBitrates(playlist) {
    const segments = playlist.writtenSegments;
    let peakBitrate = 0;
    let totalBits = 0;
    let totalDuration = 0;
    for (let i = 0; i < segments.length; i++) {
      totalDuration += segments[i].duration;
      let windowBytes = 0;
      let windowDuration = 0;
      for (let j = i; j < segments.length; j++) {
        windowBytes += segments[j].byteSize;
        windowDuration += segments[j].duration;
        if (windowDuration >= 0.5 * this.globalTargetDuration && windowDuration <= 1.5 * this.globalTargetDuration) {
          peakBitrate = Math.max(peakBitrate, 8 * windowBytes / windowDuration);
        }
        if (windowDuration > 1.5 * this.globalTargetDuration) {
          break;
        }
      }
    }
    if (peakBitrate === 0) {
      for (const segment of segments) {
        const segmentDuration = segment.duration || 1;
        peakBitrate = Math.max(peakBitrate, 8 * segment.byteSize / segmentDuration);
      }
    }
    for (const segment of segments) {
      totalBits += 8 * segment.byteSize;
    }
    playlist.peakBitrate = peakBitrate;
    playlist.averageBitrate = totalBits / (totalDuration || 1);
  }
  async writePlaylist(playlist) {
    assert(this.output._target instanceof PathedTarget);
    const pathedTarget = this.output._target;
    this.updatePlaylistBitrates(playlist);
    let hasByteOffsets = false;
    for (const segment of playlist.writtenSegments) {
      hasByteOffsets ||= segment.byteOffset !== null;
    }
    const isKeyPacketsOnly = playlist.tracks[0].isVideoTrack() && playlist.tracks[0].metadata.hasOnlyKeyPackets;
    let version = 3;
    if (isKeyPacketsOnly || hasByteOffsets) {
      version = 4;
    }
    if (playlist.initSegment) {
      version = 5;
    }
    if (playlist.initSegment && !isKeyPacketsOnly) {
      version = 6;
    }
    const targetDuration = this.isLive ? this.targetSegmentDuration : this.globalTargetDuration;
    const playlistPath = joinPaths(pathedTarget.rootPath, playlist.path);
    const playlistText = `#EXTM3U
#EXT-X-VERSION:${version}
` + (!this.isLive ? "#EXT-X-PLAYLIST-TYPE:VOD\n" : "") + `#EXT-X-TARGETDURATION:${Math.ceil(targetDuration)}
` + (Number.isFinite(this.maxLiveSegmentCount) ? `#EXT-X-MEDIA-SEQUENCE:${playlist.mediaSequence}
` : "") + "#EXT-X-INDEPENDENT-SEGMENTS\n" + (isKeyPacketsOnly ? "#EXT-X-I-FRAMES-ONLY\n" : "") + (playlist.initSegment ? `#EXT-X-MAP:URI="${playlist.initSegment.path}"` + (playlist.initSegment.byteOffset !== null ? `,BYTERANGE="${playlist.initSegment.byteSize}@${playlist.initSegment.byteOffset}"` : "") + "\n" : "") + "\n" + playlist.writtenSegments.map((segment) => `#EXTINF:${+segment.duration.toFixed(12)},
` + (this.isRelativeToUnixEpoch ? `#EXT-X-PROGRAM-DATE-TIME:${new Date(1e3 * segment.timestamp).toISOString()}
` : "") + (segment.byteOffset !== null ? `#EXT-X-BYTERANGE:${segment.byteSize}@${segment.byteOffset}
` : "") + `${segment.path}
`).join("") + (playlist.done ? (playlist.writtenSegments.length > 0 ? "\n" : "") + "#EXT-X-ENDLIST\n" : "");
    this.format._options.onPlaylist?.(playlistText, toPlaylistInfo(playlist));
    const target = await this.output._getTarget({
      path: playlistPath,
      isRoot: false,
      mimeType: HLS_MIME_TYPE
    });
    const writer = new Writer(target, true);
    writer.start();
    writer.write(textEncoder.encode(playlistText));
    await writer.flush();
    await writer.finalize();
  }
  async writeMasterPlaylist() {
    assert(this.output._target instanceof PathedTarget);
    const pathedTarget = this.output._target;
    let masterPlaylistText = "#EXTM3U\n";
    let firstVariantWritten = false;
    let lastGroupId = null;
    let groupIdTrackCount = 0;
    let hasHadDefaultTrackInGroup = false;
    for (const decl of this.playlistDeclarations) {
      if (decl.groupId === null) {
        const isKeyPacketsOnly = decl.playlist.tracks[0].isVideoTrack() && decl.playlist.tracks[0].metadata.hasOnlyKeyPackets;
        const codecs = [];
        for (const track of decl.playlist.tracks) {
          const trackData = this.trackDatas.find((x) => x.track === track);
          const codecString = trackData?.info.decoderConfig.codec ?? track.source._codec;
          codecs.push(codecString);
        }
        let peakDeclBitrate = 0;
        let maxRefAverageBitrate = 0;
        if (decl.references.length > 0) {
          const firstRef = decl.references[0];
          const firstTrack = firstRef.playlist.tracks[0];
          const trackData = this.trackDatas.find((x) => x.track === firstTrack);
          const codecString = trackData?.info.decoderConfig.codec ?? firstTrack.source._codec;
          codecs.push(codecString);
          for (const ref of decl.references) {
            assert(ref.playlist.peakBitrate !== null);
            peakDeclBitrate = Math.max(peakDeclBitrate, ref.playlist.peakBitrate);
            maxRefAverageBitrate = Math.max(maxRefAverageBitrate, ref.playlist.averageBitrate ?? 0);
          }
        }
        assert(decl.playlist.peakBitrate !== null);
        const totalPeakBitrate = decl.playlist.peakBitrate + peakDeclBitrate;
        const totalAverageBitrate = (decl.playlist.averageBitrate ?? 0) + maxRefAverageBitrate;
        if (!firstVariantWritten) {
          masterPlaylistText += "\n";
          firstVariantWritten = true;
        }
        if (isKeyPacketsOnly) {
          masterPlaylistText += `#EXT-X-I-FRAME-STREAM-INF:`;
        } else {
          masterPlaylistText += `#EXT-X-STREAM-INF:`;
        }
        masterPlaylistText += `BANDWIDTH=${Math.ceil(totalPeakBitrate)}`;
        if (totalAverageBitrate > 0) {
          masterPlaylistText += `,AVERAGE-BANDWIDTH=${Math.ceil(totalAverageBitrate)}`;
        }
        masterPlaylistText += `,CODECS="${codecs.join(",")}"`;
        const videoTrack = decl.playlist.tracks.find((x) => x.isVideoTrack());
        if (videoTrack?.isVideoTrack()) {
          const trackData = this.trackDatas.find((x) => x.track === videoTrack);
          const decoderConfig = trackData?.info.decoderConfig;
          if (decoderConfig) {
            let width = decoderConfig.displayAspectWidth ?? decoderConfig.codedWidth;
            let height = decoderConfig.displayAspectHeight ?? decoderConfig.codedHeight;
            if (width !== void 0 && height !== void 0) {
              if (videoTrack.metadata.rotation !== void 0 && videoTrack.metadata.rotation % 180 === 90) {
                [width, height] = [height, width];
              }
              masterPlaylistText += `,RESOLUTION=${width}x${height}`;
            }
          }
          if (!isKeyPacketsOnly && videoTrack.metadata.frameRate !== void 0) {
            masterPlaylistText += `,FRAME-RATE=${+videoTrack.metadata.frameRate.toFixed(3)}`;
          }
        }
        if (!isKeyPacketsOnly) {
          const groupIdForType = /* @__PURE__ */ new Map();
          for (const ref of decl.references) {
            assert(ref.groupId !== null);
            const type = ref.playlist.tracks[0].type;
            groupIdForType.set(type, ref.groupId);
          }
          for (const [type, id] of groupIdForType) {
            masterPlaylistText += `,${type.toUpperCase()}="${id}"`;
          }
        }
        if (isKeyPacketsOnly) {
          masterPlaylistText += `,URI="${decl.playlist.path}"`;
          masterPlaylistText += "\n";
        } else {
          masterPlaylistText += "\n";
          masterPlaylistText += `${decl.playlist.path}
`;
        }
      } else {
        assert(decl.playlist.tracks.length === 1);
        const track = decl.playlist.tracks[0];
        const type = track.type;
        let name = track.metadata.name ?? null;
        const languageCode = track.metadata.languageCode;
        const disposition = track.metadata.disposition;
        if (lastGroupId === null || decl.groupId !== lastGroupId) {
          groupIdTrackCount = 0;
          masterPlaylistText += "\n";
          hasHadDefaultTrackInGroup = false;
        }
        lastGroupId = decl.groupId;
        groupIdTrackCount++;
        masterPlaylistText += `#EXT-X-MEDIA:TYPE=${type.toUpperCase()},GROUP-ID="${decl.groupId}"`;
        if (name !== null && /[\n\r"]/.test(name)) {
          console.warn("Dropping track name since it includes a line feed, carriage return, or double quote character, which are not allowed in HLS playlist attributes.");
          name = null;
        }
        name ??= `${languageCode ?? decl.groupId}-${groupIdTrackCount}`;
        masterPlaylistText += `,NAME="${name}"`;
        if (languageCode !== void 0) {
          masterPlaylistText += `,LANGUAGE="${languageCode}"`;
        }
        const dispositionPrimary = disposition?.primary ?? false;
        const dispositionDefault = disposition?.default ?? true;
        const dispositionForced = disposition?.forced ?? false;
        if (dispositionPrimary && !hasHadDefaultTrackInGroup) {
          masterPlaylistText += ",DEFAULT=YES";
          hasHadDefaultTrackInGroup = true;
        }
        if (dispositionPrimary || dispositionDefault) {
          masterPlaylistText += ",AUTOSELECT=YES";
        }
        if (dispositionForced) {
          masterPlaylistText += ",FORCED=YES";
        }
        if (type === "audio") {
          const trackData = this.trackDatas.find((x) => x.track === track);
          const decoderConfig = trackData?.info.decoderConfig;
          if (decoderConfig) {
            masterPlaylistText += `,CHANNELS="${decoderConfig.numberOfChannels}"`;
          }
        }
        if (!decl.noUri) {
          masterPlaylistText += `,URI="${decl.playlist.path}"`;
        }
        masterPlaylistText += "\n";
      }
    }
    this.format._options.onMaster?.(masterPlaylistText);
    const release = await this.mutex.acquire();
    try {
      let writer;
      if (this.numWrittenMasterPlaylists === 0) {
        writer = await this.output._getRootWriter(true);
      } else {
        const target = await this.output._getTarget({
          path: pathedTarget.rootPath,
          isRoot: true,
          mimeType: HLS_MIME_TYPE
        });
        writer = new Writer(target, true);
        writer.start();
      }
      writer.write(textEncoder.encode(masterPlaylistText));
      await writer.flush();
      await writer.finalize();
      this.numWrittenMasterPlaylists++;
    } finally {
      release();
    }
  }
  async tryWriteMasterPlaylist() {
    assert(this.isLive);
    for (const playlist of this.playlists) {
      if (playlist.writtenSegments.length === 0 && !playlist.done) {
        return;
      }
    }
    await this.writeMasterPlaylist();
  }
  async finalize() {
    const releases = await Promise.all(this.playlists.map((p) => p.mutex.acquire()));
    releases.forEach((release) => release());
    for (const trackData of this.trackDatas) {
      trackData.closed = true;
    }
    await Promise.all(this.playlists.map((playlist) => playlist.done ? Promise.resolve() : this.advancePlaylist(playlist)));
    if (!this.isLive) {
      await this.writeMasterPlaylist();
    }
  }
};
var validatePlaylistPath = (path) => {
  if (typeof path !== "string") {
    throw new TypeError("options.getPlaylistPath must return or resolve to a string");
  }
  if (/[\n\r"]/.test(path)) {
    throw new TypeError("Playlist paths cannot contain line feed, carriage return, or double quote characters.");
  }
};
var validateSegmentPath = (path) => {
  if (typeof path !== "string") {
    throw new TypeError("options.getSegmentPath must return or resolve to a string");
  }
  if (/[\n\r"]/.test(path)) {
    throw new TypeError("Segment paths cannot contain line feed or carriage return characters.");
  }
};
var validateInitPath = (path) => {
  if (typeof path !== "string") {
    throw new TypeError("options.getInitPath must return or resolve to a string");
  }
  if (/[\n\r"]/.test(path)) {
    throw new TypeError("Init paths cannot contain line feed, carriage return, or double quote characters.");
  }
};
var toPlaylistInfo = (playlist) => {
  return {
    n: playlist.id,
    tracks: playlist.tracks,
    segmentFormat: playlist.segmentFormat
  };
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/output-format.js
var OutputFormat = class {
  /** Returns a list of video codecs that this output format can contain. */
  getSupportedVideoCodecs() {
    return this.getSupportedCodecs().filter((codec) => VIDEO_CODECS.includes(codec));
  }
  /** Returns a list of audio codecs that this output format can contain. */
  getSupportedAudioCodecs() {
    return this.getSupportedCodecs().filter((codec) => AUDIO_CODECS.includes(codec));
  }
  /** Returns a list of subtitle codecs that this output format can contain. */
  getSupportedSubtitleCodecs() {
    return this.getSupportedCodecs().filter((codec) => SUBTITLE_CODECS.includes(codec));
  }
  /** @internal */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _codecUnsupportedHint(codec) {
    return "";
  }
};
var IsobmffOutputFormat = class extends OutputFormat {
  /** Internal constructor. */
  constructor(options = {}) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.fastStart !== void 0 && ![false, "in-memory", "reserve", "fragmented"].includes(options.fastStart)) {
      throw new TypeError("options.fastStart, when provided, must be false, 'in-memory', 'reserve', or 'fragmented'.");
    }
    if (options.minimumFragmentDuration !== void 0 && (!Number.isFinite(options.minimumFragmentDuration) || options.minimumFragmentDuration < 0)) {
      throw new TypeError("options.minimumFragmentDuration, when provided, must be a non-negative number.");
    }
    if (options.onFtyp !== void 0 && typeof options.onFtyp !== "function") {
      throw new TypeError("options.onFtyp, when provided, must be a function.");
    }
    if (options.onMoov !== void 0 && typeof options.onMoov !== "function") {
      throw new TypeError("options.onMoov, when provided, must be a function.");
    }
    if (options.onMdat !== void 0 && typeof options.onMdat !== "function") {
      throw new TypeError("options.onMdat, when provided, must be a function.");
    }
    if (options.onMoof !== void 0 && typeof options.onMoof !== "function") {
      throw new TypeError("options.onMoof, when provided, must be a function.");
    }
    if (options.metadataFormat !== void 0 && !["mdir", "mdta", "udta", "auto"].includes(options.metadataFormat)) {
      throw new TypeError("options.metadataFormat, when provided, must be either 'auto', 'mdir', 'mdta', or 'udta'.");
    }
    super();
    this._options = options;
  }
  getSupportedTrackCounts() {
    const max = 2 ** 32 - 1;
    return {
      video: { min: 0, max },
      audio: { min: 0, max },
      subtitle: { min: 0, max },
      total: { min: 1, max }
    };
  }
  get supportsVideoRotationMetadata() {
    return true;
  }
  get supportsTimestampedMediaData() {
    return true;
  }
  /** @internal */
  _createMuxer(output) {
    return new IsobmffMuxer(output, this);
  }
};
var Mp4OutputFormat = class extends IsobmffOutputFormat {
  /** Creates a new {@link Mp4OutputFormat} configured with the specified `options`. */
  constructor(options) {
    super(options);
  }
  /** @internal */
  get _name() {
    return "MP4";
  }
  get fileExtension() {
    return ".mp4";
  }
  get mimeType() {
    return "video/mp4";
  }
  getSupportedCodecs() {
    return [
      ...VIDEO_CODECS,
      ...NON_PCM_AUDIO_CODECS,
      // These are supported via ISO/IEC 23003-5:
      "pcm-s16",
      "pcm-s16be",
      "pcm-s24",
      "pcm-s24be",
      "pcm-s32",
      "pcm-s32be",
      "pcm-f32",
      "pcm-f32be",
      "pcm-f64",
      "pcm-f64be",
      ...SUBTITLE_CODECS
    ];
  }
  /** @internal */
  _codecUnsupportedHint(codec) {
    if (new MovOutputFormat().getSupportedCodecs().includes(codec)) {
      return " Switching to MOV will grant support for this codec.";
    }
    return "";
  }
};
var CmafOutputFormat = class extends IsobmffOutputFormat {
  /** Creates a new {@link CmafOutputFormat} configured with the specified `options`. */
  constructor(options) {
    super(options);
  }
  /** @internal */
  get _name() {
    return "CMAF";
  }
  get fileExtension() {
    return ".m4s";
  }
  get mimeType() {
    return "video/mp4";
  }
  getSupportedCodecs() {
    return [
      ...VIDEO_CODECS,
      ...NON_PCM_AUDIO_CODECS,
      // These are supported via ISO/IEC 23003-5:
      "pcm-s16",
      "pcm-s16be",
      "pcm-s24",
      "pcm-s24be",
      "pcm-s32",
      "pcm-s32be",
      "pcm-f32",
      "pcm-f32be",
      "pcm-f64",
      "pcm-f64be",
      ...SUBTITLE_CODECS
    ];
  }
};
var MovOutputFormat = class extends IsobmffOutputFormat {
  /** Creates a new {@link MovOutputFormat} configured with the specified `options`. */
  constructor(options) {
    super(options);
  }
  /** @internal */
  get _name() {
    return "MOV";
  }
  get fileExtension() {
    return ".mov";
  }
  get mimeType() {
    return "video/quicktime";
  }
  getSupportedCodecs() {
    return [
      ...VIDEO_CODECS,
      ...AUDIO_CODECS
    ];
  }
  /** @internal */
  _codecUnsupportedHint(codec) {
    if (new Mp4OutputFormat().getSupportedCodecs().includes(codec)) {
      return " Switching to MP4 will grant support for this codec.";
    }
    return "";
  }
};
var MpegTsOutputFormat = class extends OutputFormat {
  /** Creates a new {@link MpegTsOutputFormat} configured with the specified `options`. */
  constructor(options = {}) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.onPacket !== void 0 && typeof options.onPacket !== "function") {
      throw new TypeError("options.onPacket, when provided, must be a function.");
    }
    super();
    this._options = options;
  }
  /** @internal */
  _createMuxer(output) {
    return new MpegTsMuxer(output, this);
  }
  /** @internal */
  get _name() {
    return "MPEG-TS";
  }
  getSupportedTrackCounts() {
    const maxVideo = 16;
    const maxAudio = 32;
    const maxTotal = maxVideo + maxAudio;
    return {
      video: { min: 0, max: maxVideo },
      audio: { min: 0, max: maxAudio },
      subtitle: { min: 0, max: 0 },
      total: { min: 1, max: maxTotal }
    };
  }
  get fileExtension() {
    return ".ts";
  }
  get mimeType() {
    return "video/MP2T";
  }
  getSupportedCodecs() {
    return [
      ...VIDEO_CODECS.filter((codec) => ["avc", "hevc"].includes(codec)),
      ...AUDIO_CODECS.filter((codec) => ["aac", "mp3", "ac3", "eac3"].includes(codec))
    ];
  }
  get supportsVideoRotationMetadata() {
    return false;
  }
  get supportsTimestampedMediaData() {
    return true;
  }
};
var HlsOutputFormat = class extends OutputFormat {
  /** Creates a new {@link HlsOutputFormat} configured with the specified `options`. */
  constructor(options) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!(options.segmentFormat instanceof OutputFormat) && (!Array.isArray(options.segmentFormat) || options.segmentFormat.length === 0 || !options.segmentFormat.every((format) => format instanceof OutputFormat))) {
      throw new TypeError("options.segmentFormat must be an OutputFormat or a non-empty array of OutputFormat instances.");
    }
    if (options.targetDuration !== void 0 && (typeof options.targetDuration !== "number" || options.targetDuration <= 0)) {
      throw new TypeError("options.targetDuration, when provided, must be a positive number.");
    }
    if (options.singleFilePerPlaylist !== void 0 && typeof options.singleFilePerPlaylist !== "boolean") {
      throw new TypeError("options.singleFilePerPlaylist, when provided, must be a boolean.");
    }
    if (options.live !== void 0 && typeof options.live !== "boolean") {
      throw new TypeError("options.live, when provided, must be a boolean.");
    }
    if (options.maxLiveSegmentCount !== void 0 && (typeof options.maxLiveSegmentCount !== "number" || options.maxLiveSegmentCount < 1 || Number.isFinite(options.maxLiveSegmentCount) && !Number.isInteger(options.maxLiveSegmentCount))) {
      throw new TypeError("options.maxLiveSegmentCount, when provided, must be a positive integer or Infinity.");
    }
    if (options.getPlaylistPath !== void 0 && typeof options.getPlaylistPath !== "function") {
      throw new TypeError("options.getPlaylistPath, when provided, must be a function.");
    }
    if (options.getSegmentPath !== void 0 && typeof options.getSegmentPath !== "function") {
      throw new TypeError("options.getSegmentPath, when provided, must be a function.");
    }
    if (options.getInitPath !== void 0 && typeof options.getInitPath !== "function") {
      throw new TypeError("options.getInitPath, when provided, must be a function.");
    }
    if (options.onMaster !== void 0 && typeof options.onMaster !== "function") {
      throw new TypeError("options.onMaster, when provided, must be a function.");
    }
    if (options.onPlaylist !== void 0 && typeof options.onPlaylist !== "function") {
      throw new TypeError("options.onPlaylist, when provided, must be a function.");
    }
    if (options.onSegment !== void 0 && typeof options.onSegment !== "function") {
      throw new TypeError("options.onSegment, when provided, must be a function.");
    }
    if (options.onInit !== void 0 && typeof options.onInit !== "function") {
      throw new TypeError("options.onInit, when provided, must be a function.");
    }
    if (options.onSegmentPopped !== void 0 && typeof options.onSegmentPopped !== "function") {
      throw new TypeError("options.onSegmentPopped, when provided, must be a function.");
    }
    super();
    this._options = options;
  }
  /** @internal */
  _createMuxer(output) {
    return new HlsMuxer(output, this);
  }
  /** @internal */
  get _name() {
    return "HTTP Live Streaming (HLS)";
  }
  get fileExtension() {
    return ".m3u8";
  }
  get mimeType() {
    return HLS_MIME_TYPE;
  }
  getSupportedCodecs() {
    const uniqueCodecs = new Set(toArray(this._options.segmentFormat).flatMap((x) => x.getSupportedCodecs()));
    return [...uniqueCodecs];
  }
  getSupportedTrackCounts() {
    let supportsVideo = false;
    let supportsAudio = false;
    let supportsSubtitle = false;
    for (const format of toArray(this._options.segmentFormat)) {
      const trackCounts = format.getSupportedTrackCounts();
      supportsVideo ||= trackCounts.video.max > 0;
      supportsAudio ||= trackCounts.audio.max > 0;
      supportsSubtitle ||= trackCounts.subtitle.max > 0;
    }
    return {
      video: { min: 0, max: supportsVideo ? Infinity : 0 },
      audio: { min: 0, max: supportsAudio ? Infinity : 0 },
      subtitle: { min: 0, max: 0 },
      // Currently disabled
      total: { min: 1, max: Infinity }
    };
  }
  get supportsVideoRotationMetadata() {
    return toArray(this._options.segmentFormat).some((format) => format.supportsVideoRotationMetadata);
  }
  get supportsTimestampedMediaData() {
    return true;
  }
  /** @internal */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _codecUnsupportedHint(codec) {
    return ` Using different segment formats may grant support for this codec.`;
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/output.js
var ALL_TRACK_TYPES = ["video", "audio", "subtitle"];
var OutputTrack = class _OutputTrack {
  /** @internal */
  constructor(id, output, type, source, metadata) {
    this.id = id;
    this.output = output;
    this.type = type;
    this.source = source;
    this.metadata = metadata;
  }
  /** Returns true if and only if this track is a video track. */
  isVideoTrack() {
    return this.type === "video";
  }
  /** Returns true if and only if this track is an audio track. */
  isAudioTrack() {
    return this.type === "audio";
  }
  /** Returns true if and only if this track is a subtitle track. */
  isSubtitleTrack() {
    return this.type === "subtitle";
  }
  /**
   * Returns true if and only if this track can be paired with the given other track. Pairability can be set using
   * the {@link BaseTrackMetadata.group} option.
   */
  canBePairedWith(other) {
    if (!(other instanceof _OutputTrack)) {
      throw new TypeError("other must be an OutputTrack.");
    }
    if (this === other) {
      return false;
    }
    const thisGroups = toArray(this.metadata.group);
    const otherGroups = toArray(other.metadata.group);
    for (const aGroup of thisGroups) {
      const pairableInSameGroup = this.type !== other.type && otherGroups.some((bGroup) => aGroup === bGroup);
      if (pairableInSameGroup) {
        return true;
      }
      const pairableAcrossGroups = otherGroups.some((bGroup) => aGroup._pairedGroups.has(bGroup));
      if (pairableAcrossGroups) {
        return true;
      }
    }
    return false;
  }
};
var OutputVideoTrack = class extends OutputTrack {
  /** @internal */
  constructor(id, output, source, metadata) {
    super(id, output, "video", source, metadata);
  }
};
var OutputAudioTrack = class extends OutputTrack {
  /** @internal */
  constructor(id, output, source, metadata) {
    super(id, output, "audio", source, metadata);
  }
};
var OutputSubtitleTrack = class extends OutputTrack {
  /** @internal */
  constructor(id, output, source, metadata) {
    super(id, output, "subtitle", source, metadata);
  }
};
var OutputTrackGroup = class _OutputTrackGroup {
  /** Creates a new {@link OutputTrackGroup}. */
  constructor() {
    this._pairedGroups = /* @__PURE__ */ new Set();
  }
  /**
   * Marks this group as being pairable with another group, symmetrically. Output tracks where each track is assigned
   * to one half of a group pairing are then considered pairable.
   *
   * You cannot pair a group with itself.
   */
  pairWith(other) {
    if (!(other instanceof _OutputTrackGroup)) {
      throw new TypeError("other must be an OutputTrackGroup.");
    }
    if (this === other) {
      throw new TypeError("Cannot pair a group with itself.");
    }
    this._pairedGroups.add(other);
    other._pairedGroups.add(this);
  }
};
var validateBaseTrackMetadata = (metadata) => {
  if (!metadata || typeof metadata !== "object") {
    throw new TypeError("metadata must be an object.");
  }
  if (metadata.languageCode !== void 0 && !isIso639Dash2LanguageCode(metadata.languageCode)) {
    throw new TypeError("metadata.languageCode, when provided, must be a three-letter, ISO 639-2/T language code.");
  }
  if (metadata.name !== void 0 && typeof metadata.name !== "string") {
    throw new TypeError("metadata.name, when provided, must be a string.");
  }
  if (metadata.disposition !== void 0) {
    validateTrackDisposition(metadata.disposition);
  }
  if (metadata.maximumPacketCount !== void 0 && (!Number.isInteger(metadata.maximumPacketCount) || metadata.maximumPacketCount < 0)) {
    throw new TypeError("metadata.maximumPacketCount, when provided, must be a non-negative integer.");
  }
  if (metadata.group !== void 0 && !(metadata.group instanceof OutputTrackGroup) && (!Array.isArray(metadata.group) || metadata.group.some((group) => !(group instanceof OutputTrackGroup)))) {
    throw new TypeError("metadata.group, when provided, must be an OutputTrackGroup instance or an array of OutputTrackGroup instances.");
  }
};
var Output = class extends EventEmitter {
  /**
   * The target to which the root file will be written. Throws when using {@link PathedTarget} with an async callback;
   * prefer the `'target'` event for those cases.
   */
  get target() {
    const errorMessage = "Output.target cannot be used when using PathedTarget with an async callback. Use the 'target' event instead.";
    if (this._rootTargetPromise) {
      throw new TypeError(errorMessage);
    }
    const rootTargetResult = this._getRootTarget();
    if (rootTargetResult instanceof Promise) {
      throw new TypeError(errorMessage);
    }
    return rootTargetResult;
  }
  /**
   * Creates a new instance of {@link Output} which can then be used to create a new media file according to the
   * specified {@link OutputOptions}.
   */
  constructor(options) {
    super();
    this.state = "pending";
    this.defaultTrackGroup = new OutputTrackGroup();
    this._onFinalize = null;
    this._unfinalizedTargets = /* @__PURE__ */ new Set();
    this._rootWriterPromise = null;
    this._tracks = [];
    this._startPromise = null;
    this._cancelPromise = null;
    this._finalizePromise = null;
    this._mutex = new AsyncMutex();
    this._metadataTags = {};
    this._rootTarget = null;
    this._rootTargetPromise = null;
    this._firstMediaStreamTimestamp = null;
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!(options.format instanceof OutputFormat)) {
      throw new TypeError("options.format must be an OutputFormat.");
    }
    if (!(options.target instanceof Target || options.target instanceof PathedTarget)) {
      throw new TypeError("options.target must be a Target or a PathedTarget.");
    }
    if (options.target instanceof Target) {
      this._rememberTarget(options.target);
    }
    if (options.initTarget !== void 0 && !(options.initTarget instanceof Target) && typeof options.initTarget !== "function") {
      throw new Error("options.initTarget, when provided, must be a Target or a function that returns or resolves to a Target.");
    }
    if (options.onFinalize !== void 0 && typeof options.onFinalize !== "function") {
      throw new TypeError("options.onFinalize, when provided, must be a function.");
    }
    this.format = options.format;
    this._target = options.target;
    this._onFinalize = options.onFinalize ?? null;
    this._initTarget = options.initTarget ?? null;
    if (this._initTarget instanceof Target) {
      this._rememberTarget(this._initTarget);
    }
    this._muxer = options.format._createMuxer(this);
  }
  /** @internal */
  _getTargetValidated(request) {
    assert(this._target instanceof PathedTarget);
    const result = this._target.getTarget(request);
    const handleResult = (result2) => {
      if (!(result2 instanceof Target)) {
        throw new TypeError("getTarget must return a Target.");
      }
      return result2;
    };
    if (result instanceof Promise) {
      return result.then(handleResult);
    } else {
      return handleResult(result);
    }
  }
  /** @internal */
  async _getTarget(request) {
    assert(this._target instanceof PathedTarget);
    const target = await this._getTargetValidated(request);
    this._emit("target", { target, request, isRoot: request.isRoot });
    if (this.state === "canceled") {
      await target._close();
    } else {
      this._rememberTarget(target);
    }
    return target;
  }
  /** @internal */
  _rememberTarget(target) {
    this._unfinalizedTargets.add(target);
    target.on("finalized", () => this._unfinalizedTargets.delete(target), { once: true });
  }
  /** @internal */
  async _getInitTarget() {
    assert(this._initTarget !== null);
    if (this._initTarget instanceof Target) {
      return this._initTarget;
    }
    const target = await this._initTarget();
    if (this.state === "canceled") {
      await target._close();
    } else {
      this._rememberTarget(target);
    }
    return target;
  }
  /** @internal */
  _hasInitTarget() {
    return this._initTarget !== null;
  }
  /** @internal */
  _getRootTarget() {
    if (this._rootTarget) {
      return this._rootTarget;
    }
    if (this._rootTargetPromise) {
      return this._rootTargetPromise;
    }
    if (this._target instanceof Target) {
      this._emit("target", { target: this._target, request: null, isRoot: true });
      this._rootTarget = this._target;
      return this._target;
    }
    const request = {
      path: this._target.rootPath,
      isRoot: true,
      mimeType: this.format.mimeType
    };
    const result = this._getTargetValidated(request);
    const handleResult = (target) => {
      if (this.state === "canceled") {
        void target._close();
      } else {
        this._rememberTarget(target);
      }
      this._emit("target", { target, request, isRoot: true });
      this._rootTarget = target;
      return target;
    };
    if (result instanceof Promise) {
      return this._rootTargetPromise = result.then(handleResult);
    } else {
      return handleResult(result);
    }
  }
  /** @internal */
  _getRootWriter(isMonotonic) {
    return this._rootWriterPromise ??= (async () => {
      const target = await this._getRootTarget();
      const writer = new Writer(target, typeof isMonotonic === "boolean" ? isMonotonic : isMonotonic(target));
      writer.start();
      return writer;
    })();
  }
  /** Adds a video track to the output with the given source. Can only be called before the output is started. */
  addVideoTrack(source, metadata = {}) {
    if (!(source instanceof VideoSource)) {
      throw new TypeError("source must be a VideoSource.");
    }
    validateBaseTrackMetadata(metadata);
    if (metadata.rotation !== void 0 && ![0, 90, 180, 270].includes(metadata.rotation)) {
      throw new TypeError(`Invalid video rotation: ${metadata.rotation}. Has to be 0, 90, 180 or 270.`);
    }
    if (!this.format.supportsVideoRotationMetadata && metadata.rotation) {
      throw new Error(`${this.format._name} does not support video rotation metadata.`);
    }
    if (metadata.frameRate !== void 0 && (!Number.isFinite(metadata.frameRate) || metadata.frameRate <= 0)) {
      throw new TypeError(`Invalid video frame rate: ${metadata.frameRate}. Must be a positive number.`);
    }
    const metadataCopy = { ...metadata };
    metadataCopy.group ??= this.defaultTrackGroup;
    return this._addTrack(new OutputVideoTrack(this._tracks.length + 1, this, source, metadataCopy));
  }
  /** Adds an audio track to the output with the given source. Can only be called before the output is started. */
  addAudioTrack(source, metadata = {}) {
    if (!(source instanceof AudioSource)) {
      throw new TypeError("source must be an AudioSource.");
    }
    validateBaseTrackMetadata(metadata);
    const metadataCopy = { ...metadata };
    metadataCopy.group ??= this.defaultTrackGroup;
    return this._addTrack(new OutputAudioTrack(this._tracks.length + 1, this, source, metadataCopy));
  }
  /** Adds a subtitle track to the output with the given source. Can only be called before the output is started. */
  addSubtitleTrack(source, metadata = {}) {
    if (!(source instanceof SubtitleSource)) {
      throw new TypeError("source must be a SubtitleSource.");
    }
    validateBaseTrackMetadata(metadata);
    const metadataCopy = { ...metadata };
    metadataCopy.group ??= this.defaultTrackGroup;
    return this._addTrack(new OutputSubtitleTrack(this._tracks.length + 1, this, source, metadataCopy));
  }
  /**
   * Sets descriptive metadata tags about the media file, such as title, author, date, or cover art. When called
   * multiple times, only the metadata from the last call will be used.
   *
   * Can only be called before the output is started.
   */
  setMetadataTags(tags) {
    validateMetadataTags(tags);
    if (this.state !== "pending") {
      throw new Error("Cannot set metadata tags after output has been started or canceled.");
    }
    this._metadataTags = tags;
  }
  /** @internal */
  _addTrack(track) {
    if (this.state !== "pending") {
      throw new Error("Cannot add track after output has been started or canceled.");
    }
    if (track.source._connectedTrack) {
      throw new Error("Source is already used for a track.");
    }
    const supportedTrackCounts = this.format.getSupportedTrackCounts();
    const presentTracksOfThisType = this._tracks.reduce((count, t) => count + (t.type === track.type ? 1 : 0), 0);
    const maxCount = supportedTrackCounts[track.type].max;
    if (presentTracksOfThisType === maxCount) {
      throw new Error(maxCount === 0 ? `${this.format._name} does not support ${track.type} tracks.` : `${this.format._name} does not support more than ${maxCount} ${track.type} track${maxCount === 1 ? "" : "s"}.`);
    }
    const maxTotalCount = supportedTrackCounts.total.max;
    if (this._tracks.length === maxTotalCount) {
      throw new Error(`${this.format._name} does not support more than ${maxTotalCount} tracks${maxTotalCount === 1 ? "" : "s"} in total.`);
    }
    if (track.isVideoTrack()) {
      const supportedVideoCodecs = this.format.getSupportedVideoCodecs();
      if (supportedVideoCodecs.length === 0) {
        throw new Error(`${this.format._name} does not support video tracks.` + this.format._codecUnsupportedHint(track.source._codec));
      } else if (!supportedVideoCodecs.includes(track.source._codec)) {
        throw new Error(`Codec '${track.source._codec}' cannot be contained within ${this.format._name}. Supported video codecs are: ${supportedVideoCodecs.map((codec) => `'${codec}'`).join(", ")}.` + this.format._codecUnsupportedHint(track.source._codec));
      }
    } else if (track.isAudioTrack()) {
      const supportedAudioCodecs = this.format.getSupportedAudioCodecs();
      if (supportedAudioCodecs.length === 0) {
        throw new Error(`${this.format._name} does not support audio tracks.` + this.format._codecUnsupportedHint(track.source._codec));
      } else if (!supportedAudioCodecs.includes(track.source._codec)) {
        throw new Error(`Codec '${track.source._codec}' cannot be contained within ${this.format._name}. Supported audio codecs are: ${supportedAudioCodecs.map((codec) => `'${codec}'`).join(", ")}.` + this.format._codecUnsupportedHint(track.source._codec));
      }
    } else if (track.isSubtitleTrack()) {
      const supportedSubtitleCodecs = this.format.getSupportedSubtitleCodecs();
      if (supportedSubtitleCodecs.length === 0) {
        throw new Error(`${this.format._name} does not support subtitle tracks.` + this.format._codecUnsupportedHint(track.source._codec));
      } else if (!supportedSubtitleCodecs.includes(track.source._codec)) {
        throw new Error(`Codec '${track.source._codec}' cannot be contained within ${this.format._name}. Supported subtitle codecs are: ${supportedSubtitleCodecs.map((codec) => `'${codec}'`).join(", ")}.` + this.format._codecUnsupportedHint(track.source._codec));
      }
    }
    this._tracks.push(track);
    track.source._connectedTrack = track;
    return track;
  }
  /**
   * Starts the creation of the output file. This method should be called after all tracks have been added. Only after
   * the output has started can media samples be added to the tracks.
   *
   * @returns A promise that resolves when the output has successfully started and is ready to receive media samples.
   */
  async start() {
    const supportedTrackCounts = this.format.getSupportedTrackCounts();
    for (const trackType of ALL_TRACK_TYPES) {
      const presentTracksOfThisType = this._tracks.reduce((count, track) => count + (track.type === trackType ? 1 : 0), 0);
      const minCount = supportedTrackCounts[trackType].min;
      if (presentTracksOfThisType < minCount) {
        throw new Error(minCount === supportedTrackCounts[trackType].max ? `${this.format._name} requires exactly ${minCount} ${trackType} track${minCount === 1 ? "" : "s"}.` : `${this.format._name} requires at least ${minCount} ${trackType} track${minCount === 1 ? "" : "s"}.`);
      }
    }
    const totalMinCount = supportedTrackCounts.total.min;
    if (this._tracks.length < totalMinCount) {
      throw new Error(totalMinCount === supportedTrackCounts.total.max ? `${this.format._name} requires exactly ${totalMinCount} track${totalMinCount === 1 ? "" : "s"}.` : `${this.format._name} requires at least ${totalMinCount} track${totalMinCount === 1 ? "" : "s"}.`);
    }
    if (this.state === "canceled") {
      throw new Error("Output has been canceled.");
    }
    if (this._startPromise) {
      console.warn("Output has already been started.");
      return this._startPromise;
    }
    return this._startPromise = (async () => {
      this.state = "started";
      const release = await this._mutex.acquire();
      try {
        await this._muxer.start();
        const promises = this._tracks.map((track) => track.source._start());
        await Promise.all(promises);
      } finally {
        release();
      }
    })();
  }
  /**
   * Resolves with the full MIME type of the output file, including track codecs.
   *
   * The returned promise will resolve only once the precise codec strings of all tracks are known.
   */
  getMimeType() {
    return this._muxer.getMimeType();
  }
  /**
   * Cancels the creation of the output file, releasing internal resources like encoders and preventing further
   * samples from being added.
   *
   * @returns A promise that resolves once all internal resources have been released.
   */
  async cancel() {
    if (this._cancelPromise) {
      console.warn("Output has already been canceled.");
      return this._cancelPromise;
    } else if (this.state === "finalizing" || this.state === "finalized") {
      if (this.state === "finalized") {
        console.warn("Output has already been finalized.");
      }
      return;
    }
    return this._cancelPromise = (async () => {
      this.state = "canceled";
      const release = await this._mutex.acquire();
      try {
        const promises = this._tracks.map((x) => x.source._flushOrWaitForOngoingClose(true));
        await Promise.all(promises);
        await Promise.all([...this._unfinalizedTargets].map((target) => target._close()));
        this._unfinalizedTargets.clear();
      } finally {
        release();
      }
    })();
  }
  /**
   * Finalizes the output file. This method must be called after all media samples across all tracks have been added.
   * Once the Promise returned by this method completes, the output file is ready.
   */
  async finalize() {
    if (this.state === "pending") {
      throw new Error("Cannot finalize before starting.");
    }
    if (this.state === "canceled") {
      throw new Error("Cannot finalize after canceling.");
    }
    if (this._finalizePromise) {
      console.warn("Output has already been finalized.");
      return this._finalizePromise;
    }
    return this._finalizePromise = (async () => {
      this.state = "finalizing";
      const release = await this._mutex.acquire();
      try {
        const promises = this._tracks.map((x) => x.source._flushOrWaitForOngoingClose(false));
        await Promise.all(promises);
        await this._muxer.finalize();
        if (this._rootWriterPromise) {
          const rootWriter = await this._rootWriterPromise;
          if (!rootWriter.finalized) {
            await rootWriter.flush();
            await rootWriter.finalize();
          }
        }
        if (this._onFinalize) {
          await this._onFinalize();
        }
        this.state = "finalized";
      } finally {
        release();
      }
    })();
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/conversion.js
var validateVideoOptions = (videoOptions) => {
  if (!videoOptions || typeof videoOptions !== "object") {
    throw new TypeError("options.video, when provided, must be an object.");
  }
  if (videoOptions?.discard !== void 0 && typeof videoOptions.discard !== "boolean") {
    throw new TypeError("options.video.discard, when provided, must be a boolean.");
  }
  if (videoOptions?.forceTranscode !== void 0 && typeof videoOptions.forceTranscode !== "boolean") {
    throw new TypeError("options.video.forceTranscode, when provided, must be a boolean.");
  }
  if (videoOptions?.codec !== void 0 && !VIDEO_CODECS.includes(videoOptions.codec)) {
    throw new TypeError(`options.video.codec, when provided, must be one of: ${VIDEO_CODECS.join(", ")}.`);
  }
  if (videoOptions?.bitrate !== void 0 && !(videoOptions.bitrate instanceof Quality) && (!Number.isInteger(videoOptions.bitrate) || videoOptions.bitrate <= 0)) {
    throw new TypeError("options.video.bitrate, when provided, must be a positive integer or a quality.");
  }
  if (videoOptions?.width !== void 0 && (!Number.isInteger(videoOptions.width) || videoOptions.width <= 0)) {
    throw new TypeError("options.video.width, when provided, must be a positive integer.");
  }
  if (videoOptions?.height !== void 0 && (!Number.isInteger(videoOptions.height) || videoOptions.height <= 0)) {
    throw new TypeError("options.video.height, when provided, must be a positive integer.");
  }
  if (videoOptions?.fit !== void 0 && !["fill", "contain", "cover"].includes(videoOptions.fit)) {
    throw new TypeError("options.video.fit, when provided, must be one of 'fill', 'contain', or 'cover'.");
  }
  if (videoOptions?.width !== void 0 && videoOptions.height !== void 0 && videoOptions.fit === void 0) {
    throw new TypeError("When both options.video.width and options.video.height are provided, options.video.fit must also be provided.");
  }
  if (videoOptions?.rotate !== void 0 && ![0, 90, 180, 270].includes(videoOptions.rotate)) {
    throw new TypeError("options.video.rotate, when provided, must be 0, 90, 180 or 270.");
  }
  if (videoOptions?.allowRotationMetadata !== void 0 && typeof videoOptions.allowRotationMetadata !== "boolean") {
    throw new TypeError("options.video.allowRotationMetadata, when provided, must be a boolean.");
  }
  if (videoOptions?.crop !== void 0) {
    validateCropRectangle(videoOptions.crop, "options.video.");
  }
  if (videoOptions?.frameRate !== void 0 && (!Number.isFinite(videoOptions.frameRate) || videoOptions.frameRate <= 0)) {
    throw new TypeError("options.video.frameRate, when provided, must be a finite positive number.");
  }
  if (videoOptions?.alpha !== void 0 && !["discard", "keep"].includes(videoOptions.alpha)) {
    throw new TypeError("options.video.alpha, when provided, must be either 'discard' or 'keep'.");
  }
  if (videoOptions?.keyFrameInterval !== void 0 && (!Number.isFinite(videoOptions.keyFrameInterval) || videoOptions.keyFrameInterval < 0)) {
    throw new TypeError("options.video.keyFrameInterval, when provided, must be a non-negative number.");
  }
  if (videoOptions?.process !== void 0 && typeof videoOptions.process !== "function") {
    throw new TypeError("options.video.process, when provided, must be a function.");
  }
  if (videoOptions?.processedWidth !== void 0 && (!Number.isInteger(videoOptions.processedWidth) || videoOptions.processedWidth <= 0)) {
    throw new TypeError("options.video.processedWidth, when provided, must be a positive integer.");
  }
  if (videoOptions?.processedHeight !== void 0 && (!Number.isInteger(videoOptions.processedHeight) || videoOptions.processedHeight <= 0)) {
    throw new TypeError("options.video.processedHeight, when provided, must be a positive integer.");
  }
  if (videoOptions?.hardwareAcceleration !== void 0 && !["no-preference", "prefer-hardware", "prefer-software"].includes(videoOptions.hardwareAcceleration)) {
    throw new TypeError("options.video.hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");
  }
  if (videoOptions?.group !== void 0 && !(videoOptions.group instanceof OutputTrackGroup || Array.isArray(videoOptions.group) && videoOptions.group.every((x) => x instanceof OutputTrackGroup))) {
    throw new TypeError("options.video.group, when provided, must be an OutputTrackGroup or an array of OutputTrackGroups.");
  }
};
var validateAudioOptions = (audioOptions) => {
  if (!audioOptions || typeof audioOptions !== "object") {
    throw new TypeError("options.audio, when provided, must be an object.");
  }
  if (audioOptions?.discard !== void 0 && typeof audioOptions.discard !== "boolean") {
    throw new TypeError("options.audio.discard, when provided, must be a boolean.");
  }
  if (audioOptions?.forceTranscode !== void 0 && typeof audioOptions.forceTranscode !== "boolean") {
    throw new TypeError("options.audio.forceTranscode, when provided, must be a boolean.");
  }
  if (audioOptions?.codec !== void 0 && !AUDIO_CODECS.includes(audioOptions.codec)) {
    throw new TypeError(`options.audio.codec, when provided, must be one of: ${AUDIO_CODECS.join(", ")}.`);
  }
  if (audioOptions?.bitrate !== void 0 && !(audioOptions.bitrate instanceof Quality) && (!Number.isInteger(audioOptions.bitrate) || audioOptions.bitrate <= 0)) {
    throw new TypeError("options.audio.bitrate, when provided, must be a positive integer or a quality.");
  }
  if (audioOptions?.numberOfChannels !== void 0 && (!Number.isInteger(audioOptions.numberOfChannels) || audioOptions.numberOfChannels <= 0)) {
    throw new TypeError("options.audio.numberOfChannels, when provided, must be a positive integer.");
  }
  if (audioOptions?.sampleRate !== void 0 && (!Number.isInteger(audioOptions.sampleRate) || audioOptions.sampleRate <= 0)) {
    throw new TypeError("options.audio.sampleRate, when provided, must be a positive integer.");
  }
  if (audioOptions?.sampleFormat !== void 0 && !["u8", "s16", "s32", "f32"].includes(audioOptions.sampleFormat)) {
    throw new TypeError("options.audio.sampleFormat, when provided, must be one of: u8, s16, s32, f32.");
  }
  if (audioOptions?.process !== void 0 && typeof audioOptions.process !== "function") {
    throw new TypeError("options.audio.process, when provided, must be a function.");
  }
  if (audioOptions?.processedNumberOfChannels !== void 0 && (!Number.isInteger(audioOptions.processedNumberOfChannels) || audioOptions.processedNumberOfChannels <= 0)) {
    throw new TypeError("options.audio.processedNumberOfChannels, when provided, must be a positive integer.");
  }
  if (audioOptions?.processedSampleRate !== void 0 && (!Number.isInteger(audioOptions.processedSampleRate) || audioOptions.processedSampleRate <= 0)) {
    throw new TypeError("options.audio.processedSampleRate, when provided, must be a positive integer.");
  }
  if (audioOptions?.group !== void 0 && !(audioOptions.group instanceof OutputTrackGroup || Array.isArray(audioOptions.group) && audioOptions.group.every((x) => x instanceof OutputTrackGroup))) {
    throw new TypeError("options.audio.group, when provided, must be an OutputTrackGroup or an array of OutputTrackGroups.");
  }
};
var FALLBACK_NUMBER_OF_CHANNELS = 2;
var FALLBACK_SAMPLE_RATE = 48e3;
var Conversion = class _Conversion {
  /** Initializes a new conversion process without starting the conversion. */
  static async init(options) {
    const conversion = new _Conversion(options);
    await conversion._init();
    return conversion;
  }
  /** Creates a new Conversion instance (duh). */
  constructor(options) {
    this._addedCounts = {
      video: 0,
      audio: 0,
      subtitle: 0
    };
    this._totalTrackCount = 0;
    this._nextOutputTrackId = 0;
    this._outputTrackIds = [];
    this._outputOwnTrackGroups = [];
    this._trackPromises = [];
    this._executed = false;
    this._synchronizer = new TrackSynchronizer();
    this._totalDuration = null;
    this._maxTimestamps = /* @__PURE__ */ new Map();
    this._canceled = false;
    this.onProgress = void 0;
    this._computeProgress = false;
    this._lastProgress = 0;
    this.isValid = false;
    this.utilizedTracks = [];
    this.discardedTracks = [];
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!(options.input instanceof Input)) {
      throw new TypeError("options.input must be an Input.");
    }
    if (!(options.output instanceof Output)) {
      throw new TypeError("options.output must be an Output.");
    }
    if (options.tracks !== void 0 && options.tracks !== "all" && options.tracks !== "primary") {
      throw new TypeError("options.tracks, when provided, must be either 'all' or 'primary'.");
    }
    if (options.output._tracks.length > 0 || Object.keys(options.output._metadataTags).length > 0 || options.output.state !== "pending") {
      throw new TypeError("options.output must be fresh: no tracks or metadata tags added and not started.");
    }
    if (options.video !== void 0 && typeof options.video !== "function") {
      if (Array.isArray(options.video)) {
        for (const obj of options.video) {
          validateVideoOptions(obj);
        }
      } else {
        validateVideoOptions(options.video);
      }
    } else {
    }
    if (options.audio !== void 0 && typeof options.audio !== "function") {
      if (Array.isArray(options.audio)) {
        for (const obj of options.audio) {
          validateAudioOptions(obj);
        }
      } else {
        validateAudioOptions(options.audio);
      }
    } else {
    }
    if (options.trim !== void 0 && (!options.trim || typeof options.trim !== "object")) {
      throw new TypeError("options.trim, when provided, must be an object.");
    }
    if (options.trim?.start !== void 0 && !Number.isFinite(options.trim.start)) {
      throw new TypeError("options.trim.start, when provided, must be a finite number.");
    }
    if (options.trim?.end !== void 0 && !Number.isFinite(options.trim.end)) {
      throw new TypeError("options.trim.end, when provided, must be a finite number.");
    }
    if (options.trim?.start !== void 0 && options.trim.end !== void 0 && options.trim.start >= options.trim.end) {
      throw new TypeError("options.trim.start must be less than options.trim.end.");
    }
    if (options.tags !== void 0 && (typeof options.tags !== "object" || !options.tags) && typeof options.tags !== "function") {
      throw new TypeError("options.tags, when provided, must be an object or a function.");
    }
    if (typeof options.tags === "object") {
      validateMetadataTags(options.tags);
    }
    if (options.showWarnings !== void 0 && typeof options.showWarnings !== "boolean") {
      throw new TypeError("options.showWarnings, when provided, must be a boolean.");
    }
    this._options = options;
    this.input = options.input;
    this.output = options.output;
    const { promise: started, resolve: start } = promiseWithResolvers();
    this._started = started;
    this._start = start;
  }
  /** @internal */
  async _init() {
    const inputFormat = await this.input.getFormat();
    let tracks;
    let trackMode = this._options.tracks;
    if (trackMode === void 0) {
      const defaultTrackMode = inputFormat.name.includes("(HLS)") ? "primary" : "all";
      trackMode = defaultTrackMode;
    }
    if (trackMode === "all") {
      tracks = await this.input.getTracks();
    } else if (trackMode === "primary") {
      const primaryVideoTrack = await this.input.getPrimaryVideoTrack();
      const primaryAudioTrack = await this.input.getPrimaryAudioTrack();
      tracks = [primaryVideoTrack, primaryAudioTrack].filter((x) => x !== null);
    } else {
      assertNever(trackMode);
      assert(false);
    }
    const outputTrackCounts = this.output.format.getSupportedTrackCounts();
    let nVideo = 1;
    let nAudio = 1;
    const filteredTracks = [];
    const filteredTrackOptions = [];
    for (const track of tracks) {
      let trackOptions;
      if (track.isVideoTrack()) {
        if (this._options.video) {
          if (typeof this._options.video === "function") {
            const returnedTrackOptions = await this._options.video(track, nVideo) ?? {};
            if (Array.isArray(returnedTrackOptions)) {
              for (const obj of returnedTrackOptions) {
                validateVideoOptions(obj);
              }
            } else {
              validateVideoOptions(returnedTrackOptions);
            }
            trackOptions = Array.isArray(returnedTrackOptions) ? returnedTrackOptions : [returnedTrackOptions];
            nVideo++;
          } else {
            trackOptions = Array.isArray(this._options.video) ? this._options.video : [this._options.video];
          }
        } else {
          trackOptions = [{}];
        }
      } else if (track.isAudioTrack()) {
        if (this._options.audio) {
          if (typeof this._options.audio === "function") {
            const returnedTrackOptions = await this._options.audio(track, nAudio) ?? {};
            if (Array.isArray(returnedTrackOptions)) {
              for (const obj of returnedTrackOptions) {
                validateAudioOptions(obj);
              }
            } else {
              validateAudioOptions(returnedTrackOptions);
            }
            trackOptions = Array.isArray(returnedTrackOptions) ? returnedTrackOptions : [returnedTrackOptions];
            nAudio++;
          } else {
            trackOptions = Array.isArray(this._options.audio) ? this._options.audio : [this._options.audio];
          }
        } else {
          trackOptions = [{}];
        }
      } else {
        assert(false);
      }
      const discardOptions = trackOptions.filter((x) => x.discard);
      for (const discardOption of discardOptions) {
        this.discardedTracks.push({
          track,
          reason: "discarded_by_user",
          trackOptions: discardOption
        });
      }
      if (trackOptions.length === discardOptions.length) {
        if (trackOptions.length === 0) {
          this.discardedTracks.push({
            track,
            reason: "discarded_by_user",
            trackOptions: {}
          });
        }
        continue;
      }
      const nonDiscardOptions = trackOptions.filter((x) => !x.discard);
      filteredTracks.push(track);
      filteredTrackOptions.push(nonDiscardOptions);
    }
    if (this._options.trim?.start !== void 0) {
      this._startTimestamp = this._options.trim.start;
    } else {
      this._startTimestamp = Math.max(
        await this.input.getFirstTimestamp(filteredTracks),
        // Samples can also have negative timestamps, but the meaning typically is "don't present me", so let's
        // cut those out by default.
        0
      );
    }
    this._endTimestamp = Math.max(this._options.trim?.end ?? Infinity, this._startTimestamp);
    for (let i = 0; i < filteredTracks.length; i++) {
      const track = filteredTracks[i];
      const options = filteredTrackOptions[i];
      for (const option of options) {
        if (this._totalTrackCount === outputTrackCounts.total.max) {
          this.discardedTracks.push({
            track,
            reason: "max_track_count_reached",
            trackOptions: option
          });
          continue;
        }
        if (this._addedCounts[track.type] === outputTrackCounts[track.type].max) {
          this.discardedTracks.push({
            track,
            reason: "max_track_count_of_type_reached",
            trackOptions: option
          });
          continue;
        }
        const outputTrackId = this._nextOutputTrackId++;
        if (track.isVideoTrack()) {
          await this._processVideoTrack(track, option, outputTrackId);
        } else if (track.isAudioTrack()) {
          await this._processAudioTrack(track, option, outputTrackId);
        } else {
          assert(false);
        }
      }
    }
    for (let i = 0; i < this.utilizedTracks.length - 1; i++) {
      for (let j = i + 1; j < this.utilizedTracks.length; j++) {
        const trackA = this.utilizedTracks[i];
        const trackB = this.utilizedTracks[j];
        const ownGroupA = this._outputOwnTrackGroups[i];
        const ownGroupB = this._outputOwnTrackGroups[j];
        assert(ownGroupA !== void 0);
        assert(ownGroupB !== void 0);
        if (ownGroupA && ownGroupB && trackA.canBePairedWith(trackB)) {
          ownGroupA.pairWith(ownGroupB);
        }
      }
    }
    const inputTags = await this.input.getMetadataTags();
    let outputTags;
    if (this._options.tags) {
      const result = typeof this._options.tags === "function" ? await this._options.tags(inputTags) : this._options.tags;
      validateMetadataTags(result);
      outputTags = result;
    } else {
      outputTags = inputTags;
    }
    const inputAndOutputFormatMatch = inputFormat.mimeType === this.output.format.mimeType;
    const rawTagsAreUnchanged = inputTags.raw === outputTags.raw;
    if (inputTags.raw && rawTagsAreUnchanged && !inputAndOutputFormatMatch) {
      delete outputTags.raw;
    }
    this.output.setMetadataTags(outputTags);
    this.isValid = this._totalTrackCount >= outputTrackCounts.total.min && this._addedCounts.video >= outputTrackCounts.video.min && this._addedCounts.audio >= outputTrackCounts.audio.min && this._addedCounts.subtitle >= outputTrackCounts.subtitle.min;
    if (this._options.showWarnings ?? true) {
      const warnElements = [];
      const unintentionallyDiscardedTracks = this.discardedTracks.filter((x) => x.reason !== "discarded_by_user");
      if (unintentionallyDiscardedTracks.length > 0) {
        warnElements.push("Some tracks had to be discarded from the conversion:", unintentionallyDiscardedTracks);
      }
      if (!this.isValid) {
        if (warnElements.length > 0) {
          warnElements.push("\n\n");
        }
        warnElements.push(this._getInvalidityExplanation().join(""));
      }
      if (warnElements.length > 0) {
        console.warn(...warnElements);
      }
    }
  }
  /** @internal */
  _getInvalidityExplanation() {
    const elements = [];
    if (this.discardedTracks.length === 0) {
      elements.push("Due to missing tracks, this conversion cannot be executed.");
    } else {
      const encodabilityIsTheProblem = this.discardedTracks.every((x) => x.reason === "discarded_by_user" || x.reason === "no_encodable_target_codec") && this.discardedTracks.some((x) => x.reason === "no_encodable_target_codec");
      elements.push("Due to discarded tracks, this conversion cannot be executed.");
      if (encodabilityIsTheProblem) {
        const codecs = this.discardedTracks.flatMap((x) => {
          if (x.reason === "discarded_by_user")
            return [];
          if (x.track.type === "video") {
            return this.output.format.getSupportedVideoCodecs();
          } else if (x.track.type === "audio") {
            return this.output.format.getSupportedAudioCodecs();
          } else {
            return this.output.format.getSupportedSubtitleCodecs();
          }
        });
        const uniqueCodecs = [...new Set(codecs)];
        if (uniqueCodecs.length === 1) {
          elements.push(`
Tracks were discarded because your environment is not able to encode '${uniqueCodecs[0]}'.`);
        } else {
          elements.push(`
Tracks were discarded because your environment is not able to encode any of the following codecs: ${uniqueCodecs.map((x) => `'${x}'`).join(", ")}.`);
        }
        if (uniqueCodecs.includes("mp3")) {
          elements.push(`
The @mediabunny/mp3-encoder extension package provides support for encoding MP3.`);
        }
        if (uniqueCodecs.includes("aac")) {
          elements.push("\nThe @mediabunny/aac-encoder extension package provides support for encoding AAC.");
        }
        if (uniqueCodecs.includes("ac3") || uniqueCodecs.includes("eac3")) {
          elements.push("\nThe @mediabunny/ac3 extension package provides support for encoding and decoding AC-3/E-AC-3.");
        }
        if (uniqueCodecs.includes("flac")) {
          elements.push("\nThe @mediabunny/flac-encoder extension package provides support for encoding FLAC.");
        }
      } else {
        elements.push("\nCheck the discardedTracks field for more info.");
      }
    }
    return elements;
  }
  /**
   * Executes the conversion process. Resolves once conversion is complete.
   *
   * Will throw if `isValid` is `false`.
   */
  async execute() {
    if (!this.isValid) {
      throw new Error("Cannot execute this conversion because its output configuration is invalid. Make sure to always check the isValid field before executing a conversion.\n" + this._getInvalidityExplanation().join(""));
    }
    if (this._executed) {
      throw new Error("Conversion cannot be executed twice.");
    }
    this._executed = true;
    for (const id of this._outputTrackIds) {
      this._synchronizer.declareTrack(id);
    }
    if (this.onProgress) {
      const uniqueUtilizedTracks = new Set(this.utilizedTracks);
      const durationPromises = [...uniqueUtilizedTracks].map(async (track) => {
        if (await track.isLive()) {
          return Infinity;
        }
        return await track.getDurationFromMetadata() ?? await track.computeDuration();
      });
      const duration = Math.max(0, ...await Promise.all(durationPromises));
      this._computeProgress = true;
      this._totalDuration = Math.min(duration - this._startTimestamp, this._endTimestamp - this._startTimestamp);
      for (const id of this._outputTrackIds) {
        this._maxTimestamps.set(id, 0);
      }
      this.onProgress?.(0, 0);
    }
    await this.output.start();
    this._start();
    try {
      await Promise.all(this._trackPromises);
    } catch (error) {
      if (!this._canceled) {
        void this.cancel();
      }
      throw error;
    }
    if (this._canceled) {
      throw new ConversionCanceledError();
    }
    await this.output.finalize();
    if (this._computeProgress) {
      const minTimestamp = Math.min(...this._maxTimestamps.values());
      this.onProgress?.(1, minTimestamp);
    }
  }
  /**
   * Cancels the conversion process, causing any ongoing `execute` call to throw a `ConversionCanceledError`.
   * Does nothing if the conversion is already complete.
   */
  async cancel() {
    if (this.output.state === "finalizing" || this.output.state === "finalized") {
      return;
    }
    if (this._canceled) {
      console.warn("Conversion already canceled.");
      return;
    }
    this._canceled = true;
    await this.output.cancel();
  }
  /** @internal */
  async _processVideoTrack(track, trackOptions, outputTrackId) {
    const sourceCodec = await track.getCodec();
    if (!sourceCodec) {
      this.discardedTracks.push({
        track,
        reason: "unknown_source_codec",
        trackOptions
      });
      return;
    }
    let videoSource;
    const innateRotation = await track.getRotation();
    const totalRotation = normalizeRotation(innateRotation + (trackOptions.rotate ?? 0));
    let outputTrackRotation = totalRotation;
    const canUseRotationMetadata = this.output.format.supportsVideoRotationMetadata && (trackOptions.allowRotationMetadata ?? true);
    const squarePixelWidth = await track.getSquarePixelWidth();
    const squarePixelHeight = await track.getSquarePixelHeight();
    const [rotatedWidth, rotatedHeight] = totalRotation % 180 === 0 ? [squarePixelWidth, squarePixelHeight] : [squarePixelHeight, squarePixelWidth];
    let crop = trackOptions.crop;
    if (crop) {
      crop = clampCropRectangle(crop, rotatedWidth, rotatedHeight);
    }
    const [originalWidth, originalHeight] = crop ? [crop.width, crop.height] : [rotatedWidth, rotatedHeight];
    let width = originalWidth;
    let height = originalHeight;
    const aspectRatio = width / height;
    if (trackOptions.width !== void 0 && trackOptions.height === void 0) {
      width = ceilToMultipleOfTwo(trackOptions.width);
      height = ceilToMultipleOfTwo(Math.round(width / aspectRatio));
    } else if (trackOptions.width === void 0 && trackOptions.height !== void 0) {
      height = ceilToMultipleOfTwo(trackOptions.height);
      width = ceilToMultipleOfTwo(Math.round(height * aspectRatio));
    } else if (trackOptions.width !== void 0 && trackOptions.height !== void 0) {
      width = ceilToMultipleOfTwo(trackOptions.width);
      height = ceilToMultipleOfTwo(trackOptions.height);
    }
    const firstTimestamp = await track.getFirstTimestamp();
    let videoCodecs = this.output.format.getSupportedVideoCodecs();
    const needsTranscode = !!trackOptions.forceTranscode || firstTimestamp < this._startTimestamp || !!trackOptions.frameRate || trackOptions.keyFrameInterval !== void 0 || trackOptions.process !== void 0 || trackOptions.bitrate !== void 0 || !videoCodecs.includes(sourceCodec) || trackOptions.codec && trackOptions.codec !== sourceCodec || width !== originalWidth || height !== originalHeight || totalRotation !== 0 && !canUseRotationMetadata || !!crop;
    const alpha = trackOptions.alpha ?? "discard";
    if (!needsTranscode) {
      const source = new EncodedVideoPacketSource(sourceCodec);
      videoSource = source;
      this._trackPromises.push((async () => {
        await this._started;
        const sink = new EncodedPacketSink(track);
        const decoderConfig = await track.getDecoderConfig();
        const meta = { decoderConfig: decoderConfig ?? void 0 };
        for await (const packet of sink.packets(void 0, void 0, { verifyKeyPackets: true })) {
          if (this._canceled) {
            return;
          }
          if (packet.timestamp >= this._endTimestamp) {
            break;
          }
          const modifiedPacket = packet.clone({
            timestamp: packet.timestamp - this._startTimestamp,
            sideData: alpha === "discard" ? {} : packet.sideData
          });
          assert(modifiedPacket.timestamp >= 0);
          this._reportProgress(outputTrackId, modifiedPacket.timestamp + modifiedPacket.duration);
          await source.add(modifiedPacket, meta);
          if (this._synchronizer.shouldWait(outputTrackId, modifiedPacket.timestamp)) {
            await this._synchronizer.wait(modifiedPacket.timestamp);
          }
        }
        source.close();
        this._synchronizer.closeTrack(outputTrackId);
      })());
    } else {
      const canDecode = await track.canDecode();
      if (!canDecode) {
        this.discardedTracks.push({
          track,
          reason: "undecodable_source_codec",
          trackOptions
        });
        return;
      }
      if (trackOptions.codec) {
        videoCodecs = videoCodecs.filter((codec) => codec === trackOptions.codec);
      }
      const bitrate = trackOptions.bitrate ?? QUALITY_HIGH;
      const encodableCodec = await getFirstEncodableVideoCodec(videoCodecs, {
        width: trackOptions.process && trackOptions.processedWidth ? trackOptions.processedWidth : width,
        height: trackOptions.process && trackOptions.processedHeight ? trackOptions.processedHeight : height,
        bitrate
      });
      if (!encodableCodec) {
        this.discardedTracks.push({
          track,
          reason: "no_encodable_target_codec",
          trackOptions
        });
        return;
      }
      const encodingConfig = {
        codec: encodableCodec,
        bitrate,
        keyFrameInterval: trackOptions.keyFrameInterval,
        sizeChangeBehavior: trackOptions.fit ?? "passThrough",
        alpha,
        hardwareAcceleration: trackOptions.hardwareAcceleration,
        transform: {}
      };
      assert(encodingConfig.transform);
      let needsRerender = width !== originalWidth || height !== originalHeight || totalRotation !== 0 && (!canUseRotationMetadata || trackOptions.process !== void 0) || !!crop || squarePixelWidth !== await track.getCodedWidth() || squarePixelHeight !== await track.getCodedHeight();
      if (!needsRerender) {
        const tempOutput = new Output({
          format: new Mp4OutputFormat(),
          // Supports all video codecs
          target: new NullTarget()
        });
        const tempSource = new VideoSampleSource(encodingConfig);
        tempOutput.addVideoTrack(tempSource);
        await tempOutput.start();
        const sink = new VideoSampleSink(track);
        const firstSample = await sink.getSample(firstTimestamp);
        if (firstSample) {
          try {
            await tempSource.add(firstSample);
            firstSample.close();
            await tempOutput.finalize();
          } catch (error) {
            console.info("Error when probing encoder support. Falling back to rerender path.", error);
            needsRerender = true;
            void tempOutput.cancel();
          }
        } else {
          await tempOutput.cancel();
        }
      }
      if (trackOptions.frameRate) {
        encodingConfig.transform.frameRate = trackOptions.frameRate;
      }
      if (needsRerender) {
        outputTrackRotation = 0;
        encodingConfig.transform.width = width;
        encodingConfig.transform.height = height;
        encodingConfig.transform.fit = trackOptions.fit ?? "fill";
        encodingConfig.transform.rotate = normalizeRotation(totalRotation - innateRotation);
        encodingConfig.transform.crop = crop;
        encodingConfig.transform.alpha = alpha;
      }
      const source = new VideoSampleSource(encodingConfig);
      videoSource = source;
      this._trackPromises.push((async () => {
        await this._started;
        const sink = new VideoSampleSink(track);
        for await (const sample of sink.samples(this._startTimestamp, this._endTimestamp)) {
          if (this._canceled) {
            sample.close();
            return;
          }
          const adjustedSampleTimestamp = Math.max(sample.timestamp - this._startTimestamp, 0);
          sample.setTimestamp(adjustedSampleTimestamp);
          await this._registerVideoSample(trackOptions, outputTrackId, source, sample);
          sample.close();
        }
        source.close();
        this._synchronizer.closeTrack(outputTrackId);
      })());
    }
    let ownGroup = null;
    if (!trackOptions.group) {
      ownGroup = new OutputTrackGroup();
    }
    const videoTrackLanguageCode = await track.getLanguageCode();
    this.output.addVideoTrack(videoSource, {
      frameRate: trackOptions.frameRate,
      // TODO: This condition can be removed when all demuxers properly homogenize to BCP47 in v2
      languageCode: isIso639Dash2LanguageCode(videoTrackLanguageCode) ? videoTrackLanguageCode : void 0,
      name: await track.getName() ?? void 0,
      disposition: await track.getDisposition(),
      rotation: outputTrackRotation,
      group: ownGroup ?? trackOptions.group
    });
    this._addedCounts.video++;
    this._totalTrackCount++;
    this.utilizedTracks.push(track);
    this._outputTrackIds.push(outputTrackId);
    this._outputOwnTrackGroups.push(ownGroup);
  }
  /** @internal */
  async _registerVideoSample(trackOptions, outputTrackId, source, sample) {
    if (this._canceled) {
      return;
    }
    this._reportProgress(outputTrackId, sample.timestamp + sample.duration);
    let finalSamples;
    if (!trackOptions.process) {
      finalSamples = [sample];
    } else {
      let processed = trackOptions.process(sample);
      if (processed instanceof Promise)
        processed = await processed;
      if (!Array.isArray(processed)) {
        processed = processed === null ? [] : [processed];
      }
      finalSamples = processed.map((x) => {
        if (x instanceof VideoSample) {
          return x;
        }
        if (typeof VideoFrame !== "undefined" && x instanceof VideoFrame) {
          return new VideoSample(x);
        }
        return new VideoSample(x, {
          timestamp: sample.timestamp,
          duration: sample.duration
        });
      });
    }
    try {
      for (const finalSample of finalSamples) {
        if (this._canceled) {
          break;
        }
        await source.add(finalSample);
        if (this._synchronizer.shouldWait(outputTrackId, finalSample.timestamp)) {
          await this._synchronizer.wait(finalSample.timestamp);
        }
      }
    } finally {
      for (const finalSample of finalSamples) {
        if (finalSample !== sample) {
          finalSample.close();
        }
      }
    }
  }
  /** @internal */
  async _processAudioTrack(track, trackOptions, outputTrackId) {
    const sourceCodec = await track.getCodec();
    if (!sourceCodec) {
      this.discardedTracks.push({
        track,
        reason: "unknown_source_codec",
        trackOptions
      });
      return;
    }
    let audioSource;
    const originalNumberOfChannels = await track.getNumberOfChannels();
    const originalSampleRate = await track.getSampleRate();
    const firstTimestamp = await track.getFirstTimestamp();
    let numberOfChannels = trackOptions.numberOfChannels ?? originalNumberOfChannels;
    let sampleRate = trackOptions.sampleRate ?? originalSampleRate;
    let needsResample = numberOfChannels !== originalNumberOfChannels || sampleRate !== originalSampleRate || firstTimestamp < this._startTimestamp || firstTimestamp > this._startTimestamp && !this.output.format.supportsTimestampedMediaData;
    let audioCodecs = this.output.format.getSupportedAudioCodecs();
    if (!trackOptions.forceTranscode && !trackOptions.bitrate && !needsResample && audioCodecs.includes(sourceCodec) && (!trackOptions.codec || trackOptions.codec === sourceCodec) && !trackOptions.process && trackOptions.sampleFormat === void 0) {
      const source = new EncodedAudioPacketSource(sourceCodec);
      audioSource = source;
      this._trackPromises.push((async () => {
        await this._started;
        const sink = new EncodedPacketSink(track);
        const decoderConfig = await track.getDecoderConfig();
        const meta = { decoderConfig: decoderConfig ?? void 0 };
        for await (const packet of sink.packets()) {
          if (this._canceled) {
            return;
          }
          if (packet.timestamp >= this._endTimestamp) {
            break;
          }
          const modifiedPacket = packet.clone({
            timestamp: packet.timestamp - this._startTimestamp
          });
          assert(modifiedPacket.timestamp >= 0);
          this._reportProgress(outputTrackId, modifiedPacket.timestamp + modifiedPacket.duration);
          await source.add(modifiedPacket, meta);
          if (this._synchronizer.shouldWait(outputTrackId, modifiedPacket.timestamp)) {
            await this._synchronizer.wait(modifiedPacket.timestamp);
          }
        }
        source.close();
        this._synchronizer.closeTrack(outputTrackId);
      })());
    } else {
      const canDecode = await track.canDecode();
      if (!canDecode) {
        this.discardedTracks.push({
          track,
          reason: "undecodable_source_codec",
          trackOptions
        });
        return;
      }
      let codecOfChoice = null;
      if (trackOptions.codec) {
        audioCodecs = audioCodecs.filter((codec) => codec === trackOptions.codec);
      }
      const bitrate = trackOptions.bitrate ?? QUALITY_HIGH;
      const encodableCodecs = await getEncodableAudioCodecs(audioCodecs, {
        numberOfChannels: trackOptions.process && trackOptions.processedNumberOfChannels ? trackOptions.processedNumberOfChannels : numberOfChannels,
        sampleRate: trackOptions.process && trackOptions.processedSampleRate ? trackOptions.processedSampleRate : sampleRate,
        bitrate
      });
      if (!encodableCodecs.some((codec) => NON_PCM_AUDIO_CODECS.includes(codec)) && audioCodecs.some((codec) => NON_PCM_AUDIO_CODECS.includes(codec)) && (numberOfChannels !== FALLBACK_NUMBER_OF_CHANNELS || sampleRate !== FALLBACK_SAMPLE_RATE)) {
        const encodableCodecsWithDefaultParams = await getEncodableAudioCodecs(audioCodecs, {
          numberOfChannels: FALLBACK_NUMBER_OF_CHANNELS,
          sampleRate: FALLBACK_SAMPLE_RATE,
          bitrate
        });
        const nonPcmCodec = encodableCodecsWithDefaultParams.find((codec) => NON_PCM_AUDIO_CODECS.includes(codec));
        if (nonPcmCodec) {
          needsResample = true;
          codecOfChoice = nonPcmCodec;
          numberOfChannels = FALLBACK_NUMBER_OF_CHANNELS;
          sampleRate = FALLBACK_SAMPLE_RATE;
        }
      } else {
        codecOfChoice = encodableCodecs[0] ?? null;
      }
      if (codecOfChoice === null) {
        this.discardedTracks.push({
          track,
          reason: "no_encodable_target_codec",
          trackOptions
        });
        return;
      }
      if (needsResample) {
        audioSource = this._resampleAudio(track, trackOptions, outputTrackId, codecOfChoice, numberOfChannels, sampleRate, bitrate);
      } else {
        const source = new AudioSampleSource({
          codec: codecOfChoice,
          bitrate
        });
        audioSource = source;
        this._trackPromises.push((async () => {
          await this._started;
          const sink = new AudioSampleSink(track);
          for await (const sample of sink.samples(void 0, this._endTimestamp)) {
            if (this._canceled) {
              sample.close();
              return;
            }
            sample.setTimestamp(sample.timestamp - this._startTimestamp);
            await this._registerAudioSample(trackOptions, outputTrackId, source, sample);
            sample.close();
          }
          source.close();
          this._synchronizer.closeTrack(outputTrackId);
        })());
      }
    }
    let ownGroup = null;
    if (!trackOptions.group) {
      ownGroup = new OutputTrackGroup();
    }
    const audioTrackLanguageCode = await track.getLanguageCode();
    this.output.addAudioTrack(audioSource, {
      // TODO: This condition can be removed when all demuxers properly homogenize to BCP47 in v2
      languageCode: isIso639Dash2LanguageCode(audioTrackLanguageCode) ? audioTrackLanguageCode : void 0,
      name: await track.getName() ?? void 0,
      disposition: await track.getDisposition(),
      group: ownGroup ?? trackOptions.group
    });
    this._addedCounts.audio++;
    this._totalTrackCount++;
    this.utilizedTracks.push(track);
    this._outputTrackIds.push(outputTrackId);
    this._outputOwnTrackGroups.push(ownGroup);
  }
  /** @internal */
  async _registerAudioSample(trackOptions, outputTrackId, source, inputSample) {
    if (this._canceled) {
      return;
    }
    let sample = inputSample;
    if (trackOptions.sampleFormat !== void 0 && toInterleavedAudioFormat(sample.format) !== trackOptions.sampleFormat) {
      sample = audioSampleToInterleavedFormat(sample, trackOptions.sampleFormat);
    }
    this._reportProgress(outputTrackId, sample.timestamp + sample.duration);
    let finalSamples;
    if (!trackOptions.process) {
      finalSamples = [sample];
    } else {
      let processed = trackOptions.process(sample);
      if (processed instanceof Promise)
        processed = await processed;
      if (!Array.isArray(processed)) {
        processed = processed === null ? [] : [processed];
      }
      if (!processed.every((x) => x instanceof AudioSample)) {
        throw new TypeError("The audio process function must return an AudioSample, null, or an array of AudioSamples.");
      }
      finalSamples = processed;
    }
    try {
      for (const finalSample of finalSamples) {
        if (this._canceled) {
          break;
        }
        await source.add(finalSample);
        if (this._synchronizer.shouldWait(outputTrackId, finalSample.timestamp)) {
          await this._synchronizer.wait(finalSample.timestamp);
        }
      }
    } finally {
      if (sample !== inputSample) {
        sample.close();
      }
      for (const finalSample of finalSamples) {
        if (finalSample !== inputSample) {
          finalSample.close();
        }
      }
    }
  }
  /** @internal */
  _resampleAudio(track, trackOptions, outputTrackId, codec, targetNumberOfChannels, targetSampleRate, bitrate) {
    const source = new AudioSampleSource({
      codec,
      bitrate
    });
    this._trackPromises.push((async () => {
      await this._started;
      const resampler = new AudioResampler({
        targetNumberOfChannels,
        targetSampleRate,
        startTime: this._startTimestamp,
        endTime: this._endTimestamp,
        onSample: async (sample) => {
          assert(sample.timestamp >= this._startTimestamp);
          sample.setTimestamp(sample.timestamp - this._startTimestamp);
          await this._registerAudioSample(trackOptions, outputTrackId, source, sample);
          sample.close();
        }
      });
      const sink = new AudioSampleSink(track);
      const iterator = sink.samples(this._startTimestamp, this._endTimestamp);
      for await (const sample of iterator) {
        if (this._canceled) {
          sample.close();
          return;
        }
        await resampler.add(sample);
        sample.close();
      }
      await resampler.finalize();
      source.close();
      this._synchronizer.closeTrack(outputTrackId);
    })());
    return source;
  }
  /** @internal */
  _reportProgress(trackId, endTimestamp) {
    if (!this._computeProgress) {
      return;
    }
    assert(this._totalDuration !== null);
    this._maxTimestamps.set(trackId, Math.max(endTimestamp, this._maxTimestamps.get(trackId)));
    const minTimestamp = Math.min(...this._maxTimestamps.values());
    const newProgress = clamp(minTimestamp / this._totalDuration, 0, 1);
    if (newProgress !== this._lastProgress) {
      this._lastProgress = newProgress;
      this.onProgress?.(newProgress, minTimestamp);
    }
  }
};
var ConversionCanceledError = class extends Error {
  /** Creates a new {@link ConversionCanceledError}. */
  constructor(message = "Conversion has been canceled.") {
    super(message);
    this.name = "ConversionCanceledError";
  }
};
var MAX_TIMESTAMP_GAP = 1;
var TrackSynchronizer = class {
  constructor() {
    this.maxTimestamps = /* @__PURE__ */ new Map();
    this.resolvers = [];
  }
  declareTrack(trackId) {
    this.maxTimestamps.set(trackId, 0);
  }
  shouldWait(trackId, timestamp) {
    const currentValue = this.maxTimestamps.get(trackId);
    assert(currentValue !== void 0);
    this.maxTimestamps.set(trackId, Math.max(timestamp, currentValue));
    const newMin = this.computeMinAndMaybeResolve();
    return timestamp - newMin > MAX_TIMESTAMP_GAP;
  }
  wait(timestamp) {
    const { promise, resolve } = promiseWithResolvers();
    this.resolvers.push({
      timestamp,
      resolve
    });
    return promise;
  }
  closeTrack(trackId) {
    this.maxTimestamps.delete(trackId);
    this.computeMinAndMaybeResolve();
  }
  computeMinAndMaybeResolve() {
    let newMin = Infinity;
    for (const [, timestamp] of this.maxTimestamps) {
      newMin = Math.min(newMin, timestamp);
    }
    for (let i = 0; i < this.resolvers.length; i++) {
      const entry = this.resolvers[i];
      if (entry.timestamp - newMin < MAX_TIMESTAMP_GAP) {
        entry.resolve();
        this.resolvers.splice(i, 1);
        i--;
      }
    }
    return newMin;
  }
};

// ../../node_modules/.pnpm/mediabunny@1.45.4/node_modules/mediabunny/dist/modules/src/index.js
var MEDIABUNNY_LOADED_SYMBOL = /* @__PURE__ */ Symbol.for("mediabunny loaded");
if (globalThis[MEDIABUNNY_LOADED_SYMBOL]) {
  console.error("[WARNING]\nMediabunny was loaded twice. This will likely cause Mediabunny not to work correctly. Check if multiple dependencies are importing different versions of Mediabunny, or if something is being bundled incorrectly.");
}
globalThis[MEDIABUNNY_LOADED_SYMBOL] = true;

// src/index.ts
async function detectSceneChanges(track, options = {}) {
  const sampleRate = options.sampleRate ?? 2;
  const width = options.width ?? 96;
  const height = options.height ?? 54;
  const sink = new VideoSampleSink(track);
  const duration = await track.computeDuration();
  const timestamps = [];
  for (let time = 0; time < duration; time += 1 / sampleRate) timestamps.push(time);
  const fingerprints = [];
  for await (const sample of sink.samplesAtTimestamps(timestamps)) {
    if (!sample) continue;
    const data = sampleFingerprint(sample, width, height);
    fingerprints.push({ timestamp: sample.timestamp, data });
    sample.close();
  }
  return detectSceneChangesInFingerprints(fingerprints, options);
}
async function planSceneKeyFrames(track, options = {}) {
  const changes = await detectSceneChanges(track, options);
  const duration = await track.computeDuration();
  const keyFrameTimestamps = planKeyFrameTimestamps(changes, {
    duration,
    minKeyFrameDistance: options.minKeyFrameDistance ?? options.minSceneDuration,
    maxKeyFrameInterval: options.maxKeyFrameInterval
  });
  const intervals = changes.slice(1).map((change, index) => change.timestamp - changes[index].timestamp);
  const recommendedKeyFrameInterval = clamp2(percentile(intervals, 0.35) || options.minSceneDuration || 2, 0.5, 5);
  return { changes, keyFrameTimestamps, recommendedKeyFrameInterval };
}
async function conversionVideoOptionsWithSceneKeyFrames(track, options = {}) {
  const plan = await planSceneKeyFrames(track, options);
  return {
    forceTranscode: true,
    keyFrameInterval: plan.recommendedKeyFrameInterval,
    process: (sample) => sample
  };
}
async function transcodeWithSceneKeyFrames(options) {
  const input = new Input({
    source: toSource(options.input),
    formats: [new Mp4InputFormat(), new QuickTimeInputFormat()]
  });
  const target = new BufferTarget();
  const output = new Output({
    target,
    format: options.outputFormat ?? new Mp4OutputFormat({ fastStart: "in-memory" })
  });
  const primaryVideo = await input.getPrimaryVideoTrack();
  const scenePlan = primaryVideo ? await planSceneKeyFrames(primaryVideo, options.detection) : null;
  const conversion = await Conversion.init({
    input,
    output,
    video: scenePlan ? {
      ...options.video,
      forceTranscode: true,
      keyFrameInterval: scenePlan.recommendedKeyFrameInterval,
      process: (sample) => sample
    } : options.video,
    audio: {}
  });
  if (!conversion.isValid) {
    throw new Error(`Mediabunny could not create a valid scene-keyframe conversion: ${conversion.discardedTracks.map((track) => `${track.track.type}:${track.reason}`).join(", ")}`);
  }
  await conversion.execute();
  if (!target.buffer) throw new Error("Mediabunny did not produce an output buffer");
  return { buffer: target.buffer, scenePlan };
}
function mpegTsHlsOutputFormat(targetDuration = 2) {
  return new HlsOutputFormat({
    segmentFormat: new MpegTsOutputFormat(),
    targetDuration
  });
}
function detectSceneChangesInFingerprints(fingerprints, options = {}) {
  const threshold = options.threshold ?? 0.18;
  const minSceneDuration = options.minSceneDuration ?? 0.8;
  let previous = null;
  let lastChange = -Infinity;
  const changes = [];
  for (const fingerprint of fingerprints) {
    if (previous) {
      const score = scoreFrameDifference(previous, fingerprint.data);
      if (score >= threshold && fingerprint.timestamp - lastChange >= minSceneDuration) {
        changes.push({ timestamp: fingerprint.timestamp, score });
        lastChange = fingerprint.timestamp;
      }
    }
    previous = fingerprint.data;
  }
  return changes;
}
function planKeyFrameTimestamps(changes, options = {}) {
  const minKeyFrameDistance = options.minKeyFrameDistance ?? 0;
  const maxKeyFrameInterval = options.maxKeyFrameInterval ?? Infinity;
  const startTimestamp = options.startTimestamp ?? 0;
  const result = [startTimestamp];
  let lastKeyFrame = startTimestamp;
  for (const change of changes) {
    if (change.timestamp - lastKeyFrame >= minKeyFrameDistance) {
      while (Number.isFinite(maxKeyFrameInterval) && change.timestamp - lastKeyFrame > maxKeyFrameInterval) {
        lastKeyFrame += maxKeyFrameInterval;
        result.push(lastKeyFrame);
      }
      if (change.timestamp - lastKeyFrame >= minKeyFrameDistance) {
        result.push(change.timestamp);
        lastKeyFrame = change.timestamp;
      }
    }
  }
  if (options.duration !== void 0 && Number.isFinite(maxKeyFrameInterval)) {
    while (options.duration - lastKeyFrame > maxKeyFrameInterval) {
      lastKeyFrame += maxKeyFrameInterval;
      result.push(lastKeyFrame);
    }
  }
  return result;
}
function scoreFrameDifference(a, b) {
  if (a.length !== b.length) throw new Error("Cannot compare frame fingerprints with different lengths");
  return meanAbsoluteDifference(a, b);
}
function sampleFingerprint(sample, width, height) {
  const canvas = typeof OffscreenCanvas === "undefined" ? document.createElement("canvas") : new OffscreenCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create 2D canvas context");
  sample.draw(context, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}
function meanAbsoluteDifference(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]);
    sum += Math.abs(a[i + 1] - b[i + 1]);
    sum += Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum / (a.length / 4 * 3 * 255);
}
function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))];
}
function clamp2(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function toSource(input) {
  if (input instanceof Blob) return new BlobSource(input);
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return new BufferSource(input);
  return input;
}
export {
  conversionVideoOptionsWithSceneKeyFrames,
  detectSceneChanges,
  detectSceneChangesInFingerprints,
  mpegTsHlsOutputFormat,
  planKeyFrameTimestamps,
  planSceneKeyFrames,
  scoreFrameDifference,
  transcodeWithSceneKeyFrames
};
/*! Bundled license information:

mediabunny/dist/modules/src/misc.js:
mediabunny/dist/modules/src/metadata.js:
mediabunny/dist/modules/shared/bitstream.js:
mediabunny/dist/modules/shared/aac-misc.js:
mediabunny/dist/modules/src/codec.js:
mediabunny/dist/modules/shared/ac3-misc.js:
mediabunny/dist/modules/src/codec-data.js:
mediabunny/dist/modules/src/demuxer.js:
mediabunny/dist/modules/src/packet.js:
mediabunny/dist/modules/src/isobmff/isobmff-misc.js:
mediabunny/dist/modules/src/isobmff/isobmff-reader.js:
mediabunny/dist/modules/src/aes.js:
mediabunny/dist/modules/src/isobmff/isobmff-demuxer.js:
mediabunny/dist/modules/src/adts/adts-reader.js:
mediabunny/dist/modules/src/mpeg-ts/mpeg-ts-misc.js:
mediabunny/dist/modules/src/hls/hls-misc.js:
mediabunny/dist/modules/src/source.js:
mediabunny/dist/modules/src/input-format.js:
mediabunny/dist/modules/src/sample.js:
mediabunny/dist/modules/src/encode.js:
mediabunny/dist/modules/src/custom-coder.js:
mediabunny/dist/modules/src/pcm.js:
mediabunny/dist/modules/src/media-sink.js:
mediabunny/dist/modules/src/input-track.js:
mediabunny/dist/modules/src/input.js:
mediabunny/dist/modules/src/reader.js:
mediabunny/dist/modules/src/muxer.js:
mediabunny/dist/modules/src/subtitles.js:
mediabunny/dist/modules/src/isobmff/isobmff-boxes.js:
mediabunny/dist/modules/src/writer.js:
mediabunny/dist/modules/src/target.js:
mediabunny/dist/modules/src/isobmff/isobmff-muxer.js:
mediabunny/dist/modules/src/mpeg-ts/mpeg-ts-muxer.js:
mediabunny/dist/modules/src/resample.js:
mediabunny/dist/modules/src/media-source.js:
mediabunny/dist/modules/src/hls/hls-muxer.js:
mediabunny/dist/modules/src/output-format.js:
mediabunny/dist/modules/src/output.js:
mediabunny/dist/modules/src/conversion.js:
mediabunny/dist/modules/src/index.js:
  (*!
   * Copyright (c) 2026-present, Vanilagy and contributors
   *
   * This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/.
   *)
*/
