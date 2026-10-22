import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Form } from '@heroui/react/form';
import { NumberField } from '@heroui/react/number-field';
import { Radio } from '@heroui/react/radio';
import { RadioGroup } from '@heroui/react/radio-group';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import {
  Eye,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
} from 'lucide-react';
import type { AccessProtectionInput } from '../../server/access-protection/types';
import { StorageTip } from '../storage/storage-tip';
import { siteCardClass } from '../site/site-form';
import { protectionFields } from './model';
import { AccessProtectionFeedback } from './feedback';
import type { useAccessProtection } from './use-access-protection';

export function AccessProtectionForm({
  editor,
  disabled,
}: {
  editor: ReturnType<typeof useAccessProtection>;
  disabled: boolean;
}) {
  return (
    <Form
      id="access-protection-form"
      className="grid gap-5"
      validationBehavior="aria"
      onSubmit={(event) => {
        event.preventDefault();
        void editor.save();
      }}
    >
      <Card className={`${siteCardClass} gap-5 min-[1200px]:py-6`}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <ShieldCheck className="size-5" aria-hidden />
            防护模式
          </h2>
          <StorageTip label="防护模式">
            <p>关闭：不记录限频命中，也不拦截。</p>
            <p>仅观察：记录可能超限的请求，访问照常放行。建议先使用此模式。</p>
            <p>启用拦截：超限时暂缓访问，额度恢复后自动放行。</p>
          </StorageTip>
        </div>
        <RadioGroup
          aria-label="防护模式"
          data-protection-field="mode"
          name="protection-mode"
          value={editor.input.mode}
          onChange={(value) =>
            editor.change('mode', value as AccessProtectionInput['mode'])
          }
          isDisabled={disabled}
          isInvalid={!!editor.errors.mode}
          className="gap-3 [&_[data-slot=radio]]:mt-0!"
        >
          {(
            [
              ['off', '关闭', '不记录、不拦截', ShieldOff],
              ['observe', '仅观察', '记录，不拦截', Eye],
              ['enforce', '启用拦截', '超限时拦截', ShieldCheck],
            ] as const
          ).map(([value, label, description, Icon]) => (
            <Radio
              key={value}
              value={value}
              className="gap-0 rounded-xl border border-border p-0 data-[selected=true]:border-foreground/60 data-[selected=true]:bg-default/40"
            >
              <Radio.Content className="min-h-14 w-full gap-3 px-4 py-3">
                <Radio.Control className="shrink-0 border border-foreground/35 shadow-none">
                  <Radio.Indicator />
                </Radio.Control>
                <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </span>
                  <span className="text-xs leading-5 font-normal text-muted">
                    {description}
                  </span>
                </span>
              </Radio.Content>
            </Radio>
          ))}
          <FieldError>{editor.errors.mode}</FieldError>
        </RadioGroup>
      </Card>
      <Card className={`${siteCardClass} gap-5 min-[1200px]:py-6`}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <SlidersHorizontal className="size-5" aria-hidden />
            匿名访问额度
          </h2>
          <Button
            variant="ghost"
            className="min-h-11 gap-1.5 rounded-lg px-2 text-xs"
            isDisabled={disabled || editor.input.mode === 'off'}
            onPress={editor.suggested}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            使用建议值
          </Button>
        </div>
        {editor.input.mode === 'off' ? (
          <p className="text-sm text-muted">已关闭防护，原额度保留。</p>
        ) : null}
        <div className="grid items-start gap-5 sm:grid-cols-2">
          {protectionFields.map((field) => (
            <div key={field.name} className="relative min-w-0">
              <NumberField
                name={field.name}
                data-protection-field={field.name}
                value={
                  editor.input.mode === 'off'
                    ? editor.saved![field.name]
                    : editor.input[field.name]
                }
                onChange={(value) =>
                  editor.change(field.name, value ?? Number.NaN)
                }
                commitBehavior="validate"
                validationBehavior="aria"
                formatOptions={{
                  useGrouping: false,
                  maximumFractionDigits: 20,
                }}
                isDisabled={disabled || editor.input.mode === 'off'}
                isInvalid={!!editor.errors[field.name]}
                className="gap-2"
              >
                <Label className="flex min-h-11 items-center pr-12 text-sm font-medium">
                  {field.label}
                </Label>
                <NumberField.Group
                  className={`flex! h-12 rounded-lg border! bg-background shadow-none ring-0! ${editor.errors[field.name] ? 'border-danger!' : 'border-border!'}`}
                >
                  <NumberField.Input className="h-full min-w-0 flex-1 px-3" />
                  <span className="shrink-0 pr-3 text-xs text-muted">
                    {field.unit}
                  </span>
                </NumberField.Group>
                <FieldError>{editor.errors[field.name]}</FieldError>
              </NumberField>
              <div className="absolute top-0 right-0">
                <StorageTip label={field.label}>{field.description}</StorageTip>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <AccessProtectionFeedback editor={editor} />
    </Form>
  );
}
