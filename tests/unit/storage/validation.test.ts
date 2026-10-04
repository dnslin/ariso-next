import { expect, it } from 'vitest';
import {
  localPathSchema,
  s3EndpointSchema,
  s3PathPrefixSchema,
  storageCreateInputSchema,
  storageUpdateInputSchema,
} from '../../../src/server/storage/validation.ts';

const s3 = {
  type: 's3',
  name: '私有对象',
  endpoint: 'https://s3.example.com/',
  region: 'auto',
  bucket: 'images',
  accessKey: 'access',
  secretKey: 'secret',
};
it('local/s3 互斥且新 S3 不能请求启用', () => {
  expect(storageCreateInputSchema.parse(s3)).toMatchObject({
    enabled: false,
    pathPrefix: '',
    forcePathStyle: false,
    endpoint: 'https://s3.example.com',
  });
  for (const input of [
    { ...s3, localPath: 'disk' },
    { ...s3, enabled: true },
    { type: 'local', name: 'disk', localPath: 'disk', secretKey: 'secret' },
  ])
    expect(storageCreateInputSchema.safeParse(input).success).toBe(false);
});
it('相对路径允许普通 .. 字符和根内回退，但拒绝越界、绝对和 NUL', () => {
  for (const path of [
    'nested/disk',
    'nested/../disk',
    'disk..2',
    '中文/%2e%2e',
  ])
    expect(localPathSchema.parse(path)).toBe(path);
  for (const path of [
    '',
    '/tmp',
    '../outside',
    'nested/../../outside',
    'nul\0path',
  ])
    expect(localPathSchema.safeParse(path).success).toBe(false);
});
it('Endpoint 保留显式 HTTP、端口、子路径，不接收凭据或查询片段', () => {
  expect(s3EndpointSchema.parse('http://127.0.0.1:9000/s3/')).toBe(
    'http://127.0.0.1:9000/s3',
  );
  for (const endpoint of [
    'file:///tmp',
    'https://user:secret@host',
    'https://host?',
    'https://host#',
    'https://host?token=secret',
    'invalid',
  ])
    expect(s3EndpointSchema.safeParse(endpoint).success).toBe(false);
});
it('Prefix 仅规范首尾分隔符，保留 Unicode 和百分号字面值并为既有对象 Key 留足字节', () => {
  expect(s3PathPrefixSchema.parse('/照片/%2F/')).toBe('照片/%2F');
  expect(s3PathPrefixSchema.parse('')).toBe('');
  for (const prefix of [
    'a/../b',
    'a/./b',
    'a//b',
    'a\\b',
    'a\0b',
    '图'.repeat(400),
  ])
    expect(s3PathPrefixSchema.safeParse(prefix).success).toBe(false);
});
it('更新明确区分省略、字符串和 null，不接收脱敏值或危险字段', () => {
  expect(storageUpdateInputSchema.parse({ name: 'new' })).not.toHaveProperty(
    'accessKey',
  );
  expect(
    storageUpdateInputSchema.parse({
      accessKey: null,
      secretKey: 'replacement',
    }),
  ).toEqual({ accessKey: null, secretKey: 'replacement' });
  for (const input of [
    {},
    { accessKey: '' },
    { secretKey: '********' },
    { accessKey: '••••••' },
    { type: 'other' },
    { localPath: '/absolute' },
    { connectionStatus: 'passed' },
    { configRevision: 4 },
  ])
    expect(storageUpdateInputSchema.safeParse(input).success).toBe(false);
  expect(
    storageUpdateInputSchema.parse({ type: 'local', localPath: 'another' }),
  ).toEqual({ type: 'local', localPath: 'another' });
  expect(
    storageUpdateInputSchema.parse({
      endpoint: 'https://s3.example.com/',
      pathPrefix: '/photos/',
    }),
  ).toEqual({ endpoint: 'https://s3.example.com', pathPrefix: 'photos' });
});
