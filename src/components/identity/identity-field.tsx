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
  placeholder,
  layout = 'setup',
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
  placeholder?: string;
  layout?: 'login' | 'setup';
}) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      className={layout === 'login' ? 'gap-1' : 'gap-1.5'}
      name={name}
      value={value}
      onChange={onChange}
      isInvalid={!!error}
      validationBehavior="aria"
      isRequired
    >
      <Label className="text-sm leading-[1.5] font-normal after:content-none">
        {label}
      </Label>
      <InputGroup
        className={`w-full rounded-lg border bg-background shadow-none ${layout === 'login' ? 'h-11 min-h-11 min-[1200px]:h-9 min-[1200px]:min-h-9' : 'h-12 min-h-12'}`}
      >
        {icon ? (
          <InputGroup.Prefix className="border-0 pr-2 text-foreground">
            {icon === 'email' ? (
              <Mail className="size-4" aria-hidden="true" />
            ) : (
              <LockKeyhole className="size-4" aria-hidden="true" />
            )}
          </InputGroup.Prefix>
        ) : null}
        <InputGroup.Input
          className="h-full min-w-0 py-0 leading-[1.5] placeholder:text-foreground"
          placeholder={placeholder}
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
                className={`size-11 min-w-11 rounded-lg text-muted ${layout === 'login' ? 'min-[1200px]:size-8 min-[1200px]:min-w-8' : ''}`}
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
      {description ? (
        <Description className="leading-[1.5]">{description}</Description>
      ) : null}
      <FieldError>{error}</FieldError>
    </TextField>
  );
}
