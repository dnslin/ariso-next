/* eslint-disable @next/next/no-img-element -- Standalone prototype images have no Next.js image server. */
import { useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Description } from '@heroui/react/description';
import { FieldError } from '@heroui/react/field-error';
import { InputGroup } from '@heroui/react/input-group';
import { Label } from '@heroui/react/label';
import { Modal } from '@heroui/react/modal';
import { Switch } from '@heroui/react/switch';
import { TextField } from '@heroui/react/textfield';
import { Tooltip } from '@heroui/react/tooltip';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Copy,
  Eye,
  EyeOff,
  Images,
  Link2,
  Link2Off,
  LockKeyhole,
  Save,
  X,
} from 'lucide-react';

export type ShareDraft = {
  enabled: boolean;
  hideName: boolean;
  password: string;
  expires: string;
};

type ShareEditorProps = {
  albumName: string;
  albumId: string;
  publicCount: number;
  value: ShareDraft | null;
  onSave: (draft: ShareDraft) => void;
  onBack: () => void;
  footerTarget: HTMLElement | null;
  failure?: boolean;
};

const emptyDraft: ShareDraft = {
  enabled: true,
  hideName: true,
  password: '',
  expires: '',
};
const buttonClass = 'h-12 gap-2 rounded-lg px-4 text-sm';
const inputClass =
  'h-12 min-h-12 w-full rounded-lg border border-border bg-background shadow-none';
const photos = [
  { src: '/samples/forest.jpg', name: '林间晨光.jpg' },
  { src: '/samples/mountain.jpg', name: '雪山与湖泊.jpg' },
];

function ToggleRow({
  label,
  selected,
  onChange,
}: {
  label: string;
  selected: boolean;
  onChange: (selected: boolean) => void;
}) {
  return (
    <Switch
      isSelected={selected}
      onChange={onChange}
      aria-label={label}
      className="w-full [--switch-control-bg:var(--border)] [--switch-control-bg-checked:var(--accent)] [--switch-control-bg-checked-hover:var(--accent)]"
    >
      <Switch.Content className="flex min-h-20 w-full justify-between gap-4 border-b border-border py-4">
        <Label className="text-sm font-normal">{label}</Label>
        <Switch.Control className="h-6 w-11 shrink-0">
          <Switch.Thumb className="size-5 bg-white" />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

export function ShareEditor({
  albumName,
  albumId,
  publicCount,
  value,
  onSave,
  onBack,
  footerTarget,
  failure = false,
}: ShareEditorProps) {
  const formId = useId();
  const [draft, setDraft] = useState<ShareDraft>(() => ({
    ...(value ?? emptyDraft),
  }));
  const [saved, setSaved] = useState<ShareDraft | null>(value);
  const failedOnce = useRef(false);
  const [error, setError] = useState('');
  const [expiryError, setExpiryError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUnlocked, setPreviewUnlocked] = useState(false);
  const [previewPassword, setPreviewPassword] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const address =
    typeof window === 'undefined'
      ? `/s/${albumId}`
      : new URL(`/s/${albumId}`, window.location.origin).href;
  const expired = Boolean(
    saved?.expires && new Date(saved.expires).getTime() <= currentTime,
  );
  const previewUnavailable = !saved?.enabled
    ? '分享已停用'
    : expired
      ? '分享已过期'
      : null;
  const previewLocked = Boolean(saved?.password && !previewUnlocked);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCurrentTime(Date.now());
    setError('');
    setExpiryError('');
    setFeedback('');
    if (
      draft.expires &&
      draft.expires !== saved?.expires &&
      (!Number.isFinite(new Date(draft.expires).getTime()) ||
        new Date(draft.expires).getTime() <= Date.now())
    ) {
      setExpiryError('请选择晚于当前时间的日期。');
      return;
    }
    if (failure && !failedOnce.current) {
      failedOnce.current = true;
      setError(`${saved ? '保存' : '创建'}失败，输入已保留。请重试。`);
      return;
    }
    const next = { ...draft, enabled: saved ? draft.enabled : true };
    try {
      onSave(next);
      setSaved(next);
      setFeedback(saved ? '分享设置已保存' : '分享已创建');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '保存失败，输入已保留。',
      );
    }
  }

  async function copyAddress() {
    setCopyError('');
    setCopied(false);
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopyError('无法自动复制，请选中上方地址文本。');
    }
  }

  const actions = (
    <div className="flex w-full flex-wrap items-center justify-end gap-3">
      <Button
        type="submit"
        form={formId}
        className={`${buttonClass} min-w-32`}
        data-testid="prototype-share-save"
      >
        {saved ? (
          <Save size={17} aria-hidden />
        ) : (
          <Link2 size={17} aria-hidden />
        )}
        {saved ? '保存' : '创建并启用分享'}
      </Button>
    </div>
  );

  return (
    <section
      className="grid min-w-0 gap-6 pb-6"
      data-testid="prototype-share-editor"
    >
      <header className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-[30px] font-semibold leading-normal">
          分享设置
        </h1>
        <Button
          variant="ghost"
          className="h-11 shrink-0 gap-2 rounded-lg px-3 text-sm font-normal"
          onPress={onBack}
        >
          <ArrowLeft size={18} aria-hidden />
          返回
        </Button>
      </header>
      <p className="min-w-0 text-sm text-muted wrap-anywhere">
        {albumName} · {publicCount} 张公开图片
      </p>
      <form id={formId} onSubmit={save} className="grid w-full max-w-220 gap-6">
        <div>
          {saved ? (
            <ToggleRow
              label="启用分享"
              selected={draft.enabled}
              onChange={(enabled) => setDraft({ ...draft, enabled })}
            />
          ) : null}
          <ToggleRow
            label="隐藏图片名称"
            selected={draft.hideName}
            onChange={(hideName) => setDraft({ ...draft, hideName })}
          />
        </div>
        <div className="grid min-w-0 gap-6 min-[768px]:grid-cols-2">
          <TextField
            value={draft.password}
            onChange={(password) => setDraft({ ...draft, password })}
            className="min-w-0 gap-2"
          >
            <Label className="text-sm">访问密码</Label>
            <InputGroup className={inputClass}>
              <InputGroup.Prefix className="border-0 pl-3 pr-2 text-muted">
                <LockKeyhole size={16} aria-hidden />
              </InputGroup.Prefix>
              <InputGroup.Input
                type={passwordVisible ? 'text' : 'password'}
                maxLength={128}
                autoComplete="new-password"
                placeholder="不设置"
                className="h-full min-w-0 py-0 pl-0 text-sm"
              />
              <InputGroup.Suffix className="border-0 px-0.5">
                <Tooltip>
                  <Button
                    type="button"
                    isIconOnly
                    variant="ghost"
                    className="size-11 min-w-11 rounded-lg"
                    aria-label={passwordVisible ? '隐藏密码' : '显示密码'}
                    aria-pressed={passwordVisible}
                    onPress={() => setPasswordVisible(!passwordVisible)}
                  >
                    {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </Button>
                  <Tooltip.Content>
                    {passwordVisible ? '隐藏密码' : '显示密码'}
                  </Tooltip.Content>
                </Tooltip>
              </InputGroup.Suffix>
            </InputGroup>
            <Description className="text-xs text-muted">
              最多 128 个字符，留空为不设置。
            </Description>
          </TextField>
          <TextField
            value={draft.expires}
            onChange={(expires) => {
              setDraft({ ...draft, expires });
              setExpiryError('');
            }}
            isInvalid={Boolean(expiryError)}
            validationBehavior="aria"
            className="min-w-0 gap-2"
          >
            <Label className="text-sm">到期时间</Label>
            <InputGroup className={inputClass}>
              <InputGroup.Prefix className="border-0 pl-3 pr-2 text-muted">
                <CalendarClock size={16} aria-hidden />
              </InputGroup.Prefix>
              <InputGroup.Input
                type="datetime-local"
                className="h-full min-w-0 py-0 pl-0 text-sm"
              />
              {draft.expires ? (
                <InputGroup.Suffix className="border-0 px-0.5">
                  <Tooltip>
                    <Button
                      type="button"
                      isIconOnly
                      variant="ghost"
                      aria-label="清除到期时间"
                      className="size-11 min-w-11 rounded-lg"
                      onPress={() => {
                        setDraft({ ...draft, expires: '' });
                        setExpiryError('');
                      }}
                    >
                      <X size={16} aria-hidden />
                    </Button>
                    <Tooltip.Content>清除到期时间</Tooltip.Content>
                  </Tooltip>
                </InputGroup.Suffix>
              ) : null}
            </InputGroup>
            <Description className="text-xs text-muted">
              本地时间，留空为永不过期。
            </Description>
            <FieldError className="text-sm text-danger">
              {expiryError}
            </FieldError>
          </TextField>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {feedback ? (
          <p role="status" className="text-sm text-success">
            {feedback}
          </p>
        ) : null}
      </form>
      {saved ? (
        <section
          className="grid w-full max-w-220 gap-3 border-t border-border pt-6"
          aria-label="分享地址"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-medium">分享地址</h2>
            <span
              className={`text-xs ${expired && saved.enabled ? 'text-danger' : 'text-muted'}`}
            >
              {!saved.enabled ? '已停用' : expired ? '已过期' : '分享中'}
            </span>
          </div>
          <div className="flex min-w-0 items-start gap-2">
            <code className="min-w-0 flex-1 select-text py-2 text-sm leading-6 break-all">
              {address}
            </code>
            <Tooltip>
              <Button
                type="button"
                variant="ghost"
                isIconOnly
                aria-label="复制分享地址"
                className="size-11 min-w-11 rounded-lg"
                onPress={() => void copyAddress()}
              >
                {copied ? (
                  <Check size={17} aria-hidden />
                ) : (
                  <Copy size={17} aria-hidden />
                )}
              </Button>
              <Tooltip.Content>
                {copied ? '地址已复制' : '复制分享地址'}
              </Tooltip.Content>
            </Tooltip>
            <Button
              variant="outline"
              className={`${buttonClass} shrink-0`}
              onPress={() => {
                setCurrentTime(Date.now());
                setPreviewOpen(true);
                setPreviewUnlocked(false);
                setPreviewPassword('');
                setPreviewError('');
                setSelectedPhoto(null);
              }}
            >
              <Eye size={17} aria-hidden />
              预览
            </Button>
          </div>
          {copied ? (
            <p role="status" className="text-xs text-success">
              地址已复制
            </p>
          ) : null}
          {copyError ? (
            <p role="alert" className="text-sm text-danger">
              {copyError}
            </p>
          ) : null}
        </section>
      ) : null}
      {footerTarget ? createPortal(actions, footerTarget) : actions}
      <Modal.Backdrop isOpen={previewOpen} onOpenChange={setPreviewOpen}>
        <Modal.Container
          placement="center"
          scroll="inside"
          className="w-full p-4"
        >
          <Modal.Dialog
            aria-label="分享预览"
            className="max-h-[calc(100dvh-32px)] w-full max-w-3xl gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6"
          >
            <Modal.Header className="flex items-center justify-between gap-3 p-0">
              <div className="flex min-w-0 items-center gap-2">
                {selectedPhoto !== null ? (
                  <Button
                    isIconOnly
                    variant="ghost"
                    aria-label="返回图片列表"
                    className="size-11 rounded-lg"
                    onPress={() => setSelectedPhoto(null)}
                  >
                    <ArrowLeft size={18} aria-hidden />
                  </Button>
                ) : null}
                <Modal.Heading className="min-w-0 text-lg font-semibold wrap-anywhere">
                  {previewUnavailable || previewLocked ? '分享预览' : albumName}
                </Modal.Heading>
              </div>
              <CloseButton
                aria-label="关闭预览"
                className="size-11 shrink-0"
                onPress={() => setPreviewOpen(false)}
              />
            </Modal.Header>
            <Modal.Body className="m-0 grid min-h-0 gap-5 overflow-y-auto p-0">
              {previewUnavailable ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-muted">
                  <Link2Off size={32} aria-hidden />
                  <p className="text-base">{previewUnavailable}</p>
                </div>
              ) : previewLocked ? (
                <form
                  className="mx-auto grid w-full max-w-80 gap-4 py-10"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (previewPassword === saved?.password) {
                      setPreviewUnlocked(true);
                      setPreviewError('');
                    } else setPreviewError('密码不正确，请重试。');
                  }}
                >
                  <TextField
                    value={previewPassword}
                    onChange={setPreviewPassword}
                    isInvalid={Boolean(previewError)}
                    validationBehavior="aria"
                    className="gap-2"
                  >
                    <Label className="text-sm">访问密码</Label>
                    <InputGroup className={inputClass}>
                      <InputGroup.Input
                        type="password"
                        autoComplete="off"
                        className="h-full min-w-0 py-0 text-sm"
                      />
                    </InputGroup>
                    <FieldError className="text-sm text-danger">
                      {previewError}
                    </FieldError>
                  </TextField>
                  <Button type="submit" className={buttonClass}>
                    访问相册
                  </Button>
                </form>
              ) : publicCount === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-muted">
                  <Images size={32} aria-hidden />
                  <p>暂无公开图片</p>
                </div>
              ) : selectedPhoto !== null ? (
                <figure className="grid gap-3">
                  <img
                    src={photos[selectedPhoto].src}
                    alt=""
                    className="max-h-[65dvh] w-full object-contain"
                  />
                  {!saved?.hideName ? (
                    <figcaption className="text-sm">
                      {photos[selectedPhoto].name}
                    </figcaption>
                  ) : null}
                </figure>
              ) : (
                <div className="grid grid-cols-2 items-start gap-4">
                  {photos.slice(0, publicCount).map((photo, index) => (
                    <figure key={photo.src} className="grid min-w-0 gap-2">
                      <Button
                        variant="ghost"
                        aria-label={`查看第 ${index + 1} 张图片`}
                        className="aspect-[4/3] h-auto w-full min-w-0 overflow-hidden rounded-lg p-0"
                        onPress={() => setSelectedPhoto(index)}
                      >
                        <img
                          src={photo.src}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </Button>
                      {!saved?.hideName ? (
                        <figcaption className="text-sm wrap-anywhere">
                          {photo.name}
                        </figcaption>
                      ) : null}
                    </figure>
                  ))}
                </div>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </section>
  );
}
