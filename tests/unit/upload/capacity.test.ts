import { expect, it } from 'vitest';
import {
  commonCapacity,
  summarizeBoundary,
} from '../../experiments/upload-capacity/boundary.ts';

it('does not turn successful samples or transport failures into an exact limit', () => {
  expect(
    summarizeBoundary([{ bytes: 100, put: 'passed', copy: 'passed' }]),
  ).toEqual({
    maximumSuccessfulBytes: 100,
    firstRejectedBytes: null,
    exactBytes: null,
  });
  expect(
    summarizeBoundary([
      { bytes: 100, put: 'passed', copy: 'passed' },
      { bytes: 101, put: 'failed', copy: 'not-run' },
    ]).exactBytes,
  ).toBeNull();
});

it('requires adjacent successful PUT/Copy and explicit size rejection', () => {
  expect(
    summarizeBoundary([
      { bytes: 100, put: 'passed', copy: 'passed' },
      { bytes: 102, put: 'size-rejected', copy: 'not-run' },
    ]).exactBytes,
  ).toBeNull();
  expect(
    summarizeBoundary([
      { bytes: 100, put: 'passed', copy: 'passed' },
      { bytes: 101, put: 'passed', copy: 'size-rejected' },
    ]).exactBytes,
  ).toBe(100);
});

it('requires all services to accept the common boundary and one to reject its next byte', () => {
  const success = {
    bytes: 5_000_000_000,
    put: 'passed' as const,
    copy: 'passed' as const,
  };
  const reject = {
    bytes: 5_000_000_001,
    put: 'size-rejected' as const,
    copy: 'not-run' as const,
  };
  expect(
    commonCapacity({ aws: [], r2: [success, reject], seaweedfs: [success] }),
  ).toBeNull();
  expect(
    commonCapacity({ aws: [success], r2: [success], seaweedfs: [success] }),
  ).toBeNull();
  expect(
    commonCapacity({
      aws: [success],
      r2: [success, reject, { ...success, bytes: reject.bytes + 1 }],
      seaweedfs: [success],
    }),
  ).toBeNull();
  expect(
    commonCapacity({
      aws: [success],
      r2: [success, reject],
      seaweedfs: [success],
    }),
  ).toEqual({
    bytes: 5_000_000_000,
    maximumMiB: 4768,
    maximumConfiguredBytes: 4_999_610_368,
    defaultBytes: 52_428_800,
  });
});
