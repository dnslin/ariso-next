import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  site: vi.fn(),
  runtime: vi.fn(() => ({ connection: { db: {} } })),
  sidebar: vi.fn(async () => false),
}));
vi.mock('../../../src/server/identity/owner-page', () => ({
  requirePageOwner: mocks.owner,
}));
vi.mock('../../../src/server/site/settings', () => ({
  requireSiteSettings: mocks.site,
}));
vi.mock('../../../src/server/startup/server-start', () => ({
  getServerRuntime: mocks.runtime,
}));
vi.mock('../../../src/components/shell/sidebar-preference', () => ({
  readSidebarCollapsed: mocks.sidebar,
}));
vi.mock('../../../src/components/upload/screen', () => ({
  UploadScreen: () => null,
}));
import UploadPage from '../../../src/app/upload/page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue({ email: 'owner@example.test', name: 'Owner' });
  mocks.site.mockReturnValue({ name: 'Ariso', description: '', logoKey: null });
});

it('retains the album context across the owner login and serializes only its server-resolved parameters', async () => {
  const returnTo = '/albums/a?page=2&layout=masonry';
  const page = await UploadPage({
    searchParams: Promise.resolve({
      albumId: 'a',
      returnTo,
      albumName: '不可信名称',
    }),
  });
  expect(mocks.owner).toHaveBeenCalledWith(
    `/upload?${new URLSearchParams({ albumId: 'a', returnTo })}`,
  );
  expect(page.props).toMatchObject({ albumId: 'a', returnTo });
  expect(page.props).not.toHaveProperty('albumName');
  expect(page.key).toBe('a');
});

it('checks owner access before any upload page data is read', async () => {
  mocks.owner.mockRejectedValueOnce(new Error('not signed in'));
  await expect(
    UploadPage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow('not signed in');
  expect(mocks.owner).toHaveBeenCalledWith('/upload');
  expect(mocks.runtime).not.toHaveBeenCalled();
  expect(mocks.site).not.toHaveBeenCalled();
});
