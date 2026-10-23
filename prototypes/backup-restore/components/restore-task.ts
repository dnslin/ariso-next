import type { RestoreScope } from './restore-data';

const storageKey = 'ariso-restore-prototype-v1';
export type RestoreTask = {
  phase: 'restoring' | 'failed' | 'ready' | 'login';
  startedAt: number;
  progress: number;
  scope: RestoreScope;
  failRestore: boolean;
  failureKind: 'connection' | 'stopped';
  publicUrl: string;
  destinations: { id: string; bucket: string; pathPrefix: string }[];
};

export function advanceRestoreTask(
  task: RestoreTask,
  now = Date.now(),
): RestoreTask {
  if (task.phase !== 'restoring') return task;
  const progress = Math.min(
    100,
    Math.max(0, Math.floor((now - task.startedAt) / 110)),
  );
  if (task.failRestore && progress >= 60)
    return {
      ...task,
      phase: 'failed',
      progress: 60,
      failureKind: 'connection',
    };
  return { ...task, phase: progress >= 100 ? 'ready' : 'restoring', progress };
}

export function readRestoreTask(): RestoreTask | null {
  try {
    const value = localStorage.getItem(storageKey);
    if (!value) return null;
    const task = JSON.parse(value) as RestoreTask;
    if (
      !['restoring', 'failed', 'ready', 'login'].includes(task.phase) ||
      !['mixed', 'local'].includes(task.scope) ||
      !Number.isFinite(task.startedAt) ||
      !Array.isArray(task.destinations)
    )
      throw new Error('Invalid prototype restore task');
    return advanceRestoreTask(task);
  } catch (error) {
    console.error('Unable to read prototype restore progress', error);
    return null;
  }
}

export function writeRestoreTask(task: RestoreTask) {
  localStorage.setItem(storageKey, JSON.stringify(task));
}

export function clearRestoreTask() {
  localStorage.removeItem(storageKey);
}
