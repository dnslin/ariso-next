import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DOMParser } from '@xmldom/xmldom';
import { afterEach, expect, it, vi } from 'vitest';
import { TokensPage } from '../../../src/components/identity/tokens-page';
import { TokenRequestError } from '../../../src/components/identity/token-request';
import {
  assertTokenRefetchPending,
  readTokenRowIds,
} from '../../../e2e/tokens-page.mjs';

const query = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => query.current,
  useQueryClient: () => ({}),
}));
vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/api',
  useRouter: () => ({ push: vi.fn() }),
}));

const shell = {
  name: 'Ariso',
  description: '',
  ownerName: 'Owner',
  email: 'owner@example.test',
  timeZone: 'UTC',
};
const records = ['target', 'same-name-sibling'].map((id) => ({
  id,
  name: 'Same name',
  enabled: true,
  createdAt: '2026-10-21T00:00:00.000Z',
  expiresAt: null,
}));

function documentPage() {
  const parsed = new DOMParser().parseFromString(
    renderToStaticMarkup(createElement(TokensPage, shell)),
    'text/html',
  );
  const all = Array.from(parsed.getElementsByTagName('*'));
  const querySelectorAll = (selector: string) =>
    all
      .filter((node) =>
        selector
          .split(',')
          .some((part) =>
            Array.from(part.matchAll(/\[([^=\]]+)="([^"]*)"\]/g)).every(
              ([, attribute, value]) => node.getAttribute(attribute) === value,
            ),
          ),
      )
      .map((node) => ({
        dataset: {
          state: node.getAttribute('data-state'),
          tokenId: node.getAttribute('data-token-id'),
        },
        disabled: node.hasAttribute('disabled'),
      }));
  vi.stubGlobal('document', {
    querySelectorAll,
    querySelector: (selector: string) => querySelectorAll(selector)[0] ?? null,
  });
  return {
    evaluate: async (callback: () => unknown) => callback(),
    waitForFunction: async (callback: () => unknown) => {
      expect(callback()).toBe(true);
    },
    waitForSelector: async (selector: string) => {
      expect(querySelectorAll(selector)).not.toHaveLength(0);
    },
    querySelectorAll,
  };
}

afterEach(() => vi.unstubAllGlobals());

it('checks the actual warm-refetch markup without hiding cached IDs or enabling stale actions', async () => {
  query.current = {
    isFetchedAfterMount: true,
    isFetching: true,
    isError: false,
    data: records,
  };
  const page = documentPage();
  expect(await readTokenRowIds(page)).toEqual(['target', 'same-name-sibling']);
  await assertTokenRefetchPending(page, ['target', 'same-name-sibling']);
  await expect(assertTokenRefetchPending(page, ['target'])).rejects.toThrow();
});

it('rejects an interactive cached list as evidence of a held refetch', async () => {
  query.current = {
    isFetchedAfterMount: true,
    isFetching: false,
    isError: false,
    data: records,
  };
  const page = documentPage();
  await expect(
    assertTokenRefetchPending(page, ['target', 'same-name-sibling']),
  ).rejects.toThrow();
});

it.each(['initial', 'error'])(
  '%s reads still expose no stale management rows',
  async (state) => {
    query.current = {
      isFetchedAfterMount: state !== 'initial',
      isFetching: state === 'initial',
      isError: state === 'error',
      error: state === 'error' ? new TokenRequestError(500, {}) : null,
      data: records,
    };
    const page = documentPage();
    expect(await readTokenRowIds(page)).toEqual([]);
    expect(
      page.querySelectorAll('[data-testid="api-create-open"]')[0].disabled,
    ).toBe(true);
    expect(
      page.querySelectorAll(
        `[data-testid="api-page"][data-state="${state === 'initial' ? 'loading' : 'error'}"]`,
      ),
    ).toHaveLength(1);
  },
);
