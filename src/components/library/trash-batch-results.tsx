'use client';

import { useRef, useState } from 'react';
import { Accordion } from '@heroui/react/accordion';
import { Table } from '@heroui/react/table';
import { Pagination } from '@heroui/react/pagination';
import { ChevronDown } from 'lucide-react';
import type { TrashBatch } from './use-trash-batch';
import {
  TrashBatchFileIcon,
  TrashBatchRowDetails,
  TrashBatchRowStatus,
} from './trash-batch-row';

export function TrashBatchResults({ batch }: { batch: TrashBatch }) {
  const [page, setPage] = useState(1);
  const heading = useRef<HTMLHeadingElement>(null);
  const workspace = batch.workspace;
  if (!workspace) return null;
  const pages = Math.max(1, Math.ceil(workspace.rows.length / 20));
  const currentPage = Math.min(page, pages);
  const rows = workspace.rows.slice((currentPage - 1) * 20, currentPage * 20);
  const items = new Map(workspace.items.map((item) => [item.id, item]));
  function changePage(value: number) {
    setPage(value);
    requestAnimationFrame(() =>
      heading.current?.focus({ preventScroll: true }),
    );
  }
  return (
    <section
      aria-labelledby="trash-results-title"
      className="grid min-w-0 gap-6"
    >
      <h2
        id="trash-results-title"
        ref={heading}
        tabIndex={-1}
        className="sr-only"
      >
        逐图清理结果，第{currentPage}页
      </h2>
      <Accordion
        aria-label="逐图清理结果"
        allowsMultipleExpanded={false}
        className="overflow-clip rounded-xl border border-border md:hidden"
        data-testid="trash-batch-accordion"
      >
        {rows.map((row) => (
          <Accordion.Item
            key={row.id}
            id={row.id}
            data-image-id={row.id}
            data-state={row.cleanup?.status ?? row.state}
          >
            <Accordion.Heading>
              <Accordion.Trigger
                data-testid="trash-batch-item-trigger"
                data-image-id={row.id}
                className="min-h-20! min-w-0 gap-2 bg-transparent px-3 py-4 text-sm font-normal max-[420px]:gap-1.5 max-[420px]:px-2.5 max-[420px]:py-3.5"
              >
                <TrashBatchFileIcon row={row} item={items.get(row.id)!} />
                <span className="min-w-0 flex-1 text-left [overflow-wrap:anywhere]">
                  {items.get(row.id)!.displayName}
                </span>
                <TrashBatchRowStatus row={row} />
                <Accordion.Indicator>
                  <ChevronDown size={16} aria-hidden />
                </Accordion.Indicator>
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body className="min-w-0 pb-4 pl-15 pr-4 max-[420px]:pl-14">
                <TrashBatchRowDetails row={row} batch={batch} />
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      <Table
        className="hidden rounded-xl border border-border bg-background shadow-none md:block dark:bg-surface"
        data-testid="trash-batch-table"
      >
        <Table.Content aria-label="逐图清理结果" className="w-full table-fixed">
          <Table.Header>
            <Table.Column isRowHeader className="w-[32%] font-normal">
              文件
            </Table.Column>
            <Table.Column className="w-[20%] font-normal">结果</Table.Column>
            <Table.Column className="font-normal">详情与操作</Table.Column>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row
                key={row.id}
                id={row.id}
                data-image-id={row.id}
                data-state={row.cleanup?.status ?? row.state}
              >
                <Table.Cell className="whitespace-normal px-3 py-4 align-top">
                  <span className="flex min-w-0 items-center gap-3 [overflow-wrap:anywhere]">
                    <TrashBatchFileIcon row={row} item={items.get(row.id)!} />
                    <span className="min-w-0">
                      {items.get(row.id)!.displayName}
                    </span>
                  </span>
                </Table.Cell>
                <Table.Cell className="px-3 py-4 align-top">
                  <TrashBatchRowStatus row={row} />
                </Table.Cell>
                <Table.Cell className="whitespace-normal px-3 py-4 align-top">
                  <TrashBatchRowDetails row={row} batch={batch} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table>
      <Pagination
        aria-label="逐图结果分页"
        className="flex-col items-stretch gap-3 border-t border-border pt-4 text-xs md:flex-row md:items-center md:justify-between"
        data-testid="trash-batch-pagination"
      >
        <Pagination.Summary>
          {workspace.rows.length}项 · 20条 / 页
        </Pagination.Summary>
        <Pagination.Content className="w-full justify-between md:w-auto">
          <Pagination.Item>
            <Pagination.Previous
              className="min-h-11 rounded-lg border border-border px-3 font-normal"
              isDisabled={currentPage === 1}
              onPress={() => changePage(currentPage - 1)}
            >
              上一页
            </Pagination.Previous>
          </Pagination.Item>
          <Pagination.Item>
            <span
              data-testid="trash-batch-results-page"
              aria-live="polite"
              className="px-2"
            >
              {currentPage} / {pages}
            </span>
          </Pagination.Item>
          <Pagination.Item>
            <Pagination.Next
              className="min-h-11 rounded-lg border border-border px-3 font-normal"
              isDisabled={currentPage === pages}
              onPress={() => changePage(currentPage + 1)}
            >
              下一页
            </Pagination.Next>
          </Pagination.Item>
        </Pagination.Content>
      </Pagination>
    </section>
  );
}
