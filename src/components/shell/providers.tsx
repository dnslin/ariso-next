'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { RouterProvider } from '@heroui/react/rac';
import { UploadProvider } from '../upload/provider';
import { ThemeProvider } from 'next-themes';
import { Toast, ToastProvider } from '@heroui/react/toast';

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [client] = useState(() => new QueryClient());
  return (
    <RouterProvider navigate={router.push}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <QueryClientProvider client={client}>
          <UploadProvider>{children}</UploadProvider>
          <ToastProvider
            aria-label="操作通知"
            placement="bottom end"
            width={420}
            className={
              pathname === '/settings/processing' ||
              pathname === '/settings/general' ||
              pathname === '/settings/email' ||
              pathname.startsWith('/shares/')
                ? 'bottom-[100px] sm:end-7'
                : 'bottom-6 sm:end-7 sm:bottom-7'
            }
          >
            {({ toast: notification }) => (
              <Toast
                toast={notification}
                variant={notification.content.variant}
                className="gap-3 rounded-xl p-4"
              >
                <Toast.Indicator variant={notification.content.variant}>
                  {notification.content.indicator}
                </Toast.Indicator>
                <Toast.Content className="min-w-0 pr-8 wrap-anywhere">
                  <Toast.Title>{notification.content.title}</Toast.Title>
                  {notification.content.description ? (
                    <Toast.Description>
                      {notification.content.description}
                    </Toast.Description>
                  ) : null}
                </Toast.Content>
                <Toast.CloseButton
                  aria-label="关闭通知"
                  className="pointer-events-auto size-11 border-0 bg-transparent opacity-100"
                />
              </Toast>
            )}
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </RouterProvider>
  );
}
