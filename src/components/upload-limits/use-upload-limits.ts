'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@heroui/react/toast';
import {
  uploadSettingsFieldErrors,
  uploadSettingsInputSchema,
  type UploadSettingsFieldError,
  type UploadSettingsInput,
} from '../../shared/upload-settings';
import { useResetUpload, useUploadQueue } from '../upload/provider';
import type { UploadSettings } from '../upload/settings';
import {
  uploadLimitsRequest,
  UploadLimitsRequestError,
  type SavedUploadLimits,
} from './api';
import { uploadLimitsInput, uploadLimitsMatch } from './model';

export function useUploadLimits(initial: SavedUploadLimits) {
  const [input, setInput] = useState(() => uploadLimitsInput(initial));
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [different, setDifferent] = useState(false);
  const [expired, setExpired] = useState(false);
  const pending = useRef<UploadSettingsInput | null>(null);
  const inFlight = useRef(false);
  const noticeId = useRef<string | null>(null);
  const mounted = useRef(true);
  const client = useQueryClient();
  const upload = useUploadQueue();
  const resetUpload = useResetUpload();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (noticeId.current) toast.close(noticeId.current);
    };
  }, []);
  const expire = useCallback(() => {
    resetUpload();
    setExpired(true);
    setMessage('会话已失效，当前输入仍保留。请重新登录后继续操作。');
  }, [resetUpload]);

  function clearNotice() {
    if (noticeId.current) toast.close(noticeId.current);
    noticeId.current = null;
  }
  function notice(title: string) {
    clearNotice();
    if (mounted.current)
      noticeId.current = toast(title, { variant: 'default' });
  }

  function change(field: keyof UploadSettingsInput, value: number) {
    setInput((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }
  function applyErrors(fields: UploadSettingsFieldError[]) {
    const next = Object.fromEntries(
      fields.map(({ field, message }) => [field, message]),
    );
    setErrors(next);
    if (!fields.length) return;
    requestAnimationFrame(() => {
      const control = document.querySelector<HTMLElement>(
        `[data-field="${CSS.escape(fields[0].field)}"] input:not([type="hidden"])`,
      );
      (
        control ?? document.querySelector<HTMLElement>('#upload-limits-errors')
      )?.focus();
    });
  }
  function acceptSaved(value: SavedUploadLimits) {
    setSaved(value);
    client.setQueryData(['upload-limits'], value);
    // Use the provider's own cache. Cancel an older read before publishing actual limits.
    void upload.client.cancelQueries({ queryKey: ['upload-settings'] });
    upload.client.setQueryData<UploadSettings>(
      ['upload-settings'],
      (current) =>
        current
          ? {
              ...current,
              maxFileBytes: value.maxFileBytes,
              batchSize: value.batchSize,
              queueLimit: value.queueLimit,
            }
          : undefined,
    );
    upload.controller?.updateLimits({
      maxFileBytes: value.maxFileBytes,
      queueLimit: value.queueLimit,
    });
  }
  async function readBack() {
    try {
      const value = await uploadLimitsRequest();
      acceptSaved(value);
      if (pending.current && uploadLimitsMatch(pending.current, value)) {
        pending.current = null;
        setUnknown(false);
        setDifferent(false);
        setMessage('');
        notice('已确认上传限制保存，当前输入已保留');
        return true;
      } else {
        setDifferent(true);
        setMessage(
          '已保存值与本次提交不同。当前输入仍保留，请决定使用哪一份。',
        );
      }
    } catch (error) {
      setMessage(
        `核对失败，输入已保留。请重新核对当前设置。${error instanceof Error ? error.message : String(error)}`,
      );
      if (error instanceof UploadLimitsRequestError && error.status === 401)
        expire();
    }
    return false;
  }
  async function save() {
    if (inFlight.current || unknown || expired) return;
    clearNotice();
    const parsed = uploadSettingsInputSchema.safeParse(input);
    if (!parsed.success) {
      applyErrors(uploadSettingsFieldErrors(parsed.error));
      setMessage('请修改以下字段，输入已保留。');
      return;
    }
    const opener = document.activeElement as HTMLElement | null;
    let confirmed = false;
    inFlight.current = true;
    setBusy(true);
    setErrors({});
    setMessage('');
    setDifferent(false);
    pending.current = uploadLimitsInput(parsed.data);
    try {
      const value = await uploadLimitsRequest({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(pending.current),
      });
      acceptSaved(value);
      pending.current = null;
      notice('上传限制已保存');
      confirmed = true;
    } catch (error) {
      if (error instanceof UploadLimitsRequestError && error.status < 500) {
        pending.current = null;
        applyErrors(error.fields);
        setMessage(`${error.message}，输入已保留。`);
        if (error.status === 401) expire();
      } else {
        setUnknown(true);
        setMessage('保存结果尚未确认，正在读取当前设置…');
        // One read resolves an uncertain write; this path never repeats PATCH.
        confirmed = await readBack();
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      if (confirmed) restoreControlFocus(opener);
    }
  }
  async function reconcile() {
    if (inFlight.current || expired) return;
    clearNotice();
    const opener = document.activeElement as HTMLElement | null;
    let confirmed = false;
    inFlight.current = true;
    setBusy(true);
    try {
      confirmed = await readBack();
    } finally {
      inFlight.current = false;
      setBusy(false);
      if (confirmed) restoreControlFocus(opener);
    }
  }
  function chooseSaved(useSaved: boolean) {
    clearNotice();
    const opener = document.activeElement as HTMLElement | null;
    if (useSaved) {
      setInput(uploadLimitsInput(saved));
      setErrors({});
    }
    pending.current = null;
    setUnknown(false);
    setDifferent(false);
    setMessage('');
    notice(useSaved ? '已使用服务器保存的设置' : '输入已保留，请点击保存');
    restoreControlFocus(opener);
  }
  return {
    input,
    saved,
    errors,
    message,
    busy,
    unknown,
    different,
    expired,
    expire,
    change,
    save,
    reconcile,
    chooseSaved,
  };
}

function restoreControlFocus(opener: HTMLElement | null) {
  requestAnimationFrame(() => {
    const control =
      opener?.isConnected &&
      !opener.matches(':disabled, [aria-disabled="true"], body')
        ? opener
        : document.querySelector<HTMLElement>(
            '#upload-limits-form input:not([type="hidden"]):not(:disabled)',
          );
    control?.focus({ preventScroll: true });
  });
}
