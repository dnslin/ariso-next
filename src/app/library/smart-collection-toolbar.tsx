'use client';

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dropdown,
  Form,
  Header,
  Input,
  Label,
  Modal,
  Separator,
  TextField,
  toast,
} from '@heroui/react';
import {
  Bookmark,
  Check,
  ChevronDown,
  Images,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { LibraryFilters } from '../../server/library/query-schema';
import {
  smartRulesFromFilters,
  type SmartCollection,
} from '../../server/library/smart-rules';
import {
  notifyLibraryChanged,
  subscribeLibraryChanges,
} from '../../components/library/library-changes';
import type { LibraryQueryPatch } from './query-state';
import { ScreenshotTemplateDialog } from './screenshot-template-dialog';
import {
  SmartCollectionRequestError,
  smartCollectionRequest,
} from './smart-collection-client';
import { smartCollectionTemplate } from './smart-collection-templates';

export type SmartCollectionToolbarHandle = { refresh: () => Promise<void> };

export function SmartCollectionToolbar({
  filters,
  initialCollection,
  client,
  onApply,
  onSessionExpired,
  ref,
  onReplaceQuery,
  getQueryRevision,
}: {
  filters: LibraryFilters;
  initialCollection?: SmartCollection;
  client: QueryClient;
  onApply: (patch: LibraryQueryPatch) => Promise<unknown>;
  onSessionExpired: () => void;
  ref?: Ref<SmartCollectionToolbarHandle>;
  onReplaceQuery: (query: string, expectedChange?: number) => Promise<boolean>;
  getQueryRevision: () => number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collection, setCollection] = useState(initialCollection);
  const [mode, setMode] = useState<'save' | 'rename' | 'delete' | null>(null);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState('');
  const [destination, setDestination] = useState<string | null>(null);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [collectionMissing, setCollectionMissing] = useState(false);
  const inFlight = useRef(false);
  const rules = smartRulesFromFilters(filters);
  const dirty =
    !!collection && JSON.stringify(rules) !== JSON.stringify(collection.rules);
  async function reloadDefinition() {
    if (!collection || inFlight.current) return;
    const revision = getQueryRevision();
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const result = await smartCollectionRequest<{
        collection: SmartCollection;
        query: string;
      }>(`/api/library/collections/${encodeURIComponent(collection.id)}`);
      if (!(await onReplaceQuery(result.query, revision))) {
        setConfirmRefresh(true);
        return;
      }
      setCollection(result.collection);
      setConfirmRefresh(false);
      setCollectionMissing(false);
      await client.invalidateQueries({ queryKey: ['smart-collections'] });
    } catch (cause) {
      if (cause instanceof SmartCollectionRequestError && cause.status === 404)
        setCollectionMissing(true);
      failed(cause);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  const list = useQuery(
    {
      queryKey: ['smart-collections'],
      queryFn: () =>
        smartCollectionRequest<{ items: SmartCollection[] }>(
          '/api/library/collections',
        ),
      retry: false,
      staleTime: 0,
    },
    client,
  );
  useEffect(
    () =>
      subscribeLibraryChanges(() => {
        void client.invalidateQueries({ queryKey: ['smart-collections'] });
      }),
    [client],
  );
  useEffect(() => {
    if (
      list.error instanceof SmartCollectionRequestError &&
      list.error.status === 401
    )
      onSessionExpired();
  }, [list.error, onSessionExpired]);
  useEffect(() => {
    if (!dirty) return;
    const click = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.origin !== location.origin ||
        link.target === '_blank' ||
        event.metaKey ||
        event.ctrlKey ||
        link.href === location.href
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setDestination(`${link.pathname}${link.search}`);
    };
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    document.addEventListener('click', click, true);
    window.addEventListener('beforeunload', unload);
    return () => {
      document.removeEventListener('click', click, true);
      window.removeEventListener('beforeunload', unload);
    };
  }, [dirty]);
  function navigate(href: string) {
    if (href === pathname) return;
    if (dirty) setDestination(href);
    else router.push(href);
  }
  function open(next: typeof mode) {
    setName(next === 'save' ? '' : (collection?.name ?? ''));
    setError('');
    setUnknown(false);
    setMode(next);
  }
  function failed(cause: unknown) {
    if (cause instanceof SmartCollectionRequestError && cause.status === 401)
      onSessionExpired();
    setUnknown(
      cause instanceof SmartCollectionRequestError && cause.status === 0,
    );
    setError(cause instanceof Error ? cause.message : String(cause));
  }
  async function save(updateRules = false) {
    if (inFlight.current) return;
    if (!updateRules && mode !== 'delete' && !name.trim()) {
      setError('请输入集合名称');
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const path =
        collection && (updateRules || mode !== 'save')
          ? `/api/library/collections/${encodeURIComponent(collection.id)}`
          : '/api/library/collections';
      if (mode === 'delete' && !updateRules) {
        await smartCollectionRequest(path, { method: 'DELETE' });
        notifyLibraryChanged();
        router.push('/library');
        toast.success('集合已删除，图片已保留');
      } else {
        const body = updateRules
          ? { rules }
          : mode === 'rename'
            ? { name }
            : { name, rules };
        const result = await smartCollectionRequest<{
          collection: SmartCollection;
        }>(path, {
          method: path.endsWith('/collections') ? 'POST' : 'PATCH',
          body: JSON.stringify(body),
        });
        notifyLibraryChanged();
        if (mode === 'save' && !updateRules)
          router.push(`/library/collections/${result.collection.id}`);
        else setCollection(result.collection);
        toast.success(
          updateRules
            ? '集合条件已更新'
            : mode === 'rename'
              ? '集合已重命名'
              : '智能集合已保存',
        );
      }
      setMode(null);
      setUnknown(false);
      await client.invalidateQueries({ queryKey: ['smart-collections'] });
    } catch (cause) {
      failed(cause);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  async function template(kind: string) {
    if (kind === 'screenshot') {
      setScreenshotOpen(true);
      return;
    }
    await onApply(
      smartCollectionTemplate(kind === 'untagged' ? 'untagged' : 'large'),
    );
  }
  useImperativeHandle(ref, () => ({
    refresh: async () => {
      if (dirty) {
        setConfirmRefresh(true);
        return;
      }
      await reloadDefinition();
    },
  }));
  const missing =
    collectionMissing ||
    (collection &&
      list.data &&
      !list.data.items.some((item) => item.id === collection.id));
  return (
    <div className="grid gap-3" data-testid="smart-collection-toolbar">
      <div className="flex flex-wrap items-center gap-3">
        <Dropdown>
          <Button
            variant="secondary"
            className="min-h-12 max-w-full gap-3 rounded-lg text-foreground"
            aria-label={`切换集合：${collection?.name ?? '全部图片'}`}
          >
            <Bookmark size={17} />
            <span className="truncate">{collection?.name ?? '全部图片'}</span>
            <ChevronDown size={16} />
          </Button>
          <Dropdown.Popover className="w-[min(340px,calc(100vw-32px))]">
            <Dropdown.Menu
              aria-label="智能集合"
              onAction={(key) => {
                const value = String(key);
                if (value === 'all') navigate('/library');
                else if (value.startsWith('template-'))
                  void template(value.slice(9));
                else navigate(`/library/collections/${value}`);
              }}
            >
              <Dropdown.Item id="all" textValue="全部图片">
                <Images size={16} />
                <Label>全部图片</Label>
              </Dropdown.Item>
              <Separator />
              <Dropdown.Section>
                <Header className="px-3 py-2 text-xs text-muted">
                  已保存的集合
                </Header>
                {(list.data?.items ?? []).map((item) => (
                  <Dropdown.Item
                    key={item.id}
                    id={item.id}
                    textValue={item.name}
                  >
                    <Bookmark size={16} />
                    <Label>{item.name}</Label>
                    {item.id === collection?.id && (
                      <Check size={15} className="ml-auto" />
                    )}
                  </Dropdown.Item>
                ))}
              </Dropdown.Section>
              <Separator />
              <Dropdown.Section>
                <Header className="px-3 py-2 text-xs text-muted">
                  从条件模板开始
                </Header>
                {[
                  ['untagged', '没有标签的图片'],
                  ['screenshot', '最近上传的截图'],
                  ['large', '超过 10 MB 的原图'],
                ].map(([id, label]) => (
                  <Dropdown.Item
                    key={id}
                    id={`template-${id}`}
                    textValue={`模板：${label}`}
                  >
                    <Label>{label}</Label>
                  </Dropdown.Item>
                ))}
              </Dropdown.Section>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        {collection && (
          <Dropdown>
            <Button
              isIconOnly
              variant="ghost"
              className="size-11"
              aria-label="集合操作"
            >
              <MoreHorizontal size={20} />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                aria-label="集合操作"
                onAction={(key) => open(key === 'rename' ? 'rename' : 'delete')}
              >
                <Dropdown.Item id="rename" textValue="重命名">
                  <Pencil size={16} />
                  <Label>重命名</Label>
                </Dropdown.Item>
                <Dropdown.Item
                  id="delete"
                  textValue="删除集合"
                  variant="danger"
                >
                  <Trash2 size={16} />
                  <Label>删除集合</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirty ? (
            <>
              <span className="text-xs text-muted">未保存更改</span>
              <Button
                className="min-h-11"
                isDisabled={pending || unknown || !!missing}
                onPress={() => void save(true)}
              >
                保存更改
              </Button>
              <Button
                variant="secondary"
                className="min-h-11 rounded-lg text-foreground"
                onPress={() => open('save')}
              >
                另存为
              </Button>
            </>
          ) : (
            !collection && (
              <Button
                variant="secondary"
                className="min-h-11 rounded-lg text-foreground"
                onPress={() => open('save')}
              >
                <Bookmark size={16} />
                保存为智能集合
              </Button>
            )
          )}
        </div>
      </div>
      {missing && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>智能集合已删除</Alert.Title>
            <Alert.Description>
              当前筛选条件仍保留，可另存为新集合或返回全部图片。
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {(list.error || (error && !mode)) && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>{error || list.error?.message}</Alert.Title>
            <Button variant="ghost" onPress={() => void list.refetch()}>
              重新读取集合
            </Button>
          </Alert.Content>
        </Alert>
      )}
      {screenshotOpen && (
        <ScreenshotTemplateDialog
          client={client}
          onSessionExpired={onSessionExpired}
          onClose={() => setScreenshotOpen(false)}
          onApply={async (ids) =>
            (await onApply(smartCollectionTemplate('screenshot', ids))) !==
            undefined
          }
        />
      )}
      <Modal
        isOpen={!!mode}
        onOpenChange={(isOpen) => {
          if (!isOpen && !pending) setMode(null);
        }}
      >
        <Modal.Backdrop>
          <Modal.Container placement="center" className="p-4">
            <Modal.Dialog
              className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 overflow-y-auto rounded-2xl p-6"
              aria-label={
                mode === 'delete'
                  ? '删除智能集合'
                  : mode === 'rename'
                    ? '重命名集合'
                    : '保存为智能集合'
              }
            >
              <Modal.Header>
                <Modal.Heading>
                  {mode === 'delete'
                    ? '删除智能集合'
                    : mode === 'rename'
                      ? '重命名集合'
                      : '保存为智能集合'}
                </Modal.Heading>
              </Modal.Header>
              <Form
                className="grid gap-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                <Modal.Body className="grid gap-4 px-0">
                  {mode === 'delete' ? (
                    <p className="text-sm">
                      删除“{collection?.name}”的筛选条件，所有图片都会保留。
                    </p>
                  ) : (
                    <TextField
                      value={name}
                      onChange={setName}
                      isDisabled={pending}
                    >
                      <Label>集合名称</Label>
                      <Input
                        autoFocus
                        maxLength={100}
                        className="h-12"
                        placeholder="例如：待整理的图片"
                      />
                    </TextField>
                  )}
                  {mode === 'save' && (
                    <p className="text-sm text-muted">
                      保存当前筛选条件与排序，图片自动匹配，无需手动加入。
                    </p>
                  )}
                  {error && (
                    <p role="alert" className="text-sm text-danger">
                      {error}
                    </p>
                  )}
                </Modal.Body>
                <Modal.Footer className="gap-3 px-0">
                  <Button
                    variant="secondary"
                    className="min-h-12 flex-1 rounded-lg text-foreground"
                    isDisabled={pending}
                    onPress={() => setMode(null)}
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    variant={mode === 'delete' ? 'danger' : 'primary'}
                    className="min-h-12 flex-1"
                    isDisabled={pending || unknown}
                  >
                    {pending
                      ? '正在保存…'
                      : mode === 'delete'
                        ? '删除集合'
                        : '保存'}
                  </Button>
                </Modal.Footer>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <Modal
        isOpen={confirmRefresh}
        onOpenChange={(isOpen) => {
          if (!pending) setConfirmRefresh(isOpen);
        }}
      >
        <Modal.Backdrop>
          <Modal.Container placement="center" className="p-4">
            <Modal.Dialog
              aria-label="刷新已保存集合"
              className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 overflow-y-auto rounded-2xl p-6"
            >
              <Modal.Header>
                <Modal.Heading>条件尚未保存</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p className="text-sm">
                  刷新将读取最新保存的集合名称和条件，并放弃本次未保存修改。
                </p>
                {error && (
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button
                  variant="secondary"
                  className="min-h-12 rounded-lg text-foreground"
                  isDisabled={pending}
                  onPress={() => setConfirmRefresh(false)}
                >
                  保留当前修改
                </Button>
                <Button
                  className="min-h-12 rounded-lg"
                  isDisabled={pending}
                  onPress={() => void reloadDefinition()}
                >
                  放弃修改并刷新
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <Modal
        isOpen={!!destination}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDestination(null);
        }}
      >
        <Modal.Backdrop>
          <Modal.Container placement="center" className="p-4">
            <Modal.Dialog
              aria-label="放弃未保存的条件"
              className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 overflow-y-auto rounded-2xl p-6"
            >
              <Modal.Header>
                <Modal.Heading>条件尚未保存</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p className="text-sm">
                  离开后会放弃本次条件修改，已保存的集合不会改变。
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  variant="secondary"
                  className="min-h-12 rounded-lg text-foreground"
                  onPress={() => setDestination(null)}
                >
                  继续编辑
                </Button>
                <Button
                  className="min-h-12"
                  onPress={() => {
                    const href = destination;
                    setDestination(null);
                    if (href) router.push(href);
                  }}
                >
                  放弃并离开
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
