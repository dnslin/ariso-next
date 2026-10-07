import type {
  PublicShareItem,
  PublicShareNeighbors,
  PublicSharePage,
  PublicShareRefresh,
} from '../../server/sharing/public-types';

export interface ShareSessionState {
  status: number;
  page: PublicSharePage | null;
  loading: boolean;
  refreshing: boolean;
  loadError: string;
  refreshError: string;
  cursorInvalid: boolean;
  revision: number;
  revoked: boolean;
  viewer: PublicShareNeighbors | null;
  viewerLoading: boolean;
  viewerError: string;
}

class ShareRequestError extends Error {
  constructor(
    readonly status: number | undefined,
    cause?: unknown,
  ) {
    super(
      status === undefined ? '分享请求未完成' : `分享请求返回 HTTP ${status}`,
      { cause },
    );
  }
}

function withoutName(item: PublicShareItem): PublicShareItem {
  const unnamed = { ...item };
  delete unnamed.displayName;
  return unnamed;
}

function applyNamePolicy(page: PublicSharePage): PublicSharePage {
  return page.showName
    ? page
    : {
        ...page,
        items: page.items.map(withoutName),
        cover: page.cover === null ? null : withoutName(page.cover),
      };
}

function applyViewerNamePolicy(
  viewer: PublicShareNeighbors,
): PublicShareNeighbors {
  return viewer.showName
    ? viewer
    : {
        ...viewer,
        current: viewer.current === null ? null : withoutName(viewer.current),
        previous:
          viewer.previous === null ? null : withoutName(viewer.previous),
        next: viewer.next === null ? null : withoutName(viewer.next),
      };
}

/** One anonymous page's state. No owner query cache or cross-share data is retained. */
export class ShareSession {
  private state: ShareSessionState;
  private readonly listeners = new Set<() => void>();
  private loadRequest: AbortController | null = null;
  private refreshRequest: AbortController | null = null;
  private viewerRequest: AbortController | null = null;
  private viewerTargetId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  // Visibility is supplied by the mounted page; construction does not start I/O.
  private visible: boolean | null = null;
  private stopped = false;

  constructor(
    private readonly token: string,
    initial: { status: number; page: PublicSharePage | null },
    private readonly fetcher: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {
    this.state = {
      ...initial,
      loading: false,
      refreshing: false,
      loadError: '',
      refreshError: '',
      cursorInvalid: false,
      revision: 0,
      revoked: false,
      viewer: null,
      viewerLoading: false,
      viewerError: '',
    };
  }

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private update(patch: Partial<ShareSessionState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private clearTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private cancelLoad() {
    this.loadRequest?.abort();
    this.loadRequest = null;
  }

  private cancelRefresh() {
    this.refreshRequest?.abort();
    this.refreshRequest = null;
  }

  private cancelViewer() {
    this.viewerRequest?.abort();
    this.viewerRequest = null;
  }

  openViewer = async (imageId: string) => {
    const page = this.state.page;
    const current = page?.items.find((item) => item.imageId === imageId);
    if (this.stopped || this.state.status !== 200 || !current?.previewUrl)
      return;
    this.cancelViewer();
    this.cancelRefresh();
    this.update({
      refreshing: false,
      viewer: applyViewerNamePolicy({
        current,
        previous: null,
        next: null,
        showName: page!.showName,
        total: page!.total,
        position: null,
      }),
      viewerError: '',
    });
    this.scheduleRefresh();
    await this.readViewer(imageId);
  };

  navigateViewer = async (direction: 'previous' | 'next') => {
    const target = this.state.viewer?.[direction];
    if (target === null || target === undefined || this.state.viewerLoading)
      return;
    await this.readViewer(target.imageId);
  };

  retryViewer = async () => {
    if (this.viewerTargetId === null || this.state.viewerLoading) return;
    await this.readViewer(this.viewerTargetId);
  };

  closeViewer = () => {
    this.cancelViewer();
    this.viewerTargetId = null;
    this.cancelRefresh();
    this.update({
      viewer: null,
      viewerLoading: false,
      viewerError: '',
      refreshing: false,
    });
    this.scheduleRefresh();
  };

  private async readViewer(imageId: string, background = false) {
    if (
      this.stopped ||
      this.state.status !== 200 ||
      this.state.viewer === null ||
      (background && this.viewerRequest !== null)
    )
      return;
    this.cancelViewer();
    const controller = new AbortController();
    this.viewerRequest = controller;
    if (!background) this.viewerTargetId = imageId;
    if (!background) this.update({ viewerLoading: true, viewerError: '' });
    try {
      const response = await this.read<PublicShareNeighbors>(
        `items?imageId=${encodeURIComponent(imageId)}`,
        {},
        controller,
      );
      if (response === undefined || this.viewerRequest !== controller) return;
      const page = this.state.page!;
      const nameChanged = page.showName !== response.showName;
      const currentViewer = this.state.viewer!;
      if (nameChanged) {
        this.cancelLoad();
        this.cancelRefresh();
        this.update({
          page: applyNamePolicy({ ...page, showName: response.showName }),
          viewer: applyViewerNamePolicy({
            ...currentViewer,
            showName: response.showName,
          }),
          loading: false,
          refreshing: false,
        });
        this.scheduleRefresh();
      }
      if (response.current === null) {
        this.cancelLoad();
        this.cancelRefresh();
        this.update({
          page: {
            ...this.state.page!,
            total: response.total,
            items: this.state.page!.items.filter(
              (item) => item.imageId !== imageId,
            ),
            cover:
              this.state.page!.cover?.imageId === imageId
                ? null
                : this.state.page!.cover!,
          },
          loading: false,
          refreshing: false,
        });
        this.scheduleRefresh();
        const displayedId = currentViewer.current!.imageId;
        if (displayedId !== imageId) {
          await this.readViewer(displayedId);
          return;
        }
        this.closeViewer();
        return;
      }
      const identitiesChanged = (['current', 'previous', 'next'] as const).some(
        (key) => currentViewer[key]?.imageId !== response[key]?.imageId,
      );
      if (identitiesChanged) {
        this.cancelRefresh();
      }
      this.update({
        viewer: applyViewerNamePolicy(response),
        ...(!background ? { viewerError: '' } : {}),
        ...(identitiesChanged ? { refreshing: false } : {}),
      });
      if (identitiesChanged) this.scheduleRefresh();
    } catch (error) {
      if (!(error instanceof ShareRequestError)) throw error;
      if (controller.signal.aborted || this.viewerRequest !== controller)
        return;
      this.update({
        viewerError: this.state.viewerError || '图片读取失败，请重试',
      });
      this.report('分享大图读取失败', error);
    } finally {
      if (this.viewerRequest === controller) {
        this.viewerRequest = null;
        this.update({ viewerLoading: false });
      }
    }
  }

  private async refreshViewer() {
    const current = this.state.viewer?.current;
    if (current) await this.readViewer(current.imageId, true);
  }

  private scheduleRefresh() {
    this.clearTimer();
    if (
      this.visible !== true ||
      this.stopped ||
      this.state.status !== 200 ||
      this.state.page === null
    )
      return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.refresh();
    }, 5000);
  }

  private report(operation: string, error: ShareRequestError) {
    const cause =
      error.cause instanceof Error
        ? {
            name: error.cause.name,
            message: error.cause.message.replaceAll(this.token, '[Redacted]'),
          }
        : error.cause;
    console.error(operation, { status: error.status, cause });
  }

  private async read<T>(
    suffix: string,
    init: RequestInit,
    controller: AbortController,
  ): Promise<T | undefined> {
    let response: Response;
    try {
      response = await this.fetcher(
        `/s/${encodeURIComponent(this.token)}/${suffix}`,
        { ...init, signal: controller.signal, cache: 'no-store' },
      );
    } catch (cause) {
      if (controller.signal.aborted) return undefined;
      throw new ShareRequestError(undefined, cause);
    }
    if (controller.signal.aborted) return undefined;
    if ([401, 404, 410].includes(response.status)) {
      this.setUnavailable(response.status);
      return undefined;
    }
    if (!response.ok) throw new ShareRequestError(response.status);
    let body: T;
    try {
      body = await response.json();
    } catch (cause) {
      if (controller.signal.aborted) return undefined;
      throw new ShareRequestError(response.status, cause);
    }
    return controller.signal.aborted ? undefined : body;
  }

  loadMore = () => this.load(false);
  reload = () => this.load(true);

  private async load(replace: boolean) {
    const cursor = this.state.page?.nextCursor;
    if (
      this.stopped ||
      (!replace &&
        (this.state.status !== 200 ||
          this.state.page === null ||
          this.state.cursorInvalid ||
          !this.state.page.hasMore ||
          cursor === null))
    )
      return;
    if (this.loadRequest !== null && !replace) return;
    if (replace) {
      this.cancelLoad();
      this.cancelRefresh();
      this.clearTimer();
      this.cancelViewer();
      this.viewerTargetId = null;
    }
    const controller = new AbortController();
    this.loadRequest = controller;
    this.update({
      loading: true,
      loadError: '',
      ...(replace
        ? {
            refreshing: false,
            viewer: null,
            viewerLoading: false,
            viewerError: '',
          }
        : {}),
    });
    try {
      const suffix = replace
        ? 'items'
        : `items?cursor=${encodeURIComponent(cursor!)}`;
      const response = await this.read<PublicSharePage>(suffix, {}, controller);
      if (response === undefined || this.loadRequest !== controller) return;
      const previous = this.state.page;
      const merged =
        replace || previous === null
          ? response
          : {
              ...response,
              items: [
                ...new Map(
                  [...previous.items, ...response.items].map((item) => [
                    item.imageId,
                    item,
                  ]),
                ).values(),
              ],
            };
      const changed =
        previous === null ||
        previous.showName !== merged.showName ||
        previous.layout !== merged.layout ||
        previous.items.length !== merged.items.length;
      if (changed) {
        this.cancelRefresh();
        this.cancelViewer();
      }
      this.update({
        status: 200,
        page: applyNamePolicy(merged),
        cursorInvalid: false,
        ...(replace ? { refreshError: '' } : {}),
        revoked: false,
        revision: this.state.revision + Number(replace),
        ...(changed ? { refreshing: false } : {}),
        ...(this.state.viewer && changed
          ? {
              viewer: applyViewerNamePolicy({
                ...this.state.viewer,
                showName: merged.showName,
              }),
              viewerLoading: false,
            }
          : {}),
      });
      if (changed) this.scheduleRefresh();
    } catch (error) {
      if (!(error instanceof ShareRequestError)) throw error;
      if (controller.signal.aborted || this.loadRequest !== controller) return;
      const cursorInvalid = !replace && error.status === 409;
      this.update({
        ...(replace && this.state.page === null ? { status: 500 } : {}),
        loadError: cursorInvalid
          ? '加载位置已失效，请刷新相册'
          : '相册读取失败，请重试',
        ...(cursorInvalid ? { cursorInvalid: true } : {}),
      });
      if (!cursorInvalid) this.report('分享列表读取失败', error);
    } finally {
      if (this.loadRequest === controller) {
        this.loadRequest = null;
        this.update({ loading: false });
        if (replace) this.scheduleRefresh();
      }
    }
  }

  refresh = async () => {
    if (
      this.stopped ||
      this.visible === false ||
      this.state.status !== 200 ||
      this.state.page === null ||
      this.refreshRequest !== null
    )
      return;
    this.clearTimer();
    const controller = new AbortController();
    this.refreshRequest = controller;
    // A check consumes only identities. Never snapshot complete images or page associations.
    const ids = [
      ...new Set([
        ...this.state.page.items.map((item) => item.imageId),
        ...[
          this.state.viewer?.current,
          this.state.viewer?.previous,
          this.state.viewer?.next,
        ].flatMap((item) => (item ? [item.imageId] : [])),
      ]),
    ];
    this.update({ refreshing: true });
    try {
      for (let start = 0; start < Math.max(ids.length, 1); start += 80) {
        const batch = ids.slice(start, start + 80);
        const response = await this.read<PublicShareRefresh>(
          'refresh',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: batch }),
          },
          controller,
        );
        if (response === undefined || this.refreshRequest !== controller)
          return;
        const previous = this.state.page!;
        const requested = new Set(batch);
        const returned = new Map(
          response.items.map((item) => [item.imageId, item]),
        );
        const members = previous.items.flatMap((item) =>
          requested.has(item.imageId)
            ? returned.has(item.imageId)
              ? [returned.get(item.imageId)!]
              : []
            : [item],
        );
        const metadata = response;
        const changed =
          previous.layout !== metadata.layout ||
          previous.showName !== metadata.showName ||
          members.length !== previous.items.length;
        const currentViewer = this.state.viewer;
        const updateItem = (item: PublicShareItem | null) =>
          item && requested.has(item.imageId)
            ? (returned.get(item.imageId) ?? null)
            : item;
        const nextViewer = currentViewer
          ? applyViewerNamePolicy({
              ...currentViewer,
              showName: metadata.showName,
              total: metadata.total,
              current: updateItem(currentViewer.current),
              previous: updateItem(currentViewer.previous),
              next: updateItem(currentViewer.next),
            })
          : null;
        const viewerMembershipChanged =
          currentViewer !== null &&
          (['previous', 'next'] as const).some(
            (key) => currentViewer[key]?.imageId !== nextViewer?.[key]?.imageId,
          );
        const next = applyNamePolicy({
          ...previous,
          ...metadata,
          items: members,
        });
        if (currentViewer && nextViewer?.current === null) {
          this.update({ page: next });
          this.closeViewer();
          return;
        }
        if (changed || viewerMembershipChanged) {
          this.cancelLoad();
          this.cancelViewer();
          this.update({
            page: next,
            viewer: nextViewer,
            loading: false,
            viewerLoading: false,
          });
          await this.refreshViewer();
          return;
        }
        this.update({ page: next, viewer: nextViewer });
      }
      await this.refreshViewer();
      if (this.refreshRequest === controller) this.update({ refreshError: '' });
    } catch (error) {
      if (!(error instanceof ShareRequestError)) throw error;
      if (controller.signal.aborted || this.refreshRequest !== controller)
        return;
      this.update({ refreshError: '相册状态检查失败，请重试' });
      this.report('分享状态检查失败', error);
    } finally {
      if (this.refreshRequest === controller) {
        this.refreshRequest = null;
        this.update({ refreshing: false });
        this.scheduleRefresh();
      }
    }
  };

  setUnavailable = (status: number) => {
    this.cancelLoad();
    this.cancelRefresh();
    this.cancelViewer();
    this.viewerTargetId = null;
    this.clearTimer();
    this.update({
      status,
      page: null,
      loading: false,
      refreshing: false,
      loadError: '',
      refreshError: '',
      cursorInvalid: false,
      viewer: null,
      viewerLoading: false,
      viewerError: '',
      revoked: this.state.page !== null || this.state.revoked,
    });
  };

  setVisible = (visible: boolean) => {
    if (visible && this.visible === true && !this.stopped) return;
    this.visible = visible;
    if (!visible) {
      this.clearTimer();
      this.cancelRefresh();
      this.cancelViewer();
      this.update({ refreshing: false, viewerLoading: false });
      return;
    }
    this.stopped = false;
    void this.refresh();
  };

  stop = () => {
    this.stopped = true;
    this.visible = false;
    this.clearTimer();
    this.cancelLoad();
    this.cancelRefresh();
    this.cancelViewer();
    this.viewerTargetId = null;
    this.update({
      loading: false,
      refreshing: false,
      viewer: null,
      viewerLoading: false,
      viewerError: '',
    });
  };
}
