import { Card } from '@heroui/react/card';
import { TextField } from '@heroui/react/textfield';
import { TextArea } from '@heroui/react/textarea';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import { useRef } from 'react';
import {
  ProcessingColor,
  ProcessingNumber,
  ProcessingSelect,
  ProcessingSwitch,
} from '../../../src/components/processing/fields';
import {
  cardClass,
  controlClass,
} from '../../../src/components/processing/model';
import type { MediaSettingsInput } from '../../../src/server/media/validation';
import type { ProcessingChange } from '../../../src/components/processing/watermark-fields';

/** 仅组合已有字段；这一原型不上传水印素材或发起图片处理。 */
export function PrototypeProcessingFields({
  input,
  change,
  busy,
  errors,
}: {
  input: MediaSettingsInput;
  change: ProcessingChange;
  busy: boolean;
  errors: Record<string, string>;
}) {
  const watermarkDisabled = busy || input.watermarkMode === 'off';
  const lastMaxEdge = useRef(input.maxEdge ?? 1920);
  return (
    <div className="grid gap-5 min-[1200px]:gap-6">
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
              change('defaultVisibility', value as 'public' | 'private')
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
              description="1–4；调小后，已运行任务继续完成。"
              onChange={(value) => change('concurrency', value)}
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
              onChange={(value) => change('compressionEnabled', value)}
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
                description="保持原比例，不放大小图。"
                onChange={(value) =>
                  change('maxEdge', Number.isNaN(value) ? null : value)
                }
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
      <Card className={cardClass}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">水印</h2>
          <ProcessingSwitch
            label="启用水印"
            selected={input.watermarkMode !== 'off'}
            disabled={busy}
            onChange={(value) =>
              change('watermarkMode', value ? 'text' : 'off')
            }
          />
        </div>
        <TextField
          name="watermarkText"
          value={input.watermarkText}
          onChange={(value) => change('watermarkText', value)}
          isDisabled={watermarkDisabled}
          isInvalid={Boolean(errors.watermarkText)}
          validationBehavior="aria"
          className="grid gap-2"
        >
          <Label className="text-[13px] font-normal">水印文字</Label>
          <TextArea
            data-field="watermarkText"
            className={`${controlClass} min-h-24 resize-y p-3`}
          />
          <FieldError>{errors.watermarkText}</FieldError>
        </TextField>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
          <ProcessingSelect
            name="watermarkFont"
            label="内置字体"
            value={input.watermarkFont}
            disabled={watermarkDisabled}
            options={[
              ['chinese', '中文字体'],
              ['latin', '拉丁字体'],
            ]}
            onChange={(value) =>
              change('watermarkFont', value as 'chinese' | 'latin')
            }
          />
          <ProcessingNumber
            name="watermarkFontSize"
            label="相对字号（%）"
            min={1}
            max={20}
            value={input.watermarkFontSize}
            disabled={watermarkDisabled}
            error={errors.watermarkFontSize}
            onChange={(value) => change('watermarkFontSize', value)}
          />
          <ProcessingNumber
            name="watermarkOpacity"
            label="不透明度（%）"
            min={0}
            max={100}
            slider
            value={input.watermarkOpacity}
            disabled={watermarkDisabled}
            error={errors.watermarkOpacity}
            onChange={(value) => change('watermarkOpacity', value)}
          />
          <ProcessingColor
            name="watermarkColor"
            label="字体颜色"
            value={input.watermarkColor}
            disabled={watermarkDisabled}
            error={errors.watermarkColor}
            onChange={(value) => change('watermarkColor', value)}
          />
          <ProcessingSelect
            name="watermarkPosition"
            label="水印位置"
            value={input.watermarkPosition}
            disabled={watermarkDisabled}
            options={[
              ['top-left', '左上'],
              ['top-center', '上中'],
              ['top-right', '右上'],
              ['center-left', '左中'],
              ['center', '居中'],
              ['center-right', '右中'],
              ['bottom-left', '左下'],
              ['bottom-center', '下中'],
              ['bottom-right', '右下'],
            ]}
            onChange={(value) =>
              change(
                'watermarkPosition',
                value as MediaSettingsInput['watermarkPosition'],
              )
            }
          />
          <ProcessingNumber
            name="watermarkMargin"
            label="边距（%）"
            min={0}
            max={20}
            value={input.watermarkMargin}
            disabled={watermarkDisabled}
            error={errors.watermarkMargin}
            onChange={(value) => change('watermarkMargin', value)}
          />
        </div>
      </Card>
    </div>
  );
}
