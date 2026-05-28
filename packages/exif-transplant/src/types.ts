export type ImageMime = 'image/jpeg' | 'image/webp' | 'image/avif';

export type ExifPayload = {
  bytes: Uint8Array;
  sourceMime: ImageMime;
};
