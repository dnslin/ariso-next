'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Tabs } from '@heroui/react/tabs';
import { Select } from '@heroui/react/select';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';

/** 只提供已有分类；页面负责未保存输入、提交及离开处理。 */
export function SettingsCategories({
  items,
  children,
}: {
  items: readonly { href: string; label: string }[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <Tabs
      selectedKey={pathname}
      onSelectionChange={(key) => router.push(String(key))}
      keyboardActivation="manual"
    >
      <div className="settings-desktop">
        <Tabs.ListContainer>
          <Tabs.List aria-label="设置分类">
            {items.map(({ href, label }) => (
              <Tabs.Tab key={href} id={href}>
                {label}
                <Tabs.Indicator />
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
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {items.map(({ href, label }) => (
                <ListBox.Item key={href} id={href} textValue={label}>
                  {label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
      <Tabs.Panel id={pathname}>{children}</Tabs.Panel>
    </Tabs>
  );
}
