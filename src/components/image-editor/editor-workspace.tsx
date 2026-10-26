'use client';

import { Alert, Button, Modal, Spinner } from '@heroui/react';
import { ArrowLeft, Bookmark, ListChecks, RefreshCw } from 'lucide-react';
import { ImageEditorProvider, useImageEditor } from './state';
import { Editor } from './editor';
import TemplatesPage from './templates-page';
import BatchPage from './batch-page';
import { EditResults } from './results';
import { editJobActive } from './session';

function WorkspaceContent() {
  const editor = useImageEditor();
  const snapshots = editor.snapshots;
  const sourceFrozen =
    editor.updatingSources.includes(editor.currentId) ||
    editor.sessions.some(
      (session, index) =>
        session.reference.sourceImageId === editor.currentId &&
        session.reference.mode === 'overwrite' &&
        (snapshots[index].phase === 'submitting' ||
          snapshots[index].phase === 'unknown' ||
          editJobActive(snapshots[index].job)),
    );
  if (editor.loading)
    return (
      <div className="grid min-h-80 place-items-center">
        <Spinner aria-label="正在读取图片编辑上下文" />
      </div>
    );
  const available = editor.images.filter(
    (image) => !image.unavailableReason && image.sourceUrl,
  );
  return (
    <section
      data-testid="image-editor-workspace"
      data-view={editor.view}
      className="flex h-full min-h-0 min-w-0 flex-col [&_.button--secondary]:text-foreground [&_.button--secondary]:rounded-lg [&_.button--primary]:rounded-lg"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        {editor.view !== 'results' && (
          <Button
            variant="ghost"
            className="min-h-11 rounded-lg px-2 text-sm"
            onPress={editor.onClose}
          >
            <ArrowLeft size={17} />
            退出编辑
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {editor.sessions.length > 0 && (
            <Button
              variant={editor.view === 'results' ? 'secondary' : 'ghost'}
              className="min-h-11 rounded-lg px-3 text-xs"
              onPress={() => editor.setView('results')}
            >
              <ListChecks size={16} />
              保存结果
            </Button>
          )}
          <Button
            variant={editor.view === 'templates' ? 'secondary' : 'outline'}
            className="min-h-11 rounded-lg px-3 text-xs"
            onPress={() => editor.setView('templates')}
          >
            <Bookmark size={16} />
            编辑模板
          </Button>
          {editor.images.length > 1 && (
            <Button
              variant={editor.view === 'batch' ? 'secondary' : 'outline'}
              className="min-h-11 rounded-lg px-3 text-xs"
              onPress={() => editor.setView('batch')}
            >
              批量设置
            </Button>
          )}
        </div>
      </div>
      {editor.message && (
        <Alert status="danger" className="my-3 shrink-0">
          <Alert.Content>
            <Alert.Description>{editor.message}</Alert.Description>
            <Button
              variant="outline"
              className="mt-2 min-h-11"
              onPress={editor.refreshContexts}
            >
              <RefreshCw size={15} />
              重新读取图片状态
            </Button>
          </Alert.Content>
        </Alert>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {editor.view === 'results' ? (
          <EditResults />
        ) : editor.view === 'templates' ? (
          <div className="grid gap-4 py-5">
            {editor.templatesLoading ? (
              <p role="status">正在读取模板…</p>
            ) : null}
            {editor.templateError && (
              <Alert status="danger">
                <Alert.Content>
                  <Alert.Description>{editor.templateError}</Alert.Description>
                  <Button
                    className="mt-3 min-h-11"
                    onPress={() => void editor.loadTemplates()}
                  >
                    重新读取模板
                  </Button>
                </Alert.Content>
              </Alert>
            )}

            <TemplatesPage
              templates={editor.templates}
              image={available[0]}
              onApply={(template) => {
                editor.setTemplateId(template.id);
                editor.setView('batch');
              }}
              onRename={editor.renameTemplate}
              onDelete={editor.deleteTemplate}
              onCreate={() => {
                if (available[0]) {
                  editor.setCurrentId(available[0].id);
                  editor.setBatchMode(false);
                  editor.setView('edit');
                } else editor.onClose();
              }}
            />
          </div>
        ) : editor.view === 'batch' ? (
          <BatchPage
            images={editor.images}
            templates={editor.templates}
            selectedIds={editor.selectedIds}
            onToggle={editor.toggleImage}
            templateId={editor.templateId}
            onTemplateChange={editor.setTemplateId}
            onStart={editor.startBatch}
            onBack={() =>
              editor.setView(available.length ? 'edit' : 'templates')
            }
            backLabel={available.length ? '返回编辑' : '返回模板'}
          />
        ) : sourceFrozen ? (
          <div
            role="status"
            className="grid min-h-64 content-center justify-items-center gap-4 text-center"
          >
            <Spinner aria-label="正在保存或读取新原图" />
            <p className="text-sm">
              原图正在覆盖或载入，请等待完成后继续编辑。
            </p>
            <Button
              variant="outline"
              className="min-h-11"
              onPress={() => editor.setView('results')}
            >
              查看保存结果
            </Button>
          </div>
        ) : available.length ? (
          <Editor />
        ) : (
          <div className="grid gap-4 py-8">
            <h1 className="text-xl">当前图片无法编辑</h1>
            {editor.images.map((image) => (
              <p key={image.id} className="text-sm">
                {image.name}：{image.unavailableReason ?? '没有可用原图'}
              </p>
            ))}
            <Button
              variant="outline"
              className="min-h-11 w-fit"
              onPress={editor.refreshContexts}
            >
              重新读取
            </Button>
          </div>
        )}
      </div>
      {editor.leaving && (
        <Modal.Backdrop
          isOpen
          onOpenChange={(open) => {
            if (!open) editor.cancelClose();
          }}
        >
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog
              aria-label="离开图片编辑器"
              className="rounded-2xl p-6 [&_.button--secondary]:text-foreground [&_.button--secondary]:rounded-lg [&_.button--primary]:rounded-lg"
            >
              <Modal.Header>
                <Modal.Heading>放弃尚未保存的编辑？</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="px-0 py-4 text-sm leading-6">
                当前编辑草稿会被放弃。已经受理的保存任务继续处理，之后仍可核对结果。
              </Modal.Body>
              <Modal.Footer className="gap-3 p-0">
                <Button slot="close" variant="secondary" className="min-h-11">
                  继续编辑
                </Button>
                <Button
                  variant="primary"
                  className="min-h-11"
                  onPress={editor.confirmClose}
                >
                  返回
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      )}
    </section>
  );
}
export function ImageEditorWorkspace(props: {
  imageIds: string[];
  requestId?: string;
  initialView?: 'edit' | 'templates' | 'batch';
  onClose: () => void;
  onChanged?: () => void;
}) {
  return (
    <ImageEditorProvider {...props}>
      <WorkspaceContent />
    </ImageEditorProvider>
  );
}
