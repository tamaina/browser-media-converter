import { readExifAsync, resetExifOrientation, type ExifPayload } from '@browser-mc/exif-transplant';

/** Internal policy reader. Decode failures warn without failing the resize.
 * JXL pixels are displayed using codestream Orientation by ImageDecoder, so
 * copied EXIF must describe those already-oriented pixels as Orientation 1.
 * The drop policy skips metadata reading entirely (source is reported as null).
 */
export async function readSourceExif(
  data: Uint8Array,
  warnings: string[] = [],
  policy: 'keep' | 'drop' | 'drop-gps' = 'keep',
): Promise<ExifPayload | null> {
  if (policy === 'drop') return null;
  try {
    const exif = await readExifAsync(data);
    return exif?.sourceMime === 'image/jxl'
      ? { ...exif, bytes: resetExifOrientation(exif.bytes) }
      : exif;
  } catch (error) {
    warnings.push(`Source EXIF could not be preserved: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
