import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './tests/experiments/api-key/schema.ts',
  out: './tests/experiments/api-key/drizzle',
});
