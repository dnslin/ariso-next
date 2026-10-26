'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { Button, Dropdown, Label, Spinner } from '@heroui/react';
import {
  ArrowUp,
  Bookmark,
  Check,
  ChevronRight,
  Eye,
  MousePointer2,
  Redo2,
  ScanLine,
  SlidersHorizontal,
  Stamp,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { MaskControls, WatermarkControls } from './editor-controls';
import {
  copyImageEditRecipe as copyRecipe,
  hasImageEdits as hasEdits,
  imageEditRecipeSchema,
  type ImageEditRegion as Region,
} from '../../shared/image-editing';
import { recipeSummary } from './types';
import TemplateDialog from './template-dialog';
import { useImageEditor } from './state';
import { editJobActive } from './session';
import { FinalPreview } from './final-preview';

const Canvas = dynamic(() => import('./editor-canvas'), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-64 place-items-center">
      <Spinner aria-label="载入图片编辑器" />
    </div>
  ),
});

export function Editor() {
  const editor = useImageEditor();
  const image =
    editor.images.find((value) => value.id === editor.currentId) ??
    editor.images[0];
  const recipe = editor.recipeFor(image.id);
  const [panel, setPanel] = useState<'mask' | 'watermark'>(
    recipe.regions.length || !recipe.watermark.enabled ? 'mask' : 'watermark',
  );
  const [tool, setTool] = useState<'select' | 'redact'>(
    hasEdits(recipe) ? 'select' : 'redact',
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [maskMode, setMaskMode] = useState<Region['mode']>('pixelate');
  const [strength, setStrength] = useState(20);
  const [color, setColor] = useState('#272343');
  const [compare, setCompare] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showTemplate, setShowTemplate] = useState(false);
  const [assetBusy, setAssetBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const tracked = editor.snapshots;
  const saving =
    editor.submittingBatch ||
    tracked.some(
      (state, index) =>
        (editor.batchMode
          ? editor.selectedIds.includes(
              editor.sessions[index].reference.sourceImageId,
            )
          : editor.sessions[index].reference.sourceImageId === image.id) &&
        (state.phase === 'unknown' ||
          state.phase === 'submitting' ||
          editJobActive(state.job)),
    );
  const canvasRef = useRef<HTMLDivElement>(null);
  const parametersRef = useRef<HTMLElement>(null);
  const history = editor.history[image.id];
  const edited = hasEdits(recipe);
  const invalidText = !imageEditRecipeSchema.safeParse(recipe).success;
  const batchImages = editor.images.filter((value) =>
    editor.selectedIds.includes(value.id),
  );
  const invalidBatchImages = batchImages.filter((item) => {
    const candidate = editor.recipeFor(item.id);
    return (
      !hasEdits(candidate) ||
      !imageEditRecipeSchema.safeParse(candidate).success
    );
  });
  const index = batchImages.findIndex((value) => value.id === image.id);
  const pending = editor.selectedIds.filter(
    (id) =>
      editor.recipeFor(id).regions.length && !editor.reviewedIds.includes(id),
  );
  const change = (next: typeof recipe) => editor.changeRecipe(image.id, next);
  const selectRegion = (id: string | null) => {
    setSelectedId(id);
    if (id) setTool('select');
  };
  const navigateImage = (id: string) => {
    editor.setCurrentId(id);
    setSelectedId(null);
    setZoom(1);
    setCompare(false);
  };
  return (
    <section data-editor className="flex h-full min-h-[560px] min-w-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0">
            <h1 className="text-base font-semibold sm:text-lg">
              {editor.batchMode ? '批量编辑' : '编辑图片'}
            </h1>
            <p className="truncate text-xs text-muted">{image.name}</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="min-h-11 shrink-0 rounded-lg px-3 text-xs"
          isDisabled={!edited || assetBusy || invalidText}
          onPress={() => setShowTemplate(true)}
        >
          <Bookmark size={16} />
          <span className="hidden sm:inline">保存为</span>模板
        </Button>
      </header>
      {editor.batchMode && (
        <div
          className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-default/15 px-4 py-2 lg:px-6"
          aria-label="批量图片"
        >
          <span className="mr-1 shrink-0 text-xs text-muted">逐张预览</span>
          {batchImages.map((item, position) => (
            <Button
              key={item.id}
              variant={item.id === image.id ? 'secondary' : 'outline'}
              className="h-12 shrink-0 gap-2 rounded-lg px-2 text-xs"
              aria-label={`预览第 ${position + 1} 张：${item.name}`}
              aria-pressed={item.id === image.id}
              onPress={() => navigateImage(item.id)}
            >
              <Image
                src={item.src}
                unoptimized
                alt=""
                width={38}
                height={30}
                className="h-8 w-10 rounded object-cover"
              />
              <span>{position + 1}</span>
              {editor.reviewedIds.includes(item.id) && <Check size={14} />}
            </Button>
          ))}
          <span className="ml-auto shrink-0 pl-2 text-xs text-muted">
            {
              editor.reviewedIds.filter((id) => editor.selectedIds.includes(id))
                .length
            }{' '}
            / {batchImages.length} 已检查
          </span>
        </div>
      )}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 lg:px-6">
        <div
          className="flex flex-wrap items-center gap-1"
          role="toolbar"
          aria-label="图片编辑工具"
        >
          <Button
            size="sm"
            variant={
              tool === 'select' && panel === 'mask' ? 'secondary' : 'ghost'
            }
            className="min-h-11 rounded-lg px-3 text-xs"
            aria-pressed={tool === 'select'}
            onPress={() => {
              setTool('select');
              setPanel('mask');
            }}
          >
            <MousePointer2 size={16} />
            选择
          </Button>
          <Button
            size="sm"
            variant={
              panel === 'mask' && tool === 'redact' ? 'secondary' : 'ghost'
            }
            className="min-h-11 rounded-lg px-3 text-xs"
            aria-pressed={panel === 'mask' && tool === 'redact'}
            onPress={() => {
              setPanel('mask');
              setTool('redact');
              setSelectedId(null);
            }}
          >
            <ScanLine size={16} />
            打码
          </Button>
          <Button
            size="sm"
            variant={panel === 'watermark' ? 'secondary' : 'ghost'}
            className="min-h-11 rounded-lg px-3 text-xs"
            aria-pressed={panel === 'watermark'}
            onPress={() => {
              setPanel('watermark');
              setTool('select');
              setSelectedId(null);
              if (!recipe.watermark.enabled)
                change({
                  ...recipe,
                  watermark: {
                    ...recipe.watermark,
                    enabled: true,
                    color: '#272343',
                  },
                });
            }}
          >
            <Stamp size={16} />
            水印
          </Button>
          <span className="mx-1 h-5 border-l border-border" />
          <Dropdown>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 rounded-lg px-3 text-xs"
            >
              <Bookmark size={16} />
              套用模板
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                aria-label="选择编辑模板"
                onAction={(key) => {
                  const template = editor.templates.find(
                    (value) => value.id === key,
                  );
                  if (!template) return;
                  change(copyRecipe(template.recipe));
                  setSelectedId(null);
                  setPanel(
                    template.recipe.regions.length ? 'mask' : 'watermark',
                  );
                  setTool('select');
                }}
              >
                {editor.templates.map((template) => (
                  <Dropdown.Item
                    key={template.id}
                    id={template.id}
                    textValue={template.name}
                  >
                    <Label>{template.name}</Label>
                    <span className="text-xs text-muted">
                      {recipeSummary(template.recipe)}
                    </span>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            isIconOnly
            className="size-11"
            aria-label="撤销"
            isDisabled={!history?.past.length}
            onPress={() => {
              editor.travel(image.id, 'undo');
              setSelectedId(null);
            }}
          >
            <Undo2 size={17} />
          </Button>
          <Button
            variant="ghost"
            isIconOnly
            className="size-11"
            aria-label="重做"
            isDisabled={!history?.future.length}
            onPress={() => {
              editor.travel(image.id, 'redo');
              setSelectedId(null);
            }}
          >
            <Redo2 size={17} />
          </Button>
          <Button
            variant="outline"
            className="min-h-11 rounded-lg px-3 text-xs"
            isDisabled={!edited || invalidText || assetBusy}
            onPress={() => setPreviewOpen(true)}
          >
            最终效果
          </Button>
          <Button
            variant={compare ? 'secondary' : 'ghost'}
            className="min-h-11 rounded-lg px-3 text-xs"
            aria-pressed={compare}
            onPress={() => setCompare((current) => !current)}
          >
            <Eye size={16} />
            {compare ? '显示编辑后' : '查看原图'}
          </Button>
          <Button
            variant="ghost"
            className="min-h-11 rounded-lg px-3 text-xs lg:hidden"
            onPress={() =>
              parametersRef.current?.scrollIntoView({ block: 'start' })
            }
          >
            <SlidersHorizontal size={16} />
            参数
          </Button>
        </div>
      </div>
      <div
        data-testid="image-editor-scroll-body"
        className="min-h-0 min-w-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:overflow-hidden"
      >
        <div
          ref={canvasRef}
          className="bg-default/25 flex min-h-[300px] min-w-0 flex-col p-4 [background-image:repeating-conic-gradient(color-mix(in_srgb,var(--foreground)_4%,transparent)_0%_25%,transparent_0%_50%)] [background-size:20px_20px] lg:min-h-0 lg:p-6"
        >
          <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted">
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-current" />
              {compare
                ? '正在查看编辑前的图片'
                : tool === 'redact'
                  ? '拖动框选需要遮挡的位置'
                  : panel === 'watermark'
                    ? '拖动水印调整位置'
                    : '点击区域，拖动或调整大小'}
            </span>
            <span className="hidden shrink-0 sm:inline">
              {image.width} × {image.height}
            </span>
          </div>
          <div className="flex h-[min(45dvh,320px)] min-h-0 flex-none items-center justify-center overflow-auto rounded-xl border border-border/60 bg-surface/40 p-2 lg:h-auto lg:flex-1 lg:p-5">
            <Canvas
              key={image.id}
              image={image}
              recipe={recipe}
              onChange={change}
              selectedRegionId={selectedId}
              onSelectRegion={selectRegion}
              tool={panel === 'watermark' ? 'select' : tool}
              maskMode={maskMode}
              maskStrength={strength}
              maskColor={color}
              compare={compare}
              zoom={zoom}
              onNaturalSize={(width, height) =>
                editor.naturalSize(image.id, width, height)
              }
            />
          </div>
          <div className="mt-3 flex min-h-11 items-center justify-between gap-2">
            <span className="text-xs text-muted">{recipeSummary(recipe)}</span>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-1">
              <Button
                isIconOnly
                variant="ghost"
                className="size-11"
                aria-label="缩小图片"
                isDisabled={zoom <= 0.5}
                onPress={() => setZoom((value) => Math.max(0.5, value - 0.25))}
              >
                <ZoomOut size={15} />
              </Button>
              <Button
                variant="ghost"
                className="h-11 min-w-16 px-2 text-xs"
                aria-label="适应窗口"
                onPress={() => setZoom(1)}
              >
                {zoom === 1 ? '适应' : `${Math.round(zoom * 100)}%`}
              </Button>
              <Button
                isIconOnly
                variant="ghost"
                className="size-11"
                aria-label="放大图片"
                isDisabled={zoom >= 2}
                onPress={() => setZoom((value) => Math.min(2, value + 0.25))}
              >
                <ZoomIn size={15} />
              </Button>
            </div>
          </div>
        </div>
        <aside
          ref={parametersRef}
          className="border-t border-border bg-surface p-5 lg:overflow-y-auto lg:border-t-0 lg:border-l"
          aria-label="编辑参数"
        >
          <Button
            variant="ghost"
            className="mb-4 min-h-11 rounded-lg px-2 text-xs lg:hidden"
            onPress={() =>
              canvasRef.current?.scrollIntoView({ block: 'start' })
            }
          >
            <ArrowUp size={15} />
            返回画布
          </Button>
          {panel === 'mask' ? (
            <MaskControls
              recipe={recipe}
              onChange={change}
              selectedId={selectedId}
              onSelect={selectRegion}
              maskMode={maskMode}
              onMode={setMaskMode}
              strength={strength}
              onStrength={setStrength}
              color={color}
              onColor={setColor}
              onDraw={() => {
                const previous = recipe.regions.find(
                  (region) => region.id === selectedId,
                );
                const id = crypto.randomUUID();
                change({
                  ...recipe,
                  regions: [
                    ...recipe.regions,
                    {
                      id,
                      x: 0.35,
                      y: 0.45,
                      width: 0.3,
                      height: 0.1,
                      mode: previous?.mode ?? maskMode,
                      strength: previous?.strength ?? strength,
                      color: previous?.color ?? color,
                    },
                  ],
                });
                setTool('select');
                setSelectedId(id);
              }}
            />
          ) : (
            <WatermarkControls
              recipe={recipe}
              onChange={change}
              onAssetBusy={setAssetBusy}
              onExpire={editor.expire}
            />
          )}
        </aside>
      </div>
      <footer className="shrink-0 border-t border-border bg-surface px-4 pt-3 pb-4 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-muted">保存方式</span>
            {(['copy', 'overwrite'] as const).map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant={editor.saveMode === mode ? 'secondary' : 'outline'}
                className="min-h-11 rounded-lg px-3 text-xs"
                aria-pressed={editor.saveMode === mode}
                onPress={() => editor.setSaveMode(mode)}
              >
                {editor.saveMode === mode && <Check size={14} />}
                {mode === 'copy' ? '另存为新图' : '覆盖原图'}
              </Button>
            ))}
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            {editor.batchMode && (
              <Button
                variant="outline"
                className="min-h-11 flex-1 rounded-lg px-3 text-xs sm:flex-none"
                onPress={() => {
                  editor.setReviewedIds((ids) =>
                    ids.includes(image.id) ? ids : [...ids, image.id],
                  );
                  if (index < batchImages.length - 1)
                    navigateImage(batchImages[index + 1].id);
                }}
              >
                {index < batchImages.length - 1
                  ? '确认并下一张'
                  : editor.reviewedIds.includes(image.id)
                    ? '已确认这张'
                    : '确认这张'}
                <Check size={15} />
              </Button>
            )}
            <Button
              variant="primary"
              className="min-h-11 flex-1 rounded-lg px-5 text-sm sm:flex-none"
              isDisabled={
                saving ||
                assetBusy ||
                !edited ||
                invalidText ||
                (editor.batchMode &&
                  (pending.length > 0 || invalidBatchImages.length > 0))
              }
              onPress={() => {
                void editor.saveImages(
                  editor.batchMode ? editor.selectedIds : [image.id],
                );
              }}
            >
              {editor.batchMode
                ? `保存 ${batchImages.length} 张图片`
                : editor.saveMode === 'copy'
                  ? '另存为新图'
                  : '保存并覆盖'}
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
        <p role="status" className="mt-2 text-xs text-muted">
          {editor.batchMode && invalidBatchImages.length
            ? `请先完成“${invalidBatchImages[0].name}”的编辑，并填写有效的水印文字。`
            : editor.batchMode && pending.length
              ? `还有 ${pending.length} 张含打码图片需要检查，确认遮挡位置后才能批量保存。`
              : editor.saveMode === 'copy'
                ? '原图及原链接会保留，新图使用独立链接。'
                : '已有链接将显示编辑后的内容，不提供历史回滚。'}
        </p>
      </footer>
      {previewOpen && (
        <FinalPreview
          image={image}
          recipe={recipe}
          mode={editor.saveMode}
          onClose={() => setPreviewOpen(false)}
          onExpire={editor.expire}
        />
      )}
      {showTemplate && (
        <TemplateDialog
          recipe={recipe}
          onClose={() => setShowTemplate(false)}
          busy={editor.templateBusy}
          failure={editor.templateError}
          onSave={(name, regions, watermark) => {
            void editor
              .addTemplate(name, recipe, regions, watermark)
              .then((saved) => {
                if (saved) setShowTemplate(false);
              });
          }}
        />
      )}
    </section>
  );
}
