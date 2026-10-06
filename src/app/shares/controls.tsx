'use client';
import { useId, type ReactNode } from 'react';
import { Switch } from '@heroui/react/switch';
import { Label } from '@heroui/react/label';
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { ToggleButton } from '@heroui/react/toggle-button';
import { DatePicker } from '@heroui/react/date-picker';
import { DateInputGroup } from '@heroui/react/date-input-group';
import { Calendar } from '@heroui/react/calendar';
import { FieldError } from '@heroui/react/field-error';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { expiryAmbiguity, type ExpiryDraft } from './model';
export function SettingSwitch({
  label,
  selected,
  disabled,
  onChange,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onChange: (selected: boolean) => void;
}) {
  return (
    <Switch
      aria-label={label}
      isSelected={selected}
      isDisabled={disabled}
      onChange={onChange}
      className="w-full [--switch-control-bg:var(--border)] [--switch-control-bg-checked:var(--accent)] [--switch-control-bg-checked-hover:var(--accent)]"
    >
      <Switch.Content className="flex min-h-11 w-full justify-between gap-3">
        <Label className="text-sm font-normal">{label}</Label>
        <Switch.Control className="h-6 w-11">
          <Switch.Thumb className="size-5 bg-white" />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}
export function Choices({
  label,
  value,
  onChange,
  children,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <ToggleButtonGroup
      aria-labelledby={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      isDisabled={disabled}
      onSelectionChange={(keys) => onChange(String([...keys][0]))}
      isDetached
      className="flex w-full gap-1 rounded-xl border border-border bg-transparent p-1"
    >
      {children}
    </ToggleButtonGroup>
  );
}
export function ExpiryControls({
  draft,
  onChange,
  timeZone,
  disabled,
  error,
}: {
  draft: ExpiryDraft;
  onChange: (draft: ExpiryDraft) => void;
  timeZone: string;
  disabled?: boolean;
  error?: string;
}) {
  const labelId = useId();
  return (
    <div className="grid gap-3">
      <Label id={labelId} className="text-sm">
        截止方式
      </Label>
      <Choices
        label={labelId}
        value={draft.mode}
        onChange={(mode) =>
          onChange({ ...draft, mode: mode as ExpiryDraft['mode'] })
        }
        disabled={disabled}
      >
        <ToggleButton
          id="forever"
          className="h-12 flex-1 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
        >
          不过期
        </ToggleButton>
        <ToggleButton
          id="date"
          className="h-12 flex-1 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
        >
          指定时间
        </ToggleButton>
      </Choices>
      {draft.mode === 'date' ? (
        <DatePicker
          isDisabled={disabled}
          isInvalid={Boolean(error)}
          validationBehavior="aria"
          value={draft.value}
          onChange={(value) =>
            onChange({ ...draft, value, disambiguation: 'reject' })
          }
          granularity="minute"
          hourCycle={24}
          className="gap-2"
        >
          <Label className="text-sm">截止时间</Label>
          <DateInputGroup
            className={`min-h-12 w-full rounded-lg border bg-transparent px-2 ${error ? 'border-danger' : 'border-border'}`}
          >
            <DateInputGroup.Input className="min-w-0 text-sm">
              {(segment) => <DateInputGroup.Segment segment={segment} />}
            </DateInputGroup.Input>
            <DateInputGroup.Suffix>
              <DatePicker.Trigger aria-label="打开日历" className="size-11">
                <CalendarClock size={18} aria-hidden />
              </DatePicker.Trigger>
            </DateInputGroup.Suffix>
          </DateInputGroup>
          <DatePicker.Popover className="max-w-[calc(100vw-32px)] rounded-xl border border-border bg-surface p-2">
            <Calendar className="w-[308px] max-w-[308px]">
              <Calendar.Header>
                <Calendar.NavButton
                  slot="previous"
                  aria-label="上个月"
                  className="size-11"
                >
                  <ChevronLeft size={16} aria-hidden />
                </Calendar.NavButton>
                <Calendar.Heading />
                <Calendar.NavButton
                  slot="next"
                  aria-label="下个月"
                  className="size-11"
                >
                  <ChevronRight size={16} aria-hidden />
                </Calendar.NavButton>
              </Calendar.Header>
              <Calendar.Grid>
                <Calendar.GridHeader>
                  {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                </Calendar.GridHeader>
                <Calendar.GridBody>
                  {(date) => <Calendar.Cell date={date} className="size-11" />}
                </Calendar.GridBody>
              </Calendar.Grid>
            </Calendar>
          </DatePicker.Popover>
          <FieldError>{error}</FieldError>
        </DatePicker>
      ) : null}
      {draft.mode === 'date' && expiryAmbiguity(draft.value, timeZone) ? (
        <div className="grid gap-2">
          <Label id={`${labelId}-dst`} className="text-sm">
            此时间因夏令时重复，请选择
          </Label>
          <Choices
            label={`${labelId}-dst`}
            value={draft.disambiguation}
            onChange={(choice) =>
              onChange({
                ...draft,
                disambiguation: choice as ExpiryDraft['disambiguation'],
              })
            }
            disabled={disabled}
          >
            <ToggleButton id="earlier" className="min-h-12 flex-1">
              较早一次
            </ToggleButton>
            <ToggleButton id="later" className="min-h-12 flex-1">
              较晚一次
            </ToggleButton>
          </Choices>
        </div>
      ) : null}
      {draft.mode === 'forever' && error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <p className="text-xs leading-5 text-muted">
        时间按站点时区 {timeZone} 显示。
      </p>
    </div>
  );
}
