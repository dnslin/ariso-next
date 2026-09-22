'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Description } from '@heroui/react/description';
import { FieldError } from '@heroui/react/field-error';
import { InputGroup } from '@heroui/react/input-group';
import { Label } from '@heroui/react/label';
import { TextField } from '@heroui/react/textfield';
import { Tooltip } from '@heroui/react/tooltip';
import { Eye, EyeOff, Mail, LockKeyhole } from 'lucide-react';

export function IdentityField({
  name,
  label,
  value,
  onChange,
  error,
  description,
  secret = false,
  autoComplete = 'off',
  icon,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  description?: string;
  secret?: boolean;
  autoComplete?: string;
  icon?: 'email' | 'password';
}) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      name={name}
      value={value}
      onChange={onChange}
      isInvalid={!!error}
      validationBehavior="aria"
      isRequired
    >
      <Label>{label}</Label>
      <InputGroup className="min-h-12 w-full rounded-xl border shadow-none">
        {icon ? (
          <InputGroup.Prefix>
            {icon === 'email' ? (
              <Mail className="size-4" aria-hidden="true" />
            ) : (
              <LockKeyhole className="size-4" aria-hidden="true" />
            )}
          </InputGroup.Prefix>
        ) : null}
        <InputGroup.Input
          className="min-w-0"
          id={name}
          type={secret && !visible ? 'password' : 'text'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          inputMode={
            name === 'email'
              ? 'email'
              : name === 'publicUrl'
                ? 'url'
                : undefined
          }
        />
        {secret ? (
          <InputGroup.Suffix className="px-0.5">
            <Tooltip>
              <Button
                type="button"
                variant="ghost"
                isIconOnly
                className="size-11 min-w-11 rounded-lg text-muted"
                aria-label={`${visible ? '隐藏' : '显示'}${label}`}
                aria-pressed={visible}
                onPress={() => setVisible(!visible)}
              >
                {visible ? (
                  <EyeOff className="size-5" aria-hidden="true" />
                ) : (
                  <Eye className="size-5" aria-hidden="true" />
                )}
              </Button>
              <Tooltip.Content>
                {visible ? '隐藏' : '显示'}
                {label}
              </Tooltip.Content>
            </Tooltip>
          </InputGroup.Suffix>
        ) : null}
      </InputGroup>
      {description ? <Description>{description}</Description> : null}
      <FieldError>{error}</FieldError>
    </TextField>
  );
}
