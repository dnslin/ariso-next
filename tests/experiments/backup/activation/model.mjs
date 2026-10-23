import Database from 'better-sqlite3';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, open, readdir, rename, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { initializeRuntimePaths } from '../../../../src/server/runtime/paths.ts';

export const checkpointNames = [
  'activating.temp-written',
  'activating.file-synced',
  'activating.renamed',
  'activating.directory-synced',
  'storage.old-moved',
  'storage.old-directory-synced',
  'storage.published',
  'storage.directory-synced',
  'assets.old-moved',
  'assets.old-directory-synced',
  'assets.published',
  'assets.directory-synced',
  'old-db.ariso.db.moved',
  'old-db.ariso.db-wal.moved',
  'old-db.ariso.db-shm.moved',
  'old-db.directories-synced',
  'database.temporary-written',
  'database.temporary-synced',
  'database.published',
  'database.directory-synced',
  'completed.temp-written',
  'completed.file-synced',
  'completed.renamed',
  'completed.directory-synced',
  'normal.paths-created',
  'normal.database-opened',
  'background.started',
];

export function paths(root) {
  const task = join(root, 'restore', 'activation-experiment');
  return {
    root,
    task,
    state: join(task, 'state.json'),
    trace: join(task, 'trace.jsonl'),
    ready: join(task, 'ready'),
    previous: join(task, 'previous-empty'),
    database: join(root, 'ariso.db'),
    background: join(root, 'background-started.json'),
  };
}

export function readState(root) {
  return JSON.parse(readFileSync(paths(root).state, 'utf8'));
}

function record(root, event, detail = {}) {
  appendFileSync(
    paths(root).trace,
    JSON.stringify({ pid: process.pid, event, ...detail }) + '\n',
  );
}

async function syncFile(root, file, label) {
  const handle = await open(file, 'r');
  try {
    await handle.sync();
    record(root, 'file-synced', { label });
  } finally {
    await handle.close();
  }
}

export async function syncDirectory(root, directory, label) {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
    record(root, 'directory-synced', { label });
  } finally {
    await handle.close();
  }
}

async function writeState(root, value, checkpoint) {
  const p = paths(root);
  const temporary = p.state + '.tmp';
  const handle = await open(temporary, 'w', 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await checkpoint(`${value.phase}.temp-written`);
    await handle.sync();
    record(root, 'file-synced', { label: `${value.phase}-state` });
    await checkpoint(`${value.phase}.file-synced`);
  } finally {
    await handle.close();
  }
  await rename(temporary, p.state);
  record(root, 'state-renamed', { phase: value.phase });
  await checkpoint(`${value.phase}.renamed`);
  await syncDirectory(root, p.task, `${value.phase}-state-parent`);
  await checkpoint(`${value.phase}.directory-synced`);
}

async function hasFiles(directory) {
  if (!existsSync(directory)) return false;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || (await hasFiles(join(directory, entry.name))))
      return true;
  }
  return false;
}

function validateReady(root) {
  const db = new Database(join(paths(root).ready, 'ariso.db'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok')
      throw new Error('READY_DATABASE_INVALID');
    if (db.pragma('foreign_key_check').length)
      throw new Error('READY_DATABASE_FOREIGN_KEYS');
    if (db.prepare('SELECT COUNT(*) AS n FROM owner').get().n !== 1)
      throw new Error('READY_OWNER_MISSING');
  } finally {
    db.close();
  }
}

async function requireBlank(root) {
  record(root, 'blank-check');
  if (await hasFiles(join(root, 'storage')))
    throw new Error('RESTORE_TARGET_NOT_EMPTY: storage');
  if (await hasFiles(join(root, 'assets')))
    throw new Error('RESTORE_TARGET_NOT_EMPTY: assets');
  if (!existsSync(paths(root).database)) return;
  const db = new Database(paths(root).database, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    if (db.prepare('SELECT COUNT(*) AS n FROM owner').get().n)
      throw new Error('RESTORE_TARGET_NOT_EMPTY: owner');
  } finally {
    db.close();
  }
}

async function publishDirectory(root, name, checkpoint) {
  const p = paths(root);
  const source = join(p.ready, name);
  const target = join(root, name);
  const previous = join(p.previous, name);
  if (!existsSync(source)) {
    if (!existsSync(target))
      throw new Error(`MISSING_PUBLISHED_DIRECTORY: ${name}`);
    record(root, 'directory-replayed', { name });
    await syncDirectory(root, p.ready, `${name}-ready-parent`);
    await syncDirectory(root, root, `${name}-published-parent`);
    return;
  }
  if (existsSync(target)) {
    if (existsSync(previous)) throw new Error(`DIRECTORY_CONFLICT: ${name}`);
    await rename(target, previous);
    record(root, 'directory-old-moved', { name });
    await checkpoint(`${name}.old-moved`);
    await syncDirectory(root, root, `${name}-old-source-parent`);
    await syncDirectory(root, p.previous, `${name}-old-target-parent`);
    await checkpoint(`${name}.old-directory-synced`);
  }
  await rename(source, target);
  record(root, 'directory-published', { name });
  await checkpoint(`${name}.published`);
  await syncDirectory(root, p.ready, `${name}-ready-parent`);
  await syncDirectory(root, root, `${name}-published-parent`);
  await checkpoint(`${name}.directory-synced`);
}

async function moveOldDatabase(root, checkpoint) {
  const p = paths(root);
  for (const name of ['ariso.db', 'ariso.db-wal', 'ariso.db-shm']) {
    const source = join(root, name);
    const destination = join(p.previous, name);
    if (existsSync(destination)) continue;
    if (existsSync(source)) {
      await rename(source, destination);
      record(root, 'old-database-moved', { name });
      await checkpoint(`old-db.${name}.moved`);
    }
  }
  await syncDirectory(root, root, 'old-database-source-parent');
  await syncDirectory(root, p.previous, 'old-database-target-parent');
  await checkpoint('old-db.directories-synced');
}

async function startNormalRuntime(root, checkpoint) {
  if (readState(root).phase !== 'completed')
    throw new Error('BACKGROUND_BEFORE_COMPLETED');
  initializeRuntimePaths(root);
  record(root, 'normal-paths-created');
  await checkpoint('normal.paths-created');
  const db = new Database(paths(root).database, { fileMustExist: true });
  try {
    record(root, 'normal-database-opened');
    await checkpoint('normal.database-opened');
    if (db.pragma('integrity_check', { simple: true }) !== 'ok')
      throw new Error('LIVE_DATABASE_INVALID');
    const owner = db.prepare('SELECT id FROM owner').get();
    const count = db.prepare('SELECT COUNT(*) AS n FROM images').get().n;
    const handle = await open(paths(root).background, 'w', 0o600);
    try {
      await handle.writeFile(
        JSON.stringify({ phase: readState(root).phase, owner, count }),
      );
      await handle.sync();
    } finally {
      await handle.close();
    }
    record(root, 'background-started');
    await checkpoint('background.started');
  } finally {
    db.close();
  }
}

export async function activate(root, stopAt) {
  const p = paths(root);
  await mkdir(root, { recursive: true });
  const checkpoint = async (name) => {
    record(root, 'checkpoint', { name });
    if (name !== stopAt) return;
    process.send?.({ checkpoint: name });
    await new Promise(() => setInterval(() => {}, 1000));
  };
  let state = readState(root);
  if (state.phase === 'completed') {
    record(root, 'completed-skips-publication');
    await syncFile(root, p.state, 'completed-state');
    await syncDirectory(root, p.task, 'completed-state-parent');
    await startNormalRuntime(root, checkpoint);
    return;
  }
  validateReady(root);
  if (state.phase === 'ready') {
    await requireBlank(root);
    state = { ...state, phase: 'activating' };
    await writeState(root, state, checkpoint);
  } else if (state.phase !== 'activating') {
    throw new Error(`UNSUPPORTED_ACTIVATION_PHASE: ${state.phase}`);
  }
  await mkdir(p.previous, { recursive: true });
  await publishDirectory(root, 'storage', checkpoint);
  await publishDirectory(root, 'assets', checkpoint);
  await moveOldDatabase(root, checkpoint);
  if (existsSync(p.database + '-wal') || existsSync(p.database + '-shm'))
    throw new Error('SIDECAR_LEFT_BEFORE_PUBLICATION');
  const temporary = join(root, 'ariso.db.activation.tmp');
  await copyFile(join(p.ready, 'ariso.db'), temporary);
  record(root, 'database-temporary-written');
  await checkpoint('database.temporary-written');
  await syncFile(root, temporary, 'published-database');
  await checkpoint('database.temporary-synced');
  await rename(temporary, p.database);
  record(root, 'database-published');
  await checkpoint('database.published');
  await syncDirectory(root, root, 'published-database-parent');
  await checkpoint('database.directory-synced');
  await writeState(root, { ...state, phase: 'completed' }, checkpoint);
  await startNormalRuntime(root, checkpoint);
}

export function guardCli(root) {
  if (!existsSync(paths(root).state)) return;
  if (readState(root).phase === 'activating')
    throw new Error('RESTORE_ACTIVATING');
}

export async function resetModelPassword(root, password, afterInitialGuard) {
  guardCli(root);
  await afterInitialGuard?.();
  const db = new Database(paths(root).database, { fileMustExist: true });
  try {
    if (!db.prepare('SELECT id FROM owner').get())
      throw new Error('NOT_INITIALIZED');
    db.transaction(() => {
      guardCli(root);
      db.prepare('UPDATE owner SET password = ?').run(password);
    }).immediate();
  } finally {
    db.close();
  }
}

export async function prepareFile(root, file, content) {
  await mkdir(dirname(file), { recursive: true });
  const handle = await open(file, 'w', 0o600);
  try {
    await handle.writeFile(content);
    await handle.sync();
    record(root, 'prepared-file-synced', {
      relative: file.slice(root.length + 1),
    });
  } finally {
    await handle.close();
  }
}

export async function syncPreparedTree(root, directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const item = join(directory, entry.name);
    if (entry.isDirectory()) await syncPreparedTree(root, item);
    else if ((await stat(item)).isFile())
      await syncFile(root, item, item.slice(root.length + 1));
  }
  await syncDirectory(root, directory, directory.slice(root.length + 1));
}

export async function markReady(root) {
  await syncPreparedTree(root, paths(root).ready);
  await writeState(
    root,
    { id: 'activation-experiment', phase: 'ready' },
    async () => {},
  );
}
