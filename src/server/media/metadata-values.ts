import { mediaError } from './errors.ts';

export type MetadataValue =
  | string
  | number
  | boolean
  | null
  | MetadataValue[]
  | { [key: string]: MetadataValue };
export type GroupedMetadata = Record<string, MetadataValue>;

/** JSONQ preserves numeric-looking strings, including nested XMP values. */
export function parseMetadata(output: string): GroupedMetadata {
  const rows: unknown = JSON.parse(output);
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    rows[0] === null ||
    typeof rows[0] !== 'object' ||
    Array.isArray(rows[0])
  )
    throw mediaError(
      'MEDIA_METADATA_INVALID',
      'ExifTool did not return one complete metadata object',
    );
  const data = rows[0] as GroupedMetadata;
  const error = Object.entries(data).find(
    ([key]) => key.startsWith('ExifTool:') && key.endsWith(':Error'),
  );
  if (error)
    throw mediaError('MEDIA_METADATA_INVALID', `ExifTool: ${String(error[1])}`);
  return data;
}

/** Display projection only: the complete grouped result is never converted or flattened. */
export function photographyFields(data: GroupedMetadata) {
  const text = (...keys: string[]) => {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'string') return value;
    }
    return null;
  };
  const numeric = (value: string | null, unit = '') => {
    if (value === null) return null;
    const raw =
      unit && value.endsWith(unit) ? value.slice(0, -unit.length) : value;
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw.trim())) return null;
    const number = Number(raw);
    return Number.isFinite(number) ? number : null;
  };
  return {
    make: text('IFD0:Main:Make', 'XMP-tiff:Main:Make'),
    model: text('IFD0:Main:Model', 'XMP-tiff:Main:Model'),
    lens: text(
      'ExifIFD:Main:LensModel',
      'XMP-exifEX:Main:LensModel',
      'Composite:Main:LensID',
    ),
    exposureTime: text(
      'ExifIFD:Main:ExposureTime',
      'XMP-exif:Main:ExposureTime',
    ),
    aperture: numeric(text('ExifIFD:Main:FNumber', 'XMP-exif:Main:FNumber')),
    iso: numeric(text('ExifIFD:Main:ISO', 'XMP-exif:Main:ISO')),
    focalLength: numeric(
      text('ExifIFD:Main:FocalLength', 'XMP-exif:Main:FocalLength'),
      ' mm',
    ),
    capturedAt: text(
      'ExifIFD:Main:DateTimeOriginal',
      'XMP-exif:Main:DateTimeOriginal',
    ),
    latitude: text('GPS:Main:GPSLatitude', 'XMP-exif:Main:GPSLatitude'),
    latitudeRef: text('GPS:Main:GPSLatitudeRef'),
    longitude: text('GPS:Main:GPSLongitude', 'XMP-exif:Main:GPSLongitude'),
    longitudeRef: text('GPS:Main:GPSLongitudeRef'),
  };
}
export type PhotographyFields = ReturnType<typeof photographyFields>;
