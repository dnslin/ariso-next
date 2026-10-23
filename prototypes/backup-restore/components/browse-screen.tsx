'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { Modal } from '@heroui/react/modal';
import {
  CloudUpload,
  ExternalLink,
  Images,
  LockKeyhole,
  PauseCircle,
  Trash2,
} from 'lucide-react';
import { AdminFrame } from './admin-frame';
import { usePrototype } from './prototype-state';

const pictures = [
  {
    name: '山间湖泊.jpg',
    src: '/demo-lake.jpg',
    storage: '旅行照片',
    size: '3.2 MB',
    visibility: '公开',
  },
  {
    name: '色彩测试.png',
    src: '/demo-image.png',
    storage: '本地图库',
    size: '12 KB',
    visibility: '私有',
  },
];

export function LibraryScreen() {
  const { paused } = usePrototype();
  const [selected, setSelected] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  return (
    <AdminFrame
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-sm text-muted">2 张演示图片</p>
          <Link href="/settings/backup" className="min-h-11 text-sm">
            返回备份与恢复
          </Link>
        </div>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 text-[30px] font-medium">
          <Images className="size-6" />
          图库
        </h1>
        <Link
          href="/upload"
          className="min-h-11 rounded-lg bg-default px-4 text-sm"
        >
          前往上传
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted">
        查看图片、打开外链，体验备份期间仍可继续的操作。
      </p>
      {notice ? (
        <p
          role="status"
          className="mt-5 rounded-lg border border-border bg-default/40 p-3 text-sm"
        >
          {notice}
        </p>
      ) : null}
      <div className="mt-6 grid max-w-240 grid-cols-2 gap-3 sm:gap-5">
        {pictures.map((picture, index) => (
          <article
            key={picture.name}
            className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface"
          >
            <button
              className="block w-full cursor-zoom-in overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
              aria-label={`查看${picture.name}`}
              onClick={() => setSelected(index)}
            >
              <Image
                unoptimized
                width={1200}
                height={800}
                src={picture.src}
                alt={picture.name}
                className="aspect-[4/3] w-full object-cover"
              />
            </button>
            <div className="p-3 sm:p-4">
              <p className="truncate text-sm font-medium">{picture.name}</p>
              <p className="mt-1 text-xs text-muted">
                {picture.storage} · {picture.size}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-xs text-muted">
                  {picture.visibility === '私有' ? (
                    <LockKeyhole className="size-3" />
                  ) : null}
                  {picture.visibility}
                </span>
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label={`删除${picture.name}`}
                  isDisabled={paused}
                  className="size-11 text-muted"
                  onPress={() =>
                    setNotice(
                      '演示：当前已允许修改。这里不会删除任何真实图片。',
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {paused ? (
        <p className="mt-4 text-sm text-muted">
          备份期间暂时无法上传或删除图片。
        </p>
      ) : null}
      <Modal.Backdrop
        isOpen={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Modal.Container size="lg">
          <Modal.Dialog
            aria-label="图片预览"
            className="max-h-[calc(100dvh-32px)] rounded-2xl bg-surface p-4"
          >
            <Modal.CloseTrigger aria-label="关闭图片预览" />
            <Modal.Header>
              <Modal.Heading>{pictures[selected ?? 0].name}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Image
                unoptimized
                width={1200}
                height={800}
                src={pictures[selected ?? 0].src}
                alt={pictures[selected ?? 0].name}
                className="max-h-[60dvh] w-full rounded-lg object-contain"
              />
            </Modal.Body>
            <Modal.Footer>
              {selected === 0 ? (
                <Link
                  href="/i/demo-lake"
                  target="_blank"
                  className="min-h-11 gap-2"
                >
                  打开公开外链
                  <ExternalLink className="size-4" />
                </Link>
              ) : (
                <p className="text-sm text-muted">私有图片仅所有者可见。</p>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </AdminFrame>
  );
}

export function UploadScreen() {
  const { paused } = usePrototype();
  const [notice, setNotice] = useState('');
  return (
    <AdminFrame
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">
            {paused ? '备份结束后可以继续上传' : '已恢复修改操作'}
          </p>
          <Link href="/library" className="min-h-11 text-sm">
            返回图库
          </Link>
        </div>
      }
    >
      <h1 className="flex items-center gap-2.5 text-[30px] font-medium">
        <CloudUpload className="size-6" />
        上传图片
      </h1>
      <div className="mt-6 grid min-h-72 max-w-240 place-items-center rounded-3xl border border-dashed border-border bg-surface p-6 text-center">
        <div className="grid justify-items-center gap-4">
          {paused ? (
            <PauseCircle className="size-10 text-muted" />
          ) : (
            <CloudUpload className="size-10 text-muted" />
          )}
          <div>
            <h2 className="text-lg font-medium">
              {paused ? '上传暂时暂停' : '选择要上传的图片'}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {paused
                ? '正在创建整站备份，浏览和外链访问仍然可用。'
                : '当前仅演示操作恢复状态，不会上传文件。'}
            </p>
          </div>
          <Button
            isDisabled={paused}
            className="min-h-11"
            onPress={() =>
              setNotice('演示：选择图片入口已恢复，可以继续上传。')
            }
          >
            选择图片
          </Button>
          {paused ? (
            <Link href="/settings/backup" className="min-h-11 text-sm">
              查看备份进度
            </Link>
          ) : null}
        </div>
      </div>
      {notice ? (
        <p role="status" className="mt-4 text-sm">
          {notice}
        </p>
      ) : null}
    </AdminFrame>
  );
}

export function PublicImageScreen() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-20">
      <div className="grid w-full max-w-240 gap-4">
        <Image
          unoptimized
          width={1200}
          height={800}
          src="/demo-lake.jpg"
          alt="山间湖泊 · 公开外链演示"
          className="max-h-[75dvh] w-full rounded-xl object-contain"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">公开外链演示 · 备份期间仍可访问</p>
          <Link href="/library" className="min-h-11 text-sm">
            返回演示图库
          </Link>
        </div>
      </div>
    </main>
  );
}
