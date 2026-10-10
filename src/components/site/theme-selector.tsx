'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@heroui/react/button';
import { Tooltip } from '@heroui/react/tooltip';
import { Sun, Moon, Monitor } from 'lucide-react';

const preferences = [
  { value: 'light', label: '亮色', icon: Sun },
  { value: 'dark', label: '暗色', icon: Moon },
  { value: 'system', label: '自动', icon: Monitor },
];
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, clientReady, serverReady);
  const index = preferences.findIndex((item) => item.value === theme);
  const current = preferences[index];
  const next = preferences[(index + 1) % preferences.length];
  const Icon = mounted && current ? current.icon : null;
  const label =
    mounted && current
      ? `外观：${current.label}；点击切换为${next.label}`
      : '正在读取浏览器偏好';
  return (
    <Tooltip delay={200}>
      <Button
        isIconOnly
        variant="ghost"
        aria-label={label}
        data-testid="theme-trigger"
        data-theme={mounted ? theme : undefined}
        isDisabled={!mounted}
        className="size-11 shrink-0 rounded-lg p-0 text-muted hover:text-foreground [&_svg]:size-5 [--button-bg-hover:transparent]"
        onPress={() => setTheme(next.value)}
      >
        {Icon ? <Icon size={20} aria-hidden /> : null}
      </Button>
      <Tooltip.Content placement="bottom end">{label}</Tooltip.Content>
    </Tooltip>
  );
}
