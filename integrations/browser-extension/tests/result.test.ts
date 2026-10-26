import { describe, expect, it } from 'vitest';
import { parseUploadResponse } from '../lib/result';
import { resultText } from '../lib/output';
import type { UploadItem } from '../lib/types';

import { version, successfulResponse } from './fixtures';
const base: UploadItem = {
  id: '7',
  name: '截图[最终]<&".png',
  bytes: 20,
  previewUrl: 'blob:preview',
  source: 'local',
  state: 'queued',
  progress: 0,
};
describe('真实上传结果', () => {
  it('site 固定本次响应的实际压缩版本', () => {
    const item = {
      ...base,
      ...parseUploadResponse(201, successfulResponse(), 'site', 'public'),
    };
    expect(item).toMatchObject({
      state: 'ready',
      selectedVersion: 'compressed',
      url: version('compressed').url,
    });
    expect(resultText(item, 'url')).toBe(version('compressed').url);
  });
  it('图片已保存但缺少选择版本时，不静默回退或重传', () => {
    expect(
      parseUploadResponse(201, successfulResponse(), 'watermark', 'public'),
    ).toMatchObject({
      state: 'version-unavailable',
      imageId: 'image-7',
      requestId: 'request-7',
    });
  });
  it('重复不返回旧图 URL', () => {
    const result = parseUploadResponse(
      409,
      {
        imageId: null,
        status: 'not_created',
        error: {
          code: 'UPLOAD_DUPLICATE',
          stage: 'deduplication',
          message: '重复',
        },
        requestId: 'req-duplicate',
      },
      'site',
      'public',
    );
    expect(result).toMatchObject({
      state: 'duplicate',
      requestId: 'req-duplicate',
    });
    expect(result.url).toBeUndefined();
  });
  it('等待超时和畸形成功响应都标为结果待核对', () => {
    expect(
      parseUploadResponse(
        504,
        {
          imageId: 'image-7',
          status: 'processing',
          error: {
            code: 'UPLOAD_WAIT_TIMEOUT',
            stage: 'waiting',
            message: '请核对',
          },
          requestId: 'wait-7',
        },
        'site',
        'public',
      ),
    ).toMatchObject({ state: 'unknown', imageId: 'image-7' });
    expect(
      parseUploadResponse(201, { status: 'ready' }, 'site', 'public').state,
    ).toBe('unknown');
  });
  it('私有图片没有可匿名复制的输出', () => {
    expect(
      resultText(
        {
          ...base,
          ...parseUploadResponse(201, successfulResponse(), 'site', 'private'),
        },
        'url',
      ),
    ).toBeNull();
  });
  it('Markdown 和 HTML 正确处理文件名中的特殊字符', () => {
    const item = {
      ...base,
      ...parseUploadResponse(201, successfulResponse(), 'original', 'public'),
    };
    expect(resultText(item, 'markdown')).toBe(
      '![截图\\[最终\\]<&"](https://images.example/i/image-7?type=original)',
    );
    expect(resultText(item, 'html')).toBe(
      '<img src="https://images.example/i/image-7?type=original" alt="截图[最终]&lt;&amp;&quot;">',
    );
  });
});
