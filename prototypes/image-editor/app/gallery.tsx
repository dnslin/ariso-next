'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button, Checkbox } from '@heroui/react';
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ImagePlus,
  Images,
  Pencil,
  ScanLine,
} from 'lucide-react';
import { useDemo } from './store';

export function Gallery() {
  const demo = useDemo();
  const router = useRouter();
  return (
    <section className="mx-auto flex min-h-full max-w-7xl flex-col gap-6 pb-24">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>图库</h1>
          <p className="mt-2 text-sm text-muted">
            选一张图片编辑，或将同一个模板应用到多张图片。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="min-h-11 rounded-lg"
            onPress={() => router.push('/templates')}
          >
            <Bookmark size={17} />
            编辑模板
          </Button>
          <Button
            variant="primary"
            className="min-h-11 rounded-lg"
            onPress={() => router.push('/batch')}
          >
            <Images size={17} />
            批量编辑
          </Button>
        </div>
      </header>
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3 text-sm">
          <Images size={18} />
          <span>
            全部图片{' '}
            <span className="ml-1 text-muted">{demo.images.length}</span>
          </span>
        </div>
        <p className="text-xs text-muted">示例图库</p>
      </div>
      <div className="grid grid-cols-1 gap-5 min-[500px]:grid-cols-2 min-[1000px]:grid-cols-3 min-[1500px]:grid-cols-4">
        {demo.images.map((image) => (
          <article
            key={image.id}
            className="group overflow-hidden rounded-2xl border border-border bg-surface"
          >
            <div className="relative aspect-[1.45] overflow-hidden bg-default/40">
              <Image
                unoptimized
                src={image.src}
                width={600}
                height={414}
                className={`size-full ${image.category === 'screenshot' ? 'object-contain p-2' : 'object-cover'}`}
                alt={image.name}
              />
              <div className="absolute top-3 left-3 rounded-lg bg-surface/90 p-1 shadow-sm">
                <Checkbox
                  aria-label={`选择 ${image.name}`}
                  isSelected={demo.selectedIds.includes(image.id)}
                  isDisabled={!!image.unavailableReason}
                  onChange={() => demo.toggleImage(image.id)}
                >
                  <Checkbox.Content className="grid size-11 place-items-center">
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
              </div>
              {image.id.includes('-edit-') && (
                <span className="absolute top-3 right-3 flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs">
                  <Check size={12} />
                  已编辑
                </span>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="truncate text-sm font-medium">{image.name}</h2>
                <span className="shrink-0 text-xs text-muted">
                  {image.format}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {image.width} × {image.height} ·{' '}
                {image.category === 'screenshot' ? '截图' : '摄影'}
              </p>
              {image.unavailableReason ? (
                <p className="mt-4 flex min-h-11 items-center text-xs text-muted">
                  {image.unavailableReason}
                </p>
              ) : (
                <Button
                  variant="secondary"
                  className="mt-4 min-h-11 w-full rounded-lg"
                  onPress={() => demo.openEditor(image.id)}
                >
                  <Pencil size={15} />
                  编辑图片
                  <ArrowUpRight size={15} className="ml-auto" />
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-default/35 px-5 py-4 text-sm">
        <ScanLine size={20} />
        <p>从账号截图试试打码，或给风景照片添加署名水印。</p>
        <Button
          variant="ghost"
          className="min-h-11 rounded-lg sm:ml-auto"
          onPress={() => demo.openEditor('account')}
        >
          开始编辑
          <ArrowUpRight size={16} />
        </Button>
      </div>
      {demo.selectedIds.length > 0 && (
        <div className="fixed right-4 bottom-5 left-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-lg min-[1200px]:left-[272px]">
          <span className="text-sm">
            已选择 <strong>{demo.selectedIds.length}</strong> 张图片
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="min-h-11"
              onPress={() => demo.setSelectedIds([])}
            >
              清空选择
            </Button>
            <Button
              variant="primary"
              className="min-h-11 rounded-lg"
              onPress={() => router.push('/batch')}
            >
              <ImagePlus size={17} />
              批量编辑
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
