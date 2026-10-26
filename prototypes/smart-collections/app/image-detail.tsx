'use client';

import Image from 'next/image';
import { Button, Chip, toast } from '@heroui/react';
import {
  ArrowLeft,
  Globe,
  LockKeyhole,
  RotateCcw,
  Tags,
  X,
} from 'lucide-react';
import { bytesLabel } from '../../../src/components/library/detail-labels';
import { useDemo } from './providers';

export function ImageDetail({
  imageId,
  onClose,
}: {
  imageId: string;
  onClose: () => void;
}) {
  const { images, setImages } = useDemo();
  const image = images.find((item) => item.id === imageId);
  if (!image)
    return (
      <section className="grid gap-4">
        <h1>图片不存在</h1>
        <Button onPress={onClose}>返回</Button>
      </section>
    );
  function changeTags(tags: string[]) {
    setImages((current) =>
      current.map((item) => (item.id === imageId ? { ...item, tags } : item)),
    );
    toast.success('标签已更新');
  }
  return (
    <section
      className="mx-auto grid w-full max-w-5xl gap-6"
      aria-labelledby="detail-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 id="detail-title" className="break-words">
            {image.name}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {image.trashed ? '回收站记录' : '图片详情'}
          </p>
        </div>
        <Button variant="ghost" className="min-h-11 shrink-0" onPress={onClose}>
          <ArrowLeft size={18} />
          返回
        </Button>
      </div>
      <div className="relative overflow-hidden rounded-2xl bg-default/40">
        <Image
          src={image.src}
          width={1600}
          height={1066}
          unoptimized
          alt={image.name}
          className="max-h-[min(55dvh,480px)] w-full object-contain"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Chip
          variant="soft"
          className={
            image.visibility === 'public'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200'
          }
        >
          {image.visibility === 'public' ? (
            <Globe size={14} />
          ) : (
            <LockKeyhole size={14} />
          )}
          {image.visibility === 'public' ? '公开' : '私有'}
        </Chip>
        <span>{bytesLabel(image.bytes)}</span>
        <span className="text-muted">
          {image.daysAgo === 0 ? '今天上传' : `${image.daysAgo} 天前上传`} ·
          本地存储
        </span>
      </div>
      {image.trashed ? (
        <div className="grid justify-items-start gap-4">
          <p className="text-sm text-muted">
            图片仍在回收站。恢复后会重新出现在符合条件的智能集合中。
          </p>
          <Button
            className="min-h-12"
            onPress={() => {
              setImages((current) =>
                current.map((item) =>
                  item.id === imageId ? { ...item, trashed: false } : item,
                ),
              );
              toast.success('图片已恢复');
              onClose();
            }}
          >
            <RotateCcw size={17} />
            恢复图片
          </Button>
        </div>
      ) : (
        <div className="grid justify-items-start gap-3 border-t border-border pt-5">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Tags size={17} />
            标签
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {image.tags.length === 0 ? (
              <span className="text-sm text-muted">尚未添加标签</span>
            ) : (
              image.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-lg border border-border pl-3 text-sm"
                >
                  {tag}
                  <Button
                    isIconOnly
                    variant="ghost"
                    aria-label={`移除标签：${tag}`}
                    className="size-11"
                    onPress={() =>
                      changeTags(image.tags.filter((value) => value !== tag))
                    }
                  >
                    <X size={14} />
                  </Button>
                </span>
              ))
            )}
          </div>
          {!image.tags.includes('截图') && (
            <Button
              variant="secondary"
              className="min-h-11"
              onPress={() => changeTags([...image.tags, '截图'])}
            >
              <Tags size={16} />
              添加“截图”标签
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
