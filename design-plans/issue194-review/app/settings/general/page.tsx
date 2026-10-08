'use client';

import { useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { TextField } from '@heroui/react/textfield';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import { StorageTip } from '../../../../../src/components/storage/storage-tip';
import { Select } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';
import { toast } from '@heroui/react/toast';
import {
  Copy,
  Settings,
  HardDrive,
  SlidersHorizontal,
  ShieldCheck,
  KeyRound,
  Images,
  CloudUpload,
  Folder,
  Tags,
  Link,
  Trash2,
  ChartNoAxesCombined,
  LayoutDashboard,
  ChevronRight,
} from 'lucide-react';
import { AdminShell } from '../../../../../src/components/shell/admin-shell';
import {
  SettingsHeading,
  SettingsCategories,
} from '../../../../../src/components/shell/settings-categories';

const nav = [
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
  { href: '/shares', label: '分享管理', icon: <Link /> },
  { href: '/trash', label: '回收站', icon: <Trash2 /> },
  {
    href: '/analytics',
    label: '访问统计',
    icon: <ChartNoAxesCombined />,
    section: '管理',
    unavailable: true,
  },
  { href: '/settings/storage', label: '存储管理', icon: <HardDrive /> },
  { href: '/settings/general', label: '站点设置', icon: <SlidersHorizontal /> },
];
const categories = [
  {
    href: '/settings/general',
    label: '基本设置',
    icon: <Settings className="size-4" />,
  },
  {
    href: '/settings/processing',
    label: '图片处理',
    icon: <SlidersHorizontal className="size-4" />,
  },
  {
    href: '/settings/account',
    label: '账号与安全',
    icon: <ShieldCheck className="size-4" />,
  },
  {
    href: '/settings/api',
    label: '上传 API',
    icon: <KeyRound className="size-4" />,
  },
];
const card =
  'min-w-0 gap-4 rounded-[20px] border border-border bg-surface p-4 shadow-none min-[1200px]:px-6 min-[1200px]:py-5';
const states = [
  ['normal', '正常'],
  ['loading', '读取中'],
  ['read-error', '读取失败'],
  ['invalid', '字段错误'],
  ['saving', '保存中'],
  ['unknown', '结果未知'],
  ['reconciling', '核对中'],
  ['reconcile-error', '核对失败'],
  ['reconciled', '核对发现差异'],
  ['origin', '地址已更新'],
  ['partial', '其他模块读取失败'],
  ['empty', '无默认存储'],
  ['disabled', '默认存储停用'],
  ['uninitialized', '未初始化'],
];

function RelatedSetting({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const content = (
    <span className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_20px] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_auto_20px]">
      <span className="text-sm font-medium">{label}</span>
      <span className="col-start-1 row-start-2 mt-1 text-sm font-normal text-muted sm:col-start-2 sm:row-start-1 sm:mt-0 sm:text-right">
        {value}
      </span>
      {onPress ? (
        <ChevronRight
          aria-hidden="true"
          className="col-start-2 row-span-2 row-start-1 size-4 sm:col-start-3 sm:row-span-1"
        />
      ) : null}
    </span>
  );
  const className =
    'flex min-h-16 w-full items-center rounded-none px-4 py-3 text-left sm:min-h-14 min-[1200px]:px-6';
  return onPress ? (
    <Button
      variant="ghost"
      className={`${className} h-auto justify-start whitespace-normal`}
      onPress={onPress}
    >
      {content}
    </Button>
  ) : (
    <div className={className}>{content}</div>
  );
}

export default function Page() {
  const [state, setState] = useState('normal');
  const [input, setInput] = useState({
    name: 'Ariso',
    description: '图片，自在收纳。',
    publicUrl: 'https://images.example.com',
    timeZone: 'Asia/Shanghai',
  });
  const [savedUrl, setSavedUrl] = useState('https://images.example.com');
  const [originNotice, setOriginNotice] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  const { setTheme } = useTheme();
  const pending = [
    'unknown',
    'reconciling',
    'reconcile-error',
    'reconciled',
  ].includes(state);
  const locked = pending || state === 'saving';
  const save = () => {
    if (!input.name.trim() || !input.publicUrl.startsWith('http')) {
      setState('invalid');
      return;
    }
    if (input.publicUrl !== savedUrl) setOriginNotice(true);
    setState(
      input.publicUrl !== savedUrl || originNotice ? 'origin' : 'normal',
    );
    setSavedUrl(input.publicUrl);
    toast('站点信息已保存', { variant: 'default' });
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('地址已复制', { variant: 'default' });
    } catch {
      setManual(text);
    }
  };
  return (
    <AdminShell
      name="Ariso"
      description="图片，自在收纳。"
      navigation={nav}
      user={
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-secondary">
            验
          </span>
          <div className="text-sm">
            独立预览账号<p className="text-xs">站点所有者</p>
          </div>
        </div>
      }
      footer={
        <Button
          className="h-12 w-full rounded-lg min-[1200px]:w-[200px]"
          isDisabled={
            locked || ['loading', 'read-error', 'uninitialized'].includes(state)
          }
          onPress={save}
        >
          {state === 'saving' ? '正在保存…' : '保存站点信息'}
        </Button>
      }
    >
      <section className="pb-10">
        <SettingsHeading />
        <div className="my-4 flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2">
          <Select
            aria-label="原型状态"
            value={state}
            onChange={(v) => {
              const next = String(v);
              setState(next);
              setOriginNotice(next === 'origin');
              if (next === 'origin') setSavedUrl('https://photos.example.com');
              if (['unknown', 'reconciled', 'origin'].includes(next))
                setInput((old) => ({
                  ...old,
                  publicUrl: 'https://photos.example.com',
                }));
            }}
            className="w-48"
          >
            <Select.Trigger className="min-h-11">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {states.map(([id, label]) => (
                  <ListBox.Item
                    id={id}
                    key={id}
                    textValue={label}
                    className="min-h-11"
                  >
                    {label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <Button
            variant="outline"
            className="h-11 rounded-lg"
            onPress={() => setTheme('light')}
          >
            浅色
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-lg"
            onPress={() => setTheme('dark')}
          >
            深色
          </Button>
          <span className="text-xs text-muted">交互原型 · 示例数据</span>
        </div>
        <SettingsCategories items={categories}>
          <div className="grid gap-5">
            <p className="text-[13px] text-muted">
              站点信息独立保存；其他设置由所属模块管理。
            </p>
            {['loading', 'read-error', 'uninitialized'].includes(state) ? (
              <Card className={card}>
                <h2 className="text-lg font-medium">
                  {state === 'loading'
                    ? '正在读取站点信息'
                    : state === 'uninitialized'
                      ? '站点尚未初始化'
                      : '无法读取站点信息'}
                </h2>
                <p className="text-sm">
                  {state === 'loading'
                    ? '取得已保存设置后再编辑。'
                    : state === 'uninitialized'
                      ? '请先完成站点初始化。'
                      : '读取失败，尚未取得已保存设置。'}
                </p>
                {state === 'read-error' ? (
                  <Button
                    variant="outline"
                    className="h-11 w-fit rounded-lg"
                    onPress={() => setState('normal')}
                  >
                    重新读取
                  </Button>
                ) : null}
              </Card>
            ) : (
              <Card className={card}>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium">站点信息</h2>
                  <StorageTip label="站点信息">
                    名称和描述按普通文本显示。时区只改变时间展示，不改写历史 UTC
                    时间。
                  </StorageTip>
                </div>
                {pending ? (
                  <div
                    role="status"
                    className="grid gap-3 rounded-lg border border-border p-4"
                  >
                    <h3 className="font-medium">
                      {state === 'reconciling'
                        ? '正在核对已保存设置'
                        : state === 'reconcile-error'
                          ? '暂时无法核对'
                          : state === 'reconciled'
                            ? '已取得服务器设置'
                            : '保存结果待核对'}
                    </h3>
                    <p className="text-sm">
                      {state === 'reconciled'
                        ? '服务器当前公开地址为 https://images.example.com，与本次输入不同。读取结果不能证明上次请求从未保存。'
                        : '请求未取得确定结果，输入已保留。先读取服务器配置，再决定是否重新保存。'}
                    </p>
                    {state === 'reconciled' ? (
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          className="h-11 rounded-lg"
                          onPress={() => {
                            setInput((old) => ({
                              ...old,
                              publicUrl: 'https://images.example.com',
                            }));
                            setState('normal');
                          }}
                        >
                          使用服务器设置
                        </Button>
                        <Button
                          variant="outline"
                          className="h-11 rounded-lg"
                          onPress={() => setState('normal')}
                        >
                          保留输入继续编辑
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="h-11 w-fit rounded-lg"
                        isDisabled={state === 'reconciling'}
                        onPress={() => {
                          setState('reconciled');
                        }}
                      >
                        {state === 'reconciling'
                          ? '正在核对…'
                          : '核对已保存设置'}
                      </Button>
                    )}
                  </div>
                ) : null}
                <div className="grid gap-4 min-[1200px]:grid-cols-2 min-[1200px]:gap-5">
                  {Object.entries({
                    name: '站点名称',
                    description: '站点描述',
                    publicUrl: '站点公开地址',
                    timeZone: '站点时区',
                  }).map(([key, label]) => (
                    <TextField
                      key={key}
                      value={input[key as keyof typeof input]}
                      onChange={(value) =>
                        setInput((old) => ({ ...old, [key]: value }))
                      }
                      isDisabled={locked}
                      isInvalid={state === 'invalid' && key === 'publicUrl'}
                      validationBehavior="aria"
                      className="gap-2"
                    >
                      <Label className="text-sm font-medium">{label}</Label>
                      <Input className="h-12 rounded-lg border border-border bg-background px-3.5 text-sm shadow-none" />
                      <FieldError>
                        仅支持 HTTP(S) 根地址，不得包含子路径。
                      </FieldError>
                    </TextField>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  className="min-h-11 w-fit rounded-lg px-0 text-sm"
                  onPress={() => setExpanded(!expanded)}
                >
                  {expanded ? '收起完整地址' : '查看完整地址'}
                </Button>
                {expanded ? (
                  <p className="select-text text-sm wrap-anywhere">
                    {input.publicUrl}
                  </p>
                ) : null}
                {state === 'origin' || originNotice ? (
                  <div className="grid gap-3 border-t border-border pt-4">
                    <h3 className="font-medium">公开地址已更新</h3>
                    {[
                      ['当前公开地址', savedUrl],
                      [
                        'GitHub OAuth 回调',
                        savedUrl.replace(/\/$/, '') +
                          '/api/auth/callback/github',
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className="grid gap-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm">{label}</span>
                          <Button
                            variant="outline"
                            isIconOnly
                            aria-label={'复制' + label}
                            className="size-11 rounded-lg"
                            onPress={() => void copy(value)}
                          >
                            <Copy className="size-4" />
                          </Button>
                        </div>
                        <p className="select-text text-[13px] leading-5 wrap-anywhere">
                          {value}
                        </p>
                      </div>
                    ))}
                    <p className="text-sm leading-6">
                      请更新 GitHub OAuth 回调。全部 S3
                      浏览器直传检测结果已失效，需要重新检测。旧域名和反向代理由你维护。
                      若当前地址无法继续保存，请打开新地址并重新登录；图片 ID
                      与路径保持不变。
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        className="h-11 rounded-lg"
                        onPress={() =>
                          toast('前往存储管理重新检测 CORS', {
                            variant: 'default',
                          })
                        }
                      >
                        检查浏览器直传
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 rounded-lg"
                        onPress={() =>
                          toast('前往账号与安全配置 GitHub', {
                            variant: 'default',
                          })
                        }
                      >
                        账号与安全
                      </Button>
                    </div>
                  </div>
                ) : null}
                {manual ? (
                  <TextField value={manual} isReadOnly>
                    <Label>自动复制不可用，请手动复制</Label>
                    <Input className="h-12" />
                  </TextField>
                ) : null}
              </Card>
            )}
            <Card className="min-w-0 gap-0 overflow-hidden rounded-[20px] border border-border bg-surface p-0 shadow-none">
              <div className="px-4 pt-4 pb-3 min-[1200px]:px-6">
                <h2 className="text-lg font-medium">关联设置</h2>
                <p className="mt-1 text-[13px] text-muted">
                  各项独立管理，不随站点信息提交。
                </p>
              </div>
              <div className="divide-y divide-border border-t border-border">
                <RelatedSetting label="Logo 与 Favicon" value="尚未开放" />
                <RelatedSetting
                  label="默认存储"
                  value={
                    state === 'partial'
                      ? '读取失败，点击重试'
                      : state === 'empty'
                        ? '未设置'
                        : state === 'disabled'
                          ? '本地存储（已停用）'
                          : '本地存储'
                  }
                  onPress={
                    state === 'partial'
                      ? () => setState('normal')
                      : () =>
                          toast('在存储管理中独立选择或清空默认存储', {
                            variant: 'default',
                          })
                  }
                />
                <RelatedSetting
                  label="图片默认值与外链版本"
                  value="图片处理"
                  onPress={() =>
                    toast('在图片处理页独立保存默认值与外链版本', {
                      variant: 'default',
                    })
                  }
                />
                <RelatedSetting label="上传限制" value="尚未开放" />
                <RelatedSetting label="界面主题" value="后续独立设置" />
              </div>
            </Card>
          </div>
        </SettingsCategories>
      </section>
    </AdminShell>
  );
}
