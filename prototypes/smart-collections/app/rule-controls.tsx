'use client';

import { Button, Dropdown, Label, ListBox, Select } from '@heroui/react';
import { CalendarDays, HardDrive, Plus, Tags, X } from 'lucide-react';
import type { FilterRules } from './data';

type Props = { rules: FilterRules; onChange: (rules: FilterRules) => void };
export function RuleControls({ rules, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="筛选条件">
      {rules.tag !== 'all' && (
        <div className="flex min-w-0 items-center rounded-lg border border-border">
          <Select
            aria-label="标签条件"
            value={rules.tag}
            onChange={(value) =>
              onChange({
                ...rules,
                tag: value === 'none' ? 'none' : 'screenshot',
              })
            }
          >
            <Select.Trigger className="min-h-11 min-w-0 gap-2 rounded-r-none border-0 bg-transparent pl-3 shadow-none">
              <Tags size={16} />
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="none" textValue="没有标签">
                  没有标签
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                <ListBox.Item id="screenshot" textValue="标签：截图">
                  标签：截图
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
          <Button
            variant="ghost"
            isIconOnly
            className="size-11 rounded-l-none"
            aria-label="移除标签条件"
            onPress={() => onChange({ ...rules, tag: 'all' })}
          >
            <X size={14} />
          </Button>
        </div>
      )}
      {rules.recentDays !== null && (
        <div className="flex min-w-0 items-center rounded-lg border border-border">
          <Select
            aria-label="上传时间条件"
            value={String(rules.recentDays)}
            onChange={(value) =>
              onChange({ ...rules, recentDays: Number(value) })
            }
          >
            <Select.Trigger className="min-h-11 min-w-0 gap-2 rounded-r-none border-0 bg-transparent pl-3 shadow-none">
              <CalendarDays size={16} />
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {[7, 14, 30].map((days) => (
                  <ListBox.Item
                    key={days}
                    id={String(days)}
                    textValue={`最近 ${days} 天`}
                  >
                    最近 {days} 天<ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <Button
            variant="ghost"
            isIconOnly
            className="size-11 rounded-l-none"
            aria-label="移除时间条件"
            onPress={() => onChange({ ...rules, recentDays: null })}
          >
            <X size={14} />
          </Button>
        </div>
      )}
      {rules.minMB !== null && (
        <div className="flex min-w-0 items-center rounded-lg border border-border">
          <Select
            aria-label="原图大小条件"
            value={String(rules.minMB)}
            onChange={(value) => onChange({ ...rules, minMB: Number(value) })}
          >
            <Select.Trigger className="min-h-11 min-w-0 gap-2 rounded-r-none border-0 bg-transparent pl-3 shadow-none">
              <HardDrive size={16} />
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {[5, 10, 20].map((size) => (
                  <ListBox.Item
                    key={size}
                    id={String(size)}
                    textValue={`原图 > ${size} MB`}
                  >
                    原图 &gt; {size} MB
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
              <p className="px-3 py-2 text-xs text-muted">
                1 MB = 1,000,000 字节
              </p>
            </Select.Popover>
          </Select>
          <Button
            variant="ghost"
            isIconOnly
            className="size-11 rounded-l-none"
            aria-label="移除大小条件"
            onPress={() => onChange({ ...rules, minMB: null })}
          >
            <X size={14} />
          </Button>
        </div>
      )}
      <Dropdown>
        <Button
          variant="ghost"
          className="min-h-11 gap-2 px-3"
          aria-label="添加筛选条件"
        >
          <Plus size={16} />
          添加条件
        </Button>
        <Dropdown.Popover>
          <Dropdown.Menu
            aria-label="可添加的筛选条件"
            onAction={(key) => {
              if (key === 'tag') onChange({ ...rules, tag: 'none' });
              if (key === 'days') onChange({ ...rules, recentDays: 7 });
              if (key === 'size') onChange({ ...rules, minMB: 10 });
            }}
          >
            <Dropdown.Item
              id="tag"
              isDisabled={rules.tag !== 'all'}
              textValue="标签"
            >
              <Tags size={16} />
              <Label>标签</Label>
            </Dropdown.Item>
            <Dropdown.Item
              id="days"
              isDisabled={rules.recentDays !== null}
              textValue="最近上传"
            >
              <CalendarDays size={16} />
              <Label>最近上传</Label>
            </Dropdown.Item>
            <Dropdown.Item
              id="size"
              isDisabled={rules.minMB !== null}
              textValue="原图大小"
            >
              <HardDrive size={16} />
              <Label>原图大小</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}
