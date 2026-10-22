import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { useImageSizeLinks } from '../../../src/components/library/use-image-size-links';

const state = vi.hoisted(() => ({
  status: 'queued',
  error: null as Error | null,
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({
    data: {
      status: state.status,
      links:
        state.status === 'ready'
          ? { url: 'https://ariso.test/i/one?type=compressed&preset=small' }
          : null,
    },
    isPending: false,
    isFetching: false,
    error: state.error,
    refetch: vi.fn(),
  }),
  useMutation: () => ({
    variables: null,
    error: null,
    isPending: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  }),
}));

it.each(['queued', 'running'])(
  'keeps the version and preset locked between HTTP polls while the size task is %s',
  (status) => {
    state.status = status;
    state.error = null;
    let result!: ReturnType<typeof useImageSizeLinks>;
    function Probe() {
      result = useImageSizeLinks(
        'one',
        'compressed',
        'small',
        'source',
        true,
        vi.fn(),
      );
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    expect(result.pending).toBe(true);
    expect(result.generating).toBe(true);
    expect(result.result?.links).toBeNull();
  },
);

it('offers a read retry when polling fails after a queued result without enabling a stale link', () => {
  state.status = 'queued';
  state.error = new Error('connection lost');
  let result!: ReturnType<typeof useImageSizeLinks>;
  function Probe() {
    result = useImageSizeLinks(
      'one',
      'compressed',
      'small',
      'source',
      true,
      vi.fn(),
    );
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  expect(result.pending).toBe(false);
  expect(result.error).toBe('connection lost');
  expect(result.result?.links).toBeNull();
});
