'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Accordion } from '@heroui/react/accordion';
import { Button } from '@heroui/react/button';
import { Calendar } from '@heroui/react/calendar';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { CloseButton } from '@heroui/react/close-button';
import { DatePicker } from '@heroui/react/date-picker';
import { DateInputGroup } from '@heroui/react/date-input-group';
import { InputGroup } from '@heroui/react/input-group';
import { Label } from '@heroui/react/label';
import { Modal } from '@heroui/react/modal';
import { Switch } from '@heroui/react/switch';
import { TextField } from '@heroui/react/textfield';
import { TextArea } from '@heroui/react/textarea';
import { ToggleButton } from '@heroui/react/toggle-button';
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { Tooltip } from '@heroui/react/tooltip';
import { Spinner } from '@heroui/react/spinner';
import { toast } from '@heroui/react/toast';
import {
  parseDateTime,
  toZoned,
  type CalendarDateTime,
} from '@internationalized/date';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  Eye,
  EyeOff,
  Grid2X2,
  Link as LinkIcon,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { OwnerShell } from '../../../../src/components/shell/owner-shell';

type Action =
  'disable' | 'enable' | 'enable-expired' | 'rotate' | 'clear' | 'manual';
type Feedback = {
  title: string;
  detail?: string;
  checking?: boolean;
  retry?: boolean;
};
const future = parseDateTime('2026-11-06T23:59');
const buttonStyle = 'min-h-12 rounded-lg px-4 text-sm';
const cardStyle =
  'gap-0 rounded-2xl border border-border bg-surface p-0 shadow-none';

export default function Page() {
  return (
    <Suspense>
      <Prototype />
    </Suspense>
  );
}

function Prototype() {
  const params = useSearchParams();
  const { setTheme } = useTheme();
  const scenario = params.get('screen');
  const outcome = params.get('outcome') ?? 'success';
  const [enabled, setEnabled] = useState(scenario !== 'disabled');
  const [expired, setExpired] = useState(scenario === 'expired');
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [expiry, setExpiry] = useState<string | null>(
    scenario === 'expired' ? '2026-09-30 23:59' : null,
  );
  const [deadline, setDeadline] = useState<CalendarDateTime | null>(future);
  const [expiryMode, setExpiryMode] = useState('forever');
  const [layout, setLayout] = useState('grid');
  const [savedLayout, setSavedLayout] = useState('grid');
  const [showName, setShowName] = useState(false);
  const [savedShowName, setSavedShowName] = useState(false);
  const [token, setToken] = useState('aB3dE7fG9hK2mN5pQ8sT1uV4wX6yZ0');
  const [modal, setModal] = useState<Action | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [fieldError, setFieldError] = useState('');
  const [displayError, setDisplayError] = useState('');
  const [busy, setBusy] = useState(false);
  const checking = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pending = useRef<{
    password: boolean;
    apply: () => void;
    message: string;
    modal: boolean;
  } | null>(null);
  const dialogRef = useCallback((node: HTMLElement | null) => {
    if (!node)
      requestAnimationFrame(() => {
        if (checking.current) feedbackRef.current?.focus();
        else opener.current?.focus({ preventScroll: true });
      });
  }, []);
  const address = `${params.get('long') === '1' ? 'https://photos.family.example.com/our/very-long-but-valid-public-base-path' : 'https://photos.example.com'}/s/${token}`;
  const dirty = layout !== savedLayout || showName !== savedShowName;

  useEffect(() => {
    setTheme(params.get('dark') === '1' ? 'dark' : 'light');
  }, [params, setTheme]);
  useEffect(() => {
    document.documentElement.dataset.sharingPrototypeReady = 'true';
    return () => {
      delete document.documentElement.dataset.sharingPrototypeReady;
    };
  }, []);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );
  useEffect(() => {
    if (feedback && !modalOpen) feedbackRef.current?.focus();
  }, [feedback, modalOpen]);

  function open(action: Action, source?: HTMLElement | null) {
    if (checking.current) return;
    opener.current = source ?? (document.activeElement as HTMLElement);
    setFieldError('');
    setModal(action);
    setModalOpen(true);
  }
  function close() {
    setModalOpen(false);
    setFieldError('');
  }
  function readResult() {
    if (checking.current) return;
    checking.current = true;
    setBusy(true);
    setFeedback({ title: '正在核对当前设置…', checking: true });
    timers.current.push(
      setTimeout(() => {
        const restoreFocus = pending.current?.modal;
        if (outcome === 'read-failed') {
          setFeedback({
            title: '读取失败，结果尚未确认',
            detail: '请检查连接后重新核对，避免重复提交。',
            retry: true,
          });
        } else if (pending.current?.password) {
          setFeedback({
            title: '当前已设置访问密码，新密码无法确认',
            detail: '接口不会返回密码内容。请核实后再决定是否重新设置。',
            retry: true,
          });
        } else if (pending.current) {
          pending.current.apply();
          toast(pending.current.message, {
            indicator: <Check size={18} aria-hidden />,
            variant: 'default',
          });
          pending.current = null;
          setFeedback(null);
        }
        checking.current = false;
        setBusy(false);
        if (restoreFocus)
          requestAnimationFrame(() =>
            opener.current?.focus({ preventScroll: true }),
          );
      }, 1000),
    );
  }
  function save(apply: () => void, message: string, passwordChange = false) {
    if (checking.current) return;
    setFieldError('');
    if (outcome === 'failed') {
      setFieldError('保存失败，请检查连接后重试。输入已保留。');
      return;
    }
    if (outcome === 'unknown' || outcome === 'read-failed') {
      setBusy(true);
      pending.current = {
        apply,
        message,
        password: passwordChange,
        modal: modalOpen,
      };
      if (passwordChange && outcome !== 'read-failed') setHasPassword(true);
      close();
      readResult();
      return;
    }
    apply();
    if (modalOpen) close();
    setFeedback(null);
    toast(message, {
      indicator: <Check size={18} aria-hidden />,
      variant: 'default',
    });
  }
  function saveExpiry(restore = false) {
    if (
      expiryMode === 'date' &&
      (!deadline ||
        toZoned(deadline, 'Asia/Shanghai').toDate().getTime() <= Date.now())
    ) {
      setFieldError('请选择晚于当前时间的截止时间。');
      return;
    }
    save(
      () => {
        setExpiry(
          expiryMode === 'forever'
            ? null
            : deadline!.toString().replace('T', ' '),
        );
        setExpired(false);
        if (restore) setEnabled(true);
      },
      restore ? '分享已启用' : '有效期已保存',
    );
  }
  function confirm() {
    if (modal === 'enable-expired') return saveExpiry(true);
    if (modal === 'disable') return save(() => setEnabled(false), '分享已停用');
    if (modal === 'enable') return save(() => setEnabled(true), '分享已启用');
    if (modal === 'clear')
      return save(() => {
        setHasPassword(false);
        setPassword('');
      }, '访问密码已清除');
    if (modal === 'rotate')
      return save(
        () => setToken('zY9xW8vU7tS6rQ5pN4mK3hG2fE1dB0'),
        '分享地址已重新生成',
      );
    close();
  }

  return (
    <OwnerShell
      name="Ariso"
      description="图片管理与分享"
      email="prototype@example.com"
      ownerName="演示账号"
      footer={
        <>
          <Button
            variant="outline"
            className={buttonStyle}
            onPress={() => {
              window.parent.postMessage({ screen: 'list' }, '*');
            }}
          >
            <ArrowLeft size={16} aria-hidden />
            返回分享管理
          </Button>
          <Button
            className={buttonStyle}
            isDisabled
            aria-describedby="preview-note"
          >
            <Eye size={16} aria-hidden />
            预览分享
          </Button>
          <span id="preview-note" className="sr-only">
            访客页面尚未开放
          </span>
        </>
      }
    >
      <div className="mb-6 grid gap-2">
        <h1>分享设置</h1>
        <p className="text-sm text-muted [overflow-wrap:anywhere]">
          春日小记 · 12 张公开图片
        </p>
      </div>
      <div className="grid gap-4 md:gap-6">
        <Card className={cardStyle}>
          <Card.Header className="flex flex-row flex-wrap items-center justify-between gap-3 p-4 pb-2 md:px-6 md:pt-5">
            <div className="flex items-center gap-2">
              <LinkIcon size={20} aria-hidden />
              <Card.Title className="text-base font-medium">
                分享地址
              </Card.Title>
            </div>
            <Chip variant="soft" className="bg-default text-foreground">
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-current" />
              {!enabled ? '已停用' : expired ? '已过期' : '分享中'}
            </Chip>
          </Card.Header>
          <Card.Content className="px-4 pb-4 md:px-6 md:pb-5">
            <div className="flex min-w-0 items-start gap-3">
              <p
                data-testid="share-address"
                className="min-w-0 select-text py-2.5 text-sm leading-6 [overflow-wrap:anywhere]"
              >
                {address}
              </p>
              <Tooltip>
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label="复制分享地址"
                  className="size-11 shrink-0 rounded-lg"
                  onPress={() =>
                    outcome === 'manual'
                      ? open('manual')
                      : toast('分享地址已复制', {
                          indicator: <Check size={18} aria-hidden />,
                          variant: 'default',
                        })
                  }
                >
                  <Copy size={18} aria-hidden />
                </Button>
                <Tooltip.Content>复制分享地址</Tooltip.Content>
              </Tooltip>
            </div>
            <p className="text-xs leading-5 text-muted">
              相册中的公开图片会随内容变化自动更新。
            </p>
            {feedback ? (
              <div
                ref={feedbackRef}
                tabIndex={-1}
                role="status"
                className="mt-4 grid gap-2 border-t border-border pt-4 text-sm"
              >
                <p className="flex items-center gap-2 font-medium">
                  {feedback.checking ? (
                    <Spinner size="sm" />
                  ) : (
                    <RefreshCw size={16} aria-hidden />
                  )}
                  {feedback.title}
                </p>
                {feedback.detail ? (
                  <p className="text-muted">{feedback.detail}</p>
                ) : null}
                {feedback.retry ? (
                  <Button
                    variant="outline"
                    className={`${buttonStyle} w-fit`}
                    onPress={readResult}
                  >
                    重新核对
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Card.Content>
        </Card>
        <div className="grid items-start gap-4 md:grid-cols-2 md:gap-6">
          <Card className={cardStyle}>
            <Card.Header className="flex flex-row items-center gap-2 p-4 pb-2 md:p-6 md:pb-2">
              <ShieldCheck size={20} aria-hidden />
              <Card.Title className="text-base font-medium">
                访问设置
              </Card.Title>
            </Card.Header>
            <Card.Content className="px-4 pb-2 md:px-6">
              <Accordion aria-label="访问设置" isDisabled={busy}>
                <Accordion.Item id="password">
                  <Accordion.Heading>
                    <Accordion.Trigger
                      aria-label="访问密码"
                      className="min-h-20 gap-3 py-4 text-sm font-normal"
                      onPress={() => setFieldError('')}
                    >
                      <LockKeyhole
                        size={18}
                        className="shrink-0 text-muted"
                        aria-hidden
                      />
                      <span className="grid flex-1 gap-1 text-left">
                        <span className="font-medium">访问密码</span>
                        <span className="text-xs text-muted">
                          {hasPassword ? '已设置' : '未设置，持链接即可访问'}
                        </span>
                      </span>
                      <Accordion.Indicator>
                        <ChevronDown size={16} aria-hidden />
                      </Accordion.Indicator>
                    </Accordion.Trigger>
                  </Accordion.Heading>
                  <Accordion.Panel>
                    <Accordion.Body className="grid gap-3 pb-4">
                      <div className="flex flex-col gap-3 min-[1200px]:flex-row min-[1200px]:items-end">
                        <TextField
                          className="min-w-0 flex-1"
                          value={password}
                          onChange={setPassword}
                          isDisabled={busy}
                          isInvalid={Boolean(fieldError)}
                        >
                          <Label className="text-sm">
                            {hasPassword ? '新密码' : '设置密码'}
                          </Label>
                          <InputGroup
                            fullWidth
                            className="h-12 min-h-12 rounded-lg border border-border bg-transparent shadow-none"
                          >
                            <InputGroup.Input
                              type={passwordVisible ? 'text' : 'password'}
                              autoComplete="new-password"
                              autoCapitalize="none"
                              spellCheck={false}
                              placeholder="输入 1–128 个字符"
                              className="h-full min-w-0 py-0 text-sm"
                            />
                            <InputGroup.Suffix className="border-0 px-0.5">
                              <Tooltip>
                                <Button
                                  isIconOnly
                                  isDisabled={busy}
                                  variant="ghost"
                                  aria-label={
                                    passwordVisible ? '隐藏密码' : '显示密码'
                                  }
                                  aria-pressed={passwordVisible}
                                  className="size-11 min-w-11 rounded-lg"
                                  onPress={() =>
                                    setPasswordVisible(!passwordVisible)
                                  }
                                >
                                  {passwordVisible ? (
                                    <EyeOff size={16} aria-hidden />
                                  ) : (
                                    <Eye size={16} aria-hidden />
                                  )}
                                </Button>
                                <Tooltip.Content>
                                  {passwordVisible ? '隐藏密码' : '显示密码'}
                                </Tooltip.Content>
                              </Tooltip>
                            </InputGroup.Suffix>
                          </InputGroup>
                        </TextField>
                        <Button
                          isDisabled={busy}
                          className={`${buttonStyle} w-fit shrink-0`}
                          onPress={() => {
                            if (
                              [...password].length < 1 ||
                              [...password].length > 128
                            )
                              return setFieldError('密码需为 1–128 个字符。');
                            save(
                              () => {
                                setHasPassword(true);
                                setPassword('');
                              },
                              '访问密码已保存',
                              true,
                            );
                          }}
                        >
                          保存密码
                        </Button>
                      </div>
                      <p className="text-xs leading-5 text-muted">
                        更改密码后，访客需要重新解锁。
                      </p>
                      {fieldError ? (
                        <p role="alert" className="text-sm text-danger">
                          {fieldError}
                        </p>
                      ) : null}
                      {hasPassword ? (
                        <Button
                          isDisabled={busy}
                          variant="outline"
                          className={`${buttonStyle} w-fit`}
                          onPress={() => open('clear')}
                        >
                          清除密码
                        </Button>
                      ) : null}
                    </Accordion.Body>
                  </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item id="expiry">
                  <Accordion.Heading>
                    <Accordion.Trigger
                      aria-label="有效期"
                      className="min-h-20 gap-3 py-4 text-sm font-normal"
                      onPress={() => setFieldError('')}
                    >
                      <CalendarClock
                        size={18}
                        className="shrink-0 text-muted"
                        aria-hidden
                      />
                      <span className="grid min-w-0 flex-1 gap-1 text-left">
                        <span className="font-medium">有效期</span>
                        <span className="text-xs text-muted">
                          {expiry ?? '不过期'}
                          {expired ? ' · 已过期' : ''}
                        </span>
                      </span>
                      <Accordion.Indicator>
                        <ChevronDown size={16} aria-hidden />
                      </Accordion.Indicator>
                    </Accordion.Trigger>
                  </Accordion.Heading>
                  <Accordion.Panel>
                    <Accordion.Body className="grid gap-3 pb-4">
                      <ExpiryControls
                        mode={expiryMode}
                        onMode={setExpiryMode}
                        value={deadline}
                        onChange={setDeadline}
                        disabled={busy}
                      />
                      {fieldError ? (
                        <p role="alert" className="text-sm text-danger">
                          {fieldError}
                        </p>
                      ) : null}
                      <Button
                        isDisabled={busy}
                        className={`${buttonStyle} w-fit`}
                        onPress={() => saveExpiry()}
                      >
                        保存有效期
                      </Button>
                    </Accordion.Body>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </Card.Content>
            <Card.Footer className="border-t border-border px-4 py-3 md:px-6">
              <SettingSwitch
                label="启用分享"
                selected={enabled && !expired}
                disabled={busy}
                onChange={() =>
                  open(
                    !enabled || expired
                      ? expired
                        ? 'enable-expired'
                        : 'enable'
                      : 'disable',
                    document.querySelector<HTMLInputElement>(
                      'input[aria-label="启用分享"]',
                    ),
                  )
                }
              />
            </Card.Footer>
          </Card>
          <Card className={cardStyle}>
            <Card.Header className="flex flex-row items-center gap-2 p-4 md:p-6 md:pb-5">
              <Eye size={20} aria-hidden />
              <Card.Title className="text-base font-medium">
                访客展示
              </Card.Title>
            </Card.Header>
            <Card.Content className="grid gap-5 px-4 pb-4 md:px-6 md:pb-5">
              <div className="grid gap-2">
                <Label id="layout-label" className="text-sm">
                  图片布局
                </Label>
                <Choices
                  label="layout-label"
                  value={layout}
                  onChange={setLayout}
                  disabled={busy}
                >
                  <ToggleButton
                    id="grid"
                    className="h-12 flex-1 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                  >
                    <Grid2X2 size={18} aria-hidden />
                    网格
                  </ToggleButton>
                  <ToggleButton
                    id="masonry"
                    className="h-12 flex-1 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                  >
                    <Columns3 size={18} aria-hidden />
                    瀑布流
                  </ToggleButton>
                </Choices>
              </div>
              <SettingSwitch
                label="显示图片名称"
                selected={showName}
                disabled={busy}
                onChange={setShowName}
              />
              {displayError ? (
                <p role="alert" className="text-sm text-danger">
                  {displayError}
                </p>
              ) : null}
            </Card.Content>
            <Card.Footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 md:px-6">
              <p className="text-xs text-muted">
                {dirty ? '有未保存的修改' : '当前设置已保存'}
              </p>
              <Button
                isDisabled={!dirty || busy}
                className={buttonStyle}
                onPress={() => {
                  setDisplayError('');
                  if (outcome === 'failed')
                    return setDisplayError(
                      '保存失败，请检查连接后重试。选择已保留。',
                    );
                  save(() => {
                    setSavedLayout(layout);
                    setSavedShowName(showName);
                  }, '访客展示已保存');
                }}
              >
                保存展示
              </Button>
            </Card.Footer>
          </Card>
        </div>
        <Card className={cardStyle}>
          <Card.Content className="flex flex-row flex-wrap items-center justify-between gap-3 p-4 md:px-6 md:py-4">
            <div className="flex min-w-0 items-start gap-3">
              <RefreshCw
                size={18}
                aria-hidden
                className="mt-0.5 shrink-0 text-muted"
              />
              <div className="grid gap-1">
                <p className="text-sm font-medium">重新生成地址</p>
                <p className="text-xs leading-5 text-muted">
                  旧地址与已解锁会话将立即失效。
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className={buttonStyle}
              isDisabled={busy}
              onPress={() => open('rotate')}
            >
              重新生成
            </Button>
          </Card.Content>
        </Card>
      </div>
      <Modal
        isOpen={modalOpen}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <Modal.Backdrop>
          <Modal.Container size="md" className="p-4">
            <Modal.Dialog
              aria-label={modalTitle(modal)}
              className="max-h-[calc(100dvh-32px)] w-full max-w-[480px] gap-5 overflow-auto rounded-[14px] border border-border bg-surface p-6"
            >
              <CloseButton
                aria-label="关闭"
                className="absolute top-3 right-3 size-11"
              />
              <Modal.Header ref={dialogRef} className="pr-10">
                <Modal.Heading className="text-xl font-medium">
                  {modalTitle(modal)}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="grid gap-4 text-sm leading-6">
                {modal === 'manual' ? (
                  <>
                    <p>浏览器未允许复制，请选择完整地址后手动复制。</p>
                    <TextArea
                      aria-label="完整分享地址"
                      value={address}
                      readOnly
                      className="min-h-28 select-text rounded-lg border border-border bg-transparent text-sm [overflow-wrap:anywhere]"
                    />
                    <Button
                      variant="outline"
                      className={`${buttonStyle} w-fit`}
                      onPress={() => {
                        const field =
                          document.querySelector<HTMLTextAreaElement>(
                            'textarea',
                          );
                        field?.focus();
                        field?.select();
                      }}
                    >
                      选中完整地址
                    </Button>
                  </>
                ) : modal === 'enable-expired' ? (
                  <>
                    <p>分享已过期。选择新的有效期后启用。</p>
                    <ExpiryControls
                      mode={expiryMode}
                      onMode={setExpiryMode}
                      value={deadline}
                      onChange={setDeadline}
                    />
                  </>
                ) : (
                  <p>
                    {modal === 'disable'
                      ? '停用后，当前地址无法访问，已解锁访客也会失效。'
                      : modal === 'enable'
                        ? '启用后，访客可以通过当前地址访问。'
                        : modal === 'clear'
                          ? '清除后，持有链接的访客无需密码即可访问。'
                          : '重新生成后，旧地址与已解锁会话立即失效。访问密码、有效期和展示设置保持。'}
                  </p>
                )}
                {fieldError ? (
                  <p role="alert" className="text-danger">
                    {fieldError}
                  </p>
                ) : null}
              </Modal.Body>
              <Modal.Footer className="gap-3">
                {modal !== 'manual' ? (
                  <Button
                    variant="outline"
                    className={buttonStyle}
                    onPress={close}
                  >
                    取消
                  </Button>
                ) : null}
                <Button className={buttonStyle} onPress={confirm}>
                  {modal === 'manual'
                    ? '完成'
                    : modal === 'enable' || modal === 'enable-expired'
                      ? '启用分享'
                      : modal === 'disable'
                        ? '停用分享'
                        : modal === 'clear'
                          ? '清除密码'
                          : '重新生成'}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </OwnerShell>
  );
}

function SettingSwitch({
  label,
  selected,
  disabled,
  onChange,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onChange: (selected: boolean) => void;
}) {
  return (
    <Switch
      aria-label={label}
      isSelected={selected}
      isDisabled={disabled}
      onChange={onChange}
      className="w-full [--switch-control-bg:var(--border)] [--switch-control-bg-checked:var(--accent)] [--switch-control-bg-checked-hover:var(--accent)]"
    >
      <Switch.Content className="flex min-h-11 w-full justify-between gap-3">
        <Label className="text-sm font-normal">{label}</Label>
        <Switch.Control className="h-6 w-11">
          <Switch.Thumb className="size-5 bg-white" />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}
function Choices({
  label,
  value,
  onChange,
  children,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <ToggleButtonGroup
      aria-labelledby={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      isDisabled={disabled}
      onSelectionChange={(keys) => onChange(String([...keys][0]))}
      isDetached
      className="flex w-full gap-1 rounded-xl border border-border bg-transparent p-1"
    >
      {children}
    </ToggleButtonGroup>
  );
}
function ExpiryControls({
  mode,
  onMode,
  value,
  onChange,
  disabled,
}: {
  mode: string;
  onMode: (mode: string) => void;
  value: CalendarDateTime | null;
  onChange: (value: CalendarDateTime | null) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  return (
    <div className="grid gap-3">
      <Label id={labelId} className="text-sm">
        截止方式
      </Label>
      <Choices
        label={labelId}
        value={mode}
        onChange={onMode}
        disabled={disabled}
      >
        <ToggleButton
          id="forever"
          className="h-12 flex-1 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
        >
          不过期
        </ToggleButton>
        <ToggleButton
          id="date"
          className="h-12 flex-1 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
        >
          指定时间
        </ToggleButton>
      </Choices>
      {mode === 'date' ? (
        <DatePicker
          isDisabled={disabled}
          value={value}
          onChange={onChange}
          granularity="minute"
          hourCycle={24}
          className="gap-2"
        >
          <Label className="text-sm">截止时间</Label>
          <DateInputGroup className="min-h-12 w-full rounded-lg border border-border bg-transparent px-2">
            <DateInputGroup.Input className="min-w-0 text-sm">
              {(segment) => <DateInputGroup.Segment segment={segment} />}
            </DateInputGroup.Input>
            <DateInputGroup.Suffix>
              <DatePicker.Trigger aria-label="打开日历" className="size-11">
                <CalendarClock size={18} aria-hidden />
              </DatePicker.Trigger>
            </DateInputGroup.Suffix>
          </DateInputGroup>
          <DatePicker.Popover className="max-w-[calc(100vw-32px)] rounded-xl border border-border bg-surface p-2">
            <Calendar className="w-[308px] max-w-[308px]">
              <Calendar.Header>
                <Calendar.NavButton
                  slot="previous"
                  aria-label="上个月"
                  className="size-11"
                >
                  <ChevronLeft size={16} aria-hidden />
                </Calendar.NavButton>
                <Calendar.Heading />
                <Calendar.NavButton
                  slot="next"
                  aria-label="下个月"
                  className="size-11"
                >
                  <ChevronRight size={16} aria-hidden />
                </Calendar.NavButton>
              </Calendar.Header>
              <Calendar.Grid>
                <Calendar.GridHeader>
                  {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                </Calendar.GridHeader>
                <Calendar.GridBody>
                  {(date) => <Calendar.Cell date={date} className="size-11" />}
                </Calendar.GridBody>
              </Calendar.Grid>
            </Calendar>
          </DatePicker.Popover>
        </DatePicker>
      ) : null}
      <p className="text-xs leading-5 text-muted">
        时间按站点时区 Asia/Shanghai 显示。
      </p>
    </div>
  );
}
function modalTitle(action: Action | null) {
  return action === 'manual'
    ? '手动复制地址'
    : action === 'clear'
      ? '清除访问密码'
      : action === 'disable'
        ? '停用分享'
        : action === 'enable' || action === 'enable-expired'
          ? '启用分享'
          : '重新生成地址';
}
