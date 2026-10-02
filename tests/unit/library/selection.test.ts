import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  useLibrarySelection,
  type LibrarySelection,
} from '../../../src/app/library/use-library-selection';
import type { LibraryItem } from '../../../src/server/library/types';
import { LibrarySelectionMenu } from '../../../src/app/library/library-selection-menu';

function item(id: string): LibraryItem {
  return {
    id,
    displayName: `图片 ${id}`,
    originalName: `${id}.jpg`,
    byteSize: 1024,
    format: 'jpeg',
    width: 640,
    height: 480,
    visibility: 'private',
    processingStatus: 'ready',
    createdAt: '2026-09-30T00:00:00Z',
    storage: { id: 'local', name: '本地存储', enabled: true },
    versions: {
      original: true,
      compressed: false,
      thumbnail: true,
      watermark: false,
    },
    thumbnailUrl: `/i/${id}?type=thumbnail`,
    thumbnailDimensions: { width: 640, height: 480 },
    activeJob: null,
    latestFailedJob: null,
    metadataJob: null,
    processingJob: null,
    trashedAt: null,
    deletionStatus: null,
  };
}

type Step = {
  identity?: string;
  items: LibraryItem[];
  act?: (selection: LibrarySelection) => void;
  check?: (selection: LibrarySelection) => void;
};

// React's render-phase updates let the same mounted hook traverse a sequence
// without a DOM shim or a second state implementation in the test.
function run(steps: Step[]) {
  function Probe() {
    const [index, setIndex] = useState(0);
    const step = steps[index];
    const selection = useLibrarySelection(step.identity ?? 'query', step.items);
    step.check?.(selection);
    step.act?.(selection);
    if (index < steps.length - 1) setIndex(index + 1);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
}

const ids = (selection: LibrarySelection) => [...selection.selected.keys()];

describe('explicit library selection', () => {
  it('adds and removes only the current page while retaining other pages', () => {
    const first = [item('a'), item('b')];
    const second = [item('c'), item('d')];
    run([
      { items: first, act: (selection) => selection.selectCurrent() },
      {
        items: second,
        check: (selection) => {
          expect(ids(selection)).toEqual(['a', 'b']);
          expect(selection.currentCount).toBe(0);
          expect(selection.otherCount).toBe(2);
        },
        act: (selection) => selection.selectCurrent(),
      },
      {
        items: second,
        check: (selection) =>
          expect(ids(selection)).toEqual(['a', 'b', 'c', 'd']),
        act: (selection) => selection.deselectCurrent(),
      },
      {
        items: first,
        check: (selection) => {
          expect(ids(selection)).toEqual(['a', 'b']);
          expect(selection.currentCount).toBe(2);
          expect(selection.otherCount).toBe(0);
        },
      },
    ]);
  });

  it('does not select newly loaded items or remove IDs merely absent from the current page', () => {
    run([
      { items: [item('a')], act: (selection) => selection.selectCurrent() },
      {
        items: [item('a'), item('b')],
        check: (selection) => expect(ids(selection)).toEqual(['a']),
      },
      {
        items: [],
        check: (selection) => {
          expect(ids(selection)).toEqual(['a']);
          expect(selection.otherCount).toBe(1);
        },
      },
    ]);
  });

  it('clears on query identity changes without resurrecting earlier selection', () => {
    run([
      {
        identity: 'first',
        items: [item('a')],
        act: (selection) => selection.toggle(item('a')),
      },
      {
        identity: 'second',
        items: [item('b')],
        check: (selection) => expect(ids(selection)).toEqual([]),
        act: (selection) => selection.toggle(item('b')),
      },
      {
        identity: 'first',
        items: [item('a')],
        check: (selection) => expect(ids(selection)).toEqual([]),
      },
    ]);
  });

  it('replaces a drag snapshot using current records and explicitly retained other-page IDs', () => {
    run([
      { items: [item('a')], act: (selection) => selection.toggle(item('a')) },
      {
        items: [item('b'), item('c')],
        act: (selection) => selection.selectIds(new Set(['a', 'c', 'unknown'])),
      },
      {
        items: [item('b'), item('c')],
        check: (selection) => {
          expect(ids(selection)).toEqual(['a', 'c']);
          expect(selection.currentCount).toBe(1);
          expect(selection.otherCount).toBe(1);
        },
        act: (selection) => selection.selectIds(['b']),
      },
      {
        items: [item('b'), item('c')],
        check: (selection) => expect(ids(selection)).toEqual(['b']),
      },
    ]);
  });

  it('keeps 200+ explicit selections lightweight and allows arbitrary removal and clearing', () => {
    const items = Array.from({ length: 241 }, (_, index) =>
      item(String(index)),
    );
    run([
      { items, act: (selection) => selection.selectCurrent() },
      {
        items,
        check: (selection) => {
          expect(selection.selected.size).toBe(241);
          expect(Object.keys(selection.selected.get('240')!)).toEqual([
            'id',
            'displayName',
            'thumbnailUrl',
            'storage',
          ]);
        },
        act: (selection) => selection.remove('218'),
      },
      {
        items,
        check: (selection) => {
          expect(selection.selected.size).toBe(240);
          expect(selection.selected.has('218')).toBe(false);
          expect(selection.selected.has('217')).toBe(true);
          expect(selection.selected.has('219')).toBe(true);
        },
        act: (selection) => selection.clear(),
      },
      { items, check: (selection) => expect(selection.selected.size).toBe(0) },
    ]);
  });

  it('handles consecutive checkbox updates without dropping an earlier update', () => {
    run([
      {
        items: [item('a'), item('b')],
        act: (selection) => {
          selection.toggle(item('a'));
          selection.toggle(item('b'));
        },
      },
      {
        items: [item('a'), item('b')],
        check: (selection) => expect(ids(selection)).toEqual(['a', 'b']),
        act: (selection) => selection.toggle(item('a')),
      },
      {
        items: [item('a'), item('b')],
        check: (selection) => expect(ids(selection)).toEqual(['b']),
      },
    ]);
  });

  it('reconciles only the checked snapshot, retaining moved and newly selected IDs', () => {
    let snapshot!: Map<
      string,
      import('../../../src/app/library/use-library-selection').SelectedLibraryItem
    >;
    const updated = {
      ...item('a'),
      displayName: '新名称',
      storage: { id: 'local', name: '新存储名', enabled: false },
    };
    run([
      {
        items: [item('a'), item('b')],
        act: (selection) => selection.selectCurrent(),
      },
      {
        items: [item('c')],
        act: (selection) => {
          snapshot = new Map(selection.selected);
          selection.toggle(item('c'));
        },
      },
      {
        items: [],
        act: (selection) => selection.reconcile(snapshot, [updated]),
      },
      {
        items: [],
        check: (selection) => {
          expect(ids(selection)).toEqual(['a', 'c']);
          expect(selection.selected.get('a')).toEqual({
            id: 'a',
            displayName: '新名称',
            thumbnailUrl: '/i/a?type=thumbnail',
            storage: updated.storage,
          });
          expect(selection.currentCount).toBe(0);
          expect(selection.otherCount).toBe(2);
        },
      },
    ]);
  });

  it('ignores a late reconciliation after clearing, reselecting or changing query', () => {
    let snapshot!: Map<
      string,
      import('../../../src/app/library/use-library-selection').SelectedLibraryItem
    >;
    run([
      { items: [item('a')], act: (selection) => selection.selectCurrent() },
      {
        items: [item('a')],
        act: (selection) => {
          snapshot = new Map(selection.selected);
          selection.clear();
          selection.toggle(item('a'));
        },
      },
      { items: [], act: (selection) => selection.reconcile(snapshot, []) },
      {
        items: [],
        check: (selection) => expect(ids(selection)).toEqual(['a']),
      },
      {
        identity: 'new-query',
        items: [item('b')],
        act: (selection) => {
          selection.toggle(item('b'));
          selection.reconcile(snapshot, [item('a')]);
        },
      },
      {
        identity: 'new-query',
        items: [],
        check: (selection) => expect(ids(selection)).toEqual(['b']),
      },
    ]);
  });

  it('renders no selection actions until an explicit selection exists', () => {
    function EmptyMenu() {
      const selection = useLibrarySelection('query', [item('a')]);
      return createElement(LibrarySelectionMenu, {
        selection,
        loadingMode: 'pages',
        disabled: false,
        onOpen: () => {},
      });
    }
    expect(renderToStaticMarkup(createElement(EmptyMenu))).toBe('');
  });

  it('reports current and other page selections and disables actions during a query transition', () => {
    function SelectedMenu() {
      const [selected, setSelected] = useState(false);
      const selection = useLibrarySelection('query', [item('b')]);
      if (!selected) {
        selection.toggle(item('a'));
        selection.toggle(item('b'));
        setSelected(true);
      }
      return createElement(LibrarySelectionMenu, {
        selection,
        loadingMode: 'pages',
        disabled: true,
        onOpen: () => {},
      });
    }
    const html = renderToStaticMarkup(createElement(SelectedMenu));
    expect(html).toContain('共选 2 张：当前页 1 张，其他页 1 张');
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).toContain('aria-label="操作已选 2 张图片"');
    expect(html).not.toContain('<img');
  });
});
