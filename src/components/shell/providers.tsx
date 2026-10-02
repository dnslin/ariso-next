'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { RouterProvider } from '@heroui/react/rac';
import { UploadProvider } from '../upload/provider';
import { ThemeProvider } from 'next-themes';
import { Toast, ToastProvider } from '@heroui/react/toast';

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [client] = useState(() => new QueryClient());
  return (
    <RouterProvider navigate={router.push}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <QueryClientProvider client={client}>
          <UploadProvider>{children}</UploadProvider>
          <ToastProvider aria-label="操作通知" placement="top">
            {({ toast: notification }) => (
              <Toast
                toast={notification}
                variant={notification.content.variant}
              >
                <Toast.Indicator variant={notification.content.variant} />
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
                  className="size-11 focus-visible:pointer-events-auto focus-visible:opacity-100"
                />
              </Toast>
            )}
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </RouterProvider>
  );
}
