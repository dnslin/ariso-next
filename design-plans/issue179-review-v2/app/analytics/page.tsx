'use client';

import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { imageSample, rankingCounts } from './sample';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Modal } from '@heroui/react/modal';
import { CloseButton } from '@heroui/react/close-button';
import { Tabs } from '@heroui/react/tabs';
import { ToggleButton } from '@heroui/react/toggle-button';
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { Popover } from '@heroui/react/popover';
import { Tooltip } from '@heroui/react/tooltip';
import { Spinner } from '@heroui/react/spinner';
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  CircleAlert,
  Clock3,
  CloudUpload,
  Eye,
  Folder,
  HardDrive,
  Images,
  Info,
  LayoutDashboard,
  Link as LinkIcon,
  Moon,
  RefreshCw,
  SlidersHorizontal,
  Sun,
  Tags,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { AdminShell } from '../../../../src/components/shell/admin-shell';

const VersionChart = dynamic(
  () => import('./charts').then((m) => m.VersionChart),
  { ssr: false },
);
const PeriodChart = dynamic(
  () => import('./charts').then((m) => m.PeriodChart),
  { ssr: false },
);
const TrendChart = dynamic(() => import('./charts').then((m) => m.TrendChart), {
  ssr: false,
});
const names = [
  '林间晨光',
  '沿海公路的清晨与远处的灯塔',
  '远山',
  '周末餐桌',
  '城市一角',
  '雨后的街道',
  '已回收图片 · c92b',
  '树影',
  '暮色',
  '山间小路',
];

const stateNames = {
  ready: '有访问',
  zero: '零访问',
  loading: '加载',
  error: '读取失败',
  stale: '旧数据',
  delay: '写入延迟',
  incomplete: '漏计',
  missing: '不存在',
};
type State = keyof typeof stateNames;
const icons = [
  LayoutDashboard,
  CloudUpload,
  Images,
  Folder,
  Tags,
  LinkIcon,
  Trash2,
  ChartNoAxesCombined,
  HardDrive,
  SlidersHorizontal,
];
const navLabels = [
  '总览',
  '上传',
  '图库',
  '相册',
  '标签',
  '分享管理',
  '回收站',
  '访问统计',
  '存储管理',
  '站点设置',
];
const navPaths = [
  '/dashboard',
  '/upload',
  '/library',
  '/albums',
  '/tags',
  '/shares',
  '/trash',
  '/analytics',
  '/settings/storage',
  '/settings/general',
];
const navigation = navLabels.map((label, i) => {
  const Icon = icons[i];
  return {
    label,
    href:
      i === 7 ? '/analytics' : `http://ariso-179.localhost:4180${navPaths[i]}`,
    icon: <Icon />,
    ...(i === 7 ? { section: '管理' } : {}),
  };
});

function IconButton({
  label,
  children,
  onPress,
}: {
  label: string;
  children: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Tooltip delay={350}>
      <Button
        isIconOnly
        variant="ghost"
        className="icon-button"
        aria-label={label}
        onPress={onPress}
      >
        {children}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}
function InfoTip({
  label = '统计口径',
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <Button
        isIconOnly
        variant="ghost"
        className="icon-button"
        aria-label={label}
      >
        <Info size={18} />
      </Button>
      <Popover.Content placement="bottom end">
        <Popover.Dialog className="info-popover">
          <Popover.Heading>{label}</Popover.Heading>
          <p>{children}</p>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
function Thumb({
  index = 0,
  small = false,
}: {
  index?: number;
  small?: boolean;
}) {
  return (
    <Image
      width={240}
      height={180}
      className={small ? 'thumb thumb-small' : 'thumb'}
      src={index % 2 ? '/sample-photo-2.jpg' : '/sample-photo.jpg'}
      style={{ objectPosition: `${25 + index * 9}% ${35 + index * 4}%` }}
      alt=""
    />
  );
}
function SectionTitle({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function Prototype() {
  const [scene, setScene] = useState('ranking');
  const [selected, setSelected] = useState<number | null>(0);
  const [state, setState] = useState<State>('ready');
  const [dark, setDark] = useState(false);
  const [days, setDays] = useState(7);
  const [failure, setFailure] = useState('initial');
  const [repaired, setRepaired] = useState<number[]>([]);
  const zero = state === 'zero';
  const imageName = selected === null ? '' : names[selected];
  const sample = imageSample(selected ?? 0);
  const periodIndex = days === 7 ? 0 : days === 30 ? 1 : 2;
  const reset = () => setState('ready');
  const theme = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    setDark(next);
  };
  const open = (i: number) => {
    setSelected(i);
    setState('ready');
  };
  return (
    <AdminShell
      name="Ariso"
      navigation={navigation}
      user={
        <div className="preview-account">
          <span>A</span>
          <div>
            预览账号<small>设计原型</small>
          </div>
        </div>
      }
    >
      <div className="prototype-page">
        <div className="prototype-toolbar">
          <span>
            原型 02 <i /> 示例数据
          </span>
          <div>
            <a href="http://127.0.0.1:4179/">第一版</a>
            <IconButton label={dark ? '切换浅色' : '切换深色'} onPress={theme}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </IconButton>
          </div>
        </div>
        <div className="page-heading">
          <div>
            <h1>{scene === 'ranking' ? '访问统计' : '处理异常'}</h1>
          </div>
          <InfoTip>
            公开图片的有效内容请求，近似统计；所有者浏览不计数，S3签发不代表完整下载。
          </InfoTip>
        </div>
        <Tabs
          selectedKey={scene}
          onSelectionChange={(key) => setScene(String(key))}
          variant="secondary"
          className="scene-tabs"
        >
          <Tabs.List aria-label="原型场景">
            <Tabs.Tab id="ranking">
              <ChartNoAxesCombined size={17} />
              访问统计
            </Tabs.Tab>
            <Tabs.Tab id="failures">
              <CircleAlert size={17} />
              处理异常
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
        {scene === 'ranking' ? (
          <div className="page-flow">
            <div className="overview-summary">
              <div>
                <span>
                  <Eye size={16} />
                  累计访问
                </span>
                <strong>
                  24,816<small>次</small>
                </strong>
              </div>
              <div>
                <span>今日访问</span>
                <strong>
                  186<small>次</small>
                </strong>
              </div>
              <div>
                <span>
                  <Images size={16} />
                  图片数量
                </span>
                <strong>
                  128<small>张</small>
                </strong>
              </div>
            </div>
            <Card className="proto-card trend-card">
              <SectionTitle
                icon={<ChartNoAxesCombined size={18} />}
                title="公开访问趋势"
              >
                <ToggleButtonGroup
                  selectionMode="single"
                  disallowEmptySelection
                  selectedKeys={new Set([String(days)])}
                  onSelectionChange={(keys) => setDays(Number([...keys][0]))}
                  className="periods"
                >
                  {[7, 30, 90].map((d) => (
                    <ToggleButton key={d} id={String(d)}>
                      {d}天
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </SectionTitle>
              <TrendChart days={days} />
              <div className="chart-caption">
                <Clock3 size={14} />
                今日截至 14:32<span>Asia/Shanghai</span>
              </div>
            </Card>
            <Card className="proto-card ranking-card">
              <SectionTitle icon={<BarChart3 size={18} />} title="热门图片">
                <span className="quiet">近{days}天</span>
              </SectionTitle>
              <div className="ranking-list">
                {names.map((name, i) => (
                  <Button
                    key={name}
                    variant="ghost"
                    className="rank-row"
                    onPress={() => open(i)}
                    aria-label={`查看${name}统计`}
                  >
                    <span className="rank-index">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {i === 6 ? (
                      <span className="thumb thumb-small unavailable-thumb">
                        <Trash2 size={18} />
                      </span>
                    ) : (
                      <Thumb index={i} small />
                    )}
                    <span className="rank-graph">
                      <span className="rank-name">{name}</span>
                      <span className="rank-track">
                        <span
                          style={{
                            transform: `scaleX(${rankingCounts[i] / 186})`,
                          }}
                        />
                      </span>
                    </span>
                    <strong>
                      {imageSample(i).periods[periodIndex].toLocaleString()}
                      <small>次</small>
                    </strong>
                    <ArrowUpRight className="rank-arrow" size={16} />
                  </Button>
                ))}
              </div>
            </Card>
            <Button
              className="failure-entry"
              variant="outline"
              onPress={() => setScene('failures')}
            >
              <CircleAlert size={18} />
              <span>3 张图片需要处理</span>
              <ArrowUpRight size={16} />
            </Button>
          </div>
        ) : (
          <div className="page-flow">
            <div className="failure-toolbar">
              <ToggleButtonGroup
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={new Set([failure])}
                onSelectionChange={(keys) => setFailure(String([...keys][0]))}
              >
                <ToggleButton id="initial">
                  <CircleAlert size={16} />
                  初次处理<span className="count-badge">2</span>
                </ToggleButton>
                <ToggleButton id="reprocess">
                  <RefreshCw size={16} />
                  重新处理<span className="count-badge">1</span>
                </ToggleButton>
              </ToggleButtonGroup>
              {failure === 'reprocess' ? (
                <InfoTip label="重处理状态">
                  上次生成的版本仍可使用。重新处理会再次执行当前图片的处理流程。
                </InfoTip>
              ) : null}
            </div>
            <div className="failure-grid">
              {(failure === 'initial' ? [0, 1] : [4]).map((i) => (
                <Card className="failure-card" key={`${failure}-${i}`}>
                  <Button
                    variant="ghost"
                    className="failure-image"
                    aria-label={`查看${names[i]}统计`}
                    onPress={() => open(i)}
                  >
                    <Thumb index={i} />
                    <span className="image-status">
                      {repaired.includes(i) ? (
                        <Check size={14} />
                      ) : (
                        <CircleAlert size={14} />
                      )}
                      {repaired.includes(i) ? '已提交重试' : '处理失败'}
                    </span>
                  </Button>
                  <div className="failure-card-body">
                    <h2>{names[i]}</h2>
                    <span className="quiet">
                      {failure === 'initial' ? '初次处理' : '重新处理'}
                    </span>
                    <div>
                      <Button variant="outline" onPress={() => open(i)}>
                        <BarChart3 size={16} />
                        统计
                      </Button>
                      <Button
                        variant="primary"
                        isDisabled={repaired.includes(i)}
                        onPress={() => setRepaired([...repaired, i])}
                      >
                        <RefreshCw size={16} />
                        {repaired.includes(i) ? '已提交' : '重试'}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
        <Modal.Backdrop
          className="statistics-backdrop"
          isOpen={selected !== null}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          <Modal.Container
            placement="center"
            scroll="inside"
            className="statistics-container"
          >
            <Modal.Dialog
              className="statistics-dialog"
              aria-label="图片访问统计"
            >
              <Modal.Header className="statistics-header">
                <div className="image-identity">
                  <Thumb index={selected ?? 0} />
                  <div>
                    <span className="eyebrow">图片访问统计</span>
                    <Modal.Heading>{imageName}</Modal.Heading>
                    <span className="quiet">
                      <span className="status-dot" />
                      {selected === 6 ? '回收站' : '公开图片'}
                      <span className="identity-separator">·</span>JPG
                    </span>
                  </div>
                </div>
                <div className="dialog-actions">
                  <CloseButton
                    aria-label="关闭图片统计"
                    className="icon-button"
                    onPress={() => setSelected(null)}
                  />
                </div>
              </Modal.Header>
              <Modal.Body className="statistics-body">
                {state === 'loading' ? (
                  <div className="empty-state" role="status">
                    <Spinner size="lg" />
                    <h2>正在读取统计</h2>
                  </div>
                ) : state === 'error' || state === 'missing' ? (
                  <div className="empty-state" role="alert">
                    <CircleAlert size={30} />
                    <h2>
                      {state === 'error'
                        ? '统计暂时无法读取'
                        : '图片记录已不存在'}
                    </h2>
                    {state === 'error' ? (
                      <Button variant="outline" onPress={reset}>
                        <RefreshCw size={16} />
                        重试
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onPress={() => setSelected(null)}
                      >
                        <ArrowLeft size={16} />
                        返回{scene === 'ranking' ? '排行' : '异常图片'}
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {state === 'stale' ||
                    state === 'delay' ||
                    state === 'incomplete' ? (
                      <div className="inline-state" role="status">
                        <TriangleAlert size={17} />
                        <span>
                          {state === 'stale'
                            ? '刷新失败 · 保留上次统计'
                            : state === 'delay'
                              ? '写入延迟 · 部分访问尚未计入'
                              : '统计有漏计 · 已丢失的访问不会补回'}
                        </span>
                        {state === 'stale' ? (
                          <Button
                            isIconOnly
                            variant="ghost"
                            aria-label="重试统计"
                            onPress={reset}
                          >
                            <RefreshCw size={16} />
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="image-total">
                      <div>
                        <span className="quiet">
                          <Eye size={15} />
                          累计访问
                        </span>
                        <strong>
                          {zero ? '0' : sample.cumulative.toLocaleString()}
                          <small>次</small>
                        </strong>
                      </div>
                      <InfoTip>
                        累计包含原图、压缩图和水印图的公开内容请求，缩略图与所有者访问不计数。
                      </InfoTip>
                    </div>
                    <section className="version-section">
                      <SectionTitle
                        icon={<BarChart3 size={18} />}
                        title="访问版本"
                      />
                      <VersionChart zero={zero} values={sample.versions} />
                    </section>
                    <section className="period-section">
                      <SectionTitle
                        icon={<CalendarDays size={18} />}
                        title="近期访问"
                      >
                        <InfoTip label="周期范围">
                          近7天：10/03–10/09；近30天：09/10–10/09；近90天：07/12–10/09。均包含今日，相互包含，不能相加。
                        </InfoTip>
                      </SectionTitle>
                      <PeriodChart zero={zero} values={sample.periods} />
                      {zero ? <p className="zero-note">暂无公开访问</p> : null}
                    </section>
                  </>
                )}
              </Modal.Body>
              <Modal.Footer className="statistics-footer">
                <span>
                  <Clock3 size={14} />
                  {state === 'stale'
                    ? '上次 14:22'
                    : state === 'loading' ||
                        state === 'error' ||
                        state === 'missing'
                      ? '尚未取得统计'
                      : '更新于 14:32'}
                  <span className="footer-timezone"> · Asia/Shanghai</span>
                </span>
                <div className="footer-tools">
                  <IconButton
                    label={dark ? '切换浅色' : '切换深色'}
                    onPress={theme}
                  >
                    {dark ? <Sun size={18} /> : <Moon size={18} />}
                  </IconButton>
                  <InfoTip>
                    近似统计，今日截至本次更新。每日记录保留365天；异常退出可能丢失未写入访问。
                  </InfoTip>
                </div>
              </Modal.Footer>
              <div className="state-switch">
                <span>原型状态</span>
                <select
                  aria-label="原型状态"
                  value={state}
                  onChange={(e) => setState(e.target.value as State)}
                >
                  {Object.entries(stateNames).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </div>
    </AdminShell>
  );
}
