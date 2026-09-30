'use client';

import type { ReactNode } from 'react';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { TextArea } from '@heroui/react/textarea';
import { TextField } from '@heroui/react/textfield';
import { Alert } from '@heroui/react/alert';
import type { CorsTestState } from '../../server/storage/cors-types';

export type CorsDialogKind = 'example' | 'origin' | 'cleanup' | 'invalidated';

export function CorsDialog({
  kind,
  state,
  onClose,
  onRefresh,
  onRetest,
  busy,
  error,
}: {
  kind: CorsDialogKind;
  state: CorsTestState;
  onClose: () => void;
  onRefresh: () => void;
  onRetest: () => void;
  busy: boolean;
  error: string;
}) {
  const title =
    kind === 'example'
      ? 'CORS 配置示例'
      : kind === 'origin'
        ? '请从配置的站点地址检测'
        : kind === 'invalidated'
          ? '直传检测结果已失效'
          : state.probes.length
            ? '检测对象清理状态'
            : '本次测试对象已清理';
  let body: ReactNode;
  if (kind === 'example')
    body = (
      <>
        <p>示例来源：{state.origin}</p>
        <div className="grid gap-4 rounded-lg bg-default p-3 text-[13px]">
          <TextField aria-label="CORS 配置 JSON" isReadOnly>
            <TextArea
              value={JSON.stringify(state.example, null, 2)}
              rows={10}
              wrap="off"
              className="w-full resize-y rounded-none border-0 bg-transparent p-0 text-[13px] leading-normal shadow-none"
            />
          </TextField>
          <p>按服务商格式填写。请求方法及请求头与本次签名探测一致。</p>
        </div>
      </>
    );
  else if (kind === 'origin')
    body = (
      <>
        <p>当前访问来源与站点公开地址不一致。</p>
        <div className="grid gap-4 rounded-lg bg-default p-3 text-[13px]">
          <div>
            <p>当前来源：{window.location.origin}</p>
            <p>配置来源：{state.origin}</p>
          </div>
          <p>请从配置地址登录后重新发起检测。本次不记录直传通过。</p>
        </div>
      </>
    );
  else if (kind === 'invalidated')
    body = (
      <>
        <p>站点地址或存储配置已变更，需要重新检测。</p>
        <div className="rounded-lg bg-default p-3 text-[13px]">
          <p>已有通过结果不再使用。即使地址改回原值，也需要重新检测。</p>
          <p>旧检测任务继续收尾清理；CORS 不改变存储的私有要求。</p>
        </div>
      </>
    );
  else
    body = (
      <>
        <p>检测结果与清理状态分别记录。</p>
        <div className="grid gap-4 rounded-lg bg-default p-3 text-[13px]">
          {state.probes.length ? (
            state.probes.map((probe) => (
              <div key={probe.probeId}>
                <p>
                  {probe.state === 'running'
                    ? '检测仍在进行，保留对象引用。'
                    : '已知对象尚未清理，保留引用并等待重试。'}
                </p>
                <p>{probe.key}</p>
                {probe.error ? (
                  <p className="text-danger">{probe.error}</p>
                ) : null}
              </div>
            ))
          ) : (
            <p>
              本次已知测试对象已删除，probe
              引用已释放。旧签名造成的迟到对象由后续孤儿扫描处理；该扫描功能尚未开放。
            </p>
          )}
        </div>
      </>
    );
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container placement="center" className="p-4">
          <Modal.Dialog className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-none">
            <Modal.Header>
              <Modal.Heading className="text-xl font-medium leading-normal">
                {title}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="m-0 grid gap-4 overflow-visible p-0 text-sm leading-normal [overflow-wrap:anywhere]">
              {body}
              {error ? (
                <Alert status="danger">
                  <Alert.Content>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
            </Modal.Body>
            <Modal.Footer className="m-0 grid gap-4">
              <Button
                variant={
                  kind === 'cleanup' || kind === 'invalidated'
                    ? 'outline'
                    : 'primary'
                }
                className="h-12 w-full rounded-lg font-normal"
                onPress={onClose}
              >
                返回直传设置
              </Button>
              {kind === 'cleanup' ? (
                <Button
                  className="h-12 w-full rounded-lg font-normal"
                  isDisabled={busy}
                  onPress={onRefresh}
                >
                  刷新清理状态
                </Button>
              ) : null}
              {kind === 'invalidated' ? (
                <Button
                  className="h-12 w-full rounded-lg font-normal"
                  isDisabled={busy}
                  onPress={onRetest}
                >
                  重新检测
                </Button>
              ) : null}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
