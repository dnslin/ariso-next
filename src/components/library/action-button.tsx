'use client';

import { forwardRef, type ComponentProps } from 'react';
import { Button } from '@heroui/react/button';
import { Tooltip } from '@heroui/react/tooltip';

export const actionGroupClass =
  'shrink-0 rounded-lg [&_.button]:rounded-none [&_.button:first-child]:rounded-s-lg [&_.button:last-child]:rounded-e-lg';

export const ActionIconButton = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof Button> & { label: string }
>(function ActionIconButton(
  { label, className, variant = 'tertiary', ...props },
  ref,
) {
  const base = 'size-11 min-h-11 min-w-11 shrink-0 rounded-lg p-0';
  return (
    <Tooltip closeDelay={0}>
      <Button
        {...props}
        ref={ref}
        aria-label={label}
        isIconOnly
        variant={variant}
        className={
          typeof className === 'function'
            ? (state) => `${base} ${className(state)}`
            : `${base} ${className ?? ''}`
        }
      />
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
});
