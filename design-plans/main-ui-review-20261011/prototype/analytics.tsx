/* eslint-disable @next/next/no-img-element -- This standalone prototype has no Next.js image server. */
import { useState, type ReactNode } from 'react';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Modal } from '@heroui/react/modal';
import { Table } from '@heroui/react/table';
import { ToggleButton } from '@heroui/react/toggle-button';
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { Tooltip as ControlTooltip } from '@heroui/react/tooltip';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cloud,
  Folder,
  HardDrive,
  Images,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Footer, Help, Metric, PageHeader, usePrototype } from './shared';

type Days = 7 | 30 | 90;
type TrendPoint = { date: string; count: number };
type PopularImage = { id: string; name: string; src: string; share: number };

const number = (value: number) => new Intl.NumberFormat('zh-CN').format(value);
const lastWeek = [472, 620, 551, 753, 682, 916, 734];
const popularImages: PopularImage[] = [
  {
    id: 'forest',
    name: '林间晨光.jpg',
    src: '/samples/forest.jpg',
    share: 0.32,
  },
  {
    id: 'mountain',
    name: '雪山与湖泊.jpg',
    src: '/samples/mountain.jpg',
    share: 0.24,
  },
];

function getTrend(days: Days, empty: boolean): TrendPoint[] {
  return Array.from({ length: days }, (_, index) => {
    const offset = days - index - 1;
    const date = new Date(Date.UTC(2026, 9, 11 - offset));
    const count =
      offset < 7 ? lastWeek[6 - offset] : 300 + ((offset * 83) % 490);
    return { date: date.toISOString().slice(0, 10), count: empty ? 0 : count };
  });
}

function Versions({ total }: { total: number }) {
  const original = Math.round(total * 0.21);
  const watermark = Math.round(total * 0.12);
  const rows = [
    { label: '原图', value: original, color: 'var(--foreground)' },
    { label: '压缩图', value: total - original - watermark, color: '#55a49d' },
    { label: '水印图', value: watermark, color: 'var(--accent)' },
  ];
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  return (
    <dl className="grid gap-5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3 text-sm">
          <dt className="w-14 shrink-0">{row.label}</dt>
          <dd className="flex min-w-0 flex-1 items-center gap-3">
            <span
              className="h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-default"
              aria-hidden
            >
              <span
                className="block h-full origin-left rounded-sm"
                style={{
                  background: row.color,
                  width: `${(row.value / maximum) * 100}%`,
                }}
              />
            </span>
            <span className="w-20 shrink-0 text-right tabular-nums">
              {number(row.value)} 次
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RefreshButton({ onRefresh }: { onRefresh: () => void }) {
  return (
    <ControlTooltip>
      <Button
        isIconOnly
        variant="ghost"
        className="prototype-icon-button"
        aria-label="刷新数据"
        onPress={onRefresh}
      >
        <RefreshCw size={18} aria-hidden />
      </Button>
      <ControlTooltip.Content>刷新数据</ControlTooltip.Content>
    </ControlTooltip>
  );
}

function Dialog({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container
          placement="center"
          scroll="inside"
          className="w-full p-4"
        >
          <Modal.Dialog
            className="max-h-[calc(100dvh-32px)] w-full max-w-2xl gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6"
            aria-label={title}
          >
            <Modal.Header className="flex items-start justify-between gap-3 p-0">
              <Modal.Heading className="min-w-0 break-words text-lg font-semibold">
                {title}
              </Modal.Heading>
              <CloseButton
                className="size-11 shrink-0"
                aria-label="关闭"
                onPress={onClose}
              />
            </Modal.Header>
            <Modal.Body className="m-0 grid min-h-0 gap-6 overflow-y-auto p-0">
              {children}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function DashboardPage() {
  const { scenario, navigate, notify } = usePrototype();
  const empty = scenario === 'empty';
  const attention = scenario === 'attention';
  const [updated, setUpdated] = useState('09:35');
  const refresh = () => {
    setUpdated('刚刚');
    notify('数据已刷新');
  };
  return (
    <div className="prototype-page">
      <PageHeader
        title="总览"
        help={
          <Help label="资源与占用说明">
            <p>
              图片数量不含回收站。已登记占用按 Ariso
              对象记录计算，不是整机磁盘容量。
            </p>
            <p>有对象待核对时，总占用尚未确认。</p>
          </Help>
        }
      >
        <RefreshButton onRefresh={refresh} />
        <Button
          variant="primary"
          className="prototype-button"
          onPress={() => navigate('/upload')}
        >
          <Upload size={18} aria-hidden />
          上传
        </Button>
      </PageHeader>

      <div className="prototype-metrics">
        <Metric
          label="图片"
          value={empty ? '0' : '1,248'}
          icon={<Images size={19} aria-hidden />}
        />
        <Metric
          label="相册"
          value={empty ? '0' : '16'}
          icon={<Folder size={19} aria-hidden />}
        />
        <Metric
          label="回收站"
          value={empty ? '0' : '23'}
          icon={<Trash2 size={19} aria-hidden />}
        />
        <Metric
          label="已登记占用"
          value={empty ? '0 B' : '1.4 GiB'}
          icon={<HardDrive size={19} aria-hidden />}
        >
          {attention ? (
            <span className="flex items-center gap-1.5 text-xs text-warning">
              <Clock3 size={13} aria-hidden />8 个对象待核对
            </span>
          ) : null}
        </Metric>
      </div>

      <section className="prototype-section">
        <h2 className="prototype-heading mb-4">待处理</h2>
        {attention ? (
          <div className="grid">
            <Button
              variant="ghost"
              className="prototype-row h-auto min-h-16 w-full justify-start gap-3 rounded-lg px-2 py-3 text-left"
              onPress={() => navigate('/library?failure=initial')}
            >
              <CircleAlert
                size={19}
                className="shrink-0 text-danger"
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-sm">初次处理失败</span>
              <strong className="text-sm font-medium">3 张</strong>
              <ChevronRight size={17} aria-hidden />
            </Button>
            <Button
              variant="ghost"
              className="prototype-row h-auto min-h-16 w-full justify-start gap-3 rounded-lg px-2 py-3 text-left"
              onPress={() => navigate('/library?failure=reprocess')}
            >
              <RefreshCw
                size={19}
                className="shrink-0 text-warning"
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-sm">重新处理失败</span>
              <strong className="text-sm font-medium">1 张</strong>
              <ChevronRight size={17} aria-hidden />
            </Button>
          </div>
        ) : (
          <div className="flex min-h-20 items-center gap-3 border-b border-border text-sm">
            <CheckCircle2 size={21} className="text-success" aria-hidden />
            没有待处理事项
          </div>
        )}
      </section>

      <section className="prototype-section">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="prototype-heading">存储</h2>
          <Button
            variant="ghost"
            className="prototype-button"
            onPress={() => navigate('/settings/storage')}
          >
            管理存储
            <ArrowRight size={16} aria-hidden />
          </Button>
        </div>
        <div className="prototype-row min-h-20 gap-3 py-3">
          <HardDrive size={21} className="shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm">默认本地存储</p>
            <p className="prototype-muted mt-1 text-xs">已启用 · 默认</p>
          </div>
          <span className="text-sm font-medium tabular-nums">
            {empty ? '0 B' : '426 MiB'}
          </span>
        </div>
        {!empty ? (
          <div className="prototype-row min-h-20 gap-3 py-3">
            <Cloud size={21} className="shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm">旅行照片归档</p>
              <p className="prototype-muted mt-1 text-xs">已停用</p>
            </div>
            <span className="text-sm font-medium tabular-nums">1.0 GiB</span>
          </div>
        ) : null}
        {attention ? (
          <p
            className="mt-4 flex items-center gap-2 text-sm text-warning"
            role="status"
          >
            <Clock3 size={16} className="shrink-0" aria-hidden />8
            个对象待核对，总占用尚未确认。
          </p>
        ) : null}
      </section>

      <Footer>
        <span className="prototype-muted text-xs">更新于 {updated}</span>
        <Button
          variant="outline"
          className="prototype-button"
          onPress={() => navigate('/analytics?view=usage')}
        >
          <HardDrive size={17} aria-hidden />
          占用明细
        </Button>
      </Footer>
    </div>
  );
}

export function AnalyticsPage() {
  const { scenario, navigate, notify } = usePrototype();
  const empty = scenario === 'empty';
  const attention = scenario === 'attention';
  const [days, setDays] = useState<Days>(7);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<PopularImage | null>(null);
  const [updated, setUpdated] = useState('09:35');
  const trend = getTrend(days, empty);
  const total = trend.reduce((sum, point) => sum + point.count, 0);
  const range = `${trend[0].date.replaceAll('-', '/')} - ${trend[trend.length - 1].date.replaceAll('-', '/')}`;
  const refresh = () => {
    setUpdated('刚刚');
    notify('统计已刷新');
  };
  return (
    <div className="prototype-page">
      <PageHeader
        title="访问统计"
        help={
          <Help label="访问统计说明">
            <p>统计公开图片的有效内容请求，不代表独立访客。</p>
            <p>
              趋势、版本分布与热门图片使用同一周期。今日和累计访问不随周期改变。
            </p>
            <p>永久删除的图片不参与热门排行，历史访问和累计数保留。</p>
          </Help>
        }
      >
        <RefreshButton onRefresh={refresh} />
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleButtonGroup
          aria-label="统计周期"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([String(days)])}
          onSelectionChange={(keys) => {
            const next = Number([...keys][0]);
            if (next === 7 || next === 30 || next === 90) setDays(next);
          }}
          isDetached
          className="flex gap-2 rounded-none bg-transparent p-0"
        >
          {([7, 30, 90] as const).map((value) => (
            <ToggleButton
              key={value}
              id={String(value)}
              className="h-11 min-w-20 rounded-lg border border-border bg-surface px-4 text-sm text-foreground data-[selected=true]:border-accent data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
            >
              {value} 天
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <span className="prototype-muted text-xs">更新于 {updated}</span>
      </div>

      {attention ? (
        <div
          className="flex items-center gap-2 rounded-lg bg-warning/10 px-4 py-3 text-sm"
          role="status"
        >
          <Clock3 size={18} className="shrink-0 text-warning" aria-hidden />
          <span>统计写入延迟，部分访问尚未计入。</span>
        </div>
      ) : null}

      <div className="prototype-analytics-metrics grid grid-cols-3 gap-3 sm:gap-4">
        <Metric
          label={`最近 ${days} 天`}
          value={number(total)}
          icon={<CalendarDays size={19} aria-hidden />}
        />
        <Metric
          label="今日访问"
          value={empty ? '0' : '734'}
          icon={<BarChart3 size={19} aria-hidden />}
        />
        <Metric
          label="累计访问"
          value={empty ? '0' : '84,629'}
          icon={<Images size={19} aria-hidden />}
        />
      </div>

      <section className="prototype-section">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="prototype-heading">访问趋势</h2>
          <Button
            variant="ghost"
            className="prototype-button"
            onPress={() => setDailyOpen(true)}
          >
            <CalendarDays size={16} aria-hidden />
            每日数值
          </Button>
        </div>
        <div className="prototype-muted mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>{range}</span>
          <span>访问量（次）</span>
        </div>
        <div className="h-[220px] min-w-0 text-xs sm:h-[252px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart
              data={trend}
              accessibilityLayer
              margin={{ top: 12, right: 12, bottom: 2, left: -18 }}
              aria-label={`最近 ${days} 天每日公开访问量，数值也可在每日数值中查看`}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tickFormatter={(date: string) =>
                  date.slice(5).replace('-', '/')
                }
                tickLine={false}
                axisLine={false}
                minTickGap={40}
                stroke="var(--muted)"
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={56}
                stroke="var(--muted)"
                domain={empty ? [0, 1] : [0, 'auto']}
              />
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: 'var(--border)' }}
                content={({ active, label, payload }) =>
                  active && payload.length ? (
                    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm">
                      {label} · {number(Number(payload[0].value))} 次
                    </div>
                  ) : null
                }
              />
              <Line
                type="monotone"
                dataKey="count"
                name="访问量"
                stroke="#358e87"
                strokeWidth={2.5}
                dot={days === 7 ? { r: 3, fill: '#358e87' } : false}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {empty ? (
          <p className="prototype-muted mt-3 text-center text-sm">
            本周期暂无访问
          </p>
        ) : null}
      </section>

      <div className="grid min-w-0 gap-8 min-[1000px]:grid-cols-[0.8fr_1.2fr]">
        <section className="prototype-section">
          <h2 className="prototype-heading mb-6">版本分布</h2>
          <Versions total={total} />
        </section>
        <section className="prototype-section">
          <h2 className="prototype-heading mb-3">热门图片</h2>
          {empty ? (
            <div className="prototype-muted flex min-h-36 items-center justify-center gap-3 text-sm">
              <Images size={22} aria-hidden />
              暂无热门图片
            </div>
          ) : (
            <ol className="grid">
              {popularImages.map((image, index) => (
                <li
                  key={image.id}
                  className="border-b border-border last:border-0"
                >
                  <Button
                    variant="ghost"
                    className="h-auto min-h-22 w-full justify-start gap-3 rounded-lg px-2 py-3 text-left"
                    aria-label={`查看${image.name}统计`}
                    onPress={() => setSelectedImage(image)}
                  >
                    <span className="prototype-muted w-5 shrink-0 text-xs tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <img
                      src={image.src}
                      alt=""
                      className="size-12 shrink-0 rounded-lg object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {image.name}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">
                      {number(Math.round(total * image.share))}
                      <span className="prototype-muted ml-1 text-xs">次</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0" aria-hidden />
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <Footer>
        <span className="prototype-muted text-xs">Asia/Shanghai</span>
        <Button
          variant="outline"
          className="prototype-button"
          onPress={() => navigate('/analytics?view=usage')}
        >
          <HardDrive size={17} aria-hidden />
          当前占用
        </Button>
      </Footer>

      <Dialog
        title="每日访问"
        open={dailyOpen}
        onClose={() => setDailyOpen(false)}
      >
        <p className="prototype-muted text-xs">{range} · Asia/Shanghai</p>
        <Table className="rounded-none border-0 bg-transparent shadow-none [&_[data-slot=table-header]]:bg-transparent [&_[data-slot=table-column]]:rounded-none [&_[data-slot=table-column]]:bg-transparent [&_[data-slot=table-column]]:after:hidden [&_[data-slot=table-cell]]:rounded-none [&_[data-slot=table-cell]]:bg-transparent [&_[data-slot=table-row]]:bg-transparent">
          <Table.Content
            aria-label={`最近 ${days} 天每日访问量`}
            className="w-full text-sm"
          >
            <Table.Header>
              <Table.Column isRowHeader className="px-0 text-sm font-medium">
                日期
              </Table.Column>
              <Table.Column className="px-0 text-right text-sm font-medium">
                访问量（次）
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {[...trend].reverse().map((point, index) => (
                <Table.Row key={point.date} id={point.date} className="h-12">
                  <Table.Cell className="px-0">
                    {point.date}
                    {index === 0 ? (
                      <span className="prototype-muted ml-2 text-xs">今日</span>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell className="px-0 text-right tabular-nums">
                    {number(point.count)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table>
      </Dialog>

      <Dialog
        title="图片统计"
        open={selectedImage !== null}
        onClose={() => setSelectedImage(null)}
      >
        {selectedImage ? (
          <>
            <div className="flex min-w-0 items-center gap-4">
              <img
                src={selectedImage.src}
                alt=""
                className="size-16 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">
                  {selectedImage.name}
                </p>
                <p className="prototype-muted mt-1 text-xs">累计访问</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {number(Math.round(84629 * selectedImage.share))}
                </p>
              </div>
            </div>
            <section>
              <h3 className="mb-5 text-sm font-medium">累计版本访问</h3>
              <Versions total={Math.round(84629 * selectedImage.share)} />
            </section>
            <section>
              <h3 className="mb-3 text-sm font-medium">近期访问</h3>
              <dl className="grid gap-3">
                {([7, 30, 90] as const).map((period) => (
                  <div
                    key={period}
                    className="flex items-center justify-between border-b border-border py-3 text-sm last:border-0"
                  >
                    <dt>{period} 天</dt>
                    <dd className="tabular-nums">
                      {number(
                        Math.round(
                          getTrend(period, false).reduce(
                            (sum, point) => sum + point.count,
                            0,
                          ) * selectedImage.share,
                        ),
                      )}{' '}
                      次
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </>
        ) : null}
      </Dialog>
    </div>
  );
}
