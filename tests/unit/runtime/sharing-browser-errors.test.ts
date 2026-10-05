import { expect, it } from 'vitest';
import { unexpectedSharingErrors } from '../../../e2e/sharing-public-errors.mjs';

it('records program errors mentioning the intentionally missing thumbnail and excludes only that precise resource failure', () => {
  const url = 'http://sharing.localhost/i/missing-image?type=thumbnail';
  const failures = [
    { kind: 'error', message: `Resource failed: ${url}` },
    { kind: 'unhandledrejection', message: 'missing-image: program failure' },
    { kind: 'console.error', message: `Resource failed: ${url}` },
    { kind: 'error', message: `Resource failed: ${url}&other=1` },
    { kind: 'error', message: 'missing-image: ReferenceError' },
  ];
  expect(unexpectedSharingErrors(failures, url)).toEqual(failures.slice(1));
});
