import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const serial = '123456789012345678901234567890';

export async function verifyMetadata({ directory, run }) {
  await mkdir(directory, { recursive: true });
  const source = join(directory, 'metadata.jpg');
  const profile = fileURLToPath(
    new URL('../../fixtures/media-formats/sRGB2014.icc', import.meta.url),
  );
  await run('magick', [
    '-size',
    '32x16',
    'xc:red',
    '-profile',
    profile,
    source,
  ]);
  await run('exiftool', [
    '-overwrite_original',
    '-EXIF:Artist=first',
    '-XMP-tiff:Artist=other-group',
    '-EXIF:ImageDescription=1.10',
    `-ExifIFD:SerialNumber=${serial}`,
    '-GPSLatitude=31.2',
    '-GPSLatitudeRef=N',
    '-GPSLongitude=121.5',
    '-GPSLongitudeRef=E',
    '-Orientation#=6',
    '-XMP-mwg-rs:RegionInfo={AppliedToDimensions={W=32,H=16,Unit=pixel},RegionList=[{Name=1.10,Type=Face,Area={X=0.5,Y=0.5,W=0.2,H=0.2,Unit=normalized}}]}',
    source,
  ]);
  // Construct one additional APP1 segment from ExifTool's complete TIFF output.
  // This fixture operation does not parse arbitrary JPEG input.
  const { stdout: exif } = await run('exiftool', ['-b', '-EXIF', source], {
    encoding: 'buffer',
  });
  await run('exiftool', ['-overwrite_original', '-EXIF:Artist=second', source]);
  const jpeg = await readFile(source);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(exif.length + 8, 2);
  await writeFile(
    source,
    Buffer.concat([
      jpeg.subarray(0, 2),
      header,
      Buffer.from('Exif\0\0'),
      exif,
      jpeg.subarray(2),
    ]),
  );
  const original = await readFile(source);
  const args = [
    '-json',
    '-a',
    '-G1:3:4',
    '-struct',
    '-api',
    'structformat=jsonq',
    source,
  ];
  const { stdout } = await run('exiftool', args);
  await writeFile(join(directory, 'metadata.json'), stdout);
  const [metadata] = JSON.parse(stdout);
  const entries = Object.entries(metadata);
  const values = (group, tag) =>
    entries
      .filter(([key]) => key.startsWith(`${group}:`) && key.endsWith(`:${tag}`))
      .map(([, value]) => value);
  assert.deepEqual(values('IFD0', 'Artist').sort(), ['first', 'second']);
  assert.deepEqual(values('XMP-tiff', 'Artist'), ['other-group']);
  assert.ok(
    values('IFD0', 'ImageDescription').every((value) => value === '1.10'),
  );
  assert.equal(values('IFD0', 'ImageDescription').length, 2);
  assert.deepEqual(values('ExifIFD', 'SerialNumber'), [serial, serial]);
  assert.deepEqual(values('IFD0', 'Orientation'), [
    'Rotate 90 CW',
    'Rotate 90 CW',
  ]);
  assert.equal(values('GPS', 'GPSLatitude').length, 2);
  assert.ok(
    values('GPS', 'GPSLatitude').every((value) => value.includes('31 deg 12')),
  );
  assert.equal(values('GPS', 'GPSLongitude').length, 2);
  assert.ok(
    values('GPS', 'GPSLongitude').every((value) =>
      value.includes('121 deg 30'),
    ),
  );
  const [region] = values('XMP-mwg-rs', 'RegionInfo');
  assert.equal(region.RegionList[0].Name, '1.10');
  assert.equal(region.AppliedToDimensions.W, '32');
  assert.equal(region.RegionList[0].Area.X, '0.5');
  assert.ok(entries.some(([key]) => key.startsWith('ICC-header:')));
  assert.ok(
    entries.some(
      ([key, value]) =>
        key.endsWith(':ProfileDescription') && value.includes('sRGB'),
    ),
  );
  const { stdout: extractedProfile } = await run(
    'exiftool',
    ['-b', '-ICC_Profile', source],
    { encoding: 'buffer' },
  );
  assert.deepEqual(Buffer.from(extractedProfile), await readFile(profile));
  assert.deepEqual(
    await readFile(source),
    original,
    'Metadata reads must preserve every original byte',
  );
  return {
    status: 'passed',
    source,
    sha256: digest(original),
    bytes: original.length,
    args,
    metadataPath: join(directory, 'metadata.json'),
    duplicateArtists: values('IFD0', 'Artist'),
    groupedArtist: values('XMP-tiff', 'Artist'),
    numericText: '1.10',
    serial,
    structuredXmp: region,
    iccSha256: digest(extractedProfile),
    originalUnchanged: true,
    scope:
      'Tool-level extraction only; persistence, retry and ready-state semantics belong to MEDIA-METADATA.',
  };
}
