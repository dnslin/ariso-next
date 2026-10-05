'use client';

import { Button } from '@heroui/react/button';
import { Calendar } from '@heroui/react/calendar';
import { DateField } from '@heroui/react/date-field';
import { DatePicker } from '@heroui/react/date-picker';
import { Description } from '@heroui/react/description';
import { FieldError } from '@heroui/react/field-error';
import { Label } from '@heroui/react/label';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  now,
  toCalendarDateTime,
  type CalendarDateTime,
} from '@internationalized/date';

export function TokenExpiryField({
  value,
  onChange,
  timeZone,
  error,
  onRemove,
}: {
  value: CalendarDateTime | null;
  onChange: (value: CalendarDateTime | null) => void;
  timeZone: string;
  error?: string;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-3">
      <DatePicker
        data-testid="api-expiry"
        value={value}
        onChange={onChange}
        placeholderValue={toCalendarDateTime(now(timeZone).add({ days: 1 }))}
        granularity="second"
        hourCycle={24}
        isInvalid={!!error}
        isRequired
        validationBehavior="aria"
        className="gap-1.5"
      >
        <Label className="text-sm font-normal after:content-none">
          到期时间
        </Label>
        <DateField.Group className="h-12 min-h-12 w-full rounded-lg border border-border bg-background shadow-none">
          <DateField.Input
            data-testid="api-expiry-input"
            className="min-w-0 text-sm"
          >
            {(segment) => (
              <DateField.Segment
                segment={segment}
                data-segment-type={segment.type}
              />
            )}
          </DateField.Input>
          <DateField.Suffix className="pr-0">
            <DatePicker.Trigger
              aria-label="选择到期日期"
              className="size-11 min-w-11"
            >
              <CalendarDays className="size-4" aria-hidden />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <Description className="text-xs text-muted">
          按站点时区（{timeZone}）设置。
        </Description>
        <FieldError>{error}</FieldError>
        <DatePicker.Popover className="rounded-xl border border-border bg-surface">
          <Calendar aria-label="到期日期">
            <Calendar.Header>
              <Calendar.Heading />
              <Calendar.NavButton slot="previous" aria-label="上个月">
                <ChevronLeft className="size-4" />
              </Calendar.NavButton>
              <Calendar.NavButton slot="next" aria-label="下个月">
                <ChevronRight className="size-4" />
              </Calendar.NavButton>
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>
                {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
              </Calendar.GridHeader>
              <Calendar.GridBody>
                {(date) => <Calendar.Cell date={date} />}
              </Calendar.GridBody>
            </Calendar.Grid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
      <Button
        data-testid="api-no-expiry"
        variant="outline"
        className="h-12 w-full rounded-lg bg-background text-sm font-normal"
        onPress={onRemove}
      >
        改为永不过期
      </Button>
    </div>
  );
}
