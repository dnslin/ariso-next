'use client';

import { useEffect, useRef, useState } from 'react';
import {
  tagRequest,
  TagRequestError,
  type Tag,
  type TagPage,
} from '../../app/tags/api';
import { tagNameSchema } from '../../server/collections/validation';

export async function findTagTarget(name: string, signal: AbortSignal) {
  const parsed = tagNameSchema.parse(name);
  let page = 1;
  while (!signal.aborted) {
    const result = await tagRequest<TagPage>(
      `/api/tags?${new URLSearchParams({ q: parsed.displayName, pageSize: '80', page: String(page) })}`,
      { signal },
    );
    const match = result.items.find(
      (tag) =>
        tagNameSchema.parse(tag.displayName).normalizedKey ===
        parsed.normalizedKey,
    );
    if (match) return match;
    if (page * result.pageSize >= result.total) return null;
    page++;
  }
  return null;
}

export function useTagTargetCreate({
  available,
  disabled,
  onSelect,
  onExpire,
}: {
  available: Tag[];
  disabled: boolean;
  onSelect: (tag: Tag) => void;
  onExpire: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [duplicate, setDuplicate] = useState<Tag | null>(null);
  const [pending, setPending] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  function expire(error: unknown) {
    if (error instanceof TagRequestError && error.status === 401) {
      onExpire();
      return true;
    }
    return false;
  }
  function showDuplicate(tag: Tag) {
    setDuplicate(tag);
    setError('已有同名标签，请选择现有标签');
  }
  async function verify(signal: AbortSignal) {
    try {
      const tag = await findTagTarget(name, signal);
      if (!mounted.current || signal.aborted) return;
      setUnknown(false);
      if (tag) showDuplicate(tag);
      else setError('核对后未找到此标签，输入已保留，可再次创建。');
    } catch (error) {
      if (!mounted.current || signal.aborted || expire(error)) return;
      setUnknown(true);
      setError(
        `暂时无法核对：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  async function check() {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setPending(true);
    const active = new AbortController();
    controller.current = active;
    try {
      await verify(active.signal);
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }
  async function create() {
    if (inFlight.current || disabled || unknown) return;
    const parsed = tagNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const existing = available.find(
      (tag) =>
        tagNameSchema.parse(tag.displayName).normalizedKey ===
        parsed.data.normalizedKey,
    );
    if (existing) {
      showDuplicate(existing);
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError('');
    setNotice('');
    const active = new AbortController();
    controller.current = active;
    try {
      const result = await tagRequest<{ tag: Tag; reused: boolean }>(
        '/api/tags',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: parsed.data.displayName }),
          signal: active.signal,
        },
      );
      if (!mounted.current || active.signal.aborted) return;
      if (result.reused) showDuplicate(result.tag);
      else {
        onSelect(result.tag);
        setName('');
        setNotice(`已创建并选中“${result.tag.displayName}”`);
      }
    } catch (error) {
      if (!mounted.current || active.signal.aborted || expire(error)) return;
      if (error instanceof TagRequestError && error.status < 500)
        setError(error.message);
      else {
        setUnknown(true);
        setError('新建结果待核对，正在读取当前标签。');
        await verify(active.signal);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return {
    name,
    error,
    notice,
    duplicate,
    pending,
    unknown,
    create,
    check,
    change(value: string) {
      setName(value);
      setError('');
      setNotice('');
      setDuplicate(null);
    },
    selectExisting() {
      if (!duplicate || disabled || inFlight.current) return;
      onSelect(duplicate);
      setNotice(`已选中“${duplicate.displayName}”`);
      setName('');
      setError('');
      setDuplicate(null);
    },
  };
}
