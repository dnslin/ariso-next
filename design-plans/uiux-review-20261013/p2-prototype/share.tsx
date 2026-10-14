import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Eye, Copy, Link2 } from 'lucide-react';
import { BatchThumbnail } from '../../../src/components/library/batch-targets';
import { SettingSwitch } from '../../../src/app/shares/controls';
import {
  Footer,
  PageHeader,
  buttonClass,
  cardClass,
  usePrototype,
} from './shared';

type ShareState = 'confirmed' | 'disabled' | 'pending';

export function ShareDemo() {
  const { mode } = usePrototype();
  const [state, setState] = useState<ShareState>('confirmed');
  const [showName, setShowName] = useState(true);
  const [savedName, setSavedName] = useState(true);
  const [feedback, setFeedback] = useState('');
  const address = `${location.origin}/s/forest?frame=1&mode=${mode}&flow=share&showName=${savedName ? '1' : '0'}`;
  const canView = state === 'confirmed';
  return (
    <div className="grid min-w-0 gap-5 pb-8">
      <Footer>
        <Button
          variant="outline"
          className={buttonClass}
          isDisabled={mode === 'before' || !canView}
          aria-describedby={
            !canView || mode === 'before' ? 'share-preview-reason' : undefined
          }
          onPress={() => window.open(address, '_blank', 'noopener')}
        >
          <Eye size={17} aria-hidden />
          {mode === 'before' ? '预览' : '查看分享'}
        </Button>
        <Button
          className={buttonClass}
          onPress={() => {
            setSavedName(showName);
            setFeedback('展示设置已保存');
          }}
        >
          保存展示
        </Button>
      </Footer>
      <PageHeader title="分享设置" />
      <p className="text-sm text-muted">
        相册：山间旅行 · 访客访问的是已保存内容
      </p>
      <p className="text-xs text-muted">
        原型状态示例（正式页面只显示当前真实状态）
      </p>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="分享状态示例"
      >
        {(
          [
            ['confirmed', '分享中 · 地址已确认'],
            ['disabled', '已停用'],
            ['pending', '地址待核对'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={state === value ? 'primary' : 'outline'}
            className={buttonClass}
            onPress={() => {
              setState(value);
              setFeedback('');
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <Card className={cardClass}>
        <div className="flex items-center gap-2">
          <Link2 size={19} aria-hidden />
          <h2 className="text-lg font-medium">分享地址</h2>
        </div>
        <div className="flex min-w-0 items-start gap-2">
          <p className="min-w-0 select-text py-2 text-sm leading-6 wrap-anywhere">
            {address.replace(/[?].*$/, '')}
          </p>
          <Button
            isIconOnly
            variant="ghost"
            className="size-11 shrink-0 rounded-lg"
            aria-label="复制分享地址"
            isDisabled={!canView}
            onPress={() => setFeedback('分享地址已复制')}
          >
            <Copy size={17} aria-hidden />
          </Button>
        </div>
        {state === 'disabled' ? (
          <p className="text-sm text-muted">分享已停用，访客无法访问。</p>
        ) : null}
        {state === 'pending' ? (
          <p className="text-sm text-muted">
            当前地址尚未确认，请先核对分享状态。
          </p>
        ) : null}
      </Card>
      <Card className={cardClass}>
        <h2 className="text-lg font-medium">展示设置</h2>
        <SettingSwitch
          label="显示图片名称"
          selected={showName}
          onChange={setShowName}
        />
        <p className="text-sm text-muted">
          访客页使用已保存设置；当前未保存的选择不会进入“查看分享”。
        </p>
        <p className="text-sm">
          当前已保存：{savedName ? '显示图片名称' : '隐藏图片名称'}
        </p>
      </Card>
      {feedback ? (
        <p role="status" className="text-sm text-muted">
          {feedback}
        </p>
      ) : null}
      <span id="share-preview-reason" className="sr-only">
        {mode === 'before'
          ? '访客页面尚未开放'
          : state === 'disabled'
            ? '分享已停用'
            : '当前地址尚未确认'}
      </span>
    </div>
  );
}

export function VisitorDemo() {
  const showName = new URLSearchParams(location.search).get('showName') !== '0';
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState('');
  return (
    <main className="mx-auto grid min-h-dvh max-w-4xl content-start gap-6 bg-background px-4 py-10 text-foreground sm:px-8">
      <p className="text-2xl font-medium">Ariso</p>
      <div className="grid gap-1">
        <h1 className="text-[28px] font-medium">山间旅行</h1>
        <p className="text-sm text-muted">已保存的访客页面示意</p>
      </div>
      {!unlocked ? (
        <Card className={`${cardClass} max-w-md`}>
          <h2 className="text-lg font-medium">输入分享密码</h2>
          <label className="grid gap-2 text-sm">
            访问密码
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError('');
              }}
              className="h-12 rounded-lg border border-border bg-background px-3"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button
            className={buttonClass}
            onPress={() => {
              if (password === '123456') setUnlocked(true);
              else setError('密码不正确；演示密码为 123456。');
            }}
          >
            查看图片
          </Button>
          <p className="text-xs text-muted">
            原型演示密码：123456。产品仍按真实访客密码规则验证。
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {['林间光影.jpg', '山间清晨.jpg', '旅行日记.jpg'].map(
            (name, index) => (
              <figure
                key={name}
                className="overflow-hidden rounded-xl border border-border bg-surface"
              >
                <BatchThumbnail
                  url={
                    index % 2 ? '/samples/mountain.jpg' : '/samples/forest.jpg'
                  }
                  className="aspect-[4/3] w-full"
                />
                {showName ? (
                  <figcaption className="p-3 text-sm">{name}</figcaption>
                ) : null}
              </figure>
            ),
          )}
        </div>
      )}
    </main>
  );
}
