import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

const requireExternal = createRequire(resolve('package.json'));
const slots = [];
let cursor = 0;
let writes = [];
let releaseRead;
const client = new QueryClient();
const hooks = {
  useState(initial) {
    const index = cursor++;
    if (!(index in slots))
      slots[index] = typeof initial === 'function' ? initial() : initial;
    return [
      slots[index],
      (value) => {
        slots[index] =
          typeof value === 'function' ? value(slots[index]) : value;
      },
    ];
  },
  useRef(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index];
  },
  useCallback: (callback) => callback,
};
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  const require = (id) => {
    if (id === 'react') return hooks;
    if (id === '@tanstack/react-query') return { useQueryClient: () => client };
    if (id === '@heroui/react/toast') return { toast: () => {} };
    if (id === '../upload/provider')
      return {
        useUploadQueue: () => ({
          client: { invalidateQueries: async () => {} },
        }),
      };
    if (!id.startsWith('.')) return requireExternal(id);
    return load(resolve(dirname(file), extname(id) ? id : `${id}.ts`));
  };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require,
    fetch: async (url, init) => {
      writes.push({ url, method: init?.method, body: JSON.parse(init.body) });
      return {
        ok: true,
        json: async () => ({
          ...writes.at(-1).body,
          id: 1,
          updatedAt: 'later',
        }),
      };
    },
    requestAnimationFrame: () => {},
    console,
  });
  return exports;
}
const { initialMediaSettings } = load(
  resolve('src/server/media/validation.ts'),
);
const cached = {
  ...initialMediaSettings,
  id: 1,
  updatedAt: 'earlier',
  quality: 82,
};
const current = { ...cached, updatedAt: 'later', quality: 68 };
client.setQueryData(['processing-settings'], cached);
const observer = new QueryObserver(client, {
  queryKey: ['processing-settings'],
  retry: false,
  networkMode: 'always',
  refetchOnWindowFocus: false,
  queryFn: () =>
    new Promise((resolve) => {
      releaseRead = resolve;
    }),
});
const unsubscribe = observer.subscribe(() => {});
const production = load(
  resolve('src/components/processing/use-processing-settings.ts'),
);
cursor = 0;
let form = production.useProcessingSettings(observer.getCurrentResult().data);
assert.equal(form.input.quality, 82);
releaseRead(current);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(observer.getCurrentResult().data.quality, 68);
const fetchedQuality = observer.getCurrentResult().data.quality;
cursor = 0;
form = production.useProcessingSettings(observer.getCurrentResult().data);
await form.save();
console.log(
  JSON.stringify(
    {
      probe:
        'real TanStack QueryObserver and production useProcessingSettings with isolated persistent hook slots; no browser or network',
      fetchedQuality,
      formQualityAfterFreshGET: form.input.quality,
      submittedQuality: writes[0].body.quality,
      fieldsSubmitted: Object.keys(writes[0].body).length,
    },
    null,
    2,
  ),
);
unsubscribe();
client.clear();
assert.equal(
  writes[0].body.quality,
  current.quality,
  'Re-entry form must use the completed fresh settings GET before an unchanged save',
);
