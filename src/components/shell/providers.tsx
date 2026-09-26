'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toast, ToastProvider } from '@heroui/react/toast';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={client}>
        {children}
        <ToastProvider aria-label="操作通知" placement="top">
          {({ toast: notification }) => (
            <Toast toast={notification} variant={notification.content.variant}>
              <Toast.Indicator variant={notification.content.variant} />
              <Toast.Content>
                <Toast.Title>{notification.content.title}</Toast.Title>
                {notification.content.description ? (
                  <Toast.Description>
                    {notification.content.description}
                  </Toast.Description>
                ) : null}
              </Toast.Content>
              <Toast.CloseButton aria-label="关闭通知" className="size-11" />
            </Toast>
          )}
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
