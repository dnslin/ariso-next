/* eslint-disable @next/next/no-img-element -- Standalone prototype serves existing local sample images. */
import { useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Accordion } from '@heroui/react/accordion';
import { Label } from '@heroui/react/label';
import { ToggleButton } from '@heroui/react/toggle-button';
import { toast } from '@heroui/react/toast';
import {
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  Columns3,
  Copy,
  Eye,
  Grid2X2,
  Link2,
  LockKeyhole,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import {
  Choices,
  ExpiryControls,
  SettingSwitch,
} from '../../../src/app/shares/controls';
import { expiryDraft, expiryPayload } from '../../../src/app/shares/model';
import {
  ActionIconButton,
  Dialog,
  Field,
  Footer,
  Header,
  Help,
  SaveButton,
  SectionHeading,
  buttonClass,
  panelClass,
  useApp,
} from './ui';

export function SharesPage() {
  const { navigate, scenario } = useApp();
  return (
    <section className="grid gap-6 pb-6">
      <Header
        title="分享"
        help={
          <Help label="分享">
            每个相册使用一个分享地址，只展示其中的公开图片。
          </Help>
        }
      />
      {scenario === 'empty' ? (
        <div className="grid min-h-60 place-content-center justify-items-center gap-3 text-muted">
          <Link2 size={32} />
          <p>暂无分享</p>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-y border-border py-5">
          <div className="flex min-w-0 items-center gap-4">
            <img
              src="/samples/forest.jpg"
              alt="林间日记"
              className="size-16 shrink-0 rounded-lg object-cover"
            />
            <div className="grid min-w-0 gap-1">
              <p className="font-medium wrap-anywhere">林间日记</p>
              <p className="text-sm text-muted">2 张公开图片 · 分享中</p>
            </div>
          </div>
          <ActionIconButton
            label="分享设置：林间日记"
            variant="ghost"
            className="border border-border"
            onPress={() => navigate('/shares/testr')}
          >
            <Settings2 size={18} />
          </ActionIconButton>
        </div>
      )}
      <Footer>
        <span className="mr-auto text-sm text-muted">
          {scenario === 'empty' ? 0 : 1} 项
        </span>
      </Footer>
    </section>
  );
}
export function ShareSettingsPage() {
  const { navigate, scenario } = useApp();
  const initialExpired = new URLSearchParams(location.search).has('expired');
  const [enabled, setEnabled] = useState(true);
  const [expired, setExpired] = useState(initialExpired);
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [expiry, setExpiry] = useState(() =>
    expiryDraft(
      initialExpired ? '2026-10-10T00:00:00Z' : null,
      'Asia/Shanghai',
    ),
  );
  const [expiryText, setExpiryText] = useState(
    initialExpired ? '已过期' : '不过期',
  );
  const [layout, setLayout] = useState('grid');
  const [showName, setShowName] = useState(true);
  const [savedDisplay, setSavedDisplay] = useState({
    layout: 'grid',
    showName: true,
  });
  const [pending, setPending] = useState('');
  const [error, setError] = useState<{ scope: string; message: string } | null>(
    null,
  );
  const [modal, setModal] = useState<
    'rotate' | 'clear' | 'expired' | 'preview' | 'manual' | 'discard' | null
  >(null);
  const [token, setToken] = useState('forest-demo');
  const failures = useRef(new Set<string>());
  const dirty =
    layout !== savedDisplay.layout || showName !== savedDisplay.showName;
  const address = `${location.origin}/s/${token}`;
  async function save(scope: string, complete: () => void, message: string) {
    if (pending) return;
    setPending(scope);
    setError(null);
    await new Promise((resolve) =>
      setTimeout(resolve, scenario === 'slow' ? 1500 : 350),
    );
    setPending('');
    if (scenario === 'error' && !failures.current.has(scope)) {
      failures.current.add(scope);
      setError({ scope, message: '保存失败，设置未变。请重试。' });
      return;
    }
    complete();
    toast(message);
  }
  function toggle(value: boolean) {
    if (value && expired) {
      setModal('expired');
      return;
    }
    void save(
      'enabled',
      () => setEnabled(value),
      value ? '分享已启用' : '分享已停用',
    );
  }
  function saveExpiry(restore = false) {
    try {
      const payload = expiryPayload(expiry, 'Asia/Shanghai');
      void save(
        'expiry',
        () => {
          setExpiryText(
            payload ? new Date(payload).toLocaleString('zh-CN') : '不过期',
          );
          setExpired(false);
          if (restore) {
            setEnabled(true);
            setModal(null);
          }
        },
        restore ? '分享已启用' : '已保存',
      );
    } catch (cause) {
      setError({ scope: 'expiry', message: (cause as Error).message });
    }
  }
  function alert(scope: string) {
    return error?.scope === scope ? (
      <p role="alert" className="text-sm text-danger">
        {error.message}
      </p>
    ) : null;
  }
  return (
    <section
      className="grid min-w-0 gap-6 pb-6"
      data-testid="clarity-share-settings"
    >
      <Header title="分享设置">
        <ActionIconButton
          label="返回分享"
          variant="ghost"
          className="border border-border"
          onPress={() => (dirty ? setModal('discard') : navigate('/shares'))}
        >
          <ArrowLeft size={18} />
        </ActionIconButton>
      </Header>
      <p className="-mt-3 text-sm text-muted">林间日记 · 2 张公开图片</p>
      <section className={`${panelClass} grid gap-3 p-4 md:p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading
            title="分享地址"
            icon={<Link2 />}
            help={
              <Help label="分享地址">
                相册中的公开图片会自动更新。停用后地址无法访问，已解锁访客也会失效。
              </Help>
            }
          />
          <span className="text-xs text-muted" data-testid="share-status">
            {expired ? '已过期' : enabled ? '分享中' : '已停用'}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <p
            className="min-w-0 flex-1 select-text text-sm wrap-anywhere"
            aria-label="分享地址"
          >
            {address}
          </p>
          <ActionIconButton
            label="复制地址"
            variant="ghost"
            isDisabled={!enabled || expired || !!pending}
            onPress={async () => {
              try {
                await navigator.clipboard.writeText(address);
                toast('已复制');
              } catch {
                setModal('manual');
              }
            }}
          >
            <Copy size={18} />
          </ActionIconButton>
        </div>
      </section>
      <div className="grid items-start gap-5 md:grid-cols-2">
        <section className={`${panelClass} overflow-hidden`}>
          <div className="px-4 pt-4 md:px-6 md:pt-6">
            <SectionHeading title="访问设置" icon={<ShieldCheck />} />
          </div>
          <Accordion
            className="px-4 md:px-6"
            aria-label="访问设置"
            isDisabled={!!pending}
          >
            <Accordion.Item id="password">
              <Accordion.Heading>
                <Accordion.Trigger
                  aria-label="访问密码"
                  className="min-h-20 gap-3 py-4 text-sm"
                >
                  <LockKeyhole size={18} aria-hidden />
                  <span className="grid flex-1 gap-1 text-left">
                    <span>访问密码</span>
                    <span className="text-xs font-normal text-muted">
                      {hasPassword ? '已设置' : '未设置'}
                    </span>
                  </span>
                  <Accordion.Indicator>
                    <ChevronDown size={16} />
                  </Accordion.Indicator>
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body className="grid gap-3 pb-4">
                  <Field
                    label={hasPassword ? '新密码' : '密码'}
                    type="password"
                    value={password}
                    onChange={setPassword}
                    help={
                      <Help label="访问密码">
                        更改密码后，访客需要重新解锁。
                      </Help>
                    }
                  />
                  {alert('password')}
                  <div className="flex flex-wrap justify-end gap-2">
                    {hasPassword ? (
                      <Button
                        variant="outline"
                        className={buttonClass}
                        onPress={() => setModal('clear')}
                      >
                        清除密码
                      </Button>
                    ) : null}
                    <SaveButton
                      disabled={!password.trim() || !!pending}
                      onPress={() =>
                        void save(
                          'password',
                          () => {
                            setHasPassword(true);
                            setPassword('');
                          },
                          '密码已保存',
                        )
                      }
                    />
                  </div>
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item id="expiry">
              <Accordion.Heading>
                <Accordion.Trigger
                  aria-label="有效期"
                  className="min-h-20 gap-3 py-4 text-sm"
                >
                  <CalendarClock size={18} aria-hidden />
                  <span className="grid flex-1 gap-1 text-left">
                    <span>有效期</span>
                    <span
                      className={`text-xs font-normal ${expired ? 'text-danger' : 'text-muted'}`}
                    >
                      {expiryText}
                    </span>
                  </span>
                  <Accordion.Indicator>
                    <ChevronDown size={16} />
                  </Accordion.Indicator>
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body className="grid gap-3 pb-4">
                  <ExpiryControls
                    draft={expiry}
                    onChange={setExpiry}
                    timeZone="Asia/Shanghai"
                    disabled={!!pending}
                    error={
                      error?.scope === 'expiry' ? error.message : undefined
                    }
                  />
                  <div className="flex justify-end">
                    <SaveButton
                      disabled={!!pending}
                      onPress={() => saveExpiry()}
                    />
                  </div>
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          <div className="grid gap-2 border-t border-border px-4 py-3 md:px-6">
            <div className="flex items-center gap-1">
              <SettingSwitch
                label="启用分享"
                selected={enabled && !expired}
                disabled={!!pending}
                onChange={toggle}
              />
              <Help label="启用分享">
                停用后当前地址无法访问，访客授权失效。重新启用不会恢复旧的访客授权。
              </Help>
            </div>
            <div aria-live="polite">
              {pending === 'enabled' ? (
                <p className="text-xs text-muted">正在保存…</p>
              ) : null}
              {alert('enabled')}
            </div>
          </div>
        </section>
        <section className={`${panelClass} overflow-hidden`}>
          <div className="grid gap-5 p-4 md:p-6">
            <SectionHeading title="访客展示" icon={<Eye />} />
            <div className="grid gap-2">
              <Label id="share-layout">图片布局</Label>
              <Choices
                label="share-layout"
                value={layout}
                onChange={setLayout}
                disabled={!!pending}
              >
                <ToggleButton
                  id="grid"
                  className="h-12 flex-1 rounded-lg data-[selected=true]:bg-accent"
                >
                  <Grid2X2 size={18} />
                  网格
                </ToggleButton>
                <ToggleButton
                  id="masonry"
                  className="h-12 flex-1 rounded-lg data-[selected=true]:bg-accent"
                >
                  <Columns3 size={18} />
                  瀑布流
                </ToggleButton>
              </Choices>
            </div>
            <SettingSwitch
              label="显示图片名称"
              selected={showName}
              onChange={setShowName}
              disabled={!!pending}
            />
            {alert('display')}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 md:px-6">
            <span className="text-xs text-muted">
              {dirty ? '未保存' : '已保存'}
            </span>
            <SaveButton
              disabled={!dirty || !!pending}
              pending={pending === 'display'}
              onPress={() =>
                void save(
                  'display',
                  () => setSavedDisplay({ layout, showName }),
                  '已保存',
                )
              }
            />
          </div>
        </section>
      </div>
      <section
        className={`${panelClass} flex flex-wrap items-center justify-between gap-3 p-4 md:px-6`}
      >
        <div className="flex items-center gap-2 text-sm">
          <RefreshCw size={18} aria-hidden />
          <span>重新生成地址</span>
          <Help label="重新生成地址">
            旧地址和已解锁访客将失效。此操作需要确认。
          </Help>
        </div>
        <Button
          variant="outline"
          className={buttonClass}
          isDisabled={!!pending}
          onPress={() => setModal('rotate')}
        >
          重新生成
        </Button>
      </section>
      <Footer>
        <Button
          className={buttonClass}
          isDisabled={!enabled || expired || !!pending}
          onPress={() => setModal('preview')}
        >
          <Eye size={18} />
          预览
        </Button>
      </Footer>
      {modal ? (
        <Dialog
          title={
            modal === 'rotate'
              ? '重新生成地址？'
              : modal === 'clear'
                ? '清除访问密码？'
                : modal === 'expired'
                  ? '更新有效期'
                  : modal === 'preview'
                    ? '分享预览'
                    : modal === 'discard'
                      ? '放弃未保存的修改？'
                      : '复制地址'
          }
          onClose={() => {
            if (!pending) setModal(null);
          }}
          footer={
            modal === 'preview' || modal === 'manual' ? null : (
              <>
                <Button
                  variant="outline"
                  className={buttonClass}
                  isDisabled={!!pending}
                  onPress={() => setModal(null)}
                >
                  取消
                </Button>
                <Button
                  className={buttonClass}
                  isPending={!!pending}
                  onPress={() => {
                    if (modal === 'expired') return saveExpiry(true);
                    if (modal === 'discard') {
                      setModal(null);
                      navigate('/shares');
                      return;
                    }
                    void save(
                      modal,
                      () => {
                        if (modal === 'rotate')
                          setToken(`forest-demo-${Date.now()}`);
                        else setHasPassword(false);
                        setModal(null);
                      },
                      modal === 'rotate' ? '地址已更新' : '密码已清除',
                    );
                  }}
                >
                  {modal === 'expired'
                    ? '启用'
                    : modal === 'discard'
                      ? '放弃'
                      : modal === 'rotate'
                        ? '重新生成'
                        : '清除密码'}
                </Button>
              </>
            )
          }
        >
          {modal === 'preview' ? (
            <div
              className={`grid gap-4 ${savedDisplay.layout === 'grid' ? 'sm:grid-cols-2' : ''}`}
            >
              <img
                src="/samples/forest.jpg"
                alt={savedDisplay.showName ? '林间清晨' : ''}
                className="w-full rounded-lg"
              />
              <img
                src="/samples/mountain.jpg"
                alt={savedDisplay.showName ? '远山与湖' : ''}
                className="w-full rounded-lg"
              />
            </div>
          ) : modal === 'manual' ? (
            <p className="select-all text-sm wrap-anywhere">{address}</p>
          ) : modal === 'expired' ? (
            <ExpiryControls
              draft={expiry}
              onChange={setExpiry}
              timeZone="Asia/Shanghai"
              disabled={!!pending}
              error={error?.scope === 'expiry' ? error.message : undefined}
            />
          ) : (
            <p className="text-sm leading-6">
              {modal === 'rotate'
                ? '旧地址和已解锁访客将立即失效。'
                : modal === 'clear'
                  ? '清除后，持有地址的访客无需密码即可访问。'
                  : '本次展示修改不会保存。'}
            </p>
          )}
          {modal === 'rotate' || modal === 'clear' ? alert(modal) : null}
        </Dialog>
      ) : null}
    </section>
  );
}
