import { fileURLToPath } from 'node:url';
const config = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(
    new URL('../../../../', import.meta.url),
  ),
  serverExternalPackages: ['better-sqlite3'],
  experimental: { externalDir: true },
};
export default config;
