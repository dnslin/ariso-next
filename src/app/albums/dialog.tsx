'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { Modal } from '@heroui/react/modal';
import { TextField } from '@heroui/react/textfield';
import { Input } from '@heroui/react/input';
import { TextArea } from '@heroui/react/textarea';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import { Alert } from '@heroui/react/alert';
import { CloseButton } from '@heroui/react/close-button';
import { albumInputSchema } from '../../server/collections/validation';
import { albumRequest, AlbumRequestError, albumUrl, type Album } from './api';

export type AlbumAction =
  { kind: 'create' } | { kind: 'edit' | 'menu' | 'delete'; album: Album };

type AlbumOutcome =
  | { kind: 'idle' }
  | { kind: 'failed' | 'unknown' | 'missing'; message: string }
  | { kind: 'updated'; album: Album }
  | { kind: 'deleted' };

export function AlbumDialog({
  action,
  isOpen,
  onClose,
  onComplete,
  onExpire,
  onCheckList,
}: {
  action: AlbumAction;
  isOpen: boolean;
  onClose: (preserve?: boolean) => void;
  onComplete: (album: Album | null) => void;
  onExpire: () => void;
  onCheckList: () => Promise<void>;
}) {
  const album = 'album' in action ? action.album : null;
  const [mode, setMode] = useState(action.kind);
  const [name, setName] = useState(album?.name ?? '');
  const [description, setDescription] = useState(album?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [outcome, setOutcome] = useState<AlbumOutcome>({ kind: 'idle' });
  const succeeded = outcome.kind === 'updated' || outcome.kind === 'deleted';
  const isForm = mode === 'create' || mode === 'edit';
  const title =
    (outcome.kind === 'updated'
      ? '相册已更新'
      : outcome.kind === 'deleted'
        ? '相册已删除'
        : null) ??
    (outcome.kind === 'unknown'
      ? '提交结果未知'
      : outcome.kind === 'missing'
        ? '相册已不存在'
        : outcome.kind === 'failed'
          ? mode === 'delete'
            ? '删除失败'
            : '保存失败'
          : mode === 'create'
            ? '新建相册'
            : mode === 'edit'
              ? '编辑相册'
              : mode === 'menu'
                ? '相册操作'
                : '删除这本相册？');

  async function verify() {
    if (mode === 'create') {
      await onCheckList();
      if (!mounted.current) return;
      setOutcome({
        kind: 'unknown',
        message:
          '列表已重新读取，但同名相册不能证明本次创建成功。输入已保留，请返回列表核对，勿重复创建。',
      });
      return;
    }
    try {
      const current = await albumRequest<{ album: Album }>(albumUrl(album!.id));
      if (!mounted.current) return;
      const input = albumInputSchema.safeParse({ name, description });
      if (
        mode === 'edit' &&
        input.success &&
        current.album.name === input.data.name &&
        current.album.description === input.data.description
      ) {
        setOutcome({ kind: 'updated', album: current.album });
      } else {
        setOutcome({
          kind: 'failed',
          message:
            mode === 'delete'
              ? '核对后相册仍然保留。请重新确认后删除。'
              : '核对后名称与描述尚未保存为本次输入。输入内容已保留。',
        });
      }
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof AlbumRequestError && error.status === 401) {
        onExpire();
        return;
      }
      if (error instanceof AlbumRequestError && error.status === 404) {
        if (mode === 'delete') {
          setOutcome({ kind: 'deleted' });
        } else
          setOutcome({
            kind: 'missing',
            message: '相册已不存在，输入内容已保留，无法继续保存。',
          });
        return;
      }
      throw error;
    }
  }

  async function check() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await verify();
    } catch (error) {
      if (!mounted.current) return;
      setOutcome({
        kind: 'unknown',
        message: `暂时无法核对结果。${error instanceof Error ? error.message : '请稍后重新核对。'}`,
      });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function submit() {
    if (
      inFlight.current ||
      outcome.kind === 'unknown' ||
      outcome.kind === 'missing'
    )
      return;
    const input = albumInputSchema.safeParse({ name, description });
    if (isForm && !input.success) {
      setErrors(
        Object.fromEntries(
          input.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      return;
    }
    inFlight.current = true;
    setPending(true);
    setErrors({});
    setOutcome({ kind: 'idle' });
    try {
      const response = await albumRequest<{ album?: Album; deleted?: boolean }>(
        mode === 'create' ? '/api/albums' : albumUrl(album!.id),
        {
          method:
            mode === 'create' ? 'POST' : mode === 'edit' ? 'PATCH' : 'DELETE',
          ...(isForm && input.success
            ? {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input.data),
              }
            : {}),
        },
      );
      if (!mounted.current) return;
      if (mode === 'delete' ? response.deleted !== true : !response.album)
        throw new Error('服务器响应未包含可核对的操作结果');
      if (mode === 'create') {
        onComplete(response.album!);
        return;
      }
      setOutcome(
        mode === 'delete'
          ? { kind: 'deleted' }
          : { kind: 'updated', album: response.album! },
      );
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof AlbumRequestError && error.status === 401) {
        onExpire();
        return;
      }
      if (error instanceof AlbumRequestError && error.status === 404) {
        if (mode === 'delete') {
          setOutcome({ kind: 'deleted' });
          return;
        }
        setOutcome({
          kind: 'missing',
          message: '相册已不存在，无法继续操作。',
        });
        return;
      }
      if (error instanceof AlbumRequestError && error.status < 500) {
        setOutcome({
          kind: 'failed',
          message: `${error.message}。输入内容已保留。`,
        });
        return;
      }
      setOutcome({
        kind: 'unknown',
        message: '未收到可确认的操作结果，正在重新读取并核对。请勿重复提交。',
      });
      try {
        await verify();
      } catch (readError) {
        setOutcome({
          kind: 'unknown',
          message: `暂时无法核对结果。${readError instanceof Error ? readError.message : '请稍后重新核对。'}`,
        });
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function close() {
    if (pending) return;
    if (outcome.kind === 'updated') onComplete(outcome.album);
    else if (outcome.kind === 'deleted') onComplete(null);
    else onClose(outcome.kind === 'unknown');
  }
  let body: ReactNode;
  if (succeeded)
    body = (
      <p>
        {mode === 'delete'
          ? `「${album!.name}」#${album!.id.slice(0, 8)} 已删除。图库图片与其他相册未受影响。`
          : '名称与描述已保存。'}
      </p>
    );
  else if (isForm)
    body = (
      <>
        <p className="text-muted">
          {outcome.kind === 'failed'
            ? outcome.message
            : mode === 'create'
              ? '名称可以重复，稍后可补充描述。'
              : '名称可以重复。描述仅展示文字。'}
        </p>
        <TextField
          name="album-name"
          value={name}
          onChange={setName}
          isInvalid={!!errors.name}
          isDisabled={pending || outcome.kind === 'unknown'}
          validationBehavior="aria"
          className="gap-1.5"
        >
          <Label className="text-sm font-normal">相册名称</Label>
          <Input
            id="album-name"
            autoFocus
            className="h-12 w-full rounded-lg font-normal border border-border bg-background px-3.5 text-base shadow-none md:text-sm"
          />
          <FieldError>{errors.name}</FieldError>
        </TextField>
        {mode === 'edit' ? (
          <>
            <TextField
              name="album-description"
              value={description}
              onChange={setDescription}
              isInvalid={!!errors.description}
              isDisabled={pending || outcome.kind === 'unknown'}
              validationBehavior="aria"
              className="gap-1.5"
            >
              <Label className="text-sm font-normal">描述（选填）</Label>
              <TextArea
                id="album-description"
                rows={1}
                className="min-h-12 w-full resize-y rounded-lg border border-border bg-background px-3.5 py-3 text-base shadow-none md:text-sm"
              />
              <FieldError>{errors.description}</FieldError>
            </TextField>
            {outcome.kind === 'idle' ? (
              <p className="text-xs text-muted">
                名称 1–100 字 · 描述最多 2,000 字
              </p>
            ) : null}
          </>
        ) : null}
      </>
    );
  else
    body = (
      <>
        <p className="text-muted">
          {album!.name} · #{album!.id.slice(0, 8)}
          {mode === 'delete' ? ` · ${album!.imageCount} 张图片` : ''}
        </p>
        {mode === 'menu' ? (
          <>
            <Link
              href={`/shares/${encodeURIComponent(album!.id)}?from=album`}
              className="h-12 w-full justify-center rounded-lg border border-border bg-background text-sm font-normal text-foreground no-underline"
            >
              分享设置
            </Link>
            <Button
              variant="outline"
              isDisabled
              className="h-12 w-full rounded-lg font-normal"
            >
              管理图片 · 尚未开放
            </Button>
            <Button
              variant="outline"
              className="h-12 w-full rounded-lg font-normal"
              onPress={() => setMode('delete')}
            >
              删除相册…
            </Button>
          </>
        ) : (
          <>
            <p className="rounded-lg border border-danger px-3 py-2.5 text-[13px] text-danger">
              相册删除后无法恢复，也不会进入回收站。
            </p>
            <p>
              图库图片和文件会保留。此相册的分享链接与访问授权会失效。独立的公开图片链接仍按图片状态访问。
            </p>
          </>
        )}
      </>
    );
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Modal.Backdrop
        isDismissable={!pending}
        isKeyboardDismissDisabled={pending}
      >
        <Modal.Container placement="center" className="p-4">
          <Modal.Dialog className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-surface px-4 py-6 shadow-[0_16px_48px_rgba(38,36,66,0.16)] md:px-6">
            <Modal.Header className="flex min-h-12 shrink-0 flex-row items-center justify-between gap-2.5">
              <Modal.Heading className="text-xl font-medium leading-normal">
                {title}
              </Modal.Heading>
              <CloseButton
                aria-label="关闭"
                isDisabled={pending}
                className="size-11 shrink-0 rounded-lg border border-border bg-surface"
                onPress={close}
              />
            </Modal.Header>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <Modal.Body className="m-0 grid gap-4 overflow-visible p-0 text-sm leading-normal text-foreground [overflow-wrap:anywhere]">
                {body}
                {outcome.kind === 'unknown' || outcome.kind === 'missing' ? (
                  <Alert
                    status={outcome.kind === 'unknown' ? 'warning' : 'danger'}
                  >
                    <Alert.Content>
                      <Alert.Description>
                        {outcome.message}
                        {outcome.kind === 'unknown' && mode === 'create'
                          ? '结束本次操作会清除本次输入，不会撤销或重新提交创建。'
                          : null}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
                {outcome.kind === 'failed' && mode === 'delete' ? (
                  <p role="alert">{outcome.message}</p>
                ) : null}
              </Modal.Body>
              {mode !== 'menu' || succeeded ? (
                <Modal.Footer className="mt-0 grid grid-cols-2 gap-2.5">
                  {succeeded ? (
                    <Button
                      className="col-span-2 h-12 w-full rounded-lg font-normal"
                      onPress={close}
                    >
                      {mode === 'delete' ? '返回相册列表' : '返回相册'}
                    </Button>
                  ) : outcome.kind === 'unknown' ? (
                    <>
                      <Button
                        variant="outline"
                        className="h-12 w-full rounded-lg font-normal"
                        isDisabled={pending}
                        onPress={close}
                      >
                        返回核对
                      </Button>
                      <Button
                        className="h-12 w-full rounded-lg font-normal"
                        isDisabled={pending}
                        onPress={() => {
                          void check();
                        }}
                      >
                        重新核对
                      </Button>
                      {mode === 'create' ? (
                        <Button
                          variant="outline"
                          className="col-span-2 h-12 w-full rounded-lg font-normal"
                          isDisabled={pending}
                          onPress={() => onClose()}
                        >
                          结束本次操作
                        </Button>
                      ) : null}
                    </>
                  ) : outcome.kind === 'missing' ? (
                    <Button
                      className="col-span-2 h-12 w-full rounded-lg font-normal"
                      onPress={() => onClose()}
                    >
                      关闭
                    </Button>
                  ) : outcome.kind === 'failed' ? (
                    <Button
                      type={mode === 'delete' ? 'button' : 'submit'}
                      className="col-span-2 h-12 w-full rounded-lg font-normal"
                      isDisabled={pending}
                      onPress={
                        mode === 'delete'
                          ? () => setOutcome({ kind: 'idle' })
                          : undefined
                      }
                    >
                      {pending
                        ? '正在提交…'
                        : mode === 'delete'
                          ? '重新确认删除'
                          : '重试保存'}
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        className="h-12 w-full rounded-lg font-normal"
                        isDisabled={pending}
                        onPress={close}
                      >
                        取消
                      </Button>
                      <Button
                        type="submit"
                        variant={mode === 'delete' ? 'outline' : 'primary'}
                        className={`h-12 w-full rounded-lg font-normal ${mode === 'delete' ? 'border-danger text-danger' : ''}`}
                        isDisabled={pending}
                      >
                        {pending
                          ? '正在提交…'
                          : mode === 'create'
                            ? '创建'
                            : mode === 'delete'
                              ? '删除相册'
                              : '保存'}
                      </Button>
                    </>
                  )}
                </Modal.Footer>
              ) : null}
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
