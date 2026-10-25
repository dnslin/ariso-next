'use client';

import { useState } from 'react';
import { Button, Form, Input, Label, Popover, TextField } from '@heroui/react';
import { CalendarDays, ChevronDown, HardDrive } from 'lucide-react';
import type { LibraryFilters } from '../../server/library/query-schema';
import type { LibraryQueryPatch } from './query-state';

function megabytesInBytes(input: string) {
  const value = input.trim();
  if (!value) return null;
  if (!/^(?:\d+(?:\.\d{0,6})?|\.\d{1,6})$/.test(value)) return NaN;
  const [integer, fraction = ''] = value.split('.');
  // Shift decimal digits as text; binary floating-point multiplication loses byte precision.
  return Number(`${integer || '0'}${fraction.padEnd(6, '0')}`);
}

export function LibraryRangeCondition({
  kind,
  filters,
  onApply,
}: {
  kind: 'recent' | 'size';
  filters: LibraryFilters;
  onApply: (patch: LibraryQueryPatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(String(filters.recentDays ?? 7));
  const [minimum, setMinimum] = useState(
    filters.sizeGreaterThan === undefined
      ? ''
      : String(filters.sizeGreaterThan / 1000000),
  );
  const [maximum, setMaximum] = useState(
    filters.sizeLessThan === undefined
      ? ''
      : String(filters.sizeLessThan / 1000000),
  );
  const [error, setError] = useState('');
  const label =
    kind === 'recent'
      ? `最近 ${filters.recentDays ?? 7} 天`
      : [
          filters.sizeGreaterThan === undefined
            ? ''
            : `> ${filters.sizeGreaterThan / 1000000} MB`,
          filters.sizeLessThan === undefined
            ? ''
            : `< ${filters.sizeLessThan / 1000000} MB`,
        ]
          .filter(Boolean)
          .join(' 且 ') || '选择原图大小';
  return (
    <Popover
      isOpen={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setDays(String(filters.recentDays ?? 7));
          setMinimum(
            filters.sizeGreaterThan === undefined
              ? ''
              : String(filters.sizeGreaterThan / 1000000),
          );
          setMaximum(
            filters.sizeLessThan === undefined
              ? ''
              : String(filters.sizeLessThan / 1000000),
          );
          setError('');
        }
      }}
    >
      <Button
        variant="ghost"
        className="min-h-11 gap-2 px-3 text-sm"
        aria-label={kind === 'recent' ? '编辑最近上传时间' : '编辑原图大小'}
      >
        {kind === 'recent' ? (
          <CalendarDays size={16} />
        ) : (
          <HardDrive size={16} />
        )}
        <span>{label}</span>
        <ChevronDown size={14} />
      </Button>
      <Popover.Content className="w-[min(340px,calc(100vw-32px))] rounded-xl border border-border bg-surface">
        <Popover.Dialog className="p-4">
          <Form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (kind === 'recent') {
                if (!/^[1-9]\d*$/.test(days) || Number(days) > 36500) {
                  setError('请输入 1–36500 的整数天数');
                  return;
                }
                onApply({
                  recentDays: days,
                  uploadedFrom: null,
                  uploadedBefore: null,
                });
              } else {
                const lower = megabytesInBytes(minimum);
                const upper = megabytesInBytes(maximum);
                if (
                  [lower, upper].some(
                    (value) =>
                      value !== null &&
                      (!Number.isSafeInteger(value) || value < 0),
                  )
                ) {
                  setError('大小必须是非负数，最多保留 6 位小数');
                  return;
                }
                if (lower !== null && upper !== null && lower >= upper) {
                  setError('大小下界必须小于上界');
                  return;
                }
                onApply({
                  sizeGreaterThan: lower === null ? null : String(lower),
                  sizeLessThan: upper === null ? null : String(upper),
                });
              }
              setOpen(false);
            }}
          >
            <Popover.Heading className="font-medium">
              {kind === 'recent' ? '最近上传' : '原图大小'}
            </Popover.Heading>
            {kind === 'recent' ? (
              <>
                <TextField value={days} onChange={setDays}>
                  <Label>最近天数</Label>
                  <Input inputMode="numeric" className="h-11" />
                </TextField>
                <p className="text-xs text-muted">
                  按滚动的 24 小时计算。打开集合或主动刷新时更新边界。
                </p>
              </>
            ) : (
              <>
                <TextField value={minimum} onChange={setMinimum}>
                  <Label>大于（MB）</Label>
                  <Input
                    inputMode="decimal"
                    className="h-11"
                    placeholder="不限"
                  />
                </TextField>
                <TextField value={maximum} onChange={setMaximum}>
                  <Label>小于（MB）</Label>
                  <Input
                    inputMode="decimal"
                    className="h-11"
                    placeholder="不限"
                  />
                </TextField>
                <p className="text-xs text-muted">
                  1 MB = 1,000,000 字节；等于边界的原图不匹配。
                </p>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" className="min-h-11">
              应用{kind === 'recent' ? '时间' : '大小'}
            </Button>
          </Form>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
