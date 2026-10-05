'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Spinner } from '@heroui/react/spinner';
import { Upload } from 'lucide-react';
import {
  processingRequest,
  ProcessingRequestError,
  watermarkAssetUrl,
  type WatermarkAsset,
} from './api';
import { formatBytes } from './model';

export function WatermarkAssetField({
  id,
  disabled,
  error,
  onChange,
  onBusy,
  onExpire,
}: {
  id: string | null;
  disabled: boolean;
  error?: string;
  onChange: (id: string) => void;
  onBusy: (busy: boolean) => void;
  onExpire: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [uploadedName, setUploadedName] = useState<{
    id: string;
    name: string;
  }>();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['watermark-asset', id],
    queryFn: ({ signal }) =>
      processingRequest<WatermarkAsset>(watermarkAssetUrl(id!), { signal }),
    enabled: Boolean(id),
    retry: false,
    networkMode: 'always',
    refetchInterval: (current) =>
      current.state.data?.expiresAt ? 30000 : false,
  });
  const sessionLost =
    query.error instanceof ProcessingRequestError && query.error.status === 401;
  useEffect(() => {
    if (sessionLost) onExpire();
  }, [sessionLost, onExpire]);
  async function upload(file: File) {
    if (pending.current || disabled) return;
    pending.current = true;
    setUploading(true);
    onBusy(true);
    setMessage('');
    try {
      const body = new FormData();
      body.append('file', file);
      const asset = await processingRequest<WatermarkAsset>(
        '/api/media/watermark-assets',
        { method: 'POST', body },
      );
      client.setQueryData(['watermark-asset', asset.id], asset);
      setUploadedName({ id: asset.id, name: file.name });
      onChange(asset.id);
    } catch (cause) {
      const unknown =
        !(cause instanceof ProcessingRequestError) || cause.status >= 500;
      setMessage(
        `${unknown ? '上传结果尚未确认，请检查连接后明确重新选择文件。未采用的临时素材会自动到期。' : '上传失败，原素材仍保留。'}${cause instanceof Error ? cause.message : String(cause)}`,
      );
      if (cause instanceof ProcessingRequestError && cause.status === 401)
        onExpire();
    } finally {
      pending.current = false;
      setUploading(false);
      onBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  const asset = query.data;
  const timedOut = Boolean(
    asset?.expiresAt && asset.status === 'ready' && asset.available === false,
  );
  const available = asset?.status === 'ready' && asset.available !== false;
  const state = uploading
    ? 'uploading'
    : !id
      ? 'empty'
      : query.error
        ? 'error'
        : !asset
          ? 'loading'
          : !available
            ? 'unavailable'
            : asset.expiresAt
              ? 'temporary'
              : 'saved';
  return (
    <div
      data-field="watermarkAssetId"
      data-testid="processing-asset"
      data-asset-id={id ?? ''}
      data-state={state}
      className="grid min-w-0 gap-2"
    >
      <span className="text-[13px]">水印素材</span>
      <div>
        <Button
          variant="outline"
          isDisabled={disabled || uploading}
          onPress={() => fileRef.current?.click()}
          className="min-h-11 rounded-xl text-sm font-normal"
        >
          {uploading ? (
            <Spinner size="sm" />
          ) : (
            <Upload className="size-4" aria-hidden />
          )}
          {uploading ? '正在上传素材' : '上传水印素材'}
        </Button>
      </div>
      <input
        ref={fileRef}
        data-testid="processing-asset-file"
        aria-label="选择水印素材"
        type="file"
        accept="image/png,image/webp,image/svg+xml"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <p className="text-[13px] text-muted">
        PNG、WebP 或静态 SVG，不超过 5 MiB。
      </p>
      {error || message ? (
        <p role="alert" className="text-[13px] text-danger">
          {error || message}
        </p>
      ) : null}
      {!id ? (
        <p className="text-sm text-muted">尚未选择素材。</p>
      ) : (
        <div className="grid gap-2 rounded-xl border border-border p-3 text-[13px] leading-normal wrap-anywhere">
          <code>{id}</code>
          {query.error ? (
            <>
              <p role="alert" className="text-danger">
                素材信息读取失败，当前 ID 已保留。{query.error.message}
              </p>
              <Button
                data-testid="processing-asset-retry"
                variant="outline"
                isDisabled={disabled || query.isFetching}
                onPress={() => void query.refetch()}
                className="min-h-11 w-fit rounded-xl"
              >
                重新读取素材信息
              </Button>
            </>
          ) : !asset ? (
            <p role="status">正在读取素材信息…</p>
          ) : (
            <>
              {uploadedName?.id === id ? (
                <p>{uploadedName.name}</p>
              ) : (
                <p>{asset.expiresAt ? '临时素材' : '已保存素材'}</p>
              )}
              <p>
                {asset.format ?? '格式未确认'} · {asset.mime ?? 'MIME 未确认'} ·{' '}
                {asset.width ?? '未确认'} × {asset.height ?? '未确认'} ·{' '}
                {formatBytes(asset.byteSize)}
              </p>
              <p>
                {available
                  ? asset.expiresAt
                    ? `尚未保存，须在 ${new Date(asset.expiresAt).toLocaleString('zh-CN')} 前采用。保存处理设置后采用。`
                    : '已采用，无临时到期限制。'
                  : timedOut
                    ? '素材已到期，请重新上传。'
                    : `素材不可用（${asset.status}），请重新上传。`}
              </p>
              {asset.error ? (
                <p className="text-danger">{asset.error}</p>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
