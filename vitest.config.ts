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
            'tests/integration/media/formats-tools.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'media-tools',
          environment: 'node',
          include: [
            'tests/integration/media/process.test.ts',
            'tests/integration/media/formats-tools.test.ts',
          ],
        },
      },
    ],
  },
});
