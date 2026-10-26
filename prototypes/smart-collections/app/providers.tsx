'use client';

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useRouter } from 'next/navigation';
import { RouterProvider } from '@heroui/react/rac';
import { ThemeProvider } from 'next-themes';
import { Toast, ToastProvider } from '@heroui/react/toast';
import {
  initialImages,
  initialCollections,
  type DemoImage,
  type SmartCollection,
} from './data';

type DemoContextValue = {
  images: DemoImage[];
  setImages: Dispatch<SetStateAction<DemoImage[]>>;
  collections: SmartCollection[];
  setCollections: Dispatch<SetStateAction<SmartCollection[]>>;
  scenario: string;
  setScenario: Dispatch<SetStateAction<string>>;
  reset: () => void;
};
const DemoContext = createContext<DemoContextValue | null>(null);
export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error('Prototype context is missing');
  return value;
}
export function DemoProviders({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [images, setImages] = useState(initialImages);
  const [collections, setCollections] = useState(initialCollections);
  const [scenario, setScenario] = useState('normal');
  const [round, setRound] = useState(0);
  const reset = () => {
    setImages(initialImages);
    setCollections(initialCollections);
    setScenario('normal');
    setRound((n) => n + 1);
  };
  return (
    <RouterProvider navigate={router.push}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        storageKey="ariso-smart-prototype-theme"
      >
        <DemoContext
          value={{
            images,
            setImages,
            collections,
            setCollections,
            scenario,
            setScenario,
            reset,
          }}
        >
          <div key={round}>{children}</div>
        </DemoContext>
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
