'use client';

import { Button, Input, Label, TextField } from '@heroui/react';
import { useTheme } from 'next-themes';
import { AdminShell } from '../../../../src/components/shell/admin-shell';
import { SettingsCategories } from '../../../../src/components/shell/settings-categories';

const navigation = [
  { href: '/dashboard', label: '仪表盘' },
  { href: '/images', label: '图片' },
  { href: '/settings', label: '设置' },
];
const categories = [
  { href: '/settings/basic', label: '基本设置' },
  { href: '/settings/storage', label: '存储设置' },
];

export function ShellFixture({ route }: { route: string }) {
  const { setTheme } = useTheme();
  const settings = route.startsWith('settings/');
  const content = (
    <section id="fixture-content" aria-label="验证内容">
      <h1 id="fixture-route">{route}</h1>
      <div className="flex gap-2">
        <Button id="fixture-light" onPress={() => setTheme('light')}>
          浅色
        </Button>
        <Button id="fixture-dark" onPress={() => setTheme('dark')}>
          深色
        </Button>
      </div>
      {Array.from({ length: 20 }, (_, index) => (
        <TextField key={index} className="my-4">
          <Label>验证字段 {index + 1}</Label>
          <Input
            id={`fixture-field-${index}`}
            defaultValue={`内容 ${index + 1}`}
          />
        </TextField>
      ))}
      <p id="fixture-end">正文结束</p>
    </section>
  );
  return (
    <AdminShell
      name={
        route === 'long-name'
          ? 'Ariso 一个很长的工作空间名称用于验证换行'
          : 'Ariso'
      }
      description="布局验证"
      navigation={route === 'empty' ? [] : navigation}
      user={<span>验证用户</span>}
      footer={<Button id="fixture-save">保存验证设置</Button>}
    >
      {settings ? (
        <SettingsCategories items={categories}>{content}</SettingsCategories>
      ) : (
        content
      )}
    </AdminShell>
  );
}
