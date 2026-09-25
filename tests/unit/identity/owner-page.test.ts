import { beforeEach, expect, it, vi } from 'vitest';
import { requirePageOwner } from '../../../src/server/identity/owner-page.ts';

const boundary = vi.hoisted(() => ({
  headers: vi.fn(),
  requireOwner: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: boundary.headers }));
vi.mock('next/navigation', () => ({ redirect: boundary.redirect }));
vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: boundary.requireOwner,
}));
const redirected = new Error('Next redirect');
beforeEach(() => {
  vi.resetAllMocks();
  boundary.headers.mockResolvedValue(new Headers());
  boundary.redirect.mockImplementation(() => {
    throw redirected;
  });
});

it.each(['/admin', '/library'])(
  'returns the owner for protected page %s',
  async (path) => {
    const headers = new Headers({ cookie: 'ariso.session_token=valid' });
    const owner = { id: 'owner', email: 'owner@example.test' };
    boundary.headers.mockResolvedValue(headers);
    boundary.requireOwner.mockResolvedValue(owner);
    expect(await requirePageOwner(path)).toBe(owner);
    const [request] = boundary.requireOwner.mock.calls[0];
    expect(request.url).toBe(`http://ariso.internal${path}`);
    expect(request.method).toBe('GET');
    expect(request.headers.get('cookie')).toBe('ariso.session_token=valid');
    expect(boundary.redirect).not.toHaveBeenCalled();
  },
);

it.each([
  ['/admin', '', '/login?returnTo=%2Fadmin'],
  ['/library', '', '/login?returnTo=%2Flibrary'],
  [
    '/library',
    'ariso.session_token=expired',
    '/login?returnTo=%2Flibrary&reason=expired',
  ],
  [
    '/admin',
    'theme=dark; __Secure-ariso.session_token=expired',
    '/login?returnTo=%2Fadmin&reason=expired',
  ],
  [
    '/library',
    'other_ariso.session_token=unrelated',
    '/login?returnTo=%2Flibrary',
  ],
])('redirects %s with Cookie %s to %s', async (path, cookie, location) => {
  boundary.headers.mockResolvedValue(new Headers({ cookie }));
  boundary.requireOwner.mockRejectedValue(
    Object.assign(new Error('请先登录'), { code: 'UNAUTHORIZED', status: 401 }),
  );
  await expect(requirePageOwner(path)).rejects.toBe(redirected);
  expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith(location);
});

it('preserves non-authentication errors rather than disguising them as logout', async () => {
  const error = new Error('SQLite read failed');
  boundary.requireOwner.mockRejectedValue(error);
  await expect(requirePageOwner('/library')).rejects.toBe(error);
  expect(boundary.redirect).not.toHaveBeenCalled();
});
