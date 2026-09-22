'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Description } from '@heroui/react/description';
import { FieldError } from '@heroui/react/field-error';
import { InputGroup } from '@heroui/react/input-group';
import { Label } from '@heroui/react/label';
import { TextField } from '@heroui/react/textfield';

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
      <InputGroup>
        {icon ? (
          <InputGroup.Prefix>
            <span
              className={`identity-icon identity-icon-${icon}`}
              aria-hidden="true"
            />
          </InputGroup.Prefix>
        ) : null}
        <InputGroup.Input
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
          <InputGroup.Suffix>
            <Button
              type="button"
              variant="tertiary"
              aria-label={`${visible ? '隐藏' : '显示'}${label}`}
              aria-pressed={visible}
              onPress={() => setVisible(!visible)}
            >
              {visible ? '隐藏' : '显示'}
            </Button>
          </InputGroup.Suffix>
        ) : null}
      </InputGroup>
      {description ? <Description>{description}</Description> : null}
      <FieldError>{error}</FieldError>
    </TextField>
  );
}
