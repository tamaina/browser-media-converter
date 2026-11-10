import { readExifAsync, type ExifPayload } from '@browser-mc/exif-transplant';

/**
 * Reads source EXIF for the still-image EXIF policy.
 *
 * Uses the async reader so JPEG XL `brob` (Brotli-compressed) Exif boxes are
 * decoded instead of being rejected by the sync reader. Malformed, unsupported,
 * or missing EXIF yields `null` so EXIF problems never block a resize.
 *
 * Internal module: not re-exported from the package entry point.
 */
export async function readSourceExif(data: Uint8Array): Promise<ExifPayload | null> {
  try {
    return await readExifAsync(data);
  } catch {
    return null;
  }
}
