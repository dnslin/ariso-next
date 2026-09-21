import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './tests/experiments/identity/schema.ts',
  out: './tests/experiments/identity/drizzle',
});
