'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { Modal } from '@heroui/react/modal';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { TextField } from '@heroui/react/textfield';
import { InputGroup } from '@heroui/react/input-group';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import { CloseButton } from '@heroui/react/close-button';
import { Tag as TagIcon } from 'lucide-react';
import { tagNameSchema } from '../../server/collections/validation';
import {
  tagRequest,
  tagUrl,
  TagRequestError,
  type Tag,
  type TagPage,
} from './api';

export type TagAction =
  { kind: 'create' } | { kind: 'edit' | 'delete'; tag: Tag };
type Outcome =
  | { kind: 'idle' }
  | { kind: 'failed' | 'conflict' | 'unknown' | 'missing'; message: string }
  | { kind: 'reused' | 'unchanged' | 'checked'; tag: Tag };

export function TagDialog({
  action,
  isOpen,
  onClose,
  onComplete,
  onExpire,
  onRefresh,
}: {
  action: TagAction;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (message?: string, status?: 'success' | 'unknown') => void;
  onExpire: () => void;
  onRefresh: () => Promise<void>;
}) {
  const Dialog = action.kind === 'delete' ? AlertDialog : Modal;
  const tag = 'tag' in action ? action.tag : null;
  const [name, setName] = useState(tag?.displayName ?? '');
  const [fieldError, setFieldError] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const result = 'tag' in outcome ? outcome.tag : null;
  const isForm =
    action.kind !== 'delete' &&
    !result &&
    outcome.kind !== 'unknown' &&
    outcome.kind !== 'missing';
  const title =
    fieldError?.title ??
    (result
      ? outcome.kind === 'reused'
        ? `已使用现有标签 ${result.displayName}`
        : outcome.kind === 'unchanged'
          ? '标签未发生变化'
          : '当前标签已核对'
      : outcome.kind === 'conflict'
        ? '这个名称已被使用'
        : outcome.kind === 'unknown'
          ? '操作结果待核对'
          : outcome.kind === 'missing'
            ? '此标签已不存在'
            : outcome.kind === 'failed'
              ? action.kind === 'create'
                ? '标签未能创建'
                : action.kind === 'edit'
                  ? '更改未能保存'
                  : '标签未能删除'
              : action.kind === 'create'
                ? '新建标签'
                : action.kind === 'edit'
                  ? '重命名标签'
                  : `删除${tag!.imageCount === 0 ? '空' : ''}标签「${tag!.displayName}」？`);
  const explanation = fieldError
    ? fieldError.message
    : 'message' in outcome
      ? outcome.message
      : result
        ? outcome.kind === 'reused'
          ? `保留已有名称 ${result.displayName}，不新建重复标签，也不改变已有图片关系。`
          : outcome.kind === 'unchanged'
            ? '继续使用原标签，图片关系保持不变。'
            : '已重新读取当前标签。不能据此确认本次请求是否提交；不会自动重复操作。'
        : action.kind === 'create'
          ? '首尾空格会自动去除；1–50 个字符，不允许换行。已有名称会直接使用原标签。'
          : action.kind === 'edit'
            ? '名称改变后保留原标签和全部图片关系。不能与其他标签同名，不会自动合并。'
            : '立即移除所有关联，包括回收站图片。图片不会被删除。同名新建也不会恢复旧关系。';

  function close() {
    if (pending) return;
    if (result || outcome.kind === 'missing') onComplete();
    else if (outcome.kind === 'unknown')
      onComplete(
        `操作结果仍待核对。本次${action.kind === 'create' ? '创建' : action.kind === 'edit' ? '重命名' : '删除'}输入：${action.kind === 'delete' ? tag!.displayName : name}。关闭不撤销请求，也不表示成功；请核对当前资料后再操作。`,
        'unknown',
      );
    else onClose();
  }
  async function verify() {
    try {
      if (action.kind === 'create') {
        const parsed = tagNameSchema.parse(name);
        let pageNumber = 1;
        while (mounted.current) {
          const page = await tagRequest<TagPage>(
            `/api/tags?${new URLSearchParams({ q: parsed.displayName, pageSize: '80', page: String(pageNumber) })}`,
          );
          if (!mounted.current) return;
          const current = page.items.find(
            (item) =>
              tagNameSchema.parse(item.displayName).normalizedKey ===
              parsed.normalizedKey,
          );
          if (current) {
            setOutcome({ kind: 'checked', tag: current });
            break;
          }
          if (pageNumber * page.pageSize >= page.total) {
            setOutcome({
              kind: 'failed',
              message: '核对后未找到此名称。输入已保留，可再次创建。',
            });
            break;
          }
          pageNumber++;
        }
      } else {
        const { tag: current } = await tagRequest<{ tag: Tag }>(
          tagUrl(tag!.id),
        );
        if (!mounted.current) return;
        if (action.kind === 'delete')
          setOutcome({
            kind: 'failed',
            message: '核对后标签仍然保留。请重新确认后删除。',
          });
        else if (
          tagNameSchema.parse(current.displayName).normalizedKey ===
          tagNameSchema.parse(name).normalizedKey
        )
          setOutcome({ kind: 'checked', tag: current });
        else
          setOutcome({
            kind: 'failed',
            message: '当前名称与本次输入不同，输入已保留。可修改后再保存。',
          });
      }
      await onRefresh();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof TagRequestError && error.status === 401) {
        onExpire();
        return;
      }
      if (error instanceof TagRequestError && error.status === 404) {
        if (action.kind === 'delete') {
          onComplete(
            `${tag!.displayName} 已不存在，图片保留。全部旧标签关联已移除。`,
          );
          return;
        }
        setOutcome({
          kind: 'missing',
          message: '它可能已在其他页面被删除。重新加载标签列表后再操作。',
        });
        return;
      }
      setOutcome({
        kind: 'unknown',
        message: `暂时无法核对结果。${error instanceof Error ? error.message : '请稍后重试。'}不会自动重复提交。`,
      });
    }
  }
  async function check() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await verify();
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }
  async function submit() {
    if (
      inFlight.current ||
      outcome.kind === 'unknown' ||
      outcome.kind === 'missing' ||
      result
    )
      return;
    const parsed = tagNameSchema.safeParse(name);
    if (action.kind !== 'delete' && !parsed.success) {
      const length = [...name.trim().normalize('NFC')].length;
      const controls = parsed.error.issues[0].message.includes('控制字符');
      setFieldError({
        title: controls
          ? '名称包含不可用字符'
          : length === 0
            ? '请输入标签名称'
            : '标签名称过长',
        message: controls
          ? '名称不能包含换行或控制字符。输入已保留，请清理后重试。'
          : length === 0
            ? '名称不能只包含空格。请填写 1–50 个字符。'
            : '最多 50 个字符。请缩短名称后重新提交。',
      });
      return;
    }
    inFlight.current = true;
    setPending(true);
    setFieldError(null);
    try {
      if (action.kind === 'delete') {
        const response = await tagRequest<{ deleted: boolean }>(
          tagUrl(tag!.id),
          { method: 'DELETE' },
        );
        if (!mounted.current) return;
        if (typeof response.deleted !== 'boolean')
          throw new Error('删除响应缺少可确认的结果');
        onComplete(
          response.deleted
            ? `${tag!.displayName} 已删除，图片保留。全部关联已移除。`
            : '此标签已不存在，图片保留。',
        );
      } else {
        const response = await tagRequest<{
          tag: Tag;
          reused?: boolean;
          changed?: boolean;
        }>(action.kind === 'create' ? '/api/tags' : tagUrl(tag!.id), {
          method: action.kind === 'create' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!mounted.current) return;
        if (
          !response.tag ||
          typeof (action.kind === 'create'
            ? response.reused
            : response.changed) !== 'boolean'
        )
          throw new Error('标签响应缺少可确认的结果');
        if (action.kind === 'create' && response.reused)
          setOutcome({ kind: 'reused', tag: response.tag });
        else if (action.kind === 'edit' && !response.changed)
          setOutcome({ kind: 'unchanged', tag: response.tag });
        else
          onComplete(
            action.kind === 'create'
              ? `${response.tag.displayName} 已创建 · 0 张图片。`
              : `标签已重命名为 ${response.tag.displayName}，原标签 ID 和图片关系保持不变。`,
          );
      }
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof TagRequestError && error.status === 401) {
        onExpire();
        return;
      }
      if (error instanceof TagRequestError && error.status === 404)
        setOutcome({
          kind: 'missing',
          message: '标签已不存在。输入已保留，无法继续保存。',
        });
      else if (error instanceof TagRequestError && error.status < 500)
        setOutcome({
          kind: error.status === 409 ? 'conflict' : 'failed',
          message: `${error.message}。输入已保留，图片关系未改变。`,
        });
      else {
        setOutcome({
          kind: 'unknown',
          message:
            '未收到可确认的操作结果，正在重新读取并核对当前标签。不会把未知结果当作成功或自动重复提交。',
        });
        await verify();
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Backdrop
        isDismissable={!pending}
        isKeyboardDismissDisabled={pending}
      >
        <Dialog.Container placement="center" className="p-4">
          <Dialog.Dialog className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-[0_16px_48px_rgba(38,36,66,0.16)]">
            <Dialog.Header className="flex min-h-11 shrink-0 flex-row items-center justify-between gap-2">
              <Dialog.Heading className="text-xl font-medium leading-normal [overflow-wrap:anywhere]">
                {title}
              </Dialog.Heading>
              <CloseButton
                aria-label="关闭"
                isDisabled={pending}
                className="size-11 shrink-0 rounded-lg border border-border bg-background"
                onPress={close}
              />
            </Dialog.Header>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <Dialog.Body className="m-0 grid gap-4 overflow-visible p-0 text-sm leading-normal text-foreground [overflow-wrap:anywhere]">
                {isForm ? (
                  <TextField
                    name="tag-name"
                    value={name}
                    onChange={(value) => {
                      setName(value);
                      setFieldError(null);
                    }}
                    isInvalid={!!fieldError || outcome.kind === 'conflict'}
                    isDisabled={pending}
                    validationBehavior="aria"
                    className="gap-4"
                  >
                    <Label className="text-sm font-normal">
                      {action.kind === 'edit'
                        ? `名称 · 正在重命名「${tag!.displayName}」`
                        : fieldError?.title === '标签名称过长'
                          ? `名称 · ${[...name.trim().normalize('NFC')].length} / 50`
                          : '名称'}
                    </Label>
                    <InputGroup className="h-12 w-full rounded-lg border border-border bg-field shadow-none">
                      <InputGroup.Prefix className="border-0 pl-3 pr-2 text-foreground">
                        <TagIcon size={16} aria-hidden />
                      </InputGroup.Prefix>
                      <InputGroup.Input
                        id="tag-name"
                        autoFocus
                        className="h-full min-w-0 py-0 pl-0 pr-3 text-sm font-normal"
                        style={{ fontSize: 14 }}
                      />
                    </InputGroup>
                    {fieldError ? (
                      <FieldError className="rounded-lg bg-default p-3 text-[13px] leading-normal text-foreground">
                        {fieldError.message}
                      </FieldError>
                    ) : null}
                  </TextField>
                ) : (
                  <p>
                    {result
                      ? `显示名称：${result.displayName}`
                      : action.kind === 'delete' && outcome.kind === 'idle'
                        ? `${tag!.imageCount} 张正常图库图片使用此标签。`
                        : action.kind === 'delete' && outcome.kind === 'failed'
                          ? `${tag!.displayName} 仍保留。`
                          : outcome.kind === 'unknown'
                            ? '尚不能确认更改是否成功。'
                            : '请核对当前标签后再操作。'}
                  </p>
                )}
                {!fieldError ? (
                  <p
                    role={
                      outcome.kind !== 'idle' && !result ? 'alert' : undefined
                    }
                    className="rounded-lg bg-default p-3 text-[13px]"
                  >
                    {explanation}
                  </p>
                ) : null}
              </Dialog.Body>
              <Dialog.Footer className="mt-0 grid grid-cols-1 gap-4">
                {result ? (
                  <>
                    <Button
                      variant="outline"
                      className="h-12 w-full rounded-lg font-normal"
                      onPress={close}
                    >
                      返回标签列表
                    </Button>
                    {outcome.kind === 'reused' ? (
                      <Link
                        href={`/library?tagId=${encodeURIComponent(result.id)}`}
                        className="flex h-12 w-full justify-center rounded-lg bg-accent font-normal text-accent-foreground no-underline"
                      >
                        查看图片
                      </Link>
                    ) : null}
                  </>
                ) : outcome.kind === 'unknown' ? (
                  <>
                    <Button
                      className="h-12 w-full rounded-lg font-normal"
                      isDisabled={pending}
                      onPress={() => void check()}
                    >
                      {pending ? '正在核对…' : '重新加载'}
                    </Button>
                  </>
                ) : outcome.kind === 'missing' ? (
                  <Button
                    className="h-12 w-full rounded-lg font-normal"
                    onPress={close}
                  >
                    重新加载
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="h-12 w-full rounded-lg font-normal"
                      isDisabled={pending}
                      onPress={close}
                    >
                      {outcome.kind === 'failed' && action.kind === 'delete'
                        ? '返回标签'
                        : '取消'}
                    </Button>
                    <Button
                      type="submit"
                      className="h-12 w-full rounded-lg font-normal"
                      isDisabled={pending}
                    >
                      {pending
                        ? '正在提交…'
                        : fieldError
                          ? '修改名称'
                          : outcome.kind === 'failed'
                            ? action.kind === 'create'
                              ? '重新创建'
                              : action.kind === 'edit'
                                ? '重试保存'
                                : '重试删除'
                            : action.kind === 'create'
                              ? '创建标签'
                              : action.kind === 'delete'
                                ? '删除标签'
                                : outcome.kind === 'conflict'
                                  ? '修改名称'
                                  : '保存更改'}
                    </Button>
                  </>
                )}
              </Dialog.Footer>
            </form>
          </Dialog.Dialog>
        </Dialog.Container>
      </Dialog.Backdrop>
    </Dialog>
  );
}
