import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import {
  parseBrowserExtensionFixtureCommand,
  startExtensionSourceServer,
  type SourceRequest,
} from '../../../scripts/verify-browser-extension.ts';

it('accepts documented stdin commands without turning arbitrary input into an operation', () => {
  expect(parseBrowserExtensionFixtureCommand('state')).toBe('state');
  expect(parseBrowserExtensionFixtureCommand('{"command":"hold"}')).toBe(
    'hold',
  );
  expect(parseBrowserExtensionFixtureCommand('stop')).toBe('stop');
  expect(() => parseBrowserExtensionFixtureCommand('delete-all')).toThrow(
    'Expected',
  );
  expect(() =>
    parseBrowserExtensionFixtureCommand('{"command":"unknown"}'),
  ).toThrow('Expected');
});

it('serves the controlled source page, actual PNG bytes, denial and redirect', async () => {
  const bytes = await readFile('tests/fixtures/runtime/images/sample.png');
  const requests: SourceRequest[] = [];
  const source = await startExtensionSourceServer(
    { '/image.png': bytes },
    requests,
  );
  try {
    const page = await fetch(source.origin);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain(
      '<title>Ariso extension acceptance</title>',
    );
    const image = await fetch(`${source.origin}/image.png`);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await image.arrayBuffer())).toEqual(bytes);
    expect((await fetch(`${source.origin}/denied.png`)).status).toBe(403);
    const redirect = await fetch(`${source.origin}/redirect.png`, {
      redirect: 'manual',
    });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe('/image.png');
    expect(requests.every((request) => !request.authorizationPresent)).toBe(
      true,
    );
    await fetch(`${source.origin}/image.png`, {
      headers: { authorization: 'Bearer must-not-be-recorded' },
    });
    expect(requests.at(-1)?.authorizationPresent).toBe(true);
    expect(JSON.stringify(requests)).not.toContain('must-not-be-recorded');
  } finally {
    await source.close();
  }
});
