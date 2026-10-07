import { beforeEach, expect, it, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GithubAccount } from '../../../src/components/identity/github-account';
import type { useGithubAccount } from '../../../src/components/identity/use-github-account';
import type { useGithubAccountView } from '../../../src/components/identity/use-github-account-view';

const state = vi.hoisted(() => ({
  view: {} as ReturnType<typeof useGithubAccountView>,
  expandDifference: false,
}));
vi.mock('../../../src/components/identity/use-github-account-view', () => ({
  useGithubAccountView: () => state.view,
}));
vi.mock('@heroui/react/accordion', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@heroui/react/accordion')>();
  function Accordion(props: ComponentProps<typeof actual.Accordion>) {
    return createElement(actual.Accordion, {
      ...props,
      ...(state.expandDifference
        ? { defaultExpandedKeys: ['oauth-configuration-difference'] }
        : {}),
    });
  }
  return { ...actual, Accordion: Object.assign(Accordion, actual.Accordion) };
});
const account = {
  sessionLost: false,
  linking: false,
  linkError: '',
  link: vi.fn(),
} as unknown as ReturnType<typeof useGithubAccount>;
function render() {
  return renderToStaticMarkup(createElement(GithubAccount, { account }));
}
function button(html: string, id: string) {
  return html.match(
    new RegExp(
      `<button(?=[^>]*data-testid="${id}")([^>]*)>([\\s\\S]*?)<\\/button>`,
    ),
  );
}
function expectEnabledButton(html: string, id: string) {
  const control = button(html, id);
  expect(control, id).not.toBeNull();
  expect(control![1], id).not.toMatch(/\bdisabled=/);
}
beforeEach(() => {
  state.expandDifference = false;
  account.linking = false;
  account.linkError = '';
  const configuration = {
    enabled: true,
    clientId: 'saved-client',
    hasSecret: true,
  };
  const query = {
    isFetchedAfterMount: true,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  };
  state.view = {
    settings: {
      ...query,
      data: {
        saved: configuration,
        effective: configuration,
        pendingRestart: false,
        callbackUrl: 'https://photos.example/api/auth/callback/github',
      },
    },
    binding: { ...query, data: null },
    bindingLoading: false,
    settingsReady: true,
    bindingReady: true,
    bound: null,
    canLink: true,
    settingsUnknown: false,
    unlinkUnknown: false,
    settingsResult: 'known',
    editorOpen: false,
    unlinkOpen: false,
    callbackFailed: false,
    openEditor: vi.fn(),
    openUnlink: vi.fn(),
    checkSettings: vi.fn(),
    checkBinding: vi.fn(),
  } as unknown as ReturnType<typeof useGithubAccountView>;
});
it('offers configuration first when GitHub has not been configured, without an unavailable binding action', () => {
  const empty = { enabled: false, clientId: '', hasSecret: false };
  state.view.settings.data = {
    ...state.view.settings.data!,
    saved: empty,
    effective: empty,
  };
  state.view.canLink = false;
  const html = render();
  expect(button(html, 'account-github-config')?.[2]).toContain('配置 GitHub');
  expect(button(html, 'account-github-link')).toBeNull();
  expect(html).toContain('完成配置后可绑定');
});
it('offers binding after configuration is effective, with a separate configuration action', () => {
  const html = render();
  expectEnabledButton(html, 'account-github-link');
  expectEnabledButton(html, 'account-github-config');
  expect(html).toContain('站点登录配置');
  expect(html).toContain('GitHub 账号');
});
it('preserves a bound account and unlink action while GitHub login is disabled', () => {
  state.view.bound = state.view.binding.data = {
    accountId: 'github-1',
    login: 'owner',
  };
  state.view.settings.data!.effective.enabled = false;
  state.view.canLink = false;
  const html = render();
  expect(html).toContain('@owner');
  expect(html).toContain('登录已停用，绑定保留');
  expectEnabledButton(html, 'account-github-unlink');
});
it('keeps configuration usable after a failed binding read and exposes only the binding retry', () => {
  state.view.binding.isError = true;
  state.view.binding.error = new Error('binding read failed') as never;
  state.view.bindingReady = state.view.canLink = false;
  const html = render();
  expect(button(html, 'account-github-reload')).not.toBeNull();
  expect(button(html, 'account-github-link')).toBeNull();
  expect(button(html, 'account-github-unlink')).toBeNull();
  expectEnabledButton(html, 'account-github-config');
});
it('uses binding readback after an unknown unlink, while configuration remains independent', () => {
  state.view.bound = state.view.binding.data = {
    accountId: 'github-1',
    login: 'owner',
  };
  state.view.unlinkUnknown = true;
  state.view.bindingReady = state.view.canLink = false;
  const html = render();
  expect(html).toContain('上次读取');
  expect(html).toContain('@owner');
  expect(button(html, 'account-github-reload')).not.toBeNull();
  expect(button(html, 'account-github-unlink')).toBeNull();
  expectEnabledButton(html, 'account-github-config');
});
it('requires configuration readback after an unknown save and retains the known effective state', () => {
  state.view.settingsUnknown = true;
  state.view.settingsReady = state.view.canLink = false;
  const html = render();
  expect(html).toContain('已启用');
  expect(html).toContain('配置保存结果待核对');
  expect(button(html, 'oauth-settings-reload')).not.toBeNull();
  expect(button(html, 'account-github-config')).toBeNull();
  expect(button(html, 'account-github-link')).toBeNull();
});
it('keeps saved and effective enable states visible when a restart is pending', () => {
  state.view.settings.data!.saved = {
    ...state.view.settings.data!.saved,
    enabled: false,
  };
  state.view.settings.data!.pendingRestart = true;
  const html = render();
  expect(html).toMatch(/已保存：[\s\S]*?停用/);
  expect(html).toMatch(/当前生效：[\s\S]*?启用/);
  expect(html).toContain('重启容器后使用已保存配置');
  expect(html).toContain('查看配置差异');
});
it('keeps the limitation on secret-result confirmation after readback', () => {
  state.view.settingsResult = 'verified';
  expect(render()).toContain('无法确认这次密钥修改结果');
});
it('shows the effective disabled state when saved credentials have been cleared pending restart', () => {
  state.view.settings.data!.saved = {
    enabled: false,
    clientId: '',
    hasSecret: false,
  };
  state.view.settings.data!.effective = {
    enabled: false,
    clientId: 'effective-client',
    hasSecret: true,
  };
  state.view.settings.data!.pendingRestart = true;
  state.view.canLink = false;
  const html = render();
  expect(html).toContain('当前生效：未启用');
  expect(html).not.toContain('当前生效：尚未配置');
  expectEnabledButton(html, 'account-github-config');
});
it('keeps unlink independent when configuration cannot be read', () => {
  state.view.bound = state.view.binding.data = {
    accountId: 'github-1',
    login: 'owner',
  };
  state.view.settings.isError = true;
  state.view.settings.error = new Error('configuration read failed') as never;
  state.view.settingsReady = state.view.canLink = false;
  const html = render();
  expectEnabledButton(html, 'account-github-unlink');
  expectEnabledButton(html, 'oauth-settings-reload');
  expect(button(html, 'account-github-config')).toBeNull();
  expect(html).not.toContain('登录已停用，绑定保留');
});
it('keeps independently loaded binding controls while configuration is loading', () => {
  state.view.bound = state.view.binding.data = {
    accountId: 'github-1',
    login: 'owner',
  };
  state.view.settings.isFetching = true;
  state.view.settingsReady = state.view.canLink = false;
  const html = render();
  expect(html).toContain('正在读取登录配置');
  expectEnabledButton(html, 'account-github-unlink');
  expect(button(html, 'account-github-config')).toBeNull();
  expect(button(html, 'oauth-settings-reload')).toBeNull();
});
it('hides stale binding controls while an independent binding read is in progress', () => {
  state.view.bound = state.view.binding.data = {
    accountId: 'github-1',
    login: 'owner',
  };
  state.view.binding.isFetching = state.view.bindingLoading = true;
  state.view.bindingReady = state.view.canLink = false;
  const html = render();
  expect(html).toContain('正在读取绑定状态');
  expectEnabledButton(html, 'account-github-config');
  expect(button(html, 'account-github-unlink')).toBeNull();
  expect(button(html, 'account-github-link')).toBeNull();
  expect(html).not.toContain('@owner');
});
it('keeps the redirect action busy while leaving configuration available', () => {
  account.linking = true;
  const html = render();
  const link = button(html, 'account-github-link');
  expect(link).not.toBeNull();
  expect(link![1]).toMatch(/\bdisabled=/);
  expect(link![2]).toContain('正在前往');
  expectEnabledButton(html, 'account-github-config');
});
it('shows each expanded configuration snapshot as separate enable, Client ID and secret-state lines', () => {
  state.expandDifference = true;
  state.view.settings.data!.saved = {
    enabled: false,
    clientId: 'saved-client',
    hasSecret: false,
  };
  state.view.settings.data!.effective = {
    enabled: true,
    clientId: 'effective-client',
    hasSecret: true,
  };
  state.view.settings.data!.pendingRestart = true;
  const html = render();
  expect(button(html, 'oauth-config-difference')?.[1]).toContain(
    'aria-expanded="true"',
  );
  const snapshots = [
    ...html.matchAll(
      /<div(?=[^>]*data-testid="oauth-config-snapshot")[^>]*>([\s\S]*?)<\/div>/g,
    ),
  ].map((match) =>
    [...match[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((line) =>
      line[1].replace(/<[^>]*>/g, ''),
    ),
  );
  expect(snapshots).toEqual([
    ['已保存 · 停用', 'Client ID：saved-client', '密钥未设置'],
    ['当前生效 · 启用', 'Client ID：effective-client', '密钥已设置'],
  ]);
});
