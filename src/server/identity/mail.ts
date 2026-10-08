import nodemailer from 'nodemailer';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { z } from 'zod';
import type { createSecretCrypto } from '../runtime/crypto.ts';
import { AccountError } from './errors.ts';
import { smtpSettings } from './schema.ts';
import type { smtpSettingsInputSchema } from './validation.ts';

type SecretCrypto = ReturnType<typeof createSecretCrypto>;
export type SmtpConfig = {
  host: string;
  port: number;
  mode: 'tls' | 'starttls';
  username: string;
  password: string | null;
  fromName: string;
  fromEmail: string;
};

function savedSmtpSettings(db: BetterSQLite3Database) {
  return db.select().from(smtpSettings).where(eq(smtpSettings.id, 1)).get();
}

export function readSmtpSettings(db: BetterSQLite3Database) {
  const saved = savedSmtpSettings(db);
  if (!saved) return null;
  return {
    host: saved.host,
    port: saved.port,
    mode: saved.mode,
    username: saved.username,
    fromName: saved.fromName,
    fromEmail: saved.fromEmail,
    hasPassword: saved.passwordEncrypted !== null,
    updatedAt: saved.updatedAt.toISOString(),
  };
}

export type PublicSmtpSettings = NonNullable<
  ReturnType<typeof readSmtpSettings>
>;

/** Startup and each send read the persisted configuration; no restart snapshot. */
export function readSmtpConfig(
  db: BetterSQLite3Database,
  crypto: SecretCrypto,
): SmtpConfig | null {
  const saved = savedSmtpSettings(db);
  if (!saved) return null;
  return {
    host: saved.host,
    port: saved.port,
    mode: saved.mode,
    username: saved.username,
    password:
      saved.passwordEncrypted === null
        ? null
        : crypto.decryptSecret(
            saved.passwordEncrypted,
            'identity/smtp/password',
          ),
    fromName: saved.fromName,
    fromEmail: saved.fromEmail,
  };
}

export function updateSmtpSettings(
  db: BetterSQLite3Database,
  crypto: SecretCrypto,
  input: z.infer<typeof smtpSettingsInputSchema>,
) {
  db.transaction(
    (tx) => {
      const current = savedSmtpSettings(tx);
      const host = input.host ?? current?.host;
      const port = input.port ?? current?.port;
      const mode = input.mode ?? current?.mode;
      const fromName = input.fromName ?? current?.fromName;
      const fromEmail = input.fromEmail ?? current?.fromEmail;
      const fields = [
        ...(!host ? [{ field: 'host', message: '请输入 SMTP 主机' }] : []),
        ...(port === undefined
          ? [{ field: 'port', message: '请输入端口' }]
          : []),
        ...(!mode ? [{ field: 'mode', message: '请选择连接方式' }] : []),
        ...(!fromName
          ? [{ field: 'fromName', message: '请输入发件人名称' }]
          : []),
        ...(!fromEmail
          ? [{ field: 'fromEmail', message: '请输入发件人邮箱' }]
          : []),
      ];
      if (!host || port === undefined || !mode || !fromName || !fromEmail)
        throw new AccountError(
          'SMTP_CONFIGURATION_INCOMPLETE',
          400,
          '请填写完整邮件设置',
          fields,
        );
      const username = input.clearCredentials
        ? ''
        : (input.username ?? current?.username ?? '');
      const passwordEncrypted = input.clearCredentials
        ? null
        : input.password === undefined
          ? (current?.passwordEncrypted ?? null)
          : crypto.encryptSecret(input.password);
      if (!username && passwordEncrypted !== null)
        throw new AccountError(
          'SMTP_CREDENTIALS_INCOMPLETE',
          400,
          '用户名为空时不能保留密码，请使用清除 SMTP 凭据操作',
          [
            {
              field: 'username',
              message: '请填写用户名，或明确清除用户名和密码',
            },
          ],
        );
      const values = {
        host,
        port,
        mode,
        username,
        passwordEncrypted,
        fromName,
        fromEmail,
        updatedAt: new Date(),
      };
      tx.insert(smtpSettings)
        .values({ id: 1, ...values })
        .onConflictDoUpdate({ target: smtpSettings.id, set: values })
        .run();
    },
    { behavior: 'immediate' },
  );
  return readSmtpSettings(db)!;
}

export const smtpTimeouts = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
};

export function createSmtpTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.mode === 'tls',
    requireTLS: config.mode === 'starttls',
    auth: config.username
      ? { user: config.username, pass: config.password ?? undefined }
      : undefined,
    ...smtpTimeouts,
    tls: { rejectUnauthorized: true },
    logger: false,
    debug: false,
  });
}

/** SMTP responses can echo credentials or message contents; never expose them. */
export function smtpFailureDiagnostic(error: unknown) {
  const failure = error as NodeJS.ErrnoException & {
    command?: string;
    responseCode?: number;
  };
  const knownCodes = [
    'EAUTH',
    'ETLS',
    'ETIMEDOUT',
    'ECONNECTION',
    'ESOCKET',
    'EDNS',
    'EENVELOPE',
    'EMESSAGE',
    'ESTREAM',
    'EPROTOCOL',
  ];
  const code = knownCodes.includes(failure?.code ?? '')
    ? failure.code!
    : 'UNKNOWN';
  const verb = failure?.command?.split(' ')[0];
  const command = [
    'CONN',
    'EHLO',
    'HELO',
    'STARTTLS',
    'AUTH',
    'MAIL',
    'RCPT',
    'DATA',
    'QUIT',
  ].includes(verb ?? '')
    ? verb
    : undefined;
  const responseCode =
    Number.isInteger(failure?.responseCode) &&
    failure.responseCode! >= 100 &&
    failure.responseCode! <= 599
      ? failure.responseCode
      : undefined;
  let stage: 'connection' | 'authentication' | 'tls' | 'delivery';
  if (code === 'EAUTH') stage = 'authentication';
  else if (
    code === 'ETLS' ||
    command === 'STARTTLS' ||
    /certificate|self-signed|STARTTLS/i.test(failure?.message ?? '')
  )
    stage = 'tls';
  else if (
    ['MAIL', 'RCPT', 'DATA'].includes(command ?? '') ||
    (code === 'ETIMEDOUT' && failure?.message === 'Timeout')
  )
    stage = 'delivery';
  else stage = 'connection';
  const deliveryMayHaveStarted =
    stage === 'delivery' ||
    (code === 'ECONNECTION' &&
      failure?.message === 'Connection closed unexpectedly') ||
    (stage === 'connection' &&
      code === 'ESOCKET' &&
      failure?.syscall === 'read');
  return {
    stage,
    code,
    command,
    responseCode,
    delivery:
      deliveryMayHaveStarted && !(responseCode && responseCode >= 400)
        ? ('unknown' as const)
        : ('not-accepted' as const),
  };
}

export class SmtpSendError extends Error {
  readonly diagnostic: ReturnType<typeof smtpFailureDiagnostic>;
  readonly status: 502 | 504;
  readonly code: 'SMTP_SEND_FAILED' | 'SMTP_SEND_TIMEOUT';
  constructor(error: unknown) {
    const diagnostic = smtpFailureDiagnostic(error);
    const messages = {
      connection: '无法连接邮件服务器',
      tls: '邮件安全连接失败',
      authentication: 'SMTP 身份验证失败',
      delivery: '邮件服务器拒绝投递',
    };
    super(
      diagnostic.delivery === 'unknown'
        ? '邮件发送结果未知，请先检查邮箱；重新测试可能重复收件'
        : diagnostic.code === 'ETIMEDOUT'
          ? '等待邮件响应超时，请检查设置和网络'
          : messages[diagnostic.stage],
    );
    this.diagnostic = diagnostic;
    this.status = diagnostic.code === 'ETIMEDOUT' ? 504 : 502;
    this.code =
      diagnostic.code === 'ETIMEDOUT'
        ? 'SMTP_SEND_TIMEOUT'
        : 'SMTP_SEND_FAILED';
  }
}

export async function sendSmtpMail(
  config: SmtpConfig,
  mail: { to: string; subject: string; text: string },
) {
  const transport = createSmtpTransport(config);
  try {
    const info = await transport.sendMail({
      from: { name: config.fromName, address: config.fromEmail },
      ...mail,
    });
    return {
      acceptance: 'smtp-accepted' as const,
      finalReceipt: 'unverified' as const,
      accepted: info.accepted,
      rejected: info.rejected,
      messageId: info.messageId,
    };
  } catch (error) {
    throw new SmtpSendError(error);
  } finally {
    transport.close();
  }
}

export async function sendOwnerSmtpTest(
  db: BetterSQLite3Database,
  crypto: SecretCrypto,
  ownerEmail: string,
) {
  const config = readSmtpConfig(db, crypto);
  if (!config)
    throw new AccountError(
      'SMTP_NOT_CONFIGURED',
      400,
      '尚未配置邮件服务，请先保存邮件设置',
    );
  return sendSmtpMail(config, {
    to: ownerEmail,
    subject: 'Ariso 测试邮件',
    text: `这是一封 Ariso 邮件服务测试邮件。\n测试时间：${new Date().toISOString()}\n收到此邮件说明本次测试已送达此邮箱。`,
  });
}
