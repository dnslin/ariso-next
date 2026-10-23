import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { useGithubAccountView } from '../../../src/components/identity/use-github-account-view';
import type { useGithubAccount } from '../../../src/components/identity/use-github-account';
const parameters = vi.hoisted(() => ({ value: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(parameters.value),
}));
const account = {
  settings: {
    data: undefined,
    isFetchedAfterMount: false,
    isFetching: false,
    isError: false,
  },
  binding: {
    data: null,
    isFetchedAfterMount: false,
    isFetching: false,
    isError: false,
  },
} as unknown as ReturnType<typeof useGithubAccount>;
function Probe() {
  const view = useGithubAccountView(account);
  return createElement('span', {
    'data-paused': String(view.callbackBackupPaused),
    'data-failed': String(view.callbackFailed),
  });
}
it.each([
  ['github=error&error=site_backup_in_progress', true, true],
  ['github=error&error=access_denied', false, true],
  ['github=linked&error=site_backup_in_progress', false, false],
])('identifies the backup callback reason in %s', (query, paused, failed) => {
  parameters.value = query;
  const html = renderToStaticMarkup(createElement(Probe));
  expect(html).toContain(`data-paused="${paused}"`);
  expect(html).toContain(`data-failed="${failed}"`);
});
