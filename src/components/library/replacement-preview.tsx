'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import type { LibraryDetail } from '../../server/library/detail-types';
import { initialPreview, PreviewImage } from './detail-preview';
import { bytesLabel } from './detail-labels';

function FilePreview({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-xl bg-default">
      {failed ? (
        <p
          role="status"
          className="px-4 text-center text-sm leading-6 text-muted"
        >
          <ImageOff size={24} aria-hidden className="mx-auto mb-3" />
          此浏览器无法预览所选文件。上传后由服务器识别格式。
        </p>
      ) : (
        <Image
          src={url}
          alt="待替换的新图片"
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, 600px"
          className="object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
export function ReplacementPreview({
  detail,
  file,
  previewUrl,
}: {
  detail: LibraryDetail;
  file: File | null;
  previewUrl: string | null;
}) {
  const current = detail.versions.find(
    (version) => version.kind === initialPreview(detail),
  );
  return (
    <div className="grid min-w-0 gap-5 md:grid-cols-2">
      <div className="grid min-w-0 content-start gap-3">
        <h2 className="text-sm font-medium">当前图片</h2>
        {current ? (
          <PreviewImage
            key={current.contentId}
            version={current}
            name={detail.displayName}
            width={current.width ?? detail.width}
            height={current.height ?? detail.height}
          />
        ) : (
          <div className="grid aspect-[4/3] place-items-center rounded-xl bg-default text-sm text-muted">
            当前没有可读预览
          </div>
        )}
        <p className="break-all text-sm">{detail.displayName}</p>
        <p className="text-xs text-muted">
          {detail.format} · {detail.width ?? '未知'} × {detail.height ?? '未知'}{' '}
          px · {bytesLabel(detail.byteSize)}
        </p>
      </div>
      <div className="grid min-w-0 content-start gap-3">
        <h2 className="text-sm font-medium">新图片</h2>
        {file && previewUrl ? (
          <FilePreview key={previewUrl} url={previewUrl} />
        ) : (
          <div className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-border bg-default/30 px-4 text-center text-sm text-muted">
            选择一个文件后，在这里对比新内容。
          </div>
        )}
        <p className="break-all text-sm">{file?.name ?? '尚未选择文件'}</p>
        {file ? (
          <p className="text-xs text-muted">
            {bytesLabel(file.size)} · 格式与版本兼容性由服务器检查
          </p>
        ) : null}
      </div>
    </div>
  );
}
