import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { StorageList } from '../../../src/components/storage/storage-list';
import { StorageEditor } from '../../../src/components/storage/storage-editor';
import { StorageRequestError } from '../../../src/components/storage/storage-api';

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === 'storage-settings'
      ? { isPending: false, data: { defaultStorageId: null } }
      : {
          isPending: false,
          error: new StorageRequestError(500, {
            message: '实际存储配置暂时无法读取',
          }),
        },
  useQueryClient: vi.fn(),
}));
vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({ children }: { children: ReactNode }) =>
    jsx('main', { children }),
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => vi.fn(),
  useUploadQueue: vi.fn(),
}));

const shell = {
  name: 'Ariso',
  description: '',
  email: 'owner@example.test',
  ownerName: 'Owner',
};

it('announces a failed storage list read together with its reload action', () => {
  const html = renderToStaticMarkup(jsx(StorageList, shell));
  expect(html).toContain('无法读取存储配置');
  expect(html).toContain('实际存储配置暂时无法读取');
  expect(html).toContain('重新加载');
  expect(html).toMatch(
    /<div\b(?=[^>]*data-slot="alert-root")(?=[^>]*role="alert")[^>]*>/,
  );
});

it('announces a failed editor read while preserving its retry entry', () => {
  const html = renderToStaticMarkup(
    jsx(StorageEditor, {
      ...shell,
      storageId: 'independent-storage',
      storageRoot: '/independent-fixture/storage',
    }),
  );
  expect(html).toContain('无法读取存储配置');
  expect(html).toContain('实际存储配置暂时无法读取');
  expect(html).toContain('重新加载');
  expect(html).toMatch(
    /<div\b(?=[^>]*data-slot="alert-root")(?=[^>]*role="alert")[^>]*>/,
  );
});
