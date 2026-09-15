import pino, {
  type Bindings,
  type ChildLoggerOptions,
  type DestinationStream,
  type Logger,
} from 'pino';
import type { RuntimeConfig } from './env.ts';
import { logRedactionPaths, redactUrlCredentials } from './log-redaction.ts';

/** 处理日志对象中的字符串与错误；复制对象以免修改调用方数据。 */
function redactDiagnostic(
  value: unknown,
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (typeof value === 'string') return redactUrlCredentials(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const source =
    value instanceof Error ? pino.stdSerializers.errWithCause(value) : value;
  if (value instanceof Error && value.cause !== undefined) {
    Object.defineProperty(source, 'cause', {
      value: value.cause,
      enumerable: true,
      configurable: true,
    });
  }
  if (source instanceof Date || Buffer.isBuffer(source)) return source;
  const result: Record<string, unknown> | unknown[] = Array.isArray(source)
    ? []
    : {};
  seen.set(value, result);
  for (const [key, item] of Object.entries(source)) {
    Object.defineProperty(result, key, {
      value: redactDiagnostic(item, seen),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

/** 显式使用已校验日志级别，不读取部署密钥；默认直接写 stdout。 */
export function createRuntimeLogger(
  module: string,
  level: RuntimeConfig['logLevel'],
  destination?: DestinationStream,
) {
  const logger = pino(
    {
      level,
      base: { module },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: logRedactionPaths, censor: '[Redacted]' },
      formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) =>
          redactDiagnostic(bindings) as Record<string, unknown>,
        log: (object) => redactDiagnostic(object) as Record<string, unknown>,
      },
      serializers: {
        // Pino 在插值完成后调用 msg serializer，避免拆开的查询凭据漏出。
        msg: redactDiagnostic,
        err: (error) => error,
      },
    },
    destination,
  );
  // Pino 的 child 默认重置 bindings formatter；显式继承诊断脱敏规则。
  const child = logger.child;
  logger.child = function <CustomLevels extends string = never>(
    this: Logger,
    bindings: Bindings,
    options?: ChildLoggerOptions<CustomLevels>,
  ) {
    return child.call(this, bindings, {
      ...options,
      formatters: {
        ...options?.formatters,
        bindings: (value) => redactDiagnostic(value) as Record<string, unknown>,
      },
    }) as Logger<CustomLevels>;
  };
  return logger;
}
