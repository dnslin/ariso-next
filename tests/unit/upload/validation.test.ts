import { describe, expect, it } from 'vitest';
import {
  normalizeOriginalName,
  submissionInputSchema,
} from '../../../src/server/upload/validation.ts';

describe('upload names and submission input', () => {
  it.each([
    ['C:\\photos\\旅行.final.JPG', '旅行.final.JPG'],
    ['/a/.photo', '.photo'],
    ['', 'image'],
    ['.', 'image'],
    ['..', 'image'],
    ['photo.', 'photo.'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeOriginalName(input)).toBe(expected);
  });
  it('counts Unicode code points and rejects controls', () => {
    expect(normalizeOriginalName('😀'.repeat(255))).toHaveLength(510);
    expect(() => normalizeOriginalName('😀'.repeat(256))).toThrow();
    expect(() => normalizeOriginalName('a\u0000.png')).toThrow();
  });
  it('rejects empty files, duplicate queue IDs and unknown parameters', () => {
    const file = { queueItemId: 'q', originalName: 'a.png', declaredSize: 1 };
    expect(
      submissionInputSchema.safeParse({ requestId: 'r', files: [file] })
        .success,
    ).toBe(true);
    expect(
      submissionInputSchema.safeParse({
        requestId: 'multi',
        files: [file, { ...file, queueItemId: 'other' }],
      }).success,
    ).toBe(true);
    expect(
      submissionInputSchema.safeParse({ requestId: 'empty', files: [] })
        .success,
    ).toBe(false);
    expect(
      submissionInputSchema.safeParse({ requestId: 'r', files: [file, file] })
        .success,
    ).toBe(false);
    expect(
      submissionInputSchema.safeParse({
        requestId: 'r',
        files: [{ ...file, declaredSize: 0 }],
      }).success,
    ).toBe(false);
    expect(
      submissionInputSchema.safeParse({
        requestId: 'r',
        files: [file],
        storageId: '',
      }).success,
    ).toBe(false);
    expect(
      submissionInputSchema.safeParse({
        requestId: 'r',
        files: [file],
        source: 'api',
      }).success,
    ).toBe(false);
  });
});
