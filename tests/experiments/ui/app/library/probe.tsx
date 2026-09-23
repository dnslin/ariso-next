'use client';
import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from 'nuqs';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { TextField } from '@heroui/react/textfield';
import { useTheme } from 'next-themes';
import type { RecordItem, Result } from './records';

const Viewer = dynamic(() => import('./viewer'), { ssr: false });

function Search({ q, apply }: { q: string; apply: (value: string) => void }) {
  const [draft, setDraft] = useState(q);
  return (
    <Form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        apply(draft.trim());
      }}
    >
      <TextField value={draft} onChange={setDraft}>
        <Label>名称子串</Label>
        <Input id="library-search" />
      </TextField>
      <Button id="apply-search" type="submit">
        搜索
      </Button>
    </Form>
  );
}

export function LibraryProbe() {
  const [{ q, page, sort, image }, setParams] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      page: parseAsInteger.withDefault(1),
      sort: parseAsStringLiteral(['asc', 'desc']).withDefault('asc'),
      image: parseAsString,
    },
    { history: 'push', shallow: true, scroll: false },
  );
  const identity = JSON.stringify({ q, sort });
  const [selection, setSelection] = useState({ identity, ids: [] as string[] });
  if (selection.identity !== identity) setSelection({ identity, ids: [] });
  const selected = selection.identity === identity ? selection.ids : [];
  const [layout, setLayout] = useState('grid');
  const [windowItems, setWindowItems] = useState<RecordItem[]>([]);
  const origin = useRef({ id: '', scrollY: 0 });
  const { setTheme } = useTheme();
  const query = useQuery({
    queryKey: ['library-experiment', { q, sort, page }],
    queryFn: async ({ signal }): Promise<Result> => {
      const params = new URLSearchParams({ q, sort, page: String(page) });
      const response = await fetch(`/library/data?${params}`, { signal });
      if (!response.ok)
        throw new Error(`实验查询失败：HTTP ${response.status}`);
      return response.json();
    },
    staleTime: Infinity,
    retry: false,
  });
  function restore() {
    const target =
      document.getElementById(`open-${origin.current.id}`) ??
      document.getElementById('library-toolbar');
    target?.focus({ preventScroll: true });
    window.scrollTo(0, origin.current.scrollY);
  }
  return (
    <>
      <div id="library-toolbar" tabIndex={-1} className="grid gap-3">
        <Search
          key={q}
          q={q}
          apply={(q) => {
            void setParams({ q, page: 1, image: null });
          }}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            id="sort"
            onPress={() => {
              void setParams({
                sort: sort === 'asc' ? 'desc' : 'asc',
                page: 1,
              });
            }}
          >
            排序：{sort}
          </Button>
          <Button
            id="layout"
            onPress={() => setLayout(layout === 'grid' ? 'rows' : 'grid')}
          >
            布局：{layout}
          </Button>
          <Button id="library-light" onPress={() => setTheme('light')}>
            浅色
          </Button>
          <Button id="library-dark" onPress={() => setTheme('dark')}>
            深色
          </Button>
        </div>
      </div>
      <output id="library-state" aria-live="polite">
        {query.isPending
          ? '正在加载'
          : query.isError
            ? query.error.message
            : `共 ${query.data.total} 张 · 第 ${page} 页`}
      </output>
      <output id="library-selection">已选 {selected.length}</output>
      <section
        aria-label="实验结果"
        data-layout={layout}
        className={
          layout === 'grid'
            ? 'grid grid-cols-2 gap-3 md:grid-cols-4'
            : 'grid grid-cols-1 gap-3'
        }
      >
        {query.data?.items.map((item, index) => (
          <article
            key={item.id}
            className="grid min-w-0 gap-2 rounded-lg bg-surface p-3"
          >
            <p>{item.name}</p>
            <Button
              id={`select-${item.id}`}
              aria-pressed={selected.includes(item.id)}
              onPress={() =>
                setSelection({
                  identity,
                  ids: selected.includes(item.id)
                    ? selected.filter((id) => id !== item.id)
                    : [...selected, item.id],
                })
              }
            >
              选择
            </Button>
            <Button
              id={`open-${item.id}`}
              onPress={() => {
                origin.current = { id: item.id, scrollY: window.scrollY };
                setWindowItems(
                  query.data.items.slice(Math.max(0, index - 1), index + 2),
                );
                void setParams({ image: item.id }, { history: 'replace' });
              }}
            >
              查看 {item.id}
            </Button>
          </article>
        ))}
      </section>
      <div className="flex gap-3">
        <Button
          id="previous-page"
          isDisabled={page <= 1 || query.isPending}
          onPress={() => {
            void setParams({ page: page - 1 });
          }}
        >
          上一页
        </Button>
        <Button
          id="next-page"
          isDisabled={!query.data || page * 20 >= query.data.total}
          onPress={() => {
            void setParams({ page: page + 1 });
          }}
        >
          下一页
        </Button>
      </div>
      <Viewer
        items={windowItems}
        imageId={image}
        close={() => {
          void setParams({ image: null }, { history: 'replace' });
        }}
        view={(id) => {
          if (id !== image)
            void setParams({ image: id }, { history: 'replace' });
        }}
        exited={restore}
      />
    </>
  );
}
