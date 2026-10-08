'use client';

import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { OwnerShell } from '../shell/owner-shell';
import {
  SettingsCategories,
  SettingsHeading,
  settingsCategories,
} from '../shell/settings-categories';
import {
  siteRequest,
  SiteRequestError,
  type SiteSettingsResponse,
} from './api';
import { useSiteSettings } from './use-site-settings';
import { SiteForm, siteCardClass } from './site-form';
import { SiteReadState, SessionLink } from './site-read-state';
import { RelatedSettings } from './related-settings';
import { hasUnsavedSiteChanges } from './model';
import { useSiteNavigation, SiteLeaveDialog } from './site-navigation';
import {
  uploadLimitsRequest,
  UploadLimitsRequestError,
  type SavedUploadLimits,
} from '../upload-limits/api';
import { useUploadLimits } from '../upload-limits/use-upload-limits';
import { uploadLimitsMatch } from '../upload-limits/model';
import { UploadLimitsForm } from '../upload-limits/form';
import { UploadLimitsReadState } from '../upload-limits/read-state';

type ShellProps = Omit<
  ComponentProps<typeof OwnerShell>,
  'children' | 'footer'
>;
const saveClass =
  'h-12 min-w-0 flex-1 rounded-lg px-2 text-sm min-[1200px]:w-50 min-[1200px]:flex-none';

export function GeneralPage(shell: ShellProps) {
  const [initial, setInitial] = useState<SiteSettingsResponse | null>(null);
  const [initialUpload, setInitialUpload] = useState<SavedUploadLimits | null>(
    null,
  );
  const settings = useSiteSettings(initial);
  const upload = useUploadLimits(initialUpload);
  const expired = settings.expired || upload.expired;
  const query = useQuery({
    queryKey: ['site-settings'],
    queryFn: ({ signal }) => siteRequest<SiteSettingsResponse>({ signal }),
    retry: false,
    enabled: initial === null && !expired,
    networkMode: 'always',
    refetchOnWindowFocus: false,
  });
  const uploadQuery = useQuery({
    queryKey: ['upload-limits'],
    queryFn: ({ signal }) => uploadLimitsRequest({ signal }),
    retry: false,
    enabled: initialUpload === null && !expired,
    networkMode: 'always',
    refetchOnWindowFocus: false,
  });
  const sessionLost =
    expired ||
    (query.error instanceof SiteRequestError && query.error.status === 401) ||
    (uploadQuery.error instanceof UploadLimitsRequestError &&
      uploadQuery.error.status === 401);
  const expireSite = settings.expire;
  const expireUpload = upload.expire;
  const expire = useCallback(() => {
    expireSite();
    expireUpload();
  }, [expireSite, expireUpload]);
  useEffect(() => {
    if (sessionLost) expire();
  }, [sessionLost, expire]);
  if (!sessionLost && !initial && query.isFetchedAfterMount && query.isSuccess)
    setInitial(query.data);
  if (
    !sessionLost &&
    !initialUpload &&
    uploadQuery.isFetchedAfterMount &&
    uploadQuery.isSuccess
  )
    setInitialUpload(uploadQuery.data);
  const navigation = useSiteNavigation(
    !sessionLost &&
      ((settings.saved !== null &&
        hasUnsavedSiteChanges(
          settings.input,
          settings.saved,
          settings.phase,
        )) ||
        (upload.saved !== null &&
          (upload.busy ||
            upload.unknown ||
            !uploadLimitsMatch(upload.input, upload.saved)))),
  );
  const loading =
    !sessionLost && (!query.isFetchedAfterMount || query.isFetching);
  const phase = sessionLost
    ? 'session'
    : settings.saved
      ? settings.phase
      : loading
        ? 'loading'
        : query.error instanceof SiteRequestError &&
            query.error.code === 'SITE_NOT_INITIALIZED'
          ? 'uninitialized'
          : 'error';
  const uploadLoading =
    !sessionLost &&
    (!uploadQuery.isFetchedAfterMount || uploadQuery.isFetching);
  const uploadPhase = sessionLost
    ? 'session'
    : upload.saved
      ? 'ready'
      : uploadLoading
        ? 'loading'
        : uploadQuery.error instanceof UploadLimitsRequestError &&
            uploadQuery.error.code === 'UPLOAD_NOT_INITIALIZED'
          ? 'uninitialized'
          : 'error';
  return (
    <OwnerShell
      {...shell}
      name={settings.saved?.name ?? shell.name}
      description={settings.saved?.description ?? shell.description}
      onSessionExpire={expire}
      returnTo="/settings/general"
      footer={
        <>
          <Button
            id="site-save"
            type="submit"
            form="site-settings-form"
            className={saveClass}
            isDisabled={settings.locked || sessionLost}
          >
            {settings.phase === 'saving' && !sessionLost
              ? '正在保存…'
              : '保存站点信息'}
          </Button>
          <Button
            data-testid="upload-limits-save"
            type="submit"
            form="upload-limits-form"
            className={saveClass}
            isDisabled={
              !upload.saved || upload.busy || upload.unknown || sessionLost
            }
          >
            {upload.busy && !sessionLost ? '正在保存…' : '保存上传限制'}
          </Button>
        </>
      }
    >
      <section data-testid="site-general" data-state={phase} className="pb-10">
        <SettingsHeading />
        <SettingsCategories
          items={settingsCategories}
          onNavigate={navigation.navigate}
        >
          <div className="grid min-w-0 gap-5">
            <p className="text-[13px] leading-5 text-muted">
              站点信息和上传限制分别保存；其他设置由所属模块管理。
            </p>
            {settings.saved ? (
              <>
                {sessionLost ? (
                  <Card className={siteCardClass} role="alert">
                    <h2 className="text-lg font-medium">会话已失效</h2>
                    <p className="text-sm leading-6">
                      当前输入已保留，请重新登录后核对服务器设置。
                    </p>
                    <SessionLink />
                  </Card>
                ) : null}
                <SiteForm
                  settings={{
                    ...settings,
                    saved: settings.saved,
                    locked: settings.locked || sessionLost,
                  }}
                />
              </>
            ) : (
              <SiteReadState
                loading={loading}
                sessionLost={sessionLost}
                error={query.error}
                retry={() => void query.refetch()}
              />
            )}
            <section
              data-testid="upload-limits-editor"
              data-state={uploadPhase}
              data-saving={upload.busy}
              data-unknown={upload.unknown}
              data-different={upload.different}
            >
              {upload.saved ? (
                <UploadLimitsForm
                  settings={{
                    ...upload,
                    saved: upload.saved,
                    expired: sessionLost,
                  }}
                />
              ) : (
                <UploadLimitsReadState
                  loading={uploadLoading}
                  expired={sessionLost}
                  error={uploadQuery.error}
                  retry={() => void uploadQuery.refetch()}
                />
              )}
            </section>
            <RelatedSettings onExpire={expire} />
          </div>
        </SettingsCategories>
        <SiteLeaveDialog
          navigation={navigation}
          pending={
            !sessionLost &&
            ((settings.saved !== null && settings.locked) ||
              upload.busy ||
              upload.unknown)
          }
        />
      </section>
    </OwnerShell>
  );
}
