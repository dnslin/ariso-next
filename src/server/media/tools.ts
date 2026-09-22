import { setTimeout as delay } from 'node:timers/promises';
import { execa, type Options } from 'execa';

const graceMs = 1000;

function shutdownError(message: string, cause: unknown) {
  return Object.assign(new Error(message, { cause }), {
    code: 'MEDIA_TOOL_SHUTDOWN_FAILED',
  });
}

async function processes() {
  const { stdout } = await execa(
    'ps',
    ['-axww', '-o', 'pid=,pgid=,stat=,command='],
    {
      timeout: 1000,
    },
  ).catch((cause: unknown) => {
    throw shutdownError('Cannot inspect media tool processes', cause);
  });
  return stdout.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    return match
      ? [
          {
            pid: Number(match[1]),
            group: Number(match[2]),
            state: match[3],
            command: match[4],
          },
        ]
      : [];
  });
}

async function signalGroup(group: number, signal: NodeJS.Signals) {
  try {
    process.kill(-group, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return;
    // macOS may report EPERM when the last process exits concurrently with killpg.
    if (code === 'EPERM' && !(await groupIsRunning(group))) return;
    throw shutdownError(
      `Cannot send ${signal} to media tool process group ${group}`,
      error,
    );
  }
}

async function groupIsRunning(group: number) {
  return (await processes()).some(
    (entry) => entry.group === group && !entry.state.startsWith('Z'),
  );
}

async function waitForGroup(group: number) {
  const deadline = Date.now() + graceMs;
  do {
    if (!(await groupIsRunning(group))) return true;
    await delay(25);
  } while (Date.now() < deadline);
  return false;
}

async function terminateGroup(group: number) {
  await signalGroup(group, 'SIGTERM');
  if (await waitForGroup(group)) return;
  await signalGroup(group, 'SIGKILL');
  if (!(await waitForGroup(group)))
    throw Object.assign(
      new Error(`Media tool process group ${group} did not exit`),
      {
        code: 'MEDIA_TOOL_SHUTDOWN_FAILED',
      },
    );
}

/** Recover by the unique workspace argument, not a stale PID that may have been reused. */
export async function terminateMediaTools(workspace: string) {
  const markers = [
    `registry:temporary-path=${workspace}`,
    `ArisoWorkspace=${workspace}`,
  ];
  const groups = new Set(
    (await processes())
      .filter(
        (entry) =>
          entry.pid === entry.group &&
          markers.some((marker) =>
            ` ${entry.command} `.includes(` ${marker} `),
          ),
      )
      .map((entry) => entry.group),
  );
  await Promise.all([...groups].map(terminateGroup));
}

/** The caller awaits settled before removing the workspace or releasing its disk budget. */
type TextToolOptions = Extract<Options, { encoding?: 'utf8' | 'utf16le' }>;

export function startMediaTool<const ToolOptions extends TextToolOptions>(
  command: 'magick' | 'exiftool',
  args: string[],
  options: ToolOptions & { workspace: string },
) {
  const { workspace, ...executionOptions } = options;
  const marker =
    command === 'magick'
      ? ['-define', `registry:temporary-path=${workspace}`]
      : ['-userParam', `ArisoWorkspace=${workspace}`];
  const child = execa(command, [...marker, ...args], {
    ...executionOptions,
    detached: true,
    forceKillAfterDelay: graceMs,
  });
  let termination: Promise<Error | undefined> | undefined;
  const terminate = () => {
    termination ??=
      child.pid === undefined
        ? Promise.resolve(undefined)
        : terminateGroup(child.pid).then(
            () => undefined,
            (error: Error) => error,
          );
    return termination;
  };
  const abort = () => {
    void terminate();
  };
  options.cancelSignal?.addEventListener('abort', abort, { once: true });
  if (options.cancelSignal?.aborted) abort();
  // Execa enforces the timeout on the leader; this timer also stops its descendants.
  const timeout = options.timeout
    ? setTimeout(abort, options.timeout)
    : undefined;
  timeout?.unref();
  const settled = child
    .then(
      async () => terminate(),
      async (error: Error) => (await terminate()) ?? error,
    )
    .finally(() => {
      clearTimeout(timeout);
      options.cancelSignal?.removeEventListener('abort', abort);
    });
  return { child, settled };
}
