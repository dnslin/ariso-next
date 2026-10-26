import { expect, it } from 'vitest';
import { imageEditorReturn } from '../../../src/components/image-editor/return-to';

it('returns to owner media source pages while retaining their source query', () => {
  expect(imageEditorReturn('/upload?albumId=album-one')).toBe(
    '/upload?albumId=album-one',
  );
  expect(imageEditorReturn('/library?image=image-one&layout=grid')).toBe(
    '/library?image=image-one&layout=grid',
  );
  expect(imageEditorReturn('/albums/album-one')).toBe('/albums/album-one');
});
it('does not let an editor return parameter navigate to an external origin or unrelated endpoint', () => {
  for (const value of [
    'https://other.example/library',
    '//other.example/upload',
    '/api/images',
    null,
  ])
    expect(imageEditorReturn(value)).toBe('/library');
});
