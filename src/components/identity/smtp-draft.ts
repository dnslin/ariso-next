import type { SmtpSettings, SmtpInput } from './smtp-request';

export type SmtpDraft = Omit<SmtpSettings, 'hasPassword' | 'updatedAt'> & {
  password: string;
};
export function smtpDraft(saved: SmtpSettings | null): SmtpDraft {
  return {
    host: saved?.host ?? '',
    port: saved?.port ?? 587,
    mode: saved?.mode ?? 'starttls',
    username: saved?.username ?? '',
    fromName: saved?.fromName ?? '',
    fromEmail: saved?.fromEmail ?? '',
    password: '',
  };
}
export function smtpDraftInput(draft: SmtpDraft): SmtpInput {
  return {
    host: draft.host.trim(),
    port: draft.port,
    mode: draft.mode,
    username: draft.username.trim(),
    fromName: draft.fromName.trim(),
    fromEmail: draft.fromEmail.trim().toLowerCase(),
    ...(draft.password ? { password: draft.password } : {}),
  };
}
export function smtpDraftMatches(draft: SmtpDraft, saved: SmtpSettings | null) {
  if (!saved) return false;
  const input = smtpDraftInput(draft);
  return (
    ['host', 'port', 'mode', 'username', 'fromName', 'fromEmail'] as const
  ).every((key) => input[key] === saved[key]);
}
export function smtpDraftChanged(draft: SmtpDraft, saved: SmtpSettings | null) {
  return !!draft.password || !smtpDraftMatches(draft, saved);
}
