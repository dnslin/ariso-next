import { Button } from '@heroui/react';
import { CircleAlert, Globe2, LoaderCircle, X } from 'lucide-react';
import type { SourceEntry } from './use-sources';

export function SourceList({
  entries,
  onAuthorize,
  onDismiss,
}: {
  entries: SourceEntry[];
  onAuthorize: (entry: SourceEntry) => void;
  onDismiss: (entry: SourceEntry) => void;
}) {
  if (!entries.length) return null;
  return (
    <section
      aria-label="待读取的网页图片"
      className="border-b border-border px-4 py-2"
    >
      {entries.map((entry) => {
        const pending =
          entry.state === 'checking' || entry.state === 'fetching';
        let host = '图片来源';
        try {
          host = new URL(entry.url).host || '不支持的图片来源';
        } catch {
          host = '无效的图片来源';
        }
        return (
          <div key={entry.id} className="py-2">
            <div className="flex items-center gap-2">
              <Globe2 size={14} className="shrink-0 text-muted" />
              <p className="min-w-0 flex-1 truncate text-xs" title={host}>
                {host}
              </p>
              <Button
                isIconOnly
                variant="ghost"
                isDisabled={pending}
                aria-label={`移除来自${host}的图片`}
                className="size-11 shrink-0 rounded-lg text-muted"
                onPress={() => onDismiss(entry)}
              >
                <X size={14} />
              </Button>
            </div>
            {entry.message && (
              <p
                role="alert"
                className="mb-2 flex items-start gap-1.5 text-xs leading-5 text-danger"
              >
                <CircleAlert size={13} className="mt-1 shrink-0" />
                {entry.message}
              </p>
            )}
            {pending ? (
              <p className="flex min-h-9 items-center gap-2 text-xs text-muted">
                <LoaderCircle
                  size={13}
                  className="animate-spin motion-reduce:animate-none"
                />
                正在读取网页图片…
              </p>
            ) : (
              <Button
                variant="secondary"
                className="min-h-11 w-full rounded-lg text-xs"
                onPress={() => onAuthorize(entry)}
              >
                {entry.state === 'failed' ? '重新读取图片' : '允许读取并加入'}
              </Button>
            )}
          </div>
        );
      })}
    </section>
  );
}
