import Uppy from '@uppy/core';
import XHRUpload from '@uppy/xhr-upload';
import AwsS3 from '@uppy/aws-s3';
import { TaskQueue } from '@uppy/utils';

type Route = 'xhr' | 's3';
type Entry = {
  id: string;
  data: File;
  route: Route;
  fail: boolean;
  preview: string;
};
type Result = {
  id: string;
  route: Route;
  status: 'success' | 'failed' | 'cancelled';
};
const pending = new Map<string, Entry>();
const active = new Map<string, Uppy>();
const results: Result[] = [];
const references: WeakRef<File>[] = [];
const revoked: string[] = [];
const limiter = new TaskQueue({ concurrency: 3 });
let completion: Promise<unknown> | undefined;
let error: string | undefined;
let peak = 0;

function release(id: string, status: Result['status']) {
  const entry = pending.get(id);
  if (!entry) return;
  URL.revokeObjectURL(entry.preview);
  revoked.push(entry.preview);
  results.push({ id, route: entry.route, status });
  pending.delete(id);
}

// A single application-level gate admits a file before either plugin is created.
// Only IDs enter the scheduler, so settled queue closures cannot retain File data.
function createTransport(id: string, route: Route, fail: boolean) {
  const uppy = new Uppy({
    autoProceed: false,
    onBeforeFileAdded: (file) => ({ ...file, id }),
  });
  if (route === 'xhr') {
    uppy.use(XHRUpload, {
      endpoint: `/xhr/${id}?fail=${fail}`,
      allowedMetaFields: false,
      bundle: false,
      limit: 1,
      timeout: 0,
      shouldRetry: () => false,
    });
  } else {
    uppy.use(AwsS3, {
      shouldUseMultipart: false,
      retryDelays: [],
      limit: 1,
      allowedMetaFields: false,
      async getUploadParameters() {
        const response = await fetch(`/sign/${id}?fail=${fail}`);
        if (!response.ok) throw new Error(`Signing failed: ${response.status}`);
        return { method: 'PUT' as const, url: (await response.json()).url };
      },
    });
  }
  uppy.on('upload-success', () => release(id, 'success'));
  uppy.on('upload-error', () => release(id, 'failed'));
  return uppy;
}

async function transfer(id: string) {
  const entry = pending.get(id);
  if (!entry) return;
  const uppy = createTransport(id, entry.route, entry.fail);
  active.set(id, uppy);
  peak = Math.max(peak, active.size);
  uppy.addFile({
    name: entry.data.name,
    type: entry.data.type,
    data: entry.data,
  });
  try {
    await uppy.upload();
  } finally {
    // destroy removes plugin listeners and aborts any surviving transport.
    uppy.destroy();
    active.delete(id);
    if (pending.has(id)) release(id, 'cancelled');
  }
}

function add(count: number, bytes: number, failures: boolean) {
  if (pending.size || active.size)
    throw new Error('Finish the previous experiment first');
  results.length = 0;
  references.length = 0;
  revoked.length = 0;
  error = undefined;
  peak = 0;
  for (let index = 0; index < count; index++) {
    const data = new File([new Uint8Array(bytes)], 'same.png', {
      type: 'image/png',
      lastModified: 1,
    });
    const id = crypto.randomUUID();
    references.push(new WeakRef(data));
    pending.set(id, {
      id,
      data,
      route: index % 2 ? 's3' : 'xhr',
      fail: failures && index % 7 === 0,
      preview: URL.createObjectURL(data),
    });
  }
  return [...pending.keys()];
}
function start() {
  completion = Promise.all(
    [...pending.keys()].map((id) => limiter.add(() => transfer(id))),
  ).catch((reason: Error) => {
    error = reason.stack ?? reason.message;
  });
}
function cancel(id: string) {
  const uppy = active.get(id);
  release(id, 'cancelled');
  uppy?.cancelAll();
}
function state() {
  return {
    pending: pending.size,
    active: active.size,
    peak,
    results,
    revoked: revoked.length,
    error,
  };
}
const probe = {
  add,
  start,
  cancel,
  state,
  async done() {
    await completion;
    return state();
  },
  liveFiles() {
    return references.filter((ref) => ref.deref()).length;
  },
  async revokedURLsUnavailable() {
    const sample = revoked.slice(0, 3);
    return Promise.all(
      sample.map(async (url) => {
        try {
          await fetch(url);
          return false;
        } catch {
          return true;
        }
      }),
    );
  },
  duplicateFile() {
    const uppy = new Uppy({
      autoProceed: false,
      onBeforeFileAdded: (file) => ({ ...file, id: crypto.randomUUID() }),
    });
    const data = new File(['same bytes'], 'same.png', { type: 'image/png' });
    const ids = [
      uppy.addFile({ data, name: data.name }),
      uppy.addFile({ data, name: data.name }),
    ];
    const count = uppy.getFiles().length;
    uppy.destroy();
    return { ids, count };
  },
};
declare global {
  interface Window {
    uploadProbe: typeof probe;
  }
}
window.uploadProbe = probe;
document.body.textContent =
  'UPLOAD-V03：Uppy 双链路与内存实验已就绪。由 Ego 运行器执行并记录结果。';
