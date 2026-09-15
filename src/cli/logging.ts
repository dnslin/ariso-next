import { formatWithOptions } from 'node:util';
import { parseLogLevel } from '../server/runtime/env.ts';
import { createRuntimeLogger } from '../server/runtime/logger.ts';

try {
  const logger = createRuntimeLogger(
    'runtime.console',
    parseLogLevel(process.env.LOG_LEVEL),
  );
  const methods = {
    log: 'info',
    info: 'info',
    warn: 'warn',
    error: 'error',
    debug: 'debug',
    trace: 'trace',
  } as const;
  for (const [method, level] of Object.entries(methods)) {
    console[method as keyof typeof methods] = (...args: unknown[]) => {
      const err = args.find((value) => value instanceof Error);
      logger[level]({ err }, formatWithOptions({ colors: false }, ...args));
    };
  }
} catch (err) {
  createRuntimeLogger('runtime.console', 'fatal').fatal(
    { err, phase: 'logging' },
    'Logging initialization failed',
  );
  process.exit(1);
}
