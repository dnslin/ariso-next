import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  DependencyList,
  EffectCallback,
  ReactElement,
  ReactNode,
} from 'react';
import { LoginForm } from '../../../src/components/identity/login-form';
import { useGithubAccount } from '../../../src/components/identity/use-github-account';
import { useGithubAccountView } from '../../../src/components/identity/use-github-account-view';
import { GithubCallbackCopy } from '../../../src/components/identity/github-callback-copy';
import { useGithubSettingsEditor } from '../../../src/components/identity/use-github-settings-editor';
import { useGithubUnlink } from '../../../src/components/identity/use-github-unlink';

// Model retained React hook state and browser lifecycle delivery only. These
// tests do not establish that a real browser selected bfcache for this page.
const runtime = vi.hoisted(() => ({ current: null as HookHarness | null }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => runtime.current!.state(initial),
  useRef: (initial: unknown) => runtime.current!.ref(initial),
  useEffect: (effect: EffectCallback, deps?: DependencyList) =>
    runtime.current!.effect(effect, deps),
}));
vi.mock('@heroui/react/alert', () => ({ Alert: 'alert' }));
vi.mock('@heroui/react/button', () => ({ Button: 'button' }));
vi.mock('@heroui/react/form', () => ({ Form: 'form' }));
vi.mock('@heroui/react/link', () => ({ Link: 'a' }));
vi.mock('@heroui/react/spinner', () => ({ Spinner: 'spinner' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));
const notifications = vi.hoisted(() => ({
  show: vi.fn(),
  close: vi.fn(),
}));
vi.mock('@heroui/react/toast', () => ({
  toast: Object.assign(notifications.show, { close: notifications.close }),
}));
vi.mock('../../../src/components/identity/identity-field', () => ({
  IdentityField: 'identity-field',
}));
const requests = vi.hoisted(() => ({
  signIn: vi.fn(),
  link: vi.fn(),
  readSettings: vi.fn(),
  saveSettings: vi.fn(),
  readBinding: vi.fn(),
  unlink: vi.fn(),
}));
vi.mock('../../../src/components/identity/github-request', () => ({
  signInGithub: requests.signIn,
  linkGithub: requests.link,
  readGithubSettings: requests.readSettings,
  saveGithubSettings: requests.saveSettings,
  readGithubBinding: requests.readBinding,
  unlinkGithub: requests.unlink,
}));
const queries = vi.hoisted(() => ({ values: new Map<string, Query>() }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queries.values.get(queryKey[0]),
}));

class HookHarness {
  private cells: unknown[] = [];
  private cursor = 0;
  private pending: (() => void)[] = [];
  private cleanups = new Map<number, () => void>();
  state(initial: unknown) {
    const index = this.cursor++;
    if (!(index in this.cells))
      this.cells[index] = typeof initial === 'function' ? initial() : initial;
    return [
      this.cells[index],
      (value: unknown) => {
        this.cells[index] =
          typeof value === 'function' ? value(this.cells[index]) : value;
      },
    ];
  }
  ref(initial: unknown) {
    const index = this.cursor++;
    if (!(index in this.cells)) this.cells[index] = { current: initial };
    return this.cells[index];
  }
  effect(effect: EffectCallback, deps?: DependencyList) {
    const index = this.cursor++;
    const previous = this.cells[index] as DependencyList | undefined;
    if (
      !deps ||
      !previous ||
      deps.some((value, i) => !Object.is(value, previous[i]))
    ) {
      this.cells[index] = deps;
      this.pending.push(() => {
        this.cleanups.get(index)?.();
        const cleanup = effect();
        if (cleanup) this.cleanups.set(index, cleanup);
        else this.cleanups.delete(index);
      });
    }
  }
  render<T>(component: () => T) {
    this.cursor = 0;
    runtime.current = this;
    const result = component();
    for (const effect of this.pending.splice(0)) effect();
    return result;
  }
  unmount() {
    for (const cleanup of this.cleanups.values()) cleanup();
    this.cleanups.clear();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
type Query = {
  data: unknown;
  error: null;
  isError: boolean;
  isFetching: boolean;
  isFetchedAfterMount: boolean;
  refetch: ReturnType<typeof vi.fn>;
};
function query(data: unknown) {
  const next = deferred<unknown>();
  const value: Query = {
    data,
    error: null,
    isError: false,
    isFetching: false,
    isFetchedAfterMount: true,
    refetch: vi.fn(async () => {
      value.isFetching = true;
      value.data = await next.promise;
      value.isFetching = false;
      return { data: value.data, isError: false };
    }),
  };
  return { value, next };
}
let windowEvents: EventTarget;
const mounted: HookHarness[] = [];
function mount<T>(component: () => T) {
  const hooks = new HookHarness();
  mounted.push(hooks);
  return {
    render: () => hooks.render(component),
    unmount: () => hooks.unmount(),
  };
}
function pageShow(persisted: boolean) {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  windowEvents.dispatchEvent(event);
}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children as ReactNode)];
}
function loginElements(tree: ReactNode) {
  const nodes = elements(tree);
  return {
    github: nodes.find((node) => node.props['data-testid'] === 'login-github')!,
    password: nodes.find((node) => node.props.type === 'submit')!,
    form: nodes.find((node) => node.type === 'form')!,
    field: (name: string) => nodes.find((node) => node.props.name === name)!,
  };
}
function press(element: ReactElement<Record<string, unknown>>) {
  (element.props.onPress as () => void)();
}
const login = () =>
  LoginForm({
    initialized: true,
    githubEnabled: true,
    returnTo: '/library',
    notice: '',
  });
const authorize = 'https://github.com/login/oauth/authorize?state=test';
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  notifications.show.mockReset().mockReturnValue('copy-notification');
  notifications.close.mockReset();
  requests.signIn.mockReset().mockResolvedValue(authorize);
  requests.link.mockReset().mockResolvedValue(authorize);
  requests.readSettings.mockReset();
  requests.saveSettings.mockReset();
  requests.readBinding.mockReset();
  requests.unlink.mockReset();
  queries.values.clear();
  windowEvents = new EventTarget();
  vi.stubGlobal('window', {
    location: { origin: 'https://photos.example', assign: vi.fn() },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
  });
});

it.each([false, true])(
  'returns focus to the current configuration action after uncertain readback: verified=%s',
  (verified) => {
    const focus = vi.fn();
    const selector = vi.fn(() => ({ focus }));
    vi.stubGlobal('document', { querySelector: selector });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const account = {
      settings: query({ effective: { enabled: true } }).value,
      binding: query(null).value,
    } as unknown as ReturnType<typeof useGithubAccount>;
    const page = mount(() => useGithubAccountView(account));
    page.render().openEditor();
    page.render().settingsUncertain();
    expect(page.render().settingsUnknown).toBe(true);
    if (verified) page.render().settingsVerified();
    page.render().closeEditor();
    expect(page.render().editorOpen).toBe(false);
    expect(selector).toHaveBeenCalledWith(
      verified
        ? '[data-testid="account-github-config"]'
        : '[data-testid="oauth-settings-reload"]',
    );
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  },
);

it('restores configuration focus after readback commits its replacement action', async () => {
  const focus = vi.fn();
  let actionCommitted = false;
  vi.stubGlobal('document', {
    querySelector: vi.fn(() => (actionCommitted ? { focus } : null)),
  });
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  const settings = query({ effective: { enabled: false } });
  const result = deferred<{ isError: boolean }>();
  settings.value.refetch.mockImplementation(() => result.promise);
  const account = {
    settings: settings.value,
    binding: query(null).value,
  } as unknown as ReturnType<typeof useGithubAccount>;
  const page = mount(() => useGithubAccountView(account));
  page.render().settingsUncertain();
  const checking = page.render().checkSettings();
  settings.value.isFetching = true;
  page.render();
  result.resolve({ isError: false });
  await checking;
  // A successful refetch promise may precede the observer's committed view.
  for (const frame of frames.splice(0)) frame(0);
  expect(focus).not.toHaveBeenCalled();
  expect(page.render().settingsReady).toBe(false);
  settings.value.isFetching = false;
  actionCommitted = true;
  expect(page.render().settingsReady).toBe(true);
  for (const frame of frames.splice(0)) frame(0);
  expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  page.render();
  expect(focus).toHaveBeenCalledTimes(1);
});

it('closes only its previous copy notification before a denied retry exposes manual copying', async () => {
  const writeText = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('Clipboard permission denied'));
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const url = 'https://photos.example/api/auth/callback/github';
  const page = mount(() => GithubCallbackCopy({ url, isDisabled: false }));
  const copy = () =>
    elements(page.render()).find(
      (node) => node.props['aria-label'] === '复制 GitHub 回调地址',
    )!;
  press(copy());
  await flush();
  expect(notifications.show).toHaveBeenCalledTimes(1);
  expect(notifications.close).not.toHaveBeenCalled();
  press(copy());
  await flush();
  expect(notifications.close).toHaveBeenCalledExactlyOnceWith(
    'copy-notification',
  );
  expect(notifications.show).toHaveBeenCalledTimes(1);
  expect(writeText).toHaveBeenNthCalledWith(2, url);
  expect(
    elements(page.render()).find(
      (node) => node.props['data-testid'] === 'oauth-manual-copy',
    ),
  ).toBeDefined();
});

it.each([false, true])(
  'restores the current binding action when closing recovery: verified=%s',
  (verified) => {
    const focus = vi.fn();
    const selector = vi.fn(() => ({ focus }));
    vi.stubGlobal('document', { querySelector: selector });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const account = {
      settings: query({ effective: { enabled: true } }).value,
      binding: query({ accountId: 'owner', login: 'owner' }).value,
    } as unknown as ReturnType<typeof useGithubAccount>;
    const page = mount(() => useGithubAccountView(account));
    page.render().openUnlink();
    page.render().unlinkUncertain();
    if (verified) page.render().unlinkVerified();
    page.render().closeUnlink();
    expect(page.render().unlinkOpen).toBe(false);
    expect(selector).toHaveBeenCalledWith(
      verified
        ? '[data-testid="account-github-unlink"]'
        : '[data-testid="account-github-reload"]',
    );
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  },
);

it.each([false, true])(
  'focuses an enabled unlink recovery action without repeating DELETE: readback=%s',
  async (readback) => {
    const focus = vi.fn();
    const selector = vi.fn(() => ({ focus }));
    vi.stubGlobal('document', { querySelector: selector });
    requests.unlink.mockRejectedValue(new Error('Uncertain unlink'));
    if (readback)
      requests.readBinding.mockResolvedValue({
        accountId: 'owner',
        login: 'owner',
      });
    else requests.readBinding.mockRejectedValue(new Error('Read failed'));
    const page = mount(() =>
      useGithubUnlink({
        onClose: vi.fn(),
        onUpdate: vi.fn(),
        onUnlinked: vi.fn(),
        onUncertain: vi.fn(),
        onVerified: vi.fn(),
        onSessionExpire: vi.fn(),
      }),
    );
    await page.render().submit();
    expect(page.render().phase).toBe(readback ? 'editing' : 'unknown');
    expect(selector).toHaveBeenCalledExactlyOnceWith(
      `[data-testid="github-unlink"] [data-testid="account-github-${readback ? 'unlink-confirm' : 'reload'}"]`,
    );
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(requests.unlink).toHaveBeenCalledTimes(1);
    expect(requests.readBinding).toHaveBeenCalledTimes(1);
  },
);

it.each([false, true])(
  'focuses an enabled recovery action after uncertain saving: readback=%s',
  async (readback) => {
    const focus = vi.fn();
    const byId = vi.fn(() => ({ focus }));
    const selector = vi.fn(() => ({ focus }));
    vi.stubGlobal('document', {
      getElementById: byId,
      querySelector: selector,
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const saved = { enabled: false, clientId: 'saved', hasSecret: true };
    const settings = {
      saved,
      effective: saved,
      pendingRestart: false,
      callbackUrl: 'https://photos.example/api/auth/callback/github',
    };
    requests.saveSettings.mockRejectedValue(new Error('Uncertain write'));
    if (readback) requests.readSettings.mockResolvedValue(settings);
    else requests.readSettings.mockRejectedValue(new Error('Read failed'));
    const page = mount(() =>
      useGithubSettingsEditor({
        settings,
        onClose: vi.fn(),
        onUpdate: vi.fn(),
        onSaved: vi.fn(),
        onUncertain: vi.fn(),
        onVerified: vi.fn(),
        onSessionExpire: vi.fn(),
      }),
    );
    page.render();
    byId.mockClear();
    focus.mockClear();
    await page.render().submit();
    expect(page.render().phase).toBe(readback ? 'verified' : 'unknown');
    expect(selector).toHaveBeenCalledExactlyOnceWith(
      `[data-testid="oauth-${readback ? 'close' : 'reload'}"]`,
    );
    expect(byId).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(requests.saveSettings).toHaveBeenCalledTimes(1);
    expect(requests.readSettings).toHaveBeenCalledTimes(1);
  },
);
afterEach(() => {
  for (const hooks of mounted.splice(0)) hooks.unmount();
  vi.unstubAllGlobals();
});

it('restores both login choices after returning from OAuth, without allowing duplicate requests', async () => {
  const page = mount(login);
  press(loginElements(page.render()).github);
  await flush();
  pageShow(false);
  let controls = loginElements(page.render());
  expect(controls.github.props.isDisabled).toBe(true);
  expect(controls.password.props.isDisabled).toBe(true);
  press(controls.github);
  expect(requests.signIn).toHaveBeenCalledTimes(1);
  pageShow(true);
  controls = loginElements(page.render());
  expect(controls.github.props.isDisabled).toBe(false);
  expect(controls.password.props.isDisabled).toBe(false);
  press(controls.github);
  press(controls.github);
  await flush();
  expect(requests.signIn).toHaveBeenCalledTimes(2);
});

it('does not unlock an OAuth request before navigation actually begins', async () => {
  const pending = deferred<string>();
  requests.signIn.mockReturnValue(pending.promise);
  const page = mount(login);
  press(loginElements(page.render()).github);
  pageShow(true);
  const controls = loginElements(page.render());
  expect(controls.github.props.isDisabled).toBe(true);
  press(controls.github);
  expect(requests.signIn).toHaveBeenCalledTimes(1);
  pending.resolve(authorize);
  await flush();
});

it('does not unlock a local password request on a persisted pageshow', async () => {
  const pending = deferred<Response>();
  const fetcher = vi.fn(() => pending.promise);
  vi.stubGlobal('fetch', fetcher);
  const page = mount(login);
  let controls = loginElements(page.render());
  (controls.field('email').props.onChange as (value: string) => void)(
    'owner@example.test',
  );
  (controls.field('password').props.onChange as (value: string) => void)(
    'valid-password',
  );
  controls = loginElements(page.render());
  const submit = controls.form.props.onSubmit as (event: {
    preventDefault(): void;
  }) => void;
  submit({ preventDefault() {} });
  pageShow(true);
  controls = loginElements(page.render());
  expect(controls.github.props.isDisabled).toBe(true);
  expect(controls.password.props.isDisabled).toBe(true);
  submit({ preventDefault() {} });
  expect(fetcher).toHaveBeenCalledTimes(1);
  pending.resolve(Response.json({ code: 'INVALID_PASSWORD' }, { status: 401 }));
  await flush();
});

it.each([
  { enabled: true, binding: null, canRetry: true },
  { enabled: false, binding: null, canRetry: false },
  {
    enabled: true,
    binding: { accountId: '181', login: 'owner' },
    canRetry: false,
  },
])(
  'rereads configuration and binding before retry after OAuth return: %j',
  async ({ enabled, binding, canRetry }) => {
    const settings = query({ effective: { enabled: true } });
    const account = query(null);
    queries.values.set('github-settings', settings.value);
    queries.values.set('github-binding', account.value);
    const page = mount(() => useGithubAccount(vi.fn()));
    await page.render().link();
    pageShow(false);
    expect(page.render().linking).toBe(true);
    expect(settings.value.refetch).not.toHaveBeenCalled();
    pageShow(true);
    expect(settings.value.refetch).toHaveBeenCalledTimes(1);
    expect(account.value.refetch).toHaveBeenCalledTimes(1);
    await page.render().link();
    expect(requests.link).toHaveBeenCalledTimes(1);
    settings.next.resolve({ effective: { enabled } });
    account.next.resolve(binding);
    await flush();
    expect(page.render().linking).toBe(false);
    await page.render().link();
    expect(requests.link).toHaveBeenCalledTimes(canRetry ? 2 : 1);
    page.unmount();
    pageShow(true);
    expect(settings.value.refetch).toHaveBeenCalledTimes(1);
    expect(account.value.refetch).toHaveBeenCalledTimes(1);
  },
);
