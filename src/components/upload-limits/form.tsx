'use client';

import { ComponentEntrance } from '../component-entrance';
import { Form } from '@heroui/react/form';
import { Card } from '@heroui/react/card';
import { NumberField } from '@heroui/react/number-field';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import { Upload } from 'lucide-react';
import { StorageTip } from '../storage/storage-tip';
import { uploadLimitFields } from './model';
import { UploadLimitsFeedback } from './feedback';
import type { useUploadLimits } from './use-upload-limits';
import type { SavedUploadLimits } from './api';

export function UploadLimitsForm({
  settings,
}: {
  settings: ReturnType<typeof useUploadLimits> & { saved: SavedUploadLimits };
}) {
  const disabled = settings.busy || settings.unknown || settings.expired;
  return (
    <Form
      id="upload-limits-form"
      validationBehavior="aria"
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void settings.save();
      }}
    >
      <ComponentEntrance delay={0.11} className="min-w-0">
        <Card className="min-w-0 gap-5 rounded-[20px] border border-border bg-surface p-4 shadow-none min-[1200px]:px-6 min-[1200px]:py-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Upload className="size-5" aria-hidden />
              上传限制
            </h2>
            <StorageTip label="上传限制">
              仅影响新提交；已开始的上传沿用原设置，同时传输数量固定为 3。
            </StorageTip>
          </div>
          <UploadLimitsFeedback settings={settings} />
          <div className="grid min-w-0 items-start gap-5 min-[1200px]:grid-cols-3">
            {uploadLimitFields.map((field) => (
              <div key={field.name} className="relative min-w-0">
                <NumberField
                  name={field.name}
                  data-field={field.name}
                  value={settings.input[field.name]}
                  onChange={(value) =>
                    settings.change(field.name, value ?? Number.NaN)
                  }
                  formatOptions={{
                    useGrouping: false,
                    maximumFractionDigits: 20,
                  }}
                  commitBehavior="validate"
                  validationBehavior="aria"
                  isDisabled={disabled}
                  isInvalid={Boolean(settings.errors[field.name])}
                  className="min-w-0 gap-2"
                >
                  <Label className="flex min-h-11 items-center pr-14 text-sm font-medium">
                    {field.label}
                  </Label>
                  <NumberField.Group
                    className={`h-12 w-full rounded-lg border! bg-background shadow-none ring-0! outline-none! [--tw-ring-offset-width:0px] data-[focus-visible=true]:outline-solid! data-[focus-visible=true]:outline-2! data-[focus-visible=true]:outline-offset-3! data-[focus-visible=true]:outline-focus! ${settings.errors[field.name] ? 'border-danger!' : 'border-border!'}`}
                  >
                    <NumberField.Input className="h-full w-full px-3 py-0" />
                  </NumberField.Group>
                  <FieldError className="whitespace-normal wrap-anywhere">
                    {settings.errors[field.name]}
                  </FieldError>
                </NumberField>
                <div className="absolute top-0 right-0">
                  <StorageTip label={field.label}>
                    {field.description}
                  </StorageTip>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </ComponentEntrance>
    </Form>
  );
}
