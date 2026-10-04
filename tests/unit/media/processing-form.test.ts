import { describe, expect, it } from 'vitest';
import { initialMediaSettings } from '../../../src/server/media/validation';
import {
  renderingParameters,
  settingsMatch,
  validateProcessingInput,
} from '../../../src/components/processing/model';

describe('处理设置提交与预览参数', () => {
  it('预览携带全部未保存渲染字段，排除三个站点默认和调度字段', () => {
    const input = {
      ...initialMediaSettings,
      quality: 76,
      watermarkMode: 'image' as const,
      watermarkAssetId: '8467f57f-eeb6-40c8-b916-0a19d9775b97',
      watermarkMargin: 2.125,
      defaultVisibility: 'private' as const,
      concurrency: 4,
    };
    const preview = renderingParameters(input);
    expect(preview).toMatchObject({
      quality: 76,
      watermarkAssetId: input.watermarkAssetId,
      watermarkMargin: 2.125,
    });
    expect(Object.keys(preview)).toHaveLength(17);
    expect(preview).not.toHaveProperty('defaultVisibility');
    expect(preview).not.toHaveProperty('defaultLinkVersion');
    expect(preview).not.toHaveProperty('concurrency');
    expect(input.concurrency).toBe(4);
  });

  it('无效默认组合阻止保存，但不阻止独立的渲染预览', () => {
    const input = { ...initialMediaSettings, compressionEnabled: false };
    expect(validateProcessingInput(input, 'save').errors).toHaveProperty(
      'defaultLinkVersion',
    );
    expect(validateProcessingInput(input, 'preview')).toEqual({
      value: renderingParameters(input),
      errors: {},
    });
    expect(input.defaultLinkVersion).toBe('compressed');
  });

  it('空数字、质量小数和颜色错误保留原值并给出字段错误', () => {
    const input = {
      ...initialMediaSettings,
      quality: 1.5,
      concurrency: Number.NaN,
      jpegBackground: '#AB',
    };
    expect(validateProcessingInput(input, 'save').errors).toMatchObject({
      quality: expect.any(String),
      concurrency: expect.any(String),
      jpegBackground: expect.any(String),
    });
    expect(input.quality).toBe(1.5);
    expect(input.jpegBackground).toBe('#AB');
    expect(input.concurrency).toBeNaN();
  });

  it('采用完整字段核对未知保存，忽略响应元数据但不忽略非当前水印参数', () => {
    const saved = { ...initialMediaSettings, id: 1, updatedAt: '2026-10-05' };
    expect(settingsMatch(initialMediaSettings, saved)).toBe(true);
    expect(
      settingsMatch(initialMediaSettings, { ...saved, watermarkWidth: 21 }),
    ).toBe(false);
  });
});
