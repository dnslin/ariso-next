'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RestoreJob } from '../../server/backup/types';
import type { BuildIdentity } from '../../server/runtime/build-info';
import type { RestoreRemoteTargetInput } from '../../server/backup/restore-remote-types';
import {
  repairRestoreTargetCredentials,
  saveAndTestRestoreTarget,
} from './restore-target-client';
import {
  BackupRequestError,
  backupRequest,
  jsonRequest,
  uploadRestoreFile,
} from './client';

export function useRestore() {
  const [setupCode, setSetupCode] = useState<string | null>(null);
  const [job, setJob] = useState<RestoreJob | null>(null);
  const [application, setApplication] = useState<BuildIdentity | null>(null);
  const [message, setMessage] = useState('');
  const [pollMessage, setPollMessage] = useState('');
  const [operation, setOperation] = useState<string | null>(null);
  const [targetFields, setTargetFields] = useState<{
    storageId: string;
    errors: Record<string, string>;
  } | null>(null);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const pendingId = useRef<string | null>(null);
  const selectedFile = useRef<File | null>(null);
  const latestJob = useRef<RestoreJob | null>(null);
  const updateJob = useCallback((value: RestoreJob | null) => {
    latestJob.current = value;
    setJob(value);
  }, []);
  const handleError = useCallback((error: unknown, polling = false) => {
    if (
      error instanceof BackupRequestError &&
      error.code === 'SETUP_ALREADY_COMPLETED'
    ) {
      window.location.replace('/login?restore=completed');
      return;
    }
    if (error instanceof BackupRequestError && error.status === 401) {
      setSetupCode(null);
      setMessage(
        '初始化码无效或已失效。请从新实例当前启动日志获取初始化码，验证后再继续。',
      );
      return;
    }
    (polling ? setPollMessage : setMessage)(
      error instanceof Error ? error.message : '操作未完成，请重新读取任务',
    );
  }, []);
  async function perform(
    label: string,
    action: (
      signal: AbortSignal,
      accept: (job: RestoreJob) => void,
    ) => Promise<void>,
    replace = false,
    recoveryCode = setupCode,
  ) {
    if (active.current && !replace) return false;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const epoch = ++generation.current;
    setOperation(label);
    setMessage('');
    setPollMessage('');
    const accept = (value: RestoreJob) => {
      if (epoch === generation.current) updateJob(value);
    };
    try {
      await action(controller.signal, accept);
      return epoch === generation.current;
    } catch (error) {
      if (epoch === generation.current) {
        handleError(error);
        if (
          error instanceof BackupRequestError &&
          error.uncertain &&
          recoveryCode &&
          latestJob.current
        ) {
          try {
            const current = (
              await backupRequest<{ job: RestoreJob }>(
                `/api/setup/restore/${latestJob.current.id}`,
                { setupCode: recoveryCode },
              )
            ).job;
            if (epoch !== generation.current) return false;
            accept(current);
            if (
              label === 'importing' &&
              ['decrypting', 'configuring', 'restoring', 'ready'].includes(
                current.status,
              )
            ) {
              setMessage('');
              return true;
            }
            if (
              label === 'cancelling' &&
              (current.cleanupPending || current.status === 'cancelled')
            )
              return true;
          } catch (readError) {
            if (
              readError instanceof BackupRequestError &&
              [401, 409].includes(readError.status)
            )
              handleError(readError);
          }
        }
      }
      return false;
    } finally {
      if (epoch === generation.current) {
        active.current = null;
        setOperation(null);
      }
    }
  }
  useEffect(
    () => () => {
      generation.current++;
      active.current?.abort();
    },
    [],
  );
  const jobId = job?.id;
  const jobStatus = job?.status;
  const cleanupPending = job?.cleanupPending === true;
  useEffect(() => {
    if (!setupCode || !jobId || (jobStatus === 'cancelled' && !cleanupPending))
      return;
    const controller = new AbortController();
    let reading = false;
    const read = async () => {
      if (reading || active.current || document.visibilityState === 'hidden')
        return;
      reading = true;
      const epoch = generation.current;
      try {
        const result = await backupRequest<{ job: RestoreJob }>(
          `/api/setup/restore/${jobId}`,
          { setupCode, signal: controller.signal },
        );
        if (!controller.signal.aborted && epoch === generation.current) {
          updateJob(result.job);
          setPollMessage('');
        }
      } catch (error) {
        if (!controller.signal.aborted && epoch === generation.current)
          handleError(error, true);
      } finally {
        reading = false;
      }
    };
    const timer = setInterval(() => void read(), 1500);
    const focus = () => void read();
    window.addEventListener('focus', focus);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [setupCode, jobId, jobStatus, cleanupPending, handleError, updateJob]);
  function inspect(file: File | null, password: string, suppliedCode?: string) {
    const code = suppliedCode ?? setupCode;
    return perform(
      'importing',
      async (signal, accept) => {
        if (!code) throw new Error('请输入当前初始化码');
        let current = latestJob.current;
        if (!setupCode) {
          const result = await backupRequest<{
            job: RestoreJob | null;
            application: BuildIdentity | null;
          }>('/api/setup/restore', { setupCode: code, signal });
          setSetupCode(code);
          setApplication(result.application);
          updateJob(result.job);
          selectedFile.current = null;
          current = result.job;
          // Reauthorization resumes the saved screen without requiring a file or password.
          if (current && current.status !== 'cancelled') return;
          if (!result.application)
            throw new Error(
              '当前实例缺少可用版本信息，请使用备份对应的应用版本后再恢复。',
            );
        }
        if (current?.cleanupPending)
          throw new Error('请先完成当前恢复任务的临时文件清理');
        if (current?.status === 'cancelled') current = null;
        if (!password) throw new Error('请输入备份密码');
        let created = false;
        if (!current) {
          if (!file) throw new Error('请选择备份文件');
          pendingId.current ??= crypto.randomUUID();
          const path = `/api/setup/restore/${pendingId.current}`;
          try {
            current = (
              await backupRequest<{ job: RestoreJob }>(path, {
                method: 'PUT',
                setupCode: code,
                signal,
                ...jsonRequest({ uploadBytes: file.size }),
              })
            ).job;
            created = true;
          } catch (error) {
            if (
              !(error instanceof BackupRequestError) ||
              (!error.uncertain && error.status !== 409)
            )
              throw error;
            current = (
              await backupRequest<{ job: RestoreJob }>(path, {
                setupCode: code,
                signal,
              })
            ).job;
          }
          accept(current);
          pendingId.current = null;
        }
        if (
          current.receivedBytes < current.uploadBytes ||
          current.status === 'receiving'
        ) {
          if (!file) throw new Error('请重新选择原备份文件后上传');
          if (current.uploadBytes !== file.size)
            throw new Error(
              '文件大小与当前任务不一致。请选择原备份，或放弃本次任务后更换文件。',
            );
          if (
            !created &&
            (selectedFile.current !== file ||
              ['failed', 'interrupted'].includes(current.status))
          ) {
            current = (
              await backupRequest<{ job: RestoreJob }>(
                `/api/setup/restore/${current.id}/file`,
                { method: 'DELETE', setupCode: code, signal },
              )
            ).job;
            accept(current);
          }
          selectedFile.current = file;
          current = await uploadRestoreFile({
            id: current.id,
            setupCode: code,
            file,
            signal,
            onJob: accept,
          });
        }
        accept(
          (
            await backupRequest<{ job: RestoreJob }>(
              `/api/setup/restore/${current.id}/decryption`,
              {
                method: 'POST',
                setupCode: code,
                signal,
                ...jsonRequest({ password }),
              },
            )
          ).job,
        );
      },
      false,
      code,
    );
  }
  function saveSite(publicUrl: string) {
    return perform('saving-site', async (signal, accept) => {
      if (!job || !setupCode) return;
      accept(
        (
          await backupRequest<{ job: RestoreJob }>(
            `/api/setup/restore/${job.id}/site`,
            { method: 'PUT', setupCode, signal, ...jsonRequest({ publicUrl }) },
          )
        ).job,
      );
    });
  }
  function targetRequest(
    storageId: string,
    label: string,
    action: (options: {
      id: string;
      storageId: string;
      setupCode: string;
      signal: AbortSignal;
      onJob: (job: RestoreJob) => void;
    }) => Promise<unknown>,
  ) {
    return perform(label, async (signal, accept) => {
      if (!job || !setupCode) return;
      setTargetFields(null);
      try {
        await action({
          id: job.id,
          storageId,
          setupCode,
          signal,
          onJob: accept,
        });
      } catch (error) {
        if (
          !signal.aborted &&
          error instanceof BackupRequestError &&
          error.fields
        ) {
          setTargetFields({
            storageId,
            errors: Object.fromEntries(
              error.fields.map(({ field, message }) => [field, message]),
            ),
          });
        }
        throw error;
      }
    });
  }
  function testTarget(
    storageId: string,
    input?: RestoreRemoteTargetInput,
    wholeBucketHasNoLockRules?: boolean,
    onSaved?: () => void,
  ) {
    return targetRequest(storageId, 'testing-target', (options) =>
      saveAndTestRestoreTarget({
        ...options,
        input,
        wholeBucketHasNoLockRules,
        onSaved,
        revision: latestJob.current?.targets?.find(
          (target) => target.storageId === storageId,
        )?.revision,
      }),
    );
  }
  function repairTarget(
    storageId: string,
    input: RestoreRemoteTargetInput,
    onSaved?: () => void,
  ) {
    return targetRequest(storageId, 'repairing-target', (options) =>
      repairRestoreTargetCredentials({ ...options, input, onSaved }),
    );
  }
  function execute() {
    return perform('starting', async (signal, accept) => {
      if (!job || !setupCode) return;
      accept(
        (
          await backupRequest<{ job: RestoreJob }>(
            `/api/setup/restore/${job.id}/execution`,
            { method: 'POST', setupCode, signal },
          )
        ).job,
      );
    });
  }
  function cancel() {
    return perform(
      'cancelling',
      async (signal, accept) => {
        if (!job || !setupCode) return;
        accept(
          (
            await backupRequest<{ job: RestoreJob }>(
              `/api/setup/restore/${job.id}/cancel`,
              { method: 'POST', setupCode, signal },
            )
          ).job,
        );
        selectedFile.current = null;
        pendingId.current = null;
      },
      true,
    );
  }
  function refresh() {
    return perform('reading', async (signal, accept) => {
      if (setupCode && job)
        accept(
          (
            await backupRequest<{ job: RestoreJob }>(
              `/api/setup/restore/${job.id}`,
              { setupCode, signal },
            )
          ).job,
        );
    });
  }
  return {
    authorized: setupCode !== null,
    application,
    job,
    message: message || pollMessage,
    operation,
    busy: operation !== null,
    targetFields,
    testTarget,
    repairTarget,
    inspect,
    saveSite,
    execute,
    cancel,
    refresh,
  };
}
