'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Tabs } from '@heroui/react/tabs';
import { Select } from '@heroui/react/select';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import {
  KeyRound,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';

export const settingsCategories = [
  {
    href: '/settings/processing',
    label: '图片处理',
    icon: <SlidersHorizontal className="size-4" aria-hidden />,
  },
  {
    href: '/settings/account',
    label: '账号与安全',
    icon: <ShieldCheck className="size-4" aria-hidden />,
  },
  {
    href: '/settings/api',
    label: '上传 API',
    icon: <KeyRound className="size-4" aria-hidden />,
  },
];

export function SettingsHeading() {
  return (
    <div className="grid gap-1.5">
      <h1 className="flex items-center gap-2.5 text-[30px] font-medium leading-normal">
        <Settings className="size-6 shrink-0" aria-hidden />
        站点设置
      </h1>
      <p className="text-sm leading-normal">管理站点、图片处理与账号偏好。</p>
    </div>
  );
}

/** 只提供已有分类；页面负责未保存输入、提交及离开处理。 */
export function SettingsCategories({
  items,
  children,
}: {
  items: readonly { href: string; label: string; icon?: ReactNode }[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <Tabs
      className="outline-none"
      selectedKey={pathname}
      onSelectionChange={(key) => router.push(String(key))}
      keyboardActivation="manual"
    >
      <div className="settings-desktop">
        <Tabs.ListContainer className="w-fit max-w-full rounded-2xl">
          <Tabs.List aria-label="设置分类" className="rounded-2xl p-1">
            {items.map(({ href, label, icon }) => (
              <Tabs.Tab
                key={href}
                id={href}
                className="h-11 w-auto shrink-0 gap-2 rounded-xl whitespace-nowrap"
              >
                {icon}
                {label}
                <Tabs.Indicator className="rounded-xl shadow-none" />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </div>
      <div className="settings-mobile">
        <Select
          value={pathname}
          onChange={(key) => {
            if (key !== null) router.push(String(key));
          }}
        >
          <Label>设置分类</Label>
          <Select.Trigger className="min-h-11 rounded-xl border border-border bg-background px-3 shadow-none">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {items.map(({ href, label, icon }) => (
                <ListBox.Item
                  key={href}
                  id={href}
                  textValue={label}
                  className="min-h-11"
                >
                  <span className="flex items-center gap-2">
                    {icon}
                    {label}
                  </span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
      <Tabs.Panel id={pathname} className="p-0">
        {children}
      </Tabs.Panel>
    </Tabs>
  );
}
