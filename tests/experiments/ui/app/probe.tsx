'use client';
import { useState, useSyncExternalStore } from 'react';
import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { TextField } from '@heroui/react/textfield';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import { Modal } from '@heroui/react/modal';
import { Controller, useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';

const subscribe = () => () => {};
export function Probe() {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const { theme, setTheme } = useTheme();
  const [submitted, setSubmitted] = useState('');
  const [mode, setMode] = useState('success');
  const { control, handleSubmit } = useForm({ defaultValues: { name: '' } });
  const query = useQuery({
    queryKey: ['ui-probe', mode],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/probe?mode=${mode}`, { signal });
      if (!response.ok)
        throw new Error(`实验请求失败：HTTP ${response.status}`);
      return response.text();
    },
    retry: false,
  });
  return (
    <>
      <section aria-label="主题" className="flex flex-wrap gap-3">
        {(['system', 'light', 'dark'] as const).map((value) => (
          <Button
            key={value}
            id={`theme-${value}`}
            isDisabled={!mounted}
            aria-pressed={mounted && theme === value}
            onPress={() => setTheme(value)}
          >
            {{ system: '跟随系统', light: '浅色', dark: '深色' }[value]}
          </Button>
        ))}
      </section>
      <Form
        aria-label="表单验证"
        validationBehavior="aria"
        className="grid gap-4 rounded-xl bg-surface p-4"
        onSubmit={handleSubmit(({ name }) => setSubmitted(name))}
      >
        <Controller
          name="name"
          control={control}
          rules={{
            validate: (value) =>
              value.trim().length >= 2 || '请输入至少两个字符',
          }}
          render={({ field, fieldState }) => (
            <TextField
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              isInvalid={fieldState.invalid}
              isRequired
            >
              <Label>实验名称</Label>
              <Input id="probe-name" ref={field.ref} />
              <FieldError>{fieldState.error?.message}</FieldError>
            </TextField>
          )}
        />
        <Button id="submit" type="submit">
          验证表单
        </Button>
        <output id="submitted" aria-live="polite">
          {submitted ? `已验证：${submitted}` : '尚未提交'}
        </output>
      </Form>
      <section aria-label="查询验证" className="grid gap-3">
        <div className="flex flex-wrap gap-3">
          {['success', 'empty', 'error'].map((value) => (
            <Button
              key={value}
              id={`query-${value}`}
              onPress={() => setMode(value)}
            >
              {
                { success: '正常查询', empty: '空查询', error: '失败查询' }[
                  value
                ]
              }
            </Button>
          ))}
        </div>
        <p id="query-state" aria-live="polite">
          {query.isPending
            ? '正在加载'
            : query.isError
              ? query.error.message
              : query.data || '没有记录'}
        </p>
      </section>
      <Modal>
        <Button id="open-modal">打开焦点验证</Button>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger aria-label="关闭" />
              <Modal.Header>
                <Modal.Heading>焦点验证</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <TextField>
                  <Label>弹窗输入</Label>
                  <Input id="modal-input" />
                </TextField>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close">完成</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <Button isDisabled>禁用操作</Button>
    </>
  );
}
