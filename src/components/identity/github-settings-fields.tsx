'use client';

import { Button } from '@heroui/react/button';
import { FieldError } from '@heroui/react/field-error';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { Switch } from '@heroui/react/switch';
import { TextField } from '@heroui/react/textfield';
import { GithubCallbackCopy } from './github-callback-copy';
import type { GithubSettings } from './github-request';
import type { useGithubSettingsEditor } from './use-github-settings-editor';

export function GithubSettingsFields({
  editor,
  settings,
  onClear,
}: {
  editor: ReturnType<typeof useGithubSettingsEditor>;
  settings: GithubSettings;
  onClear: () => void;
}) {
  const locked = editor.phase !== 'editing';
  return (
    <>
      <TextField
        name="clientId"
        value={editor.draft.clientId}
        onChange={(value) => editor.change('clientId', value)}
        isDisabled={locked}
        isInvalid={!!editor.errors.clientId}
        validationBehavior="aria"
        className="gap-1.5"
      >
        <Label className="text-sm font-normal">Client ID</Label>
        <Input
          id="oauth-client-id"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={`h-12 rounded-lg border ${editor.errors.clientId ? 'border-danger' : 'border-border'} bg-background px-3.5 text-sm shadow-none`}
          placeholder="请输入 GitHub OAuth App 的 Client ID"
        />
        <FieldError>{editor.errors.clientId}</FieldError>
      </TextField>
      <TextField
        name="clientSecret"
        value={editor.draft.clientSecret}
        onChange={(value) => editor.change('clientSecret', value)}
        isDisabled={locked}
        isInvalid={!!editor.errors.clientSecret}
        validationBehavior="aria"
        className="gap-1.5"
      >
        <Label className="text-sm font-normal">Client Secret</Label>
        <Input
          id="oauth-client-secret"
          type="password"
          autoComplete="new-password"
          autoCapitalize="none"
          spellCheck={false}
          className={`h-12 rounded-lg border ${editor.errors.clientSecret ? 'border-danger' : 'border-border'} bg-background px-3.5 text-sm shadow-none`}
          placeholder={
            settings.saved.hasSecret && !editor.draft.clearSecret
              ? '留空保留现有密钥'
              : '请输入 Client Secret'
          }
        />
        <FieldError>{editor.errors.clientSecret}</FieldError>
      </TextField>
      <p
        data-testid="oauth-secret-status"
        className="text-[13px] leading-normal text-muted"
      >
        {editor.draft.clearSecret
          ? '保存时将清除密钥并停用。'
          : settings.saved.hasSecret
            ? '已设置 Client Secret。留空保留现有密钥。'
            : '尚未设置 Client Secret。'}
      </p>
      <GithubCallbackCopy url={settings.callbackUrl} isDisabled={editor.busy} />
      <Switch
        data-testid="oauth-enabled"
        isSelected={editor.draft.enabled}
        onChange={(value) => editor.change('enabled', value)}
        isDisabled={locked || editor.draft.clearSecret}
        className="w-full"
      >
        <Switch.Content className="flex min-h-11 w-full justify-between gap-3">
          <Label className="text-sm font-normal">启用 GitHub 登录</Label>
          <Switch.Control className="h-6 w-11">
            <Switch.Thumb className="size-5 bg-white" />
          </Switch.Control>
        </Switch.Content>
      </Switch>
      {settings.saved.hasSecret && !editor.draft.clearSecret ? (
        <Button
          data-testid="oauth-secret-clear"
          type="button"
          variant="outline"
          isDisabled={locked}
          className="min-h-11 w-fit rounded-lg bg-background px-3 text-sm font-normal"
          onPress={onClear}
        >
          清除密钥
        </Button>
      ) : null}
    </>
  );
}
