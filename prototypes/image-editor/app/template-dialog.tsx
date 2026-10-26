'use client';

import { useState } from 'react';
import {
  Button,
  Checkbox,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  TextField,
} from '@heroui/react';
import { BookmarkPlus, ShieldCheck, Stamp, X } from 'lucide-react';
import type { Recipe } from './model';

export type EditTemplate = { id: string; name: string; recipe: Recipe };

export default function TemplateDialog({
  recipe,
  onSave,
  onClose,
}: {
  recipe: Recipe;
  onSave: (
    name: string,
    includeRegions: boolean,
    includeWatermark: boolean,
  ) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [includeRegions, setIncludeRegions] = useState(false);
  const [includeWatermark, setIncludeWatermark] = useState(
    recipe.watermark.enabled,
  );
  const hasContent = includeRegions || includeWatermark;

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container placement="center" size="sm">
        <Modal.Dialog
          aria-label="保存为模板"
          className="max-w-[calc(100vw-32px)] rounded-2xl p-6"
        >
          <Modal.Header className="mb-5">
            <Modal.Heading className="flex items-center gap-2 text-xl">
              <BookmarkPlus size={21} aria-hidden />
              保存为模板
            </Modal.Heading>
            <Button
              slot="close"
              isIconOnly
              variant="ghost"
              className="absolute top-3 right-3 size-11"
              aria-label="关闭模板窗口"
            >
              <X size={19} />
            </Button>
          </Modal.Header>
          <Form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) {
                setError('给模板起一个名字');
                return;
              }
              if (hasContent)
                onSave(name.trim(), includeRegions, includeWatermark);
            }}
          >
            <Modal.Body className="grid gap-5 p-0">
              <TextField
                value={name}
                onChange={(value) => {
                  setName(value);
                  setError('');
                }}
                isInvalid={!!error}
                isRequired
              >
                <Label>模板名称</Label>
                <Input
                  autoFocus
                  placeholder="例如：截图账号遮挡"
                  maxLength={40}
                  className="min-h-11"
                />
                <FieldError>{error}</FieldError>
              </TextField>
              <fieldset className="grid gap-1">
                <legend className="mb-2 text-sm font-medium">
                  保存哪些内容
                </legend>
                <Checkbox
                  isSelected={includeWatermark}
                  onChange={setIncludeWatermark}
                  isDisabled={!recipe.watermark.enabled}
                  className="w-full"
                >
                  <Checkbox.Content className="min-h-12 w-full items-center gap-3 rounded-lg px-1">
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Stamp size={17} aria-hidden />
                    <span className="text-sm">
                      水印
                      <span className="ml-2 text-xs text-muted">
                        {recipe.watermark.enabled
                          ? recipe.watermark.kind === 'text'
                            ? '文字、位置与样式'
                            : '图片、位置与样式'
                          : '当前未添加水印'}
                      </span>
                    </span>
                  </Checkbox.Content>
                </Checkbox>
                <Checkbox
                  isSelected={includeRegions}
                  onChange={setIncludeRegions}
                  isDisabled={!recipe.regions.length}
                  className="w-full"
                >
                  <Checkbox.Content className="min-h-12 w-full items-center gap-3 rounded-lg px-1">
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <ShieldCheck size={17} aria-hidden />
                    <span className="text-sm">
                      打码区域
                      <span className="ml-2 text-xs text-muted">
                        {recipe.regions.length
                          ? `${recipe.regions.length} 个区域及相对位置`
                          : '当前未添加打码'}
                      </span>
                    </span>
                  </Checkbox.Content>
                </Checkbox>
              </fieldset>
              <p className="rounded-lg bg-default/35 p-3 text-xs leading-6 text-muted">
                {includeRegions
                  ? '打码区域会按图片比例套用。应用到其他图片后，仍需逐张检查位置。'
                  : '模板只保存编辑参数。应用到其他尺寸时，位置与大小会按图片比例调整。'}
              </p>
              {!hasContent && (
                <p role="status" className="text-xs text-muted">
                  至少选择一项内容。
                </p>
              )}
            </Modal.Body>
            <Modal.Footer className="grid grid-cols-2 gap-3 p-0 pt-1">
              <Button slot="close" variant="secondary" className="min-h-11">
                取消
              </Button>
              <Button
                type="submit"
                isDisabled={!hasContent}
                className="min-h-11"
              >
                保存模板
              </Button>
            </Modal.Footer>
          </Form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
