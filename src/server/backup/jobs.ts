import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
  type Dirent,
} from 'node:fs';
import type { BackupJob, BackupJobState, RestoreJob } from './types.ts';

// DATA_DIR paths are resolved by Node at runtime, outside Next's build asset graph.
const { dirname, join } = process.getBuiltinModule('node:path');

export function readJobState<T extends BackupJobState = BackupJobState>(
  directory: string,
): T | null {
  const file = join(directory, 'state.json');
  let content: string;
  try {
    content = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    return JSON.parse(content) as T;
  } catch (cause) {
    throw new Error(`Cannot read backup control record: ${file}`, { cause });
  }
}

/** Small control records must survive a process exit before the next startup. */
export function writeJobState(
  directory: string,
  state: BackupJobState,
  checkpoint?: (
    stage: 'temporary-written' | 'file-synced' | 'renamed' | 'directory-synced',
  ) => void,
) {
  const created = mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, 'state.json.part');
  const file = openSync(temporary, 'w', 0o600);
  try {
    writeFileSync(file, `${JSON.stringify(state)}\n`);
    checkpoint?.('temporary-written');
    fsyncSync(file);
    checkpoint?.('file-synced');
  } finally {
    closeSync(file);
  }
  renameSync(temporary, join(directory, 'state.json'));
  checkpoint?.('renamed');
  let parentPath = directory;
  const lastParent = created ? dirname(created) : directory;
  while (true) {
    const parent = openSync(parentPath, 'r');
    try {
      fsyncSync(parent);
    } finally {
      closeSync(parent);
    }
    if (parentPath === lastParent) break;
    parentPath = dirname(parentPath);
  }
  checkpoint?.('directory-synced');
}

function listJobs<T extends BackupJobState>(dataDir: string, kind: T['kind']) {
  const root = join(dataDir, kind === 'backup' ? 'backups' : 'restore');
  let directories: Dirent[];
  try {
    directories = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [] as T[];
    throw error;
  }
  const jobs: T[] = [];
  for (const directory of directories) {
    if (!directory.isDirectory()) continue;
    const record = readJobState<T>(join(root, directory.name));
    if (!record) continue;
    if (record.kind !== kind || record.id !== directory.name) {
      throw new Error(
        `Backup control record does not match its directory: ${join(root, directory.name)}`,
      );
    }
    jobs.push(record);
  }
  return jobs.sort(
    (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id),
  );
}

export function listBackupJobs(dataDir: string) {
  return listJobs<BackupJob>(dataDir, 'backup');
}

export function listRestoreJobs(dataDir: string) {
  return listJobs<RestoreJob>(dataDir, 'restore');
}
