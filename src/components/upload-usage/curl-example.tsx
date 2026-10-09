'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { TextArea } from '@heroui/react/textarea';
import { TextField } from '@heroui/react/textfield';
import { ToggleButton } from '@heroui/react/toggle-button';
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { Tooltip } from '@heroui/react/tooltip';
import { toast } from '@heroui/react/toast';
import { Copy } from 'lucide-react';
import { buildUploadCurl } from '../../shared/upload-usage';

export function CurlExample({ publicUrl }: { publicUrl: string }) {
  const [example, setExample] = useState<'minimal' | 'full'>('minimal');
  const [failed, setFailed] = useState(false);
  const [manualVisible, setManualVisible] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const command = buildUploadCurl(publicUrl, example);

  async function copy() {
    if (pending.current) return;
    pending.current = true;
    try {
      await navigator.clipboard.writeText(command);
      if (!mounted.current) return;
      setFailed(false);
      toast('已复制', { variant: 'default' });
    } catch {
      if (mounted.current) {
        setFailed(true);
        setManualVisible(true);
      }
    } finally {
      pending.current = false;
    }
  }

  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid min-w-0 gap-3 rounded-xl bg-default p-4">
        <div className="flex items-center justify-between gap-3">
          <ToggleButtonGroup
            aria-label="上传命令示例"
            selectionMode="single"
            disallowEmptySelection
            isDetached
            selectedKeys={new Set([example])}
            onSelectionChange={(keys) => {
              const value = [...keys][0];
              if (value === 'minimal' || value === 'full') {
                setExample(value);
                setFailed(false);
                setManualVisible(false);
              }
            }}
            className="gap-2"
          >
            <ToggleButton
              id="minimal"
              className="h-11 min-h-11 rounded-lg border border-border bg-surface px-3.5 text-sm font-normal data-[selected=true]:border-transparent data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
            >
              最小示例
            </ToggleButton>
            <ToggleButton
              id="full"
              className="h-11 min-h-11 rounded-lg border border-border bg-surface px-3.5 text-sm font-normal data-[selected=true]:border-transparent data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
            >
              完整示例
            </ToggleButton>
          </ToggleButtonGroup>
          <Tooltip delay={150}>
            <Button
              data-testid="upload-usage-copy"
              aria-label="复制命令"
              isIconOnly
              variant="outline"
              preventFocusOnPress
              className="size-11 min-w-11 shrink-0 rounded-lg bg-surface p-0"
              onPress={() => void copy()}
            >
              <Copy className="size-5" aria-hidden />
            </Button>
            <Tooltip.Content className="text-xs">复制命令</Tooltip.Content>
          </Tooltip>
        </div>
        <pre
          data-testid="upload-usage-command"
          className="m-0 select-text font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere min-[1200px]:text-[13px]"
        >
          {command}
        </pre>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        在本机设置 ARISO_UPLOAD_TOKEN，替换图片路径；完整示例还需替换存储和相册
        ID。
      </p>
      {manualVisible ? (
        <div className="grid min-w-0 gap-3">
          <p
            data-testid="upload-usage-copy-error"
            role={failed ? 'alert' : undefined}
            className={`text-[13px] ${failed ? 'text-danger' : 'text-muted'}`}
          >
            {failed
              ? '复制失败，请选中下方完整命令手动复制。'
              : '请选中下方完整命令手动复制。'}
          </p>
          <TextField aria-label="完整上传命令" isReadOnly className="min-w-0">
            <TextArea
              data-testid="upload-usage-manual"
              aria-label="完整上传命令"
              value={command}
              readOnly
              className={`h-[180px] min-h-[180px] w-full rounded-lg border bg-surface p-3 font-mono text-xs! leading-relaxed whitespace-pre-wrap wrap-anywhere ${failed ? 'border-danger' : 'border-border'}`}
            />
          </TextField>
        </div>
      ) : null}
    </div>
  );
}
