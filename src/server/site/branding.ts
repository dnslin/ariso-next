import { randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { analyzeMediaError } from '../media/errors.ts';
import { inspectImageFile } from '../media/file-formats.ts';
import { startSvgPreview } from '../media/svg.ts';
import { startMediaTool } from '../media/tools.ts';
import { siteSettings } from './schema.ts';
import { readSiteSettings, requireSiteSettings } from './settings.ts';

export const BRAND_MAX_BYTES = 5 * 1024 * 1024;
export type BrandingKind = 'logo' | 'favicon';
type Context = {
  db: BetterSQLite3Database;
  brandingRoot: string;
  logger: Pick<Logger, 'warn'>;
};
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ownedFile = new RegExp(
  `^site-(logo-${uuid}\\.(?:png|jpg|webp|svg)|favicon-${uuid}\\.(?:png|ico|svg))$`,
);
const ownedWorkspace = new RegExp(`^\\.site-branding-${uuid}$`);
const invalid = (cause: unknown) =>
  Object.assign(new Error('品牌图片损坏或含非静态内容', { cause }), {
    code: 'SITE_ASSET_INVALID',
    status: 400,
  });

/** Reuses the parser/decoder policy proven by EV-SITE-01; no client MIME is trusted. */
async function validate(
  path: string,
  workspace: string,
  kind: BrandingKind,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  await access(path);
  if ((await stat(path)).size > BRAND_MAX_BYTES)
    throw Object.assign(new Error('品牌素材不能超过 5 MiB'), {
      code: 'SITE_ASSET_TOO_LARGE',
      status: 413,
    });
  let contentExitCode = 1;
  try {
    const facts = await inspectImageFile(path, workspace, signal);
    const allowed =
      kind === 'logo' ? ['PNG', 'JPEG', 'WEBP', 'SVG'] : ['PNG', 'ICO', 'SVG'];
    if (!allowed.includes(facts.format))
      throw Object.assign(new Error(`不支持的 ${kind} 格式: ${facts.format}`), {
        code: 'SITE_ASSET_TYPE_UNSUPPORTED',
        status: 415,
      });
    if (facts.animated || (facts.format !== 'ICO' && facts.pageCount !== 1))
      throw invalid('Animated or multi-image brand asset');
    if (facts.format === 'SVG') {
      contentExitCode = 2;
      const tool = startSvgPreview(
        path,
        join(workspace, 'preview.png'),
        workspace,
        signal,
      );
      const error = await tool.settled;
      if (error) throw error;
    } else {
      const tool = startMediaTool(
        'magick',
        [
          '-limit',
          'memory',
          '256MiB',
          '-limit',
          'map',
          '0',
          '-limit',
          'thread',
          '1',
          '-regard-warnings',
          `${facts.coder}:${path}`,
          'null:',
        ],
        { workspace, cancelSignal: signal, timeout: 30_000 },
      );
      const error = await tool.settled;
      if (error) throw error;
      if (facts.width === null || facts.height === null)
        throw invalid('Missing image dimensions');
    }
    return { mime: facts.mime, extension: facts.extension };
  } catch (cause) {
    signal.throwIfAborted();
    const detail = cause as { code?: string; exitCode?: number };
    if (
      cause instanceof ZodError ||
      detail.code === 'MEDIA_IDENTIFICATION_FAILED' ||
      (detail.exitCode === contentExitCode &&
        analyzeMediaError(cause).code === 'MEDIA_PROCESS_FAILED')
    )
      throw invalid(cause);
    if (detail.code === 'MEDIA_FORMAT_UNSUPPORTED')
      throw Object.assign(new Error('不支持的品牌图片格式', { cause }), {
        code: 'SITE_ASSET_TYPE_UNSUPPORTED',
        status: 415,
      });
    throw cause;
  }
}

/** Startup owns cleanup; active operations wait for it and settle before DB shutdown. */
export function createBrandingService(context: Context) {
  const { db, brandingRoot, logger } = context;
  const stopping = new AbortController();
  const active = new Set<Promise<unknown>>();
  async function discard(key: string) {
    const path = join(brandingRoot, key);
    try {
      await rm(path, { force: true });
    } catch (err) {
      logger.warn({ err, path }, '品牌旧文件清理失败，将在下次启动重试');
    }
  }
  const ready = (async () => {
    await mkdir(brandingRoot, { recursive: true });
    const settings = readSiteSettings(db);
    const referenced = new Set([settings?.logoKey, settings?.faviconKey]);
    for (const entry of await readdir(brandingRoot, { withFileTypes: true })) {
      const path = join(brandingRoot, entry.name);
      if (ownedWorkspace.test(entry.name) && entry.isDirectory()) {
        try {
          await rm(path, { recursive: true, force: true });
        } catch (err) {
          logger.warn(
            { err, path },
            '品牌中断工作目录清理失败，将在下次启动重试',
          );
        }
      } else if (
        entry.isFile() &&
        ownedFile.test(entry.name) &&
        !referenced.has(entry.name)
      ) {
        await discard(entry.name);
      }
    }
  })();
  function operate<T>(
    signal: AbortSignal | undefined,
    work: (signal: AbortSignal) => Promise<T>,
  ) {
    const combined = signal
      ? AbortSignal.any([signal, stopping.signal])
      : stopping.signal;
    const operation = (async () => {
      await ready;
      combined.throwIfAborted();
      return work(combined);
    })();
    active.add(operation);
    void operation.finally(() => active.delete(operation)).catch(() => {});
    return operation;
  }
  return {
    ready,
    replace(
      kind: BrandingKind,
      receive: (path: string, signal: AbortSignal) => Promise<unknown>,
      signal?: AbortSignal,
    ) {
      return operate(signal, async (operationSignal) => {
        requireSiteSettings(db);
        const workspace = join(brandingRoot, `.site-branding-${randomUUID()}`);
        const source = join(workspace, 'source');
        let candidate: string | undefined;
        let committed = false;
        await mkdir(workspace);
        try {
          await receive(source, operationSignal);
          const facts = await validate(
            source,
            workspace,
            kind,
            operationSignal,
          );
          candidate = `site-${kind}-${randomUUID()}.${facts.extension}`;
          operationSignal.throwIfAborted();
          await rename(source, join(brandingRoot, candidate));
          operationSignal.throwIfAborted();
          const previous = db.transaction((tx) => {
            const settings = requireSiteSettings(tx);
            tx.update(siteSettings)
              .set({
                [`${kind}Key`]: candidate!,
                [`${kind}Mime`]: facts.mime,
                updatedAt: new Date(),
              })
              .where(eq(siteSettings.id, 1))
              .run();
            return settings[`${kind}Key`];
          });
          committed = true;
          if (previous) await discard(previous);
          return { key: candidate, mime: facts.mime };
        } finally {
          if (candidate && !committed) await discard(candidate);
          try {
            await rm(workspace, { recursive: true, force: true });
          } catch (err) {
            logger.warn(
              { err, path: workspace },
              '品牌工作目录清理失败，将在下次启动重试',
            );
          }
        }
      });
    },
    remove(kind: BrandingKind, signal?: AbortSignal) {
      return operate(signal, async () => {
        const previous = db.transaction((tx) => {
          const settings = requireSiteSettings(tx);
          tx.update(siteSettings)
            .set({
              [`${kind}Key`]: null,
              [`${kind}Mime`]: null,
              updatedAt: new Date(),
            })
            .where(eq(siteSettings.id, 1))
            .run();
          return settings[`${kind}Key`];
        });
        if (previous) await discard(previous);
        return null;
      });
    },
    read(key: string, signal?: AbortSignal) {
      return operate(signal, async () => {
        const settings = readSiteSettings(db);
        const mime =
          settings?.logoKey === key
            ? settings.logoMime
            : settings?.faviconKey === key
              ? settings.faviconMime
              : null;
        if (!mime) return null;
        const path = join(brandingRoot, key);
        try {
          return { key, mime, bytes: await readFile(path) };
        } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
            const latest = readSiteSettings(db);
            if (latest?.logoKey !== key && latest?.faviconKey !== key)
              return null;
            throw Object.assign(
              new Error(`当前品牌文件缺失: ${path}`, { cause }),
              { code: 'SITE_ASSET_MISSING', status: 500, path },
            );
          }
          throw cause;
        }
      });
    },
    async close() {
      stopping.abort(
        Object.assign(new Error('品牌服务正在停止'), {
          code: 'UPLOAD_CANCELLED',
          status: 400,
        }),
      );
      await Promise.allSettled([ready, ...active]);
    },
  };
}
