import { isAbsolute } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  HOST: z
    .string()
    .refine((value) => value.trim().length > 0, '必须是非空监听地址')
    .default('0.0.0.0'),
  PORT: z
    .string()
    .regex(/^[0-9]+$/, '必须是十进制整数')
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, '必须在 1–65535 之间')
        .max(65535, '必须在 1–65535 之间'),
    )
    .default(3000),
  DATA_DIR: z
    .string()
    .refine(isAbsolute, '必须是非空绝对路径')
    .default('/data'),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'], {
      error: '必须是 trace/debug/info/warn/error/fatal 之一',
    })
    .default('info'),
  BETTER_AUTH_SECRET: z
    .string({ error: '必填，至少 32 个字符' })
    .min(32, '至少需要 32 个字符'),
  ARISO_ENCRYPTION_KEY: z
    .string({ error: '必填，必须是 64 位十六进制字符串' })
    .regex(/^[0-9a-fA-F]{64}$/, '必须是 64 位十六进制字符串')
    .transform((value) => Buffer.from(value, 'hex')),
});

export type RuntimeConfig = {
  host: string;
  port: number;
  dataDir: string;
  logLevel: z.infer<typeof envSchema>['LOG_LEVEL'];
  betterAuthSecret: string;
  encryptionKey: Buffer;
};

/** 日志入口只校验自身配置，不读取部署密钥或打开数据库。 */
export function parseLogLevel(value: string | undefined) {
  const result = envSchema.shape.LOG_LEVEL.safeParse(value);
  if (!result.success) {
    throw new Error('LOG_LEVEL: 必须是 trace/debug/info/warn/error/fatal 之一');
  }
  return result.data;
}

/** 启动方显式调用并保存结果；导入模块不会读取部署配置。 */
export function parseRuntimeEnv(
  env: Record<string, string | undefined> = process.env,
): RuntimeConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // 只返回变量名和校验原因，不附带含输入值的 ZodError。
    throw new Error(
      result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    );
  }
  return {
    host: result.data.HOST,
    port: result.data.PORT,
    dataDir: result.data.DATA_DIR,
    logLevel: result.data.LOG_LEVEL,
    betterAuthSecret: result.data.BETTER_AUTH_SECRET,
    encryptionKey: result.data.ARISO_ENCRYPTION_KEY,
  };
}
