import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { launch, stop } from '../runtime/process-helpers';

let directory: string;
let run: Awaited<ReturnType<typeof launch>>;
let database: Database.Database;
let origin: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-shell-'));
  run = await launch(resolve('.next/standalone'), directory);
  origin = `http://127.0.0.1:${run.port}`;
  await vi.waitFor(
    async () => {
      if (run.child.exitCode !== null) throw new Error(run.logs());
      expect((await fetch(`${origin}/api/health`)).status).toBe(200);
    },
    { timeout: 15000 },
  );
  database = new Database(join(directory, `data-${run.port}`, 'ariso.db'));
}, 20000);

afterAll(async () => {
  database?.close();
  if (run) await stop(run.child, run.closed);
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function home() {
  const response = await fetch(origin);
  expect(response.status).toBe(200);
  return response.text();
}

describe('生产首页与公共壳层', () => {
  it('未初始化显示默认品牌和开放状态，不虚构可用入口', async () => {
    const html = await home();
    expect(html).toContain('<title>Ariso</title>');
    expect(html).toMatch(/<h1[^>]*>Ariso<\/h1>/);
    expect(html).toContain('轻装简从');
    expect(html).toContain('账号初始化、登录和图片上传尚未开放。');
    expect(html).not.toMatch(
      /<a\b[^>]*href="\/(?:login|upload|images|setup)?"/,
    );
  });

  it('数据库品牌修改在下一请求同步更新正文与 metadata，并转义 HTML', async () => {
    database
      .prepare(
        'INSERT INTO site_settings (id, public_url, time_zone, name, description, updated_at) VALUES (1, ?, ?, ?, ?, ?)',
      )
      .run(origin, 'Asia/Shanghai', '新站点', '新的描述', Date.now());
    const first = await home();
    expect(first).toContain('<title>新站点</title>');
    expect(first).toMatch(/<h1[^>]*>新站点<\/h1>/);
    expect(first).toContain('name="description" content="新的描述"');
    expect(first).toMatch(/<p[^>]*class="home-description"[^>]*>新的描述<\/p>/);

    database
      .prepare(
        'UPDATE site_settings SET name = ?, description = ? WHERE id = 1',
      )
      .run('<script>站点</script>', '<img src=x onerror=alert(1)>');
    const updated = await home();
    expect(updated).toContain(
      '<title>&lt;script&gt;站点&lt;/script&gt;</title>',
    );
    expect(updated).toMatch(
      /<h1[^>]*>&lt;script&gt;站点&lt;\/script&gt;<\/h1>/,
    );
    expect(updated).toContain(
      'name="description" content="&lt;img src=x onerror=alert(1)&gt;"',
    );
    expect(updated).not.toContain('<script>站点</script>');
    expect(updated).not.toContain('<img src=x onerror=alert(1)>');

    database
      .prepare('UPDATE site_settings SET description = ? WHERE id = 1')
      .run('');
    const empty = await home();
    expect(empty).toMatch(/<p[^>]*class="home-description"[^>]*><\/p>/);
    expect(empty).not.toContain('轻装简从');
    expect(empty).not.toContain('单用户，自托管图床。');
  });

  it('未开放地址返回真实 404 并提供返回首页入口', async () => {
    const response = await fetch(`${origin}/not-an-implemented-page`);
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain('页面不存在');
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>返回首页<\/a>/);
  });
});
