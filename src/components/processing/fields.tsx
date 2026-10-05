'use client';

import { NumberField } from '@heroui/react/number-field';
import { Slider } from '@heroui/react/slider';
import { ColorField } from '@heroui/react/color-field';
import { ColorSwatch } from '@heroui/react/color-swatch';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import { Select } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';
import { Switch } from '@heroui/react/switch';
import { controlClass } from './model';

export function ProcessingSelect({
  name,
  label,
  value,
  options,
  disabled,
  error,
  description,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  disabled?: boolean;
  error?: string;
  description?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      data-field={name}
      name={name}
      value={value}
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
      className="min-w-0 gap-2"
      onChange={(next) => {
        if (next !== null) onChange(String(next));
      }}
    >
      <Label className="text-[13px] font-normal">{label}</Label>
      <Select.Trigger className={`${controlClass} w-full px-3`}>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map(([id, text]) => (
            <ListBox.Item
              key={id}
              id={id}
              textValue={text}
              className="min-h-11"
            >
              {text}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
      <FieldError>{error}</FieldError>
      {description ? (
        <p className="text-[13px] leading-normal text-muted">{description}</p>
      ) : null}
    </Select>
  );
}

export function ProcessingNumber({
  name,
  label,
  value,
  min,
  max,
  disabled,
  error,
  description,
  slider = false,
  integer = false,
  onChange,
}: {
  name: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  error?: string;
  description?: string;
  slider?: boolean;
  integer?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div data-field={name} className="grid min-w-0 self-start gap-2">
      <NumberField
        name={name}
        value={value}
        onChange={(next) => onChange(next ?? Number.NaN)}
        isDisabled={disabled}
        isInvalid={Boolean(error)}
        validationBehavior="aria"
        commitBehavior="validate"
        minValue={min}
        maxValue={max}
        formatOptions={{ useGrouping: false, maximumFractionDigits: 20 }}
        className="gap-2"
      >
        <Label className="text-[13px] font-normal">{label}</Label>
        <NumberField.Group
          className={`${controlClass} w-full border-0 ring-1 ring-inset ${error ? 'ring-danger' : 'ring-border'}`}
        >
          <NumberField.Input className="h-full w-full min-w-0 px-3 py-0" />
        </NumberField.Group>
        <FieldError>{error}</FieldError>
      </NumberField>
      {slider ? (
        <Slider
          aria-label={`${label}滑块`}
          value={Number.isFinite(value) ? value : min}
          minValue={min}
          maxValue={max}
          step={integer ? 1 : 0.1}
          isDisabled={disabled}
          onChange={(next) => {
            if (typeof next === 'number') onChange(next);
          }}
          className="min-h-11 justify-center"
        >
          <Slider.Track className="h-2 rounded-full bg-default">
            <Slider.Fill className="bg-accent" />
            <Slider.Thumb className="size-11 border-0 bg-transparent after:size-5 after:shrink-0 after:rounded-full after:bg-foreground" />
          </Slider.Track>
        </Slider>
      ) : null}
      {description ? (
        <p className="text-[13px] leading-normal text-muted">{description}</p>
      ) : null}
    </div>
  );
}

export function ProcessingColor({
  name,
  label,
  value,
  disabled,
  error,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  disabled?: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <ColorField
      data-field={name}
      name={name}
      value={valid ? value : null}
      onChange={(color) => onChange(color?.toString('hex') ?? '')}
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
      className="min-w-0 gap-2"
    >
      <Label className="text-[13px] font-normal">{label}</Label>
      <ColorField.Group
        className={`${controlClass} w-full border-0 ring-1 ring-inset ${error ? 'ring-danger' : 'ring-border'}`}
      >
        <ColorField.Prefix className="pl-3 pr-2">
          <ColorSwatch
            color={valid ? value : undefined}
            className="size-5 rounded-md border border-border"
          />
        </ColorField.Prefix>
        <ColorField.Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-full min-w-0 px-0 pr-3 py-0"
        />
      </ColorField.Group>
      <FieldError>{error}</FieldError>
    </ColorField>
  );
}

export function ProcessingSwitch({
  label,
  selected,
  disabled,
  onChange,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Switch
      aria-label={label}
      isSelected={selected}
      isDisabled={disabled}
      onChange={onChange}
      className="[--switch-control-bg:var(--border)] [--switch-control-bg-checked:var(--accent)] [--switch-control-bg-checked-hover:var(--accent)]"
    >
      <Switch.Content className="min-h-11 gap-3">
        <Switch.Control className="h-6 w-11">
          <Switch.Thumb className="size-5 bg-white" />
        </Switch.Control>
        <Label className="text-[13px] font-normal">
          {selected ? '已开启' : '已关闭'}
        </Label>
      </Switch.Content>
    </Switch>
  );
}
