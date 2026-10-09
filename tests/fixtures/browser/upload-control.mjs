import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const [output, boundary, message] = process.argv.slice(2);
const root = new URL('../../../', import.meta.url);
const error = new Error(message);
const afterStop = [];
let stopped = false;
let evaluations = 0;
const modules = new Map([
  [
    'identity-session.mjs',
    'export const identitySql=async()=>[{processing_status:"ready",id:"image"}];',
  ],
  ['library-detail.mjs', 'export const selectCopyFormat=()=>{};'],
  [
    'upload-layouts.mjs',
    'export const createUploadLayouts=()=>({resize(){},layouts(){}});',
  ],
  [
    'upload-storage-availability.mjs',
    'export const runUploadStorageAvailability=()=>{};',
  ],
]);
if (boundary === 'transport')
  modules.set('owner-shell.mjs', 'export const verifyOwnerShell=async()=>{};');
registerHooks({
  load(url, context, nextLoad) {
    for (const [name, source] of modules)
      if (url === new URL(`e2e/${name}`, root).href)
        return { format: 'module', source, shortCircuit: true };
    return nextLoad(url, context);
  },
});
const page = new Proxy(
  {},
  {
    get(_target, name) {
      return async () => {
        if (stopped) afterStop.push(String(name));
        if (
          (boundary === 'owner' && name === 'cdp') ||
          (boundary === 'transport' && name === 'reload')
        ) {
          stopped = true;
          throw error;
        }
        if (name === 'fetch') return { status: 200, body: 'null' };
        if (name === 'cdp') return { identifier: 'upload-transport' };
        if (name === 'evaluate') return [true, 'image', false][evaluations++];
        if (name === 'snapshot') return 'offline snapshot';
      };
    },
  },
);
globalThis.config = {
  output,
  origin: 'http://fixture.localhost',
  projectDirectory: fileURLToPath(root),
  identitySessionScript: new URL('e2e/identity-session.mjs', root).href,
  libraryDetailScript: new URL('e2e/library-detail.mjs', root).href,
  credentials: { email: '', password: '' },
};
globalThis.taskSpace = async () => ({ page: () => page });
let failure;
try {
  await import(new URL('e2e/upload.mjs', root));
} catch (caught) {
  failure = caught;
}
const report = JSON.parse(await readFile(`${output}/upload.json`, 'utf8'));
console.log(
  JSON.stringify({ originalError: failure === error, afterStop, report }),
);
