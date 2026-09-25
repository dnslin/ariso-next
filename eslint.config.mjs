import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'tests/experiments/shell/.next/**',
    'tests/experiments/shell/next-env.d.ts',
    'tests/experiments/ui/.next/**',
    'tests/experiments/ui/next-env.d.ts',
    'tests/experiments/delivery/next-app/.next/**',
    'tests/experiments/delivery/next-app/next-env.d.ts',
    'tests/experiments/identity/next-app/.next/**',
    'tests/experiments/identity/next-app/next-env.d.ts',
    'tests/experiments/analytics/next-app/.next/**',
    'tests/experiments/analytics/next-app/next-env.d.ts',
    'out/**',
    'build/**',
    'dist/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    '.data/**',
    '.pnpm-store/**',
    'next-env.d.ts',
    'docs/product/Ariso-PRD-v1.1.md',
  ]),
]);
