import { describe, expect, it } from 'vitest';
import {
  parseMetadata,
  photographyFields,
} from '../../../src/server/media/metadata-values.ts';

describe('complete metadata values', () => {
  it('retains groups, copies, arrays, structured values and numeric text', () => {
    const data = {
      'IFD0:Main:Artist': 'one',
      'XMP-custom:Main:Error': 'a user tag, not an extraction error',
      'IFD0:Main:Copy1:Artist': 'two',
      'XMP-dc:Main:Subject': ['1.10', '001'],
      'ExifIFD:Main:SerialNumber': '123456789012345678901234567890',
      'XMP-mwg-rs:Main:RegionInfo': { RegionList: [{ Name: '1.10' }] },
    };
    expect(parseMetadata(JSON.stringify([data]))).toEqual(data);
  });

  it.each([
    '[{',
    '[]',
    '[{},{}]',
    '[null]',
    '[{"ExifTool:Main:Error":"truncated input"}]',
  ])('rejects incomplete or unsuccessful output: %s', (output) => {
    expect(() => parseMetadata(output)).toThrow();
  });

  it('converts only explicit photography numbers and preserves textual values', () => {
    const data = {
      'IFD0:Main:Make': 'NIKON',
      'IFD0:Main:Model': 'E775',
      'ExifIFD:Main:ISO': '100',
      'Nikon:Main:Copy1:ISO': '0',
      'ExifIFD:Main:FNumber': '9.4',
      'ExifIFD:Main:FocalLength': '8.6 mm',
      'ExifIFD:Main:ExposureTime': '1/213',
      'ExifIFD:Main:DateTimeOriginal': '2001:08:01 12:57:23',
      'ExifIFD:Main:LensModel': '1.10',
    };
    expect(photographyFields(data)).toMatchObject({
      make: 'NIKON',
      model: 'E775',
      iso: 100,
      aperture: 9.4,
      focalLength: 8.6,
      exposureTime: '1/213',
      lens: '1.10',
      capturedAt: '2001:08:01 12:57:23',
    });
    expect(data['ExifIFD:Main:FocalLength']).toBe('8.6 mm');
    expect(photographyFields({ 'ExifIFD:Main:ISO': 'unknown' }).iso).toBeNull();
  });
});
