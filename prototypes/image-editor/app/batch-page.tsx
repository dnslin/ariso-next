'use client';

import Image from 'next/image';
import { Button, Checkbox } from '@heroui/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Images,
  ShieldCheck,
  Stamp,
} from 'lucide-react';
import type { DemoImage } from './model';
import type { EditTemplate } from './template-dialog';

export default function BatchPage({
  images,
  templates,
  selectedIds,
  onToggle,
  templateId,
  onTemplateChange,
  onStart,
  onBack,
}: {
  images: DemoImage[];
  templates: EditTemplate[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  templateId: string;
  onTemplateChange: (id: string) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const available = images.filter((image) => !image.unavailableReason);
  const selected = available.filter((image) => selectedIds.includes(image.id));
  const template = templates.find((item) => item.id === templateId);
  const allSelected =
    available.length > 0 && selected.length === available.length;

  return (
    <section
      className="mx-auto flex min-h-full w-full max-w-7xl flex-col"
      aria-labelledby="batch-title"
    >
      <header className="mb-6 grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 id="batch-title">批量编辑图片</h1>
            <p className="mt-2 text-sm text-muted">
              选好图片和模板，再逐张检查效果。
            </p>
          </div>
          <Button
            variant="ghost"
            className="min-h-11 shrink-0"
            onPress={onBack}
          >
            <ArrowLeft size={16} />
            返回图库
          </Button>
        </div>
        <ol
          aria-label="批量处理步骤"
          className="flex flex-wrap items-center gap-2 text-xs sm:gap-3 sm:text-sm"
        >
          <li
            aria-current="step"
            className="rounded-lg bg-default px-3 py-2 font-medium"
          >
            选择图片与模板
          </li>
          <ChevronRight size={14} className="text-muted" aria-hidden />
          <li className="text-muted">逐张预览</li>
          <ChevronRight size={14} className="text-muted" aria-hidden />
          <li className="text-muted">保存结果</li>
        </ol>
      </header>

      <div className="grid flex-1 items-start gap-7 pb-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Images size={18} />
              待处理图片
              <span className="ml-1 text-sm font-normal text-muted">
                已选 {selected.length} 张
              </span>
            </h2>
            <Button
              variant="ghost"
              className="min-h-11 text-sm"
              isDisabled={!available.length}
              onPress={() => {
                for (const image of available) {
                  if (allSelected || !selectedIds.includes(image.id))
                    onToggle(image.id);
                }
              }}
            >
              {allSelected ? '清空选择' : '全选可编辑图片'}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 min-[440px]:grid-cols-2 xl:grid-cols-3">
            {images.map((image) => {
              const checked =
                selectedIds.includes(image.id) && !image.unavailableReason;
              return (
                <article
                  key={image.id}
                  className={`relative overflow-hidden rounded-2xl border bg-surface transition-colors ${checked ? 'border-foreground ring-1 ring-foreground' : 'border-border'} ${image.unavailableReason ? 'opacity-60' : ''}`}
                >
                  <div className="relative aspect-[4/3] bg-default/20">
                    <Image
                      src={image.src}
                      alt={image.name}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                  <Checkbox
                    isSelected={checked}
                    isDisabled={!!image.unavailableReason}
                    onChange={() => onToggle(image.id)}
                    aria-label={`选择图片：${image.name}`}
                    className="absolute top-1.5 left-1.5"
                  >
                    <Checkbox.Content className="grid size-11 place-items-center rounded-lg">
                      <Checkbox.Control className="size-5 border border-border bg-surface shadow-sm">
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox.Content>
                  </Checkbox>
                  <div className="grid gap-1.5 p-3">
                    <h3
                      className="truncate text-sm font-medium"
                      title={image.name}
                    >
                      {image.name}
                    </h3>
                    <p className="text-xs text-muted">
                      {image.width} × {image.height}
                      <span className="mx-2">·</span>
                      {image.format}
                    </p>
                    {image.unavailableReason && (
                      <p className="text-xs leading-5 text-muted">
                        {image.unavailableReason}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {!images.length && (
            <p className="py-16 text-center text-sm text-muted">
              图库中暂时没有图片。
            </p>
          )}
        </div>

        <aside
          className="grid gap-4 rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-0"
          aria-label="批量模板设置"
        >
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Stamp size={18} />
              选择模板
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted">
              每张图片都会按自己的尺寸计算位置。
            </p>
          </div>
          {templates.length ? (
            <div className="grid gap-2" role="group" aria-label="可用模板">
              {templates.map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  aria-pressed={item.id === templateId}
                  onPress={() => onTemplateChange(item.id)}
                  className={`h-auto min-h-16 justify-between gap-3 rounded-xl border px-3 py-3 text-left ${item.id === templateId ? 'border-foreground bg-default/50' : 'border-border'}`}
                >
                  <span className="grid min-w-0 gap-1">
                    <span className="truncate text-sm font-medium">
                      {item.name}
                    </span>
                    <span className="text-xs font-normal text-muted">
                      {item.recipe.watermark.enabled
                        ? item.recipe.watermark.kind === 'text'
                          ? '文字水印'
                          : '图片水印'
                        : ''}
                      {item.recipe.watermark.enabled &&
                      item.recipe.regions.length
                        ? ' + '
                        : ''}
                      {item.recipe.regions.length
                        ? `${item.recipe.regions.length} 个打码区域`
                        : ''}
                    </span>
                  </span>
                  {item.id === templateId && (
                    <Check size={17} className="shrink-0" aria-hidden />
                  )}
                </Button>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-default/25 p-3 text-sm leading-6 text-muted">
              还没有模板。先编辑一张图片，将常用效果保存为模板。
            </p>
          )}
          {template && (
            <div className="border-t border-border pt-4 text-xs leading-6 text-muted">
              {template.recipe.regions.length ? (
                <p className="flex items-start gap-2">
                  <ShieldCheck size={17} className="mt-1 shrink-0" />
                  此模板包含打码。套用后需要逐张确认，避免遮挡位置偏移。
                </p>
              ) : (
                <p>套用后仍可逐张调整水印。对单张的修改不会改变模板。</p>
              )}
            </div>
          )}
        </aside>
      </div>

      <footer className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:px-0">
        <div className="min-w-0 text-sm">
          <p className="font-medium">{selected.length} 张图片</p>
          <p className="mt-1 text-xs text-muted">
            {template ? `套用“${template.name}”` : '请选择一个模板'}
          </p>
        </div>
        <Button
          className="min-h-12 shrink-0"
          isDisabled={!selected.length || !template}
          onPress={onStart}
        >
          应用模板并预览 {selected.length} 张
          <ArrowRight size={17} aria-hidden />
        </Button>
      </footer>
    </section>
  );
}
