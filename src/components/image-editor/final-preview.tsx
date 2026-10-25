'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button, Modal, Spinner } from '@heroui/react';
import type { ImageEditRecipe } from '../../shared/image-editing';
import { ImageEditorRequestError, requestFinalPreview } from './client';
import type { EditorImage, SaveMode } from './types';

export function FinalPreview({
  image,
  recipe,
  mode,
  onClose,
  onExpire,
}: {
  image: EditorImage;
  recipe: ImageEditRecipe;
  mode: SaveMode;
  onClose: () => void;
  onExpire: () => void;
}) {
  const [target, setTarget] = useState<'original' | 'watermark'>('original');
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<{
    url: string;
    recipe: ImageEditRecipe;
    mode: SaveMode;
    target: string;
    round: number;
  } | null>(null);
  const [failure, setFailure] = useState<{
    message: string;
    recipe: ImageEditRecipe;
    mode: SaveMode;
    target: string;
    round: number;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    void requestFinalPreview(image, recipe, mode, target, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setResult({ url, recipe, mode, target, round });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ImageEditorRequestError && error.status === 401)
          onExpire();
        setFailure({
          message: error instanceof Error ? error.message : String(error),
          recipe,
          mode,
          target,
          round,
        });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [image, recipe, mode, target, round, onExpire]);
  const current =
    result?.recipe === recipe &&
    result.mode === mode &&
    result.target === target &&
    result.round === round
      ? result
      : null;
  const error =
    failure?.recipe === recipe &&
    failure.mode === mode &&
    failure.target === target &&
    failure.round === round
      ? failure.message
      : null;
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container size="lg" placement="center">
        <Modal.Dialog
          data-testid="image-editor-final-preview"
          aria-label="服务器最终效果"
          className="max-h-[calc(100dvh-32px)] rounded-2xl p-5 [&_.button--secondary]:text-foreground [&_.button--secondary]:rounded-lg [&_.button--primary]:rounded-lg"
        >
          <Modal.Header>
            <Modal.Heading>最终效果</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="grid min-h-0 gap-4 overflow-auto px-0">
            <div role="group" aria-label="最终预览版本" className="flex gap-2">
              <Button
                variant={target === 'original' ? 'secondary' : 'outline'}
                aria-pressed={target === 'original'}
                className="min-h-11 rounded-lg text-xs"
                onPress={() => setTarget('original')}
              >
                编辑后原图
              </Button>
              <Button
                variant={target === 'watermark' ? 'secondary' : 'outline'}
                aria-pressed={target === 'watermark'}
                isDisabled={!image.watermarkPreview[mode]}
                className="min-h-11 rounded-lg text-xs"
                onPress={() => setTarget('watermark')}
              >
                水印版本
              </Button>
            </div>
            {current ? (
              <Image
                src={current.url}
                alt={
                  target === 'watermark'
                    ? '服务器生成的水印版本最终效果'
                    : '服务器生成的编辑后原图'
                }
                width={image.width}
                height={image.height}
                unoptimized
                className="max-h-[60dvh] w-full object-contain"
              />
            ) : error ? (
              <div
                className="grid justify-items-start gap-3 text-sm"
                role="alert"
              >
                <p>{error}</p>
                <Button
                  variant="outline"
                  className="min-h-11"
                  onPress={() => setRound((value) => value + 1)}
                >
                  重新生成预览
                </Button>
              </div>
            ) : (
              <div className="grid min-h-56 place-items-center">
                <Spinner aria-label="服务器正在生成最终效果" />
              </div>
            )}
            <p className="text-xs text-muted">
              {image.watermarkPreview[mode]
                ? '水印版本会在本次编辑结果上继续叠加站点水印。'
                : '当前保存方式不生成水印版本。'}{' '}
              正式保存始终处理完整原图，不采用浏览器截图。
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="secondary" className="min-h-11">
              返回编辑
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
