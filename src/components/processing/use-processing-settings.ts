'use client';

import { useCallback, useRef, useState, type ComponentProps } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@heroui/react/toast';
import type { MediaSettingsInput } from '../../server/media/validation';
import { useUploadQueue } from '../upload/provider';
import { useSiteNavigation } from '../site/site-navigation';
import {
  processingRequest,
  processingSettingsUrl,
  ProcessingRequestError,
  type SavedProcessingSettings,
} from './api';
import { settingsInput, settingsMatch, validateProcessingInput } from './model';

export function useProcessingSettings(initial: SavedProcessingSettings) {
  const [input, setInput] = useState(() => settingsInput(initial));
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [different, setDifferent] = useState(false);
  const [expired, setExpired] = useState(false);
  const [rawInput, setRawInput] = useState<{
    field: keyof MediaSettingsInput;
    value: string;
  } | null>(null);
  const pending = useRef<MediaSettingsInput | null>(null);
  const editedField = useRef<keyof MediaSettingsInput | null>(null);
  const focusedInput = useRef<{
    target: HTMLInputElement;
    field: keyof MediaSettingsInput;
  } | null>(null);
  const inFlight = useRef(false);
  const client = useQueryClient();
  const upload = useUploadQueue();
  const expire = useCallback(() => setExpired(true), []);
  // Compare the focused input's current value instead of its stale committed
  // value. NumberField uses ungrouped numbers; this does not submit or validate.
  const comparedInput = rawInput
    ? {
        ...input,
        [rawInput.field]:
          typeof input[rawInput.field] === 'number'
            ? rawInput.value.trim() === ''
              ? Number.NaN
              : Number(rawInput.value)
            : rawInput.value,
      }
    : input;
  const navigation = useSiteNavigation(
    !busy && !unknown && !expired && !settingsMatch(comparedInput, saved),
  );

  // NumberField and ColorField can keep text locally until blur/commit. Track
  // that focused text without changing their parsing or validation behavior.
  const formEvents: Required<
    Pick<ComponentProps<'div'>, 'onFocusCapture' | 'onInput' | 'onBlurCapture'>
  > = {
    onFocusCapture: (event) => {
      const target = event.target as HTMLElement;
      if (
        !target.matches(
          'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
        )
      )
        return;
      const field = target.closest<HTMLElement>('[data-field]')?.dataset
        .field as keyof MediaSettingsInput | undefined;
      if (!field) return;
      const control = target as HTMLInputElement;
      focusedInput.current = {
        target: control,
        field,
      };
    },
    onInput: (event) => {
      const focused = focusedInput.current;
      if (!focused || event.target !== focused.target) return;
      editedField.current = focused.field;
      setRawInput({ field: focused.field, value: focused.target.value });
    },
    onBlurCapture: (event) => {
      if (event.target !== focusedInput.current?.target) return;
      focusedInput.current = null;
      setRawInput(null);
    },
  };

  function change<K extends keyof MediaSettingsInput>(
    field: K,
    value: MediaSettingsInput[K],
  ) {
    editedField.current = field;
    setInput((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }
  function applyErrors(fields: { field: string; message: string }[]) {
    const next = Object.fromEntries(
      fields.map(({ field, message }) => [
        field.replace(/^settings\./, ''),
        message,
      ]),
    );
    setErrors(next);
    focusError(next);
  }
  function validate(purpose: 'save' | 'preview') {
    const result = validateProcessingInput(input, purpose);
    setErrors(result.errors);
    if (!result.value) focusError(result.errors);
    return result.value !== undefined;
  }
  async function savedResult(value: SavedProcessingSettings) {
    setSaved(value);
    client.setQueryData(['processing-settings'], value);
    const refreshes = [
      upload.client.invalidateQueries({ queryKey: ['upload-settings'] }),
    ];
    if (value.watermarkAssetId)
      refreshes.push(
        client.invalidateQueries({
          queryKey: ['watermark-asset', value.watermarkAssetId],
        }),
      );
    await Promise.all(refreshes);
  }
  async function save() {
    if (inFlight.current || unknown || expired || !validate('save')) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    setDifferent(false);
    // These scalar settings are exactly the fields consumed by this save.
    pending.current = { ...input };
    try {
      const value = await processingRequest<SavedProcessingSettings>(
        processingSettingsUrl,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(pending.current),
        },
      );
      await savedResult(value);
      pending.current = null;
      toast('处理设置已保存', { variant: 'default' });
    } catch (error) {
      if (error instanceof ProcessingRequestError && error.status < 500) {
        applyErrors(error.fields);
        setMessage(error.message);
        if (error.status === 401) expire();
        pending.current = null;
      } else {
        setUnknown(true);
        setMessage(
          `保存结果尚未确认，当前输入已保留。请核对已保存设置。${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function reconcile() {
    if (inFlight.current || expired) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const value = await processingRequest<SavedProcessingSettings>(
        processingSettingsUrl,
      );
      await savedResult(value);
      if (pending.current && settingsMatch(pending.current, value)) {
        setUnknown(false);
        setDifferent(false);
        pending.current = null;
        setMessage('');
        toast('已确认上次保存，当前输入已保留', { variant: 'default' });
      } else {
        setDifferent(true);
        setMessage(
          '已保存值与本次提交不同。当前输入仍保留，请决定使用哪一份。',
        );
      }
    } catch (error) {
      setMessage(
        `无法核对保存结果，请恢复连接后重试。${error instanceof Error ? error.message : String(error)}`,
      );
      if (error instanceof ProcessingRequestError && error.status === 401)
        expire();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function chooseSaved(useSaved: boolean) {
    if (useSaved) {
      setInput(settingsInput(saved));
      setErrors({});
    }
    setUnknown(false);
    setDifferent(false);
    setMessage('');
    pending.current = null;
    toast(useSaved ? '已使用服务器保存的设置' : '输入已保留，请点击保存', {
      variant: 'default',
    });
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
    applyErrors,
    validate,
    save,
    reconcile,
    chooseSaved,
    formEvents,
    navigation: {
      ...navigation,
      cancel: () => {
        navigation.cancel();
        requestAnimationFrame(() => {
          if (editedField.current)
            processingField(editedField.current, input)?.focus({
              preventScroll: true,
            });
        });
      },
    },
  };
}

function processingField(
  field: keyof MediaSettingsInput,
  input: MediaSettingsInput,
) {
  const switchLabel =
    field === 'compressionEnabled'
      ? '压缩版本'
      : field === 'watermarkMode'
        ? '启用水印'
        : field === 'maxEdge' && input.maxEdge === null
          ? '最长边限制'
          : null;
  if (switchLabel)
    return document.querySelector<HTMLElement>(
      `[role="switch"][aria-label="${switchLabel}"]`,
    );
  if (field === 'watermarkPosition')
    return document.querySelector<HTMLElement>(
      `[data-position="${input.watermarkPosition}"]`,
    );
  const area = document.querySelector(`[data-field="${field}"]`);
  return [
    ...(area?.querySelectorAll<HTMLElement>('input,textarea,button') ?? []),
  ].find(
    (node) => node.getClientRects().length && !node.hasAttribute('disabled'),
  );
}

function focusError(errors: Record<string, string>) {
  const field = Object.keys(errors)[0];
  if (!field) return;
  requestAnimationFrame(() => {
    const area = document.querySelector(`[data-field="${CSS.escape(field)}"]`);
    const control = [
      ...(area?.querySelectorAll<HTMLElement>('input,textarea,button') ?? []),
    ].find(
      (node) => node.getClientRects().length && !node.hasAttribute('disabled'),
    );
    (
      control ?? document.querySelector<HTMLElement>('#processing-errors')
    )?.focus();
  });
}
