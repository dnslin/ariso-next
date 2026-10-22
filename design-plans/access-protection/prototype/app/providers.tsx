'use client';

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useRouter } from 'next/navigation';
import { RouterProvider } from '@heroui/react/rac';
import { ThemeProvider } from 'next-themes';
import { Toast, ToastProvider } from '@heroui/react/toast';

export type PreviewSettings = {
  mode: 'off' | 'observe' | 'enforce';
  rate: number;
  burst: number;
};
const SettingsContext = createContext<{
  saved: PreviewSettings;
  setSaved: Dispatch<SetStateAction<PreviewSettings>>;
} | null>(null);
export function usePreviewSettings() {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error('Preview settings provider is missing');
  return settings;
}

export function PrototypeProviders({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [saved, setSaved] = useState<PreviewSettings>({
    mode: 'observe',
    rate: 10,
    burst: 200,
  });
  return (
    <RouterProvider navigate={router.push}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        storageKey="ariso-protection-preview-theme"
      >
        <SettingsContext value={{ saved, setSaved }}>
          {children}
        </SettingsContext>
        <ToastProvider
          aria-label="操作通知"
          placement="bottom end"
          className="bottom-[104px]"
          width={360}
        >
          {({ toast: notification }) => (
            <Toast
              toast={notification}
              variant={notification.content.variant}
              className="gap-3 rounded-xl p-4"
            >
              <Toast.Indicator variant={notification.content.variant} />
              <Toast.Content className="min-w-0 pr-7 wrap-anywhere">
                <Toast.Title>{notification.content.title}</Toast.Title>
                <Toast.Description>
                  {notification.content.description}
                </Toast.Description>
              </Toast.Content>
              <Toast.CloseButton aria-label="关闭通知" />
            </Toast>
          )}
        </ToastProvider>
      </ThemeProvider>
    </RouterProvider>
  );
}
