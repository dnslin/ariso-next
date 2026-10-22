import { createContext, runInContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import {
  observeReplacement,
  chooseDetailReplacement,
} from '../../../e2e/image-replacement-helpers.mjs';

// Execute the serialized observer in an isolated document. Native browser
// uploads and CDP throttling remain the separate real-browser acceptance.
function fixture(
  failure?: 'before-install' | 'after-install' | 'partial-install',
  cleanupFails = false,
) {
  class Upload extends EventTarget {
    status = 0;
    responseText = '';
    request: { method: string; url: string } | null = null;
    body: FormData | null = null;
    open(method: string, url: string) {
      this.request = { method, url };
    }
    send(body: FormData) {
      this.body = body;
    }
  }
  const original = { open: Upload.prototype.open, send: Upload.prototype.send };
  const listeners = new Set<unknown>();
  const document = {
    addEventListener(_type: string, listener: unknown) {
      listeners.add(listener);
      if (failure === 'partial-install')
        throw new Error('partial installation failed');
    },
    removeEventListener(_type: string, listener: unknown) {
      listeners.delete(listener);
    },
  };
  const context = createContext({
    XMLHttpRequest: Upload,
    FormData,
    URL,
    location: { href: 'http://replacement.localhost/library' },
    document,
  });
  runInContext('window = globalThis', context);
  let evaluations = 0;
  const cdp = vi.fn(async () => {
    throw new Error('FileChooser interception belongs to the SDK');
  });
  const page = {
    cdp,
    evaluate: async (callback: { toString(): string }, argument?: unknown) => {
      evaluations++;
      if (evaluations === 1 && failure === 'before-install')
        throw new Error('installation transport failed');
      const result = runInContext(
        `(${callback.toString()})(${JSON.stringify(argument) ?? 'undefined'})`,
        context,
      );
      if (evaluations === 1 && failure === 'after-install')
        throw new Error('installation acknowledgement lost');
      if (evaluations === 2 && cleanupFails)
        throw new Error('observer cleanup acknowledgement lost');
      return structuredClone(result);
    },
  };
  return {
    page,
    context,
    Upload,
    original,
    listeners,
  };
}

it.each(['before-install', 'after-install', 'partial-install'] as const)(
  'leaves chooser interception to the SDK and restores every installed hook after %s fails',
  async (failure) => {
    const f = fixture(failure);
    await expect(observeReplacement(f.page)).rejects.toThrow(
      failure === 'before-install'
        ? 'installation transport failed'
        : failure === 'after-install'
          ? 'installation acknowledgement lost'
          : 'partial installation failed',
    );
    expect(f.page.cdp).not.toHaveBeenCalled();
    expect(f.Upload.prototype.open).toBe(f.original.open);
    expect(f.Upload.prototype.send).toBe(f.original.send);
    expect(f.listeners.size).toBe(0);
    expect(f.context.__imageWorkflowReplacement).toBeUndefined();
  },
);

it('retains both the installation error and a failed observer cleanup instead of hiding either failure', async () => {
  const f = fixture('after-install', true);
  let failure: AggregateError | undefined;
  try {
    await observeReplacement(f.page);
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    failure = error as AggregateError;
  }
  expect(failure).toBeDefined();
  expect(failure!.errors.map((error: Error) => error.message)).toEqual([
    'installation acknowledgement lost',
    'observer cleanup acknowledgement lost',
  ]);
  expect(failure!.message).toContain('installation acknowledgement lost');
  expect(failure!.message).toContain('observer cleanup acknowledgement lost');
  expect(f.Upload.prototype.open).toBe(f.original.open);
  expect(f.Upload.prototype.send).toBe(f.original.send);
  expect(f.listeners.size).toBe(0);
});

it('removes the observer normally after observing the same native XHR reception and completion', async () => {
  const f = fixture();
  const observer = await observeReplacement(f.page);
  const upload = new f.Upload();
  upload.open('POST', '/api/images/image/replace');
  const body = new FormData();
  body.set('file', new File(['image'], 'chosen.png'));
  upload.send(body);
  expect(upload.request).toEqual({
    method: 'POST',
    url: '/api/images/image/replace',
  });
  expect(upload.body).toBe(body);
  const pending = (await observer.read()).requests;
  expect(pending).toEqual([
    expect.objectContaining({
      filename: 'chosen.png',
      status: null,
      ended: false,
      aborted: false,
    }),
  ]);
  upload.status = 202;
  upload.responseText = JSON.stringify({
    jobId: 'real-response-job',
    status: 'queued',
  });
  upload.dispatchEvent(new Event('loadend'));
  const accepted = (await observer.read()).requests;
  expect(accepted).toEqual([
    expect.objectContaining({
      filename: 'chosen.png',
      status: 202,
      ended: true,
      aborted: false,
    }),
  ]);
  expect(JSON.parse(accepted[0].body).jobId).toBe('real-response-job');
  await observer.dispose();
  expect(f.page.cdp).not.toHaveBeenCalled();
  expect(f.Upload.prototype.open).toBe(f.original.open);
  expect(f.Upload.prototype.send).toBe(f.original.send);
  expect(f.listeners.size).toBe(0);
  expect(f.context.__imageWorkflowReplacement).toBeUndefined();
});

it('records an actual abort event instead of accepting a cancelled transport as handover proof', async () => {
  const f = fixture();
  const observer = await observeReplacement(f.page);
  const upload = new f.Upload();
  upload.open('POST', '/api/images/image/replace');
  upload.send(new FormData());
  upload.dispatchEvent(new Event('abort'));
  upload.dispatchEvent(new Event('loadend'));
  expect((await observer.read()).requests).toEqual([
    expect.objectContaining({ aborted: true, ended: true, status: 0 }),
  ]);
  await observer.dispose();
});

function menuFixture(focusWorks = true) {
  const f = fixture();
  runInContext(
    `
    menuShown = false;
    menuItem = {
      textContent: '替换图片', disabled: false,
      outerHTML: '<div role="menuitem">替换图片</div>',
      getAttribute: name => name === 'role' ? 'menuitem' : null,
      matches: () => false, closest: () => null,
    };
    document.activeElement = null;
    document.querySelector = selector => selector.includes('[role="menu"]')
      ? (menuShown ? { querySelectorAll: () => [menuItem] } : null)
      : { disabled: false };
  `,
    f.context,
  );
  const calls: string[] = [];
  const chooser = {
    isMultiple: () => false,
    setFiles: vi.fn(async (files: string[]) => {
      expect(Array.isArray(files)).toBe(true);
      calls.push('set-files');
      runInContext('menuShown = false', f.context);
    }),
  };
  let deliver!: (value: typeof chooser) => void;
  const page = {
    ...f.page,
    click: async (selector: string) => {
      expect(selector).toBe('[data-testid="detail-more-entry"]');
      calls.push('open-menu');
      runInContext('menuShown = true', f.context);
    },
    focus: async () => {
      calls.push('focus-menu-item');
      if (focusWorks)
        runInContext('document.activeElement = menuItem', f.context);
    },
    waitForSelector: async (selector: string, options?: { state: string }) => {
      expect(selector).toContain('menuitem');
      if (options?.state === 'hidden') {
        expect(f.context.menuShown).toBe(false);
        calls.push('menu-hidden');
      } else expect(f.context.menuShown).toBe(true);
    },
    waitForFunction: async (
      callback: { toString(): string },
      argument?: unknown,
    ) => {
      expect(await f.page.evaluate(callback, argument)).toBeTruthy();
    },
    waitForFileChooser: vi.fn(() => {
      calls.push('arm-chooser');
      return new Promise<typeof chooser>((resolve) => {
        deliver = resolve;
      });
    }),
    keyboard: {
      press: async (key: string) => {
        expect(key).toBe('Enter');
        expect(deliver).toBeTypeOf('function');
        calls.push(key);
        deliver(chooser);
      },
    },
    setInputFiles: vi.fn(),
  };
  return { page, chooser, calls };
}

it.each([{ files: [] }, { files: ['/tmp/real-file-path.png'] }])(
  'arms the SDK chooser before native Enter, sets $files through it, and waits for the menu to close',
  async ({ files }) => {
    const f = menuFixture();
    const report = { detailMenuActions: [] };
    await chooseDetailReplacement(f.page, files, report);
    expect(f.calls).toEqual([
      'open-menu',
      'focus-menu-item',
      'arm-chooser',
      'Enter',
      'set-files',
      'menu-hidden',
    ]);
    expect(f.chooser.setFiles).toHaveBeenCalledExactlyOnceWith(files);
    expect(f.page.waitForFileChooser).toHaveBeenCalledExactlyOnceWith({
      timeout: 10000,
    });
    expect(f.page.setInputFiles).not.toHaveBeenCalled();
    expect(f.page.cdp).not.toHaveBeenCalled();
    expect(report.detailMenuActions).toHaveLength(1);
  },
);

it('does not press Enter or arm a chooser when the requested menu item did not really receive focus', async () => {
  const f = menuFixture(false);
  await expect(chooseDetailReplacement(f.page, [], {})).rejects.toThrow(
    'actual requested menu item',
  );
  expect(f.calls).toEqual(['open-menu', 'focus-menu-item']);
  expect(f.page.waitForFileChooser).not.toHaveBeenCalled();
  expect(f.chooser.setFiles).not.toHaveBeenCalled();
});
