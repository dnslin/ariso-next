import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { ComboBox } from '@heroui/react/combo-box';
import { Description } from '@heroui/react/description';
import { FieldError } from '@heroui/react/field-error';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import {
  ProcessingNumber,
  ProcessingSelect,
  ProcessingSwitch,
} from '../../../src/components/processing/fields';
import {
  SettingsCategories,
  SettingsHeading,
  settingsCategories,
} from '../../../src/components/shell/settings-categories';
import { Footer, buttonClass, cardClass, usePrototype } from './shared';

const categories = settingsCategories.filter((item) =>
  ['/settings/general', '/settings/processing'].includes(item.href),
);
const zones = [
  ...new Set(['UTC', ...Intl.supportedValuesOf('timeZone'), 'Asia/Shanghai']),
].sort();

export function SiteDemo() {
  const { mode, navigate } = usePrototype();
  const [timeZone, setTimeZone] = useState('Asia/Shanghai');
  const [query, setQuery] = useState('Asia/Shanghai');
  const [saved, setSaved] = useState('Asia/Shanghai');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const matching = zones.filter((zone) =>
    zone.toLowerCase().includes(query.toLowerCase()),
  );
  const items = matching.map((id) => ({ id }));
  const save = () => {
    const value = timeZone;
    if (!zones.includes(value)) {
      setError(
        mode === 'before' ? '请选择有效的 IANA 时区' : '请从列表中选择有效时区',
      );
      return;
    }
    setSaved(value);
    setError('');
    setMessage(
      '站点时区已更新。后续时间按新时区显示，历史记录的 UTC 时间点保持不变。',
    );
  };
  return (
    <div className="grid min-w-0 gap-5 pb-8">
      <Footer>
        <Button className={buttonClass} onPress={save}>
          保存站点
        </Button>
      </Footer>
      <SettingsHeading />
      <SettingsCategories items={categories} onNavigate={navigate}>
        <Card className={cardClass}>
          <h2 className="text-lg font-medium">站点信息</h2>
          <p className="text-sm text-muted">
            时区只改变时间展示，不改写历史 UTC 时间。
          </p>
          <div className="grid gap-4 min-[1200px]:grid-cols-2">
            <label className="grid gap-2 text-sm">
              站点名称
              <input
                value="Ariso"
                readOnly
                className="h-12 rounded-lg border border-border bg-background px-3"
              />
            </label>
            <label className="grid gap-2 text-sm">
              公开地址
              <input
                value="https://example.com"
                readOnly
                className="h-12 rounded-lg border border-border bg-background px-3"
              />
            </label>
            {mode === 'before' ? (
              <label className="grid gap-2 text-sm">
                站点时区
                <input
                  aria-label="站点时区"
                  value={timeZone}
                  onChange={(event) => {
                    setTimeZone(event.target.value);
                    setError('');
                    setMessage('');
                  }}
                  className="h-12 rounded-lg border border-border bg-background px-3"
                />
                {error ? (
                  <span role="alert" className="text-danger">
                    {error}
                  </span>
                ) : null}
              </label>
            ) : (
              <ComboBox
                className="gap-1.5"
                items={items}
                inputValue={query}
                onInputChange={(value) => {
                  setQuery(value);
                  if (value !== timeZone) setTimeZone('');
                  setError('');
                  setMessage('');
                }}
                value={timeZone || null}
                onChange={(value) => {
                  setTimeZone(value ? String(value) : '');
                  setQuery(value ? String(value) : '');
                  setError('');
                }}
                allowsEmptyCollection
                isInvalid={!!error}
                validationBehavior="aria"
                menuTrigger="input"
              >
                <Label className="text-sm font-normal after:content-none">
                  站点时区
                </Label>
                <ComboBox.InputGroup className="w-full">
                  <Input className="h-12 min-h-12 w-full rounded-lg border bg-background shadow-none" />
                  <ComboBox.Trigger aria-label="选择时区" />
                </ComboBox.InputGroup>
                <Description>
                  搜索并选择有效时区；当前保存值不会因浏览器推荐而改变。
                </Description>
                <FieldError>{error}</FieldError>
                <ComboBox.Popover>
                  <ListBox<{ id: string }>
                    renderEmptyState={() => '没有匹配的时区'}
                  >
                    {(item) => (
                      <ListBox.Item id={item.id} textValue={item.id}>
                        {item.id}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    )}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
            )}
          </div>
          <p className="text-sm text-muted">已保存：{saved}</p>
          {message ? (
            <p role="status" className="border-t border-border pt-4 text-sm">
              {message}
            </p>
          ) : null}
        </Card>
      </SettingsCategories>
    </div>
  );
}

type ProcessingDraft = {
  compressionEnabled: boolean;
  defaultLinkVersion: string;
  quality: number;
  maxEdge: number;
  watermarkPosition: string;
};
const initial: ProcessingDraft = {
  compressionEnabled: true,
  defaultLinkVersion: 'original',
  quality: 82,
  maxEdge: 1920,
  watermarkPosition: 'bottom-right',
};
const labels: Record<keyof ProcessingDraft, string> = {
  compressionEnabled: '压缩版本',
  defaultLinkVersion: '默认外链版本',
  quality: '质量',
  maxEdge: '最长边',
  watermarkPosition: '水印位置',
};
function display(
  field: keyof ProcessingDraft,
  value: string | number | boolean,
  mode: 'before' | 'after',
) {
  if (mode === 'before') return String(value);
  if (field === 'compressionEnabled') return value ? '已开启' : '已关闭';
  if (field === 'defaultLinkVersion')
    return (
      (
        {
          original: '原图',
          compressed: '压缩图',
          watermark: '水印图',
        } as Record<string, string>
      )[String(value)] ?? String(value)
    );
  if (field === 'watermarkPosition')
    return (
      (
        {
          'bottom-right': '右下',
          center: '居中',
          'top-left': '左上',
        } as Record<string, string>
      )[String(value)] ?? String(value)
    );
  if (field === 'maxEdge') return `${value} px`;
  return `${value} / 100`;
}

export function ProcessingDemo() {
  const { mode, navigate } = usePrototype();
  const [draft, setDraft] = useState<ProcessingDraft>({ ...initial });
  const [saved, setSaved] = useState<ProcessingDraft>({ ...initial });
  const [phase, setPhase] = useState<'editing' | 'unknown' | 'different'>(
    'editing',
  );
  const change = <K extends keyof ProcessingDraft>(
    field: K,
    value: ProcessingDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setPhase('editing');
  };
  const differences = (Object.keys(draft) as (keyof ProcessingDraft)[]).filter(
    (field) => !Object.is(draft[field], saved[field]),
  );
  return (
    <div className="grid min-w-0 gap-5 pb-8">
      <Footer>
        <Button className={buttonClass} onPress={() => setPhase('unknown')}>
          模拟保存响应丢失
        </Button>
      </Footer>
      <SettingsHeading />
      <SettingsCategories items={categories} onNavigate={navigate}>
        <div className="grid gap-5">
          {phase !== 'editing' ? (
            <Card className={cardClass}>
              <h2 className="text-lg font-medium">
                {phase === 'unknown'
                  ? '保存结果待核对'
                  : '已保存设置与当前输入不同'}
              </h2>
              <p className="text-sm text-muted">
                {phase === 'unknown'
                  ? '未收到明确结果，输入保留在当前页面。'
                  : '核对发现差异，请选择保留当前输入或采用已保存值。'}
              </p>
              {phase === 'unknown' ? (
                <Button
                  variant="outline"
                  className={`${buttonClass} w-fit`}
                  onPress={() =>
                    setPhase(differences.length ? 'different' : 'editing')
                  }
                >
                  核对已保存设置
                </Button>
              ) : null}
              {phase === 'different' ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-90 text-left text-[13px]">
                      <thead>
                        <tr>
                          <th className="p-2">字段</th>
                          <th className="p-2">已保存</th>
                          <th className="p-2">当前输入</th>
                        </tr>
                      </thead>
                      <tbody>
                        {differences.map((field) => (
                          <tr key={field}>
                            <th className="border-t border-border p-2 font-normal">
                              {labels[field]}
                            </th>
                            <td className="border-t border-border p-2 wrap-anywhere">
                              {display(field, saved[field], mode)}
                            </td>
                            <td className="border-t border-border p-2 wrap-anywhere">
                              {display(field, draft[field], mode)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      className={buttonClass}
                      onPress={() => setPhase('editing')}
                    >
                      保留当前输入
                    </Button>
                    <Button
                      className={buttonClass}
                      onPress={() => {
                        setDraft({ ...saved });
                        setPhase('editing');
                      }}
                    >
                      采用已保存值
                    </Button>
                  </div>
                </>
              ) : null}
            </Card>
          ) : null}
          <Card className={cardClass}>
            <h2 className="text-lg font-medium">默认与任务</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <ProcessingSelect
                name="defaultLinkVersion"
                label="默认外链版本"
                value={draft.defaultLinkVersion}
                options={[
                  ['original', '原图'],
                  ['compressed', '压缩图'],
                  ['watermark', '水印图'],
                ]}
                onChange={(value) => change('defaultLinkVersion', value)}
              />
              <ProcessingSelect
                name="watermarkPosition"
                label="水印位置"
                value={draft.watermarkPosition}
                options={[
                  ['bottom-right', '右下'],
                  ['center', '居中'],
                  ['top-left', '左上'],
                ]}
                onChange={(value) => change('watermarkPosition', value)}
              />
            </div>
          </Card>
          <Card className={cardClass}>
            <h2 className="text-lg font-medium">派生图片</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <span className="text-[13px]">压缩版本</span>
                <ProcessingSwitch
                  label="压缩版本"
                  selected={draft.compressionEnabled}
                  onChange={(value) => change('compressionEnabled', value)}
                />
              </div>
              <ProcessingNumber
                name="quality"
                label="质量"
                value={draft.quality}
                min={1}
                max={100}
                integer
                onChange={(value) => change('quality', value)}
              />
              <ProcessingNumber
                name="maxEdge"
                label="最长边（px）"
                value={draft.maxEdge}
                min={1}
                max={32768}
                integer
                onChange={(value) => change('maxEdge', value)}
              />
            </div>
          </Card>
          <Button
            variant="outline"
            className={`${buttonClass} w-fit`}
            onPress={() => {
              setSaved({ ...draft });
              setPhase('editing');
            }}
          >
            正常保存
          </Button>
        </div>
      </SettingsCategories>
    </div>
  );
}
