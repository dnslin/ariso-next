'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { toast } from '@heroui/react/toast';

export const DEMO_PASSWORD = 'ariso-demo';
export const DEMO_FILE_NAME = 'ariso-demo.backup';
const storageKey = 'ariso-backup-prototype-v1';

type Backup = {
  id: string | null;
  status: 'idle' | 'preparing' | 'copying' | 'ready' | 'failed';
  progress: number;
  createdAt: number | null;
  error: string | null;
};
type CompletedBackup = {
  id: string;
  createdAt: number;
  size: string;
  imageCount: number;
};
type State = { backup: Backup; completedBackups: CompletedBackup[] };
const idle: Backup = {
  id: null,
  status: 'idle',
  progress: 0,
  createdAt: null,
  error: null,
};
type Context = State & {
  paused: boolean;
  startBackup: () => void;
  completeBackup: () => void;
  failBackup: () => void;
  cancelBackup: () => void;
  removeBackup: () => void;
  resetBackup: () => void;
  removeCompletedBackup: (id: string) => void;
};
const PrototypeContext = createContext<Context | null>(null);

function completed(state: State): State {
  const id = state.backup.id ?? `demo-${Date.now()}`;
  const createdAt = state.backup.createdAt ?? Date.now();
  return {
    backup: {
      ...state.backup,
      id,
      createdAt,
      status: 'ready',
      progress: 100,
      error: null,
    },
    completedBackups: state.completedBackups.some((item) => item.id === id)
      ? state.completedBackups
      : [
          { id, createdAt, size: '8.6 GB', imageCount: 1248 },
          ...state.completedBackups,
        ],
  };
}

export function PrototypeProvider({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(
    subscribeReady,
    clientReady,
    serverReady,
  );
  return mounted ? (
    <ClientProvider>{children}</ClientProvider>
  ) : (
    <p role="status" className="p-8 text-sm text-muted">
      正在载入交互原型…
    </p>
  );
}

const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

function ClientProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return {
        state: saved
          ? (JSON.parse(saved) as State)
          : { backup: idle, completedBackups: [] },
        error: '',
      };
    } catch {
      return {
        state: { backup: idle, completedBackups: [] } as State,
        error: '无法读取演示进度，本次从初始状态开始。',
      };
    }
  });
  const [state, setState] = useState<State>(initial.state);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.error('Prototype progress could not be saved', error);
      toast('浏览器未保存演示进度，刷新后可能重置。');
    }
  }, [state]);
  const paused =
    state.backup.status === 'preparing' || state.backup.status === 'copying';
  useEffect(() => {
    if (!paused) return;
    const timer = setInterval(
      () =>
        setState((current) => {
          if (!['preparing', 'copying'].includes(current.backup.status))
            return current;
          const elapsed = Date.now() - (current.backup.createdAt ?? Date.now());
          if (elapsed >= 45000) return completed(current);
          return {
            ...current,
            backup: {
              ...current.backup,
              status: elapsed < 3500 ? 'preparing' : 'copying',
              progress: Math.min(
                99,
                Math.max(0, Math.floor((elapsed - 3500) / 415)),
              ),
            },
          };
        }),
      500,
    );
    return () => clearInterval(timer);
  }, [paused]);
  const resetBackup = () =>
    setState((current) => ({ ...current, backup: idle }));
  const removeCompletedBackup = (id: string) =>
    setState((current) => ({
      backup: current.backup.id === id ? idle : current.backup,
      completedBackups: current.completedBackups.filter(
        (item) => item.id !== id,
      ),
    }));
  return (
    <PrototypeContext
      value={{
        ...state,
        paused,
        startBackup: () =>
          setState((current) => ({
            ...current,
            backup: {
              ...idle,
              id: `demo-${Date.now()}`,
              createdAt: Date.now(),
              status: 'preparing',
            },
          })),
        completeBackup: () => setState(completed),
        failBackup: () =>
          setState((current) => ({
            ...current,
            backup: {
              ...current.backup,
              status: 'failed',
              error: '旅行照片中的一张图片读取失败。请检查存储连接后重新备份。',
            },
          })),
        cancelBackup: resetBackup,
        resetBackup,
        removeBackup: () =>
          state.backup.id
            ? removeCompletedBackup(state.backup.id)
            : resetBackup(),
        removeCompletedBackup,
      }}
    >
      {initial.error ? (
        <div
          role="status"
          className="fixed inset-x-4 top-2 z-60 rounded-lg border border-border bg-surface p-3 text-sm"
        >
          {initial.error}
        </div>
      ) : null}
      {children}
    </PrototypeContext>
  );
}

export function usePrototype() {
  const context = useContext(PrototypeContext);
  if (!context) throw new Error('PrototypeProvider is required');
  return context;
}

export function downloadDemoBackup() {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          kind: 'ariso-backup-prototype',
          formatVersion: 1,
          createdAt: new Date().toISOString(),
          scope: 'mixed',
          imageCount: 1248,
          displaySize: '8.6 GB',
          note: '仅用于交互演示，不含图片或密钥，不是实际备份',
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = DEMO_FILE_NAME;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
