'use client';

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { RouterProvider } from '@heroui/react/rac';
import { Toast, ToastProvider, toast } from '@heroui/react/toast';
import { ThemeProvider } from 'next-themes';
import { initialImages, initialTemplates } from './data';
import { copyRecipe, emptyRecipe, type DemoImage, type Recipe } from './model';
import { renderEditedImage } from './raster';
import type { EditTemplate } from './template-dialog';

type History = { past: Recipe[]; current: Recipe; future: Recipe[] };
export type SaveMode = 'copy' | 'overwrite';
export type SaveResult = {
  id: string;
  source: DemoImage;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  mode: SaveMode;
  error?: string;
  resultSrc?: string;
  resultImageId?: string;
};

function usePrototypeState() {
  const router = useRouter();
  const [images, setImages] = useState<DemoImage[]>(initialImages);
  const [templates, setTemplates] = useState<EditTemplate[]>(initialTemplates);
  const [history, setHistory] = useState<Record<string, History>>({});
  const [currentId, setCurrentId] = useState('account');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState('signature');
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);
  const [saveMode, setSaveMode] = useState<SaveMode>('copy');
  const [results, setResults] = useState<SaveResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [scenario, setScenario] = useState('normal');
  const [batchMode, setBatchMode] = useState(false);
  const cancelRequested = useRef(false);
  const failureConsumed = useRef(false);
  const recipeFor = (id: string) => history[id]?.current ?? emptyRecipe();
  function changeRecipe(id: string, recipe: Recipe) {
    setHistory((all) => {
      const previous = all[id] ?? {
        past: [],
        current: emptyRecipe(),
        future: [],
      };
      return {
        ...all,
        [id]: {
          past: [...previous.past, previous.current].slice(-50),
          current: copyRecipe(recipe),
          future: [],
        },
      };
    });
    setReviewedIds((ids) => ids.filter((value) => value !== id));
  }
  function travel(id: string, direction: 'undo' | 'redo') {
    setHistory((all) => {
      const previous = all[id];
      if (!previous) return all;
      if (direction === 'undo' && previous.past.length)
        return {
          ...all,
          [id]: {
            past: previous.past.slice(0, -1),
            current: previous.past.at(-1)!,
            future: [previous.current, ...previous.future],
          },
        };
      if (direction === 'redo' && previous.future.length)
        return {
          ...all,
          [id]: {
            past: [...previous.past, previous.current],
            current: previous.future[0],
            future: previous.future.slice(1),
          },
        };
      return all;
    });
    setReviewedIds((ids) => ids.filter((value) => value !== id));
  }
  function openEditor(id: string) {
    setCurrentId(id);
    setBatchMode(false);
    setSaveMode('copy');
    router.push('/editor');
  }
  function toggleImage(id: string) {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  }
  function startBatch() {
    const template = templates.find((value) => value.id === templateId);
    if (!template || !selectedIds.length) return;
    setHistory((all) => ({
      ...all,
      ...Object.fromEntries(
        selectedIds.map((id) => [
          id,
          { past: [], current: copyRecipe(template.recipe), future: [] },
        ]),
      ),
    }));
    setReviewedIds([]);
    setBatchMode(true);
    setCurrentId(selectedIds[0]);
    setSaveMode('copy');
    router.push('/editor');
  }
  function addTemplate(
    name: string,
    recipe: Recipe,
    regions: boolean,
    watermark: boolean,
  ) {
    const saved = copyRecipe(recipe);
    if (!regions) saved.regions = [];
    if (!watermark) saved.watermark.enabled = false;
    setTemplates((all) => [
      ...all,
      { id: `template-${Date.now()}`, name, recipe: saved },
    ]);
    toast.success('模板已保存');
  }
  async function saveImages(ids: string[], retry = false) {
    if (saving) return;
    const items = images.filter((image) => ids.includes(image.id));
    const snapshot = Object.fromEntries(
      items.map((image) => [image.id, copyRecipe(recipeFor(image.id))]),
    );
    const mode = retry
      ? (results.find((item) => item.source.id === ids[0])?.mode ?? saveMode)
      : saveMode;
    const pending: SaveResult[] = items.map((source) => ({
      id: source.id,
      source,
      status: 'pending',
      mode,
    }));
    setResults((all) =>
      retry
        ? all.map((item) =>
            ids.includes(item.source.id)
              ? pending.find((value) => value.id === item.id)!
              : item,
          )
        : pending,
    );
    setSaving(true);
    cancelRequested.current = false;
    router.push('/results');
    const update = (id: string, values: Partial<SaveResult>) =>
      setResults((all) =>
        all.map((item) => (item.id === id ? { ...item, ...values } : item)),
      );
    for (let index = 0; index < items.length; index++) {
      const image = items[index];
      if (cancelRequested.current) {
        update(image.id, { status: 'cancelled' });
        continue;
      }
      update(image.id, { status: 'processing' });
      await new Promise((resolve) => setTimeout(resolve, 550));
      if (
        scenario === 'save-error' &&
        !failureConsumed.current &&
        (items.length === 1 || index === 1)
      ) {
        failureConsumed.current = true;
        update(image.id, {
          status: 'failed',
          error: '演示保存失败，编辑内容已保留。可以重试这一项。',
        });
        continue;
      }
      try {
        const resultSrc = await renderEditedImage(image, snapshot[image.id]);
        const resultImageId =
          mode === 'copy' ? `${image.id}-edit-${Date.now()}` : image.id;
        const edited = {
          ...image,
          id: resultImageId,
          name:
            mode === 'copy'
              ? image.name.replace(/\.[^.]+$/, '') + '-编辑.png'
              : image.name,
          src: resultSrc,
          format: 'PNG',
        };
        setImages((all) =>
          mode === 'copy'
            ? [...all, edited]
            : all.map((old) => (old.id === image.id ? edited : old)),
        );
        if (mode === 'overwrite')
          setHistory((all) => ({
            ...all,
            [image.id]: { past: [], current: emptyRecipe(), future: [] },
          }));
        update(image.id, { status: 'succeeded', resultSrc, resultImageId });
      } catch (error) {
        update(image.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    setSaving(false);
  }
  function reset() {
    setImages(initialImages);
    setTemplates(initialTemplates);
    setHistory({});
    setSelectedIds([]);
    setReviewedIds([]);
    setResults([]);
    setSaveMode('copy');
    setBatchMode(false);
    setScenario('normal');
    failureConsumed.current = false;
    router.push('/library');
  }
  return {
    images,
    templates,
    setTemplates,
    history,
    recipeFor,
    changeRecipe,
    travel,
    currentId,
    setCurrentId,
    selectedIds,
    setSelectedIds,
    toggleImage,
    templateId,
    setTemplateId,
    reviewedIds,
    setReviewedIds,
    saveMode,
    setSaveMode,
    results,
    saving,
    saveImages,
    scenario,
    setScenario,
    batchMode,
    setBatchMode,
    startBatch,
    openEditor,
    addTemplate,
    reset,
    cancelPending: () => {
      cancelRequested.current = true;
    },
    resetFailure: () => {
      failureConsumed.current = false;
    },
  };
}
type DemoState = ReturnType<typeof usePrototypeState>;
const DemoContext = createContext<DemoState | null>(null);
export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error('原型状态尚未初始化');
  return context;
}
export function DemoProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const state = usePrototypeState();
  return (
    <RouterProvider navigate={router.push}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        storageKey="ariso-image-editor-theme"
      >
        <DemoContext value={state}>{children}</DemoContext>
        <ToastProvider placement="bottom end" className="bottom-28" width={340}>
          {({ toast: notification }) => (
            <Toast toast={notification} variant={notification.content.variant}>
              <Toast.Indicator />
              <Toast.Content>
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
