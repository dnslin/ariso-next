import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createUploadOpenApiDocument } from '../../../src/server/upload/openapi.ts';
import { PUBLIC_UPLOAD_WAIT_TIMEOUT_MS } from '../../../src/server/upload/public-result.ts';

describe('public upload OpenAPI contract', () => {
  it('only exposes the implemented synchronous Bearer upload operation', () => {
    const document = createUploadOpenApiDocument('https://images.example.test');
    expect(document.openapi).toBe('3.0.4');
    expect(document.servers).toEqual([
      { url: 'https://images.example.test', description: '当前站点公开地址' },
    ]);
    expect(Object.keys(document.paths)).toEqual(['/api/upload']);
    expect(Object.keys(document.paths['/api/upload'])).toEqual(['post']);
    const upload = document.paths['/api/upload'].post;
    expect(upload.security).toEqual([{ uploadToken: [] }]);
    expect(document.components.securitySchemes.uploadToken).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(Object.keys(upload.responses)).toEqual([
      '201',
      '400',
      '401',
      '408',
      '409',
      '413',
      '415',
      '422',
      '500',
      '502',
      '503',
      '504',
      '507',
    ]);
    expect(upload.description).toContain('不提供幂等键');
    expect(upload.description).toContain('私有图片');
    expect(upload['x-wait-timeout-ms']).toBe(PUBLIC_UPLOAD_WAIT_TIMEOUT_MS);
    expect(upload.responses['504'].description).toContain('处理任务仍会继续');
  });

  it('keeps repeat multipart fields optional and binary files required', () => {
    const document = createUploadOpenApiDocument();
    const input = document.components.schemas.PublicUploadInput;
    expect(input.required).toEqual(['file']);
    expect(input.additionalProperties).toBe(false);
    expect(input.properties?.file).toMatchObject({
      type: 'string',
      format: 'binary',
    });
    expect(input.properties?.file).not.toHaveProperty('contentEncoding');
    for (const name of ['albumId', 'tag']) {
      expect(input.properties?.[name]).toMatchObject({
        type: 'array',
        default: [],
        items: { type: 'string' },
      });
    }
    expect(input.properties?.file).not.toHaveProperty('maxLength');
    const multipart =
      document.paths['/api/upload'].post.requestBody.content[
        'multipart/form-data'
      ];
    for (const name of ['albumId', 'tag'] as const)
      expect(multipart.encoding[name]).toEqual({
        contentType: 'text/plain',
        style: 'form',
        explode: true,
      });
  });

  it('documents real nullable fields and only saved optional versions', () => {
    const { schemas } = createUploadOpenApiDocument().components;
    expect(schemas.PublicUploadError.properties?.imageId).toMatchObject({
      type: 'string',
      nullable: true,
    });
    expect(schemas.PublicUploadSuccess.properties?.actualVersion).toMatchObject(
      {
        type: 'string',
        nullable: true,
        enum: ['original', 'compressed', 'thumbnail', 'watermark', null],
      },
    );
    expect(schemas.PublicUploadSuccess.properties?.versions).not.toHaveProperty(
      'required',
    );
    expect(schemas.PublicUploadSuccess.required).not.toContain(
      'currentImageStatus',
    );
    expect(schemas.PublicUploadError.required).not.toContain(
      'currentImageStatus',
    );
  });

  it('checks the committed generated document through the normal unit entry', () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ['scripts/generate-upload-openapi.ts', '--check'],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      ),
    ).not.toThrow();
  });
});
