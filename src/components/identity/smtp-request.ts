import { z } from 'zod';
import { AccountRequestError } from './account-request';

const settingsSchema = z.object({
  host: z.string(),
  port: z.number().int(),
  mode: z.enum(['tls', 'starttls']),
  username: z.string(),
  fromName: z.string(),
  fromEmail: z.string(),
  hasPassword: z.boolean(),
  updatedAt: z.string(),
});
const diagnosticSchema = z.object({
  stage: z.enum(['connection', 'tls', 'authentication', 'delivery']),
  code: z.string(),
  command: z.string().optional(),
  responseCode: z.number().optional(),
  delivery: z.enum(['not-accepted', 'unknown']),
});
const acceptanceSchema = z.object({
  acceptance: z.literal('smtp-accepted'),
  finalReceipt: z.literal('unverified'),
  accepted: z.array(z.string()),
  rejected: z.array(z.string()),
  messageId: z.string(),
});
export type SmtpSettings = z.infer<typeof settingsSchema>;
export type SmtpDiagnostic = z.infer<typeof diagnosticSchema>;
export type SmtpInput = Partial<
  Pick<
    SmtpSettings,
    'host' | 'port' | 'mode' | 'username' | 'fromName' | 'fromEmail'
  >
> & { password?: string; clearCredentials?: true };

export class SmtpRequestError extends AccountRequestError {
  readonly diagnostic?: SmtpDiagnostic;
  constructor(status: number, body: unknown) {
    super(status, body);
    const parsed = diagnosticSchema.safeParse(
      body && typeof body === 'object' && 'diagnostic' in body
        ? body.diagnostic
        : undefined,
    );
    this.diagnostic = parsed.success ? parsed.data : undefined;
  }
}
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init });
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    if (!response.ok)
      throw new SmtpRequestError(response.status, {
        message: 'SMTP 响应格式异常',
      });
    throw new Error(`无法读取 SMTP 操作结果（HTTP ${response.status}）`, {
      cause,
    });
  }
  if (!response.ok) throw new SmtpRequestError(response.status, body);
  return body;
}
export async function readSmtpSettings(signal?: AbortSignal) {
  return settingsSchema
    .nullable()
    .parse(await request('/api/settings/smtp', { signal }));
}
export async function saveSmtpSettings(input: SmtpInput) {
  return settingsSchema.parse(
    await request('/api/settings/smtp', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}
export async function testSmtpSettings() {
  return acceptanceSchema.parse(
    await request('/api/settings/smtp/test', { method: 'POST' }),
  );
}
