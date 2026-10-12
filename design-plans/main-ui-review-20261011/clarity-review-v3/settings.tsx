/* eslint-disable @next/next/no-img-element -- Local prototype previews browser-selected files. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@heroui/react/button';
import { ButtonGroup } from '@heroui/react/button-group';
import { NumberField } from '@heroui/react/number-field';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import { toast } from '@heroui/react/toast';
import {
  ArrowLeft,
  ChevronRight,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Palette,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  SettingsCategories,
  settingsCategories,
} from '../../../src/components/shell/settings-categories';
import { siteSettingsPatchSchema } from '../../../src/server/site/validation';
import { uploadSettingsInputSchema } from '../../../src/shared/upload-settings';
import { uploadLimitFields } from '../../../src/components/upload-limits/model';
import {
  ActionIconButton,
  Dialog,
  Field,
  Footer,
  Header,
  Help,
  SaveButton,
  SectionHeading,
  buttonClass,
  groupClass,
  panelClass,
  useApp,
} from './ui';

const basicCategory = settingsCategories.filter(
  (item) => item.href === '/settings/general',
);
const initialSite = {
  name: 'Ariso',
  description: '我的图片空间',
  publicUrl: 'https://photos.example.com',
  timeZone: 'Asia/Shanghai',
};
const siteFields = [
  { name: 'name', label: '站点名称' },
  { name: 'description', label: '站点描述' },
  { name: 'publicUrl', label: '公开地址', type: 'url' },
  { name: 'timeZone', label: '时区' },
] as const;
const initialLimits = { maxFileMiB: 50, batchSize: 20, queueLimit: 500 };
const sectionClass = `${panelClass} grid gap-4 p-4 min-[1200px]:px-6 min-[1200px]:py-5`;
type SaveState = 'idle' | 'pending' | 'saved' | 'error';
const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function SectionState({ state, dirty }: { state: SaveState; dirty: boolean }) {
  return (
    <span
      role="status"
      className={`whitespace-nowrap text-xs ${state === 'error' ? 'text-danger' : 'text-muted'}`}
    >
      {state === 'pending'
        ? '保存中'
        : state === 'error'
          ? '未保存'
          : dirty
            ? '未保存'
            : '已保存'}
    </span>
  );
}

function RelatedRow({
  title,
  value,
  icon,
  onPress,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <>
      <span className="row-span-2 flex size-5 items-center justify-center text-muted [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 text-sm font-medium">{title}</span>
      {onPress ? (
        <ChevronRight className="row-span-2 size-4" aria-hidden />
      ) : null}
      <span className="col-start-2 min-w-0 text-[13px] font-normal text-muted wrap-anywhere">
        {value}
      </span>
    </>
  );
  const className =
    'grid h-auto min-h-16 w-full min-w-0 grid-cols-[20px_minmax(0,1fr)_20px] gap-x-3 rounded-none px-4 py-3 text-left min-[1200px]:px-6';
  return onPress ? (
    <Button
      variant="ghost"
      onPress={onPress}
      className={`${className} [--button-bg-hover:color-mix(in_srgb,var(--foreground)_4%,transparent)] [--button-bg-pressed:color-mix(in_srgb,var(--foreground)_7%,transparent)]`}
    >
      {content}
    </Button>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function SettingsPage() {
  const { navigate, scenario } = useApp();
  const [site, setSite] = useState(initialSite);
  const [savedSite, setSavedSite] = useState(initialSite);
  const [limits, setLimits] = useState(initialLimits);
  const [savedLimits, setSavedLimits] = useState(initialLimits);
  const [siteState, setSiteState] = useState<SaveState>('idle');
  const [limitsState, setLimitsState] = useState<SaveState>('idle');
  const [siteErrors, setSiteErrors] = useState<Record<string, string>>({});
  const [limitErrors, setLimitErrors] = useState<Record<string, string>>({});
  const siteDirty = JSON.stringify(site) !== JSON.stringify(savedSite);
  const limitsDirty = JSON.stringify(limits) !== JSON.stringify(savedLimits);

  async function saveSite() {
    if (siteState === 'pending') return;
    const result = siteSettingsPatchSchema.safeParse(site);
    if (!result.success) {
      setSiteErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [
            issue.path.join('.'),
            issue.message,
          ]),
        ),
      );
      return;
    }
    setSiteErrors({});
    setSiteState('pending');
    await pause(scenario === 'slow' ? 1800 : 350);
    if (scenario === 'error') {
      setSiteState('error');
      return;
    }
    setSavedSite(site);
    setSiteState('saved');
    toast.success('站点已保存');
  }

  async function saveLimits() {
    if (limitsState === 'pending') return;
    const result = uploadSettingsInputSchema.safeParse(limits);
    if (!result.success) {
      setLimitErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [
            issue.path.join('.'),
            issue.message,
          ]),
        ),
      );
      return;
    }
    setLimitErrors({});
    setLimitsState('pending');
    await pause(scenario === 'slow' ? 1800 : 350);
    if (scenario === 'error') {
      setLimitsState('error');
      return;
    }
    setSavedLimits(limits);
    setLimitsState('saved');
    toast.success('上传限制已保存');
  }

  return (
    <div className="grid min-w-0 gap-5 pb-8">
      <Header title="站点设置" />
      <SettingsCategories items={basicCategory} onNavigate={navigate}>
        <div className="grid min-w-0 gap-5">
          <section className={sectionClass} data-testid="clarity-site-info">
            <SectionHeading
              title="站点信息"
              icon={<Globe />}
              help={
                <div className="flex shrink-0 items-center gap-1">
                  <SectionState state={siteState} dirty={siteDirty} />
                  <Help label="站点信息">
                    仅保存本组四项。时区只影响时间展示，不改变历史时间。
                  </Help>
                </div>
              }
            />
            {siteState === 'error' ? (
              <p role="alert" className="text-sm text-danger">
                站点未能保存，输入已保留。请重试。
              </p>
            ) : null}
            <form
              id="clarity-site-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveSite();
              }}
              className="min-w-0"
            >
              <fieldset
                disabled={siteState === 'pending'}
                className="grid min-w-0 gap-4 min-[1200px]:grid-cols-2 min-[1200px]:gap-5"
              >
                {siteFields.map((field) => (
                  <Field
                    key={field.name}
                    label={field.label}
                    type={'type' in field ? field.type : 'text'}
                    value={site[field.name]}
                    error={siteErrors[field.name]}
                    onChange={(value) => {
                      if (siteState === 'pending') return;
                      setSite((current) => ({
                        ...current,
                        [field.name]: value,
                      }));
                      setSiteErrors((current) => ({
                        ...current,
                        [field.name]: '',
                      }));
                      setSiteState('idle');
                    }}
                    help={
                      field.name === 'publicUrl' ? (
                        <Help label="公开地址">
                          HTTP(S) 根地址，不含路径。修改后需检查 OAuth 回调与 S3
                          直传。
                        </Help>
                      ) : field.name === 'timeZone' ? (
                        <Help label="时区">
                          使用 IANA 名称，例如 Asia/Shanghai 或 UTC。
                        </Help>
                      ) : undefined
                    }
                  />
                ))}
              </fieldset>
            </form>
          </section>

          <section className={sectionClass} data-testid="clarity-upload-limits">
            <SectionHeading
              title="上传限制"
              icon={<Upload />}
              help={
                <div className="flex shrink-0 items-center gap-1">
                  <SectionState state={limitsState} dirty={limitsDirty} />
                  <Help label="上传限制">
                    仅影响新提交，已开始的上传沿用原设置。同时传输数量固定为 3。
                  </Help>
                </div>
              }
            />
            {limitsState === 'error' ? (
              <p role="alert" className="text-sm text-danger">
                上传限制未能保存，输入已保留。请重试。
              </p>
            ) : null}
            <form
              id="clarity-limits-form"
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void saveLimits();
              }}
            >
              {uploadLimitFields.map((field) => (
                <div key={field.name} className="relative min-w-0">
                  <NumberField
                    value={limits[field.name]}
                    onChange={(value) => {
                      setLimits((current) => ({
                        ...current,
                        [field.name]: value ?? Number.NaN,
                      }));
                      setLimitErrors((current) => ({
                        ...current,
                        [field.name]: '',
                      }));
                      setLimitsState('idle');
                    }}
                    isDisabled={limitsState === 'pending'}
                    isInvalid={!!limitErrors[field.name]}
                    validationBehavior="aria"
                    formatOptions={{
                      useGrouping: false,
                      maximumFractionDigits: 20,
                    }}
                    commitBehavior="validate"
                    className="gap-2"
                  >
                    <Label className="flex min-h-11 items-center pr-14 text-sm font-medium">
                      {field.label}
                    </Label>
                    <NumberField.Group className="h-12 w-full rounded-lg border border-border bg-background shadow-none">
                      <NumberField.Input className="h-full w-full px-3 py-0 text-sm" />
                    </NumberField.Group>
                    <FieldError>{limitErrors[field.name]}</FieldError>
                  </NumberField>
                  <div className="absolute top-0 right-0">
                    <Help label={field.label}>{field.description}</Help>
                  </div>
                </div>
              ))}
            </form>
          </section>

          <section className={`${panelClass} overflow-hidden`}>
            <div className="px-4 pt-4 pb-3 min-[1200px]:px-6">
              <SectionHeading
                title="关联设置"
                icon={<SlidersHorizontal />}
                help={
                  <Help label="关联设置">
                    分别管理，不随站点或上传限制一起保存。
                  </Help>
                }
              />
            </div>
            <div className="divide-y divide-border border-t border-border">
              <RelatedRow
                title="Logo 与 Favicon"
                value="分别更新"
                icon={<Palette aria-hidden />}
                onPress={() => navigate('/settings/general/branding')}
              />
              <RelatedRow
                title="默认存储"
                value="默认本地存储"
                icon={<HardDrive aria-hidden />}
              />
              <RelatedRow
                title="图片默认值与外链版本"
                value="默认私有 · 原图"
                icon={<ImageIcon aria-hidden />}
              />
            </div>
          </section>
        </div>
      </SettingsCategories>
      <Footer>
        <div className="flex w-full flex-wrap justify-end gap-2 sm:gap-3">
          <SaveButton
            label="保存站点"
            disabled={siteState === 'pending'}
            pending={siteState === 'pending'}
            onPress={() => void saveSite()}
          />
          <SaveButton
            label="保存限制"
            disabled={limitsState === 'pending'}
            pending={limitsState === 'pending'}
            onPress={() => void saveLimits()}
          />
        </div>
      </Footer>
    </div>
  );
}

type BrandKind = 'logo' | 'favicon';
type BrandValue = {
  configured: boolean;
  url: string | null;
  name: string | null;
};
type BrandCandidate = { kind: BrandKind; url: string; name: string };
const brandLabels = { logo: 'Logo', favicon: 'Favicon' };
const brandFormats = {
  logo: 'PNG / JPEG / WebP / 静态 SVG',
  favicon: 'PNG / ICO / 静态 SVG',
};

export function BrandingPage() {
  const { navigate, scenario } = useApp();
  const [assets, setAssets] = useState<Record<BrandKind, BrandValue>>({
    logo: {
      configured: scenario !== 'empty',
      url: null,
      name: 'ariso-logo.svg',
    },
    favicon: { configured: false, url: null, name: null },
  });
  const [candidate, setCandidate] = useState<BrandCandidate | null>(null);
  const [removing, setRemoving] = useState<BrandKind | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Partial<Record<BrandKind, HTMLInputElement | null>>>(
    {},
  );
  const previewUrls = useRef<string[]>([]);
  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  function selectFile(kind: BrandKind, file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(`${brandLabels[kind]} 不能超过 5 MiB。`);
      return;
    }
    const url = URL.createObjectURL(file);
    previewUrls.current.push(url);
    setCandidate({ kind, url, name: file.name });
    setError(null);
  }
  async function saveBrand() {
    if (!candidate || pending) return;
    setPending(true);
    await pause(scenario === 'slow' ? 1800 : 350);
    setPending(false);
    if (scenario === 'error') {
      setError('未能保存，文件已保留。请重试。');
      return;
    }
    setAssets((current) => ({
      ...current,
      [candidate.kind]: {
        configured: true,
        url: candidate.url,
        name: candidate.name,
      },
    }));
    toast.success(`${brandLabels[candidate.kind]} 已更新`);
    setCandidate(null);
  }
  async function removeBrand() {
    if (!removing || pending) return;
    setPending(true);
    await pause(scenario === 'slow' ? 1800 : 350);
    setPending(false);
    if (scenario === 'error') {
      setError('未能移除，原文件保留。请重试。');
      return;
    }
    setAssets((current) => ({
      ...current,
      [removing]: { configured: false, url: null, name: null },
    }));
    toast.success(`${brandLabels[removing]} 已移除`);
    setRemoving(null);
    setError(null);
  }

  return (
    <div className="grid min-w-0 max-w-[960px] gap-5 pb-8">
      <Header
        title={candidate ? '品牌预览' : 'Logo 与 Favicon'}
        help={
          <Help label="品牌">分别更新，选择文件后预览。每份不超过 5 MiB。</Help>
        }
      >
        <Button
          variant="ghost"
          className={`${buttonClass} shrink-0`}
          isDisabled={pending}
          onPress={() => {
            if (candidate) {
              setCandidate(null);
              setError(null);
            } else navigate('/settings/general');
          }}
        >
          <ArrowLeft size={18} aria-hidden />
          返回
        </Button>
      </Header>
      {candidate ? (
        <section className={sectionClass}>
          <SectionHeading
            title={brandLabels[candidate.kind]}
            icon={<Palette />}
          />
          <div className="grid min-h-52 place-items-center overflow-hidden rounded-lg border border-border bg-background p-6">
            <img
              src={candidate.url}
              alt={`${brandLabels[candidate.kind]} 预览`}
              className="max-h-40 max-w-full object-contain"
            />
          </div>
          <p className="text-sm wrap-anywhere">{candidate.name}</p>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </section>
      ) : (
        <section
          className={`${panelClass} divide-y divide-border overflow-hidden`}
        >
          {(['logo', 'favicon'] as const).map((kind) => {
            const asset = assets[kind];
            return (
              <div
                key={kind}
                className="grid min-w-0 grid-cols-[80px_minmax(0,1fr)] items-center gap-4 p-4 min-[768px]:grid-cols-[96px_minmax(0,1fr)_auto] min-[768px]:gap-6 min-[768px]:p-6"
              >
                <div className="grid size-20 place-items-center overflow-hidden rounded-lg border border-border bg-background min-[768px]:size-24">
                  {asset.url ? (
                    <img
                      src={asset.url}
                      alt={`${brandLabels[kind]} 预览`}
                      className="size-18 object-contain"
                    />
                  ) : (
                    <span
                      className={`brand-wordmark ${kind === 'logo' ? 'text-[30px]!' : 'text-xl!'}`}
                    >
                      {kind === 'logo' ? 'Ariso' : 'A'}
                    </span>
                  )}
                </div>
                <div className="grid min-w-0 gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-medium">
                      {brandLabels[kind]}
                    </h2>
                    <span className="text-xs text-muted">
                      {asset.configured ? '自定义' : '内置'}
                    </span>
                  </div>
                  <p className="text-xs leading-5 text-muted">
                    {brandFormats[kind]} · 5 MiB
                  </p>
                  {asset.name && asset.configured ? (
                    <p className="text-xs wrap-anywhere">{asset.name}</p>
                  ) : null}
                </div>
                <div className="col-span-2 flex justify-end min-[768px]:col-span-1">
                  {asset.configured ? (
                    <ButtonGroup
                      aria-label={`${brandLabels[kind]} 操作`}
                      className={groupClass}
                    >
                      <ActionIconButton
                        label={`替换 ${brandLabels[kind]}`}
                        variant="outline"
                        onPress={() => inputs.current[kind]?.click()}
                      >
                        <Upload size={18} aria-hidden />
                      </ActionIconButton>
                      <ActionIconButton
                        label={`移除 ${brandLabels[kind]}`}
                        variant="outline"
                        className="text-danger"
                        onPress={() => {
                          setRemoving(kind);
                          setError(null);
                        }}
                      >
                        <ButtonGroup.Separator />
                        <Trash2 size={18} aria-hidden />
                      </ActionIconButton>
                    </ButtonGroup>
                  ) : (
                    <Button
                      className={buttonClass}
                      onPress={() => inputs.current[kind]?.click()}
                    >
                      <Upload size={17} aria-hidden />
                      选择文件
                    </Button>
                  )}
                </div>
                <input
                  ref={(node) => {
                    inputs.current[kind] = node;
                  }}
                  type="file"
                  accept={
                    kind === 'logo'
                      ? 'image/png,image/jpeg,image/webp,image/svg+xml'
                      : 'image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml'
                  }
                  hidden
                  aria-label={`选择 ${brandLabels[kind]} 文件`}
                  onChange={(event) => {
                    selectFile(kind, event.currentTarget.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
              </div>
            );
          })}
        </section>
      )}
      {error && !candidate && !removing ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {candidate ? (
        <Footer>
          <div className="flex w-full justify-end gap-3">
            <Button
              variant="outline"
              className={buttonClass}
              isDisabled={pending}
              onPress={() => {
                setCandidate(null);
                setError(null);
              }}
            >
              取消
            </Button>
            <SaveButton
              disabled={pending}
              pending={pending}
              onPress={() => void saveBrand()}
            />
          </div>
        </Footer>
      ) : null}
      {removing ? (
        <Dialog
          title={`移除 ${brandLabels[removing]}？`}
          onClose={() => {
            if (!pending) {
              setRemoving(null);
              setError(null);
            }
          }}
          footer={
            <>
              <Button
                variant="outline"
                className={buttonClass}
                isDisabled={pending}
                onPress={() => {
                  setRemoving(null);
                  setError(null);
                }}
              >
                取消
              </Button>
              <Button
                variant="danger"
                className={buttonClass}
                isDisabled={pending}
                isPending={pending}
                onPress={() => void removeBrand()}
              >
                移除
              </Button>
            </>
          }
        >
          <p className="text-sm">移除后使用内置标识，可重新上传。</p>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}
