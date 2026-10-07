import { githubSettingsInputSchema } from '../../server/identity/validation';
import type { GithubSettingsInput } from './github-request';

export type GithubSettingsDraft = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  clearSecret: boolean;
};

/** 空输入不消费已保存密钥；清除必须来自明确确认。 */
export function githubSettingsDraftInput(
  draft: GithubSettingsDraft,
): GithubSettingsInput {
  return {
    enabled: draft.enabled,
    clientId: draft.clientId.trim(),
    ...(draft.clearSecret
      ? { clientSecret: null }
      : draft.clientSecret !== ''
        ? { clientSecret: draft.clientSecret }
        : {}),
  };
}

export function githubSettingsDraftErrors(
  draft: GithubSettingsDraft,
  hasSecret: boolean,
) {
  const input = githubSettingsDraftInput(draft);
  const parsed = githubSettingsInputSchema.safeParse(input);
  const errors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      errors[String(issue.path[0])] ??= issue.message;
  }
  if (input.enabled) {
    if (!input.clientId) errors.clientId = '请输入 Client ID';
    if (!input.clientSecret && (draft.clearSecret || !hasSecret))
      errors.clientSecret = '请输入 Client Secret';
  }
  return errors;
}
