import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertStaticSvg } from '../../../scripts/media/svg-policy.mjs';
import { Resvg } from '@resvg/resvg-js';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export async function verifySvg({ directory, run }) {
  await mkdir(directory, { recursive: true });
  const localImage = join(directory, 'local-canary.png');
  await run('magick', ['-size', '32x32', 'xc:red', localImage]);
  const canary = await readFile(localImage);
  const entity = join(directory, 'local-entity.txt');
  await writeFile(entity, '<rect width="32" height="32" fill="red"/>');
  const policyDirectory = join(directory, 'policy');
  await mkdir(policyDirectory, { recursive: true });
  await writeFile(
    join(policyDirectory, 'policy.xml'),
    '<policymap><policy domain="delegate" rights="none" pattern="*"/><policy domain="coder" rights="none" pattern="{HTTP,HTTPS,FTP}"/></policymap>',
  );
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.writeHead(200, { 'Content-Type': 'image/png' });
    response.end(canary);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const svg = (body, prefix = '') =>
    `${prefix}<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="32" height="32"><rect width="32" height="32" fill="white"/>${body}</svg>`;
  const fixtures = [
    ['safe', svg('<rect width="32" height="32" fill="blue"/>')],
    [
      'safe-use',
      svg(
        '<defs><rect id="shape" width="32" height="32" fill="#00ff00"/></defs><use xlink:href="#shape"/>',
      ),
    ],
    [
      'safe-gradient',
      svg(
        '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:red"/><stop offset="100%" style="stop-color:blue"/></linearGradient></defs><rect width="32" height="32" fill="url(#g)"/>',
      ),
    ],
    [
      'network-image',
      svg(`<image width="32" height="32" xlink:href="${origin}/image.png"/>`),
    ],
    [
      'local-image',
      svg(
        `<image width="32" height="32" xlink:href="${pathToFileURL(localImage)}"/>`,
      ),
    ],
    [
      'absolute-image',
      svg(`<image width="32" height="32" xlink:href="${localImage}"/>`),
    ],
    [
      'relative-image',
      svg('<image width="32" height="32" xlink:href="local-canary.png"/>'),
    ],
    ['script', svg(`<script>fetch('${origin}/script')</script>`)],
    [
      'event-handler',
      svg(`<rect width="1" height="1" onload="fetch('${origin}/event')"/>`),
    ],
    [
      'animation',
      svg(
        '<rect width="32" height="32" fill="green"><animate attributeName="fill" values="red;blue" dur="1s" repeatCount="indefinite"/></rect>',
      ),
    ],
    [
      'local-entity',
      svg(
        '&payload;',
        `<!DOCTYPE svg [<!ENTITY payload SYSTEM "${pathToFileURL(entity)}">]>`,
      ),
    ],
    [
      'network-entity',
      svg(
        '&payload;',
        `<!DOCTYPE svg [<!ENTITY payload SYSTEM "${origin}/entity">]>`,
      ),
    ],
    ['css-import', svg(`<style>@import url('${origin}/style.css');</style>`)],
    [
      'css-escaped-import',
      svg(`<style>@\\69mport '${origin}/style.css';</style>`),
    ],
    [
      'css-escaped-url',
      svg(
        `<rect width="32" height="32" style="fill:u\\72l('${origin}/paint.svg')"/>`,
      ),
    ],
    [
      'xml-base',
      svg(`<g xml:base="${origin}/"><use xlink:href="#shape"/></g>`),
    ],
    [
      'foreign-object',
      svg(
        '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>',
      ),
    ],
  ];
  const cases = [];
  const admission = [];
  try {
    for (const [name, text] of fixtures) {
      const source = join(directory, `${name}.svg`);
      await writeFile(source, text);
      const before = await readFile(source);
      const expectedAllowed = name.startsWith('safe');
      let rejection = null;
      let rendererInvoked = false;
      let rendered = null;
      const candidateRequestStart = requests.length;
      try {
        assertStaticSvg(text);
      } catch (error) {
        rejection = error.message;
      }
      if (rejection === null) {
        rendererInvoked = true;
        const renderer = new Resvg(text, { font: { loadSystemFonts: false } });
        assert.deepEqual(
          renderer.imagesToResolve(),
          [],
          'Admitted SVG must have no external images',
        );
        const image = renderer.render();
        assert.equal(image.width, 32);
        assert.equal(image.height, 32);
        const offset = (16 * image.width + 16) * 4;
        const pixel = [...image.pixels.subarray(offset, offset + 4)];
        if (name === 'safe') assert.deepEqual(pixel, [0, 0, 255, 255]);
        if (name === 'safe-use') assert.deepEqual(pixel, [0, 255, 0, 255]);
        if (name === 'safe-gradient') {
          assert.ok(
            pixel[0] > 90 &&
              pixel[0] < 160 &&
              pixel[1] === 0 &&
              pixel[2] > 90 &&
              pixel[2] < 160 &&
              pixel[3] === 255,
            'Internal gradient must render as purple at its center',
          );
        }
        const output = join(directory, `candidate-${name}.png`);
        const bytes = image.asPng();
        await writeFile(output, bytes);
        rendered = {
          output,
          width: image.width,
          height: image.height,
          pixel,
          bytes: bytes.length,
          sha256: sha256(bytes),
        };
      }
      assert.equal(
        rejection === null,
        expectedAllowed,
        `${name}: static SVG admission`,
      );
      assert.equal(
        rendererInvoked,
        expectedAllowed,
        `${name}: candidate must not render rejected SVG`,
      );
      const candidateRequests = requests.slice(candidateRequestStart);
      assert.deepEqual(
        candidateRequests,
        [],
        'Candidate must not fetch network resources',
      );
      admission.push({
        name,
        source,
        allowed: rejection === null,
        rejection,
        rendererInvoked,
        rendered,
        networkRequests: candidateRequests,
      });
      // Direct MSVG calls below deliberately bypass admission as negative controls.
      const output = join(directory, `native-${name}.png`);
      const start = requests.length;
      const result = await run('magick', [`MSVG:${source}`, output], {
        reject: false,
        timeout: 10_000,
        cwd: directory,
        env: {
          MAGICK_CONFIGURE_PATH: policyDirectory,
          NO_PROXY: [process.env.NO_PROXY, 'localhost,127.0.0.1,::1,.localhost']
            .filter(Boolean)
            .join(','),
          no_proxy: [process.env.no_proxy, 'localhost,127.0.0.1,::1,.localhost']
            .filter(Boolean)
            .join(','),
        },
      });
      let pixel = null;
      if (result.exitCode === 0) {
        const sampled = await run(
          'magick',
          [output, '-crop', '1x1+16+16', '+repage', '-depth', '8', 'rgb:-'],
          { encoding: 'buffer' },
        );
        pixel = [...sampled.stdout];
        if (name === 'safe') assert.deepEqual(pixel, [0, 0, 255]);
      }
      assert.deepEqual(await readFile(source), before);
      cases.push({
        name,
        source,
        sha256: sha256(before),
        bytes: before.length,
        exitCode: result.exitCode,
        stderr: result.stderr,
        output: result.exitCode === 0 ? output : null,
        pixel,
        networkRequests: requests.slice(start),
        localResourceRendered:
          [
            'local-image',
            'absolute-image',
            'relative-image',
            'local-entity',
          ].includes(name) && pixel?.join(',') === '255,0,0',
        timedOut: result.timedOut === true,
        rejected:
          Number.isInteger(result.exitCode) &&
          result.exitCode !== 0 &&
          !result.timedOut,
        originalUnchanged: true,
      });
    }
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  const unsafeAccepted = cases
    .filter((item) => !item.name.startsWith('safe') && !item.rejected)
    .map((item) => item.name);
  return {
    status: 'passed',
    candidate:
      '@xmldom/xmldom + css-tree static admission followed by resvg-js with system fonts disabled and no image resolver',
    admission,
    cases,
    nativeNegativeControl: {
      status: unsafeAccepted.length ? 'blocked' : 'passed',
      unsafeAccepted,
    },
    limitation:
      'The parser policy passes this corpus; MSVG alone is not an admission validator. Direct native negative controls intentionally render rejected inputs to demonstrate that distinction. T-MED-06 #150 must integrate admission before rendering. No business endpoint or universal sandbox is implemented.',
    fixtureLicense:
      'Generated test SVG, PNG and entity payloads; no third-party artwork.',
  };
}
