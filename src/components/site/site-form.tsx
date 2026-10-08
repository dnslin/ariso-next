'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Form } from '@heroui/react/form';
import { TextField } from '@heroui/react/textfield';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import { Link } from '@heroui/react/link';
import { siteFieldLabels } from './model';
import { SiteFeedback } from './site-feedback';
import { SavedAddresses } from './saved-addresses';
import type { useSiteSettings } from './use-site-settings';
import type { SiteSettingsResponse } from './api';
import { StorageTip } from '../storage/storage-tip';

export const siteCardClass =
  'min-w-0 gap-4 rounded-[20px] border border-border bg-surface p-4 shadow-none min-[1200px]:px-6 min-[1200px]:py-5';

export function SiteForm({
  settings,
}: {
  settings: ReturnType<typeof useSiteSettings> & {
    saved: SiteSettingsResponse;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className={siteCardClass}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">站点信息</h2>
        <StorageTip label="站点信息">
          名称和描述按普通文本显示。时区只改变时间展示，不改写历史 UTC 时间。
        </StorageTip>
      </div>
      <SiteFeedback settings={settings} />
      <Form
        id="site-settings-form"
        validationBehavior="aria"
        className="grid min-w-0 gap-4 min-[1200px]:grid-cols-2 min-[1200px]:gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void settings.save();
        }}
      >
        {(Object.keys(siteFieldLabels) as (keyof typeof siteFieldLabels)[]).map(
          (field) => (
            <TextField
              key={field}
              id={`site-${field}`}
              name={field}
              value={settings.input[field]}
              onChange={(value) => settings.change(field, value)}
              isDisabled={settings.locked}
              isInvalid={Boolean(settings.errors[field])}
              validationBehavior="aria"
              className="min-w-0 gap-2"
            >
              <Label className="text-sm font-medium">
                {siteFieldLabels[field]}
              </Label>
              <Input
                spellCheck={false}
                className={`h-12 min-w-0 rounded-lg border bg-background px-3.5 text-sm shadow-none ${settings.errors[field] ? 'border-danger' : 'border-border'}`}
              />
              <FieldError>{settings.errors[field]}</FieldError>
            </TextField>
          ),
        )}
      </Form>
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 w-fit rounded-lg px-0 text-sm"
        aria-expanded={expanded}
        aria-controls="site-complete-address"
        onPress={() => setExpanded(!expanded)}
      >
        {expanded ? '收起完整地址' : '查看完整地址'}
      </Button>
      {expanded ? (
        <div id="site-complete-address" className="grid min-w-0 gap-3">
          <p
            className="select-text text-sm wrap-anywhere"
            aria-label="完整输入地址"
          >
            {settings.input.publicUrl}
          </p>
          {!settings.originNotice ? (
            <SavedAddresses saved={settings.saved} />
          ) : null}
        </div>
      ) : null}
      {settings.originNotice ? (
        <div className="grid min-w-0 gap-3 border-t border-border pt-4">
          <h3 className="font-medium">公开地址已更新</h3>
          <SavedAddresses saved={settings.saved} />
          <p className="text-sm leading-6">
            请更新 GitHub OAuth 回调。全部 S3
            浏览器直传检测结果已失效，需要重新检测。旧域名和反向代理由你维护。若当前地址无法继续保存，请打开新地址并重新登录；图片
            ID 与路径保持不变。
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/settings/storage"
              className="flex min-h-11 items-center rounded-lg border border-border bg-background px-4 text-sm text-foreground no-underline"
            >
              检查浏览器直传
            </Link>
            <Link
              href="/settings/account"
              className="flex min-h-11 items-center rounded-lg border border-border bg-background px-4 text-sm text-foreground no-underline"
            >
              账号与安全
            </Link>
          </div>
        </div>
      ) : null}
      {settings.timeZoneNotice ? (
        <p
          role="status"
          className="border-t border-border pt-4 text-sm leading-6"
        >
          站点时区已更新。后续时间按新时区显示，历史记录的 UTC 时间点保持不变。
        </p>
      ) : null}
    </Card>
  );
}
