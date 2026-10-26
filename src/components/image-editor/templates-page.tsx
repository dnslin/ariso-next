'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Button,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  TextField,
} from '@heroui/react';
import {
  ArrowRight,
  Bookmark,
  Pencil,
  Plus,
  ShieldCheck,
  Stamp,
  Trash2,
  X,
} from 'lucide-react';
import type { EditorImage as DemoImage, EditTemplate } from './types';

const EditorCanvas = dynamic(() => import('./editor-canvas'), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse bg-default/40" />,
});

export default function TemplatesPage({
  templates,
  image,
  onApply,
  onRename,
  onDelete,
  onCreate,
}: {
  templates: EditTemplate[];
  image?: DemoImage;
  onApply: (template: EditTemplate) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCreate: () => void;
}) {
  const [dialog, setDialog] = useState<{
    mode: 'rename' | 'delete';
    template: EditTemplate;
  } | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <section
      className="mx-auto grid w-full max-w-6xl gap-7 pb-8"
      aria-labelledby="templates-title"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="templates-title">编辑模板</h1>
          <p className="mt-2 text-sm text-muted">
            把常用的水印和打码位置，留给下一组图片。
          </p>
        </div>
        <Button className="min-h-11" onPress={onCreate}>
          <Plus size={18} aria-hidden />
          编辑图片并创建模板
        </Button>
      </header>
      {templates.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const { regions, watermark } = template.recipe;
            return (
              <article
                key={template.id}
                className="overflow-hidden rounded-2xl border border-border bg-surface"
              >
                <div
                  className="relative aspect-[16/10] overflow-hidden bg-default/20 px-3 py-3"
                  aria-label={`${template.name}效果示例`}
                >
                  <div className="pointer-events-none mx-auto max-w-[320px]">
                    {image && !image.unavailableReason ? (
                      <EditorCanvas
                        image={image}
                        recipe={template.recipe}
                        readOnly
                      />
                    ) : (
                      <div className="grid h-40 place-items-center text-sm text-muted">
                        选择图片后查看模板效果
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid gap-4 p-5">
                  <div>
                    <h2 className="text-base font-semibold">{template.name}</h2>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
                      {watermark.enabled && (
                        <span className="inline-flex items-center gap-1.5">
                          <Stamp size={14} aria-hidden />
                          {watermark.kind === 'text' ? '文字水印' : '图片水印'}
                          {watermark.tiled ? ' · 平铺' : ''}
                        </span>
                      )}
                      {!!regions.length && (
                        <span className="inline-flex items-center gap-1.5">
                          <ShieldCheck size={14} aria-hidden />
                          {regions.length} 个打码区域
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="line-clamp-2 min-h-10 text-xs leading-5 text-muted">
                    {watermark.enabled && watermark.kind === 'text'
                      ? `“${watermark.text}”${regions.length ? '，并遮挡指定区域。' : '，位置与大小随图片调整。'}`
                      : regions.length
                        ? '按相对位置套用，保存前逐张检查。'
                        : '保留 Logo 的透明背景与相对大小。'}
                  </p>
                  <div className="flex items-center gap-1 border-t border-border pt-3">
                    <Button
                      variant="secondary"
                      className="min-h-11 flex-1 text-sm"
                      onPress={() => onApply(template)}
                    >
                      选择图片并套用
                      <ArrowRight size={15} aria-hidden />
                    </Button>
                    <Button
                      isIconOnly
                      variant="ghost"
                      className="size-11 shrink-0"
                      aria-label={`重命名模板：${template.name}`}
                      onPress={() => {
                        setDialog({ mode: 'rename', template });
                        setName(template.name);
                        setError('');
                      }}
                    >
                      <Pencil size={17} />
                    </Button>
                    <Button
                      isIconOnly
                      variant="ghost"
                      className="size-11 shrink-0"
                      aria-label={`删除模板：${template.name}`}
                      onPress={() => setDialog({ mode: 'delete', template })}
                    >
                      <Trash2 size={17} />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid min-h-80 place-content-center justify-items-center gap-4 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-default/50">
            <Bookmark size={25} />
          </span>
          <h2 className="text-lg font-semibold">还没有编辑模板</h2>
          <p className="max-w-sm text-sm leading-6 text-muted">
            编辑一张图片后，可以将水印和打码区域保存为模板。
          </p>
          <Button variant="secondary" className="min-h-11" onPress={onCreate}>
            选择一张图片
          </Button>
        </div>
      )}
      {dialog && (
        <Modal.Backdrop
          isOpen
          onOpenChange={(open) => {
            if (!open && !busy) setDialog(null);
          }}
        >
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog
              aria-label={dialog.mode === 'rename' ? '重命名模板' : '删除模板'}
              className="max-w-[calc(100vw-32px)] rounded-2xl p-6 [&_.button--secondary]:text-foreground [&_.button--secondary]:rounded-lg [&_.button--primary]:rounded-lg"
            >
              <Modal.Header className="mb-5">
                <Modal.Heading className="pr-8 text-xl">
                  {dialog.mode === 'rename' ? '重命名模板' : '删除模板'}
                </Modal.Heading>
                <Button
                  slot="close"
                  isIconOnly
                  variant="ghost"
                  className="absolute top-3 right-3 size-11"
                  aria-label="关闭"
                >
                  <X size={19} />
                </Button>
              </Modal.Header>
              <Form
                className="grid gap-5"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (busy) return;
                  setBusy(true);
                  setError('');
                  try {
                    if (dialog.mode === 'rename') {
                      if (!name.trim()) {
                        setError('请输入模板名称');
                        return;
                      }
                      await onRename(dialog.template.id, name.trim());
                    } else await onDelete(dialog.template.id);
                    setDialog(null);
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : String(cause),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Modal.Body className="grid gap-3 p-0">
                  {error && (
                    <p role="alert" className="text-sm text-danger">
                      {error}
                    </p>
                  )}
                  {dialog.mode === 'rename' ? (
                    <TextField
                      value={name}
                      onChange={(value) => {
                        setName(value);
                        setError('');
                      }}
                      isRequired
                      isInvalid={!!error}
                    >
                      <Label>模板名称</Label>
                      <Input autoFocus maxLength={60} className="min-h-11" />
                      <FieldError>{error}</FieldError>
                    </TextField>
                  ) : (
                    <p className="text-sm leading-7">
                      删除“{dialog.template.name}”？已经保存的图片不受影响。
                    </p>
                  )}
                </Modal.Body>
                <Modal.Footer className="grid grid-cols-2 gap-3 p-0 pt-1">
                  <Button slot="close" variant="secondary" className="min-h-11">
                    取消
                  </Button>
                  <Button
                    type="submit"
                    isDisabled={busy}
                    variant={dialog.mode === 'delete' ? 'danger' : 'primary'}
                    className="min-h-11"
                  >
                    {dialog.mode === 'delete' ? '删除模板' : '保存名称'}
                  </Button>
                </Modal.Footer>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      )}
    </section>
  );
}
