import { beforeEach, expect, it, vi } from 'vitest';
import {
  GET as templatesGet,
  POST as templatesPost,
} from '../../../src/app/api/media/edit-templates/route.ts';
import {
  PATCH as templatePatch,
  DELETE as templateDelete,
} from '../../../src/app/api/media/edit-templates/[id]/route.ts';
import {
  GET as contextGet,
  POST as editPost,
} from '../../../src/app/api/images/[id]/edit/route.ts';
import { GET as statusGet } from '../../../src/app/api/media/edits/[id]/route.ts';
import { POST as retryPost } from '../../../src/app/api/media/edits/[id]/retry/route.ts';
import { GET as sourceGet } from '../../../src/app/api/images/[id]/edit/source/route.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';
import { createContentMutations } from '../../../src/server/runtime/content-mutations.ts';
import { listEditTemplates } from '../../../src/server/media/edit-templates.ts';
import { requestImageEdit } from '../../../src/server/media/edit-requests.ts';

vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: vi.fn() }),
}));
vi.mock('../../../src/server/media/edit-templates.ts', () => ({
  listEditTemplates: vi.fn(),
  createEditTemplate: vi.fn(),
  updateEditTemplate: vi.fn(),
  deleteEditTemplate: vi.fn(),
}));
vi.mock('../../../src/server/media/edit-requests.ts', () => ({
  readImageEditContext: vi.fn(),
  requestImageEdit: vi.fn(),
  readImageEditRequest: vi.fn(),
  retryImageEdit: vi.fn(),
}));

const headers = {
  origin: 'http://localhost',
  'content-type': 'application/json',
};
const params = () => ({ params: Promise.resolve({ id: 'sample-id' }) });
let gate: ReturnType<typeof createContentMutations>;
beforeEach(() => {
  vi.resetAllMocks();
  gate = createContentMutations();
  vi.mocked(getServerRuntime).mockReturnValue({
    connection: { db: {} },
    contentMutations: gate,
  } as ReturnType<typeof getServerRuntime>);
});

it('requires ownership before every editor route reads request bodies or parameters', async () => {
  vi.mocked(requireOwner).mockRejectedValue(
    Object.assign(new Error('请先登录'), { code: 'UNAUTHORIZED', status: 401 }),
  );
  let parametersRead = false;
  const context = {
    get params() {
      parametersRead = true;
      return Promise.resolve({ id: 'sample-id' });
    },
  };
  for (const call of [
    (request: Request) => templatesGet(request),
    (request: Request) => templatesPost(request),
    (request: Request) => templatePatch(request, context),
    (request: Request) => templateDelete(request, context),
    (request: Request) => contextGet(request, context),
    (request: Request) => editPost(request, context),
    (request: Request) => statusGet(request, context),
    (request: Request) => retryPost(request, context),
    (request: Request) => sourceGet(request, context),
  ]) {
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers,
      body: '{}',
    });
    const response = await call(request);
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(request.bodyUsed).toBe(false);
  }
  expect(parametersRead).toBe(false);
  expect(getServerRuntime).not.toHaveBeenCalled();
});

it('rejects invalid origins without creating an edit task', async () => {
  vi.mocked(requireOwner).mockRejectedValue(
    Object.assign(new Error('请求来源无效'), {
      code: 'INVALID_ORIGIN',
      status: 403,
    }),
  );
  const response = await editPost(
    new Request('http://localhost/api/test', {
      method: 'POST',
      headers,
      body: '{}',
    }),
    params(),
  );
  expect(response.status).toBe(403);
  expect(requestImageEdit).not.toHaveBeenCalled();
});

it('pauses content writes before consuming input but keeps template reads available', async () => {
  gate.closeAdmission();
  const request = new Request('http://localhost/api/test', {
    method: 'POST',
    headers,
    body: '{}',
  });
  const response = await editPost(request, params());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    code: 'SITE_BACKUP_IN_PROGRESS',
  });
  expect(request.bodyUsed).toBe(false);
  vi.mocked(listEditTemplates).mockReturnValue([]);
  const read = await templatesGet(
    new Request('http://localhost/api/media/edit-templates'),
  );
  expect(read.status).toBe(200);
  expect(await read.json()).toEqual({ templates: [] });
});

it('reports invalid JSON and source changes as explicit client errors', async () => {
  const invalid = await editPost(
    new Request('http://localhost/api/test', {
      method: 'POST',
      headers,
      body: '{broken',
    }),
    params(),
  );
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({ code: 'INVALID_JSON' });
  vi.mocked(requestImageEdit).mockImplementation(() => {
    throw Object.assign(new Error('原图已变化'), {
      code: 'MEDIA_EDIT_SOURCE_CHANGED',
      status: 409,
    });
  });
  const conflict = await editPost(
    new Request('http://localhost/api/test', {
      method: 'POST',
      headers,
      body: '{}',
    }),
    params(),
  );
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({
    code: 'MEDIA_EDIT_SOURCE_CHANGED',
    message: '原图已变化',
  });
});
