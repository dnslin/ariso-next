import { describe, expect, it } from 'vitest';
import { defaultSettings, normalizeSettings } from '../lib/settings-input';

describe('站点设置', () => {
  it('只保存最终根地址和裸 Token', () => {
    expect(
      normalizeSettings({
        ...defaultSettings,
        siteUrl: ' https://images.example/ ',
        token: '  upload-key  ',
      }),
    ).toMatchObject({ siteUrl: 'https://images.example', token: 'upload-key' });
  });
  it.each([
    'https://images.example/api',
    'https://images.example/?a=1',
    'https://user:password@images.example',
    'http://images.example',
    'javascript:alert(1)',
  ])('拒绝无效站点 %s', (siteUrl) => {
    expect(() =>
      normalizeSettings({ ...defaultSettings, siteUrl, token: 'upload-key' }),
    ).toThrow();
  });
  it('允许受控本地开发 HTTP', () => {
    expect(
      normalizeSettings({
        ...defaultSettings,
        siteUrl: 'http://127.0.0.1:3777',
        token: 'upload-key',
      }).siteUrl,
    ).toBe('http://127.0.0.1:3777');
  });
  it('拒绝 Bearer 前缀且错误不包含秘密', () => {
    expect(() =>
      normalizeSettings({
        ...defaultSettings,
        siteUrl: 'https://images.example',
        token: 'Bearer secret-value',
      }),
    ).toThrow('裸 Token');
    try {
      normalizeSettings({
        ...defaultSettings,
        siteUrl: 'bad',
        token: 'secret-value',
      });
    } catch (error) {
      expect(String(error)).not.toContain('secret-value');
    }
  });
});
