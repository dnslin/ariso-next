import { expect, it } from 'vitest';
import {
  storageReferenceDestination,
  storageReferenceReturn,
} from '../../../src/components/storage/reference-navigation';

it('keeps storage and exact image identity in both management destinations', () => {
  for (const trash of [false, true]) {
    const url = new URL(
      storageReferenceDestination('archive', trash, 'photo'),
      'http://ariso.test',
    );
    expect(url.pathname).toBe(trash ? '/trash' : '/library');
    expect(url.searchParams.get('storageId')).toBe('archive');
    expect(url.searchParams.get('image')).toBe('photo');
    expect(storageReferenceReturn(url.searchParams.get('storageReturn'))).toBe(
      '/settings/storage/archive?view=references',
    );
  }
});

it('only presents a return control for a storage reference page', () => {
  for (const value of [
    null,
    '',
    'https://ariso.test/settings/storage/a?view=references',
    '/library',
    '/settings/storage/a',
    '/settings/storage/a?view=other',
  ])
    expect(storageReferenceReturn(value)).toBeNull();
});
