'use client';
import { useState, type ComponentProps } from 'react';
import { Button } from '@heroui/react/button';
import { Spinner } from '@heroui/react/spinner';
import {
  Archive,
  ArchiveRestore,
  LockKeyhole,
  Plus,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import { IdentityField } from '../identity/identity-field';
import { OwnerShell } from '../shell/owner-shell';
import {
  SettingsCategories,
  SettingsHeading,
  settingsCategories,
} from '../shell/settings-categories';
import { BackupScope } from './backup-scope';
import { BackupProgress } from './backup-progress';
import { BackupHistory } from './backup-history';
import {
  BackupConfirmation,
  type BackupConfirmationKind,
} from './backup-confirmation';
import { useBackups, isBackupActive } from './use-backups';
import { useBackupActivity } from './use-backup-activity';

type ShellProps = Omit<
  ComponentProps<typeof OwnerShell>,
  'children' | 'footer'
>;
const primaryClass =
  'h-12 min-w-0 flex-1 rounded-lg px-4 text-sm sm:w-48 sm:flex-none';
export function BackupPage({
  timeZone,
  ...shell
}: ShellProps & { timeZone: string }) {
  const model = useBackups();
  const activity = useBackupActivity();
  const [creating, setCreating] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<BackupConfirmationKind>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const job = activity.job ?? model.current;
  const active = job ? isBackupActive(job) : false;
  const data = model.query.data;
  function focus(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }
  function leaveCreate(discard = true) {
    setCreating(false);
    if (discard) {
      setPassword('');
      setConfirmation('');
    }
    setErrors({});
    focus('backup-create');
  }
  function finishCreation() {
    leaveCreate();
    focus('backup-task-heading');
  }
  function validate() {
    if (
      model.busy ||
      model.uncertain ||
      active ||
      !data?.availability.supported
    )
      return;
    const next = {
      password: !password.length ? '请设置备份密码' : '',
      confirmation: !confirmation.length
        ? '请再次输入备份密码'
        : confirmation !== password
          ? '两次输入的密码不一致'
          : '',
    };
    setErrors(next);
    if (next.password || next.confirmation) {
      focus(next.password ? 'backup-password' : 'backup-confirm-password');
      return;
    }
    setDialog('start');
  }
  async function confirm() {
    const success =
      dialog === 'start'
        ? await model.create(password)
        : dialog === 'cancel' && job
          ? await model.cancel(job.id)
          : deleteId
            ? await model.remove(deleteId)
            : false;
    if (success) {
      setDialog(null);
      if (dialog === 'start') finishCreation();
      setDeleteId(null);
    } else if (dialog === 'start') setDialog(null);
  }
  const footer = creating ? (
    <>
      <Button
        variant="outline"
        className="h-12 min-w-24 rounded-lg px-5"
        isDisabled={model.busy}
        onPress={() => leaveCreate(!model.uncertain)}
      >
        取消
      </Button>
      <Button
        type="submit"
        form="backup-create-form"
        className={primaryClass}
        isDisabled={
          model.busy ||
          model.uncertain ||
          !data?.availability.supported ||
          active
        }
      >
        <Archive className="size-4" aria-hidden />
        创建备份
      </Button>
    </>
  ) : active ? (
    <Button
      variant="outline"
      className={primaryClass}
      isDisabled={model.busy}
      onPress={() => setDialog('cancel')}
    >
      <X className="size-4" aria-hidden />
      取消备份
    </Button>
  ) : (
    <Button
      id="backup-create"
      className={primaryClass}
      isDisabled={model.busy || !data?.availability.supported}
      onPress={() => {
        setCreating(true);
        setErrors({});
        focus('backup-password');
      }}
    >
      {job?.status === 'failed' ? (
        <RotateCcw className="size-4" aria-hidden />
      ) : (
        <Plus className="size-4" aria-hidden />
      )}
      {job?.status === 'failed' ? '重新备份' : '创建备份'}
    </Button>
  );
  return (
    <OwnerShell {...shell} returnTo="/settings/backup" footer={footer}>
      <div className="grid gap-6">
        <SettingsHeading />
        <SettingsCategories items={settingsCategories}>
          <div
            className="grid min-w-0 max-w-[960px] gap-6 pb-4"
            data-testid="backup-screen"
          >
            <h2 className="flex items-center gap-2.5 text-xl font-medium">
              <Archive className="size-5" aria-hidden />
              {creating ? '创建整站备份' : '备份与恢复'}
            </h2>
            {model.query.isPending ? (
              <p role="status" className="flex items-center gap-3 text-sm">
                <Spinner size="sm" />
                正在读取备份记录…
              </p>
            ) : null}
            {model.query.error || model.message ? (
              <div
                role="alert"
                className="grid gap-3 rounded-xl border border-border p-4 text-sm"
              >
                <p className="text-danger wrap-anywhere">
                  {model.message || model.query.error?.message}
                </p>
                <Button
                  variant="outline"
                  className="h-11 w-fit rounded-lg"
                  isDisabled={model.busy}
                  onPress={() => void model.query.refetch()}
                >
                  <RefreshCw className="size-4" aria-hidden />
                  重新读取
                </Button>
              </div>
            ) : null}
            {data && !data.availability.supported ? (
              <p
                role="status"
                className="rounded-xl border border-border p-4 text-sm leading-6"
              >
                {data.availability.message ?? '当前站点暂不支持创建备份。'}
              </p>
            ) : null}
            {data ? (
              creating ? (
                <>
                  <BackupScope scope={data.scope} />
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
                        onChange={setPassword}
                        error={errors.password}
                        secret
                        isDisabled={model.busy || model.uncertain}
                        autoComplete="new-password"
                        placeholder="请输入独立的备份密码"
                      />
                      <IdentityField
                        name="backup-confirm-password"
                        label="确认密码"
                        value={confirmation}
                        onChange={setConfirmation}
                        error={errors.confirmation}
                        secret
                        isDisabled={model.busy || model.uncertain}
                        autoComplete="new-password"
                        placeholder="再次输入备份密码"
                      />
                    </div>
                    <p className="text-sm leading-6 text-muted">
                      密码用于打开整份备份，请单独妥善保存。忘记密码后无法恢复。
                    </p>
                    {model.uncertain ? (
                      <div
                        className="grid gap-3 rounded-lg border border-border p-4 text-sm"
                        role="status"
                      >
                        <p>
                          创建结果尚未确认。请先核对；重试仍使用同一任务，不会自动创建另一份备份。
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <Button
                            variant="outline"
                            className="min-h-11 rounded-lg"
                            isDisabled={model.busy}
                            onPress={() => {
                              void model.checkCreation().then((success) => {
                                if (success) finishCreation();
                              });
                            }}
                          >
                            核对创建结果
                          </Button>
                          <Button
                            variant="ghost"
                            className="min-h-11 rounded-lg"
                            isDisabled={model.busy}
                            onPress={() => {
                              void model.create(password).then((success) => {
                                if (success) finishCreation();
                              });
                            }}
                          >
                            重试同一任务
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </form>
                </>
              ) : (
                <>
                  {job ? (
                    <BackupProgress job={job} />
                  ) : (
                    <BackupScope scope={data.scope} />
                  )}
                  <BackupHistory
                    items={data.items}
                    timeZone={timeZone}
                    busy={model.busy}
                    onDelete={(id) => {
                      setDeleteId(id);
                      setDialog('delete');
                    }}
                  />
                  {model.canPrevious || data.nextCursor ? (
                    <div className="flex justify-end gap-3">
                      <Button
                        variant="outline"
                        className="h-11 rounded-lg"
                        isDisabled={!model.canPrevious || model.busy}
                        onPress={model.previous}
                      >
                        上一页
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 rounded-lg"
                        isDisabled={!data.nextCursor || model.busy}
                        onPress={model.next}
                      >
                        下一页
                      </Button>
                    </div>
                  ) : null}
                  <section className="flex items-start gap-3 border-t border-border pt-6">
                    <ArchiveRestore
                      className="mt-0.5 size-5 shrink-0"
                      aria-hidden
                    />
                    <div>
                      <h3 className="text-base font-medium">在新实例恢复</h3>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        在空白实例的初始化页面选择“从备份恢复”，导入已下载的文件。已有站点不支持覆盖恢复。
                      </p>
                    </div>
                  </section>
                </>
              )
            ) : null}
          </div>
        </SettingsCategories>
      </div>
      {dialog ? (
        <BackupConfirmation
          key={dialog}
          kind={dialog}
          busy={model.busy}
          message={model.message}
          onClose={() => setDialog(null)}
          onConfirm={() => void confirm()}
        />
      ) : null}
    </OwnerShell>
  );
}
