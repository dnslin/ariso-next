'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { CloseButton } from '@heroui/react/close-button';
import { Modal } from '@heroui/react/modal';
import {
  ArrowLeft,
  ChartNoAxesCombined,
  Check,
  Clock3,
  CloudUpload,
  Folder,
  HardDrive,
  Images,
  LayoutDashboard,
  Link as LinkIcon,
  Moon,
  Pause,
  SlidersHorizontal,
  Sun,
  Tags,
  Trash2,
} from 'lucide-react';
import { AdminShell } from '../../../src/components/shell/admin-shell';
import { bytes } from '../../../src/components/analytics/presentation';

const navigation = [
  ['/dashboard', '总览', LayoutDashboard],
  ['/upload', '上传', CloudUpload],
  ['/library', '图库', Images],
  ['/albums', '相册', Folder],
  ['/tags', '标签', Tags],
  ['/shares', '分享管理', LinkIcon],
  ['/trash', '回收站', Trash2],
  ['/analytics', '访问统计', ChartNoAxesCombined],
  ['/settings/storage', '存储管理', HardDrive],
  ['/settings/general', '站点设置', SlidersHorizontal],
] as const;

// 独立设计样例，不读取或修改人工预览的数据。
const storages = [
  {
    name: '独立对象存储',
    enabled: true,
    groups: [66355, 60211, 13290, 0],
    unconfirmed: 1,
    confirmed: false,
  },
  {
    name: '归档存储',
    enabled: false,
    groups: [6645, 6645, 0, 0],
    unconfirmed: 0,
    confirmed: true,
  },
];
const groups = [
  ['正常原图', 'bg-accent'],
  ['正常派生', 'bg-border'],
  ['回收站', 'bg-default'],
  ['处理中／待清理', 'bg-foreground'],
] as const;

export default function UsagePrototype() {
  const [dark, setDark] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  return (
    <AdminShell
      name="Ariso"
      navigation={navigation.map(([href, label, Icon]) => ({
        href: `http://ariso-179.localhost:4180${href}`,
        label,
        icon: <Icon />,
        ...(href === '/analytics'
          ? { section: '管理', activePaths: ['/'] }
          : {}),
      }))}
      user={
        <div className="preview-account">
          <span>A</span>
          <div>
            预览账号<small>设计原型</small>
          </div>
        </div>
      }
      footer={
        <>
          <Button
            variant="outline"
            className="h-12 flex-1 rounded-lg min-[1200px]:max-w-[200px]"
            onPress={() => setScopeOpen(true)}
          >
            占用说明
          </Button>
          <Button
            variant="outline"
            className="h-12 flex-1 rounded-lg min-[1200px]:max-w-[200px]"
            onPress={() => {
              window.location.href =
                'http://ariso-179.localhost:4180/analytics?days=7';
            }}
          >
            返回统计
          </Button>
        </>
      }
    >
      <div className="grid gap-5 pb-4">
        <div className="prototype-toolbar !mb-0">
          <span>占用页精简原型 · 示例数据</span>
          <Button
            isIconOnly
            variant="ghost"
            className="size-11 rounded-lg text-foreground hover:bg-transparent"
            aria-label={dark ? '切换浅色' : '切换深色'}
            onPress={() => {
              document.documentElement.classList.toggle('dark', !dark);
              setDark(!dark);
            }}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
        </div>
        <a
          href="http://ariso-179.localhost:4180/analytics?days=7"
          className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted"
        >
          <ArrowLeft size={16} />
          返回访问统计
        </a>
        <h1>当前存储占用</h1>
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2"
          data-testid="usage-summary"
        >
          <p className="text-lg font-medium">
            已登记{' '}
            {bytes(
              storages.reduce(
                (sum, item) => sum + item.groups.reduce((a, b) => a + b, 0),
                0,
              ),
            )}
          </p>
          <Chip color="warning" variant="soft" size="sm">
            <Clock3 size={12} aria-hidden />
            <Chip.Label>总量待确认 · 1 个对象待核对</Chip.Label>
          </Chip>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Clock3 size={14} aria-hidden />
            更新于 2026/10/10 12:01
          </p>
        </div>
        {storages.map((storage) => (
          <Card
            key={storage.name}
            className="min-w-0 gap-3 rounded-[20px] border border-border bg-surface px-4 py-5 shadow-none min-[1200px]:px-6"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="text-lg font-medium leading-[22px]">
                {storage.name}
              </h2>
              <Chip
                color={storage.enabled ? 'success' : 'default'}
                variant="soft"
                size="sm"
                className={storage.enabled ? '' : 'bg-foreground/8 text-muted'}
              >
                {storage.enabled ? (
                  <Check size={12} aria-hidden />
                ) : (
                  <Pause size={12} aria-hidden />
                )}
                <Chip.Label>{storage.enabled ? '已启用' : '已停用'}</Chip.Label>
              </Chip>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-lg font-medium leading-[22px]">
                已登记{' '}
                {bytes(storage.groups.reduce((sum, value) => sum + value, 0))}
              </p>
              {storage.unconfirmed > 0 ? (
                <Chip color="warning" variant="soft" size="sm">
                  <Clock3 size={12} aria-hidden />
                  <Chip.Label>{storage.unconfirmed} 个对象待核对</Chip.Label>
                </Chip>
              ) : null}
            </div>
            {storage.confirmed ? (
              <div
                className="flex h-3 gap-0.5 overflow-hidden"
                role="img"
                aria-label="已确认对象占用组成；具体字节数见下方"
                data-testid="usage-composition"
              >
                {storage.groups.map((value, index) =>
                  value > 0 ? (
                    <span
                      key={groups[index][0]}
                      className={`h-3 ${groups[index][1]}`}
                      style={{ flex: value }}
                    />
                  ) : null,
                )}
              </div>
            ) : null}
            <dl>
              {groups.map(([label], index) => (
                <div
                  key={label}
                  className="flex min-h-[52px] items-center justify-between gap-3 text-sm"
                >
                  <dt>{label}</dt>
                  <dd className="tabular-nums">
                    {bytes(storage.groups[index])}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Clock3 size={14} aria-hidden />
              最后确认 2026/10/09 19:10
            </p>
          </Card>
        ))}
      </div>
      <Modal isOpen={scopeOpen} onOpenChange={setScopeOpen}>
        <Modal.Backdrop>
          <Modal.Container
            placement="center"
            scroll="inside"
            className="w-full p-4 sm:w-full sm:p-4"
          >
            <Modal.Dialog
              aria-label="存储占用如何计算"
              className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 rounded-xl border border-border bg-surface p-6"
            >
              <Modal.Header className="flex flex-row items-start justify-between gap-3 p-0">
                <Modal.Heading className="text-xl font-medium">
                  存储占用如何计算
                </Modal.Heading>
                <CloseButton
                  className="size-11 shrink-0"
                  aria-label="关闭统计说明"
                  onPress={() => setScopeOpen(false)}
                />
              </Modal.Header>
              <Modal.Body className="m-0 grid min-h-0 gap-4 overflow-y-auto p-0 text-sm leading-normal">
                <p>
                  四类对象互斥计数，合计为已登记占用。有对象待核对时，总占用尚未确认，不显示完整比例。
                </p>
                <p className="text-[13px] text-muted">
                  按 Ariso 对象记录展示，不是 Bucket
                  容量或整机磁盘占用。不含数据库、日志和宿主机中转文件。
                </p>
                <p className="text-[13px] text-muted">
                  停用不清零。永久删除受理后仍可能占用空间，成功清理对象后才减少；外部手工删改可能尚未反映。
                </p>
              </Modal.Body>
              <Modal.Footer className="mt-0 p-0">
                <Button
                  variant="primary"
                  className="h-12 w-full rounded-lg"
                  onPress={() => setScopeOpen(false)}
                >
                  返回当前占用
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </AdminShell>
  );
}
