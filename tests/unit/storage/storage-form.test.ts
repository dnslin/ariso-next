import { describe, expect, it } from 'vitest';
import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { StorageForm } from '../../../src/components/storage/storage-form';
import type { StorageSummary } from '../../../src/components/storage/storage-api';
import {
  storageFormInitial,
  storageFormPayload,
} from '../../../src/components/storage/storage-form-utils';

const saved: StorageSummary = {
  id: 'storage-1',
  name: '归档',
  type: 's3',
  enabled: true,
  localPath: null,
  endpoint: 'https://s3.example.com',
  region: 'auto',
  bucket: 'archive',
  pathPrefix: 'images',
  forcePathStyle: false,
  hasAccessKey: true,
  hasSecretKey: true,
  configRevision: 4,
  connectionStatus: 'passed',
  connectionRevision: 4,
  connectionReport: null,
  connectionTestedAt: '2026-10-04T00:00:00.000Z',
  corsStatus: 'passed',
  corsReport: null,
  corsRevision: 4,
  corsOrigin: 'https://ariso.example.com',
  corsTestedAt: '2026-10-04T00:00:00.000Z',
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
};

describe('storage form requests', () => {
  it('does not populate existing secrets and sends only the name for a rename', () => {
    const value = storageFormInitial(saved);
    expect(value.accessKey).toBe('');
    expect(value.secretKey).toBe('');
    expect(storageFormPayload({ ...value, name: '归档 2026' }, saved)).toEqual({
      name: '归档 2026',
    });
  });
  it('omits whitespace credentials without disabling a passed configuration', () => {
    const value = {
      ...storageFormInitial(saved),
      accessKey: '  ',
      secretKey: '\t',
    };
    expect(storageFormPayload(value, saved)).toEqual({});
  });
  it('replacing credentials disables S3 and preserves the actual replacement', () => {
    const value = {
      ...storageFormInitial(saved),
      accessKey: 'new-access',
      secretKey: 'new-secret',
    };
    expect(storageFormPayload(value, saved)).toEqual({
      accessKey: 'new-access',
      secretKey: 'new-secret',
      enabled: false,
    });
  });
  it('changing a saved S3 position disables it and never sends local fields', () => {
    const value = {
      ...storageFormInitial(saved),
      bucket: 'new-bucket',
      localPath: 'unused',
    };
    expect(storageFormPayload(value, saved)).toEqual({
      bucket: 'new-bucket',
      enabled: false,
    });
  });
  it('new S3 is disabled even if an input model has an enabled value', () => {
    const value = {
      ...storageFormInitial(saved),
      localPath: 'unused',
      enabled: true,
    };
    expect(storageFormPayload(value)).toEqual({
      type: 's3',
      name: saved.name,
      endpoint: saved.endpoint,
      region: saved.region,
      bucket: saved.bucket,
      pathPrefix: saved.pathPrefix,
      forcePathStyle: false,
      enabled: false,
    });
  });
  it('switching to local sends only the local fields', () => {
    const value = {
      ...storageFormInitial(saved),
      type: 'local' as const,
      localPath: 'archive/blog',
      enabled: true,
    };
    expect(storageFormPayload(value, saved)).toEqual({
      type: 'local',
      localPath: 'archive/blog',
    });
    expect(storageFormPayload(value)).toEqual({
      type: 'local',
      name: saved.name,
      localPath: 'archive/blog',
      enabled: true,
    });
  });
  it('enabling saved S3 does not send unchanged configuration or credentials', () => {
    const disabled = { ...saved, enabled: false };
    const value = { ...storageFormInitial(disabled), enabled: true };
    expect(storageFormPayload(value, disabled)).toEqual({ enabled: true });
  });
});

describe('storage form presentation', () => {
  const local: StorageSummary = {
    ...saved,
    type: 'local',
    localPath: 'archive/blog',
  };
  function render(
    storage: StorageSummary | undefined,
    locked = false,
    busy = false,
  ) {
    return renderToStaticMarkup(
      jsx(StorageForm, {
        storage,
        value: { ...storageFormInitial(storage), isDefault: false },
        storageRoot: '/actual/data/storage',
        locked,
        busy,
        errors: {},
        onChange: () => {},
        onSubmit: () => {},
      }),
    );
  }

  it('shows one complete selectable local directory with a copy action in both editable and locked states', () => {
    for (const locked of [false, true]) {
      const html = render(local, locked);
      expect(html.match(/\/actual\/data\/storage/g)).toHaveLength(1);
      expect(html).toContain('/actual/data/storage/archive/blog');
      expect(html).toContain('aria-label="复制实际目录"');
      expect(html).toContain('aria-label="相对路径说明"');
      expect(html).not.toContain('填写存储根目录下的相对路径');
      expect(html).not.toContain('如使用其他硬盘');
    }
  });

  it('keeps the name editable and the referenced location read-only while retaining enabled and default controls', () => {
    const html = render(local, true);
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    expect(inputs.find((input) => input.includes('name="name"'))).not.toContain(
      'readOnly',
    );
    expect(
      inputs.find((input) => input.includes('name="localPath"')),
    ).toContain('readOnly');
    expect(html).toContain('仍有引用，存储位置与类型不可修改');
    expect(html).toContain('aria-label="启用此存储"');
    expect(html).toContain('aria-label="设为默认存储"');
    expect(html).not.toContain('storage-type-s3');
  });

  it('retains credential masking and the direct reason why an untested S3 storage cannot be enabled', () => {
    const untested = {
      ...saved,
      enabled: false,
      connectionStatus: 'untested' as const,
      connectionRevision: null,
    };
    const html = render(untested);
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    for (const name of ['accessKey', 'secretKey']) {
      const input = inputs.find((entry) => entry.includes(`name="${name}"`));
      expect(input).toContain('type="password"');
      expect(input).toContain('value=""');
    }
    expect(html).toContain('先保存配置，通过连接测试后可启用');
    expect(html).not.toContain('/actual/data/storage');
    expect(html).toContain('aria-label="连接测试说明"');
  });
});
