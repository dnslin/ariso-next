'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  TextField,
} from '@heroui/react';
import { Bookmark, X } from 'lucide-react';
import { ruleLabels, type FilterRules } from './data';

export function CollectionDialog({
  mode,
  initialName,
  rules,
  failure,
  onSubmit,
  onClose,
}: {
  mode: 'save' | 'rename' | 'delete';
  initialName: string;
  rules: FilterRules;
  failure: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');
  const title =
    mode === 'save'
      ? '保存为智能集合'
      : mode === 'rename'
        ? '重命名集合'
        : '删除智能集合';
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container placement="center" size="sm">
        <Modal.Dialog
          aria-label={title}
          className="max-w-[calc(100vw-32px)] rounded-2xl p-6"
        >
          <Modal.Header className="mb-5">
            <Modal.Heading className="flex items-center gap-2 text-xl">
              <Bookmark size={20} />
              {title}
            </Modal.Heading>
            <Button
              slot="close"
              isIconOnly
              variant="ghost"
              className="absolute top-3 right-3 size-11"
              aria-label="关闭"
            >
              <X size={20} />
            </Button>
          </Modal.Header>
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) {
                setError('请输入集合名称');
                return;
              }
              onSubmit(name.trim());
            }}
            className="grid gap-5"
          >
            <Modal.Body className="grid gap-4 p-0">
              {mode === 'delete' ? (
                <p className="text-sm leading-6">
                  删除“{initialName}”的筛选条件，所有图片都会保留。
                </p>
              ) : (
                <>
                  <TextField
                    isInvalid={!!error}
                    value={name}
                    onChange={(value) => {
                      setName(value);
                      setError('');
                    }}
                  >
                    <Label>集合名称</Label>
                    <Input
                      autoFocus
                      className="h-12"
                      placeholder="例如：待整理的图片"
                      maxLength={50}
                    />
                    <FieldError>{error}</FieldError>
                  </TextField>
                  {mode === 'save' && (
                    <div className="grid gap-2 text-sm">
                      <p className="text-muted">保存以下条件</p>
                      <div className="flex flex-wrap gap-2">
                        {ruleLabels(rules).length ? (
                          ruleLabels(rules).map((label) => (
                            <span
                              key={label}
                              className="rounded-lg bg-default px-3 py-2"
                            >
                              {label}
                            </span>
                          ))
                        ) : (
                          <span>全部图片</span>
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        图片会随条件自动匹配，无需手动加入。
                      </p>
                    </div>
                  )}
                </>
              )}
              {failure && (
                <Alert status="danger">
                  <Alert.Content>
                    <Alert.Title>保存失败</Alert.Title>
                    <Alert.Description>
                      暂时无法保存，输入已保留。请重试。
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </Modal.Body>
            <Modal.Footer className="flex gap-3 p-0 pt-1">
              <Button
                slot="close"
                variant="secondary"
                className="min-h-12 flex-1 rounded-lg"
              >
                取消
              </Button>
              <Button
                type="submit"
                variant={mode === 'delete' ? 'danger' : 'primary'}
                className="min-h-12 flex-1 rounded-lg"
              >
                {mode === 'delete' ? '删除集合' : failure ? '重试保存' : '保存'}
              </Button>
            </Modal.Footer>
          </Form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
