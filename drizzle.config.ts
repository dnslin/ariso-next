import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  out: './drizzle',
  // 业务模块加入自己的 schema.ts 后，由 Drizzle Kit 生成迁移。
  schema: './src/server/**/schema.ts',
});
