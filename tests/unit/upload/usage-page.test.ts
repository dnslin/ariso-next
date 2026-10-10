import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  site: vi.fn(),
  runtime: vi.fn(() => ({ connection: { db: {} } })),
  sidebar: vi.fn(async () => true),
}));
vi.mock('../../../src/server/identity/owner-page.ts', () => ({
  requirePageOwner: mocks.owner,
}));
vi.mock('../../../src/server/site/settings.ts', () => ({
  requireSiteSettings: mocks.site,
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: mocks.runtime,
}));
vi.mock('../../../src/components/shell/sidebar-preference.ts', () => ({
  readSidebarCollapsed: mocks.sidebar,
}));
vi.mock('../../../src/components/upload-usage/usage-page.tsx', () => ({
  UploadUsagePage: () => null,
}));
import Page from '../../../src/app/settings/api/usage/page.tsx';

beforeEach(() => vi.clearAllMocks());

it('authorizes the owner before reading site or runtime data', async () => {
  mocks.owner.mockRejectedValueOnce(new Error('owner authorization refused'));
  await expect(Page()).rejects.toThrow('owner authorization refused');
  expect(mocks.owner).toHaveBeenCalledWith('/settings/api/usage');
  expect(mocks.runtime).not.toHaveBeenCalled();
  expect(mocks.site).not.toHaveBeenCalled();
});

it.each([null, 'logo-version.png'])(
  'only serializes public shell identity and branding URL; logoKey=%s',
  async (logoKey) => {
    mocks.owner.mockResolvedValueOnce({
      email: 'owner@example.test',
      name: 'Owner',
      id: 'owner-id',
    });
    mocks.site.mockReturnValueOnce({
      name: 'Ariso Test',
      description: 'Test images',
      logoKey,
      logoMime: logoKey ? 'image/png' : null,
      faviconKey: 'favicon-version.ico',
      publicUrl: 'https://images.example.test',
      timeZone: 'Asia/Shanghai',
      privateExtra: 'not-for-client',
    });
    const page = await Page();
    expect(page.props).toEqual({
      name: 'Ariso Test',
      description: 'Test images',
      logoUrl: logoKey === null ? null : `/branding/${logoKey}`,
      email: 'owner@example.test',
      ownerName: 'Owner',
      initialSidebarCollapsed: true,
    });
  },
);
