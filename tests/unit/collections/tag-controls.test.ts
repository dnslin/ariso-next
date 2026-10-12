import {
  Children,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { TextField } from '@heroui/react/textfield';
import { StorageTip } from '../../../src/components/storage/storage-tip';
import { TagsList } from '../../../src/app/tags/list';
import { TagDialog, type TagAction } from '../../../src/app/tags/dialog';
import type { Tag } from '../../../src/app/tags/api';

const hooks = vi.hoisted(() => ({
  capturing: false,
  cells: [] as unknown[],
  cursor: 0,
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hooks.capturing) return actual.useState(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.cells)) hooks.cells[index] = initial;
      return [
        hooks.cells[index],
        (next: unknown) => {
          hooks.cells[index] = next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      if (!hooks.capturing) return actual.useRef(initial);
      const index = hooks.cursor++;
      return (hooks.cells[index] ??= { current: initial });
    },
    useEffect: (...args: Parameters<typeof actual.useEffect>) => {
      if (!hooks.capturing) return actual.useEffect(...args);
    },
  };
});

const tag: Tag = {
  id: 'tag-private-id',
  displayName: '很长的原标签名称',
  imageCount: 4,
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
};
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<Record<string, unknown>>(child)
      ? [child, ...elements(child.props.children as ReactNode)]
      : [],
  );
}
function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children: ReactNode }>(child)
        ? text(child.props.children)
        : String(child),
    )
    .join('');
}
function render(action: TagAction) {
  hooks.capturing = true;
  hooks.cursor = 0;
  try {
    return TagDialog({
      action,
      isOpen: true,
      onClose: vi.fn(),
      onComplete: vi.fn(),
      onExpire: vi.fn(),
      onRefresh: async () => {},
    });
  } finally {
    hooks.capturing = false;
  }
}
beforeEach(() => {
  hooks.cells = [];
});

it.each([false, true])(
  'tag row uses named icon actions in one group and preserves disabled=%s',
  (disabled) => {
    const html = renderToStaticMarkup(
      createElement(TagsList, {
        items: [tag],
        total: 1,
        timeZone: 'UTC',
        disabled,
        onAction: vi.fn(),
      }),
    );
    expect(html).toContain(`aria-label="标签 ${tag.displayName} 操作"`);
    for (const action of ['重命名', '删除']) {
      const buttons = html.match(
        new RegExp(
          `<button\\b(?=[^>]*aria-label="${action}标签 ${tag.displayName}")[^>]*>`,
          'g',
        ),
      );
      expect(buttons).toHaveLength(2);
      for (const button of buttons!) {
        expect(button).toContain('min-h-11');
        expect(button).toContain('min-w-11');
        expect(button.includes('disabled=')).toBe(disabled);
      }
    }
    expect(html).toContain('lucide-pencil');
    expect(html).toContain('lucide-trash-2');
    expect(html).not.toMatch(/>编辑<|>删除<|>重命名</);
  },
);

it.each(['create', 'edit'] as const)(
  '%s keeps normal name rules in Tips and a short submission label',
  (kind) => {
    const tree = render(kind === 'create' ? { kind } : { kind, tag });
    const all = elements(tree);
    const help = all.find((node) => node.type === StorageTip)!;
    expect(help.props.label).toBe('标签名称');
    expect(text(help.props.children as ReactNode)).toContain(
      kind === 'create' ? '1–50 个字符' : '改名保留图片关联',
    );
    const input = all.find((node) => node.type === TextField)!;
    expect(input.props.value).toBe(kind === 'create' ? '' : tag.displayName);
    expect(
      all.filter((node) => String(node.props.className).includes('bg-default')),
    ).toHaveLength(0);
    expect(text(tree)).not.toContain('正在重命名');
    const submit = all.find((node) => node.props.type === 'submit')!;
    expect(text(submit.props.children as ReactNode)).toBe(
      kind === 'create' ? '创建' : '保存',
    );
  },
);

it('deletion keeps its target and relationship consequences visible before the short confirmation', () => {
  const tree = render({ kind: 'delete', tag });
  const all = elements(tree);
  expect(all.some((node) => node.type === StorageTip)).toBe(false);
  expect(text(tree)).toContain(`删除标签「${tag.displayName}」？`);
  expect(text(tree)).toContain('包括回收站图片。图片不会被删除');
  expect(
    text(
      all.find((node) => node.props.type === 'submit')!.props
        .children as ReactNode,
    ),
  ).toBe('删除');
});

it('name validation stays visible outside Tips and retains the submitted input', () => {
  let tree = render({ kind: 'edit', tag });
  const field = elements(tree).find((node) => node.type === TextField)!;
  (field.props.onChange as (value: string) => void)('   ');
  tree = render({ kind: 'edit', tag });
  const form = elements(tree).find((node) => node.type === 'form')!;
  (form.props.onSubmit as (event: { preventDefault: () => void }) => void)({
    preventDefault: vi.fn(),
  });
  tree = render({ kind: 'edit', tag });
  const all = elements(tree);
  expect(all.find((node) => node.type === TextField)!.props.value).toBe('   ');
  const error = all.find((node) =>
    String(node.props.className).includes('bg-default'),
  )!;
  expect(text(error.props.children as ReactNode)).toContain(
    '名称不能只包含空格',
  );
  expect(text(tree)).toContain('修改名称');
});
