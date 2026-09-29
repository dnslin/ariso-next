import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          exclude: [
            'tests/integration/media/process.test.ts',
            'tests/integration/media/formats.test.ts',
            'tests/integration/media/format-recovery.test.ts',
            'tests/integration/upload/formats.test.ts',
            'tests/integration/media/file-formats.test.ts',
            'tests/integration/media/svg.test.ts',
            'tests/integration/media/formats-tools.test.ts',
            'tests/integration/media/recovery-tools.test.ts',
            'tests/integration/upload/local.test.ts',
            'tests/integration/upload/local-http.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'media-tools',
          environment: 'node',
          include: [
            'tests/integration/media/process.test.ts',
            'tests/integration/media/formats.test.ts',
            'tests/integration/media/format-recovery.test.ts',
            'tests/integration/upload/formats.test.ts',
            'tests/integration/media/file-formats.test.ts',
            'tests/integration/media/svg.test.ts',
            'tests/integration/media/formats-tools.test.ts',
            'tests/integration/media/recovery-tools.test.ts',
            'tests/integration/upload/local.test.ts',
            'tests/integration/upload/local-http.test.ts',
          ],
        },
      },
    ],
  },
});
