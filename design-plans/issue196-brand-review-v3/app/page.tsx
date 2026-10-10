'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { toast } from '@heroui/react/toast';
import {
  ArrowLeft,
  ChartNoAxesCombined,
  CloudUpload,
  Folder,
  HardDrive,
  Images,
  LayoutDashboard,
  Link as LinkIcon,
  SlidersHorizontal,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { AdminShell } from '../../../src/components/shell/admin-shell';
import { PublicShell } from '../../../src/components/shell/public-shell';
import { LoginDemo } from './login-demo';
import { RemovalDemo, type ReadOutcome } from './removal-demo';
import { Mark, type Asset, type Kind } from './brand-mark';
import { MaterialRow } from './material-row';
import { Skeleton } from '@heroui/react/skeleton';

type Scenario =
  'normal' | 'loading' | 'read-error' | 'failed' | 'unknown' | 'missing';
type Phase =
  | 'selected'
  | 'saving'
  | 'failed'
  | 'unknown'
  | 'checking'
  | 'check-error'
  | 'different';
type View = 'settings' | 'preview' | 'login';
const cardClass =
  'min-w-0 gap-3 rounded-[20px] border border-border bg-surface p-4 shadow-none min-[1200px]:px-6 min-[1200px]:py-5';
const buttonClass = 'min-h-12 rounded-lg px-5 text-sm';
const selectClass =
  'min-h-11 rounded-lg border border-border bg-background p-2 text-foreground';
const navigation = [
  ...[
    { href: '/dashboard', label: '总览', icon: <LayoutDashboard /> },
    { href: '/upload', label: '上传', icon: <CloudUpload /> },
    { href: '/library', label: '图库', icon: <Images /> },
    { href: '/albums', label: '相册', icon: <Folder /> },
    { href: '/tags', label: '标签', icon: <Tags /> },
    { href: '/shares', label: '分享管理', icon: <LinkIcon /> },
    { href: '/trash', label: '回收站', icon: <Trash2 /> },
    {
      href: '/analytics',
      label: '访问统计',
      icon: <ChartNoAxesCombined />,
      section: '管理',
    },
    { href: '/settings/storage', label: '存储管理', icon: <HardDrive /> },
  ].map((item) => ({ ...item, unavailable: true })),
  { href: '/', label: '站点设置', icon: <SlidersHorizontal /> },
];

export default function Prototype() {
  const [view, setView] = useState<View>('login');
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [customText, setCustomText] = useState(false);
  const [saved, setSaved] = useState<Record<Kind, Asset>>({
    Logo: null,
    Favicon: null,
  });
  const [kind, setKind] = useState<Kind>('Logo');
  const [selected, setSelected] = useState<Asset>(null);
  const [phase, setPhase] = useState<Phase>('selected');
  const [removeKind, setRemoveKind] = useState<Kind | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [readOutcome, setReadOutcome] = useState<ReadOutcome>('empty');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputKind = useRef<Kind>('Logo');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const checkAttempts = useRef(0);
  const { setTheme } = useTheme();
  const name = customText ? '山野相册' : 'Ariso';
  const description = customText
    ? '把走过的山、见过的光，留在这里。'
    : '图片，自在收纳。';
  const busy = phase === 'saving' || phase === 'checking';
  const uncertain = ['unknown', 'check-error', 'different'].includes(phase);
  const locked = busy || uncertain || deletePending;
  const controlsLocked = locked || removeKind !== null;
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
  function clear() {
    setSelected(null);
    setPhase('selected');
  }
  function back() {
    if (locked) return;
    clear();
    setView('settings');
  }
  function openPreview(assetKind: Kind, asset: Asset) {
    if (locked) return;
    setKind(assetKind);
    setSelected(asset);
    setPhase('selected');
    checkAttempts.current = 0;
    setView('preview');
  }
  function chooseFile(assetKind: Kind) {
    if (locked || !inputRef.current) return;
    inputKind.current = assetKind;
    setKind(assetKind);
    inputRef.current.accept =
      assetKind === 'Logo'
        ? 'image/png,image/jpeg,image/webp,image/svg+xml'
        : 'image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml';
    inputRef.current.click();
  }
  function upload() {
    if (inFlight.current || locked || !selected) return;
    inFlight.current = true;
    setPhase('saving');
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      inFlight.current = false;
      if (scenario === 'failed' || scenario === 'unknown') {
        setPhase(scenario);
        return;
      }
      setSaved((current) => ({ ...current, [kind]: selected }));
      clear();
      setView('settings');
      toast(`${kind} 已更新（原型演示）`, { variant: 'default' });
    }, 700);
  }
  function reconcileUpload() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase('checking');
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      inFlight.current = false;
      setPhase(
        readOutcome === 'error' && checkAttempts.current++ === 0
          ? 'check-error'
          : 'different',
      );
    }, 700);
  }
  const controls = (
    <details className="prototype-controls fixed top-3 right-20 z-60 max-w-[calc(100vw-104px)] rounded-lg border border-border bg-surface p-2 text-xs">
      <summary className="cursor-pointer">原型演示</summary>
      <div className="mt-2 grid gap-2">
        <p className="text-muted">第三版 · 未连接服务器</p>
        <label className="grid gap-1">
          页面
          <select
            className={selectClass}
            aria-label="演示页面"
            disabled={controlsLocked}
            value={view === 'preview' ? 'settings' : view}
            onChange={(e) => {
              if (controlsLocked) return;
              clear();
              setView(e.target.value as View);
            }}
          >
            <option value="settings">品牌设置</option>
            <option value="login">登录展示</option>
          </select>
        </label>
        <label className="grid gap-1">
          操作结果 / 页面状态
          <select
            className={selectClass}
            aria-label="演示状态"
            disabled={controlsLocked}
            value={scenario}
            onChange={(e) => {
              if (!controlsLocked) setScenario(e.target.value as Scenario);
            }}
          >
            <option value="normal">正常</option>
            <option value="loading">首次读取</option>
            <option value="read-error">读取失败</option>
            <option value="failed">上传 / 移除失败</option>
            <option value="unknown">上传 / 移除结果待核对</option>
            <option value="missing">素材缺失</option>
          </select>
        </label>
        <label className="grid gap-1">
          上传 / 删除核对演示
          <select
            className={selectClass}
            aria-label="核对结果"
            disabled={controlsLocked}
            value={readOutcome}
            onChange={(e) => setReadOutcome(e.target.value as ReadOutcome)}
          >
            <option value="empty">已无引用</option>
            <option value="retained">仍有引用</option>
            <option value="error">首次核对失败，重试已无引用</option>
          </select>
        </label>
        <Button
          variant="outline"
          className="min-h-11 rounded-lg"
          isDisabled={controlsLocked}
          onPress={() => setCustomText(!customText)}
        >
          切换示例名称与描述
        </Button>
        <Button
          variant="outline"
          className="min-h-11 rounded-lg"
          isDisabled={controlsLocked}
          onPress={() => setSaved({ Logo: 'example', Favicon: 'example' })}
        >
          设置两份示例素材
        </Button>
        <Button
          variant="outline"
          className="min-h-11 rounded-lg"
          isDisabled={controlsLocked}
          onPress={() => openPreview('Logo', 'example')}
        >
          查看示例文件预览
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="min-h-11 rounded-lg"
            onPress={() => setTheme('light')}
          >
            浅色
          </Button>
          <Button
            variant="outline"
            className="min-h-11 rounded-lg"
            onPress={() => setTheme('dark')}
          >
            深色
          </Button>
        </div>
      </div>
    </details>
  );

  if (view === 'login')
    return (
      <>
        <div className="[&_.public-content]:block! [&_.public-content]:p-0!">
          <PublicShell>
            <div className="grid min-h-dvh w-full place-items-center px-4 py-20">
              <LoginDemo />
            </div>
          </PublicShell>
        </div>
        {controls}
      </>
    );

  return (
    <>
      <AdminShell
        name={name}
        description={description}
        navigation={navigation}
        user={
          <div className="flex items-center gap-3 text-sm">
            <span className="grid size-9 place-items-center rounded-full bg-default">
              D
            </span>
            <span>
              测试所有者
              <small className="block text-xs text-muted">站点所有者</small>
            </span>
          </div>
        }
        footer={
          view === 'preview' ? (
            <div className="flex w-full gap-3 min-[1200px]:w-auto">
              <Button
                variant="outline"
                className={`${buttonClass} flex-1 min-[1200px]:w-28`}
                isDisabled={locked}
                onPress={back}
              >
                取消
              </Button>
              <Button
                className={`${buttonClass} flex-1 min-[1200px]:w-50`}
                isDisabled={locked || !selected}
                onPress={upload}
              >
                {phase === 'saving' ? '正在上传…' : `上传并替换 ${kind}`}
              </Button>
            </div>
          ) : undefined
        }
      >
        <section
          className="grid min-w-0 max-w-[960px] gap-4 pb-8"
          data-testid="branding-prototype"
        >
          <Button
            variant="ghost"
            className="min-h-11 w-fit justify-start gap-1 px-0 text-xs"
            isDisabled={locked}
            onPress={back}
          >
            <ArrowLeft className="size-4" />
            返回基本设置
          </Button>
          <h1 className="text-[28px] font-medium min-[1200px]:text-[30px]">
            {view === 'preview' ? '品牌展示预览' : 'Logo 与 Favicon'}
          </h1>
          <p className="text-[13px] text-muted">分别更新，选择文件后预览。</p>
          {view === 'settings' ? (
            scenario === 'loading' || scenario === 'read-error' ? (
              <Card
                className={cardClass}
                role={scenario === 'loading' ? 'status' : 'alert'}
              >
                {scenario === 'loading' ? (
                  <div className="grid gap-4">
                    <span className="sr-only">正在读取品牌设置…</span>
                    <Skeleton className="h-24 rounded-xl" />
                    <Skeleton className="h-24 rounded-xl" />
                  </div>
                ) : (
                  <h2 className="text-lg font-medium">品牌设置读取失败</h2>
                )}
                {scenario === 'read-error' ? (
                  <>
                    <p className="text-sm text-danger">
                      暂时无法读取配置，请重试。
                    </p>
                    <Button
                      variant="outline"
                      className={`${buttonClass} w-fit`}
                      onPress={() => setScenario('normal')}
                    >
                      重新读取
                    </Button>
                  </>
                ) : null}
              </Card>
            ) : (
              <Card className="min-w-0 gap-0 overflow-hidden rounded-[20px] border border-border bg-surface p-0 shadow-none">
                <Card.Content className="divide-y divide-border p-0">
                  {(['Logo', 'Favicon'] as const).map((assetKind) => (
                    <MaterialRow
                      key={assetKind}
                      kind={assetKind}
                      asset={saved[assetKind]}
                      missing={scenario === 'missing'}
                      disabled={locked}
                      onSelect={() => chooseFile(assetKind)}
                      onRemove={() => setRemoveKind(assetKind)}
                    />
                  ))}
                </Card.Content>
              </Card>
            )
          ) : (
            <>
              {phase === 'failed' ? (
                <div role="alert" className="grid gap-1 text-sm">
                  <p className="font-medium text-danger">素材未能更新</p>
                  <p>原素材仍有效，所选文件和预览已保留。请重试。</p>
                </div>
              ) : null}
              {uncertain || phase === 'checking' ? (
                <Card className={cardClass}>
                  <h2 className="text-lg font-medium">更新结果待核对</h2>
                  <p className="text-sm">
                    连接中断，尚不能确认更新结果。所选文件已保留。
                  </p>
                  {phase === 'check-error' ? (
                    <p role="alert" className="text-sm text-danger">
                      核对失败，更新结果仍未确认。请重新核对。
                    </p>
                  ) : null}
                  {phase === 'different' ? (
                    <>
                      <p className="text-sm font-medium">
                        服务器当前素材（演示）
                      </p>
                      <Mark
                        asset={readOutcome === 'retained' ? 'example' : null}
                      />
                      <p className="text-sm text-muted">
                        {readOutcome === 'retained'
                          ? '当前素材可能来自其他页面的更新，请选择后继续。'
                          : '服务器当前没有自定义素材，请选择后继续。'}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          className={buttonClass}
                          onPress={() => {
                            setSaved((current) => ({
                              ...current,
                              [kind]:
                                readOutcome === 'retained' ? 'example' : null,
                            }));
                            clear();
                            setView('settings');
                            setScenario('normal');
                            toast('已使用服务器当前素材（原型演示）', {
                              variant: 'default',
                            });
                          }}
                        >
                          使用服务器素材
                        </Button>
                        <Button
                          variant="outline"
                          className={buttonClass}
                          onPress={() => {
                            setScenario('normal');
                            setPhase('selected');
                          }}
                        >
                          保留文件继续上传
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      className={`${buttonClass} w-fit`}
                      isDisabled={busy}
                      onPress={reconcileUpload}
                    >
                      {phase === 'checking' ? '正在核对…' : '核对服务器素材'}
                    </Button>
                  )}
                </Card>
              ) : null}
              <Card className={cardClass}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-medium">
                    所选文件 ·{' '}
                    {phase === 'saving'
                      ? '上传中'
                      : uncertain || phase === 'checking'
                        ? '结果待核对'
                        : '待上传'}
                  </h2>
                  <Button
                    isIconOnly
                    aria-label="取消选择"
                    variant="ghost"
                    className="size-11 rounded-lg"
                    isDisabled={locked}
                    onPress={back}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <Mark asset={selected} small={kind === 'Favicon'} />
                <p className="text-sm wrap-anywhere">
                  {selected instanceof File
                    ? selected.name
                    : 'mountain-brand.png（示例）'}
                </p>
                <p className="text-xs text-muted">
                  {phase === 'saving'
                    ? '正在提交，请等待确定结果。'
                    : uncertain || phase === 'checking'
                      ? '尚不能确认当前配置，所选文件仍保留。'
                      : `准备替换 ${kind}，当前配置尚未改变。`}
                </p>
              </Card>
              <Card className={cardClass}>
                <h2 className="text-lg font-medium">展示预览 · {name}</h2>
                <Mark asset={selected} small={kind === 'Favicon'} />
                <p className="text-sm">{description}</p>
                <p className="text-xs text-muted">
                  {kind === 'Favicon'
                    ? '浏览器标签图标预览'
                    : 'Logo 与站点名称分别管理。'}
                </p>
              </Card>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            aria-label={`选择 ${kind} 文件`}
            className="hidden"
            disabled={locked}
            accept={
              kind === 'Logo'
                ? 'image/png,image/jpeg,image/webp,image/svg+xml'
                : 'image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml'
            }
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen && !locked) openPreview(inputKind.current, chosen);
              event.target.value = '';
            }}
          />
        </section>
      </AdminShell>
      {removeKind ? (
        <RemovalDemo
          kind={removeKind}
          outcome={
            scenario === 'failed' || scenario === 'unknown'
              ? scenario
              : 'normal'
          }
          readOutcome={readOutcome}
          onPendingChange={setDeletePending}
          onClose={() => {
            setRemoveKind(null);
            setDeletePending(false);
          }}
          onComplete={(removed) => {
            if (removed)
              setSaved((current) => ({ ...current, [removeKind]: null }));
            setRemoveKind(null);
            setDeletePending(false);
            setScenario('normal');
            toast(
              removed
                ? `${removeKind} 已移除（原型演示）`
                : '已保留服务器当前素材（原型演示）',
              { variant: 'default' },
            );
          }}
        />
      ) : null}
      {controls}
    </>
  );
}
