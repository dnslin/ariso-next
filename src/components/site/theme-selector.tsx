'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Label } from '@heroui/react/label';
import { Modal } from '@heroui/react/modal';
import { Radio } from '@heroui/react/radio';
import { RadioGroup } from '@heroui/react/radio-group';
import { Check, ChevronRight } from 'lucide-react';

const preferences = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function ThemeSelector({ settings = false }: { settings?: boolean }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, clientReady, serverReady);
  const label = mounted
    ? preferences.find((item) => item.value === theme)?.label
    : undefined;
  return (
    <Modal>
      <Button
        slot="trigger"
        data-testid={
          settings ? 'theme-settings-trigger' : 'theme-public-trigger'
        }
        variant={settings ? 'ghost' : 'outline'}
        isDisabled={!mounted}
        className={
          settings
            ? 'min-h-16 w-full justify-start rounded-none px-4 py-3 text-left -outline-offset-2 sm:min-h-14 min-[1200px]:px-6'
            : 'h-11 min-w-36 rounded-lg border-border bg-surface px-4 text-sm font-normal text-foreground'
        }
      >
        {settings ? (
          <span className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_20px] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_auto_20px]">
            <span className="text-sm font-medium">界面主题</span>
            <span className="col-start-1 row-start-2 mt-1 text-sm font-normal text-muted sm:col-start-2 sm:row-start-1 sm:mt-0">
              {label ?? '正在读取浏览器偏好…'}
            </span>
            <ChevronRight
              aria-hidden
              className="col-start-2 row-span-2 row-start-1 size-4 sm:col-start-3 sm:row-span-1"
            />
          </span>
        ) : (
          <>外观{label ? ` · ${label}` : ''}</>
        )}
      </Button>
      <Modal.Backdrop isDismissable>
        <Modal.Container
          placement="center"
          scroll="inside"
          className="w-full p-4 sm:w-full sm:p-4"
        >
          <Modal.Dialog
            aria-label="外观"
            className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-105 gap-3 rounded-2xl border border-border bg-surface p-6"
          >
            {({ close }) => (
              <>
                <Modal.Header className="flex h-11 flex-row items-start justify-between gap-3 p-0">
                  <Modal.Heading className="text-xl font-medium">
                    外观
                  </Modal.Heading>
                  <CloseButton
                    aria-label="关闭外观"
                    className="size-11 shrink-0 border-0 bg-transparent hover:bg-default/40"
                    onPress={close}
                  />
                </Modal.Header>
                <Modal.Body className="m-0 grid min-h-0 gap-3 overflow-y-auto p-0 text-foreground">
                  <p className="text-[13px] text-muted">
                    当前选择：{label} · 仅当前浏览器
                  </p>
                  <RadioGroup
                    aria-label="界面主题"
                    value={mounted ? theme : undefined}
                    isDisabled={!mounted}
                    onChange={setTheme}
                    className="grid gap-3"
                  >
                    {preferences.map((item) => (
                      <Radio
                        key={item.value}
                        value={item.value}
                        data-testid={`theme-option-${item.value}`}
                        className="group mt-0 min-w-0"
                      >
                        <Radio.Content className="h-12 w-full justify-center gap-2 rounded-lg border border-border bg-background text-sm font-normal data-[hovered=true]:bg-default/40 data-[focus-visible=true]:outline-2 data-[focus-visible=true]:outline-focus">
                          <Label className="text-sm font-normal">
                            {item.label}
                          </Label>
                          {theme === item.value ? (
                            <Check aria-hidden className="size-4" />
                          ) : null}
                        </Radio.Content>
                      </Radio>
                    ))}
                  </RadioGroup>
                  <p className="text-[13px] text-muted">
                    跟随系统时，随操作系统的浅／深色变化。
                  </p>
                </Modal.Body>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
