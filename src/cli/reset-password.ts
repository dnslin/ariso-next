// Recovery only: no startup, migration, SMTP or Web dependency.
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import {
  readCliCredential,
  resetCliPassword,
} from '../server/identity/reset-password.ts';

async function hiddenInput(label: string, signal: AbortSignal) {
  const input = process.stdin;
  if (!input.isTTY || !process.stdout.isTTY)
    throw new Error('请使用交互终端运行');
  signal.throwIfAborted();
  const previousRaw = input.isRaw;
  const closed = new AbortController();
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const terminal = createInterface({ input, output, terminal: true });
  terminal.once('SIGINT', () => process.kill(process.pid, 'SIGINT'));
  terminal.once('close', () => closed.abort(new Error('输入已关闭，已取消')));
  process.stdout.write(label);
  try {
    return await terminal.question('', {
      signal: AbortSignal.any([signal, closed.signal]),
    });
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (closed.signal.aborted) throw closed.signal.reason;
    throw error;
  } finally {
    terminal.close();
    output.destroy();
    input.setRawMode(previousRaw);
    input.pause();
    process.stdout.write('\n');
  }
}

async function main() {
  if (process.argv.length !== 2)
    throw new Error('用法：node dist/cli/reset-password.js（不接受参数）');
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      '请使用交互终端运行：docker exec -it ariso node dist/cli/reset-password.js',
    );
  const dataDir = process.env.DATA_DIR ?? '/data';
  if (!isAbsolute(dataDir)) throw new Error('DATA_DIR: 必须是非空绝对路径');
  const databasePath = join(dataDir, 'ariso.db');
  if (!existsSync(databasePath))
    throw new Error(`${databasePath}: 未初始化，请先完成 setup`);
  const cancellation = new AbortController();
  const interrupted = () => {
    process.exitCode = 130;
    cancellation.abort(new Error('已取消'));
  };
  const terminated = () => {
    process.exitCode = 143;
    cancellation.abort(new Error('已取消'));
  };
  process.on('SIGINT', interrupted);
  process.on('SIGTERM', terminated);
  let connection: Database.Database | undefined;
  try {
    connection = new Database(databasePath, { fileMustExist: true });
    connection.pragma('foreign_keys = ON');
    // Do not block JS signal handling while another process holds the writer.
    // A busy database exits without writes; the operator can explicitly retry.
    connection.pragma('busy_timeout = 0');
    if (
      !connection
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user'",
        )
        .get()
    )
      throw new Error(`${databasePath}: 未初始化，请先完成 setup`);
    const db = drizzle(connection);
    readCliCredential(db);
    const password = await hiddenInput('新密码：', cancellation.signal);
    const confirmation = await hiddenInput('确认新密码：', cancellation.signal);
    await resetCliPassword(db, password, confirmation, cancellation.signal);
    process.stdout.write('密码已重置，全部会话已撤销，请重新登录。\n');
  } finally {
    connection?.close();
    process.off('SIGINT', interrupted);
    process.off('SIGTERM', terminated);
  }
}

try {
  await main();
} catch (error) {
  // Drizzle's outer error contains SQL parameters, including the password hash.
  const diagnostic =
    error instanceof Error && error.cause instanceof Error
      ? error.cause
      : error;
  process.stderr.write(
    `${diagnostic instanceof Error ? diagnostic.message : '重置失败'}\n`,
  );
  process.exitCode ||= 1;
}
