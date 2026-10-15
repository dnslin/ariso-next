import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { TrashFilters } from '../../../src/app/trash/trash-filters';
import { parseTrashLocation } from '../../../src/app/trash/query-state';

const runtime = vi.hoisted(() => ({
  active: false,
  refIndex: 0,
  refs: [] as { current: unknown }[],
  effects: [] as (() => void)[],
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useRef: (value: unknown) => {
      if (!runtime.active) return actual.useRef(value);
      const index = runtime.refIndex++;
      return (runtime.refs[index] ??= { current: value });
    },
    useEffect: (...args: Parameters<typeof actual.useEffect>) => {
      if (runtime.active) runtime.effects.push(args[0]);
      else actual.useEffect(...args);
    },
  };
});
const focus = vi.fn();
const onApply = vi.fn();
const client = new QueryClient();
function find(
  node: ReactNode,
  predicate: (node: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node))
    return node.map((item) => find(item, predicate)).find(Boolean);
  if (!isValidElement<Record<string, unknown>>(node)) return;
  return predicate(node)
    ? node
    : find(node.props.children as ReactNode, predicate);
}
function screen(query: string, disabled = false) {
  let tree!: ReturnType<typeof TrashFilters>;
  runtime.refIndex = 0;
  runtime.effects = [];
  function Probe() {
    runtime.active = true;
    try {
      tree = TrashFilters({
        filters: parseTrashLocation(new URLSearchParams(query)).filters,
        client,
        disabled,
        onApply,
        onSessionExpired: vi.fn(),
      });
    } finally {
      runtime.active = false;
    }
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  const add = find(tree, (node) => !!node.props.ref)!;
  (add.props.ref as { current: unknown }).current = { focus };
  runtime.effects.forEach((effect) => effect());
  return tree;
}
function removeStatus(tree: ReactNode) {
  const remove = find(
    tree,
    (node) => node.props['aria-label'] === '移除处理状态条件',
  )!;
  (remove.props.onPress as () => void)();
}
beforeEach(() => {
  runtime.refs = [];
  vi.clearAllMocks();
});

it('restores focus after an applied filter is removed and its request finishes, only once', () => {
  removeStatus(screen('status=ready'));
  expect(onApply).toHaveBeenCalledWith({ status: null });
  expect(focus).toHaveBeenCalledTimes(1);
  screen('status=ready');
  expect(focus).toHaveBeenCalledTimes(1);
  screen('', true);
  expect(focus).toHaveBeenCalledTimes(1);
  screen('');
  expect(focus).toHaveBeenCalledTimes(2);
  expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
  screen('', true);
  screen('');
  expect(focus).toHaveBeenCalledTimes(2);
});

it('also restores focus when the cleared query finishes before a busy render', () => {
  removeStatus(screen('status=ready'));
  screen('');
  expect(focus).toHaveBeenCalledTimes(2);
  screen('');
  expect(focus).toHaveBeenCalledTimes(2);
});

it('does not move focus on ordinary requests or defer focus for an unused condition', () => {
  screen('', true);
  const tree = screen('');
  expect(focus).not.toHaveBeenCalled();
  removeStatus(tree);
  expect(onApply).not.toHaveBeenCalled();
  expect(focus).toHaveBeenCalledTimes(1);
  screen('', true);
  screen('');
  expect(focus).toHaveBeenCalledTimes(1);
});
