'use client';

import { ComponentEntrance } from '../../components/component-entrance';

import { FieldError } from '@heroui/react/field-error';
import { InputGroup } from '@heroui/react/input-group';
import { Label } from '@heroui/react/label';
import { TextField } from '@heroui/react/textfield';
import { LockKeyhole } from 'lucide-react';
import { ExpiryControls, SettingSwitch } from './controls';
import type { useSettings } from './use-settings';

export function ShareCreateForm({
  settings,
  timeZone,
}: {
  settings: ReturnType<typeof useSettings>;
  timeZone: string;
}) {
  return (
    <ComponentEntrance
      as="form"
      delay={0.055}
      id="share-create-form"
      data-testid="share-create"
      className="grid max-w-160 gap-5"
      aria-busy={settings.busy}
      onSubmit={(event) => {
        event.preventDefault();
        void settings.create();
      }}
    >
      <div className="border-b border-border py-4">
        <SettingSwitch
          label="显示图片名称"
          selected={settings.showName}
          disabled={settings.blocked}
          onChange={settings.setShowName}
        />
      </div>
      <TextField
        value={settings.password}
        onChange={settings.setPassword}
        isDisabled={settings.blocked}
        isInvalid={Boolean(settings.errors.password)}
        validationBehavior="aria"
      >
        <Label className="text-sm">访问密码</Label>
        <InputGroup
          className={`h-12 w-full rounded-lg border bg-transparent shadow-none ${settings.errors.password ? 'border-danger' : 'border-border'}`}
        >
          <InputGroup.Prefix className="pl-3">
            <LockKeyhole size={16} aria-hidden />
          </InputGroup.Prefix>
          <InputGroup.Input
            id="share-password"
            type="password"
            autoComplete="new-password"
            placeholder="不设置密码"
            className="min-w-0 text-base md:text-sm"
          />
        </InputGroup>
        <FieldError>{settings.errors.password}</FieldError>
      </TextField>
      <ExpiryControls
        draft={settings.expiry}
        onChange={settings.setExpiry}
        timeZone={timeZone}
        disabled={settings.blocked}
        error={settings.errors.expiry}
      />
      {settings.errors.create ? (
        <p role="alert" className="text-sm text-danger">
          {settings.errors.create}
        </p>
      ) : null}
    </ComponentEntrance>
  );
}
