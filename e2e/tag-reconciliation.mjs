import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { identitySql } from './identity-session.mjs';
import { tagDialogSelector } from './tags-dialog.mjs';
import { resizeViewport, setTheme } from './browser-geometry.mjs';

/** Real writes and SQLite state; the definite 400 fixture rejects before sending a write. */
export async function verifyTagReconciliation({
  page,
  config,
  report,
  mode = 'green',
}) {
  const result = {
    status: 'failed',
    mode,
    origin: config.origin,
    spaceId: config.spaceId,
    node: process.version,
    startedAt: new Date().toISOString(),
    cases: [],
    screenshots: [],
  };
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const sql = (statement) => identitySql(config, statement);
  const button = (name) => `loc=role:button[name="${name}"]`;
  const targets = new Set();
  const imagesBefore = await sql('SELECT id FROM media_images ORDER BY id');
  const stamp = Date.now();
  async function api(path, method = 'GET', body) {
    const response = await page.fetch(`/api/tags${path}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    return { status: response.status, data: JSON.parse(response.body) };
  }
  async function state(id, name) {
    return {
      tags: await sql(
        id
          ? `SELECT id,display_name FROM tags WHERE id=${quote(id)}`
          : `SELECT id,display_name FROM tags WHERE display_name=${quote(name)}`,
      ),
      relationships: id
        ? await sql(
            `SELECT image_id,tag_id FROM image_tags WHERE tag_id=${quote(id)} ORDER BY image_id`,
          )
        : [],
      images: await sql('SELECT id FROM media_images ORDER BY id'),
    };
  }
  async function inject(action, delivery, verificationFails, id) {
    await page.evaluate(
      ({ action, delivery, verificationFails, id }) => {
        const original = window.fetch;
        window.__tagReconRequests = [];
        window.__tagReconTargetRead = false;
        window.__tagReconRestore = () => {
          window.fetch = original;
        };
        const method = { create: 'POST', edit: 'PATCH', delete: 'DELETE' }[
          action
        ];
        const path = action === 'create' ? '/api/tags' : `/api/tags/${id}`;
        window.fetch = async (...args) => {
          const url = new URL(String(args[0]), location.href);
          const verb = args[1]?.method ?? 'GET';
          if (!url.pathname.startsWith('/api/tags')) return original(...args);
          const request = {
            method: verb,
            path: url.pathname,
            query: url.search,
            realStatus: null,
            deliveredStatus: null,
          };
          window.__tagReconRequests.push(request);
          if (verb === 'GET') {
            if (
              verificationFails ||
              (delivery === 'lost-list-fails' &&
                url.pathname === '/api/tags' &&
                window.__tagReconTargetRead)
            ) {
              request.deliveredStatus = 503;
              return new Response(
                JSON.stringify({
                  code: 'COLLECTION_UNAVAILABLE',
                  message: '浏览器验证：此读取暂时不可用',
                }),
                {
                  status: 503,
                  headers: { 'content-type': 'application/json' },
                },
              );
            }
            const response = await original(...args);
            request.realStatus = response.status;
            request.deliveredStatus = response.status;
            if (url.pathname === path && response.ok)
              window.__tagReconTargetRead = true;
            return response;
          }
          if (url.pathname !== path || verb !== method)
            return original(...args);
          if (delivery === 'known-rejection') {
            request.deliveredStatus = 400;
            return new Response(
              JSON.stringify({
                code: 'COLLECTION_INVALID_INPUT',
                message: '浏览器验证：此操作已被明确拒绝',
              }),
              { status: 400, headers: { 'content-type': 'application/json' } },
            );
          }
          const response = await original(...args);
          request.realStatus = response.status;
          if (delivery === 'lost-list-fails')
            throw new TypeError(
              'Verification: real PATCH committed, response delivery lost',
            );
          request.deliveredStatus = 502;
          return new Response(
            '<h1>Bad Gateway after the real write committed</h1>',
            { status: 502, headers: { 'content-type': 'text/html' } },
          );
        };
      },
      { action, delivery, verificationFails, id },
    );
  }
  const cases =
    mode === 'red'
      ? [
          ['create', 'html-502', false],
          ['edit', 'html-502', false],
          ['delete', 'html-502', false],
          ['edit', 'lost-list-fails', false],
        ]
      : [
          ['create', 'html-502', false],
          ['edit', 'html-502', false],
          ['delete', 'html-502', false],
          ['create', 'html-502', true],
          ['edit', 'html-502', true],
          ['delete', 'html-502', true],
          ['edit', 'lost-list-fails', false],
          ['edit', 'known-rejection', false],
        ];
  try {
    for (const [
      index,
      [action, delivery, verificationFails],
    ] of cases.entries()) {
      if (mode === 'green') {
        await resizeViewport(page, index % 2 === 0 ? 1440 : 390);
        await setTheme(page, index % 2 === 0 ? 'light' : 'dark');
      }
      const name = `核对-${stamp}-${index}`;
      const savedName = `${name}-保存`;
      let id;
      if (action !== 'create') {
        const created = await api('', 'POST', { name });
        assert.equal(created.status, 201);
        id = created.data.tag.id;
        targets.add(id);
        await sql(
          `INSERT INTO image_tags (image_id,tag_id) VALUES ('issue176-image-0',${quote(id)}),('issue176-image-172',${quote(id)})`,
        );
      }
      const before = await state(id, name);
      await page.goto(`${config.origin}/tags`);
      await page.waitForSelector('[data-testid="tags-list"]');
      await page.click(
        button(
          action === 'create'
            ? '新建标签'
            : `${action === 'edit' ? '编辑' : '删除'}标签 ${name}`,
        ),
      );
      await page.waitForSelector(tagDialogSelector);
      if (action !== 'delete')
        await page.fill('#tag-name', action === 'create' ? name : savedName);
      await inject(action, delivery, verificationFails, id);
      await page.click(
        button(
          { create: '创建标签', edit: '保存更改', delete: '删除标签' }[action],
        ),
      );
      await page.waitForFunction((selector) => {
        const dialog = document.querySelector(selector);
        if (!dialog)
          return !!document.querySelector('[data-slot="toast"].toast--success');
        return (
          ![...dialog.querySelectorAll('button')].some(
            (node) =>
              node.textContent.includes('正在提交') ||
              node.textContent.includes('正在核对'),
          ) &&
          /未能|已核对|待核对|未发生变化/.test(
            dialog.querySelector('h2')?.textContent ?? '',
          )
        );
      }, tagDialogSelector);
      const ui = await page.evaluate(
        (selector) => ({
          heading:
            document
              .querySelector(selector)
              ?.querySelector('h2')
              ?.textContent.trim() ?? null,
          dialog: document.querySelector(selector)?.textContent ?? null,
          name: document.querySelector('#tag-name')?.value ?? null,
          listError:
            document.querySelector('[data-testid="tags-error"]')?.textContent ??
            null,
          toast:
            document.querySelector('[data-slot="toast"]')?.textContent ?? null,
          requests: window.__tagReconRequests,
          viewport: {
            width: innerWidth,
            height: innerHeight,
            theme: document.documentElement.classList.contains('dark')
              ? 'dark'
              : 'light',
          },
        }),
        tagDialogSelector,
      );
      const after = await state(id, name);
      if (action === 'create') {
        assert.equal(after.tags.length, 1);
        id = after.tags[0].id;
        targets.add(id);
      }
      const writes = ui.requests.filter((request) => request.method !== 'GET');
      const reads = ui.requests.filter((request) => request.method === 'GET');
      assert.equal(
        writes.length,
        1,
        'A response fault never repeats the write',
      );
      assert.deepEqual(
        after.images,
        imagesBefore,
        'Image records survive all tag response faults',
      );
      if (action === 'edit') {
        assert.equal(after.tags[0].id, id);
        assert.equal(
          after.tags[0].display_name,
          delivery === 'known-rejection' ? name : savedName,
        );
        assert.deepEqual(
          after.relationships,
          before.relationships,
          'Rename keeps both normal and recycle-bin associations',
        );
      }
      if (action === 'delete') {
        assert.equal(after.tags.length, 0);
        assert.equal(after.relationships.length, 0);
      }
      const file = `${mode}-${index}-${action}-${delivery}${verificationFails ? '-read-fails' : ''}.png`;
      await page.screenshot({ path: join(config.output, file) });
      result.screenshots.push(file);
      const evidence = {
        action,
        delivery,
        verificationFails,
        id,
        before,
        after,
        ...ui,
        screenshot: file,
        snapshot: await page.snapshot(),
      };
      if (mode === 'red') {
        if (delivery === 'html-502') {
          assert.equal(
            reads.length,
            0,
            'Reproduce the old branch: committed 502 skips target verification',
          );
          assert.ok(ui.dialog.includes('图片关系未改变'));
          assert.equal(
            ui.heading,
            {
              create: '标签未能创建',
              edit: '更改未能保存',
              delete: '标签未能删除',
            }[action],
          );
        } else {
          assert.equal(ui.heading, '操作结果待核对');
          assert.ok(
            reads.some(
              (request) =>
                request.path === `/api/tags/${id}` &&
                request.realStatus === 200,
            ),
          );
          assert.ok(
            reads.some(
              (request) =>
                request.path === '/api/tags' && request.deliveredStatus === 503,
            ),
          );
          assert.ok(ui.listError);
        }
        try {
          assert.equal(
            ui.heading,
            action === 'delete' ? null : '当前标签已核对',
          );
        } catch (error) {
          evidence.expectedFailure = String(error);
        }
        assert.ok(
          evidence.expectedFailure,
          'The desired current-result assertion actually fails on the old bundle',
        );
      } else if (delivery === 'known-rejection') {
        assert.equal(ui.heading, '更改未能保存');
        assert.equal(ui.name, savedName);
        assert.equal(reads.length, 0);
      } else {
        assert.ok(
          reads.length >= 1,
          'Every ambiguous 5xx starts a read-only reconciliation',
        );
        assert.equal(
          writes[0].realStatus,
          action === 'create' ? 201 : 200,
          'The write really committed before delivery failed',
        );
        if (verificationFails) {
          assert.equal(ui.heading, '操作结果待核对');
          assert.ok(!ui.dialog.includes('图片关系未改变'));
        } else if (action === 'delete') {
          assert.equal(ui.heading, null);
          assert.ok(ui.toast.includes('已不存在'));
          assert.ok(
            reads.some(
              (request) =>
                request.path === `/api/tags/${id}` &&
                request.realStatus === 404,
            ),
          );
        } else {
          assert.equal(ui.heading, '当前标签已核对');
          assert.ok(ui.dialog.includes(action === 'create' ? name : savedName));
        }
        if (delivery === 'lost-list-fails') {
          assert.ok(ui.listError, 'List error remains independently visible');
          assert.ok(!ui.dialog.includes('暂时无法核对结果'));
          assert.equal(
            reads.filter(
              (request) =>
                request.path === `/api/tags/${id}` &&
                request.realStatus === 200,
            ).length,
            1,
          );
        }
      }
      result.cases.push(evidence);
      await page.evaluate(() => window.__tagReconRestore());
      const open = await page.evaluate(
        (selector) => !!document.querySelector(selector),
        tagDialogSelector,
      );
      if (open) {
        await page.click(`${tagDialogSelector} button[aria-label="关闭"]`);
        await page.waitForSelector(tagDialogSelector, { state: 'hidden' });
      }
      await api(`/${id}`, 'DELETE');
      targets.delete(id);
    }
    result.status = mode === 'red' ? 'reproduced' : 'passed';
    if (mode === 'green' && report) {
      report.checks.push(
        'Committed HTML 502 responses after POST/PATCH/DELETE reconcile through real GETs with one write; failed reads keep unknown without falsely claiming unchanged relationships.',
        'A successful target-by-ID read remains checked when the independent list refresh returns 503; a simulated definite 400 rejection preserves input without sending a write or starting reconciliation.',
      );
      report.screenshots.push(...result.screenshots);
    }
  } catch (error) {
    result.error = String(error.stack ?? error);
    throw error;
  } finally {
    await page.evaluate(() => window.__tagReconRestore?.());
    for (const id of targets) await api(`/${id}`, 'DELETE');
    await page.goto(`${config.origin}/tags`);
    await page.waitForSelector('[data-testid="tags-list"]');
    result.finishedAt = new Date().toISOString();
    await writeFile(
      join(config.output, `tag-reconciliation-${mode}.json`),
      JSON.stringify(result, null, 2),
    );
  }
  return result;
}
