import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const path = 'src/components/processing/processing-page.tsx';
const source =
  ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText + '\nexports.reviewEditor = ProcessingEditor;';
const settings = {
  input: { watermarkAssetId: 'draft-id', watermarkMode: 'image' },
  saved: {},
  errors: {},
  message: 'unknown',
  unknown: true,
  busy: false,
  expired: false,
  different: false,
  change(field, value) {
    settings.input[field] = value;
  },
};
const jsx = (type, props) => ({ type, props });
const frames = [];
const selected = [];
const exports = {};
const proxy = new Proxy({}, { get: (_target, name) => String(name) });
const require = (id) => {
  if (id === 'react/jsx-runtime')
    return { jsx, jsxs: jsx, Fragment: 'Fragment' };
  if (id === 'react')
    return {
      useState: (value) => [value, () => {}],
      useRef: (value) => ({ current: value }),
    };
  if (id === './use-processing-settings')
    return { useProcessingSettings: () => settings };
  if (id === './use-preview') return { usePreview: () => ({}) };
  if (id === './model') return { fieldLabels: {}, footerActionClass: '' };
  if (id === '@heroui/react/toast') return { toast: () => {} };
  if (id === '@heroui/react/alert-dialog') return { AlertDialog: proxy };
  return proxy;
};
vm.runInNewContext(source, {
  require,
  exports,
  requestAnimationFrame: (fn) => frames.push(fn),
  document: {
    querySelector(selector) {
      selected.push(selector);
      return { focus() {} };
    },
  },
});
const tree = exports.reviewEditor({ initial: { watermarkMode: 'image' } });
function walk(value) {
  if (Array.isArray(value)) return value.flatMap(walk);
  if (!value?.props) return [];
  return [value, ...walk(value.props.children)];
}
const nodes = walk(tree);
const save = walk(tree.props.footer).find(
  (node) => node.props['data-testid'] === 'processing-save',
);
const reconcile = nodes.find(
  (node) => node.props['data-testid'] === 'processing-settings-reconcile',
);
const form = nodes.find(
  (node) => typeof node.props.onAssetClear === 'function',
);
assert.equal(save.props.isDisabled, true);
assert.equal(reconcile.props.isDisabled, false);
form.props.onAssetClear();
assert.equal(settings.input.watermarkAssetId, null);
frames.forEach((fn) => fn());
console.log(
  JSON.stringify(
    {
      probe:
        'actual production JSX/callback with isolated hook and document seams; no browser',
      unknown: settings.unknown,
      saveDisabled: save.props.isDisabled,
      reconcileDisabled: reconcile.props.isDisabled,
      requestedFocusSelectors: selected,
    },
    null,
    2,
  ),
);
assert.deepEqual(
  selected,
  ['[data-testid="processing-settings-reconcile"]'],
  'Unknown-save clear must target the enabled reconciliation action',
);
