'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from '@heroui/react/toast';
import {
  copyImageEditRecipe,
  emptyImageEditRecipe,
  hasImageEdits,
  imageEditRecipeSchema,
  type ImageEditRecipe,
} from '../../shared/image-editing';
import { notifyLibraryChanged } from '../library/library-changes';
import { useResetUpload } from '../upload/provider';
import {
  ImageEditorRequestError,
  readEditContext,
  readEditJob,
  readEditTemplates,
  saveEditTemplate,
  renameEditTemplate,
  deleteEditTemplate,
} from './client';
import { ImageEditSession } from './session';
import type {
  EditIntent,
  EditJob,
  EditTemplate,
  EditorImage,
  SaveMode,
} from './types';

type History = {
  past: ImageEditRecipe[];
  current: ImageEditRecipe;
  future: ImageEditRecipe[];
};
type Options = {
  initialView?: 'edit' | 'templates' | 'batch';
  imageIds: string[];
  requestId?: string;
  onClose: () => void;
  onChanged?: () => void;
};
const storageKey = (id: string) => `ariso:image-edit:${id}`;
function remembered(id: string): EditIntent | null {
  const stored = sessionStorage.getItem(storageKey(id));
  if (!stored) return null;
  const value = JSON.parse(stored) as EditIntent;
  return typeof value.requestId === 'string' &&
    value.sourceImageId === id &&
    ['copy', 'overwrite'].includes(value.mode) &&
    typeof value.sourceObjectId === 'string' &&
    imageEditRecipeSchema.safeParse(value.recipe).success
    ? value
    : null;
}
export function useEditorState({
  imageIds,
  requestId,
  onClose,
  onChanged,
  initialView,
}: Options) {
  const resetUpload = useResetUpload();
  const changedCallback = useRef(onChanged);
  useEffect(() => {
    changedCallback.current = onChanged;
  }, [onChanged]);
  const [images, setImages] = useState<EditorImage[]>([]);
  const latestImages = useRef<EditorImage[]>([]);
  useEffect(() => {
    latestImages.current = images;
  }, [images]);
  const [updatingSources, setUpdatingSources] = useState<string[]>([]);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [loading, setLoading] = useState(true);
  const [loadRound, setLoadRound] = useState(0);
  const [message, setMessage] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [templates, setTemplates] = useState<EditTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateError, setTemplateError] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);
  const [view, setView] = useState<'edit' | 'templates' | 'batch' | 'results'>(
    initialView ??
      (imageIds.length > 1 ? 'batch' : imageIds.length ? 'edit' : 'templates'),
  );
  const [history, setHistory] = useState<Record<string, History>>({});
  const [currentId, setCurrentId] = useState(imageIds[0] ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialView === 'templates' ? [] : imageIds,
  );
  const [templateId, setTemplateId] = useState('');
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);
  const [saveMode, setSaveMode] = useState<SaveMode>('copy');
  const [batchMode, setBatchMode] = useState(imageIds.length > 1);
  const [sessions, setSessions] = useState<ImageEditSession[]>([]);
  const [submittingBatch, setSubmittingBatch] = useState(false);
  const stop = useRef(false);
  const submitted = useRef(false);
  const sessionRefs = useRef<ImageEditSession[]>([]);
  useEffect(() => {
    sessionRefs.current = sessions;
  }, [sessions]);
  const expire = useCallback(() => {
    resetUpload();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
    );
  }, [resetUpload]);
  const handleFailure = useCallback(
    (error: unknown) => {
      if (error instanceof ImageEditorRequestError && error.status === 401)
        expire();
      return error instanceof Error ? error.message : String(error);
    },
    [expire],
  );
  const completeEdit = useCallback(
    (job: EditJob) => {
      notifyLibraryChanged();
      changedCallback.current?.();
      if (job.mode !== 'overwrite' || !mounted.current) return;
      setUpdatingSources((all) =>
        all.includes(job.sourceImageId) ? all : [...all, job.sourceImageId],
      );
      void readEditContext(job.sourceImageId)
        .then((context) => {
          if (!mounted.current) return;
          const previous = latestImages.current.find(
            (image) => image.id === job.sourceImageId,
          );
          const sourceChanged =
            previous?.sourceObjectId !== context.sourceObjectId;
          setImages((all) =>
            all.map((image) =>
              image.id === job.sourceImageId
                ? {
                    ...context,
                    id: context.imageId,
                    src: context.sourceUrl ?? '',
                    width: context.width ?? 1,
                    height: context.height ?? 1,
                  }
                : image,
            ),
          );
          if (sourceChanged) {
            setHistory((all) => {
              const next = { ...all };
              delete next[job.sourceImageId];
              return next;
            });
            setReviewedIds((all) =>
              all.filter((id) => id !== job.sourceImageId),
            );
          }
        })
        .catch((error) => {
          if (mounted.current) {
            setMessage(
              `覆盖已完成，但最新原图读取失败：${handleFailure(error)}`,
            );
            setImages((all) =>
              all.map((image) =>
                image.id === job.sourceImageId
                  ? {
                      ...image,
                      unavailableReason: '请重新读取最新原图后再编辑',
                    }
                  : image,
              ),
            );
          }
        })
        .finally(() => {
          if (mounted.current)
            setUpdatingSources((all) =>
              all.filter((id) => id !== job.sourceImageId),
            );
        });
    },
    [handleFailure],
  );
  const identity = imageIds.join(',');
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        let ids = identity.split(',').filter(Boolean);
        if (requestId) {
          const job = await readEditJob(requestId);
          ids = [job.sourceImageId];
          const session = new ImageEditSession(
            job,
            undefined,
            completeEdit,
            expire,
          );
          setSessions([session]);
          void session.read();
          setView('results');
        }
        const contexts = await Promise.all(
          ids.map(async (id) => {
            try {
              const context = await readEditContext(id, controller.signal);
              return {
                ...context,
                id,
                src: context.sourceUrl ?? '',
                width: context.width ?? 1,
                height: context.height ?? 1,
              };
            } catch (error) {
              if (controller.signal.aborted) throw error;
              return {
                id,
                imageId: id,
                name: id,
                src: '',
                format: '',
                mime: '',
                width: 1,
                height: 1,
                sourceObjectId: null,
                sourceUrl: null,
                watermarkPreview: { copy: false, overwrite: false },
                unavailableReason: handleFailure(error),
              } satisfies EditorImage;
            }
          }),
        );
        if (controller.signal.aborted) return;
        setImages(contexts);
        setCurrentId(
          contexts.find((image) => !image.unavailableReason)?.id ??
            contexts[0]?.id ??
            '',
        );
        setSelectedIds(
          initialView === 'templates'
            ? []
            : contexts
                .filter((image) => !image.unavailableReason)
                .map((image) => image.id),
        );
        if (!requestId) {
          const saved: ImageEditSession[] = [];
          for (const id of ids) {
            try {
              const reference = remembered(id);
              if (reference) {
                const session = new ImageEditSession(
                  reference,
                  reference,
                  completeEdit,
                  expire,
                );
                saved.push(session);
                void session.read();
              }
            } catch (error) {
              setMessage(
                `浏览器中保存的任务编号无法读取：${handleFailure(error)}`,
              );
            }
          }
          if (saved.length) setSessions(saved);
        }
      } catch (error) {
        if (!controller.signal.aborted) setMessage(handleFailure(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      stop.current = true;
      sessionRefs.current.forEach((session) => session.setVisible(false));
    };
  }, [
    identity,
    requestId,
    loadRound,
    handleFailure,
    initialView,
    expire,
    completeEdit,
  ]);
  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplateError('');
    try {
      setTemplates((await readEditTemplates()).templates);
    } catch (error) {
      setTemplateError(handleFailure(error));
    } finally {
      setTemplatesLoading(false);
    }
  }, [handleFailure]);
  useEffect(() => {
    const controller = new AbortController();
    void readEditTemplates(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setTemplates(response.templates);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setTemplateError(handleFailure(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setTemplatesLoading(false);
      });
    return () => controller.abort();
  }, [handleFailure]);
  useEffect(() => {
    const visible = () =>
      sessionRefs.current.forEach((session) =>
        session.setVisible(!document.hidden),
      );
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, []);
  const recipeFor = (id: string) =>
    history[id]?.current ?? emptyImageEditRecipe();
  function changeRecipe(id: string, recipe: ImageEditRecipe) {
    setHistory((all) => {
      const previous = all[id] ?? {
        past: [],
        current: emptyImageEditRecipe(),
        future: [],
      };
      return {
        ...all,
        [id]: {
          past: [...previous.past, previous.current].slice(-50),
          current: copyImageEditRecipe(recipe),
          future: [],
        },
      };
    });
    setReviewedIds((all) => all.filter((value) => value !== id));
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
    setReviewedIds((all) => all.filter((value) => value !== id));
  }
  function naturalSize(id: string, width: number, height: number) {
    setImages((all) =>
      all.map((image) =>
        image.id === id && (image.width !== width || image.height !== height)
          ? { ...image, width, height }
          : image,
      ),
    );
  }
  const startBatch = () => {
    const template = templates.find((item) => item.id === templateId);
    if (!template || !selectedIds.length) return;
    setHistory((all) => ({
      ...all,
      ...Object.fromEntries(
        selectedIds.map((id) => [
          id,
          {
            past: [],
            current: copyImageEditRecipe(template.recipe),
            future: [],
          },
        ]),
      ),
    }));
    setReviewedIds([]);
    setCurrentId(selectedIds[0]);
    setBatchMode(true);
    setSaveMode('copy');
    setView('edit');
  };
  const toggleImage = (id: string) =>
    setSelectedIds((all) =>
      all.includes(id) ? all.filter((value) => value !== id) : [...all, id],
    );
  async function addTemplate(
    name: string,
    recipe: ImageEditRecipe,
    regions: boolean,
    watermark: boolean,
  ) {
    const saved = copyImageEditRecipe(recipe);
    if (!regions) saved.regions = [];
    if (!watermark) saved.watermark.enabled = false;
    setTemplateBusy(true);
    setTemplateError('');
    try {
      const template = await saveEditTemplate(name, saved);
      setTemplates((all) => [...all, template]);
      toast.success('模板已保存');
      return true;
    } catch (error) {
      setTemplateError(handleFailure(error));
      return false;
    } finally {
      setTemplateBusy(false);
    }
  }
  async function renameTemplate(id: string, name: string) {
    try {
      const template = await renameEditTemplate(id, name);
      setTemplates((all) =>
        all.map((item) => (item.id === id ? template : item)),
      );
    } catch (error) {
      handleFailure(error);
      throw error;
    }
  }
  async function deleteTemplate(id: string) {
    try {
      await deleteEditTemplate(id);
      setTemplates((all) => all.filter((item) => item.id !== id));
      if (templateId === id) setTemplateId('');
    } catch (error) {
      handleFailure(error);
      throw error;
    }
  }
  async function returnToEditing() {
    setLoading(true);
    try {
      const fresh = await Promise.all(
        images.map(async (image) => {
          const context = await readEditContext(image.id);
          return {
            ...context,
            id: context.imageId,
            src: context.sourceUrl ?? '',
            width: context.width ?? 1,
            height: context.height ?? 1,
          };
        }),
      );
      const changedIds = new Set(
        fresh
          .filter(
            (image) =>
              image.sourceObjectId !==
              images.find((previous) => previous.id === image.id)
                ?.sourceObjectId,
          )
          .map((image) => image.id),
      );
      setImages(fresh);
      if (changedIds.size) {
        setHistory((all) =>
          Object.fromEntries(
            Object.entries(all).filter(([id]) => !changedIds.has(id)),
          ),
        );
        setReviewedIds((all) => all.filter((id) => !changedIds.has(id)));
        setMessage('原图内容已更新，已载入最新原图。请重新检查编辑区域。');
      }
      setView('edit');
    } catch (error) {
      setMessage(handleFailure(error));
    } finally {
      setLoading(false);
    }
  }
  async function submitSessions(items: ImageEditSession[]) {
    stop.current = false;
    setSubmittingBatch(true);
    try {
      for (const session of items) {
        if (stop.current) break;
        try {
          sessionStorage.setItem(
            storageKey(session.reference.sourceImageId),
            JSON.stringify(session.intentForStorage()),
          );
        } catch (error) {
          setMessage(
            `无法在浏览器保留任务编号，请保持当前页面以便核对结果：${handleFailure(error)}`,
          );
        }
        await session.submit();
      }
    } finally {
      setSubmittingBatch(false);
    }
  }
  function saveImages(ids: string[]) {
    if (submitted.current) return;
    const valid = ids.map((id) => ({
      image: images.find((image) => image.id === id),
      recipe: recipeFor(id),
    }));
    for (const item of valid) {
      const result = imageEditRecipeSchema.safeParse(item.recipe);
      if (
        !item.image?.sourceObjectId ||
        item.image.unavailableReason ||
        !result.success
      ) {
        setMessage(
          item.image?.unavailableReason ??
            result.error?.issues[0]?.message ??
            '图片尚未就绪',
        );
        return;
      }
    }
    submitted.current = true;
    const items = valid.map(({ image, recipe }) => {
      const intent = {
        requestId: crypto.randomUUID(),
        sourceImageId: image!.id,
        sourceObjectId: image!.sourceObjectId!,
        mode: saveMode,
        recipe: copyImageEditRecipe(recipe),
      };
      return new ImageEditSession(intent, intent, completeEdit, expire);
    });
    setSessions(items);
    setView('results');
    void submitSessions(items).finally(() => {
      submitted.current = false;
    });
  }
  return {
    images,
    updatingSources,
    loading,
    message,
    setMessage,
    refreshContexts: () => {
      setLoading(true);
      setLoadRound((value) => value + 1);
    },
    templates,
    templatesLoading,
    templateError,
    templateBusy,
    loadTemplates,
    view,
    setView,
    history,
    recipeFor,
    changeRecipe,
    travel,
    naturalSize,
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
    batchMode,
    setBatchMode,
    startBatch,
    addTemplate,
    renameTemplate,
    deleteTemplate,
    sessions,
    submittingBatch,
    stopPending: () => {
      stop.current = true;
    },
    resumePending: () =>
      submitSessions(
        sessions.filter((session) => session.getSnapshot().phase === 'ready'),
      ),
    saveImages,
    returnToEditing,
    onClose: () => {
      if (
        view !== 'results' &&
        Object.values(history).some((item) => hasImageEdits(item.current))
      )
        setLeaving(true);
      else onClose();
    },
    confirmClose: onClose,
    leaving,
    setLeaving,
    expire,
  };
}
type EditorState = ReturnType<typeof useEditorState>;
const Context = createContext<EditorState | null>(null);
export function ImageEditorProvider({
  children,
  ...options
}: Options & { children: ReactNode }) {
  const state = useEditorState(options);
  return <Context value={state}>{children}</Context>;
}
export function useImageEditor() {
  const state = useContext(Context);
  if (!state) throw new Error('图片编辑器尚未初始化');
  return state;
}
