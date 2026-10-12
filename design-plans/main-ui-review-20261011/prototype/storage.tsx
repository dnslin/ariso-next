import { useState, type ReactNode } from 'react';
import { Button } from '@heroui/react/button';
import { Chip } from '@heroui/react/chip';
import { FieldError } from '@heroui/react/field-error';
import { InputGroup } from '@heroui/react/input-group';
import { Label } from '@heroui/react/label';
import { Modal } from '@heroui/react/modal';
import { Switch } from '@heroui/react/switch';
import { TextField } from '@heroui/react/textfield';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CircleAlert,
  Cloud,
  Copy,
  Folder,
  Globe,
  HardDrive,
  Images,
  KeyRound,
  Link2,
  ListChecks,
  LockKeyhole,
  MapPin,
  Plus,
  Power,
  RefreshCw,
  Save,
  ScanLine,
  Settings2,
  ShieldCheck,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  EmptyState,
  Footer,
  Help,
  Metric,
  PageHeader,
  SelectField,
  usePrototype,
} from './shared';

type Scenario = 'empty' | 'sample' | 'attention';
type StorageConfig = {
  id: string;
  name: string;
  type: 'local' | 's3';
  path: string;
  enabled: boolean;
  isDefault: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKey: string;
  secretKey: string;
  connected: boolean;
};

const localRoot =
  '/Volumes/data/project/ariso/.data/main-preview-20261011/data/storage';
const sessionStores = new Map<Scenario, StorageConfig[]>();
const completedCleanup = new Set<Scenario>();
const completedScans = new Set<Scenario>();
const completedOrphans = new Set<Scenario>();

function storageFixtures(scenario: Scenario) {
  const existing = sessionStores.get(scenario);
  if (existing) return existing;
  const rows: StorageConfig[] = [
    {
      id: 'local',
      name: '默认本地存储',
      type: 'local',
      path: 'default',
      enabled: true,
      isDefault: true,
      endpoint: '',
      region: '',
      bucket: '',
      prefix: '',
      accessKey: '',
      secretKey: '',
      connected: true,
    },
  ];
  if (scenario !== 'empty')
    rows.push({
      id: 'cloud',
      name: '摄影作品备份',
      type: 's3',
      path: '',
      enabled: scenario !== 'attention',
      isDefault: false,
      endpoint: 'https://images.example.com',
      region: 'auto',
      bucket: 'ariso-images',
      prefix: 'portfolio',
      accessKey: '',
      secretKey: '',
      connected: true,
    });
  sessionStores.set(scenario, rows);
  return rows;
}

function currentStorageId() {
  const id = window.location.pathname.split('/')[3];
  return id && id !== 'new' ? id : 'local';
}

function referenceCounts(scenario: Scenario, id: string) {
  const populated = scenario !== 'empty' && !id.startsWith('added');
  const attention = scenario === 'attention' && id === 'local';
  return {
    images: populated ? (id === 'cloud' ? 318 : 1284) : 0,
    versions: populated ? (id === 'cloud' ? 512 : 2042) : 0,
    uploads: attention ? 2 : 0,
    activeWrites: attention ? 1 : 0,
    processing: attention ? 3 : 0,
    cleanup: attention && !completedCleanup.has(scenario) ? 1 : 0,
    probes: attention && !completedCleanup.has(scenario) ? 1 : 0,
    orphans: attention && !completedOrphans.has(scenario) ? 6 : 0,
    objects: populated ? (id === 'cloud' ? 512 : 2042) : 0,
  };
}

function Status({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const colors = {
    neutral: 'bg-default text-foreground',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/10 text-danger',
  };
  return (
    <Chip size="sm" className={`shrink-0 rounded-md px-2 ${colors[tone]}`}>
      <Chip.Label>{children}</Chip.Label>
    </Chip>
  );
}

function Back({ onPress }: { onPress: () => void }) {
  return (
    <Button
      variant="ghost"
      className="prototype-button gap-2 px-3"
      onPress={onPress}
    >
      <ArrowLeft size={18} aria-hidden />
      返回
    </Button>
  );
}

function Confirm({
  isOpen,
  onOpenChange,
  title,
  children,
  action,
  onConfirm,
  danger = false,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  action: string;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container placement="center" className="p-4">
          <Modal.Dialog className="max-h-[calc(100dvh-32px)] w-full max-w-[480px] gap-5 overflow-auto rounded-xl border border-border bg-surface p-6">
            <Modal.Header className="flex items-center justify-between gap-3 p-0">
              <Modal.Heading className="text-xl font-medium">
                {title}
              </Modal.Heading>
              <Button
                isIconOnly
                variant="ghost"
                aria-label="关闭"
                className="prototype-icon-button"
                onPress={() => onOpenChange(false)}
              >
                <X size={18} />
              </Button>
            </Modal.Header>
            <Modal.Body className="m-0 grid gap-3 p-0 text-sm leading-6">
              {children}
            </Modal.Body>
            <Modal.Footer className="m-0 grid grid-cols-2 gap-3 p-0">
              <Button
                variant="outline"
                className="prototype-button"
                onPress={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button
                variant={danger ? 'danger' : 'primary'}
                className="prototype-button"
                onPress={onConfirm}
              >
                {action}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function StorageListPage() {
  const { scenario, navigate, notify } = usePrototype();
  const rows = storageFixtures(scenario);
  return (
    <div className="prototype-page">
      <PageHeader title="存储管理">
        <Button
          className="prototype-button"
          onPress={() => navigate('/settings/storage/new')}
        >
          <Plus size={18} />
          添加存储
        </Button>
      </PageHeader>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="prototype-muted">{rows.length} 项存储</span>
        <Button
          variant="ghost"
          className="prototype-button gap-2"
          onPress={() => navigate('/analytics?view=usage')}
        >
          <HardDrive size={17} />
          存储占用
          <ArrowRight size={16} />
        </Button>
      </div>
      {rows.length ? (
        <section className="prototype-section">
          {rows.map((storage) => (
            <div
              key={storage.id}
              className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-3 gap-y-4 border-b border-border py-5 sm:grid-cols-[24px_minmax(0,1fr)_auto] sm:items-center"
            >
              {storage.type === 'local' ? (
                <HardDrive size={21} className="mt-1" aria-hidden />
              ) : (
                <Cloud size={21} className="mt-1" aria-hidden />
              )}
              <div className="grid min-w-0 gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words text-base font-medium">
                    {storage.name}
                  </h2>
                  <Status tone={storage.enabled ? 'success' : 'neutral'}>
                    {storage.enabled ? '已启用' : '已停用'}
                  </Status>
                  {storage.isDefault ? <Status>默认</Status> : null}
                  {scenario === 'attention' &&
                  storage.id === 'local' &&
                  !completedOrphans.has(scenario) ? (
                    <Status tone="warning">6 个待核对</Status>
                  ) : null}
                </div>
                <div className="prototype-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span>
                    {storage.type === 'local' ? '本地存储' : 'S3 存储'}
                  </span>
                  <span>
                    {scenario === 'empty' || storage.id.startsWith('added')
                      ? '0 B'
                      : storage.id === 'cloud'
                        ? '1.2 GiB'
                        : '4.8 GiB'}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                className="prototype-button col-start-2 justify-self-start sm:col-start-auto sm:justify-self-end"
                aria-label={`配置${storage.name}`}
                onPress={() => navigate(`/settings/storage/${storage.id}`)}
              >
                <Settings2 size={17} />
                配置
              </Button>
            </div>
          ))}
        </section>
      ) : (
        <EmptyState icon={<HardDrive size={36} />} title="暂无存储" />
      )}
      <Footer>
        <span className="prototype-muted text-sm">共 {rows.length} 项</span>
        <Button
          isIconOnly
          variant="outline"
          aria-label="刷新存储"
          className="prototype-icon-button"
          onPress={() => notify('存储列表已更新')}
        >
          <RefreshCw size={18} />
        </Button>
      </Footer>
    </div>
  );
}

export function StorageEditorPage({
  isNew: newProp,
  storageType,
}: {
  isNew?: boolean;
  storageType?: 'local' | 's3';
} = {}) {
  const { scenario, navigate, notify } = usePrototype();
  const isNew = newProp ?? window.location.pathname.endsWith('/new');
  const id = currentStorageId();
  const original = storageFixtures(scenario).find((row) => row.id === id);
  const initial: StorageConfig = isNew
    ? {
        id: 'added',
        name: '',
        type: storageType ?? 'local',
        path: '',
        enabled: false,
        isDefault: false,
        endpoint: '',
        region: 'auto',
        bucket: '',
        prefix: '',
        accessKey: '',
        secretKey: '',
        connected: false,
      }
    : {
        ...(original ?? storageFixtures(scenario)[0]),
        ...(storageType && !original ? { type: storageType } : {}),
      };
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<{ field: string; message: string } | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState<
    'leave' | 'delete' | 'disable' | null
  >(null);
  const [pendingHref, setPendingHref] = useState('/settings/storage');
  const counts = referenceCounts(scenario, id);
  const blocked = !isNew && Object.values(counts).some((count) => count > 0);
  const locked = !isNew && value.type === 'local' && blocked;
  const dirty = JSON.stringify(saved) !== JSON.stringify(value);
  const path = `${localRoot}/${value.path || '…'}`;
  const change = (patch: Partial<StorageConfig>) => {
    setValue((current) => ({ ...current, ...patch }));
    if (error && error.field in patch) setError(null);
  };
  const requestNavigation = (href: string) => {
    if (!dirty) {
      navigate(href);
      return;
    }
    setPendingHref(href);
    setConfirmation('leave');
  };
  const returnToList = () => requestNavigation('/settings/storage');
  const submit = () => {
    if (!value.name.trim()) {
      setError({ field: 'name', message: '请输入存储名称' });
      return;
    }
    if (value.type === 'local' && !value.path.trim()) {
      setError({ field: 'path', message: '请输入相对路径' });
      return;
    }
    if (
      value.type === 's3' &&
      (!value.endpoint.trim() || !value.bucket.trim())
    ) {
      setError({
        field: !value.endpoint.trim() ? 'endpoint' : 'bucket',
        message: !value.endpoint.trim() ? '请输入服务地址' : '请输入 Bucket',
      });
      return;
    }
    if (saved.enabled && !value.enabled && saved.isDefault) {
      setConfirmation('disable');
      return;
    }
    save();
  };
  const save = () => {
    const rows = storageFixtures(scenario);
    const next = {
      ...value,
      id: isNew ? `added-${crypto.randomUUID()}` : value.id,
      name: value.name.trim(),
    };
    if (next.isDefault)
      rows.forEach((row) => {
        row.isDefault = false;
      });
    const position = rows.findIndex((row) => row.id === next.id);
    if (position < 0) rows.push(next);
    else rows[position] = next;
    setSaved(next);
    setValue(next);
    setError(null);
    setConfirmation(null);
    notify(isNew ? '存储已添加' : '配置已保存');
    if (isNew) navigate('/settings/storage');
  };
  const field = (
    key: keyof Pick<
      StorageConfig,
      | 'name'
      | 'path'
      | 'endpoint'
      | 'region'
      | 'bucket'
      | 'prefix'
      | 'accessKey'
      | 'secretKey'
    >,
    label: string,
    icon: ReactNode,
    help?: ReactNode,
    readOnly = false,
  ) => (
    <TextField
      value={value[key]}
      onChange={(next) => change({ [key]: next })}
      isReadOnly={readOnly}
      isInvalid={error?.field === key}
      className="min-w-0 gap-2"
    >
      <div className="flex min-h-7 items-center justify-between gap-3">
        <Label className="text-sm font-normal">
          {label}
          {readOnly ? ' · 只读' : ''}
        </Label>
        {help ? <Help label={label}>{help}</Help> : null}
      </div>
      <InputGroup
        className={`h-12 min-w-0 rounded-lg border border-border shadow-none ${readOnly ? 'bg-default' : 'bg-background'}`}
      >
        <InputGroup.Prefix className="border-0 pl-3 pr-2 text-muted">
          {icon}
        </InputGroup.Prefix>
        <InputGroup.Input
          type={
            key === 'secretKey' || key === 'accessKey' ? 'password' : 'text'
          }
          autoComplete="off"
          placeholder={
            key === 'accessKey' || key === 'secretKey'
              ? isNew
                ? ''
                : '已配置，留空保留'
              : key === 'path'
                ? '例如 photos'
                : undefined
          }
          className="h-full min-w-0 py-0 pl-0 pr-3 text-sm"
        />
      </InputGroup>
      <FieldError>{error?.field === key ? error.message : ''}</FieldError>
    </TextField>
  );
  return (
    <div className="prototype-page">
      <PageHeader
        title={
          isNew
            ? '添加存储'
            : value.type === 'local'
              ? '本地存储配置'
              : 'S3 存储配置'
        }
      >
        <Back onPress={returnToList} />
      </PageHeader>
      {!isNew ? (
        <div className="flex flex-wrap items-center gap-2">
          <Status tone={saved.enabled ? 'success' : 'neutral'}>
            {saved.enabled ? '已启用' : '已停用'}
          </Status>
          {saved.isDefault ? <Status>默认存储</Status> : null}
          {blocked ? (
            <Status tone="warning">
              {counts.images.toLocaleString()} 张图片引用
            </Status>
          ) : null}
        </div>
      ) : null}
      <form
        className="prototype-form grid gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <section className="prototype-section grid gap-5">
          <h2 className="prototype-heading">
            {value.type === 'local' ? '存储位置' : '连接信息'}
          </h2>
          {isNew ? (
            <SelectField
              label="存储类型"
              value={value.type}
              onChange={(next) =>
                change({
                  type: next as 'local' | 's3',
                  connected: next === 'local',
                  enabled: false,
                })
              }
              options={[
                { id: 'local', label: '本地存储' },
                { id: 's3', label: 'S3 存储' },
              ]}
            />
          ) : null}
          {field('name', '存储名称', <Tag size={17} />)}
          {value.type === 'local' ? (
            <>
              {field(
                'path',
                '相对路径',
                <Folder size={17} />,
                <>
                  <p>填写存储根目录下的相对路径，如 photos。</p>
                  <p>使用其他硬盘时，将目录挂载到存储根目录后填写对应路径。</p>
                </>,
                locked,
              )}
              <div className="grid gap-2">
                <span className="prototype-muted text-sm">实际目录</span>
                <div className="flex items-start gap-3">
                  <code className="min-w-0 flex-1 select-text break-all text-sm leading-6">
                    {path}
                  </code>
                  <Button
                    isIconOnly
                    variant="ghost"
                    className="prototype-icon-button shrink-0"
                    aria-label="复制实际目录"
                    onPress={async () => {
                      try {
                        await navigator.clipboard.writeText(path);
                        notify('目录已复制');
                      } catch {
                        notify('未能复制，请选择完整目录文本');
                      }
                    }}
                  >
                    <Copy size={17} />
                  </Button>
                </div>
              </div>
              {locked ? (
                <p className="prototype-muted flex items-start gap-2 text-sm">
                  <LockKeyhole size={16} className="mt-0.5 shrink-0" />
                  仍有引用，存储路径不可修改。
                </p>
              ) : null}
            </>
          ) : (
            <>
              {field('endpoint', '服务地址', <Globe size={17} />)}
              <div className="grid gap-5 sm:grid-cols-2">
                {field('region', '区域', <MapPin size={17} />)}
                {field('bucket', 'Bucket', <HardDrive size={17} />)}
              </div>
              {field(
                'prefix',
                '路径前缀',
                <Folder size={17} />,
                '可留空；填写后，新文件保存到此前缀下。',
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                {field('accessKey', 'Access Key', <KeyRound size={17} />)}
                {field('secretKey', 'Secret Key', <KeyRound size={17} />)}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Status tone={value.connected ? 'success' : 'warning'}>
                  {value.connected ? '连接正常' : '连接未测试'}
                </Status>
                <Button
                  variant="outline"
                  className="prototype-button"
                  onPress={() => {
                    if (!value.endpoint || !value.bucket) {
                      setError({
                        field: !value.endpoint.trim() ? 'endpoint' : 'bucket',
                        message: !value.endpoint.trim()
                          ? '请输入服务地址'
                          : '请输入 Bucket',
                      });
                      return;
                    }
                    change({ connected: true });
                    notify('连接测试通过');
                  }}
                >
                  <ShieldCheck size={17} />
                  测试连接
                </Button>
              </div>
            </>
          )}
        </section>
        <section className="prototype-section grid gap-0 border-t border-border">
          <div className="prototype-row min-h-20 gap-5 py-3">
            <div className="flex items-center gap-3">
              <Power size={18} />
              <span className="text-sm">启用此存储</span>
            </div>
            <Switch
              aria-label="启用此存储"
              isSelected={value.enabled}
              isDisabled={value.type === 's3' && !value.connected}
              onChange={(enabled) => change({ enabled })}
            >
              <Switch.Content className="gap-3">
                <Label className="text-sm font-normal">
                  {value.enabled ? '已开启' : '已关闭'}
                </Label>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>
          {value.type === 's3' && !value.connected ? (
            <p className="text-sm text-warning">连接测试通过后可启用。</p>
          ) : null}
          <div className="prototype-row min-h-20 gap-5 py-3">
            <div className="flex items-center gap-3">
              <CheckCheck size={18} />
              <span className="text-sm">设为默认存储</span>
            </div>
            <Switch
              aria-label="设为默认存储"
              isSelected={value.isDefault}
              onChange={(isDefault) => change({ isDefault })}
            >
              <Switch.Content className="gap-3">
                <Label className="text-sm font-normal">
                  {value.isDefault ? '已开启' : '已关闭'}
                </Label>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>
        </section>
        {!isNew ? (
          <section className="flex flex-wrap gap-3 border-t border-border pt-6">
            <Button
              variant="outline"
              className="prototype-button"
              onPress={() =>
                requestNavigation(`/settings/storage/${id}/references`)
              }
            >
              <Link2 size={17} />
              引用与清理
            </Button>
            <Button
              variant="outline"
              className="prototype-button"
              onPress={() =>
                requestNavigation(`/settings/storage/${id}/maintenance`)
              }
            >
              <ListChecks size={17} />
              清理状态
            </Button>
            <Button
              variant="outline"
              className="prototype-button text-danger"
              isDisabled={blocked}
              onPress={() => setConfirmation('delete')}
            >
              <Trash2 size={17} />
              删除配置
            </Button>
          </section>
        ) : null}
      </form>
      <Footer>
        <Button
          variant="outline"
          className="prototype-button"
          onPress={() => {
            setValue(saved);
            setError(null);
            notify('已恢复保存的配置');
          }}
        >
          取消
        </Button>
        <Button className="prototype-button" onPress={submit}>
          <Save size={17} />
          {isNew ? '添加存储' : '保存配置'}
        </Button>
      </Footer>
      <Confirm
        isOpen={confirmation === 'leave'}
        onOpenChange={(open) => !open && setConfirmation(null)}
        title="放弃未保存的修改？"
        action="放弃修改"
        onConfirm={() => navigate(pendingHref)}
      >
        <p>当前修改尚未保存。</p>
      </Confirm>
      <Confirm
        isOpen={confirmation === 'disable'}
        onOpenChange={(open) => !open && setConfirmation(null)}
        title="停用默认存储？"
        action="确认停用"
        onConfirm={save}
      >
        <p>
          新上传将无法使用此存储。默认选择会保留，你可以重新启用或选择其他默认存储。
        </p>
      </Confirm>
      <Confirm
        isOpen={confirmation === 'delete'}
        onOpenChange={(open) => !open && setConfirmation(null)}
        title="删除存储配置？"
        action="确认删除"
        danger
        onConfirm={() => {
          sessionStores.set(
            scenario,
            storageFixtures(scenario).filter((row) => row.id !== id),
          );
          navigate('/settings/storage');
          notify('存储配置已移除');
        }}
      >
        <p>“{saved.name}”的配置将被移除。删除前会重新检查引用与受管对象。</p>
        {saved.isDefault ? (
          <p>此存储是默认存储，删除后需要重新选择默认存储。</p>
        ) : null}
        <p className="prototype-muted">
          不会删除挂载根目录、Bucket 或其他应用的文件。
        </p>
      </Confirm>
    </div>
  );
}

export function StorageReferencesPage() {
  const { scenario, navigate } = usePrototype();
  const id = currentStorageId();
  const storage = storageFixtures(scenario).find((row) => row.id === id);
  const counts = referenceCounts(scenario, id);
  const blocked = Object.values(counts).some((count) => count > 0);
  const rows = [
    {
      icon: <Images size={20} />,
      label: '图片与版本',
      value: `${counts.images.toLocaleString()} 张 / ${counts.versions.toLocaleString()} 个`,
      href: '/library',
      action: '查看图片',
      active: counts.images + counts.versions > 0,
    },
    {
      icon: <Upload size={20} />,
      label: '未结束上传',
      value: `${counts.uploads} 个会话`,
      href: '/upload',
      action: '查看上传',
      active: counts.uploads + counts.activeWrites > 0,
      detail: counts.activeWrites ? `${counts.activeWrites} 项正在写入` : '',
    },
    {
      icon: <ListChecks size={20} />,
      label: '处理与删除任务',
      value: `处理 ${counts.processing} 项 / 清理 ${counts.cleanup} 项`,
      href: `/settings/storage/${id}/maintenance`,
      action: '查看任务',
      active: counts.processing + counts.cleanup > 0,
      detail: counts.cleanup ? `${counts.cleanup} 项清理失败` : '',
    },
    {
      icon: <ScanLine size={20} />,
      label: '测试与受管对象',
      value: `探测 ${counts.probes} / 孤儿 ${counts.orphans} / 对象 ${counts.objects.toLocaleString()}`,
      href: `/settings/storage/${id}/maintenance`,
      action: '查看清理',
      active: counts.probes + counts.orphans + counts.objects > 0,
      detail: counts.orphans ? `${counts.orphans} 个对象待核对` : '',
    },
  ];
  return (
    <div className="prototype-page">
      <PageHeader
        title="引用与清理"
        help={
          <Help label="引用说明">
            <p>
              图片数量包含正常、失败、处理中及回收站记录。各类别可能关联同一张图片。
            </p>
            <p>
              无引用不等于已核对整个存储。删除配置前仍会检查引用与受管对象。
            </p>
          </Help>
        }
      >
        <Back onPress={() => navigate(`/settings/storage/${id}`)} />
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">{storage?.name ?? '默认本地存储'}</span>
        <Status tone={blocked ? 'warning' : 'success'}>
          {blocked ? '仍有引用' : '无引用'}
        </Status>
      </div>
      <section className="prototype-section">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-3 gap-y-3 border-b border-border py-5 sm:grid-cols-[24px_minmax(0,1fr)_auto] sm:items-center"
          >
            <div className="pt-0.5">{row.icon}</div>
            <div className="grid min-w-0 gap-2">
              <h2 className="text-sm font-medium">{row.label}</h2>
              <p className="text-base tabular-nums">{row.value}</p>
              {row.detail ? (
                <p
                  className={`text-sm ${row.label === '处理与删除任务' ? 'text-danger' : 'text-warning'}`}
                >
                  {row.detail}
                </p>
              ) : null}
            </div>
            {row.active ? (
              <Button
                variant="ghost"
                className="prototype-button col-start-2 justify-self-start sm:col-start-auto"
                onPress={() => navigate(row.href)}
              >
                {row.action}
                <ArrowRight size={16} />
              </Button>
            ) : null}
          </div>
        ))}
      </section>
    </div>
  );
}

export function StorageMaintenancePage() {
  const { scenario, navigate, notify } = usePrototype();
  const id = currentStorageId();
  const storage = storageFixtures(scenario).find((row) => row.id === id);
  const attention = scenario === 'attention' && id === 'local';
  const [cleaned, setCleaned] = useState(completedCleanup.has(scenario));
  const [scanned, setScanned] = useState(completedScans.has(scenario));
  const [orphanCount, setOrphanCount] = useState(
    attention && !completedOrphans.has(scenario) ? 6 : 0,
  );
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const failed = attention && !cleaned;
  return (
    <div className="prototype-page">
      <PageHeader
        title="清理状态"
        help={
          <Help label="清理说明">
            <p>
              清理只处理 Ariso
              登记的测试文件和受管孤儿对象。扫描不会删除图片或其他应用的文件。
            </p>
          </Help>
        }
      >
        <Back onPress={() => navigate(`/settings/storage/${id}/references`)} />
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{storage?.name ?? '默认本地存储'}</span>
        <Status tone={failed ? 'danger' : scanned ? 'success' : 'neutral'}>
          {failed ? '清理失败' : scanned ? '已核对' : '尚未扫描'}
        </Status>
      </div>
      {failed ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-danger/25 bg-danger/5 p-4"
        >
          <CircleAlert size={20} className="mt-0.5 shrink-0 text-danger" />
          <div className="grid gap-2">
            <p className="font-medium text-danger">1 个测试对象未能删除</p>
            <p className="break-all text-sm">
              连接超时 · DELETE · probes/connection-test-01
            </p>
            <Button
              variant="outline"
              className="prototype-button justify-self-start"
              onPress={() => {
                completedCleanup.add(scenario);
                setCleaned(true);
                notify('测试对象已清理');
              }}
            >
              <RefreshCw size={17} />
              重试清理
            </Button>
          </div>
        </div>
      ) : null}
      <section className="prototype-section grid gap-0">
        <div className="prototype-row min-h-20 gap-4 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck size={20} />
            <span>连接测试对象</span>
          </div>
          <span className="text-sm">
            {failed ? '1 个待清理' : '0 个待清理'}
          </span>
        </div>
        <div className="prototype-row min-h-20 gap-4 py-4">
          <div className="flex items-center gap-3">
            <ScanLine size={20} />
            <span>最近扫描</span>
          </div>
          <span className="prototype-muted text-sm">
            {scanned ? '刚刚完成' : '尚未扫描'}
          </span>
        </div>
        <div className="prototype-row min-h-20 gap-4 py-4">
          <div className="flex items-center gap-3">
            <Folder size={20} />
            <span>孤儿对象</span>
          </div>
          <span
            className={`text-sm ${orphanCount && !scanned ? 'text-warning' : ''}`}
          >
            {orphanCount
              ? scanned
                ? `${orphanCount} 个可清理`
                : `${orphanCount} 个待核对`
              : '0 个'}
          </span>
        </div>
      </section>
      {orphanCount ? (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="prototype-button"
            isDisabled={!scanned}
            onPress={() => setConfirmCleanup(true)}
          >
            <Trash2 size={17} />
            清理孤儿对象
          </Button>
          {!scanned ? (
            <span className="flex items-center text-sm text-warning">
              请先完成扫描核对。
            </span>
          ) : null}
        </div>
      ) : null}
      {cleaned ? (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-success"
        >
          <Check size={17} />
          测试对象清理完成
        </p>
      ) : null}
      <Footer>
        <Button
          variant="outline"
          className="prototype-button"
          onPress={() => navigate(`/settings/storage/${id}/references`)}
        >
          <Link2 size={17} />
          查看引用
        </Button>
        <Button
          className="prototype-button"
          onPress={() => {
            completedScans.add(scenario);
            setScanned(true);
            notify(
              orphanCount
                ? `扫描完成，发现 ${orphanCount} 个孤儿对象`
                : '扫描完成，未发现孤儿对象',
            );
          }}
        >
          <ScanLine size={17} />
          {scanned ? '重新扫描' : '扫描存储'}
        </Button>
      </Footer>
      <Confirm
        isOpen={confirmCleanup}
        onOpenChange={setConfirmCleanup}
        title={`清理 ${orphanCount} 个孤儿对象？`}
        action="确认清理"
        danger
        onConfirm={() => {
          completedOrphans.add(scenario);
          setOrphanCount(0);
          setConfirmCleanup(false);
          notify(`${orphanCount} 个孤儿对象已清理`);
        }}
      >
        <p>
          将删除已核对、没有图片引用的 {orphanCount}{' '}
          个受管对象。此操作无法撤销。
        </p>
      </Confirm>
    </div>
  );
}

export function UsagePage() {
  const { scenario, navigate, notify } = usePrototype();
  const empty = scenario === 'empty';
  const attention = scenario === 'attention' && !completedOrphans.has(scenario);
  return (
    <div className="prototype-page">
      <PageHeader
        title="存储占用"
        help={
          <Help label="占用口径">
            <p>占用来自 Ariso 登记的对象，不代表硬盘或 Bucket 的全部使用量。</p>
            <p>未核对对象单独计数，不纳入已知占用。</p>
          </Help>
        }
      >
        <Back onPress={() => navigate('/settings/storage')} />
      </PageHeader>
      <div className="prototype-metrics">
        <Metric
          label="已登记占用"
          value={empty ? '0 B' : '6.0 GiB'}
          icon={<HardDrive size={20} />}
        />
        <Metric
          label="原图"
          value={empty ? '0 B' : '3.8 GiB'}
          icon={<Images size={20} />}
        />
        <Metric
          label="衍生版本"
          value={empty ? '0 B' : '2.2 GiB'}
          icon={<Folder size={20} />}
        />
        <Metric
          label="待核对对象"
          value={attention ? '6' : '0'}
          icon={<ScanLine size={20} />}
        />
      </div>
      {attention ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
          <span className="flex items-center gap-2 text-sm text-warning">
            <CircleAlert size={18} />6 个对象尚未核对，未计入占用。
          </span>
          <Button
            variant="outline"
            className="prototype-button"
            onPress={() => navigate('/settings/storage/local/maintenance')}
          >
            <ScanLine size={17} />
            查看核对
          </Button>
        </div>
      ) : null}
      <section className="prototype-section grid gap-3">
        <h2 className="prototype-heading">按存储</h2>
        {storageFixtures(scenario).map((row) => (
          <div key={row.id} className="prototype-row flex-wrap gap-4 py-5">
            <div className="flex min-w-0 items-center gap-3">
              {row.type === 'local' ? (
                <HardDrive size={20} />
              ) : (
                <Cloud size={20} />
              )}
              <span className="break-words text-sm">{row.name}</span>
              <Status tone={row.enabled ? 'success' : 'neutral'}>
                {row.enabled ? '已启用' : '已停用'}
              </Status>
            </div>
            <span className="tabular-nums">
              {empty ? '0 B' : row.id === 'cloud' ? '1.2 GiB' : '4.8 GiB'}
            </span>
          </div>
        ))}
      </section>
      <Footer>
        <span className="prototype-muted text-sm">刚刚更新</span>
        <Button
          isIconOnly
          variant="outline"
          aria-label="刷新存储占用"
          className="prototype-icon-button"
          onPress={() => notify('占用已更新')}
        >
          <RefreshCw size={18} />
        </Button>
      </Footer>
    </div>
  );
}
