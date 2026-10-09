'use client';

import { Accordion } from '@heroui/react/accordion';
import { Table } from '@heroui/react/table';
import { Minus, Plus } from 'lucide-react';
import { parametersTable, responseTable, statusTable } from './tables-data';

function UsageTable({
  table,
  kind,
}: {
  table: { label: string; headers: string[]; rows: string[][] };
  kind: 'parameters' | 'response' | 'status';
}) {
  const firstColumn =
    kind === 'status'
      ? 'w-25'
      : kind === 'response'
        ? 'w-40 md:w-45'
        : 'w-[130px] md:w-[145px]';
  const columnWidths =
    kind === 'parameters'
      ? [firstColumn, 'w-15', 'w-[150px]', '']
      : [firstColumn, kind === 'status' ? 'w-40' : 'w-[150px]', ''];
  const width =
    kind === 'parameters'
      ? 'min-w-[calc(100%+210px)] md:min-w-[640px]'
      : kind === 'response'
        ? 'min-w-[calc(100%+150px)] md:min-w-[640px]'
        : 'min-w-[calc(100%+160px)] md:min-w-[640px]';
  return (
    <div className="grid min-w-0 gap-2">
      <p className="text-xs text-muted md:hidden">左右滑动查看完整表格。</p>
      <Table
        variant="secondary"
        className="min-w-0 rounded-[10px] border border-border bg-background p-0"
      >
        <Table.ScrollContainer
          role="region"
          tabIndex={0}
          aria-label={`${table.label}横向滚动`}
          className="max-w-full overflow-x-auto overscroll-x-contain rounded-[10px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Table.Content
            aria-label={table.label}
            className={`w-full table-fixed border-separate border-spacing-0 text-left text-[13px] leading-relaxed ${width}`}
          >
            <Table.Header>
              {table.headers.map((label, index) => (
                <Table.Column
                  key={label}
                  isRowHeader={index === 0}
                  className={`border-b border-border bg-default p-2.5 align-top text-xs font-medium text-muted md:p-3 ${columnWidths[index]} ${index === 0 ? 'sticky left-0 z-10' : ''}`}
                >
                  {label}
                </Table.Column>
              ))}
            </Table.Header>
            <Table.Body>
              {table.rows.map((cells) => (
                <Table.Row
                  key={cells[0]}
                  className="bg-background shadow-none last:[&>td]:border-b-0"
                >
                  {cells.map((text, index) => (
                    <Table.Cell
                      key={index}
                      className={`border-b border-border bg-background p-2.5 align-top text-[13px] leading-relaxed font-normal whitespace-normal wrap-anywhere md:p-3 ${index === 0 ? 'sticky left-0 z-1' : ''}`}
                    >
                      {index === 0 ? (
                        <code className="font-mono text-xs leading-relaxed">
                          {text}
                        </code>
                      ) : (
                        text
                      )}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}

export function UsageDetails() {
  return (
    <Accordion allowsMultipleExpanded hideSeparator className="min-w-0 gap-0">
      <Accordion.Item
        id="parameters"
        className="min-w-0 border-b border-solid border-border"
      >
        <Accordion.Heading>
          <Accordion.Trigger className="min-h-13 px-0 py-3 text-sm font-normal">
            请求参数
            <UsageIndicator />
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body className="px-0 pt-0 pb-4">
            <UsageTable table={parametersTable} kind="parameters" />
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item
        id="response"
        className="min-w-0 border-b border-solid border-border"
      >
        <Accordion.Heading>
          <Accordion.Trigger className="min-h-13 px-0 py-3 text-sm font-normal">
            响应与异常
            <UsageIndicator />
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body className="grid min-w-0 gap-3 px-0 pt-0 pb-4 text-sm leading-relaxed">
            <p>
              只有本次处理完成且图片 ready 才返回 201。私有图片链接需要所有者
              Cookie。
            </p>
            <h3 className="mt-1 text-sm font-medium">响应字段</h3>
            <UsageTable table={responseTable} kind="response" />
            <h3 className="mt-1 text-sm font-medium">HTTP 状态</h3>
            <UsageTable table={statusTable} kind="status" />
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

function UsageIndicator() {
  return (
    <Accordion.Indicator className="group rotate-0 data-[expanded=true]:rotate-0">
      <span aria-hidden>
        <Plus className="size-4 group-data-[expanded=true]:hidden" />
        <Minus className="hidden size-4 group-data-[expanded=true]:block" />
      </span>
    </Accordion.Indicator>
  );
}
