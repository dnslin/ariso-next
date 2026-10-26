import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Choice } from '../components/ui';

const options = [
  ['public', '公开'],
  ['private', '私有'],
] as const;
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('returns the selected fixed option through the real HeroUI select', async () => {
  const onChange = vi.fn();
  await act(async () =>
    root.render(
      createElement(Choice, {
        label: '可见性',
        options,
        value: 'public',
        onChange,
      }),
    ),
  );
  expect(onChange).not.toHaveBeenCalled();
  const select = container.querySelector('select');
  expect(select).toBeInstanceOf(HTMLSelectElement);
  await act(async () => {
    select!.value = 'private';
    select!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledExactlyOnceWith('private');
});

it('keeps the native selection and trigger disabled without emitting a change', async () => {
  const onChange = vi.fn();
  await act(async () =>
    root.render(
      createElement(Choice, {
        label: '可见性',
        options,
        value: 'private',
        onChange,
        disabled: true,
      }),
    ),
  );
  expect(container.querySelector('select')?.disabled).toBe(true);
  expect(container.querySelector('button')?.disabled).toBe(true);
  await act(async () => container.querySelector('button')!.click());
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

it('does not invent an option value when the native selection is cleared', async () => {
  const onChange = vi.fn();
  await act(async () =>
    root.render(
      createElement(Choice, {
        label: '可见性',
        options,
        value: 'public',
        onChange,
      }),
    ),
  );
  const select = container.querySelector('select');
  expect(select).toBeInstanceOf(HTMLSelectElement);
  await act(async () => {
    select!.value = '';
    select!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(onChange).not.toHaveBeenCalled();
});
