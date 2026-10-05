'use client';

import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { TextField } from '@heroui/react/textfield';
import { TextArea } from '@heroui/react/textarea';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import {
  watermarkPositions,
  type MediaSettingsInput,
} from '../../server/media/validation';
import {
  ProcessingColor,
  ProcessingNumber,
  ProcessingSelect,
  ProcessingSwitch,
} from './fields';
import { WatermarkAssetField } from './watermark-asset';
import { cardClass, controlClass } from './model';

export const positionLabels = [
  '左上',
  '上中',
  '右上',
  '左中',
  '居中',
  '右中',
  '左下',
  '下中',
  '右下',
];
export type ProcessingChange = <K extends keyof MediaSettingsInput>(
  field: K,
  value: MediaSettingsInput[K],
) => void;

export function WatermarkFields({
  input,
  mode,
  busy,
  assetBusy,
  errors,
  change,
  onToggle,
  onMode,
  onAssetBusy,
  onAssetClear,
  onExpire,
}: {
  input: MediaSettingsInput;
  mode: 'text' | 'image';
  busy: boolean;
  assetBusy: boolean;
  errors: Record<string, string>;
  change: ProcessingChange;
  onToggle: (value: boolean) => void;
  onMode: (value: 'text' | 'image') => void;
  onAssetBusy: (value: boolean) => void;
  onAssetClear: () => void;
  onExpire: () => void;
}) {
  const disabled = busy || input.watermarkMode === 'off';
  const opacity = (
    <ProcessingNumber
      name="watermarkOpacity"
      label="不透明度（%）"
      min={0}
      max={100}
      value={input.watermarkOpacity}
      disabled={disabled}
      error={errors.watermarkOpacity}
      slider
      onChange={(value) => change('watermarkOpacity', value)}
    />
  );
  return (
    <Card className={cardClass}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">水印</h2>
        <ProcessingSwitch
          label="启用水印"
          selected={input.watermarkMode !== 'off'}
          disabled={busy}
          onChange={onToggle}
        />
      </div>
      <div
        role="group"
        aria-label="水印类型"
        className="flex w-full gap-1 rounded-[14px] bg-default p-1 min-[1200px]:w-fit"
      >
        {(['text', 'image'] as const).map((value) => (
          <Button
            key={value}
            data-watermark-mode={value}
            aria-pressed={mode === value}
            variant={mode === value ? 'primary' : 'outline'}
            isDisabled={disabled}
            onPress={() => onMode(value)}
            className="h-11 min-w-0 flex-1 rounded-xl px-3 text-sm font-normal min-[1200px]:min-w-39"
          >
            {value === 'text' ? '文字水印' : '图片水印'}
          </Button>
        ))}
      </div>
      <div className={disabled ? 'opacity-60' : ''}>
        <div className="grid gap-5 md:grid-cols-[260px_260px] md:gap-8">
          <div data-field="watermarkPosition" className="grid gap-2">
            <span className="text-[13px]">水印位置</span>
            <div
              role="group"
              aria-label="水印位置"
              className="grid grid-cols-3 gap-2"
            >
              {watermarkPositions.map((position, index) => (
                <Button
                  key={position}
                  name="watermarkPosition"
                  data-position={position}
                  aria-pressed={input.watermarkPosition === position}
                  variant={
                    input.watermarkPosition === position ? 'primary' : 'outline'
                  }
                  isDisabled={disabled}
                  className="h-11 w-full min-w-0 rounded-xl p-0 text-sm font-normal"
                  onPress={() => change('watermarkPosition', position)}
                >
                  {positionLabels[index]}
                </Button>
              ))}
            </div>
            <p className="text-[13px] text-muted">
              当前位置：
              {
                positionLabels[
                  watermarkPositions.indexOf(input.watermarkPosition)
                ]
              }
            </p>
          </div>
          <ProcessingNumber
            name="watermarkMargin"
            label="边距（短边比例 %）"
            min={0}
            max={20}
            value={input.watermarkMargin}
            disabled={disabled}
            error={errors.watermarkMargin}
            onChange={(value) => change('watermarkMargin', value)}
            description="居中方向不加偏移。"
          />
        </div>
        <div
          hidden={mode !== 'text' || input.watermarkMode === 'off'}
          className="mt-5 grid gap-5"
        >
          <div className="grid gap-3 md:grid-cols-2 md:gap-5">
            <TextField
              data-field="watermarkText"
              name="watermarkText"
              value={input.watermarkText}
              onChange={(value) => change('watermarkText', value)}
              isDisabled={disabled}
              isInvalid={Boolean(errors.watermarkText)}
              validationBehavior="aria"
              className="min-w-0 gap-2"
            >
              <Label className="text-[13px] font-normal">水印文字</Label>
              <TextArea className={`${controlClass} min-h-22 px-3 py-2`} />
              <FieldError>{errors.watermarkText}</FieldError>
              <p className="text-[13px] text-muted">最多200个字符、5行。</p>
            </TextField>
            <ProcessingSelect
              name="watermarkFont"
              label="内置字体"
              value={input.watermarkFont}
              disabled={disabled}
              options={[
                ['chinese', '内置中文字体'],
                ['latin', '内置拉丁字体'],
              ]}
              onChange={(value) =>
                change(
                  'watermarkFont',
                  value as MediaSettingsInput['watermarkFont'],
                )
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
            <ProcessingNumber
              name="watermarkFontSize"
              label="相对字号（短边 %）"
              min={1}
              max={20}
              value={input.watermarkFontSize}
              disabled={disabled}
              error={errors.watermarkFontSize}
              slider
              onChange={(value) => change('watermarkFontSize', value)}
            />
            <ProcessingColor
              name="watermarkColor"
              label="字体颜色"
              value={input.watermarkColor}
              disabled={disabled}
              error={errors.watermarkColor}
              onChange={(value) => change('watermarkColor', value)}
            />
            <div className="col-span-2 md:col-span-1">
              {mode === 'text' ? opacity : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:gap-5">
            <ProcessingColor
              name="watermarkStrokeColor"
              label="描边颜色"
              value={input.watermarkStrokeColor}
              disabled={disabled}
              error={errors.watermarkStrokeColor}
              onChange={(value) => change('watermarkStrokeColor', value)}
            />
            <ProcessingNumber
              name="watermarkStrokeWidth"
              label="描边宽度（px）"
              min={0}
              max={10}
              value={input.watermarkStrokeWidth}
              disabled={disabled}
              error={errors.watermarkStrokeWidth}
              onChange={(value) => change('watermarkStrokeWidth', value)}
            />
          </div>
        </div>
        <div
          hidden={mode !== 'image' || input.watermarkMode === 'off'}
          className="mt-5 grid gap-5"
        >
          <WatermarkAssetField
            id={input.watermarkAssetId}
            disabled={disabled}
            error={errors.watermarkAssetId}
            onChange={(id) => change('watermarkAssetId', id)}
            onBusy={onAssetBusy}
            onExpire={onExpire}
          />
          <div className="grid grid-cols-2 gap-3 md:gap-5">
            <ProcessingNumber
              name="watermarkWidth"
              label="相对图片宽度（画布 %）"
              min={1}
              max={100}
              value={input.watermarkWidth}
              disabled={disabled}
              error={errors.watermarkWidth}
              slider
              onChange={(value) => change('watermarkWidth', value)}
            />
            {mode === 'image' ? opacity : null}
          </div>
        </div>
      </div>
      <p className="text-[13px] leading-normal text-muted">
        {input.watermarkMode === 'off'
          ? '水印已关闭；启用后可编辑，当前参数保留。'
          : '只应用当前水印模式；切换模式保留另一模式输入。'}{' '}
        修改设置只影响新任务。
      </p>
      {input.watermarkAssetId ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] leading-normal text-muted">
            保留的图片素材仅在保存后解除引用。
          </p>
          <Button
            data-testid="processing-asset-clear"
            type="button"
            variant="outline"
            isDisabled={busy || assetBusy}
            onPress={onAssetClear}
            className="min-h-11 rounded-xl text-sm font-normal"
          >
            清空素材选择
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
