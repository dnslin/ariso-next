'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';

type Phase =
  | 'confirm'
  | 'saving'
  | 'failed'
  | 'unknown'
  | 'checking'
  | 'check-error'
  | 'retained';
export type ReadOutcome = 'empty' | 'retained' | 'error';
const buttonClass = 'min-h-12 rounded-lg px-5 text-sm';

/** All outcomes are local demonstrations; this component never sends a request. */
export function RemovalDemo({
  kind,
  outcome,
  readOutcome,
  onClose,
  onComplete,
  onPendingChange,
}: {
  kind: 'Logo' | 'Favicon';
  outcome: 'normal' | 'failed' | 'unknown';
  readOutcome: ReadOutcome;
  onClose: () => void;
  onComplete: (removed: boolean) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  const inFlight = useRef(false);
  const locked = !['confirm', 'failed'].includes(phase);
  useEffect(() => {
    onPendingChange(locked);
  }, [locked, onPendingChange]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function remove(retry = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase('saving');
    timer.current = setTimeout(() => {
      timer.current = null;
      inFlight.current = false;
      if (!retry && outcome !== 'normal') setPhase(outcome);
      else onComplete(true);
    }, 700);
  }
  function reconcile() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase('checking');
    timer.current = setTimeout(() => {
      timer.current = null;
      inFlight.current = false;
      if (readOutcome === 'error' && attempts.current++ === 0)
        setPhase('check-error');
      else if (readOutcome === 'retained') setPhase('retained');
      else onComplete(true);
    }, 700);
  }
  return (
    <AlertDialog
      isOpen
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <AlertDialog.Backdrop
        isDismissable={!locked}
        isKeyboardDismissDisabled={locked}
      >
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog className="max-h-[calc(100dvh-32px)] overflow-auto rounded-[20px] bg-surface p-6">
            {!locked ? <AlertDialog.CloseTrigger /> : null}
            <AlertDialog.Header>
              <AlertDialog.Heading>
                {phase === 'unknown' || phase === 'check-error'
                  ? '移除结果待核对'
                  : phase === 'retained'
                    ? '服务器仍有素材引用'
                    : `移除 ${kind}？`}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="grid gap-3 text-sm">
              <p>移除后使用内置标识，站点名称和描述保持不变。</p>
              {phase === 'failed' ? (
                <p role="alert" className="text-danger">
                  移除被拒绝，原素材仍有效。请重试。
                </p>
              ) : null}
              {phase === 'unknown' ? (
                <p role="alert">
                  连接中断，尚不能确认移除结果。请先核对服务器当前素材。
                </p>
              ) : null}
              {phase === 'checking' ? (
                <p role="status">正在核对当前引用…</p>
              ) : null}
              {phase === 'check-error' ? (
                <p role="alert" className="text-danger">
                  核对失败，移除结果仍未确认。请重新核对。
                </p>
              ) : null}
              {phase === 'retained' ? (
                <p>
                  服务器当前仍有素材，可能来自其他页面的更新。可以保留当前素材，或明确再次移除。
                </p>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer className="flex flex-wrap gap-3">
              {!locked ? (
                <Button
                  variant="outline"
                  className={buttonClass}
                  onPress={onClose}
                >
                  取消
                </Button>
              ) : null}
              {phase === 'confirm' ||
              phase === 'failed' ||
              phase === 'saving' ? (
                <Button
                  className={buttonClass}
                  isDisabled={phase === 'saving'}
                  onPress={() => remove(phase === 'failed')}
                >
                  {phase === 'saving'
                    ? '正在移除…'
                    : phase === 'failed'
                      ? '重试移除'
                      : '确认移除'}
                </Button>
              ) : null}
              {phase === 'unknown' ||
              phase === 'check-error' ||
              phase === 'checking' ? (
                <Button
                  variant="outline"
                  className={buttonClass}
                  isDisabled={phase === 'checking'}
                  onPress={reconcile}
                >
                  {phase === 'checking' ? '正在核对…' : '核对服务器素材'}
                </Button>
              ) : null}
              {phase === 'retained' ? (
                <>
                  <Button
                    variant="outline"
                    className={buttonClass}
                    onPress={() => onComplete(false)}
                  >
                    使用服务器素材
                  </Button>
                  <Button className={buttonClass} onPress={() => remove(true)}>
                    再次明确移除
                  </Button>
                </>
              ) : null}
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
