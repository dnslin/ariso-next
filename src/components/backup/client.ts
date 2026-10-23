import type { BackupJob, RestoreJob } from '../../server/backup/types';

export class BackupRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly uncertain = status === 0 || status >= 500,
    readonly fields?: Array<{ field: string; message: string }>,
  ) {
    super(message);
  }
}

export async function backupRequest<T>(
  path: string,
  options: RequestInit & { setupCode?: string } = {},
): Promise<T> {
  const { setupCode, ...init } = options;
  const headers = new Headers(init.headers);
  if (setupCode !== undefined) headers.set('X-Ariso-Setup-Code', setupCode);
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new BackupRequestError(
      init.method && init.method !== 'GET'
        ? '连接中断，暂时无法确认操作结果。请先重新读取任务状态。'
        : '暂时无法读取任务，请检查连接后重试。',
      'BACKUP_REQUEST_UNKNOWN',
      0,
    );
  }
  if (response.status === 204) return undefined as T;
  let body: {
    code?: string;
    message?: string;
    fields?: Array<{ field: string; message: string }>;
  };
  try {
    body = await response.json();
  } catch {
    throw new BackupRequestError(
      `无法识别服务器返回的结果（HTTP ${response.status}），请重新读取任务状态。`,
      'BACKUP_RESPONSE_INVALID',
      response.status,
      response.ok || response.status >= 500,
    );
  }
  if (!response.ok)
    throw new BackupRequestError(
      body.message ?? `请求未完成（HTTP ${response.status}）`,
      body.code ?? 'BACKUP_REQUEST_FAILED',
      response.status,
      undefined,
      body.fields,
    );
  return body as T;
}

export function jsonRequest(
  body: unknown,
): Pick<RequestInit, 'headers' | 'body'> {
  return {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** id belongs to one user intent. Ambiguous writes are followed only by a read. */
export async function createBackup(id: string, password: string) {
  const path = `/api/backups/${encodeURIComponent(id)}`;
  const read = async (init?: RequestInit) => {
    const result = await backupRequest<{ job: BackupJob }>(path, init);
    if (result?.job?.id !== id)
      throw new BackupRequestError(
        '未收到可确认的备份任务，请重新读取结果。',
        'BACKUP_RESPONSE_INVALID',
        200,
        true,
      );
    return result;
  };
  try {
    return await read({
      method: 'PUT',
      ...jsonRequest({ password }),
    });
  } catch (error) {
    if (
      !(error instanceof BackupRequestError) ||
      (!error.uncertain && error.status !== 409)
    )
      throw error;
    try {
      return await read();
    } catch (checkError) {
      if (checkError instanceof BackupRequestError && checkError.status === 401)
        throw checkError;
      if (!error.uncertain) throw error;
      throw new BackupRequestError(
        '尚无法确认是否已创建备份。请重新读取任务，暂不重复创建。',
        'BACKUP_REQUEST_UNKNOWN',
        0,
      );
    }
  }
}

export const RESTORE_CHUNK_BYTES = 8 * 1024 * 1024;

export async function deleteBackup(id: string) {
  const path = `/api/backups/${encodeURIComponent(id)}`;
  try {
    await backupRequest<void>(path, { method: 'DELETE' });
  } catch (error) {
    if (!(error instanceof BackupRequestError) || !error.uncertain) throw error;
    try {
      await backupRequest<{ job: BackupJob }>(path);
    } catch (readError) {
      if (readError instanceof BackupRequestError && readError.status === 404)
        return;
      throw readError;
    }
    throw new BackupRequestError(
      '备份记录仍存在，删除结果尚未确认。请重新读取记录后再操作。',
      'BACKUP_DELETE_UNKNOWN',
      0,
    );
  }
}

/** The caller retains the same File in this page, or explicitly resets before replacing it. */
export async function uploadRestoreFile(options: {
  id: string;
  setupCode: string;
  file: File;
  signal?: AbortSignal;
  onJob?: (job: RestoreJob) => void;
}) {
  const { id, setupCode, file, signal } = options;
  const path = `/api/setup/restore/${encodeURIComponent(id)}`;
  const read = () =>
    backupRequest<{ job: RestoreJob }>(path, { setupCode, signal });
  let { job } = await read();
  if (job.uploadBytes !== file.size)
    throw new BackupRequestError(
      '所选文件与当前任务大小不一致。请选择原备份文件，或放弃当前任务后重新导入。',
      'BACKUP_FILE_CHANGED',
      409,
    );
  options.onJob?.(job);
  while (job.receivedBytes < file.size) {
    signal?.throwIfAborted();
    const offset = job.receivedBytes;
    const end = Math.min(offset + RESTORE_CHUNK_BYTES, file.size);
    try {
      ({ job } = await backupRequest<{ job: RestoreJob }>(`${path}/file`, {
        method: 'PUT',
        setupCode,
        signal,
        headers: {
          'content-type': 'application/octet-stream',
          'Upload-Offset': String(offset),
          'Upload-Length': String(file.size),
        },
        body: file.slice(offset, end),
      }));
    } catch (error) {
      if (signal?.aborted) throw error;
      if (
        !(error instanceof BackupRequestError) ||
        (!error.uncertain && error.status !== 409)
      )
        throw error;
      ({ job } = await read());
      options.onJob?.(job);
      if (job.receivedBytes !== end) throw error;
    }
    if (job.receivedBytes !== end)
      throw new BackupRequestError(
        '服务器接收进度尚未确认，请重新读取后继续上传。',
        'BACKUP_UPLOAD_OFFSET_INVALID',
        409,
      );
    options.onJob?.(job);
  }
  return job;
}
