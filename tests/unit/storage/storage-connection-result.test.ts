import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { StorageConnectionResult } from '../../../src/components/storage/storage-connection-result';
import type { StorageSummary } from '../../../src/components/storage/storage-api';

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return [];
    return [child, ...elements(child.props.children as ReactNode)];
  });
}

it.each([
  { busy: false, working: false },
  { busy: false, working: true },
  { busy: true, working: true },
])(
  'returns through the editor callback without a list link when %j',
  (state) => {
    const onReturn = vi.fn();
    const tree = StorageConnectionResult({
      shell: {
        name: 'Ariso',
        description: '',
        email: 'owner@example.test',
        ownerName: 'Owner',
      },
      storage: {
        id: 'actual-storage-id',
        name: '实际存储',
        type: 's3',
        enabled: false,
        hasAccessKey: true,
        hasSecretKey: true,
        corsStatus: 'untested',
      } as StorageSummary,
      report: null,
      ...state,
      onReturn,
      onTest: vi.fn(),
      onEnable: vi.fn(),
    });
    const header = elements(tree).find((element) => element.type === 'header');
    expect(header).toBeDefined();
    const back = elements(header).find(
      (element) => element.props.onPress === onReturn,
    );
    expect(back).toBeDefined();
    expect(back!.props.href).toBeUndefined();
    (back!.props.onPress as () => void)();
    expect(onReturn).toHaveBeenCalledExactlyOnceWith();
    expect(renderToStaticMarkup(header)).not.toContain(
      'href="/settings/storage"',
    );
  },
);
