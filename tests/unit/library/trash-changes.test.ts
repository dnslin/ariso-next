import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { LibraryDetail } from '../../../src/server/library/detail-types';
import { TrashAction } from '../../../src/components/library/trash-actions';

const calls = vi.hoisted(() => ({
  notify: vi.fn(),
  buttons: new Map<string, () => void>(),
}));
vi.mock('../../../src/components/library/library-changes', () => ({
  notifyLibraryChanged: calls.notify,
}));
vi.mock('@heroui/react/button', () => ({
  Button: ({
    children,
    onPress,
    'aria-label': label,
  }: {
    children: ReactNode;
    onPress: () => void;
    'aria-label'?: string;
  }) => {
    calls.buttons.set(label ?? String(children), onPress);
    return createElement('button', null, children);
  },
}));
vi.mock('@heroui/react/alert-dialog', () => {
  const pass = ({ children }: { children: ReactNode }) => children;
  return {
    AlertDialog: Object.assign(pass, {
      Backdrop: pass,
      Container: pass,
      Dialog: pass,
      Header: pass,
      Heading: pass,
      Body: pass,
      Footer: pass,
    }),
  };
});
vi.mock('@heroui/react/close-button', () => ({ CloseButton: () => null }));
vi.mock('@heroui/react/toast', () => ({ toast: { success: vi.fn() } }));

function mount(operation: 'trash' | 'restore') {
  const record = {
    id: 'image',
    originalName: 'photo.png',
    byteSize: 100,
    trashedAt: operation === 'restore' ? '2026-01-01T00:00:00Z' : null,
    deletionStatus: null,
  } as LibraryDetail;
  const onComplete = vi.fn();
  const onVerified = vi.fn();
  const onUnavailable = vi.fn();
  renderToStaticMarkup(
    createElement(TrashAction, {
      record,
      operation,
      onPending: vi.fn(),
      onComplete,
      onVerified,
      onUnavailable,
    }),
  );
  return {
    record,
    onComplete,
    onVerified,
    onUnavailable,
    submit: () =>
      calls.buttons.get(operation === 'trash' ? '确认删除图片' : '确认恢复')!(),
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  calls.notify.mockClear();
  calls.buttons.clear();
});

it.each(['trash', 'restore'] as const)(
  'publishes %s only after the real action reconciles its resulting record',
  async (operation) => {
    const c = mount(operation);
    const verified = {
      ...c.record,
      trashedAt: operation === 'trash' ? '2026-01-01T00:00:00Z' : null,
    };
    let finishRead!: (response: Response) => void;
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            finishRead = done;
          }),
      );
    vi.stubGlobal('fetch', request);
    c.submit();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(calls.notify).not.toHaveBeenCalled();
    expect(c.onComplete).not.toHaveBeenCalled();
    finishRead(Response.json(verified));
    await vi.waitFor(() => expect(c.onComplete).toHaveBeenCalledWith(verified));
    expect(calls.notify).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]).toEqual([
      `/api/images/image/${operation}`,
      { method: 'POST' },
    ]);
  },
);

it('publishes when a lost write response is subsequently confirmed successful', async () => {
  const c = mount('trash');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(
        Response.json({ ...c.record, trashedAt: '2026-01-01T00:00:00Z' }),
      ),
  );
  c.submit();
  await vi.waitFor(() => expect(c.onComplete).toHaveBeenCalledOnce());
  expect(calls.notify).toHaveBeenCalledOnce();
});

it('does not publish a rejected operation whose verified record is unchanged', async () => {
  const c = mount('trash');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: 'conflict' }, { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json(c.record)),
  );
  c.submit();
  await vi.waitFor(() => expect(c.onVerified).toHaveBeenCalledOnce());
  expect(c.onComplete).not.toHaveBeenCalled();
  expect(calls.notify).not.toHaveBeenCalled();
});

it('does not publish before the resulting record can be verified', async () => {
  const c = mount('restore');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(
        Response.json({ message: 'expired' }, { status: 401 }),
      ),
  );
  c.submit();
  await vi.waitFor(() => expect(c.onUnavailable).toHaveBeenCalledWith(401));
  expect(c.onComplete).not.toHaveBeenCalled();
  expect(calls.notify).not.toHaveBeenCalled();
});
