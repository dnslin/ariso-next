import {
  createReadStream,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  existsSync,
  realpathSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import {
  planLocalWrite,
  writeObject,
  readObject,
  inspectObject,
  deleteObject,
  prepareLocalDirectory,
} from '../../../src/server/storage/local.ts';
let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'ariso-local-')));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
it('创建嵌套目录，允许根内链接和合法 ..，不触碰邻接文件', () => {
  mkdirSync(join(root, 'disk'));
  symlinkSync('disk', join(root, 'inside'));
  writeFileSync(join(root, 'sentinel'), 'keep');
  expect(prepareLocalDirectory(root, 'inside/archive/blog')).toBe(
    join(root, 'disk/archive/blog'),
  );
  expect(prepareLocalDirectory(root, 'disk/../name..ok')).toBe(
    join(root, 'name..ok'),
  );
  expect(readFileSync(join(root, 'sentinel'), 'utf8')).toBe('keep');
});
it.each(['', '../escape', '/absolute', 'bad\0path'])(
  '拒绝非法配置路径 %j',
  (input) => {
    expect(() => prepareLocalDirectory(root, input)).toThrow();
  },
);
it('创建之前拒绝根外链接，错误保留真实路径', () => {
  symlinkSync(tmpdir(), join(root, 'outside'));
  expect(() =>
    prepareLocalDirectory(root, 'outside/ariso-must-not-create'),
  ).toThrow(tmpdir());
  expect(existsSync(join(tmpdir(), 'ariso-must-not-create'))).toBe(false);
});
it('完整流写入、读取实际大小和字节，删除幂等且不影响旧对象', async () => {
  const storage = { id: 'storage-one', localPath: 'disk', enabled: true };
  prepareLocalDirectory(root, 'disk');
  const old = planLocalWrite('images/image/original');
  const next = planLocalWrite('images/image/derived');
  await writeObject(root, storage, old, Readable.from(['old']));
  const input = Readable.from([Buffer.alloc(128 * 1024, 42)]);
  expect(await writeObject(root, storage, next, input)).toMatchObject({
    key: next.key,
    size: 128 * 1024,
  });
  expect(input.destroyed).toBe(true);
  const result = await readObject(root, storage, next.key, 'image/png');
  expect(result).toMatchObject({ size: 128 * 1024, contentType: 'image/png' });
  const chunks = [];
  for await (const chunk of result.stream) chunks.push(chunk);
  expect(Buffer.concat(chunks)).toEqual(Buffer.alloc(128 * 1024, 42));
  await deleteObject(root, { ...storage, enabled: false }, next.key);
  await deleteObject(root, storage, next.key);
  expect(await inspectObject(root, storage, next.key)).toBeNull();
  expect(await inspectObject(root, storage, old.key)).toMatchObject({
    size: 3,
  });
});
it('源失败保留 partial 与错误上下文，明确清理不影响旧对象', async () => {
  const storage = { id: 'one', localPath: 'disk', enabled: true };
  prepareLocalDirectory(root, 'disk');
  const plan = planLocalWrite('uploads/session');
  const source = Readable.from(
    (async function* () {
      yield Buffer.alloc(65536);
      throw new Error('source failed');
    })(),
  );
  await expect(writeObject(root, storage, plan, source)).rejects.toMatchObject({
    code: 'STORAGE_OPERATION_FAILED',
    key: plan.key,
    temporaryKey: plan.temporaryKey,
    cause: { message: 'source failed' },
  });
  expect(source.destroyed).toBe(true);
  expect(await inspectObject(root, storage, plan.key)).toBeNull();
  expect(await inspectObject(root, storage, plan.temporaryKey)).not.toBeNull();
  await deleteObject(root, storage, plan.temporaryKey);
});
it('停用拒绝读取与新写入，取消在发布前保留清理责任', async () => {
  const storage = { id: 'one', localPath: 'disk', enabled: true };
  prepareLocalDirectory(root, 'disk');
  const plan = planLocalWrite('uploads/session');
  const signal = AbortSignal.abort();
  const source = Readable.from(['cancelled']);
  await expect(
    writeObject(root, storage, plan, source, signal),
  ).rejects.toMatchObject({ code: 'STORAGE_OPERATION_FAILED' });
  expect(source.destroyed).toBe(true);
  expect(await inspectObject(root, storage, plan.key)).toBeNull();
  const disabled = { ...storage, enabled: false };
  await expect(
    readObject(root, disabled, plan.key, 'image/png'),
  ).rejects.toMatchObject({ code: 'STORAGE_DISABLED' });
  await expect(
    writeObject(root, disabled, plan, Readable.from(['x'])),
  ).rejects.toMatchObject({ code: 'STORAGE_DISABLED' });
});
it('不同配置命名空间隔离，越界 Key 和根外对象链接拒绝', async () => {
  const storage = { id: 'one', localPath: 'disk', enabled: true };
  prepareLocalDirectory(root, 'disk');
  const plan = planLocalWrite('uploads/session');
  await writeObject(root, storage, plan, Readable.from(['ok']));
  await expect(deleteObject(root, storage, '../other')).rejects.toThrow();
  symlinkSync(root, join(root, 'disk/ariso/one/outside'));
  await expect(
    readObject(root, storage, 'outside/sentinel', 'text/plain'),
  ).rejects.toThrow();
  expect(
    await inspectObject(root, { ...storage, id: 'two' }, plan.key),
  ).toBeNull();
});
it('重复使用已发布的计划拒绝覆盖原字节', async () => {
  const storage = { id: 'one', localPath: 'disk', enabled: true };
  prepareLocalDirectory(root, 'disk');
  const plan = planLocalWrite('images/original');
  await writeObject(root, storage, plan, Readable.from(['original']));
  await expect(
    writeObject(root, storage, plan, Readable.from(['overwrite'])),
  ).rejects.toMatchObject({ cause: { code: 'EEXIST' } });
  const { stream } = await readObject(root, storage, plan.key, 'text/plain');
  expect(await stream.toArray()).toEqual([Buffer.from('original')]);
});
it('不存在源文件的错误可捕获，没有未处理的流错误', async () => {
  const storage = { id: 'one', localPath: 'disk', enabled: true };
  prepareLocalDirectory(root, 'disk');
  const source = createReadStream(join(root, 'missing-source'));
  await expect(
    writeObject(root, storage, planLocalWrite('uploads/session'), source),
  ).rejects.toMatchObject({ cause: { code: 'ENOENT' } });
  expect(source.closed).toBe(true);
});
it('读取取消关闭真实文件句柄，缺失对象返回明确错误', async () => {
  const storage = { id: 'one', localPath: 'disk', enabled: true };
  prepareLocalDirectory(root, 'disk');
  const plan = planLocalWrite('images/original');
  await writeObject(
    root,
    storage,
    plan,
    Readable.from([Buffer.alloc(1024 * 1024)]),
  );
  const controller = new AbortController();
  const { stream } = await readObject(
    root,
    storage,
    plan.key,
    'image/png',
    controller.signal,
  );
  const complete = finished(stream);
  controller.abort();
  await expect(complete).rejects.toMatchObject({ name: 'AbortError' });
  expect(stream.closed).toBe(true);
  await expect(
    readObject(root, storage, 'missing', 'image/png'),
  ).rejects.toMatchObject({ code: 'STORAGE_OBJECT_MISSING' });
});
it('可写可执行普通文件也不能作为配置目录', () => {
  writeFileSync(join(root, 'file'), 'keep', { mode: 0o700 });
  expect(() => prepareLocalDirectory(root, 'file')).toThrow('directory');
  expect(readFileSync(join(root, 'file'), 'utf8')).toBe('keep');
});
it('链接后的 .. 按实际目录解析，包括尚不存在的子目录', () => {
  mkdirSync(join(root, 'disk/deep'), { recursive: true });
  symlinkSync('disk/deep', join(root, 'alias'));
  expect(prepareLocalDirectory(root, 'alias/../archive')).toBe(
    join(root, 'disk/archive'),
  );
  expect(realpathSync.native(`${root}/alias/../archive`)).toBe(
    join(root, 'disk/archive'),
  );
  expect(existsSync(join(root, 'archive'))).toBe(false);
  expect(prepareLocalDirectory(root, 'alias/../../inside')).toBe(
    join(root, 'inside'),
  );
  expect(() => prepareLocalDirectory(root, 'alias/../../../outside')).toThrow(
    'outside',
  );
});
it('对象 Key 中链接后的 .. 在写入、读取、检查与删除时指向同一对象', async () => {
  const storage = { id: 'one', localPath: 'disk', enabled: true };
  const namespace = prepareLocalDirectory(root, 'disk/ariso/one');
  mkdirSync(join(namespace, 'deep/nested'), { recursive: true });
  symlinkSync('deep/nested', join(namespace, 'alias'));
  const plan = planLocalWrite('alias/../objects');
  await writeObject(root, storage, plan, Readable.from(['bytes']));
  expect(existsSync(join(namespace, 'objects'))).toBe(false);
  expect(readFileSync(`${namespace}/${plan.key}`, 'utf8')).toBe('bytes');
  expect(await inspectObject(root, storage, plan.key)).toEqual({ size: 5 });
  const { stream } = await readObject(root, storage, plan.key, 'text/plain');
  expect(await stream.toArray()).toEqual([Buffer.from('bytes')]);
  await deleteObject(root, storage, plan.key);
  expect(existsSync(`${namespace}/${plan.key}`)).toBe(false);
});
it('null 取消原因保留原值和存储上下文并关闭输入流', async () => {
  const storage = { id: 'one', localPath: 'disk', enabled: true };
  const plan = planLocalWrite('uploads/session');
  const source = Readable.from(['cancelled']);
  await expect(
    writeObject(root, storage, plan, source, AbortSignal.abort(null)),
  ).rejects.toMatchObject({
    code: 'STORAGE_OPERATION_FAILED',
    storageId: 'one',
    key: plan.key,
    temporaryKey: plan.temporaryKey,
    cause: null,
  });
  expect(source.destroyed).toBe(true);
  expect(existsSync(join(root, 'disk'))).toBe(false);
});
