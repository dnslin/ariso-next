'use client';
import type { ReactNode } from 'react';
import { I18nProvider } from '@heroui/react/rac';
import { Providers } from '../../../src/components/shell/providers';

export function PrototypeProviders({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <I18nProvider locale="zh-CN">{children}</I18nProvider>
    </Providers>
  );
}
