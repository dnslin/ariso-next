import type { EditContext, EditIntent, EditJob, EditTemplate } from './types';

export class ImageEditorRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}
export async function editorRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  if (response.ok && response.status === 204) return undefined as T;
  const result = await response.json();
  if (!response.ok)
    throw new ImageEditorRequestError(
      response.status,
      result.code,
      `${result.message ?? '请求失败'}（HTTP ${response.status}）`,
    );
  return result;
}
const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
export const imageEditUrl = (imageId: string) =>
  `/api/images/${encodeURIComponent(imageId)}/edit`;
export const editStatusUrl = (requestId: string) =>
  `/api/media/edits/${encodeURIComponent(requestId)}`;
export const watermarkImageUrl = (id: string) =>
  `/api/media/watermark-assets/${encodeURIComponent(id)}/image`;
export const readEditContext = (id: string, signal?: AbortSignal) =>
  editorRequest<EditContext>(imageEditUrl(id), { signal });
export const submitEdit = (intent: EditIntent) =>
  editorRequest<EditJob>(
    imageEditUrl(intent.sourceImageId),
    json({
      requestId: intent.requestId,
      sourceObjectId: intent.sourceObjectId,
      mode: intent.mode,
      recipe: intent.recipe,
    }),
  );
export const readEditJob = (requestId: string) =>
  editorRequest<EditJob>(editStatusUrl(requestId));
export const retryEditJob = (requestId: string) =>
  editorRequest<EditJob>(`${editStatusUrl(requestId)}/retry`, json({}));
export const readEditTemplates = (signal?: AbortSignal) =>
  editorRequest<{ templates: EditTemplate[] }>('/api/media/edit-templates', {
    signal,
  });
export const saveEditTemplate = (
  name: string,
  recipe: EditTemplate['recipe'],
) =>
  editorRequest<EditTemplate>(
    '/api/media/edit-templates',
    json({ name, recipe }),
  );
export const renameEditTemplate = (id: string, name: string) =>
  editorRequest<EditTemplate>(
    `/api/media/edit-templates/${encodeURIComponent(id)}`,
    json({ name }, 'PATCH'),
  );
export const deleteEditTemplate = (id: string) =>
  editorRequest<unknown>(
    `/api/media/edit-templates/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );

export async function requestFinalPreview(
  image: Pick<EditContext, 'imageId' | 'sourceObjectId'>,
  recipe: EditTemplate['recipe'],
  mode: 'copy' | 'overwrite',
  target: 'original' | 'watermark',
  signal: AbortSignal,
) {
  const response = await fetch(`${imageEditUrl(image.imageId)}/preview`, {
    ...json({ sourceObjectId: image.sourceObjectId, recipe, mode, target }),
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    const result = await response.json();
    throw new ImageEditorRequestError(
      response.status,
      result.code,
      `${result.message ?? '最终预览失败'}（HTTP ${response.status}）`,
    );
  }
  return response.blob();
}
