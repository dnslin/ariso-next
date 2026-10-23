'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { Beaker, Check, Moon, Sun, X } from 'lucide-react';
import { DEMO_PASSWORD, usePrototype } from './prototype-state';

export function DemoControls() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();
  const { startBackup, completeBackup, failBackup, resetBackup, paused } =
    usePrototype();
  function navigate(path: string) {
    router.push(path);
    setOpen(false);
  }
  return (
    <Modal isOpen={open} onOpenChange={setOpen}>
      <Button
        variant="secondary"
        className="fixed left-1/2 top-3 z-40 h-8 min-h-8 -translate-x-1/2 gap-1.5 rounded-full border border-border bg-surface px-3 text-xs shadow-sm"
        aria-label="打开原型导览"
      >
        <Beaker className="size-3.5" aria-hidden />
        原型导览
      </Button>
      <Modal.Backdrop>
        <Modal.Container size="md">
          <Modal.Dialog
            className="max-h-[calc(100dvh-32px)] rounded-3xl border border-border bg-surface p-5 sm:p-6"
            aria-label="交互原型导览"
          >
            <Modal.CloseTrigger
              className="absolute right-3 top-3"
              aria-label="关闭原型导览"
            >
              <X className="size-5" />
            </Modal.CloseTrigger>
            <Modal.Header>
              <Modal.Heading className="text-xl font-semibold">
                备份与恢复 · 交互原型
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="grid gap-5 pt-3">
              <p className="text-sm leading-6 text-muted">
                所有任务、文件数量和连接结果均为模拟。不会读取图片、连接 S3
                或修改真实站点。非演示导航入口已禁用。
              </p>
              <div className="grid gap-2">
                <Button
                  variant="secondary"
                  className="h-11 justify-start"
                  onPress={() => navigate('/settings/backup')}
                >
                  1. 创建与保存备份
                </Button>
                <Button
                  variant="secondary"
                  className="h-11 justify-start"
                  onPress={() => navigate('/setup/restore')}
                >
                  2. 在新实例中恢复
                </Button>
                <Button
                  variant="secondary"
                  className="h-11 justify-start"
                  onPress={() => {
                    startBackup();
                    navigate('/library');
                  }}
                >
                  3. 查看暂停修改状态
                </Button>
              </div>
              <div className="rounded-xl bg-default/40 p-4 text-sm leading-6">
                <p>
                  演示初始化码：<strong>ARISO-DEMO</strong>
                </p>
                <p>
                  示例备份密码：<strong>{DEMO_PASSWORD}</strong>
                </p>
                <p className="mt-1 text-xs text-muted">
                  下载的是小型演示文件，不包含真实图片，也不执行加密。创建页输入的密码不保存。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="min-h-11"
                  onPress={() => setTheme('light')}
                >
                  <Sun className="size-4" />
                  浅色
                </Button>
                <Button
                  variant="secondary"
                  className="min-h-11"
                  onPress={() => setTheme('dark')}
                >
                  <Moon className="size-4" />
                  深色
                </Button>
              </div>
              <div className="grid gap-2 border-t border-border pt-4">
                <p className="text-xs text-muted">
                  备份情景控制 · 不属于产品功能
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="tertiary"
                    className="min-h-11"
                    isDisabled={!paused}
                    onPress={() => {
                      completeBackup();
                      setOpen(false);
                    }}
                  >
                    <Check className="size-4" />
                    模拟备份完成
                  </Button>
                  <Button
                    variant="tertiary"
                    className="min-h-11"
                    onPress={() => {
                      failBackup();
                      navigate('/settings/backup');
                    }}
                  >
                    模拟读取失败
                  </Button>
                  <Button
                    variant="tertiary"
                    className="min-h-11"
                    onPress={() => {
                      resetBackup();
                      navigate('/settings/backup');
                    }}
                  >
                    重置当前任务
                  </Button>
                </div>
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
