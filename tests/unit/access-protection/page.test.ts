import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { AccessProtectionPage } from '../../../src/components/access-protection/page';
import type { AccessProtectionSettingsResponse } from '../../../src/server/access-protection/types';

const state = vi.hoisted(() => ({
  editor: {} as Record<string, unknown>,
  fetched: true,
  fetching: false,
}));
vi.mock(
  '../../../src/components/access-protection/use-access-protection',
  () => ({ useAccessProtection: () => state.editor }),
);
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    isFetchedAfterMount: state.fetched,
    isFetching: state.fetching,
    isSuccess: true,
    data: state.editor.saved,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/general/access-protection',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({
    children,
    footer,
  }: {
    children: ReactNode;
    footer: ReactNode;
  }) =>
    createElement(
      'main',
      null,
      children,
      createElement('footer', null, footer),
    ),
}));
const saved: AccessProtectionSettingsResponse = {
  mode: 'observe',
  rate: 10,
  burst: 200,
  updatedAt: '2026-10-22T00:00:00Z',
  clientIp: { ready: true, message: null },
};
const shell = {
  name: 'Ariso',
  description: '',
  email: 'owner@example.test',
  ownerName: 'Owner',
};
const render = () =>
  renderToStaticMarkup(createElement(AccessProtectionPage, shell));
beforeEach(() => {
  state.fetched = true;
  state.fetching = false;
  state.editor = {
    saved,
    input: { mode: 'observe', rate: 10, burst: 200 },
    phase: 'ready',
    errors: {},
    message: '',
    expired: false,
    busy: false,
    uncertain: false,
    locked: false,
    ipBlocked: false,
    dirty: false,
    change: vi.fn(),
    suggested: vi.fn(),
    save: vi.fn(),
    reconcile: vi.fn(),
    chooseSaved: vi.fn(),
    expire: vi.fn(),
  };
});

it('does not present fabricated default limits before the first settings read', () => {
  state.fetched = false;
  state.fetching = true;
  state.editor.saved = null;
  state.editor.locked = true;
  const html = render();
  expect(html).not.toContain('id="access-protection-form"');
  expect(html).toMatch(
    /<button[^>]*data-testid="access-protection-save"[^>]*disabled/,
  );
  expect(html).toContain('data-state="loading"');
});

it('renders the approved compact form, units and four help controls without a configurable owner exemption', () => {
  const html = render();
  for (const label of ['防护范围', '防护模式', '持续请求频率', '突发请求额度'])
    expect(html).toContain(`aria-label="${label}说明"`);
  expect(html).toContain('已登录所有者免于此限频');
  expect(html).toContain('次 / 秒 / IP');
  expect(html).toContain('次 / IP');
  expect(html).not.toContain('type="checkbox"');
  expect(html).not.toContain('交互原型');
  expect(html).not.toContain('演示场景');
});

it('shows the IP prerequisite directly and disables only an enforce submission', () => {
  state.editor.saved = {
    ...saved,
    clientIp: { ready: false, message: '请核对代理配置。' },
  };
  state.editor.input = { mode: 'enforce', rate: 10, burst: 200 };
  state.editor.ipBlocked = true;
  const html = render();
  expect(html).toContain('暂时无法启用拦截');
  expect(html).toContain('请核对代理配置。');
  expect(html).toMatch(
    /<button[^>]*data-testid="access-protection-save"[^>]*disabled/,
  );
  state.editor.input = { mode: 'off', rate: 10, burst: 200 };
  state.editor.ipBlocked = false;
  expect(render()).not.toMatch(
    /<button[^>]*data-testid="access-protection-save"[^>]*disabled/,
  );
});

it('preserves expired-session input while preventing saves and using the exact return path', () => {
  state.editor.expired = true;
  state.editor.locked = true;
  state.editor.input = { mode: 'observe', rate: 25, burst: 300 };
  const html = render();
  expect(html).toContain('会话已失效');
  expect(html).toContain('value="25"');
  expect(html).toContain('returnTo=%2Fsettings%2Fgeneral%2Faccess-protection');
  expect(html).toMatch(
    /<button[^>]*data-testid="access-protection-save"[^>]*disabled/,
  );
});
