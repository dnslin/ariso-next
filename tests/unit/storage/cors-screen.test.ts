import type { ReactNode } from 'react';
import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({ children }: { children: ReactNode }) =>
    jsx('main', { children }),
}));
vi.mock('../../../src/components/storage/use-cors-test', () => ({
  useCorsTest: () => ({
    query: {
      isPending: false,
      isError: true,
      error: new Error('Verification: real CORS state response was lost'),
    },
    busy: false,
    testing: false,
    message: '',
    refresh: vi.fn(),
    start: vi.fn(),
    retryCleanup: vi.fn(),
  }),
}));

import { CorsScreen } from '../../../src/components/storage/cors-screen';

it('announces an unavailable CORS read as an alert with the error and retry, without runnable detection', () => {
  // The query state and shell are fixtures; CorsScreen and HeroUI render real markup.
  const html = renderToStaticMarkup(
    jsx(CorsScreen, {
      storageId: 'storage',
      name: 'Ariso',
      description: '',
      email: 'owner@example.test',
      ownerName: 'Owner',
    }),
  );
  expect(html).toContain('data-state="error"');
  expect(html).toContain('role="alert"');
  expect(html).toContain('无法读取直传设置');
  expect(html).toContain('Verification: real CORS state response was lost');
  expect(html).toContain('重新加载');
  expect(html).not.toContain('data-testid="cors-start"');
});
