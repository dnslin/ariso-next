import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RestoreS3Fields } from '../../../src/components/backup/restore-s3-fields';
import type { RestoreRemoteTargetInput } from '../../../src/server/backup/restore-remote-types';

const value: RestoreRemoteTargetInput = {
  endpoint: 'https://s3.example.test',
  region: 'auto',
  bucket: 'new-bucket',
  pathPrefix: 'restored/site',
  forcePathStyle: false,
  accessKey: '',
  secretKey: '',
};
function render(overrides = {}) {
  return renderToStaticMarkup(
    createElement(RestoreS3Fields, {
      storageId: 'archive',
      value,
      credentialsConfigured: false,
      disabled: false,
      errors: {},
      onChange: vi.fn(),
      ...overrides,
    }),
  );
}
describe('restore S3 connection fields', () => {
  it('allows only credentials to change while cancelling a remote restore', () => {
    const html = render({ positionLocked: true, credentialsConfigured: true });
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    for (const field of ['endpoint', 'region', 'bucket', 'pathPrefix'])
      expect(
        inputs.find((input) => input.includes(`restore-archive-${field}`)),
      ).toContain('disabled=""');
    for (const field of ['accessKey', 'secretKey'])
      expect(
        inputs.find((input) => input.includes(`restore-archive-${field}`)),
      ).not.toContain('disabled=""');
  });
  it('keeps the approved connection fields and real path-style control associated with one storage', () => {
    const html = render();
    for (const field of [
      'endpoint',
      'region',
      'bucket',
      'pathPrefix',
      'accessKey',
      'secretKey',
    ]) {
      expect(html).toContain(`id="restore-archive-${field}"`);
    }
    expect(html).toContain('服务地址');
    expect(html).toContain('恢复目录前缀（可选）');
    expect(html).toContain('aria-label="Path Style"');
    expect(html).not.toMatch(/填入演示|DEMO_ACCESS|启用此存储|设为默认/);
  });
  it('masks both credentials and shows saved-state hints without filling secrets', () => {
    const html = render({ credentialsConfigured: true });
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    for (const field of ['accessKey', 'secretKey']) {
      const input = inputs.find((entry) =>
        entry.includes(`restore-archive-${field}`),
      );
      expect(input).toContain('type="password"');
      expect(input).toContain('value=""');
      expect(input).toContain('已设置 · 留空保留');
      expect(input).toContain('autoComplete="new-password"');
    }
  });
  it('keeps entered values and inline errors while preventing edits during a request', () => {
    const html = render({
      disabled: true,
      errors: { bucket: '此恢复目录已被使用' },
    });
    const input = html.match(
      /<input\b[^>]*id="restore-archive-bucket"[^>]*>/,
    )?.[0];
    expect(input).toContain('disabled=""');
    expect(input).toContain('value="new-bucket"');
    expect(input).toContain('aria-invalid="true"');
    expect(html).toContain('此恢复目录已被使用');
  });
});
