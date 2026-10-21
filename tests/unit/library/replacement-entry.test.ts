import {
  Children,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { LibraryDetail } from '../../../src/components/library/detail';
import type { LibraryDetail as Detail } from '../../../src/server/library/detail-types';

const { choose } = vi.hoisted(() => ({ choose: vi.fn() }));
vi.mock('../../../src/components/library/use-detail-replacement', () => ({
  useDetailReplacement: () => ({
    choicesDisabled: false,
    uploading: false,
    active: false,
    checking: false,
    unknown: false,
    job: null,
    error: '',
    session: { choose },
  }),
}));

const record = {
  id: 'image',
  displayName: '原有图片',
  originalName: 'old.png',
  format: 'png',
  mime: 'image/png',
  width: 640,
  height: 480,
  byteSize: 128,
  animated: false,
  visibility: 'private',
  processingStatus: 'ready',
  createdAt: '2026-10-21T00:00:00Z',
  storage: { id: 'local', name: '本地存储', enabled: true },
  albums: [],
  tags: [],
  versions: [
    { kind: 'original', saved: true, previewPath: '/i/image?type=original' },
  ],
} as unknown as Detail;

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<Record<string, unknown>>(child)
      ? [child, ...elements(child.props.children as ReactNode)]
      : [],
  );
}

/** Inspect actual event props while React owns the hooks; no browser is simulated. */
function entry() {
  let content: ReactNode;
  const close = vi.fn();
  const changed = vi.fn();
  function Probe() {
    const tree = LibraryDetail({
      imageId: record.id,
      client: new QueryClient(),
      onClose: close,
      dialogRef: vi.fn(),
      onTrashed: vi.fn(),
      onVersions: vi.fn(),
      onReplacementChanged: changed,
      query: {
        data: record,
        mutationPending: false,
        expired: false,
        setUnavailable: vi.fn(),
        onMutationPending: vi.fn(),
        setObservationPaused: vi.fn(),
      } as unknown as Parameters<typeof LibraryDetail>[0]['query'],
    });
    const body = elements(tree).find(
      (element) =>
        typeof element.type === 'function' &&
        element.type.name === 'DetailContent',
    )!;
    const Content = body.type as (props: Record<string, unknown>) => ReactNode;
    content = Content(body.props);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  const all = elements(content);
  const input = all.find(
    (element) => element.props['data-testid'] === 'replacement-file-input',
  )!;
  const action = all.find((element) => element.props.id === 'replace')!;
  return { input, action, close, changed };
}

beforeEach(() => choose.mockReset());

it('opens the native single-file input directly from the original detail menu', () => {
  const { input, action, close, changed } = entry();
  expect(input.type).toBe('input');
  expect(input.props.type).toBe('file');
  expect(input.props.multiple).not.toBe(true);
  expect(input.props['aria-label']).toBe('选择替换图片文件');
  const native = { click: vi.fn() };
  (input.props.ref as { current: unknown }).current = native;
  (action.props.onAction as () => void)();
  expect(native.click).toHaveBeenCalledOnce();
  expect(choose).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});

it('automatically submits the chosen file once and clears the native input for another selection', () => {
  const { input, close } = entry();
  const file = new File(['new image'], 'new.png');
  const target = { files: [file], value: 'new.png' };
  (input.props.onChange as (event: { currentTarget: typeof target }) => void)({
    currentTarget: target,
  });
  expect(choose).toHaveBeenCalledExactlyOnceWith(file);
  expect(target.value).toBe('');
  expect(close).not.toHaveBeenCalled();
});

it('does not submit or leave the original detail when file selection is cancelled', () => {
  const { input, close, changed } = entry();
  const target = { files: [], value: '' };
  (input.props.onChange as (event: { currentTarget: typeof target }) => void)({
    currentTarget: target,
  });
  expect(choose).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});
