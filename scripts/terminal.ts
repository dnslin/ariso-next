import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { execa } from 'execa';

type TerminalResult = { exitCode: number; terminalRestored: boolean };
type TerminalEvent = { output: string } | TerminalResult;

// Own the existing Python PTY protocol, leaving scenario assertions to callers.
export function startTerminal(
  command: string[],
  options: {
    cwd?: string;
    env: Record<string, string | undefined>;
    cancelSignal?: AbortSignal;
  },
) {
  const child = execa(
    '/usr/bin/python3',
    [
      fileURLToPath(
        new URL(
          '../tests/experiments/identity/cli-terminal.py',
          import.meta.url,
        ),
      ),
      ...command,
    ],
    { ...options, timeout: 30000, buffer: false, extendEnv: false },
  );
  // Observe subprocess failures immediately, even if decoding ends early.
  const outcome = child.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  const lines = createInterface({ input: child.stdout });
  const updates = new EventEmitter();
  let output = '';
  const result = (async () => {
    let terminalResult: TerminalResult | undefined;
    try {
      for await (const line of lines) {
        const event: TerminalEvent = JSON.parse(line);
        if ('output' in event) {
          output += event.output;
          updates.emit('output');
        } else terminalResult = event;
      }
      const completed = await outcome;
      if ('error' in completed) throw completed.error;
      if (!terminalResult) throw new Error('PTY exited without a result');
      return terminalResult;
    } finally {
      lines.close();
      child.stdin.end();
      if (child.nodeChildProcess.exitCode === null) child.kill();
      await outcome;
    }
  })();
  // A caller may still be waiting for a prompt when the process fails.
  const completed = result.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  return {
    output: () => output,
    write: (input: string) =>
      child.stdin.write(JSON.stringify({ input }) + '\n'),
    signal: (signal: string) =>
      child.stdin.write(JSON.stringify({ signal }) + '\n'),
    async waitFor(text: string) {
      if (output.includes(text)) return;
      const prompt = Promise.withResolvers<void>();
      const check = () => {
        if (output.includes(text)) prompt.resolve();
      };
      updates.on('output', check);
      try {
        await Promise.race([
          prompt.promise,
          completed.then((completion) => {
            if ('error' in completion) throw completion.error;
            throw new Error(`PTY exited before prompt: ${text}`);
          }),
        ]);
      } finally {
        updates.off('output', check);
      }
    },
    result,
    async stop() {
      if (child.nodeChildProcess.exitCode === null) child.stdin.end();
      await result;
    },
  };
}
