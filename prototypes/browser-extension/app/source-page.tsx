'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Button, Dropdown } from '@heroui/react';
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  LockKeyhole,
  MousePointer2,
  Plus,
} from 'lucide-react';
import { secondary } from './ui';

export function SourcePage({
  onSave,
  onBack,
  onCopy,
}: {
  onSave: () => void;
  onBack: () => void;
  onCopy: () => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-12 sm:px-8">
      <Button
        variant="ghost"
        className="mb-6 min-h-11 rounded-lg px-0 text-sm text-muted"
        onPress={onBack}
      >
        <ArrowLeft size={17} />
        返回上传小窗
      </Button>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium tracking-widest text-muted">
            网页图片收集
          </p>
          <h1 className="text-2xl font-semibold sm:text-3xl">
            看到喜欢的，右键存起来。
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            在下方图片上点击右键，体验“保存到 Ariso”。
          </p>
        </div>
        <span className="rounded-full bg-default px-3 py-2 text-xs">
          浏览器右键菜单演示
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_8px_36px_-24px_#27234355]">
        <div className="flex items-center gap-3 border-b border-border bg-default/35 px-4 py-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <i className="size-2 rounded-full bg-border" />
            <i className="size-2 rounded-full bg-border" />
            <i className="size-2 rounded-full bg-border" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-surface px-3 py-2 text-xs text-muted">
            <LockKeyhole size={12} />
            <span className="truncate">
              journal.example / stories / between-mountains
            </span>
          </div>
        </div>
        <article className="px-5 py-8 sm:px-14 sm:py-10">
          <div className="mb-8 flex items-center justify-between border-b border-border pb-5">
            <span className="font-serif text-2xl tracking-tight">
              FIELD NOTES
              <span className="ml-2 text-xs font-sans tracking-normal text-muted">
                山野手记
              </span>
            </span>
            <span className="hidden text-xs text-muted sm:block">
              旅行 / 摄影 / 日常
            </span>
          </div>
          <p className="text-[11px] tracking-[0.2em] text-muted">
            VOL. 024 · 在路上
          </p>
          <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
            山海之间，留一点空白。
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted">
            走过湖边的清晨，才发现值得留住的风景，往往就在停下来的那一刻。
          </p>
          <div
            className="relative mt-7"
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu(true);
            }}
          >
            <Image
              src="/demo-lake.jpg"
              alt="山间湖泊与远处的雪山，右键可保存到 Ariso"
              width={1200}
              height={720}
              unoptimized
              className="aspect-[16/9] w-full rounded-lg object-cover"
            />
            <Dropdown isOpen={menu} onOpenChange={setMenu}>
              <Button
                aria-label="打开图片右键菜单"
                className="absolute right-3 bottom-3 min-h-11 rounded-lg border border-white/40 bg-white/95 px-3 text-xs text-[#272343] shadow-sm"
              >
                <MousePointer2 size={15} />
                右键这张图片
              </Button>
              <Dropdown.Popover
                placement="top end"
                className="w-56 rounded-xl border border-border bg-surface p-1.5 shadow-xl"
              >
                <Dropdown.Menu aria-label="图片右键菜单">
                  <Dropdown.Item
                    id="save"
                    textValue="保存到 Ariso"
                    className="min-h-11 gap-3 rounded-lg bg-default/50 px-3 text-sm font-medium"
                    onAction={onSave}
                  >
                    <Plus size={17} />
                    保存到 Ariso
                    <ChevronRight size={14} className="ml-auto" />
                  </Dropdown.Item>
                  <Dropdown.Item
                    id="copy"
                    textValue="复制图片地址"
                    className="min-h-11 gap-3 rounded-lg px-3 text-sm"
                    onAction={onCopy}
                  >
                    <Copy size={16} />
                    复制图片地址
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted">
              湖边的一天 · 示例网页与图片
            </span>
            <Button className={secondary} onPress={onSave}>
              <Plus size={16} />
              保存到 Ariso
            </Button>
          </div>
        </article>
      </div>
      <p className="mt-5 text-xs leading-6 text-muted">
        这里模拟网页与浏览器菜单。正式插件会出现在真实网页图片的右键菜单中。
      </p>
    </div>
  );
}
