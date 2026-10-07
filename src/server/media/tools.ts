import { setTimeout as delay } from 'node:timers/promises';
import { execa, type Options } from 'execa';

const graceMs = 1000;

function shutdownError(message: string, cause: unknown) {
  return Object.assign(new Error(message, { cause }), {
    code: 'MEDIA_TOOL_SHUTDOWN_FAILED',
  });
}

async function processes(leaders?: number[]) {
  const result = await execa(
    'ps',
    leaders
      ? ['-ww', '-p', leaders.join(','), '-o', 'pid=,pgid=,stat=,command=']
      : ['-axo', 'pid=,pgid=,stat='],
    {
      timeout: 1000,
      reject: false,
    },
  );
  // All selected leaders can exit between discovery and reading their arguments.
  if (
    result.failed &&
    !(leaders && result.exitCode === 1 && !result.stdout && !result.stderr)
  )
    throw shutdownError('Cannot inspect media tool processes', result);
  return result.stdout.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)(?:\s+(.*))?$/);
    return match
      ? [
          {
            pid: Number(match[1]),
            group: Number(match[2]),
            state: match[3],
            command: match[4] ?? '',
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
  try {
    process.kill(-group, 0);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    // An inaccessible group may still exist; inspect its states before deciding.
    if (code !== 'EPERM')
      throw shutdownError(
        `Cannot inspect media tool process group ${group}`,
        error,
      );
  }
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
  // Only recovery needs arguments. Reading every process's full command line
  // on each normal tool exit can stall an otherwise successful media queue.
  const leaders = (await processes())
    .filter(
      (entry) => entry.pid === entry.group && !entry.state.startsWith('Z'),
    )
    .map((entry) => entry.pid);
  if (!leaders.length) return;
  const groups = new Set(
    (await processes(leaders))
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
export function startMediaTool<const ToolOptions extends Options>(
  command: 'magick' | 'exiftool' | 'ffmpeg' | 'ffprobe' | 'node',
  args: string[],
  options: ToolOptions & { workspace: string },
) {
  const { workspace } = options;
  const marker =
    command === 'magick'
      ? ['-define', `registry:temporary-path=${workspace}`]
      : command === 'ffmpeg'
        ? ['-metadata', `ArisoWorkspace=${workspace}`]
        : command === 'ffprobe'
          ? ['-user_agent', `ArisoWorkspace=${workspace}`]
          : ['-userParam', `ArisoWorkspace=${workspace}`];
  const toolArgs =
    command === 'node'
      ? [...args, '--', `ArisoWorkspace=${workspace}`]
      : command === 'ffmpeg'
        ? [...args.slice(0, -1), ...marker, ...args.slice(-1)]
        : [...marker, ...args];
  const child = execa(
    command === 'node' ? process.execPath : command,
    toolArgs,
    {
      ...options,
      detached: true,
      forceKillAfterDelay: graceMs,
    },
  );
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
