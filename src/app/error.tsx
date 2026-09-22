'use client';

import { Button } from '@heroui/react/button';
import { PublicShell } from '../components/shell/public-shell';

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <PublicShell>
      <section className="public-message" role="alert">
        <h1>页面加载失败</h1>
        <p>暂时无法读取页面内容，请稍后重试。</p>
        <Button onPress={retry}>重试</Button>
      </section>
    </PublicShell>
  );
}
