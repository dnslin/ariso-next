import { describe, expect, it } from 'vitest';
import { parseTrashLocation } from '../../../src/app/trash/query-state';
import { libraryRequestParams } from '../../../src/app/library/query-state';
import { parseLibraryQuery } from '../../../src/server/library/query-schema';

describe('trash URL query', () => {
  it('normalizes the complete trash query with the HTTP schema', () => {
    const parsed = parseTrashLocation(
      new URLSearchParams(
        'q=%20photo%20&storageId=disabled&status=failed&deletionStatus=cleanup_failed&pageSize=80&page=3&image=one',
      ),
    );
    expect(parsed.filters).toMatchObject({
      scope: 'trash',
      q: 'photo',
      storageId: 'disabled',
      status: 'failed',
      deletionStatus: 'cleanup_failed',
      sort: 'trashed_desc',
      pageSize: 80,
    });
    expect(parsed.page).toBe(3);
    expect(
      parseLibraryQuery(libraryRequestParams(parsed.filters, { page: 3 }))
        .filters,
    ).toEqual(parsed.filters);
  });
  it('keeps detail identity and paging out of selection identity', () => {
    const first = parseTrashLocation(new URLSearchParams('q=photo&page=1'));
    const second = parseTrashLocation(
      new URLSearchParams('q=photo&page=2&image=two'),
    );
    expect(first.filters).toEqual(second.filters);
    expect(parseTrashLocation(new URLSearchParams()).filters.pageSize).toBe(40);
  });
  it('shows a Chinese recovery instruction while retaining validation diagnostics', () => {
    try {
      parseTrashLocation(new URLSearchParams('status=invalid'));
      expect.fail('An invalid processing state must fail');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('回收查询参数无效，请重置查询');
      expect((error as Error).cause).toBeInstanceOf(Error);
      expect(((error as Error).cause as Error).message).toContain(
        'Invalid option',
      );
    }
  });
  it.each([
    'scope=normal',
    'scope=trash&scope=trash',
    'sort=uploaded_desc',
    'albumId=a',
    'tagId=t',
    'format=png',
    'visibility=private',
    'uploadedFrom=2026-01-01T00:00:00Z',
    'cursor=abc',
    'pageSize=41',
    'page=0',
    'q=a&q=b',
    'unknown=value',
    'deletionStatus=failed',
  ])('retains invalid query errors for %s', (query) => {
    expect(() => parseTrashLocation(new URLSearchParams(query))).toThrow();
  });
});
