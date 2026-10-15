import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TextField } from '@heroui/react/textfield';
import { Pagination } from '@heroui/react/pagination';
import { TagsScreen } from '../../../src/app/tags/screen';

const runtime = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => runtime.params }));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => vi.fn(),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({
    data: { items: [], total: 100 },
    error: null,
    isFetching: false,
  }),
}));
const history = { pushState: vi.fn(), replaceState: vi.fn() };
function find(
  node: ReactNode,
  type: unknown,
): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node))
    return node.map((item) => find(item, type)).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return;
  return node.type === type
    ? (node as ReactElement<Record<string, unknown>>)
    : find(node.props.children, type);
}
function screen() {
  let tree!: ReturnType<typeof TagsScreen>;
  function Probe() {
    tree = TagsScreen({
      name: 'Ariso',
      description: '',
      email: 'owner@example.test',
      ownerName: 'Owner',
      initialSidebarCollapsed: false,
      timeZone: 'Asia/Shanghai',
    });
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return tree;
}
beforeEach(() => {
  vi.clearAllMocks();
  runtime.params = new URLSearchParams('q=旅&page=3&pageSize=20');
  vi.stubGlobal('window', { history });
});
afterEach(() => vi.unstubAllGlobals());

it('replaces each search update including Chinese composition text and clearing, resetting the page', () => {
  for (const value of ['旅行', '旅行 zhong', '旅行中', '']) {
    const search = find(screen().props.children, TextField)!;
    (search.props.onChange as (value: string) => void)(value);
    const href = history.replaceState.mock.lastCall![2];
    const query = new URL(href, 'http://ariso.test').searchParams;
    expect(query.get('q') ?? '').toBe(value);
    expect(query.get('page')).toBeNull();
    expect(query.get('pageSize')).toBe('20');
    runtime.params = query;
  }
  expect(history.replaceState).toHaveBeenCalledTimes(4);
  expect(history.pushState).not.toHaveBeenCalled();
});

it('pushes pagination while retaining the current search and page size', () => {
  const tree = screen();
  const next = find(tree.props.footer, Pagination.Next)!;
  (next.props.onPress as () => void)();
  expect(history.pushState).toHaveBeenCalledWith(
    null,
    '',
    '/tags?q=%E6%97%85&page=4&pageSize=20',
  );
  expect(history.replaceState).not.toHaveBeenCalled();
});
