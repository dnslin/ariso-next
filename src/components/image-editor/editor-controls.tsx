'use client';

import { useState } from 'react';
import {
  Button,
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  ColorSwatchPicker,
  FieldError,
  Label,
  NumberField,
  Slider,
  Switch,
  TextField,
  TextArea,
  parseColor,
} from '@heroui/react';
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import {
  copyImageEditRecipe as copyRecipe,
  normalizeImageEditRegion as normalizeRegion,
  imageEditWatermarkSchema,
  type ImageEditRecipe as Recipe,
  type ImageEditRegion as Region,
  type ImageEditWatermark as Watermark,
} from '../../shared/image-editing';
import { WatermarkAssetField } from '../processing/watermark-asset';

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <Slider
      aria-label={label}
      value={value}
      minValue={min}
      maxValue={max}
      step={step}
      onChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
      className="gap-3"
    >
      <div className="flex items-center justify-between text-xs">
        <Label>{label}</Label>
        <span className="tabular-nums text-muted">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </div>
      <Slider.Track className="h-7">
        <Slider.Fill />
        <Slider.Thumb aria-label={label} />
      </Slider.Track>
    </Slider>
  );
}
function Numeric({
  label,
  value,
  min = 0,
  max = 100,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumberField
      value={Math.round(value * 10) / 10}
      minValue={min}
      maxValue={max}
      step={0.5}
      onChange={(next) => {
        if (Number.isFinite(next)) onChange(next);
      }}
    >
      <Label className="text-xs">{label}</Label>
      <NumberField.Group>
        <NumberField.Input className="h-11 w-full px-3" />
      </NumberField.Group>
    </NumberField>
  );
}
function ColorControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  // Keep HSB channels while choosing a hue at white/black, where HEX loses hue.
  const [color, setColor] = useState(() => parseColor(value).toFormat('hsb'));
  if (color.toString('hex').toLowerCase() !== value.toLowerCase()) {
    setColor(parseColor(value).toFormat('hsb'));
  }
  return (
    <div className="grid gap-2">
      <span className="text-xs">颜色</span>
      <ColorPicker
        value={color}
        onChange={(next) => {
          setColor(next.toFormat('hsb'));
          onChange(next.toString('hex'));
        }}
        className="w-full"
      >
        <ColorPicker.Trigger
          aria-label="打开颜色调色盘"
          className="min-h-11 w-full rounded-lg border border-border bg-field-background px-3 text-foreground"
        >
          <ColorSwatch className="size-6 rounded-md border border-border" />
          <span className="text-sm uppercase">{value}</span>
          <ChevronDown size={16} className="ml-auto text-muted" />
        </ColorPicker.Trigger>
        <ColorPicker.Popover
          aria-label="颜色调色盘"
          placement="bottom end"
          className="w-[280px] max-w-[calc(100vw-32px)] gap-3 rounded-2xl border border-border p-3"
        >
          <ColorArea
            aria-label="颜色面板"
            colorSpace="hsb"
            xChannel="saturation"
            yChannel="brightness"
            className="h-36 w-full max-w-full rounded-lg"
          >
            <ColorArea.Thumb />
          </ColorArea>
          <ColorSlider
            aria-label="色相"
            channel="hue"
            colorSpace="hsb"
            className="gap-2"
          >
            <Label className="text-xs">色相</Label>
            <ColorSlider.Track className="h-7">
              <ColorSlider.Thumb />
            </ColorSlider.Track>
          </ColorSlider>
          <ColorField aria-label="十六进制色值">
            <Label className="text-xs">色值</Label>
            <ColorField.Group>
              <ColorField.Prefix className="pl-3">
                <ColorSwatch className="size-5 rounded-md border border-border" />
              </ColorField.Prefix>
              <ColorField.Input className="h-11 min-w-0 px-3 uppercase" />
            </ColorField.Group>
          </ColorField>
          <div className="grid gap-2">
            <span className="text-xs text-muted">常用颜色</span>
            <ColorSwatchPicker aria-label="常用颜色" className="flex gap-2">
              {['#ffffff', '#272343', '#ffd807', '#4a8b80'].map((preset) => (
                <ColorSwatchPicker.Item
                  key={preset}
                  color={preset}
                  aria-label={`使用颜色 ${preset}`}
                  className="size-11 rounded-lg"
                >
                  <ColorSwatchPicker.Swatch className="size-7 rounded-md border border-border" />
                  <ColorSwatchPicker.Indicator
                    className={
                      preset === '#272343' ? 'text-white' : 'text-[#272343]'
                    }
                  >
                    <Check size={14} />
                  </ColorSwatchPicker.Indicator>
                </ColorSwatchPicker.Item>
              ))}
            </ColorSwatchPicker>
          </div>
        </ColorPicker.Popover>
      </ColorPicker>
    </div>
  );
}
export function MaskControls({
  recipe,
  onChange,
  selectedId,
  onSelect,
  maskMode,
  onMode,
  strength,
  onStrength,
  color,
  onColor,
  onDraw,
}: {
  recipe: Recipe;
  onChange: (recipe: Recipe) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  maskMode: Region['mode'];
  onMode: (mode: Region['mode']) => void;
  strength: number;
  onStrength: (strength: number) => void;
  color: string;
  onColor: (color: string) => void;
  onDraw: () => void;
}) {
  const selected = recipe.regions.find((region) => region.id === selectedId);
  function patch(values: Partial<Region>) {
    if (!selected) return;
    const next = copyRecipe(recipe);
    next.regions = next.regions.map((region) =>
      region.id === selected.id
        ? normalizeRegion({ ...region, ...values })
        : region,
    );
    onChange(next);
  }
  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-sm font-semibold">局部打码</h2>
        <p className="mt-2 text-xs leading-5 text-muted">
          可直接拖动框选，也可添加区域后用位置和大小字段精确调整。
        </p>
      </div>
      <div
        role="group"
        aria-label="打码方式"
        className="grid grid-cols-2 gap-2"
      >
        {(['pixelate', 'solid'] as const).map((mode) => (
          <Button
            key={mode}
            variant={
              (selected?.mode ?? maskMode) === mode ? 'secondary' : 'outline'
            }
            className="min-h-11 rounded-lg text-sm"
            aria-pressed={(selected?.mode ?? maskMode) === mode}
            onPress={() => {
              onMode(mode);
              patch({ mode });
            }}
          >
            {mode === 'pixelate' ? '马赛克' : '纯色遮挡'}
          </Button>
        ))}
      </div>
      {(selected?.mode ?? maskMode) === 'pixelate' ? (
        <RangeField
          label="颗粒大小"
          value={selected?.strength ?? strength}
          min={1}
          max={80}
          onChange={(next) => {
            onStrength(next);
            patch({ strength: next });
          }}
        />
      ) : (
        <ColorControl
          value={selected?.color ?? color}
          onChange={(next) => {
            onColor(next);
            patch({ color: next });
          }}
        />
      )}
      <Button
        variant="outline"
        className="min-h-11 rounded-lg"
        onPress={onDraw}
      >
        <Plus size={16} />
        添加打码区域
      </Button>
      {recipe.regions.length > 0 && (
        <div className="grid gap-2 border-t border-border pt-4">
          <h3 className="mb-1 text-xs text-muted">
            已添加 {recipe.regions.length} 处
          </h3>
          {recipe.regions.map((region, index) => (
            <div
              key={region.id}
              className={`flex items-center gap-1 rounded-lg border ${region.id === selectedId ? 'border-foreground bg-default/40' : 'border-border'}`}
            >
              <Button
                variant="ghost"
                className="min-h-11 min-w-0 flex-1 justify-start px-3 text-xs"
                aria-pressed={region.id === selectedId}
                onPress={() => onSelect(region.id)}
              >
                区域 {index + 1}
                <span className="ml-auto text-muted">
                  {region.mode === 'solid' ? '纯色' : '马赛克'}
                </span>
              </Button>
              <Button
                isIconOnly
                variant="ghost"
                className="size-11 shrink-0"
                aria-label={`删除区域 ${index + 1}`}
                onPress={() => {
                  onChange({
                    ...recipe,
                    regions: recipe.regions.filter(
                      (value) => value.id !== region.id,
                    ),
                  });
                  if (selectedId === region.id) onSelect(null);
                }}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}
      {selected && (
        <div className="grid gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted">选区位置与大小（%）</p>
          <div className="grid grid-cols-2 gap-3">
            <Numeric
              label="左侧位置"
              value={selected.x * 100}
              onChange={(value) => patch({ x: value / 100 })}
            />
            <Numeric
              label="顶部位置"
              value={selected.y * 100}
              onChange={(value) => patch({ y: value / 100 })}
            />
            <Numeric
              label="宽度"
              value={selected.width * 100}
              min={0.5}
              onChange={(value) => patch({ width: value / 100 })}
            />
            <Numeric
              label="高度"
              value={selected.height * 100}
              min={0.5}
              onChange={(value) => patch({ height: value / 100 })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
export function WatermarkControls({
  recipe,
  onChange,
  onAssetBusy,
  onExpire,
}: {
  recipe: Recipe;
  onChange: (recipe: Recipe) => void;
  onAssetBusy: (busy: boolean) => void;
  onExpire: () => void;
}) {
  const mark = recipe.watermark;
  const validation = imageEditWatermarkSchema.safeParse(mark);
  const textError = validation.success
    ? undefined
    : validation.error.issues.find((issue) => issue.path[0] === 'text')
        ?.message;
  function patch(values: Partial<Watermark>) {
    onChange({ ...recipe, watermark: { ...mark, enabled: true, ...values } });
  }
  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">自定义水印</h2>
        <Switch
          aria-label="启用水印"
          isSelected={mark.enabled}
          onChange={(enabled) => patch({ enabled })}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </div>
      <div className={mark.enabled ? 'grid gap-5' : 'grid gap-5 opacity-70'}>
        <div
          role="group"
          aria-label="水印类型"
          className="grid grid-cols-2 gap-2"
        >
          {(['text', 'image'] as const).map((kind) => (
            <Button
              key={kind}
              variant={mark.kind === kind ? 'secondary' : 'outline'}
              aria-pressed={mark.kind === kind}
              className="min-h-11 rounded-lg text-sm"
              onPress={() => patch({ kind })}
            >
              {kind === 'text' ? '文字水印' : 'Logo 水印'}
            </Button>
          ))}
        </div>
        {mark.kind === 'text' ? (
          <>
            <TextField
              value={mark.text}
              isRequired
              isInvalid={Boolean(textError)}
              onChange={(text) => patch({ text })}
            >
              <Label className="text-xs">水印文字</Label>
              <TextArea
                rows={3}
                maxLength={400}
                className="min-h-22"
                placeholder="例如：© Ariso"
              />
              <FieldError>{textError}</FieldError>
            </TextField>
            <div className="grid gap-2">
              <Label className="text-xs">字体</Label>
              <div
                role="group"
                aria-label="水印字体"
                className="grid grid-cols-2 gap-2"
              >
                {(['chinese', 'latin'] as const).map((font) => (
                  <Button
                    key={font}
                    aria-pressed={mark.font === font}
                    variant={mark.font === font ? 'secondary' : 'outline'}
                    className="min-h-11 rounded-lg text-xs"
                    onPress={() => patch({ font })}
                  >
                    {font === 'chinese' ? '中文' : '英文'}
                  </Button>
                ))}
              </div>
            </div>
            <ColorControl
              value={mark.color}
              onChange={(color) => patch({ color })}
            />
            <RangeField
              label="相对字号"
              value={mark.fontSize * 100}
              min={1}
              max={20}
              step={0.5}
              suffix="%"
              onChange={(fontSize) => patch({ fontSize: fontSize / 100 })}
            />
          </>
        ) : (
          <div className="grid gap-3">
            <WatermarkAssetField
              id={mark.assetId}
              disabled={false}
              onChange={(assetId) => patch({ assetId })}
              onBusy={onAssetBusy}
              onExpire={onExpire}
            />
            <RangeField
              label="Logo 宽度"
              value={mark.width * 100}
              min={1}
              max={100}
              suffix="%"
              onChange={(width) => patch({ width: width / 100 })}
            />
          </div>
        )}
        <RangeField
          label="不透明度"
          value={mark.opacity * 100}
          min={0}
          max={100}
          suffix="%"
          onChange={(opacity) => patch({ opacity: opacity / 100 })}
        />
        <RangeField
          label="旋转角度"
          value={mark.rotation}
          min={-180}
          max={180}
          suffix="°"
          onChange={(rotation) => patch({ rotation })}
        />
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Label className="text-xs">全图平铺</Label>
          <Switch
            aria-label="全图平铺"
            isSelected={mark.tiled}
            onChange={(tiled) => patch({ tiled })}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>
        {!mark.tiled && (
          <>
            <div className="grid gap-2">
              <Label className="text-xs">快捷定位</Label>
              <div
                role="group"
                aria-label="水印位置"
                className="grid grid-cols-3 gap-2"
              >
                {[
                  '左上',
                  '上中',
                  '右上',
                  '左中',
                  '居中',
                  '右中',
                  '左下',
                  '下中',
                  '右下',
                ].map((label, index) => {
                  const x = [0.17, 0.5, 0.83][index % 3];
                  const y = [0.12, 0.5, 0.88][Math.floor(index / 3)];
                  const active =
                    Math.abs(mark.x - x) < 0.03 && Math.abs(mark.y - y) < 0.03;
                  return (
                    <Button
                      key={label}
                      variant={active ? 'secondary' : 'outline'}
                      aria-pressed={active}
                      className="min-h-11 w-full min-w-11 rounded-lg px-1 text-xs"
                      onPress={() => patch({ x, y })}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Numeric
                label="水平位置（%）"
                value={mark.x * 100}
                onChange={(x) => patch({ x: x / 100 })}
              />
              <Numeric
                label="垂直位置（%）"
                value={mark.y * 100}
                onChange={(y) => patch({ y: y / 100 })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
