import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Link } from '@heroui/react/link';
import { Table } from '@heroui/react/table';
import { Pagination } from '@heroui/react/pagination';
import { Select } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';
import { Label } from '@heroui/react/label';
import { ToggleButton } from '@heroui/react/toggle-button';
import { Modal } from '@heroui/react/modal';
import { CloseButton } from '@heroui/react/close-button';
import { toast } from '@heroui/react/toast';
import {
  ArrowLeft,
  Columns3,
  Copy,
  Eye,
  Folder,
  Grid2X2,
  Link as LinkIcon,
  Settings2,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { AlbumCoverImage } from '../../../src/app/albums/cover-preview';
import { Choices, SettingSwitch } from '../../../src/app/shares/controls';
import {
  ActionIconButton,
  Footer,
  Header,
  SearchInput,
  buttonClass,
  usePrototype,
} from './shared';

type Filters = { q: string; page: number; pageSize: number };
type DisplaySettings = { layout: 'grid' | 'masonry'; showName: boolean };
const names = [
  '秋日散步',
  '山间旅行',
  '森林旅行',
  '海边日记',
  '周末旅行',
  '城市散步',
  '旅行收藏',
  '秋日散步',
];
const albums = Array.from({ length: 120 }, (_, index) => ({
  id: `${(index + 1).toString(16).padStart(8, '0')}-a1b2-4c3d-8e9f-202610130000`,
  name: names[index % names.length],
  description:
    index % 2 ? '路途中记录的风景与日常。' : '随手记录这个季节里喜欢的片刻。',
  imageCount: 24 + (index % 17),
  publicImageCount: 18 + (index % 13),
  cover: {
    status: 'ready' as const,
    displayName: index % 2 ? '山间清晨.jpg' : '林间光影.jpg',
    thumbnailUrl: index % 2 ? '/samples/mountain.jpg' : '/samples/forest.jpg',
  },
  hasPassword: index % 3 === 0,
  enabled: index % 7 !== 0,
}));
type DemoAlbum = (typeof albums)[number];
const sourcePositions = new Map<string, { top: number; focusId: string }>();
const displaySettings = new Map<string, DisplaySettings>();
const unknownSaves = new Set<string>();
const pendingReturn = new Map<'href', string>();

function businessHref(raw: string) {
  const url = new URL(raw, 'http://prototype.local');
  ['frame', 'mode', 'scenario'].forEach((key) => url.searchParams.delete(key));
  return url.pathname + (url.search ? url.search : '');
}

function listHref(kind: 'albums' | 'shares', filters: Filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  return `/${kind}?${params}`;
}

function readFilters(raw: string): Filters {
  const params = new URL(raw, 'http://prototype.local').searchParams;
  return {
    q: params.get('q') ?? '',
    page: Math.max(1, Number(params.get('page')) || 1),
    pageSize: [20, 40, 80].includes(Number(params.get('pageSize')))
      ? Number(params.get('pageSize'))
      : 40,
  };
}

function rememberSource(href: string, focusId: string) {
  sourcePositions.set(businessHref(href), {
    top:
      document.querySelector<HTMLElement>('#main-content')?.scrollTop ??
      document.querySelector('main')?.scrollTop ??
      0,
    focusId,
  });
}

function RestorePosition({ href }: { href: string }) {
  useLayoutEffect(() => {
    const target = businessHref(href);
    if (pendingReturn.get('href') !== target) return;
    const position = sourcePositions.get(target);
    pendingReturn.delete('href');
    if (!position) return;
    const frame = requestAnimationFrame(() => {
      const main =
        document.querySelector<HTMLElement>('#main-content') ??
        document.querySelector<HTMLElement>('main');
      main?.scrollTo({ top: position.top });
      document.getElementById(position.focusId)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [href]);
  return null;
}

function ReadFeedback({
  busy,
  error,
  retry,
}: {
  busy: boolean;
  error: boolean;
  retry: () => void;
}) {
  return busy ? (
    <p role="status" className="text-sm text-muted">
      正在更新列表，保留上次内容…
    </p>
  ) : error ? (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/35 p-4 text-sm"
    >
      <div className="grid gap-1">
        <p>列表更新失败</p>
        <p className="text-muted">
          搜索条件已保留，当前显示上次成功读取的内容。
        </p>
      </div>
      <Button variant="outline" className={buttonClass} onPress={retry}>
        重新加载
      </Button>
    </div>
  ) : null;
}

function ListPager({
  kind,
  requested,
  displayed,
  total,
  busy,
  change,
}: {
  kind: 'albums' | 'shares';
  requested: Filters;
  displayed: Filters;
  total: number;
  busy: boolean;
  change: (filters: Filters) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / displayed.pageSize));
  return (
    <Footer>
      <div className="grid w-full gap-2 md:grid-cols-[1fr_auto] md:items-center">
        <p role="status" className="text-[13px] text-muted">
          共 {total} {kind === 'albums' ? '本相册' : '项分享'}
          {displayed.q ? ` · 搜索“${displayed.q}”` : ''}
        </p>
        <div className="flex min-w-0 items-center gap-2">
          <Select
            aria-label={kind === 'albums' ? '每页相册数' : '每页分享数'}
            value={String(requested.pageSize)}
            onChange={(value) => {
              if (value)
                change({ ...requested, pageSize: Number(value), page: 1 });
            }}
            className="w-28 shrink-0"
          >
            <Select.Trigger className="h-11 rounded-lg border border-border bg-background font-normal">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {[20, 40, 80].map((size) => (
                  <ListBox.Item
                    key={size}
                    id={String(size)}
                    textValue={`${size} 项 / 页`}
                    className="min-h-11"
                  >
                    {size} 项 / 页<ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <Pagination
            aria-label={kind === 'albums' ? '相册分页' : '分享分页'}
            className="min-w-0 flex-1"
          >
            <Pagination.Content className="w-full gap-2">
              <Pagination.Item className="flex-1">
                <Pagination.Previous
                  className="h-11 w-full min-w-0 rounded-lg border border-border px-3 font-normal"
                  isDisabled={requested.page <= 1 || busy}
                  onPress={() =>
                    change({ ...requested, page: requested.page - 1 })
                  }
                >
                  上一页
                </Pagination.Previous>
              </Pagination.Item>
              <Pagination.Item>
                <Pagination.Summary className="text-xs">
                  {displayed.page}/{pages}
                </Pagination.Summary>
              </Pagination.Item>
              <Pagination.Item className="flex-1">
                <Pagination.Next
                  className="h-11 w-full min-w-0 rounded-lg border border-border px-3 font-normal"
                  isDisabled={requested.page >= pages || busy}
                  onPress={() =>
                    change({ ...requested, page: requested.page + 1 })
                  }
                >
                  下一页
                </Pagination.Next>
              </Pagination.Item>
            </Pagination.Content>
          </Pagination>
        </div>
      </div>
    </Footer>
  );
}

function CollectionList({ kind }: { kind: 'albums' | 'shares' }) {
  const { href, navigate, mode, scenario } = usePrototype();
  const [beforeFilters, setBeforeFilters] = useState<Filters>({
    q: '',
    page: 1,
    pageSize: 40,
  });
  const requested = mode === 'after' ? readFilters(href) : beforeFilters;
  const requestedKey = JSON.stringify(requested);
  const requestKey = `${scenario}:${requestedKey}`;
  const [retryKey, setRetryKey] = useState<string | null>(null);
  const attemptKey = `${requestKey}${retryKey === requestKey ? ':retry' : ''}`;
  const [result, setResult] = useState({
    key: scenario === 'normal' ? attemptKey : '',
    filters: requested,
    failed: false,
  });
  const displayed = scenario === 'normal' ? requested : result.filters;
  const busy = scenario !== 'normal' && result.key !== attemptKey;
  const error = !busy && scenario !== 'normal' && result.failed;
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        const failed =
          (scenario === 'error' || scenario === 'unknown') &&
          retryKey !== requestKey;
        setResult((previous) => ({
          key: attemptKey,
          filters: failed ? previous.filters : JSON.parse(requestedKey),
          failed,
        }));
      },
      scenario === 'normal' ? 0 : scenario === 'slow' ? 1400 : 650,
    );
    return () => window.clearTimeout(timer);
  }, [requestedKey, scenario, retryKey, requestKey, attemptKey]);
  function change(next: Filters) {
    if (mode === 'after') navigate(listHref(kind, next));
    else setBeforeFilters(next);
  }
  const filtered = albums.filter((album) =>
    album.name.includes(displayed.q.trim()),
  );
  const visible = filtered.slice(
    (displayed.page - 1) * displayed.pageSize,
    displayed.page * displayed.pageSize,
  );
  function open(album: DemoAlbum, share: boolean, sourceId?: string) {
    const focusId =
      sourceId ?? `${share ? 'share-settings' : 'album-open'}-${album.id}`;
    rememberSource(href, focusId);
    const returnTo =
      mode === 'after'
        ? `?returnTo=${encodeURIComponent(businessHref(href))}`
        : share && kind === 'albums'
          ? '?from=album'
          : '';
    navigate(`/${share ? 'shares' : 'albums'}/${album.id}${returnTo}`);
  }
  return (
    <section className="grid min-w-0 gap-4">
      <RestorePosition href={href} />
      <Header title={kind === 'albums' ? '相册' : '分享'} />
      <div className="flex w-full gap-2 md:max-w-120">
        <SearchInput
          label={kind === 'albums' ? '搜索相册' : '搜索分享相册'}
          value={requested.q}
          onChange={(q) => change({ ...requested, q, page: 1 })}
          placeholder={kind === 'albums' ? '搜索相册…' : '搜索分享相册…'}
        />
      </div>
      <ReadFeedback
        busy={busy}
        error={error}
        retry={() => setRetryKey(requestKey)}
      />
      {kind === 'albums' ? (
        <div
          aria-busy={busy}
          data-testid="prototype-albums-list"
          className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fill,minmax(300px,365px))]"
        >
          {visible.map((album) => (
            <article
              key={album.id}
              className="relative min-w-0 rounded-[20px] border border-border bg-surface"
            >
              <Link
                id={`album-open-${album.id}`}
                href={`/albums/${album.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  open(album, false);
                }}
                className="flex w-full min-w-0 flex-col items-stretch gap-3 rounded-[20px] p-4 text-foreground no-underline"
              >
                <span className="flex aspect-[333/184] w-full items-center justify-center overflow-hidden rounded-xl bg-default">
                  <AlbumCoverImage cover={album.cover} />
                </span>
                <span className="pr-11 text-base font-medium [overflow-wrap:anywhere]">
                  {album.name}
                </span>
                <span className="text-xs font-normal text-muted">
                  {album.imageCount} 张图片 · #{album.id.slice(0, 8)}
                </span>
              </Link>
              <ActionIconButton
                id={`share-settings-${album.id}`}
                label={`分享设置：${album.name} #${album.id.slice(0, 8)}`}
                variant="ghost"
                className="absolute right-3 bottom-8 bg-surface"
                onPress={() => open(album, true)}
              >
                <Share2 size={18} aria-hidden />
              </ActionIconButton>
            </article>
          ))}
        </div>
      ) : visible.length ? (
        <SharesTable
          items={visible}
          total={filtered.length}
          busy={busy}
          open={(album, sourceId) => open(album, true, sourceId)}
        />
      ) : null}
      {!visible.length ? (
        <div className="grid min-h-80 content-center justify-items-center gap-4 text-center">
          <Folder size={36} aria-hidden />
          <h2 className="text-xl">
            {requested.q
              ? kind === 'albums'
                ? '未找到相册'
                : '没有找到分享相册'
              : '本页已无记录'}
          </h2>
          <Button
            variant="outline"
            className={buttonClass}
            onPress={() =>
              change({ q: '', page: 1, pageSize: requested.pageSize })
            }
          >
            {requested.q ? '清除搜索' : '返回第一页'}
          </Button>
        </div>
      ) : null}
      <ListPager
        kind={kind}
        requested={requested}
        displayed={displayed}
        total={filtered.length}
        busy={busy}
        change={change}
      />
    </section>
  );
}

function SharesTable({
  items,
  total,
  busy,
  open,
}: {
  items: DemoAlbum[];
  total: number;
  busy: boolean;
  open: (album: DemoAlbum, sourceId: string) => void;
}) {
  const identity = (album: DemoAlbum) => (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-default">
        <AlbumCoverImage cover={album.cover} />
      </div>
      <div className="grid min-w-0 gap-1">
        <p className="text-sm [overflow-wrap:anywhere]">{album.name}</p>
        <p className="text-xs text-muted">
          {album.publicImageCount} 张公开图片 · #{album.id.slice(0, 8)}
        </p>
      </div>
    </div>
  );
  const access = (album: DemoAlbum) => (
    <p className="text-xs leading-normal md:text-[13px]">
      {album.hasPassword ? '密码保护' : '无密码'} · 永久有效
    </p>
  );
  const state = (album: DemoAlbum) => (
    <p className="text-xs text-muted md:text-[13px]">
      {album.enabled ? '已启用' : '已关闭'}
    </p>
  );
  const action = (album: DemoAlbum, suffix = '') => (
    <ActionIconButton
      id={`share-settings-${album.id}${suffix}`}
      label={`分享设置：${album.name} #${album.id.slice(0, 8)}`}
      variant="ghost"
      onPress={() => open(album, `share-settings-${album.id}${suffix}`)}
    >
      <Settings2 size={18} aria-hidden />
    </ActionIconButton>
  );
  return (
    <Card
      aria-busy={busy}
      className="min-w-0 gap-0 rounded-[20px] border border-border bg-surface px-4 py-5 shadow-none xl:p-6"
    >
      <Card.Title className="text-lg font-medium leading-normal">
        分享 · {total} 项
      </Card.Title>
      <Table className="hidden rounded-none border-0 bg-transparent p-0 shadow-none md:block">
        <Table.Content
          aria-label="分享相册列表"
          className="w-full table-fixed border-collapse"
        >
          <Table.Header className="border-0 bg-transparent [&_th]:after:hidden">
            <Table.Column
              isRowHeader
              className="h-13 w-[36%] rounded-none border-0 bg-transparent p-0 text-xs font-normal text-foreground"
            >
              分享相册
            </Table.Column>
            <Table.Column className="h-13 w-[28%] border-0 bg-transparent p-0 text-xs font-normal text-foreground">
              访问设置
            </Table.Column>
            <Table.Column className="h-13 w-[18%] border-0 bg-transparent p-0 text-xs font-normal text-foreground">
              状态
            </Table.Column>
            <Table.Column className="h-13 w-[18%] border-0 bg-transparent p-0 text-xs font-normal text-foreground">
              操作
            </Table.Column>
          </Table.Header>
          <Table.Body items={items} dependencies={[busy]}>
            {(album) => (
              <Table.Row
                id={album.id}
                className="h-22 border-b border-border bg-transparent"
              >
                <Table.Cell className="border-0 p-0 pr-4">
                  {identity(album)}
                </Table.Cell>
                <Table.Cell className="border-0 p-0 pr-4">
                  {access(album)}
                </Table.Cell>
                <Table.Cell className="border-0 p-0">{state(album)}</Table.Cell>
                <Table.Cell className="border-0 p-0">
                  {action(album)}
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table.Content>
      </Table>
      <ul aria-label="分享相册列表" className="md:hidden">
        {items.map((album) => (
          <li
            key={album.id}
            className="flex items-center gap-2 border-b border-border py-4"
          >
            <div className="grid min-w-0 flex-1 gap-2">
              {identity(album)}
              {access(album)}
            </div>
            <div className="grid w-20 shrink-0 justify-items-center gap-2">
              {state(album)}
              {action(album, '-mobile')}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AlbumDetail({ album }: { album: DemoAlbum }) {
  const { mode, href, navigate } = usePrototype();
  const returnTo =
    mode === 'after'
      ? (new URL(href, 'http://prototype.local').searchParams.get('returnTo') ??
        '/albums')
      : '/albums';
  const goBack = () => {
    if (mode === 'after') pendingReturn.set('href', businessHref(returnTo));
    navigate(returnTo);
  };
  const openShare = () => {
    rememberSource(href, 'detail-share-settings');
    navigate(
      `/shares/${album.id}${mode === 'after' ? `?returnTo=${encodeURIComponent(businessHref(href))}` : '?from=album'}`,
    );
  };
  return (
    <section className="grid min-w-0 gap-4">
      <RestorePosition href={href} />
      <Header title={album.name} back={goBack} />
      <p className="text-sm text-muted">
        {album.imageCount} 张图片 · {album.publicImageCount} 张公开 · #
        {album.id.slice(0, 8)}
      </p>
      <p className="text-sm">{album.description}</p>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          自动封面 · {album.cover.displayName}
        </p>
        <ActionIconButton
          id="detail-share-settings"
          label="分享设置"
          onPress={openShare}
        >
          <Share2 size={18} aria-hidden />
        </ActionIconButton>
      </div>
      <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: album.imageCount }, (_, index) => (
          <figure
            key={index}
            className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface"
          >
            {/* 本地原型静态样本由独立预览服务直接提供，不经过产品图片优化。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={index % 2 ? '/samples/mountain.jpg' : '/samples/forest.jpg'}
              alt={index % 2 ? '山间清晨' : '林间光影'}
              className={`w-full object-cover ${index % 3 ? 'aspect-[4/3]' : 'aspect-square'}`}
              loading="lazy"
            />
            <figcaption className="p-3 text-xs text-muted">
              {index % 2 ? '山间清晨' : '林间光影'}{' '}
              {String(index + 1).padStart(2, '0')}.jpg
            </figcaption>
          </figure>
        ))}
      </div>
      <Footer>
        <p className="text-[13px] text-muted">共 {album.imageCount} 张图片</p>
      </Footer>
    </section>
  );
}

function ShareSettings({ album }: { album: DemoAlbum }) {
  const { href, navigate, mode, scenario } = usePrototype();
  const params = new URL(href, 'http://prototype.local').searchParams;
  const returnTo =
    mode === 'after'
      ? (params.get('returnTo') ?? '/shares')
      : params.get('from') === 'album'
        ? `/albums/${album.id}`
        : '/shares';
  const initial = displaySettings.get(album.id) ?? {
    layout: 'grid' as const,
    showName: true,
  };
  const [saved, setSaved] = useState<DisplaySettings>(initial);
  const [draft, setDraft] = useState<DisplaySettings>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState(unknownSaves.has(album.id));
  const [discard, setDiscard] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const dirty =
    draft.layout !== saved.layout || draft.showName !== saved.showName;
  const leave = () => {
    if (mode === 'after') pendingReturn.set('href', businessHref(returnTo));
    navigate(returnTo);
  };
  async function save() {
    if (busy || unknown || !dirty) return;
    const target = { ...draft };
    setBusy(true);
    setError('');
    await new Promise((resolve) =>
      window.setTimeout(resolve, scenario === 'slow' ? 1600 : 450),
    );
    if (!alive.current) return;
    setBusy(false);
    if (scenario === 'error') {
      setError('展示设置保存失败，修改已保留，请重试。');
      return;
    }
    displaySettings.set(album.id, target);
    if (scenario === 'unknown') {
      unknownSaves.add(album.id);
      setUnknown(true);
      return;
    }
    setSaved(target);
    toast('展示设置已保存', { variant: 'default' });
  }
  async function check() {
    setBusy(true);
    setError('');
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    if (!alive.current) return;
    const current = displaySettings.get(album.id) ?? saved;
    setSaved(current);
    setDraft(current);
    setUnknown(false);
    unknownSaves.delete(album.id);
    setBusy(false);
    toast('已核对当前展示设置', { variant: 'default' });
  }
  const backLabel = returnTo.startsWith('/shares')
    ? '返回分享列表'
    : /^\/albums\//.test(returnTo)
      ? '返回相册'
      : '返回相册列表';
  return (
    <section className="grid min-w-0 gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h1 className="text-[28px] font-medium leading-normal md:text-[30px]">
          分享设置
        </h1>
        <ActionIconButton
          label={backLabel}
          variant="outline"
          isDisabled={busy}
          onPress={() => (dirty && !unknown ? setDiscard(true) : leave())}
        >
          <ArrowLeft size={18} aria-hidden />
        </ActionIconButton>
        <p className="col-span-2 text-sm text-muted">
          {album.name} · {album.publicImageCount} 张公开图片 · #
          {album.id.slice(0, 8)}
        </p>
      </div>
      <Card className="gap-0 rounded-2xl border border-border bg-surface p-0 shadow-none">
        <Card.Header className="flex flex-row items-center justify-between gap-3 p-4 pb-2 md:px-6 md:pt-5">
          <div className="flex items-center gap-2">
            <LinkIcon size={20} aria-hidden />
            <Card.Title className="text-base font-medium">分享地址</Card.Title>
          </div>
          <span className="rounded-lg bg-default px-2.5 py-1 text-xs">
            {album.enabled ? '分享中' : '已停用'}
          </span>
        </Card.Header>
        <Card.Content className="px-4 pb-4 md:px-6 md:pb-5">
          <div className="flex min-w-0 items-start gap-3">
            <p className="min-w-0 select-text py-2.5 text-sm leading-6 [overflow-wrap:anywhere]">
              https://ariso.example/s/{album.id.slice(0, 8)}
            </p>
            <ActionIconButton
              label="复制分享地址"
              variant="ghost"
              onPress={() => {
                void navigator.clipboard
                  .writeText(`https://ariso.example/s/${album.id.slice(0, 8)}`)
                  .then(() => toast('地址已复制', { variant: 'default' }))
                  .catch(() =>
                    toast('复制失败，请选择地址手动复制', {
                      variant: 'default',
                    }),
                  );
              }}
            >
              <Copy size={18} aria-hidden />
            </ActionIconButton>
          </div>
          {unknown ? (
            <div
              role="status"
              className="mt-3 grid gap-3 border-t border-border pt-4 text-sm"
            >
              <p>保存结果待确认</p>
              <p className="text-muted">
                请求已发出，暂未收到结果。先核对当前设置再继续保存。
              </p>
              <Button
                variant="outline"
                className={`${buttonClass} w-fit`}
                isDisabled={busy}
                onPress={() => void check()}
              >
                {busy ? '正在核对…' : '核对当前设置'}
              </Button>
            </div>
          ) : null}
        </Card.Content>
      </Card>
      <div className="grid items-start gap-4 md:grid-cols-2 md:gap-6">
        <SettingsCard
          title="访问设置"
          icon={<ShieldCheck size={20} aria-hidden />}
        >
          <div className="grid gap-4 py-2">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-4 text-sm">
              <span>访问密码</span>
              <span className="text-muted">
                {album.hasPassword ? '已设置' : '未设置'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>有效期</span>
              <span className="text-muted">永久有效</span>
            </div>
          </div>
        </SettingsCard>
        <Card className="gap-0 rounded-2xl border border-border bg-surface p-0 shadow-none">
          <Card.Header className="flex flex-row items-center gap-2 p-4 md:p-6 md:pb-5">
            <Eye size={20} aria-hidden />
            <Card.Title className="text-base font-medium">访客展示</Card.Title>
          </Card.Header>
          <Card.Content className="grid gap-5 px-4 pb-4 md:px-6 md:pb-5">
            <div className="grid gap-2">
              <Label id="prototype-share-layout-label" className="text-sm">
                图片布局
              </Label>
              <Choices
                label="prototype-share-layout-label"
                value={draft.layout}
                onChange={(layout) =>
                  setDraft({
                    ...draft,
                    layout: layout as DisplaySettings['layout'],
                  })
                }
                disabled={busy || unknown}
              >
                <ToggleButton
                  id="grid"
                  className="h-12 flex-1 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                >
                  <Grid2X2 size={18} aria-hidden />
                  网格
                </ToggleButton>
                <ToggleButton
                  id="masonry"
                  className="h-12 flex-1 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                >
                  <Columns3 size={18} aria-hidden />
                  瀑布流
                </ToggleButton>
              </Choices>
            </div>
            <SettingSwitch
              label="显示图片名称"
              selected={draft.showName}
              disabled={busy || unknown}
              onChange={(showName) => setDraft({ ...draft, showName })}
            />
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </Card.Content>
          <Card.Footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 md:px-6">
            <p className="text-xs text-muted">
              {unknown ? '结果待确认' : dirty ? '未保存' : '已保存'}
            </p>
            <Button
              aria-label="保存访客展示"
              className={buttonClass}
              isDisabled={busy || unknown || !dirty}
              onPress={() => void save()}
            >
              {busy && !unknown ? '正在保存…' : '保存'}
            </Button>
          </Card.Footer>
        </Card>
      </div>
      <Modal isOpen={discard} onOpenChange={setDiscard}>
        <Modal.Backdrop>
          <Modal.Container placement="center" className="p-4">
            <Modal.Dialog className="w-full max-w-120 gap-4 rounded-xl border border-border bg-surface p-6">
              <Modal.Header className="flex flex-row items-center justify-between gap-3">
                <Modal.Heading className="text-xl font-medium">
                  放弃未保存修改
                </Modal.Heading>
                <CloseButton
                  aria-label="关闭"
                  className="size-11 rounded-lg"
                  onPress={() => setDiscard(false)}
                />
              </Modal.Header>
              <Modal.Body className="m-0 p-0 text-sm">
                离开后，本页未保存的修改将丢弃。
              </Modal.Body>
              <Modal.Footer className="flex gap-3">
                <Button
                  variant="outline"
                  className={buttonClass}
                  onPress={() => setDiscard(false)}
                >
                  继续编辑
                </Button>
                <Button className={buttonClass} onPress={leave}>
                  放弃修改并离开
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </section>
  );
}

function SettingsCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 rounded-2xl border border-border bg-surface p-0 shadow-none">
      <Card.Header className="flex flex-row items-center gap-2 p-4 md:p-6 md:pb-3">
        {icon}
        <Card.Title className="text-base font-medium">{title}</Card.Title>
      </Card.Header>
      <Card.Content className="px-4 pb-4 md:px-6 md:pb-5">
        {children}
      </Card.Content>
    </Card>
  );
}

export function CollectionsDemo() {
  const { href, mode } = usePrototype();
  useEffect(() => {
    if (mode !== 'after') return;
    const restoreKnownSource = () => {
      const target = businessHref(location.pathname + location.search);
      if (sourcePositions.has(target)) pendingReturn.set('href', target);
    };
    // 在 Root 的路由订阅更新前记录来源，兼容浏览器后退与页内返回。
    window.addEventListener('popstate', restoreKnownSource, true);
    return () =>
      window.removeEventListener('popstate', restoreKnownSource, true);
  }, [mode]);
  const path = new URL(href, 'http://prototype.local').pathname;
  const match = path.match(/^\/(albums|shares)\/([^/]+)$/);
  if (match) {
    const album = albums.find((item) => item.id === match[2]) ?? albums[0];
    return match[1] === 'albums' ? (
      <AlbumDetail key={`${mode}-${album.id}`} album={album} />
    ) : (
      <ShareSettings key={`${mode}-${album.id}`} album={album} />
    );
  }
  return (
    <CollectionList
      key={`${mode}-${path}`}
      kind={path.startsWith('/shares') ? 'shares' : 'albums'}
    />
  );
}
