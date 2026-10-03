import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { listObjects } from '../../../src/server/storage/local.ts';

let root: string;
const storage = { id: 'one', localPath: 'disk', enabled: false };
const owned = () => join(root, 'disk/ariso/one');
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'ariso-listing-')));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
async function collect(options: Parameters<typeof listObjects>[2] = {}) {
  return await Array.fromAsync(listObjects(root, storage, options));
}

it('停用存储仍分批列举嵌套普通文件、partial和真实大小，不读其他命名空间', async () => {
  mkdirSync(join(owned(), 'uploads/session'), { recursive: true });
  mkdirSync(join(root, 'disk/ariso/two'), { recursive: true });
  writeFileSync(join(owned(), 'uploads/session/中文 + %.partial'), 'pending');
  writeFileSync(join(owned(), 'original'), Buffer.alloc(65_536));
  writeFileSync(join(owned(), 'empty'), '');
  writeFileSync(join(root, 'disk/ariso/two/other'), 'other');
  writeFileSync(join(root, 'disk/external'), 'keep');
  const pages = await collect({ batchSize: 2 });
  expect(pages.map((page) => page.length)).toEqual([2, 1]);
  expect(pages.flat().sort((a, b) => a.key.localeCompare(b.key))).toEqual(
    [
      { key: 'uploads/session/中文 + %.partial', size: 7 },
      { key: 'original', size: 65_536 },
      { key: 'empty', size: 0 },
    ].sort((a, b) => a.key.localeCompare(b.key)),
  );
  expect(readFileSync(join(root, 'disk/external'), 'utf8')).toBe('keep');
  expect(readFileSync(join(owned(), 'original')).length).toBe(65_536);
});

it('未初始化命名空间返回空且不创建目录，空目录也不返回虚构对象', async () => {
  expect(await collect()).toEqual([]);
  expect(existsSync(join(root, 'disk'))).toBe(false);
  mkdirSync(join(owned(), 'empty-directory'), { recursive: true });
  expect(await collect()).toEqual([]);
});

it('每轮从头读取，上一轮结束后出现的迟到对象在下一轮可见', async () => {
  mkdirSync(owned(), { recursive: true });
  expect(await collect()).toEqual([]);
  writeFileSync(join(owned(), 'late'), 'later');
  expect(await collect()).toEqual([[{ key: 'late', size: 5 }]]);
});

it('允许配置路径指向根内链接，不跟随对象树中的文件与目录别名', async () => {
  mkdirSync(owned(), { recursive: true });
  symlinkSync('disk', join(root, 'alias'));
  writeFileSync(join(owned(), 'original'), 'bytes');
  symlinkSync('original', join(owned(), 'file-alias'));
  symlinkSync('.', join(owned(), 'cycle'));
  symlinkSync(root, join(owned(), 'outside'));
  const pages = await Array.fromAsync(
    listObjects(root, { ...storage, localPath: 'alias' }),
  );
  expect(pages).toEqual([[{ key: 'original', size: 5 }]]);
});

it('失败保留实际路径和底层原因，不把非目录当作空命名空间', async () => {
  mkdirSync(join(root, 'disk/ariso'), { recursive: true });
  writeFileSync(owned(), 'not-directory');
  await expect(collect()).rejects.toMatchObject({
    code: 'STORAGE_OPERATION_FAILED',
    operation: 'list',
    storageId: 'one',
    path: owned(),
    cause: { code: 'ENOTDIR' },
  });
});

it('取消不会报告空轮次；分页间取消关闭遍历并保留取消原因', async () => {
  await expect(collect({ signal: AbortSignal.abort() })).rejects.toMatchObject({
    operation: 'list',
    cause: { name: 'AbortError' },
  });
  mkdirSync(join(owned(), 'nested'), { recursive: true });
  writeFileSync(join(owned(), 'nested/first'), '1');
  writeFileSync(join(owned(), 'nested/second'), '22');
  const controller = new AbortController();
  const iterator = listObjects(root, storage, {
    batchSize: 1,
    signal: controller.signal,
  });
  expect((await iterator.next()).value).toHaveLength(1);
  controller.abort(new Error('stop listing'));
  await expect(iterator.next()).rejects.toMatchObject({
    operation: 'list',
    cause: { message: 'stop listing' },
  });
  expect((await collect()).flat()).toHaveLength(2);
});

it('消费者提前结束后可以再次完整列举', async () => {
  mkdirSync(owned(), { recursive: true });
  writeFileSync(join(owned(), 'first'), '1');
  writeFileSync(join(owned(), 'second'), '22');
  for await (const page of listObjects(root, storage, { batchSize: 1 })) {
    expect(page).toHaveLength(1);
    break;
  }
  expect((await collect()).flat()).toHaveLength(2);
});

it.each([0, -1, 1001, 1.5, Number.NaN])(
  '拒绝不可用批大小 %s',
  async (batchSize) => {
    await expect(collect({ batchSize })).rejects.toThrow('batchSize');
  },
);

it.each(['last-file', 'empty-directory'])(
  '最后一次 %s I/O 期间取消不能发布完成批次',
  async (scenario) => {
    mkdirSync(owned(), { recursive: true });
    const controller = new AbortController();
    const reason = new Error('cancel during final I/O');
    const method = scenario === 'last-file' ? 'lstat' : 'opendir';
    if (scenario === 'last-file') writeFileSync(join(owned(), 'last'), 'bytes');
    const original = fsPromises[method];
    const spy = vi
      .spyOn(fsPromises, method)
      .mockImplementation(async (...args: unknown[]) => {
        const result = await Reflect.apply(original, fsPromises, args);
        controller.abort(reason);
        return result;
      });
    syncBuiltinESMExports();
    try {
      await expect(
        collect({ signal: controller.signal }),
      ).rejects.toMatchObject({
        operation: 'list',
        cause: reason,
      });
    } finally {
      spy.mockRestore();
      syncBuiltinESMExports();
    }
  },
);

it('命名空间目录别名不得把邻接对象当作孤儿列举', async () => {
  mkdirSync(join(root, 'disk/ariso/two'), { recursive: true });
  writeFileSync(join(root, 'disk/ariso/two/sentinel'), 'keep');
  symlinkSync('two', owned());
  await expect(collect()).rejects.toMatchObject({
    code: 'STORAGE_OPERATION_FAILED',
  });
  expect(readFileSync(join(root, 'disk/ariso/two/sentinel'), 'utf8')).toBe(
    'keep',
  );
});
