'use client';

import { Card } from '@heroui/react/card';
import { Button } from '@heroui/react/button';
import { X } from 'lucide-react';
import { BrandingMark } from './branding-mark';
import { brandAsset, brandLabels } from './branding-api';
import type { useBranding } from './use-branding';
import { siteCardClass } from './site-form';

const buttonClass = 'min-h-12 rounded-lg px-5 text-sm';
export function BrandingPreview({
  editor,
}: {
  editor: ReturnType<typeof useBranding>;
}) {
  const file = editor.operation!.file!;
  const kind = editor.operation!.kind;
  const url = editor.operation!.previewUrl;
  return (
    <>
      {editor.phase === 'failed' ? (
        <div role="alert" className="grid gap-1 text-sm">
          <p className="font-medium text-danger">素材未能更新</p>
          <p>{editor.message}</p>
          <p>所选文件和预览已保留，当前引用未改变。</p>
        </div>
      ) : null}
      {editor.uncertain ? (
        <Card className={siteCardClass}>
          <h2 className="text-lg font-medium">更新结果待核对</h2>
          <p className="text-sm">尚不能确认更新结果。所选文件已保留。</p>
          {editor.phase === 'check-error' ? (
            <p role="alert" className="text-sm text-danger">
              核对失败：{editor.message}。请重新核对。
            </p>
          ) : null}
          {editor.phase === 'different' ? (
            <>
              <p className="text-sm font-medium">服务器当前素材</p>
              <BrandingMark
                kind={kind}
                url={brandAsset(editor.saved!, kind).url}
              />
              <p className="text-sm text-muted">
                当前引用不能证明所选文件已保存，请选择后继续。
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  data-testid={`branding-${kind}-use-server`}
                  variant="outline"
                  className={buttonClass}
                  isDisabled={editor.expired}
                  onPress={editor.useServer}
                >
                  使用服务器素材
                </Button>
                <Button
                  data-testid={`branding-${kind}-retry`}
                  variant="outline"
                  className={buttonClass}
                  isDisabled={editor.expired}
                  onPress={editor.retry}
                >
                  保留文件继续上传
                </Button>
              </div>
            </>
          ) : (
            <Button
              data-testid={`branding-${kind}-retry-read`}
              variant="outline"
              className={`${buttonClass} w-fit`}
              isDisabled={editor.busy || editor.expired}
              onPress={() => void editor.reconcile()}
            >
              {editor.phase === 'checking' ? '正在核对…' : '核对服务器素材'}
            </Button>
          )}
        </Card>
      ) : null}
      <Card className={siteCardClass}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">
            所选文件 ·{' '}
            {editor.phase === 'saving'
              ? '上传中'
              : editor.uncertain
                ? '结果待核对'
                : '待上传'}
          </h2>
          <Button
            isIconOnly
            aria-label="取消选择"
            data-testid={`branding-${kind}-cancel`}
            variant="ghost"
            className="size-11 rounded-lg"
            isDisabled={editor.locked}
            onPress={editor.cancel}
          >
            <X className="size-4" />
          </Button>
        </div>
        {url ? (
          <BrandingMark
            kind={kind}
            url={url}
            testId={`branding-${kind}-preview`}
          />
        ) : null}
        <p className="text-sm wrap-anywhere">{file.name}</p>
        <p className="text-xs text-muted">
          {editor.phase === 'saving'
            ? '正在提交，请等待确定结果。'
            : editor.uncertain
              ? '尚不能确认当前配置，所选文件仍保留。'
              : `准备替换 ${brandLabels[kind]}，当前配置尚未改变。`}
        </p>
      </Card>
      <Card className={siteCardClass}>
        <h2 className="text-lg font-medium">展示预览 · {editor.saved!.name}</h2>
        {url ? <BrandingMark kind={kind} url={url} /> : null}
        <p className="text-sm wrap-anywhere">{editor.saved!.description}</p>
        <p className="text-xs text-muted">
          {kind === 'favicon'
            ? '浏览器标签图标预览'
            : 'Logo 与站点名称分别管理。'}
        </p>
      </Card>
    </>
  );
}
