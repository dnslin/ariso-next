import { beforeEach, expect, it, vi } from 'vitest';
import StorageEditorPage from '../../../src/app/settings/storage/[id]/page';

const boundary = vi.hoisted(() => ({ requireOwner: vi.fn() }));
vi.mock('../../../src/server/identity/owner-page', () => ({
  requirePageOwner: boundary.requireOwner,
}));
vi.mock('../../../src/components/storage/storage-editor', () => ({
  StorageEditor: () => null,
}));
vi.mock('../../../src/components/shell/sidebar-preference', () => ({
  readSidebarCollapsed: vi.fn(),
}));
vi.mock('../../../src/server/site/settings', () => ({
  requireSiteSettings: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start', () => ({
  getServerRuntime: vi.fn(),
}));
const loginRedirect = new Error('login redirect');
beforeEach(() => {
  boundary.requireOwner.mockReset().mockRejectedValue(loginRedirect);
});

it.each([
  [
    { view: 'references', saved: '1' },
    '/settings/storage/archive?view=references',
  ],
  [{ saved: '1' }, '/settings/storage/archive'],
])(
  'retains only the requested storage view across authentication',
  async (query, destination) => {
    await expect(
      StorageEditorPage({
        params: Promise.resolve({ id: 'archive' }),
        searchParams: Promise.resolve(query),
      }),
    ).rejects.toBe(loginRedirect);
    expect(boundary.requireOwner).toHaveBeenCalledExactlyOnceWith(destination);
  },
);
