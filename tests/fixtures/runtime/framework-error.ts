import { cp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execa } from 'execa';

/** 国际化路由在 Next requestListener 内解析原始 URL；非法 authority 触发 ERR_INVALID_URL。 */
export async function buildFrameworkErrorApp(directory: string) {
  await mkdir(join(directory, 'pages'), { recursive: true });
  await cp(resolve('.next/standalone/dist'), join(directory, 'dist'), {
    recursive: true,
  });
  await symlink(resolve('node_modules'), join(directory, 'node_modules'));
  await writeFile(
    join(directory, 'package.json'),
    '{"private":true,"type":"module"}',
  );
  await writeFile(
    join(directory, 'next.config.mjs'),
    `export default { agentRules: false, i18n: { locales: ['en', 'zh'], defaultLocale: 'en' } };`,
  );
  await writeFile(
    join(directory, 'pages/index.js'),
    'export default function Page() { return null; }',
  );
  await mkdir(join(directory, 'pages/api'));
  await writeFile(
    join(directory, 'pages/api/log-event.js'),
    `
    import { createRuntimeLogger } from '../../dist/server/runtime/logger.js';
    const logger = createRuntimeLogger('runtime.fixture', 'info');
    export default function handler(req, res) {
      logger.info({ ...req.body, phase: 'request', path: '/api/log-event', taskId: 'task-visible', imageId: 'image-visible', storageId: 'storage-visible' }, 'normal fixture event');
      res.status(200).json({ status: 'ok' });
    }
  `,
  );
  await execa(
    process.execPath,
    [resolve('node_modules/next/dist/bin/next'), 'build', '--webpack'],
    {
      cwd: directory,
      env: { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
      timeout: 120000,
      killDescendants: true,
    },
  );
}
