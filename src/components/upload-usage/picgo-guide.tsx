'use client';

import { Card } from '@heroui/react/card';
import { Link } from '@heroui/react/link';
import { ArrowUpRight } from 'lucide-react';

export function PicGoGuide() {
  return (
    <Card
      data-testid="upload-usage-picgo"
      className="grid min-w-0 gap-2 rounded-xl border border-border bg-surface p-4 shadow-none"
    >
      <h2 className="text-sm font-medium">使用 PicGo 上传</h2>
      <p className="text-sm leading-relaxed">
        创建独立上传 Token，在 PicGo 的 Ariso 上传器中填写站点地址与 Token。
        通过此上传器上传的图片将公开。
      </p>
      <p className="text-xs leading-relaxed text-muted">
        按指南安装 Ariso 插件，GUI 与 Core 分别配置。
      </p>
      <Link
        data-testid="upload-usage-picgo-guide"
        href="https://github.com/dnslin/ariso-next/blob/main/docs/guides/picgo.md"
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 w-fit items-center gap-1 text-sm font-normal text-foreground underline underline-offset-4"
      >
        查看 PicGo 接入指南
        <ArrowUpRight className="size-4 shrink-0" aria-hidden />
      </Link>
    </Card>
  );
}
