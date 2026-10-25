'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@heroui/react';
import {
  Image as KonvaImage,
  Layer,
  Rect,
  Stage,
  Transformer,
} from 'react-konva';
import type Konva from 'konva';
import {
  copyRecipe,
  normalizeRegion,
  type DemoImage,
  type Recipe,
  type Region,
} from './model';
import { loadImage, renderEditedImage } from './raster';

type Props = {
  image: DemoImage;
  recipe: Recipe;
  onChange?: (recipe: Recipe) => void;
  selectedRegionId?: string | null;
  onSelectRegion?: (id: string | null) => void;
  tool?: 'select' | 'redact';
  maskMode?: 'pixelate' | 'solid';
  maskStrength?: number;
  maskColor?: string;
  compare?: boolean;
  zoom?: number;
  readOnly?: boolean;
};

export default function EditorCanvas({
  image,
  recipe,
  onChange,
  selectedRegionId = null,
  onSelectRegion,
  tool = 'select',
  maskMode = 'pixelate',
  maskStrength = 16,
  maskColor = '#272343',
  compare = false,
  zoom = 1,
  readOnly = false,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const rectangles = useRef(new Map<string, Konva.Rect>());
  const transformer = useRef<Konva.Transformer>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 700, height: 460 });
  const [bitmap, setBitmap] = useState<HTMLImageElement>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState<Region | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const container = readOnly ? element : element.parentElement;
    if (!container) return;
    const resize = () => {
      const style = getComputedStyle(container);
      const horizontalPadding =
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const verticalPadding =
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const next = {
        width: readOnly
          ? element.clientWidth
          : Math.max(1, container.clientWidth - horizontalPadding),
        height: readOnly
          ? 270
          : Math.max(1, container.clientHeight - verticalPadding),
      };
      setSize((previous) => {
        return previous.width === next.width && previous.height === next.height
          ? previous
          : next;
      });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [readOnly]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const src = compare
          ? image.src
          : await renderEditedImage(image, recipe);
        const rendered = await loadImage(src);
        if (active) {
          setBitmap(rendered);
          setError('');
        }
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : '图片预览失败，请重试。',
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [image, recipe, compare, retry]);

  useEffect(() => {
    const selected = selectedRegionId
      ? rectangles.current.get(selectedRegionId)
      : null;
    transformer.current?.nodes(
      selected && !compare && !readOnly && tool === 'select' ? [selected] : [],
    );
    transformer.current?.getLayer()?.batchDraw();
  }, [selectedRegionId, recipe.regions, compare, readOnly, tool, size, zoom]);

  const scale =
    Math.min(
      Math.max(1, size.width - 32) / image.width,
      Math.max(1, size.height - (readOnly ? 0 : 32)) / image.height,
    ) * zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  const interactive = !readOnly && !compare;
  const mark = recipe.watermark;
  const markFontSize = Math.min(width, height) * mark.fontSize;
  const markWidth =
    mark.kind === 'image'
      ? width * mark.width
      : Math.max(
          markFontSize * 2,
          ...mark.text
            .split('\n')
            .map(
              (line) =>
                Array.from(line).reduce(
                  (sum, char) => sum + (/[^\x00-\x7F]/.test(char) ? 1 : 0.6),
                  0,
                ) * markFontSize,
            ),
        );
  const markHeight =
    mark.kind === 'image'
      ? markWidth * 0.4
      : mark.text.split('\n').length * markFontSize * 1.35;

  function updateRegion(id: string, changes: Partial<Region>) {
    onChange?.({
      ...recipe,
      regions: recipe.regions.map((region) =>
        region.id === id ? normalizeRegion({ ...region, ...changes }) : region,
      ),
    });
  }

  function pointer(event: Konva.KonvaEventObject<PointerEvent>) {
    const point = event.target.getStage()?.getPointerPosition();
    return point
      ? {
          x: Math.max(0, Math.min(1, point.x / width)),
          y: Math.max(0, Math.min(1, point.y / height)),
        }
      : null;
  }

  function finishDraft() {
    start.current = null;
    if (draft && draft.width >= 0.008 && draft.height >= 0.008) {
      onChange?.({
        ...recipe,
        regions: [...recipe.regions, normalizeRegion(draft)],
      });
      onSelectRegion?.(draft.id);
    }
    setDraft(null);
  }

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!interactive || event.target !== event.currentTarget) return;
    const selected = recipe.regions.find(
      (region) => region.id === selectedRegionId,
    );
    if (event.key === 'Escape') {
      onSelectRegion?.(null);
      return;
    }
    if (!selected) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onChange?.({
        ...recipe,
        regions: recipe.regions.filter((region) => region.id !== selected.id),
      });
      onSelectRegion?.(null);
    }
    const delta = event.shiftKey ? 0.01 : 0.001;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-delta, 0],
      ArrowRight: [delta, 0],
      ArrowUp: [0, -delta],
      ArrowDown: [0, delta],
    };
    const direction = directions[event.key];
    if (direction) {
      event.preventDefault();
      updateRegion(selected.id, {
        x: selected.x + direction[0],
        y: selected.y + direction[1],
      });
    }
  }

  return (
    <div
      ref={host}
      data-editor-canvas
      className="relative grid w-full min-w-0 place-items-center overflow-auto rounded-xl bg-default/30 p-4"
      style={{
        height: readOnly ? undefined : size.height,
        maxHeight: readOnly ? size.height + 32 : size.height,
        minHeight: readOnly ? Math.min(size.height, 260) : 0,
        touchAction: tool === 'redact' ? 'none' : 'pan-x pan-y',
      }}
      tabIndex={readOnly ? -1 : 0}
      role={readOnly ? 'img' : 'application'}
      aria-label={
        readOnly
          ? `${image.name}效果预览`
          : '图片编辑画布，选中区域后可用方向键移动，Delete 删除'
      }
      onKeyDown={keyboard}
    >
      {error ? (
        <div
          className="grid justify-items-center gap-3 p-6 text-sm"
          role="alert"
        >
          <p>{error}</p>
          <Button
            variant="secondary"
            onPress={() => setRetry((value) => value + 1)}
          >
            重试预览
          </Button>
        </div>
      ) : !bitmap ? (
        <p className="p-8 text-sm text-muted" role="status">
          正在加载图片…
        </p>
      ) : (
        <Stage
          width={width}
          height={height}
          style={{
            flexShrink: 0,
            cursor: interactive && tool === 'redact' ? 'crosshair' : 'default',
            boxShadow: '0 4px 24px #00000014',
          }}
          onPointerDown={(event) => {
            if (!interactive) return;
            if (tool !== 'redact') {
              if (event.target === event.target.getStage())
                onSelectRegion?.(null);
              return;
            }
            const point = pointer(event);
            if (!point) return;
            event.evt.preventDefault();
            (event.evt.target as Element).setPointerCapture?.(
              event.evt.pointerId,
            );
            start.current = point;
            setDraft({
              id: crypto.randomUUID(),
              ...point,
              width: 0,
              height: 0,
              mode: maskMode,
              strength: maskStrength,
              color: maskColor,
            });
          }}
          onPointerMove={(event) => {
            if (!start.current || !interactive) return;
            const point = pointer(event);
            if (!point) return;
            const origin = start.current;
            setDraft((current) =>
              current
                ? {
                    ...current,
                    x: Math.min(origin.x, point.x),
                    y: Math.min(origin.y, point.y),
                    width: Math.abs(point.x - origin.x),
                    height: Math.abs(point.y - origin.y),
                  }
                : null,
            );
          }}
          onPointerUp={finishDraft}
          onPointerCancel={() => {
            start.current = null;
            setDraft(null);
          }}
        >
          <Layer>
            <KonvaImage
              image={bitmap}
              width={width}
              height={height}
              listening={false}
            />
            {interactive &&
              recipe.regions.map((region, index) => (
                <Rect
                  key={region.id}
                  ref={(node) => {
                    if (node) rectangles.current.set(region.id, node);
                    else rectangles.current.delete(region.id);
                  }}
                  id={`region-${index + 1}`}
                  x={region.x * width}
                  y={region.y * height}
                  width={region.width * width}
                  height={region.height * height}
                  fill="#00000000"
                  stroke={
                    selectedRegionId === region.id ? '#c29c00' : '#ffffff'
                  }
                  strokeWidth={selectedRegionId === region.id ? 2 : 1}
                  dash={selectedRegionId === region.id ? undefined : [5, 4]}
                  listening={tool === 'select'}
                  draggable={tool === 'select'}
                  onClick={() => onSelectRegion?.(region.id)}
                  onTap={() => onSelectRegion?.(region.id)}
                  onDragStart={() => onSelectRegion?.(region.id)}
                  onDragEnd={(event) =>
                    updateRegion(region.id, {
                      x: event.target.x() / width,
                      y: event.target.y() / height,
                    })
                  }
                  onTransformEnd={(event) => {
                    const node = event.target;
                    const changes = {
                      x: node.x() / width,
                      y: node.y() / height,
                      width: (node.width() * node.scaleX()) / width,
                      height: (node.height() * node.scaleY()) / height,
                    };
                    node.scaleX(1);
                    node.scaleY(1);
                    updateRegion(region.id, changes);
                  }}
                />
              ))}
            {interactive &&
              mark.enabled &&
              !mark.tiled &&
              tool === 'select' && (
                <Rect
                  x={mark.x * width}
                  y={mark.y * height}
                  offsetX={markWidth / 2}
                  offsetY={markHeight / 2}
                  width={markWidth}
                  height={markHeight}
                  rotation={mark.rotation}
                  fill="#00000000"
                  stroke="#c29c00"
                  strokeWidth={1}
                  dash={[4, 4]}
                  draggable
                  onDragEnd={(event) => {
                    const next = copyRecipe(recipe);
                    next.watermark.x = Math.max(
                      0,
                      Math.min(1, event.target.x() / width),
                    );
                    next.watermark.y = Math.max(
                      0,
                      Math.min(1, event.target.y() / height),
                    );
                    onChange?.(next);
                  }}
                />
              )}
            {draft && (
              <Rect
                x={draft.x * width}
                y={draft.y * height}
                width={draft.width * width}
                height={draft.height * height}
                fill="#ffd80733"
                stroke="#b28e00"
                strokeWidth={2}
                dash={[5, 3]}
                listening={false}
              />
            )}
            <Transformer
              ref={transformer}
              rotateEnabled={false}
              flipEnabled={false}
              borderStroke="#b28e00"
              anchorStroke="#b28e00"
              anchorFill="#ffffff"
              anchorSize={12}
              boundBoxFunc={(old, next) =>
                next.width < 6 || next.height < 6 ? old : next
              }
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}
