import { z } from 'zod';

const tokenSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
});

export type TokenRecord = z.infer<typeof tokenSchema>;
export type TokenCreateInput = { name: string; expiresIn?: number };
export const tokenNameSchema = z
  .string()
  .trim()
  .min(1, '请输入名称')
  .max(32, '名称最多 32 个字符');

export class TokenRequestError extends Error {
  readonly code?: string;
  readonly fields: { field: string; message: string }[];
  constructor(
    readonly status: number,
    body: unknown,
  ) {
    const error = z
      .object({
        code: z.string().optional(),
        message: z.string().optional(),
        fields: z
          .array(z.object({ field: z.string(), message: z.string() }))
          .optional(),
      })
      .safeParse(body);
    const code = error.success ? error.data.code : undefined;
    super(
      `${error.success && error.data.message ? error.data.message : 'Token 请求失败'}（HTTP ${status}${code ? ` / ${code}` : ''}）`,
    );
    this.code = code;
    this.fields = error.success ? (error.data.fields ?? []) : [];
  }
}

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init });
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    if (!response.ok)
      throw new TokenRequestError(response.status, {
        message: 'Token 响应格式异常',
      });
    throw new Error(`无法读取 Token 操作结果（HTTP ${response.status}）`, {
      cause,
    });
  }
  if (!response.ok) throw new TokenRequestError(response.status, body);
  return body;
}

const path = '/api/upload-tokens';
export async function readTokens(signal?: AbortSignal): Promise<TokenRecord[]> {
  return z
    .object({ tokens: z.array(tokenSchema) })
    .parse(await request(path, { signal })).tokens;
}

export async function createToken(input: TokenCreateInput) {
  return z.object({ token: tokenSchema, key: z.string().min(1) }).parse(
    await request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function setTokenEnabled(id: string, enabled: boolean) {
  return z.object({ token: tokenSchema }).parse(
    await request(`${path}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }),
  ).token;
}

export async function revokeToken(id: string) {
  z.object({ success: z.literal(true) }).parse(
    await request(`${path}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
}

export function newTokenCandidates(
  beforeIds: readonly string[],
  tokens: TokenRecord[],
) {
  const previous = new Set(beforeIds);
  return tokens.filter(({ id }) => !previous.has(id));
}
