'use client';

import { Form } from '@heroui/react/form';
import { Card } from '@heroui/react/card';
import { useRef, type ComponentProps } from 'react';
import type { MediaSettingsInput } from '../../server/media/validation';
import {
  ProcessingColor,
  ProcessingNumber,
  ProcessingSelect,
  ProcessingSwitch,
} from './fields';
import { WatermarkFields } from './watermark-fields';
import { cardClass } from './model';

export function ProcessingForm({
  onSave,
  onCompression,
  ...props
}: ComponentProps<typeof WatermarkFields> & {
  onSave: () => void;
  onCompression: (value: boolean) => void;
}) {
  const { input, change, errors, busy } = props;
  const lastMaxEdge = useRef(input.maxEdge ?? 1920);
  return (
    <Form
      id="processing-form"
      validationBehavior="aria"
      className="grid gap-5 min-[1200px]:gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <Card className={cardClass}>
        <h2 className="text-lg font-medium">默认与任务</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
          <ProcessingSelect
            name="defaultVisibility"
            label="新上传默认可见性"
            value={input.defaultVisibility}
            disabled={busy}
            options={[
              ['public', '公开'],
              ['private', '私有'],
            ]}
            description="仅影响新提交，已有图片不变。"
            onChange={(value) =>
              change(
                'defaultVisibility',
                value as MediaSettingsInput['defaultVisibility'],
              )
            }
          />
          <ProcessingSelect
            name="defaultLinkVersion"
            label="默认外链版本"
            value={input.defaultLinkVersion}
            disabled={busy}
            error={errors.defaultLinkVersion}
            options={[
              ['original', '原图'],
              ['compressed', '压缩图'],
              ['watermark', '水印图'],
            ]}
            description="默认链接跟随此选择，固定版本不变。"
            onChange={(value) =>
              change(
                'defaultLinkVersion',
                value as MediaSettingsInput['defaultLinkVersion'],
              )
            }
          />
          <div className="col-span-2 md:col-span-1">
            <ProcessingNumber
              name="concurrency"
              label="处理并发数"
              min={1}
              max={4}
              integer
              value={input.concurrency}
              disabled={busy}
              error={errors.concurrency}
              onChange={(value) => change('concurrency', value)}
              description="1–4；调小后，已运行任务继续完成。"
            />
          </div>
        </div>
      </Card>
      <Card className={cardClass}>
        <h2 className="text-lg font-medium">派生图片</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
          <div className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:flex-col md:items-start md:gap-2">
            <span className="text-[13px]">压缩版本</span>
            <ProcessingSwitch
              label="压缩版本"
              selected={input.compressionEnabled}
              disabled={busy}
              onChange={onCompression}
            />
          </div>
          <ProcessingSelect
            name="outputFormat"
            label="输出格式"
            value={input.outputFormat}
            disabled={busy}
            options={[
              ['webp', 'WebP'],
              ['jpeg', 'JPEG'],
              ['avif', 'AVIF'],
            ]}
            onChange={(value) =>
              change(
                'outputFormat',
                value as MediaSettingsInput['outputFormat'],
              )
            }
          />
          <ProcessingNumber
            name="quality"
            label="质量"
            min={1}
            max={100}
            integer
            value={input.quality}
            disabled={busy}
            error={errors.quality}
            onChange={(value) => change('quality', value)}
          />
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3 md:flex-col md:items-start md:gap-2">
              <span className="text-[13px]">最长边限制</span>
              <ProcessingSwitch
                label="最长边限制"
                selected={input.maxEdge !== null}
                disabled={busy}
                onChange={(value) => {
                  if (input.maxEdge !== null)
                    lastMaxEdge.current = input.maxEdge;
                  change('maxEdge', value ? lastMaxEdge.current : null);
                }}
              />
            </div>
            {input.maxEdge !== null ? (
              <ProcessingNumber
                name="maxEdge"
                label="最长边（px）"
                min={1}
                max={32768}
                integer
                value={input.maxEdge}
                disabled={busy}
                error={errors.maxEdge}
                onChange={(value) =>
                  change('maxEdge', Number.isNaN(value) ? null : value)
                }
                description="保持原比例，不放大小图。"
              />
            ) : null}
          </div>
          <ProcessingColor
            name="jpegBackground"
            label="JPEG 背景色"
            value={input.jpegBackground}
            disabled={busy}
            error={errors.jpegBackground}
            onChange={(value) => change('jpegBackground', value)}
          />
        </div>
        <p className="text-[13px] leading-normal text-muted">
          缩略图固定 WebP · 最长边 640 px · 质量 80。保持原比例，不放大小图。
        </p>
      </Card>
      <WatermarkFields {...props} />
    </Form>
  );
}
