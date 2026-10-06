'use client';

import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Modal } from '@heroui/react/modal';
import { Spinner } from '@heroui/react/spinner';
import { RefreshCw } from 'lucide-react';
import type { TokenCreator } from './token-use-create';
import { TokenSummary } from './token-summary';

export function tokenCreateCheckTitle(creator: TokenCreator) {
  if (creator.phase === 'checking') return '正在核对 Token 列表';
  if (creator.phase === 'check-failed') return '暂时无法核对列表';
  if (creator.phase !== 'checked') return '暂时无法确认创建结果';
  return creator.candidates.length === 0
    ? '未发现新的 Token 记录'
    : creator.candidates.length === 1
      ? '发现新的 Token 记录'
      : '发现多个新的 Token 记录';
}

export function TokenCreateCheck({
  creator,
  timeZone,
}: {
  creator: TokenCreator;
  timeZone: string;
}) {
  const checked = creator.phase === 'checked';
  return (
    <>
      <Modal.Body
        className="m-0 grid flex-none gap-3.5 overflow-visible p-0 text-sm leading-normal text-foreground"
        aria-live="polite"
      >
        <p>
          {creator.phase === 'checking'
            ? '正在读取真实记录。不会再次提交创建请求。'
            : creator.phase === 'check-failed'
              ? '列表读取失败，创建结果仍未确认。保留待核对状态，请重新读取。'
              : checked
                ? creator.candidates.length === 0
                  ? '本次核对没有发现新增 ID。记录可能已过期或被撤销，不能据此确认创建未发生。你可以返回列表，再决定是否创建。'
                  : creator.candidates.length === 1
                    ? '完整值无法找回。请按记录 ID 核对候选；需要使用新 Token 时，先撤销该记录，再重新创建。'
                    : '这些记录都不在提交前的列表中。名称不能区分同名 Token，无法确定本次创建对应哪条。请按 ID 与时间分别核对，再决定撤销或重建。'
                : '请求可能已完成。请先核对 Token 列表，不要重复创建。完整值无法找回，确认后可撤销并重新创建。'}
        </p>
        {checked
          ? creator.candidates.map((token) => (
              <Card
                key={token.id}
                data-testid="api-candidate"
                data-token-id={token.id}
                className="grid min-w-0 gap-2 rounded-xl border border-border bg-surface p-3 shadow-none"
              >
                <TokenSummary token={token} timeZone={timeZone} />
              </Card>
            ))
          : null}
        {creator.feedback ? (
          <p role="alert" className="text-danger">
            {creator.feedback}
          </p>
        ) : null}
      </Modal.Body>
      <Modal.Footer className="m-0 grid w-full grid-cols-1 gap-3 p-0">
        <Button
          data-testid={checked ? 'api-check-return' : 'api-check-create'}
          className="h-12 min-h-12 w-full rounded-lg text-sm font-normal"
          isDisabled={creator.busy}
          onPress={() => (checked ? creator.close() : void creator.check())}
        >
          {creator.busy ? (
            <Spinner color="current" size="sm" />
          ) : checked ? null : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          {creator.busy
            ? '正在核对…'
            : checked
              ? creator.candidates.length
                ? '返回列表处理'
                : '返回 Token 列表'
              : creator.phase === 'check-failed'
                ? '重新核对 Token 列表'
                : '核对列表'}
        </Button>
        {!checked && !creator.busy ? (
          <Button
            data-testid="api-check-back"
            variant="outline"
            className="h-12 min-h-12 w-full rounded-lg bg-background text-sm font-normal"
            onPress={creator.close}
          >
            返回 Token 列表
          </Button>
        ) : null}
      </Modal.Footer>
    </>
  );
}
