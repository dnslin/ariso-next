'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Form } from '@heroui/react/form';
import { NumberField } from '@heroui/react/number-field';
import { Label } from '@heroui/react/label';
import { Description } from '@heroui/react/description';
import { FieldError } from '@heroui/react/field-error';
import { toast } from '@heroui/react/toast';
import { CircleCheck, Settings2, Upload } from 'lucide-react';
import { OwnerShell } from '../../../../../src/components/shell/owner-shell';
import {
  SettingsHeading,
  SettingsCategories,
  settingsCategories,
} from '../../../../../src/components/shell/settings-categories';

const fields = [
  {
    name: 'maxFileMiB',
    label: '单文件上限（MiB）',
    description: '填写正整数；1 MiB = 1,048,576 字节。',
  },
  {
    name: 'batchSize',
    label: '每批文件数量',
    description: '1–200 张，且不能超过队列上限。',
  },
  {
    name: 'queueLimit',
    label: '队列上限',
    description: '100–2000 条，包含成功和失败结果。清空已完成后释放名额。',
  },
] as const;

export default function Page() {
  return (
    <Suspense>
      <Prototype />
    </Suspense>
  );
}

function Prototype() {
  const params = useSearchParams();
  const { setTheme } = useTheme();
  const scenario = params.get('state') ?? 'normal';
  const [values, setValues] = useState({
    maxFileMiB: 50,
    batchSize: 20,
    queueLimit: 500,
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof typeof values, string>>
  >({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  useEffect(() => {
    setTheme(params.get('theme') === 'dark' ? 'dark' : 'light');
  }, [params, setTheme]);
  function save() {
    const next: typeof errors = {};
    if (!Number.isInteger(values.maxFileMiB) || values.maxFileMiB <= 0)
      next.maxFileMiB = '单文件上限须为正整数 MiB';
    if (
      !Number.isInteger(values.batchSize) ||
      values.batchSize < 1 ||
      values.batchSize > 200
    )
      next.batchSize = '每批文件数量须为 1–200 的整数';
    if (
      !Number.isInteger(values.queueLimit) ||
      values.queueLimit < 100 ||
      values.queueLimit > 2000
    )
      next.queueLimit = '队列上限须为 100–2000 的整数';
    if (
      !next.batchSize &&
      !next.queueLimit &&
      values.batchSize > values.queueLimit
    )
      next.batchSize = '批次大小不能超过队列上限';
    setErrors(next);
    if (Object.keys(next).length) {
      setMessage('请修改以下字段，输入已保留。');
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLInputElement>('input[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
    if (scenario === 'failure') {
      setMessage('保存失败，输入已保留。原限制继续生效。');
      return;
    }
    setBusy(true);
    setMessage(
      scenario === 'unknown' ? '保存结果尚未确认，正在读取当前设置…' : '',
    );
    setTimeout(() => {
      setBusy(false);
      if (scenario === 'unknown') {
        setUnknown(true);
        setMessage('核对失败，输入已保留。请重新核对当前设置。');
      } else
        toast('上传限制已保存', {
          variant: 'default',
          indicator: <CircleCheck size={18} aria-hidden />,
        });
    }, 700);
  }
  return (
    <OwnerShell
      name="Ariso"
      description="图片，自在收纳。"
      email="prototype@example.com"
      ownerName="演示账号"
      footer={
        <Button
          type="submit"
          form="upload-limits-prototype"
          isDisabled={busy || unknown}
          className="h-12 w-full rounded-lg px-6 text-sm font-medium min-[1200px]:w-50"
        >
          {busy ? '正在保存…' : '保存上传限制'}
        </Button>
      }
    >
      <section className="grid gap-5 pb-10">
        <SettingsHeading />
        <SettingsCategories
          items={[
            {
              href: '/settings/processing',
              label: '基本设置',
              icon: <Settings2 className="size-4" aria-hidden />,
            },
            ...settingsCategories
              .filter((item) => item.href !== '/settings/general')
              .map((item) =>
                item.href === '/settings/processing'
                  ? { ...item, href: '/prototype/processing' }
                  : item,
              ),
          ]}
        >
          <Form
            id="upload-limits-prototype"
            validationBehavior="aria"
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <Card className="min-w-0 gap-5 rounded-[20px] border border-border bg-surface p-4 shadow-none min-[1200px]:px-6 min-[1200px]:py-5">
              <div className="grid gap-2">
                <h2 className="flex items-center gap-2 text-lg font-medium">
                  <Upload className="size-5" aria-hidden />
                  上传限制
                </h2>
                <p className="text-[13px] leading-5 text-muted">
                  仅影响新提交；已开始的上传沿用原设置，同时传输数量固定为 3。
                </p>
              </div>
              {message ? (
                <div
                  role="alert"
                  className={`grid gap-2 text-sm ${message === '当前设置已读取，您可再次保存。' ? 'text-foreground' : 'text-danger'}`}
                >
                  <p>{message}</p>
                  {unknown ? (
                    <Button
                      className="min-h-11 w-fit rounded-lg"
                      variant="outline"
                      onPress={() => {
                        setUnknown(false);
                        setMessage('当前设置已读取，您可再次保存。');
                      }}
                    >
                      重新核对当前设置
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {fields.map((field) => (
                <NumberField
                  key={field.name}
                  name={field.name}
                  value={values[field.name]}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: value ?? Number.NaN,
                    }))
                  }
                  formatOptions={{
                    useGrouping: false,
                    maximumFractionDigits: 20,
                  }}
                  commitBehavior="validate"
                  validationBehavior="aria"
                  isDisabled={busy || unknown}
                  isInvalid={Boolean(errors[field.name])}
                  className="gap-2"
                >
                  <Label className="text-sm font-medium">{field.label}</Label>
                  <NumberField.Group
                    className={`h-12 w-full rounded-lg border-0 bg-background shadow-none ring-1 ring-inset ${errors[field.name] ? 'ring-danger' : 'ring-border'}`}
                  >
                    <NumberField.Input className="h-full w-full px-3 py-0" />
                  </NumberField.Group>
                  <FieldError className="whitespace-normal wrap-anywhere">
                    {errors[field.name]}
                  </FieldError>
                  <Description className="text-xs leading-5">
                    {field.description}
                  </Description>
                </NumberField>
              ))}
            </Card>
          </Form>
        </SettingsCategories>
      </section>
    </OwnerShell>
  );
}
