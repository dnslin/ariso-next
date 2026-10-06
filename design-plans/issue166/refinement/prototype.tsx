'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { CloseButton } from '@heroui/react/close-button';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { Modal } from '@heroui/react/modal';
import { Popover } from '@heroui/react/popover';
import { Radio } from '@heroui/react/radio';
import { RadioGroup } from '@heroui/react/radio-group';
import { TextField } from '@heroui/react/textfield';
import { Tooltip } from '@heroui/react/tooltip';
import { toast } from '@heroui/react/toast';
import { CalendarDateTime } from '@internationalized/date';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  CircleCheck,
  CloudUpload,
  Copy,
  Folder,
  HardDrive,
  Images,
  Info,
  KeyRound,
  LayoutDashboard,
  Link as LinkIcon,
  Moon,
  Plus,
  SlidersHorizontal,
  Sun,
  Tags,
  Terminal,
  Trash2,
} from 'lucide-react';
import { AdminShell } from '../../../src/components/shell/admin-shell';
import {
  SettingsCategories,
  SettingsHeading,
  settingsCategories,
} from '../../../src/components/shell/settings-categories';
import { TokenExpiryField } from '../../../src/components/identity/token-expiry-field';

const DEMO_TOKEN = 'ariso_demo_only_9JmT3xP6qR8vW2yN5kL7sB4dF1hC0zA6eG8uQ2';
const navigation = [
  {
    href: '/admin',
    label: '总览',
    icon: <LayoutDashboard />,
    unavailable: true,
  },
  { href: '/upload', label: '上传', icon: <CloudUpload /> },
  { href: '/library', label: '图库', icon: <Images /> },
  { href: '/albums', label: '相册', icon: <Folder /> },
  { href: '/tags', label: '标签', icon: <Tags /> },
  {
    href: '/sharing',
    label: '分享管理',
    icon: <LinkIcon />,
    unavailable: true,
  },
  { href: '/trash', label: '回收站', icon: <Trash2 /> },
  {
    href: '/analytics',
    label: '访问统计',
    icon: <ChartNoAxesCombined />,
    section: '管理',
    unavailable: true,
  },
  { href: '/settings/storage', label: '存储管理', icon: <HardDrive /> },
  {
    href: '/settings/processing',
    label: '站点设置',
    icon: <SlidersHorizontal />,
    activePaths: ['/settings/api', '/settings/account'],
  },
];

function IconTip({
  label,
  children,
  onPress,
  onPressStart,
  keepFocus = false,
}: {
  label: string;
  children: ReactNode;
  onPress?: () => void;
  onPressStart?: () => void;
  keepFocus?: boolean;
}) {
  return (
    <Tooltip delay={150}>
      <Button
        aria-label={label}
        isIconOnly
        variant="ghost"
        className="size-11 min-w-11 rounded-lg p-0"
        onPress={onPress}
        onPressStart={onPressStart}
        preventFocusOnPress={keepFocus}
      >
        {children}
      </Button>
      <Tooltip.Content className="text-xs">{label}</Tooltip.Content>
    </Tooltip>
  );
}

function TimeInfo() {
  const [open, setOpen] = useState(false);
  const description = (
    <>
      时间按站点时区 Asia/Shanghai 显示。到期后 Token
      即失效，过期记录可能自动清理。
    </>
  );
  return (
    <>
      <span className="hidden sm:block">
        <Tooltip isOpen={open} onOpenChange={setOpen} delay={150}>
          <Button
            aria-label="时间与记录说明"
            isIconOnly
            variant="ghost"
            className="size-11 min-w-11 shrink-0 rounded-lg p-0 text-muted"
            onPress={() => setOpen(!open)}
          >
            <Info className="size-[18px]" aria-hidden />
          </Button>
          <Tooltip.Content className="max-w-72 rounded-xl border border-border bg-surface p-3 text-xs leading-relaxed text-foreground shadow-sm">
            {description}
          </Tooltip.Content>
        </Tooltip>
      </span>
      <span className="block sm:hidden">
        <Popover>
          <Button
            aria-label="时间与记录说明"
            isIconOnly
            variant="ghost"
            className="size-11 min-w-11 shrink-0 rounded-lg p-0 text-muted"
          >
            <Info className="size-[18px]" aria-hidden />
          </Button>
          <Popover.Content
            placement="bottom"
            className="max-w-72 rounded-xl border border-border bg-surface p-3"
          >
            <Popover.Dialog
              className="text-xs leading-relaxed text-foreground"
              aria-label="时间与记录说明"
            >
              {description}
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </span>
    </>
  );
}

function UsageIcon() {
  return (
    <Popover>
      <Button
        aria-label="上传用法（尚未开放）"
        isIconOnly
        variant="ghost"
        className="size-11 min-w-11 rounded-lg p-0 text-muted"
      >
        <BookOpen className="size-[18px]" aria-hidden />
      </Button>
      <Popover.Content
        placement="bottom end"
        className="max-w-72 rounded-xl border border-border bg-surface p-4"
      >
        <Popover.Dialog className="grid gap-2 text-sm text-foreground">
          <Popover.Heading className="font-medium">
            上传用法尚未开放
          </Popover.Heading>
          <p className="text-xs leading-relaxed text-muted">
            公共上传接口交付后，这里将进入独立用法页面，提供上传命令和错误说明。
          </p>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function ExpiryPicker({
  value,
  onChange,
}: {
  value: CalendarDateTime | null;
  onChange: (value: CalendarDateTime | null) => void;
}) {
  return (
    <TokenExpiryField
      value={value}
      onChange={onChange}
      timeZone="Asia/Shanghai"
    />
  );
}

export default function TokenRefinement({
  guide = false,
}: {
  guide?: boolean;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [dialog, setDialog] = useState<'create' | 'secret' | 'confirm' | null>(
    null,
  );
  const [expiryMode, setExpiryMode] = useState('never');
  const [expiry, setExpiry] = useState<CalendarDateTime | null>(
    new CalendarDateTime(2026, 10, 7, 12, 0, 0),
  );
  const [name, setName] = useState('部署脚本');
  const [hasRecord, setHasRecord] = useState(false);
  const [copyFailure, setCopyFailure] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const secretInput = useRef<HTMLInputElement>(null);
  const pendingSelection = useRef<{
    start: number;
    end: number;
    direction: 'forward' | 'backward' | 'none';
    scroll: number;
  } | null>(null);
  const restoreSelection = useCallback(() => {
    const input = secretInput.current;
    const saved = pendingSelection.current;
    if (input && saved) {
      input.setSelectionRange(saved.start, saved.end, saved.direction);
      input.scrollLeft = saved.scroll;
    }
    pendingSelection.current = null;
  }, []);
  useLayoutEffect(restoreSelection, [copied, copyError, restoreSelection]);
  const expiryText = expiry
    ? `${expiry.year}/${String(expiry.month).padStart(2, '0')}/${String(expiry.day).padStart(2, '0')} ${String(expiry.hour).padStart(2, '0')}:${String(expiry.minute).padStart(2, '0')}:${String(expiry.second).padStart(2, '0')}`
    : '未设置';

  function close() {
    if (dialog === 'secret') setDialog('confirm');
    else if (dialog !== 'confirm') setDialog(null);
  }
  function begin() {
    setExpiryMode('never');
    setCopied(false);
    setCopyError(false);
    setDialog('create');
  }
  function captureSelection() {
    const input = secretInput.current;
    if (!input) return;
    pendingSelection.current = {
      start: input.selectionStart ?? 0,
      end: input.selectionEnd ?? 0,
      direction: input.selectionDirection ?? 'none',
      scroll: input.scrollLeft,
    };
  }
  async function copy() {
    if (!secretInput.current) return;
    if (!pendingSelection.current) captureSelection();
    let failed = false;
    try {
      if (copyFailure) throw new Error('prototype copy failure');
      await navigator.clipboard.writeText(DEMO_TOKEN);
      setCopied(true);
      setCopyError(false);
      toast('已复制', {
        variant: 'default',
        indicator: <CircleCheck className="size-5 text-foreground" />,
        timeout: 4000,
      });
    } catch {
      failed = true;
      setCopied(false);
      setCopyError(true);
    }
    if ((failed && copyError && !copied) || (!failed && copied && !copyError))
      restoreSelection();
  }

  const controls = (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted">
      <span>交互原型 · 示例数据</span>
      <Button
        variant="ghost"
        className="min-h-11 px-2 text-xs"
        onPress={() => {
          setDialog(null);
          setHasRecord(!hasRecord);
        }}
      >
        {hasRecord ? '空列表' : '示例记录'}
      </Button>
      <Button
        variant="ghost"
        className="min-h-11 px-2 text-xs"
        onPress={() => {
          setCopyFailure(!copyFailure);
        }}
      >
        复制失败：{copyFailure ? '开' : '关'}
      </Button>
      <Button
        variant="ghost"
        className="min-h-11 px-2 text-xs"
        onPress={() =>
          router.push(guide ? '/settings/api' : '/settings/api/guide')
        }
      >
        {guide ? '返回页面原型' : '未来用法布局'}
      </Button>
      <IconTip
        label="切换主题"
        onPress={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      >
        {resolvedTheme === 'dark' ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )}
      </IconTip>
    </div>
  );

  return (
    <AdminShell
      name="Ariso"
      navigation={navigation}
      user={
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-default text-sm">
            O
          </span>
          <div className="text-sm">
            Owner<p className="text-xs">站点所有者</p>
          </div>
        </div>
      }
      footer={controls}
    >
      {guide ? (
        <div className="mx-auto grid max-w-4xl gap-6">
          <Button
            variant="ghost"
            className="w-fit min-h-11 px-0"
            onPress={() => router.push('/settings/api')}
          >
            <ArrowLeft className="size-4" />
            返回上传 API
          </Button>
          <div>
            <h1 className="flex items-center gap-3">
              <BookOpen className="size-6" />
              上传用法
            </h1>
            <p className="mt-2 text-sm text-muted">
              未来文档页面的布局示意，当前上传用法尚未开放。
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-[160px_1fr]">
            <nav className="flex gap-4 text-sm md:flex-col">
              <a href="#prepare">准备 Token</a>
              <a href="#request">上传请求</a>
              <a href="#errors">响应与错误</a>
            </nav>
            <div className="grid gap-8">
              <section id="prepare" className="grid gap-3">
                <h2 className="text-xl font-medium">准备 Token</h2>
                <p>
                  在上传 API 中创建 Token，并保存创建时显示的完整值。Token
                  仅允许上传图片，不能登录后台或管理图库。
                </p>
              </section>
              <section id="request" className="grid gap-3">
                <h2 className="text-xl font-medium">上传请求</h2>
                <p className="text-sm text-muted">
                  此处将展示请求参数和可复制的上传命令。具体内容在公共上传接口完成后提供。
                </p>
                <div className="rounded-xl border border-border bg-default p-4 font-mono text-sm">
                  上传命令待接口契约交付
                </div>
              </section>
              <section id="errors" className="grid gap-3">
                <h2 className="text-xl font-medium">响应与错误</h2>
                <p className="text-sm text-muted">
                  此处将列出真实返回值、Token 无效与上传失败的处理方式。
                </p>
              </section>
            </div>
          </div>
        </div>
      ) : (
        <>
          <SettingsHeading />
          <div className="[&_[data-slot=tabs-indicator]]:hidden [&_[role=tab][aria-selected=true]]:bg-accent">
            <SettingsCategories items={settingsCategories}>
              <Card className="gap-6 rounded-[20px] border border-border bg-surface p-5 shadow-none sm:p-6">
                <div className="grid gap-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-0">
                      <h2 className="flex items-center gap-2 whitespace-nowrap text-xl font-medium">
                        <KeyRound className="size-6 shrink-0" />
                        上传 Token
                      </h2>
                      <TimeInfo />
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="hidden sm:block">
                        <UsageIcon />
                      </span>
                      <Button
                        className="h-12 min-h-12 w-25 rounded-lg text-sm font-normal"
                        onPress={begin}
                      >
                        <Plus className="size-4" />
                        创建
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm leading-relaxed text-muted">
                      让脚本上传图片。Token 不能登录后台、浏览或管理图库。
                    </p>
                    <span className="-mt-2 block sm:hidden">
                      <UsageIcon />
                    </span>
                  </div>
                </div>
                {hasRecord ? (
                  <div className="grid min-w-0 gap-4 rounded-xl border border-border p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="grid min-w-0 gap-3">
                      <h3 className="flex items-center gap-2 font-medium">
                        <Terminal className="size-4" />
                        {name || '部署脚本'}
                      </h3>
                      <p className="text-sm">
                        已启用 ·{' '}
                        {expiryMode === 'never' ? '永不过期' : expiryText}
                      </p>
                      <p className="flex items-center gap-2 text-xs">
                        <CalendarDays className="size-4" />
                        创建于 2026/10/06 10:00
                      </p>
                      <p className="text-xs text-muted">
                        ID：demo-token-record
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-3 md:justify-end">
                      <Button
                        variant="outline"
                        className="h-12 min-h-12 w-24 rounded-lg bg-background text-sm font-normal"
                        onPress={() =>
                          toast('原型示意，未操作真实记录', {
                            variant: 'default',
                          })
                        }
                      >
                        停用
                      </Button>
                      <Button
                        variant="outline"
                        className="h-12 min-h-12 w-24 rounded-lg bg-background text-sm font-normal"
                        onPress={() => setHasRecord(false)}
                      >
                        撤销
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-44 content-center justify-items-center gap-3 py-6">
                    <KeyRound className="size-8 text-muted" />
                    <h3 className="text-base font-medium">暂无上传 Token</h3>
                    <p className="text-sm text-muted">
                      创建用于脚本上传的 Token。
                    </p>
                  </div>
                )}
              </Card>
            </SettingsCategories>
          </div>
        </>
      )}

      <Modal
        isOpen={dialog !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <Modal.Backdrop
          isDismissable={dialog !== 'confirm'}
          isKeyboardDismissDisabled={dialog === 'confirm'}
        >
          <Modal.Container placement="center" className="w-full p-4">
            <Modal.Dialog
              aria-label={
                dialog === 'create'
                  ? '创建 Token'
                  : dialog === 'confirm'
                    ? '确认关闭'
                    : '保存你的 Token'
              }
              className="relative grid max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-5 overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-foreground shadow-none sm:p-6"
            >
              <Modal.Header className="m-0 flex min-h-11 flex-row items-start justify-between gap-3 p-0">
                <Modal.Heading className="flex items-start gap-2 text-lg font-medium sm:text-[22px]">
                  <KeyRound className="mt-1 size-5" />
                  {dialog === 'create'
                    ? '创建 Token'
                    : dialog === 'confirm'
                      ? '确认关闭？'
                      : '保存你的 Token'}
                </Modal.Heading>
                <CloseButton
                  aria-label={dialog === 'confirm' ? '返回 Token' : '关闭弹窗'}
                  className="size-11 min-w-11 shrink-0 bg-transparent"
                  onPress={() =>
                    dialog === 'confirm' ? setDialog('secret') : close()
                  }
                />
              </Modal.Header>
              {dialog === 'create' ? (
                <form
                  className="grid gap-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setHasRecord(true);
                    setDialog('secret');
                  }}
                >
                  <div className="grid gap-5">
                    <p className="text-sm text-muted">
                      仅允许上传图片，可创建多个 Token。
                    </p>
                    <TextField
                      name="name"
                      value={name}
                      onChange={setName}
                      isRequired
                      className="gap-1.5"
                    >
                      <Label className="text-sm font-normal after:content-none">
                        名称
                      </Label>
                      <Input
                        autoFocus
                        autoComplete="off"
                        placeholder="例如：部署脚本"
                        className="h-12 rounded-lg border border-border bg-background px-3.5 text-sm shadow-none"
                      />
                    </TextField>
                    <RadioGroup
                      value={expiryMode}
                      onChange={setExpiryMode}
                      orientation="horizontal"
                      className="flex-col! items-stretch gap-2"
                    >
                      <Label className="text-sm font-normal">有效期</Label>
                      <div className="flex flex-wrap gap-x-6 gap-y-1">
                        {[
                          ['never', '永不过期'],
                          ['finite', '指定时间'],
                        ].map(([value, label]) => (
                          <Radio key={value} value={value}>
                            <Radio.Content className="min-h-11 gap-2.5 font-normal">
                              <Radio.Control className="border border-muted/50">
                                <Radio.Indicator />
                              </Radio.Control>
                              <Label className="text-sm font-normal">
                                {label}
                              </Label>
                            </Radio.Content>
                          </Radio>
                        ))}
                      </div>
                    </RadioGroup>
                    {expiryMode === 'finite' ? (
                      <ExpiryPicker value={expiry} onChange={setExpiry} />
                    ) : null}
                    <p className="text-xs leading-relaxed text-muted">
                      完整 Token 只显示一次，创建后请立即保存。
                    </p>
                  </div>
                  <div className="flex justify-end border-t border-border pt-4">
                    <Button
                      type="submit"
                      className="h-12 min-h-12 w-28 rounded-lg text-sm font-normal"
                    >
                      <Plus className="size-4" />
                      创建
                    </Button>
                  </div>
                </form>
              ) : dialog === 'confirm' ? (
                <>
                  <p className="text-sm leading-relaxed">
                    关闭后无法再次查看完整
                    Token。请先确认已将它保存在你信任的位置。
                  </p>
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button
                      variant="outline"
                      className="h-12 rounded-lg text-sm font-normal"
                      onPress={() => setDialog('secret')}
                    >
                      返回复制
                    </Button>
                    <Button
                      className="h-12 rounded-lg text-sm font-normal"
                      onPress={() => {
                        setDialog(null);
                        setCopied(false);
                        setCopyError(false);
                      }}
                    >
                      仍然关闭
                    </Button>
                  </div>
                </>
              ) : (
                <div className="grid gap-4">
                  <p className="text-sm">
                    {name || '部署脚本'} ·{' '}
                    {expiryMode === 'never'
                      ? '永不过期'
                      : `到期于 ${expiryText}`}
                  </p>
                  <div className="flex min-w-0 items-center gap-1 rounded-xl border border-border bg-default p-1.5">
                    <Input
                      ref={secretInput}
                      aria-label="完整 Token"
                      readOnly
                      value={DEMO_TOKEN}
                      className="h-11 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-2.5 font-mono text-sm shadow-none"
                    />
                    <IconTip
                      keepFocus
                      onPressStart={captureSelection}
                      label={
                        copied
                          ? '已复制'
                          : copyError
                            ? '再次复制 Token'
                            : '复制 Token'
                      }
                      onPress={() => void copy()}
                    >
                      {copied ? (
                        <Check className="size-[18px]" />
                      ) : (
                        <Copy className="size-[18px]" />
                      )}
                    </IconTip>
                  </div>
                  {copyError ? (
                    <p
                      role="alert"
                      className="text-xs leading-relaxed text-danger"
                    >
                      无法自动复制。请选中上方完整 Token
                      手动复制，或点击复制图标重试。
                    </p>
                  ) : null}
                  <p className="text-xs leading-relaxed text-muted">
                    关闭后无法再次查看。请将完整 Token 保存在你信任的位置。
                  </p>
                </div>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </AdminShell>
  );
}
