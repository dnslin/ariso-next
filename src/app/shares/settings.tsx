'use client';

import { DelayedLoading } from '../../components/delayed-loading';

import { ComponentEntrance } from '../../components/component-entrance';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { I18nProvider } from 'react-aria';
import { Accordion } from '@heroui/react/accordion';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { CloseButton } from '@heroui/react/close-button';
import { InputGroup } from '@heroui/react/input-group';
import { FieldError } from '@heroui/react/field-error';
import { Label } from '@heroui/react/label';
import { Modal } from '@heroui/react/modal';
import { TextField } from '@heroui/react/textfield';
import { TextArea } from '@heroui/react/textarea';
import { ToggleButton } from '@heroui/react/toggle-button';
import { Tooltip } from '@heroui/react/tooltip';
import { Spinner } from '@heroui/react/spinner';
import {
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  Columns3,
  Copy,
  Eye,
  EyeOff,
  Grid2X2,
  Link as LinkIcon,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { OwnerShell } from '../../components/shell/owner-shell';
import { StorageTip } from '../../components/storage/storage-tip';

import { useResetUpload } from '../../components/upload/provider';
import {
  albumRequest,
  AlbumRequestError,
  albumUrl,
  type Album,
} from '../albums/api';
import { shareRequest, ShareRequestError, shareUrl, type Share } from './api';
import { useSettings, type Action } from './use-settings';
import { Choices, ExpiryControls, SettingSwitch } from './controls';
import { ShareCreateForm } from './create-form';
import { shareSettingsHref } from '../albums/collection-navigation';
type SettingsProps = {
  albumId: string;
  timeZone: string;
  returnHref?: string;
  name: string;
  logoUrl?: string | null;
  description: string;
  email: string;
  ownerName: string;
  initialSidebarCollapsed: boolean;
};
const buttonStyle = 'min-h-12 rounded-lg px-4 text-sm';
const cardStyle =
  'gap-0 rounded-2xl border border-border bg-surface p-0 shadow-none';
export function SettingsScreen(props: SettingsProps) {
  const [client] = useState(() => new QueryClient());
  const [expiredSession, setExpiredSession] = useState(false);
  const resetUpload = useResetUpload();
  const returnTo = shareSettingsHref(
    props.albumId,
    props.returnHref ?? '/shares',
  );
  const onExpire = useCallback(() => {
    setExpiredSession(true);
    resetUpload();
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, [client, resetUpload, returnTo]);
  const data = useQuery(
    {
      queryKey: ['share-settings', props.albumId],
      queryFn: async ({ signal }) => {
        const [album, result] = await Promise.all([
          albumRequest<{ album: Album }>(albumUrl(props.albumId), { signal }),
          shareRequest<{ share: Share | null }>(shareUrl(props.albumId), {
            signal,
          }),
        ]);
        return { album: album.album, share: result.share };
      },
      enabled: !expiredSession,
      retry: false,
      networkMode: 'always',
      refetchOnWindowFocus: false,
    },
    client,
  );
  useEffect(() => () => client.clear(), [client]);
  useEffect(() => {
    if (
      (data.error instanceof ShareRequestError ||
        data.error instanceof AlbumRequestError) &&
      data.error.status === 401
    ) {
      resetUpload();
      client.clear();
      window.location.replace(
        `/login?reason=expired&returnTo=${encodeURIComponent(returnTo)}`,
      );
    }
  }, [data.error, resetUpload, client, returnTo]);
  if (data.data && !data.isError && !expiredSession)
    return (
      <I18nProvider locale="zh-CN">
        <SettingsContent
          props={props}
          album={data.data.album}
          initialShare={data.data.share}
          onExpire={onExpire}
          returnTo={returnTo}
        />
      </I18nProvider>
    );
  return (
    <OwnerShell {...props} onSessionExpire={onExpire} returnTo={returnTo}>
      <h1 className="mb-6">分享设置</h1>
      {data.error ? (
        <div role="alert" className="grid gap-4">
          <p>{data.error.message}</p>
          <Button
            className={`${buttonStyle} w-fit`}
            onPress={() => void data.refetch()}
          >
            重试读取
          </Button>
        </div>
      ) : (
        <DelayedLoading>
          <p role="status" className="flex gap-3">
            正在读取分享设置…
          </p>
        </DelayedLoading>
      )}
    </OwnerShell>
  );
}
function formatExpiry(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'shortOffset',
  }).format(new Date(value));
}
function SettingsContent({
  props,
  album,
  initialShare,
  onExpire,
  returnTo,
}: {
  props: SettingsProps;
  album: Album;
  initialShare: Share | null;
  onExpire: () => void;
  returnTo: string;
}) {
  const router = useRouter();
  const returnHref = props.returnHref ?? '/shares';
  const returnLabel = returnHref.startsWith('/shares')
    ? '返回分享'
    : returnHref.startsWith('/albums/')
      ? '返回相册'
      : '返回相册列表';
  const settings = useSettings(
    initialShare,
    props.albumId,
    props.timeZone,
    onExpire,
    () => router.push(returnHref),
  );
  const {
    share,
    password,
    setPassword,
    passwordVisible,
    setPasswordVisible,
    expiry,
    setExpiry,
    restoreExpiry,
    setRestoreExpiry,
    layout,
    setLayout,
    showName,
    setShowName,
    modal,
    modalOpen,
    feedback,
    feedbackRef,
    headingRef,
    manualRef,
    dialogRef,
    errors,
    busy,
    enabledSaving,
    blocked,
    copyBlocked,
    canEndChecking,
    address,
    expired,
    enabled,
    hasPassword,
    dirty,
    open,
    close,
    confirm,
    copy,
    savePassword,
    saveExpiry,
    saveDisplay,
    setEnabled,
    readResult,
    endChecking,
    returnPage,
  } = settings;
  const canViewShare = enabled && !expired && !copyBlocked && Boolean(address);
  const feedbackNode = feedback ? (
    <div
      data-testid="share-feedback"
      ref={feedbackRef}
      tabIndex={-1}
      role="status"
      className="mt-4 grid gap-2 border-t border-border pt-4 text-sm"
    >
      <p className="flex items-center gap-2 font-medium">
        {feedback.checking ? (
          <Spinner size="sm" />
        ) : (
          <RefreshCw size={16} aria-hidden />
        )}
        {feedback.title}
      </p>
      {feedback.detail ? <p className="text-muted">{feedback.detail}</p> : null}
      {feedback.retry ? (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className={buttonStyle}
            isDisabled={busy}
            onPress={() => void readResult()}
          >
            重新核对
          </Button>
          {canEndChecking ? (
            <Button
              variant="ghost"
              className={buttonStyle}
              isDisabled={busy}
              onPress={endChecking}
            >
              结束核对
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : null;
  return (
    <OwnerShell
      {...props}
      onSessionExpire={onExpire}
      returnTo={returnTo}
      footer={
        !share ? (
          <Button
            type="submit"
            form="share-create-form"
            className={`${buttonStyle} gap-2`}
            isDisabled={blocked}
          >
            <LinkIcon size={16} aria-hidden />
            {busy ? '正在提交…' : '创建并启用分享'}
          </Button>
        ) : (
          <>
            <Button
              data-testid="share-view"
              className={`${buttonStyle} gap-2`}
              variant="outline"
              isDisabled={!canViewShare}
              aria-describedby={!canViewShare ? 'share-view-note' : undefined}
              onPress={() =>
                window.open(address, '_blank', 'noopener,noreferrer')
              }
            >
              <Eye size={16} aria-hidden />
              查看分享
            </Button>
            <span id="share-view-note" className="sr-only">
              {!enabled
                ? '分享已停用'
                : expired
                  ? '分享已过期'
                  : '当前地址尚未确认，请先核对分享状态'}
            </span>
          </>
        )
      }
    >
      <div
        data-testid="share-settings"
        className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2"
      >
        <h1 ref={headingRef} tabIndex={-1}>
          分享设置
        </h1>
        <ComponentEntrance className="justify-self-end">
          <Tooltip>
            <Button
              isIconOnly={Boolean(share)}
              variant={share ? 'outline' : 'secondary'}
              aria-label={returnLabel}
              className={
                share
                  ? 'size-11 shrink-0 rounded-lg'
                  : 'min-h-11 shrink-0 gap-2 rounded-lg px-3 text-sm'
              }
              onPress={returnPage}
            >
              <ArrowLeft size={18} className="size-[18px]" aria-hidden />
              {!share ? '返回' : null}
            </Button>
            <Tooltip.Content>{returnLabel}</Tooltip.Content>
          </Tooltip>
        </ComponentEntrance>
        <ComponentEntrance
          as="p"
          delay={0.055}
          className="col-span-2 text-sm text-muted [overflow-wrap:anywhere]"
        >
          {album.name} · {album.publicImageCount} 张公开图片
        </ComponentEntrance>
      </div>
      {!share ? (
        <>
          <ShareCreateForm settings={settings} timeZone={props.timeZone} />
          {feedbackNode}
        </>
      ) : (
        <div className="grid gap-4 md:gap-6">
          <ComponentEntrance delay={0.055}>
            <Card className={cardStyle}>
              <Card.Header className="flex flex-row flex-wrap items-center justify-between gap-3 p-4 pb-2 md:px-6 md:pt-5">
                <div className="flex items-center gap-2">
                  <LinkIcon size={20} aria-hidden />
                  <Card.Title className="text-base font-medium">
                    分享地址
                  </Card.Title>
                  <StorageTip label="分享地址">
                    相册中的公开图片会随内容变化自动更新。
                  </StorageTip>
                </div>
                <Chip
                  data-testid="share-status"
                  variant="soft"
                  color={!enabled ? 'default' : expired ? 'warning' : 'success'}
                >
                  <span className="mr-1.5 inline-block size-1.5 rounded-full bg-current" />
                  <span>
                    {!enabled ? '已停用' : expired ? '已过期' : '分享中'}
                  </span>
                </Chip>
              </Card.Header>
              <Card.Content className="px-4 pb-4 md:px-6 md:pb-5">
                <div className="flex min-w-0 items-start gap-3">
                  <p
                    data-testid="share-address"
                    className="min-w-0 select-text py-2.5 text-sm leading-6 [overflow-wrap:anywhere]"
                  >
                    {address}
                  </p>
                  <Tooltip>
                    <Button
                      isIconOnly
                      variant="ghost"
                      aria-label="复制分享地址"
                      isDisabled={copyBlocked}
                      aria-describedby={
                        copyBlocked ? 'share-copy-note' : undefined
                      }
                      className="size-11 shrink-0 rounded-lg"
                      onPress={() => void copy()}
                    >
                      <Copy size={18} aria-hidden />
                    </Button>
                    <Tooltip.Content>复制分享地址</Tooltip.Content>
                  </Tooltip>
                </div>
                {copyBlocked ? (
                  <p id="share-copy-note" className="text-xs text-muted">
                    当前地址尚未确认，请先核对分享状态。
                  </p>
                ) : null}
                {feedbackNode}
              </Card.Content>
            </Card>
          </ComponentEntrance>
          <div className="grid items-start gap-4 md:grid-cols-2 md:gap-6">
            <ComponentEntrance delay={0.055}>
              <Card className={cardStyle}>
                <Card.Header className="flex flex-row items-center gap-2 p-4 pb-2 md:p-6 md:pb-2">
                  <ShieldCheck size={20} aria-hidden />
                  <Card.Title className="text-base font-medium">
                    访问设置
                  </Card.Title>
                </Card.Header>
                <Card.Content className="px-4 pb-2 md:px-6">
                  <Accordion aria-label="访问设置" isDisabled={blocked}>
                    <Accordion.Item id="password">
                      <Accordion.Heading>
                        <Accordion.Trigger
                          aria-label="访问密码"
                          className="min-h-20 gap-3 py-4 text-sm font-normal"
                        >
                          <LockKeyhole
                            size={18}
                            className="shrink-0 text-muted"
                            aria-hidden
                          />
                          <span className="grid flex-1 gap-1 text-left">
                            <span className="font-medium">访问密码</span>
                            <span className="text-xs text-muted">
                              {hasPassword ? '已设置' : '未设置'}
                            </span>
                          </span>
                          <Accordion.Indicator>
                            <ChevronDown size={16} aria-hidden />
                          </Accordion.Indicator>
                        </Accordion.Trigger>
                      </Accordion.Heading>
                      <Accordion.Panel>
                        <Accordion.Body className="grid gap-3 pb-4">
                          <TextField
                            className="min-w-0 min-[1200px]:grid min-[1200px]:grid-cols-[minmax(0,1fr)_auto] min-[1200px]:gap-x-3"
                            value={password}
                            onChange={setPassword}
                            isDisabled={blocked}
                            isInvalid={Boolean(errors.password)}
                            validationBehavior="aria"
                          >
                            <Label className="text-sm min-[1200px]:col-span-2">
                              {hasPassword ? '新密码' : '设置密码'}
                            </Label>
                            <InputGroup
                              fullWidth
                              className={`h-12 min-h-12 rounded-lg border bg-transparent shadow-none ${errors.password ? 'border-danger' : 'border-border'}`}
                            >
                              <InputGroup.Input
                                id="share-password"
                                type={passwordVisible ? 'text' : 'password'}
                                autoComplete="new-password"
                                autoCapitalize="none"
                                spellCheck={false}
                                placeholder="输入 1–128 个字符"
                                className="h-full min-w-0 py-0 text-sm"
                              />
                              <InputGroup.Suffix className="border-0 px-0.5">
                                <Tooltip>
                                  <Button
                                    isIconOnly
                                    isDisabled={blocked}
                                    variant="ghost"
                                    aria-label={
                                      passwordVisible ? '隐藏密码' : '显示密码'
                                    }
                                    aria-pressed={passwordVisible}
                                    className="size-11 min-w-11 rounded-lg"
                                    onPress={() =>
                                      setPasswordVisible(!passwordVisible)
                                    }
                                  >
                                    {passwordVisible ? (
                                      <EyeOff size={16} aria-hidden />
                                    ) : (
                                      <Eye size={16} aria-hidden />
                                    )}
                                  </Button>
                                  <Tooltip.Content>
                                    {passwordVisible ? '隐藏密码' : '显示密码'}
                                  </Tooltip.Content>
                                </Tooltip>
                              </InputGroup.Suffix>
                            </InputGroup>
                            <FieldError className="min-[1200px]:col-start-1 min-[1200px]:row-start-3">
                              {errors.password}
                            </FieldError>
                            <Button
                              aria-label="保存访问密码"
                              data-testid="share-save-password"
                              isDisabled={blocked}
                              className={`${buttonStyle} mt-1 w-fit shrink-0 min-[1200px]:col-start-2 min-[1200px]:row-start-2 min-[1200px]:mt-0 min-[1200px]:self-start`}
                              onPress={savePassword}
                            >
                              保存
                            </Button>
                          </TextField>
                          <p className="text-xs leading-5 text-muted">
                            更改密码后，访客需要重新解锁。
                          </p>
                          {hasPassword ? (
                            <Button
                              isDisabled={blocked}
                              variant="outline"
                              className={`${buttonStyle} w-fit`}
                              onPress={() => open('clear')}
                            >
                              清除密码
                            </Button>
                          ) : null}
                        </Accordion.Body>
                      </Accordion.Panel>
                    </Accordion.Item>
                    <Accordion.Item id="expiry">
                      <Accordion.Heading>
                        <Accordion.Trigger
                          aria-label="有效期"
                          className="min-h-20 gap-3 py-4 text-sm font-normal"
                        >
                          <CalendarClock
                            size={18}
                            className="shrink-0 text-muted"
                            aria-hidden
                          />
                          <span className="grid min-w-0 flex-1 gap-1 text-left">
                            <span className="font-medium">有效期</span>
                            <span className="text-xs text-muted">
                              {share.expiresAt
                                ? formatExpiry(share.expiresAt, props.timeZone)
                                : '不过期'}
                              {expired ? (
                                <>
                                  {' · '}
                                  <span className="text-danger">已过期</span>
                                </>
                              ) : null}
                            </span>
                          </span>
                          <Accordion.Indicator>
                            <ChevronDown size={16} aria-hidden />
                          </Accordion.Indicator>
                        </Accordion.Trigger>
                      </Accordion.Heading>
                      <Accordion.Panel>
                        <Accordion.Body className="grid gap-3 pb-4">
                          <ExpiryControls
                            draft={expiry}
                            onChange={setExpiry}
                            timeZone={props.timeZone}
                            disabled={blocked}
                            error={errors.expiry}
                          />
                          <Button
                            aria-label="保存有效期"
                            data-testid="share-save-expiry"
                            isDisabled={blocked}
                            className={`${buttonStyle} w-fit`}
                            onPress={() => saveExpiry()}
                          >
                            保存
                          </Button>
                        </Accordion.Body>
                      </Accordion.Panel>
                    </Accordion.Item>
                  </Accordion>
                </Card.Content>
                <Card.Footer className="grid gap-2 border-t border-border px-4 py-3 md:px-6">
                  <div className="flex w-full items-center gap-2">
                    <SettingSwitch
                      label="启用分享"
                      selected={enabled && !expired}
                      disabled={blocked}
                      onChange={(value) =>
                        void setEnabled(
                          value,
                          document.querySelector<HTMLInputElement>(
                            'input[aria-label="启用分享"]',
                          ),
                        )
                      }
                    />
                    <StorageTip label="启用分享">
                      停用后，当前地址无法访问，已解锁访客也会失效。
                    </StorageTip>
                  </div>
                  {enabledSaving && !feedback ? (
                    <p role="status" className="text-xs text-muted">
                      正在保存…
                    </p>
                  ) : null}
                  {errors.enabled ? (
                    <p role="alert" className="text-sm text-danger">
                      {errors.enabled}
                    </p>
                  ) : null}
                </Card.Footer>
              </Card>
            </ComponentEntrance>
            <ComponentEntrance delay={0.055}>
              <Card className={cardStyle}>
                <Card.Header className="flex flex-row items-center gap-2 p-4 md:p-6 md:pb-5">
                  <Eye size={20} aria-hidden />
                  <Card.Title className="text-base font-medium">
                    访客展示
                  </Card.Title>
                </Card.Header>
                <Card.Content className="grid gap-5 px-4 pb-4 md:px-6 md:pb-5">
                  <div className="grid gap-2">
                    <Label id="layout-label" className="text-sm">
                      图片布局
                    </Label>
                    <Choices
                      label="layout-label"
                      value={layout}
                      onChange={(value) => setLayout(value as Share['layout'])}
                      disabled={blocked}
                    >
                      <ToggleButton
                        id="grid"
                        className="h-12 flex-1 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                      >
                        <Grid2X2 size={18} aria-hidden />
                        网格
                      </ToggleButton>
                      <ToggleButton
                        id="masonry"
                        className="h-12 flex-1 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                      >
                        <Columns3 size={18} aria-hidden />
                        瀑布流
                      </ToggleButton>
                    </Choices>
                  </div>
                  <SettingSwitch
                    label="显示图片名称"
                    selected={showName}
                    disabled={blocked}
                    onChange={setShowName}
                  />
                  {errors.display ? (
                    <p role="alert" className="text-sm text-danger">
                      {errors.display}
                    </p>
                  ) : null}
                </Card.Content>
                <Card.Footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 md:px-6">
                  <p className="text-xs text-muted">
                    {dirty ? '未保存' : '已保存'}
                  </p>
                  <Button
                    aria-label="保存访客展示"
                    data-testid="share-save-display"
                    isDisabled={!dirty || blocked}
                    className={buttonStyle}
                    onPress={saveDisplay}
                  >
                    保存
                  </Button>
                </Card.Footer>
              </Card>
            </ComponentEntrance>
          </div>
          <ComponentEntrance delay={0.055}>
            <Card className={cardStyle}>
              <Card.Content className="flex flex-row flex-wrap items-center justify-between gap-3 p-4 md:px-6 md:py-4">
                <div
                  data-testid="share-rotate-heading"
                  className="flex min-w-0 items-center gap-3"
                >
                  <RefreshCw
                    data-testid="share-rotate-icon"
                    size={18}
                    aria-hidden
                    className="shrink-0 text-muted"
                  />
                  <div className="flex min-h-11 items-center gap-2">
                    <p className="text-sm font-medium">重新生成地址</p>
                    <StorageTip label="重新生成地址">
                      旧地址与已解锁会话将立即失效。
                    </StorageTip>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className={buttonStyle}
                  isDisabled={blocked}
                  onPress={() => open('rotate')}
                >
                  重新生成
                </Button>
              </Card.Content>
            </Card>
          </ComponentEntrance>
        </div>
      )}
      <Modal
        isOpen={modalOpen}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <Modal.Backdrop isDismissable={!busy} isKeyboardDismissDisabled={busy}>
          <Modal.Container size="md" className="p-4">
            <Modal.Dialog
              data-testid={
                modal === 'manual' ? 'share-copy-manual' : 'share-dialog'
              }
              aria-label={modalTitle(modal)}
              className="max-h-[calc(100dvh-32px)] w-full max-w-[480px] gap-5 overflow-auto rounded-[14px] border border-border bg-surface p-6"
            >
              <CloseButton
                isDisabled={busy}
                onPress={close}
                aria-label="关闭"
                className="absolute top-3 right-3 size-11"
              />
              <Modal.Header ref={dialogRef} className="pr-10">
                <Modal.Heading className="text-xl font-medium">
                  {modalTitle(modal)}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="grid gap-4 text-sm leading-6">
                {modal === 'manual' ? (
                  <>
                    <p>浏览器未允许复制，请选择完整地址后手动复制。</p>
                    <TextArea
                      ref={manualRef}
                      aria-label="完整分享地址"
                      value={address}
                      readOnly
                      className="min-h-28 select-text rounded-lg border border-border bg-transparent text-sm [overflow-wrap:anywhere]"
                    />
                    <Button
                      variant="outline"
                      className={`${buttonStyle} w-fit`}
                      onPress={() => {
                        manualRef.current?.focus();
                        manualRef.current?.select();
                      }}
                    >
                      选中完整地址
                    </Button>
                  </>
                ) : modal === 'enable-expired' ? (
                  <>
                    <p>分享已过期。选择新的有效期后启用。</p>
                    <ExpiryControls
                      draft={restoreExpiry}
                      onChange={setRestoreExpiry}
                      timeZone={props.timeZone}
                      disabled={busy}
                      error={errors.dialogExpiry}
                    />
                  </>
                ) : (
                  <p>
                    {modal === 'discard'
                      ? '离开后，本页未保存的修改将丢弃。'
                      : modal === 'clear'
                        ? '清除后，持有链接的访客无需密码即可访问。'
                        : '重新生成后，旧地址与已解锁会话立即失效。访问密码、有效期和展示设置保持。'}
                  </p>
                )}
                {errors.dialog ? (
                  <p role="alert" className="text-danger">
                    {errors.dialog}
                  </p>
                ) : null}
              </Modal.Body>
              <Modal.Footer className="gap-3">
                {modal !== 'manual' ? (
                  <Button
                    variant="outline"
                    className={buttonStyle}
                    isDisabled={busy}
                    onPress={close}
                  >
                    取消
                  </Button>
                ) : null}
                <Button
                  className={buttonStyle}
                  isDisabled={busy}
                  onPress={confirm}
                >
                  {modal === 'discard'
                    ? '放弃修改并离开'
                    : modal === 'manual'
                      ? '完成'
                      : modal === 'enable-expired'
                        ? '启用分享'
                        : modal === 'clear'
                          ? '清除密码'
                          : '重新生成地址'}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </OwnerShell>
  );
}
function modalTitle(action: Action | null) {
  return action === 'discard'
    ? '放弃未保存修改'
    : action === 'manual'
      ? '手动复制地址'
      : action === 'clear'
        ? '清除访问密码'
        : action === 'enable-expired'
          ? '启用分享'
          : '重新生成地址';
}
