'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Chip,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  NumberField,
  Radio,
  RadioGroup,
  TextField,
  toast,
} from '@heroui/react';
import {
  ArrowLeft,
  Check,
  ChartNoAxesCombined,
  CloudUpload,
  Eye,
  Folder,
  Globe,
  HardDrive,
  Images,
  LayoutDashboard,
  Link as LinkIcon,
  Palette,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Tags,
  Trash2,
  UserRound,
} from 'lucide-react';
import { AdminShell } from '../../../../src/components/shell/admin-shell';
import {
  SettingsCategories,
  SettingsHeading,
  settingsCategories,
} from '../../../../src/components/shell/settings-categories';
import { RelatedSetting } from '../../../../src/components/site/related-settings';
import { StorageTip } from '../../../../src/components/storage/storage-tip';
import { VisitorPreview } from './visitor-preview';
import { usePreviewSettings } from './providers';

type Mode = 'off' | 'observe' | 'enforce';
type Draft = { mode: Mode; rate: number; burst: number };
type Phase = 'ready' | 'saving' | 'error' | 'unknown' | 'checking' | 'expired';
type Scenario = 'normal' | 'save-error' | 'save-unknown' | 'session' | 'ip';
const initial: Draft = { mode: 'observe', rate: 10, burst: 200 };
const generalPath = '/settings/general';
const protectionPath = '/settings/general/access-protection';
const modeLabels: Record<Mode, string> = {
  off: '关闭',
  observe: '仅观察',
  enforce: '启用拦截',
};
const cardClass =
  'min-w-0 gap-5 rounded-[20px] border border-border bg-surface p-4 shadow-none min-[1200px]:p-6';
const navigation = [
  { href: '/dashboard', label: '总览', icon: <LayoutDashboard /> },
  { href: '/upload', label: '上传', icon: <CloudUpload /> },
  { href: '/library', label: '图库', icon: <Images /> },
  { href: '/albums', label: '相册', icon: <Folder /> },
  { href: '/tags', label: '标签', icon: <Tags /> },
  { href: '/shares', label: '分享', icon: <LinkIcon /> },
  { href: '/trash', label: '回收站', icon: <Trash2 /> },
  {
    href: '/analytics',
    label: '访问统计',
    icon: <ChartNoAxesCombined />,
    section: '管理',
  },
  { href: '/settings/storage', label: '存储', icon: <HardDrive /> },
  {
    href: generalPath,
    label: '站点设置',
    icon: <SlidersHorizontal />,
    activePaths: ['/'],
  },
];

export function Prototype() {
  const pathname = usePathname();
  const router = useRouter();
  const general = pathname === generalPath;
  const { saved, setSaved } = usePreviewSettings();
  const [draft, setDraft] = useState<Draft>(saved);
  const [phase, setPhase] = useState<Phase>('ready');
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [errors, setErrors] = useState<{ rate?: string; burst?: string }>({});
  const [review, setReview] = useState(false);
  const [visitor, setVisitor] = useState(false);
  const [leave, setLeave] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateInput = useRef<HTMLInputElement>(null);
  const burstInput = useRef<HTMLInputElement>(null);
  const submitted = useRef<Draft>(initial);
  const dirty =
    draft.mode !== saved.mode ||
    !Object.is(draft.rate, saved.rate) ||
    !Object.is(draft.burst, saved.burst);
  const busy = phase === 'saving' || phase === 'checking';
  const locked = busy || phase === 'unknown' || phase === 'expired';
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!dirty || visitor) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, visitor]);

  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (phase === 'error') setPhase('ready');
    setErrors((current) => ({ ...current, [key]: undefined }));
  }
  function save(event?: FormEvent) {
    event?.preventDefault();
    if (locked || (scenario === 'ip' && draft.mode === 'enforce')) return;
    const nextErrors: typeof errors = {};
    if (draft.mode !== 'off') {
      if (!Number.isSafeInteger(draft.rate) || draft.rate < 1)
        nextErrors.rate = '请输入大于 0 的整数';
      if (!Number.isSafeInteger(draft.burst) || draft.burst < 1)
        nextErrors.burst = '请输入大于 0 的整数';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => {
        (nextErrors.rate ? rateInput : burstInput).current?.focus();
      });
      return;
    }
    const payload =
      draft.mode === 'off' ? { ...saved, mode: draft.mode } : { ...draft };
    submitted.current = payload;
    setPhase('saving');
    timer.current = setTimeout(() => {
      if (scenario === 'save-error') {
        setPhase('error');
        setScenario('normal');
        return;
      }
      if (scenario === 'save-unknown') {
        setPhase('unknown');
        return;
      }
      setSaved(payload);
      setDraft(payload);
      setPhase('ready');
      toast.success('访问防护已保存', {
        description:
          payload.mode === 'off'
            ? '已关闭匿名访问限频。'
            : `当前模式：${modeLabels[payload.mode]}。`,
      });
    }, 700);
  }
  function reconcile() {
    setPhase('checking');
    timer.current = setTimeout(() => {
      setSaved(submitted.current);
      setDraft(submitted.current);
      setPhase('ready');
      setScenario('normal');
      toast.success('已确认上次保存', {
        description: '当前显示的设置已更新。',
      });
    }, 700);
  }
  function selectScenario(next: Scenario) {
    if (timer.current) clearTimeout(timer.current);
    setScenario(next);
    setReview(false);
    setErrors({});
    setPhase(next === 'session' ? 'expired' : 'ready');
    if (general) router.push(protectionPath);
  }
  function reset() {
    toast.clear();
    if (timer.current) clearTimeout(timer.current);
    setDraft(initial);
    setSaved(initial);
    setPhase('ready');
    setScenario('normal');
    setErrors({});
    setReview(false);
    setVisitor(false);
    router.push(protectionPath);
  }
  function back() {
    if (dirty || phase === 'unknown') setLeave(true);
    else router.push(generalPath);
  }

  if (visitor) return <VisitorPreview onBack={() => setVisitor(false)} />;
  return (
    <div
      className="preview-stage"
      onClickCapture={(event) => {
        const link = (event.target as Element).closest('a[href]');
        if (!(link instanceof HTMLAnchorElement)) return;
        const url = new URL(link.href);
        if (url.hash || url.pathname === protectionPath) return;
        if ([generalPath, '/'].includes(url.pathname)) {
          if (general) return;
          event.preventDefault();
          event.stopPropagation();
          if (!busy) back();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        toast.info('此原型仅展示访问防护', {
          description: '其他页面沿用当前产品，不在本轮设计范围。',
        });
      }}
    >
      <div className="flex h-11 items-center justify-between gap-3 border-b border-border bg-default/40 px-4 text-xs">
        <span className="truncate">
          <span className="font-medium">交互原型</span>
          <span className="ml-2 text-muted">不影响真实设置</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-11 shrink-0 gap-1.5 rounded-lg px-2 text-xs"
          onPress={() => setReview(true)}
        >
          <Settings2 className="size-3.5" />
          演示场景
        </Button>
      </div>
      <AdminShell
        name="Ariso"
        navigation={navigation}
        user={
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-default">
              <UserRound className="size-4" />
            </span>
            <span className="grid gap-1 text-sm">
              <span>dnslin</span>
              <span className="text-xs text-muted">站点所有者</span>
            </span>
          </div>
        }
        footer={
          general ? (
            <>
              {['保存站点', '保存限制'].map((label) => (
                <Button
                  key={label}
                  isDisabled
                  className="h-12 min-w-0 flex-1 rounded-lg text-sm min-[1200px]:w-50 min-[1200px]:flex-none"
                >
                  <Save className="size-4" />
                  {label}
                </Button>
              ))}
            </>
          ) : (
            <>
              <span className="mr-auto text-xs text-muted" role="status">
                {dirty ? '有未保存的修改' : `当前：${modeLabels[saved.mode]}`}
              </span>
              <Button
                type="submit"
                form="protection-form"
                isDisabled={
                  locked || (scenario === 'ip' && draft.mode === 'enforce')
                }
                className="h-12 min-w-36 rounded-lg text-sm min-[1200px]:w-50"
              >
                <Save className="size-4" />
                {phase === 'saving' ? '正在保存…' : '保存'}
              </Button>
            </>
          )
        }
      >
        {general ? (
          <section className="max-w-[960px] pb-8">
            <SettingsHeading />
            <SettingsCategories
              items={settingsCategories}
              onNavigate={(href) =>
                href === generalPath
                  ? undefined
                  : toast.info('此分类不在原型范围')
              }
            >
              <div className="grid gap-5">
                <Card className={cardClass}>
                  <h2 className="flex items-center gap-2 text-lg font-medium">
                    <Globe className="size-5" />
                    站点信息
                  </h2>
                  <div className="grid gap-5 sm:grid-cols-2">
                    {[
                      ['站点名称', 'Ariso'],
                      ['站点描述', '图片，自在收纳。'],
                      ['站点公开地址', 'https://images.example.com'],
                      ['站点时区', 'Asia/Shanghai'],
                    ].map(([label, value]) => (
                      <TextField key={label} isReadOnly>
                        <Label>{label}</Label>
                        <Input
                          className="h-12 rounded-lg border border-border bg-background"
                          value={value}
                        />
                      </TextField>
                    ))}
                  </div>
                </Card>
                <Card className={cardClass}>
                  <h2 className="flex items-center gap-2 text-lg font-medium">
                    <CloudUpload className="size-5" />
                    上传限制
                  </h2>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    {[
                      ['单文件上限', '50 MiB'],
                      ['单批文件数', '20 张'],
                      ['上传队列', '500 张'],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="mb-2 text-muted">{label}</p>
                        <p>{value}</p>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card className="gap-0 overflow-hidden rounded-[20px] border border-border bg-surface p-0 shadow-none">
                  <h2 className="flex items-center gap-2 px-4 py-5 text-lg font-medium min-[1200px]:px-6">
                    <SlidersHorizontal className="size-5" />
                    关联设置
                  </h2>
                  <div className="divide-y divide-border border-t border-border">
                    <RelatedSetting
                      label="Logo 与 Favicon"
                      value="独立更新"
                      icon={Palette}
                    />
                    <RelatedSetting
                      label="默认存储"
                      value="本地存储"
                      icon={HardDrive}
                    />
                    <RelatedSetting
                      label="图片默认值"
                      value="默认公开 · 压缩图"
                      icon={Images}
                    />
                    <RelatedSetting
                      label="访问防护"
                      value={`${modeLabels[saved.mode]} · ${saved.rate} 次/秒 · 突发 ${saved.burst} 次`}
                      href={protectionPath}
                      icon={ShieldCheck}
                    />
                  </div>
                </Card>
              </div>
            </SettingsCategories>
          </section>
        ) : (
          <section className="grid min-w-0 max-w-[960px] gap-5 pb-8">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h1 className="text-[28px] font-medium min-[1200px]:text-[30px]">
                  访问防护
                </h1>
                <Chip size="sm" variant="soft" className="shrink-0">
                  {modeLabels[saved.mode]}
                </Chip>
                <StorageTip label="防护范围">
                  <p>
                    仅限制匿名图片访问。已登录所有者免于此限频，原有访问权限和上传限制不变。
                  </p>
                  <p>
                    S3
                    保持直连；规则限制获取图片地址的请求，无法限制已签发地址的重复下载。
                  </p>
                </StorageTip>
              </div>
              <Button
                variant="ghost"
                aria-label="返回基本设置"
                className="min-h-11 shrink-0 gap-2 rounded-lg px-3 text-sm"
                isDisabled={busy}
                onPress={back}
              >
                <ArrowLeft className="size-4" />
                返回
              </Button>
            </div>
            {phase === 'expired' ? (
              <Card className={cardClass} role="alert">
                <h2 className="text-lg font-medium">会话已失效</h2>
                <p className="text-sm leading-6">
                  当前输入已保留。重新登录后，可继续核对和保存设置。
                </p>
                <Button
                  variant="outline"
                  className="h-11 w-fit rounded-lg"
                  onPress={() => {
                    setPhase('ready');
                    setScenario('normal');
                    toast.info('已恢复演示会话');
                  }}
                >
                  重新登录
                </Button>
              </Card>
            ) : null}
            {scenario === 'ip' ? (
              <Card className={cardClass} role="alert">
                <h2 className="text-base font-medium">暂时无法启用拦截</h2>
                <p className="text-sm leading-6">
                  尚未确认真实访客
                  IP。请先核对代理配置，避免把所有访客识别为同一来源。仅观察和关闭仍可保存。
                </p>
              </Card>
            ) : null}
            <Form
              id="protection-form"
              className="grid gap-5"
              validationBehavior="aria"
              onSubmit={save}
            >
              <Card className={cardClass}>
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-medium">
                    <ShieldCheck className="size-5" />
                    防护模式
                  </h2>
                  <StorageTip label="防护模式">
                    <p>关闭：不记录限频命中，也不拦截。</p>
                    <p>
                      仅观察：记录可能超限的请求，访问照常放行。建议先使用此模式。
                    </p>
                    <p>启用拦截：超限时暂缓访问，额度恢复后自动放行。</p>
                  </StorageTip>
                </div>
                <RadioGroup
                  aria-label="防护模式"
                  name="protection-mode"
                  value={draft.mode}
                  onChange={(value) => change('mode', value as Mode)}
                  isDisabled={locked}
                  className="gap-3 [&_[data-slot=radio]]:mt-0!"
                >
                  {(
                    [
                      ['off', '关闭', '不记录、不拦截', ShieldOff],
                      ['observe', '仅观察', '记录，不拦截', Eye],
                      ['enforce', '启用拦截', '超限时拦截', ShieldCheck],
                    ] as const
                  ).map(([value, label, description, Icon]) => (
                    <Radio
                      key={value}
                      value={value}
                      className="gap-0 rounded-xl border border-border p-0 data-[selected=true]:border-foreground/60 data-[selected=true]:bg-default/40"
                    >
                      <Radio.Content className="min-h-14 w-full gap-3 px-4 py-3">
                        <Radio.Control className="shrink-0 border border-foreground/35 shadow-none">
                          <Radio.Indicator />
                        </Radio.Control>
                        <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <Icon className="size-4" />
                            {label}
                          </span>
                          <span className="text-xs leading-5 font-normal text-muted">
                            {description}
                          </span>
                        </span>
                      </Radio.Content>
                    </Radio>
                  ))}
                </RadioGroup>
              </Card>
              <Card className={cardClass}>
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-medium">
                    <SlidersHorizontal className="size-5" />
                    匿名访问额度
                  </h2>
                  <Button
                    variant="ghost"
                    className="min-h-11 gap-1.5 rounded-lg px-2 text-xs"
                    isDisabled={locked || draft.mode === 'off'}
                    onPress={() => {
                      setDraft((current) => ({
                        ...current,
                        rate: 10,
                        burst: 200,
                      }));
                      setErrors({});
                    }}
                  >
                    <RotateCcw className="size-3.5" />
                    使用建议值
                  </Button>
                </div>
                {draft.mode === 'off' ? (
                  <p className="text-sm text-muted">已关闭防护，原额度保留。</p>
                ) : null}
                <div className="grid items-start gap-5 sm:grid-cols-2">
                  {(
                    [
                      {
                        key: 'rate',
                        label: '持续请求频率',
                        unit: '次 / 秒 / IP',
                        description:
                          '同一 IP 每秒恢复的请求额度。不同图片、版本和匿名分享共用额度。',
                      },
                      {
                        key: 'burst',
                        label: '突发请求额度',
                        unit: '次 / IP',
                        description:
                          '最多可积累的请求额度，用于容纳相册和外链页面的集中加载。额度会按持续频率恢复，不按单张图片的热度封禁。',
                      },
                    ] as const
                  ).map((field) => (
                    <div key={field.key} className="relative min-w-0">
                      <NumberField
                        name={field.key}
                        value={draft[field.key]}
                        onChange={(value) =>
                          change(field.key, value ?? Number.NaN)
                        }
                        commitBehavior="validate"
                        validationBehavior="aria"
                        formatOptions={{
                          useGrouping: false,
                          maximumFractionDigits: 20,
                        }}
                        isDisabled={locked || draft.mode === 'off'}
                        isInvalid={!!errors[field.key]}
                        className="gap-2"
                      >
                        <Label className="flex min-h-11 items-center pr-12 text-sm font-medium">
                          {field.label}
                        </Label>
                        <NumberField.Group
                          className={`flex! h-12 rounded-lg border! bg-background shadow-none ring-0! ${errors[field.key] ? 'border-danger!' : 'border-border!'}`}
                        >
                          <NumberField.Input
                            ref={field.key === 'rate' ? rateInput : burstInput}
                            className="h-full min-w-0 flex-1 px-3"
                          />
                          <span className="shrink-0 pr-3 text-xs text-muted">
                            {field.unit}
                          </span>
                        </NumberField.Group>
                        <FieldError>{errors[field.key]}</FieldError>
                      </NumberField>
                      <div className="absolute top-0 right-0">
                        <StorageTip label={field.label}>
                          {field.description}
                        </StorageTip>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              {phase === 'error' ? (
                <div
                  role="alert"
                  className="grid gap-1 rounded-xl border border-danger/50 px-4 py-3"
                >
                  <p className="text-sm font-medium text-danger">保存失败</p>
                  <p className="text-sm leading-6">
                    设置尚未更新，当前输入已保留。请稍后重试。
                  </p>
                </div>
              ) : null}
              {phase === 'unknown' || phase === 'checking' ? (
                <Card className={cardClass} role="status">
                  <h2 className="text-base font-medium">
                    {phase === 'checking'
                      ? '正在核对已保存设置'
                      : '保存结果尚未确认'}
                  </h2>
                  <p className="text-sm leading-6">
                    当前输入已保留。先核对已保存设置，再决定是否重新提交。
                  </p>
                  <Button
                    variant="outline"
                    className="h-11 w-fit rounded-lg"
                    isDisabled={phase === 'checking'}
                    onPress={reconcile}
                  >
                    {phase === 'checking' ? '正在核对…' : '核对已保存设置'}
                  </Button>
                </Card>
              ) : null}
            </Form>
            <div className="px-1 text-[13px] leading-6">
              <p className="flex items-start gap-2">
                <Check className="mt-1 size-4 shrink-0 text-foreground" />
                <span>已登录所有者免于此限频</span>
              </p>
            </div>
          </section>
        )}
      </AdminShell>
      <Modal isOpen={review} onOpenChange={setReview}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="max-w-[520px] rounded-2xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>原型演示场景</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="grid gap-3 pb-5">
                <p className="text-sm leading-6 text-muted">
                  这些控件仅用于评审，不会出现在正式产品中。所有保存和错误均为本地模拟。
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['normal', '正常保存'],
                      ['save-error', '下次保存失败'],
                      ['save-unknown', '下次结果未知'],
                      ['session', '会话失效'],
                      ['ip', 'IP 配置待核对'],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      variant={scenario === value ? 'primary' : 'outline'}
                      className="min-h-11 rounded-lg text-sm"
                      onPress={() => selectScenario(value)}
                    >
                      {label}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-lg text-sm"
                    onPress={() => {
                      setReview(false);
                      setVisitor(true);
                    }}
                  >
                    访客限频提示
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  className="min-h-11 rounded-lg"
                  onPress={reset}
                >
                  <RotateCcw className="size-4" />
                  重置原型
                </Button>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <Modal isOpen={leave} onOpenChange={setLeave}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="max-w-[440px] rounded-2xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>
                  {phase === 'unknown'
                    ? '保存结果尚未确认'
                    : '离开前放弃修改？'}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p className="text-sm leading-6">
                  {phase === 'unknown'
                    ? '请先核对已保存设置，避免丢失本次提交的结果。'
                    : '尚未保存的内容会丢失，已保存设置保持不变。'}
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-lg"
                  onPress={() => {
                    setLeave(false);
                    rateInput.current?.focus();
                  }}
                >
                  继续编辑
                </Button>
                {phase !== 'unknown' ? (
                  <Button
                    className="h-12 flex-1 rounded-lg"
                    onPress={() => {
                      setDraft(saved);
                      setErrors({});
                      setPhase('ready');
                      setLeave(false);
                      router.push(generalPath);
                    }}
                  >
                    放弃并返回
                  </Button>
                ) : null}
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
