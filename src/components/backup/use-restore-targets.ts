'use client';
import { useState } from 'react';
import type { RestoreJob } from '../../server/backup/types';
import type { RestoreRemoteTargetInput } from '../../server/backup/restore-remote-types';
import {
  remoteTargetDirty,
  remoteTargetErrors,
  remoteTargetInitial,
  remoteTargetPayload,
  remoteTargetsReady,
} from './restore-target-form';
import type { useRestore } from './use-restore';

export function useRestoreTargets(
  job: RestoreJob | null,
  actions: Pick<
    ReturnType<typeof useRestore>,
    'testTarget' | 'repairTarget' | 'targetFields'
  >,
) {
  const [state, setState] = useState<{
    id: string;
    drafts: Record<string, RestoreRemoteTargetInput>;
    errors: Record<string, Record<string, string>>;
  }>({ id: '', drafts: {}, errors: {} });
  const drafts = state.id === job?.id ? state.drafts : {};
  const errors = state.id === job?.id ? state.errors : {};
  const targets = job?.targets ?? [];
  const storageIds =
    job?.summary?.storages
      .filter((storage) => storage.type === 's3')
      .map((storage) => storage.id) ?? [];
  const input = (id: string) =>
    drafts[id] ??
    remoteTargetInitial(targets.find((target) => target.storageId === id));
  function change(id: string, value: RestoreRemoteTargetInput) {
    if (!job) return;
    setState({
      id: job.id,
      drafts: { ...drafts, [id]: value },
      errors: { ...errors, [id]: {} },
    });
  }
  async function submit(id: string, cleanup: boolean, confirmed?: boolean) {
    if (!job) return;
    const target = targets.find((target) => target.storageId === id);
    if (cleanup && !target) return;
    const value = input(id);
    const nextErrors = remoteTargetErrors(
      value,
      target?.credentialsConfigured === true,
    );
    if (cleanup && !value.accessKey && !value.secretKey)
      nextErrors.accessKey = '请输入需要更新的凭据';
    if (Object.keys(nextErrors).length) {
      setState({ id: job.id, drafts, errors: { ...errors, [id]: nextErrors } });
      requestAnimationFrame(() =>
        document
          .getElementById(`restore-${id}-${Object.keys(nextErrors)[0]}`)
          ?.focus(),
      );
      return;
    }
    const clearSaved = () =>
      setState((current) => {
        if (current.id !== job.id || current.drafts[id] !== value)
          return current;
        const next = { ...current.drafts };
        delete next[id];
        return {
          id: current.id,
          drafts: next,
          errors: { ...current.errors, [id]: {} },
        };
      });
    const success =
      cleanup && target
        ? await actions.repairTarget(
            id,
            remoteTargetPayload({
              ...remoteTargetInitial(target),
              accessKey: value.accessKey,
              secretKey: value.secretKey,
            }),
            clearSaved,
          )
        : await actions.testTarget(
            id,
            remoteTargetDirty(value, target)
              ? remoteTargetPayload(value)
              : undefined,
            confirmed,
            clearSaved,
          );
    if (success) clearSaved();
  }
  return {
    targets,
    input,
    change,
    dirty: (id: string) =>
      remoteTargetDirty(
        input(id),
        targets.find((target) => target.storageId === id),
      ),
    errors: (id: string) => ({
      ...(actions.targetFields?.storageId === id
        ? actions.targetFields.errors
        : {}),
      ...errors[id],
    }),
    ready: remoteTargetsReady(storageIds, targets, drafts),
    testing: targets.some((target) => target.testStatus === 'testing'),
    test: (id: string, confirmed?: boolean) => submit(id, false, confirmed),
    repair: (id: string) => submit(id, true),
  };
}
