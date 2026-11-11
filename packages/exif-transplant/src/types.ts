export type ImageMime = 'image/jpeg' | 'image/webp' | 'image/avif' | 'image/jxl';

export type ExifPayload = {
  bytes: Uint8Array;
  sourceMime: ImageMime;
};
