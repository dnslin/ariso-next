'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Button, Dropdown, Label, Modal, Spinner } from '@heroui/react';
import {
  ArrowLeft,
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
import { copyRecipe, hasEdits, type Region } from './model';
import { recipeSummary } from './data';
import TemplateDialog from './template-dialog';
import { useDemo } from './store';

const Canvas = dynamic(() => import('./editor-canvas'), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-64 place-items-center">
      <Spinner aria-label="载入图片编辑器" />
    </div>
  ),
});

export function Editor() {
  const demo = useDemo();
  const router = useRouter();
  const image =
    demo.images.find((value) => value.id === demo.currentId) ?? demo.images[0];
  const recipe = demo.recipeFor(image.id);
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
  const [leaving, setLeaving] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const parametersRef = useRef<HTMLElement>(null);
  const history = demo.history[image.id];
  const edited = hasEdits(recipe);
  const invalidText =
    recipe.watermark.enabled &&
    recipe.watermark.kind === 'text' &&
    !recipe.watermark.text.trim();
  const batchImages = demo.images.filter((value) =>
    demo.selectedIds.includes(value.id),
  );
  const invalidBatchImages = batchImages.filter((item) => {
    const candidate = demo.recipeFor(item.id);
    return (
      !hasEdits(candidate) ||
      (candidate.watermark.enabled &&
        candidate.watermark.kind === 'text' &&
        !candidate.watermark.text.trim())
    );
  });
  const index = batchImages.findIndex((value) => value.id === image.id);
  const pending = demo.selectedIds.filter(
    (id) => demo.recipeFor(id).regions.length && !demo.reviewedIds.includes(id),
  );
  const change = (next: typeof recipe) => demo.changeRecipe(image.id, next);
  const selectRegion = (id: string | null) => {
    setSelectedId(id);
    if (id) setTool('select');
  };
  const navigateImage = (id: string) => {
    demo.setCurrentId(id);
    setSelectedId(null);
    setZoom(1);
    setCompare(false);
  };
  useEffect(() => {
    if (!edited) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [edited]);
  return (
    <section data-editor className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            isIconOnly
            className="size-11 shrink-0"
            aria-label="返回图库"
            onPress={() =>
              edited ? setLeaving(true) : router.push('/library')
            }
          >
            <ArrowLeft size={19} />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base font-semibold sm:text-lg">
              {demo.batchMode ? '批量编辑' : '编辑图片'}
            </h1>
            <p className="truncate text-xs text-muted">{image.name}</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="min-h-11 shrink-0 rounded-lg px-3 text-xs"
          isDisabled={!edited}
          onPress={() => setShowTemplate(true)}
        >
          <Bookmark size={16} />
          <span className="hidden sm:inline">保存为</span>模板
        </Button>
      </header>
      {demo.batchMode && (
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
              {demo.reviewedIds.includes(item.id) && <Check size={14} />}
            </Button>
          ))}
          <span className="ml-auto shrink-0 pl-2 text-xs text-muted">
            {
              demo.reviewedIds.filter((id) => demo.selectedIds.includes(id))
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
                    color:
                      image.category === 'screenshot' ? '#272343' : '#ffffff',
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
                  const template = demo.templates.find(
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
                {demo.templates.map((template) => (
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
              demo.travel(image.id, 'undo');
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
              demo.travel(image.id, 'redo');
              setSelectedId(null);
            }}
          >
            <Redo2 size={17} />
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
      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:overflow-hidden">
        <div
          ref={canvasRef}
          className="editor-checker flex min-h-[300px] min-w-0 flex-col p-4 lg:min-h-0 lg:p-6"
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
            />
          </div>
          <div className="mt-3 flex min-h-11 items-center justify-between gap-2">
            <span className="text-xs text-muted">{recipeSummary(recipe)}</span>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-1">
              <Button
                isIconOnly
                variant="ghost"
                className="size-10"
                aria-label="缩小图片"
                isDisabled={zoom <= 0.5}
                onPress={() => setZoom((value) => Math.max(0.5, value - 0.25))}
              >
                <ZoomOut size={15} />
              </Button>
              <Button
                variant="ghost"
                className="h-10 min-w-16 px-2 text-xs"
                aria-label="适应窗口"
                onPress={() => setZoom(1)}
              >
                {zoom === 1 ? '适应' : `${Math.round(zoom * 100)}%`}
              </Button>
              <Button
                isIconOnly
                variant="ghost"
                className="size-10"
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
                setTool('redact');
                setSelectedId(null);
              }}
            />
          ) : (
            <WatermarkControls recipe={recipe} onChange={change} />
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
                variant={demo.saveMode === mode ? 'secondary' : 'outline'}
                className="min-h-11 rounded-lg px-3 text-xs"
                aria-pressed={demo.saveMode === mode}
                onPress={() => demo.setSaveMode(mode)}
              >
                {demo.saveMode === mode && <Check size={14} />}
                {mode === 'copy' ? '另存为新图' : '覆盖原图'}
              </Button>
            ))}
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            {demo.batchMode && (
              <Button
                variant="outline"
                className="min-h-11 flex-1 rounded-lg px-3 text-xs sm:flex-none"
                onPress={() => {
                  demo.setReviewedIds((ids) =>
                    ids.includes(image.id) ? ids : [...ids, image.id],
                  );
                  if (index < batchImages.length - 1)
                    navigateImage(batchImages[index + 1].id);
                }}
              >
                {index < batchImages.length - 1
                  ? '确认并下一张'
                  : demo.reviewedIds.includes(image.id)
                    ? '已确认这张'
                    : '确认这张'}
                <Check size={15} />
              </Button>
            )}
            <Button
              variant="primary"
              className="min-h-11 flex-1 rounded-lg px-5 text-sm sm:flex-none"
              isDisabled={
                demo.saving ||
                !edited ||
                invalidText ||
                (demo.batchMode &&
                  (pending.length > 0 || invalidBatchImages.length > 0))
              }
              onPress={() => {
                void demo.saveImages(
                  demo.batchMode ? demo.selectedIds : [image.id],
                );
              }}
            >
              {demo.batchMode
                ? `保存 ${batchImages.length} 张图片`
                : demo.saveMode === 'copy'
                  ? '另存为新图'
                  : '保存并覆盖'}
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
        <p role="status" className="mt-2 text-xs text-muted">
          {demo.batchMode && invalidBatchImages.length
            ? `请先完成“${invalidBatchImages[0].name}”的编辑，并填写有效的水印文字。`
            : demo.batchMode && pending.length
              ? `还有 ${pending.length} 张含打码图片需要检查，确认遮挡位置后才能批量保存。`
              : demo.saveMode === 'copy'
                ? '原图及原链接会保留，新图使用独立链接。'
                : '已有链接将显示编辑后的内容，不提供历史回滚。'}
          <span className="hidden lg:inline"> · 保存结果仅用于本页演示</span>
        </p>
      </footer>
      {showTemplate && (
        <TemplateDialog
          recipe={recipe}
          onClose={() => setShowTemplate(false)}
          onSave={(name, regions, watermark) => {
            demo.addTemplate(name, recipe, regions, watermark);
            setShowTemplate(false);
          }}
        />
      )}
      {leaving && (
        <Modal.Backdrop
          isOpen
          onOpenChange={(open) => {
            if (!open) setLeaving(false);
          }}
        >
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog aria-label="离开编辑器" className="rounded-2xl p-6">
              <Modal.Header>
                <Modal.Heading>保留本次编辑？</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="px-0 py-4 text-sm leading-6">
                编辑草稿会保留在本次演示中。返回图库不会保存或覆盖图片。
              </Modal.Body>
              <Modal.Footer className="gap-3 p-0">
                <Button variant="secondary" slot="close" className="min-h-11">
                  继续编辑
                </Button>
                <Button
                  variant="primary"
                  className="min-h-11"
                  onPress={() => router.push('/library')}
                >
                  返回图库
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      )}
    </section>
  );
}
