'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { toast } from '@heroui/react/toast';
import { Archive, LockKeyhole, Plus, RotateCcw, X } from 'lucide-react';
import { IdentityField } from '../../../src/components/identity/identity-field';
import { AdminFrame } from './admin-frame';
import { usePrototype } from './prototype-state';
import {
  BackupConfirmation,
  type BackupConfirmationKind,
} from './backup-confirmation';
import {
  BackupHistory,
  BackupProgress,
  BackupRestoreEntry,
  BackupScope,
} from './backup-panels';

const primaryClass =
  'h-12 min-w-0 flex-1 rounded-lg px-4 text-sm sm:w-48 sm:flex-none';

export function BackupScreen() {
  const { backup, paused, startBackup, cancelBackup, removeCompletedBackup } =
    usePrototype();
  const [creating, setCreating] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<{
    password?: string;
    confirmation?: string;
  }>({});
  const [dialog, setDialog] = useState<BackupConfirmationKind>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  function focus(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }
  function openCreate() {
    setCreating(true);
    setErrors({});
    focus('backup-password');
  }
  function leaveCreate() {
    setCreating(false);
    setPassword('');
    setConfirmation('');
    setErrors({});
    focus('backup-create');
  }
  function validate() {
    const next = {
      password: password.length === 0 ? '请设置备份密码' : undefined,
      confirmation:
        confirmation.length === 0
          ? '请再次输入备份密码'
          : confirmation !== password
            ? '两次输入的密码不一致'
            : undefined,
    };
    setErrors(next);
    if (next.password || next.confirmation) {
      focus(next.password ? 'backup-password' : 'backup-confirm-password');
      return;
    }
    setDialog('start');
  }
  function confirmAction() {
    if (dialog === 'start') {
      startBackup();
      setCreating(false);
      setPassword('');
      setConfirmation('');
      focus('backup-task-heading');
    } else if (dialog === 'cancel') {
      cancelBackup();
      toast.success('备份已取消，修改操作已恢复');
      focus('backup-create');
    } else if (dialog === 'delete' && deleteId) {
      removeCompletedBackup(deleteId);
      setDeleteId(null);
      toast.success('备份已删除');
      focus('backup-create');
    }
    setDialog(null);
  }
  const footer = creating ? (
    <>
      <Button
        variant="outline"
        className="h-12 min-w-24 rounded-lg px-5"
        onPress={leaveCreate}
      >
        取消
      </Button>
      <Button type="submit" form="backup-create-form" className={primaryClass}>
        <Archive className="size-4" aria-hidden />
        创建备份
      </Button>
    </>
  ) : paused ? (
    <Button
      variant="outline"
      className={primaryClass}
      onPress={() => setDialog('cancel')}
    >
      <X className="size-4" aria-hidden />
      取消备份
    </Button>
  ) : (
    <Button id="backup-create" className={primaryClass} onPress={openCreate}>
      {backup.status === 'failed' ? (
        <RotateCcw className="size-4" aria-hidden />
      ) : (
        <Plus className="size-4" aria-hidden />
      )}
      {backup.status === 'failed' ? '重新备份' : '创建备份'}
    </Button>
  );

  return (
    <AdminFrame settings footer={footer}>
      <div
        className="grid min-w-0 max-w-[960px] gap-6 pb-4"
        data-testid="backup-screen"
      >
        <h2 className="flex items-center gap-2.5 text-xl font-medium">
          <Archive className="size-5" aria-hidden />
          {creating ? '创建整站备份' : '备份与恢复'}
        </h2>
        {creating ? (
          <>
            <BackupScope />
            <form
              id="backup-create-form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                validate();
              }}
              className="grid gap-5 rounded-2xl border border-border bg-surface p-4 sm:p-6"
            >
              <h3 className="flex items-center gap-2 text-base font-medium">
                <LockKeyhole className="size-4" aria-hidden />
                备份密码
              </h3>
              <div className="grid gap-5 sm:grid-cols-2">
                <IdentityField
                  name="backup-password"
                  label="设置密码"
                  value={password}
                  onChange={(value) => {
                    setPassword(value);
                    setErrors((current) => ({
                      ...current,
                      password: undefined,
                    }));
                  }}
                  error={errors.password}
                  secret
                  autoComplete="new-password"
                  placeholder="请输入独立的备份密码"
                />
                <IdentityField
                  name="backup-confirm-password"
                  label="确认密码"
                  value={confirmation}
                  onChange={(value) => {
                    setConfirmation(value);
                    setErrors((current) => ({
                      ...current,
                      confirmation: undefined,
                    }));
                  }}
                  error={errors.confirmation}
                  secret
                  autoComplete="new-password"
                  placeholder="再次输入备份密码"
                />
              </div>
              <p className="text-sm leading-6 text-muted">
                密码用于打开整份备份，请单独妥善保存。忘记密码后无法恢复。
              </p>
            </form>
          </>
        ) : (
          <>
            {backup.status !== 'idle' ? <BackupProgress /> : <BackupScope />}
            <BackupHistory
              onDelete={(id) => {
                setDeleteId(id);
                setDialog('delete');
              }}
            />
            <BackupRestoreEntry />
          </>
        )}
      </div>
      <BackupConfirmation
        kind={dialog}
        onClose={() => setDialog(null)}
        onConfirm={confirmAction}
      />
    </AdminFrame>
  );
}
