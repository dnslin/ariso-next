import type { Metadata } from 'next';
import { connection } from 'next/server';
import { cache } from 'react';
import { Link } from '@heroui/react/link';
import { PublicShell } from '../components/shell/public-shell';
import { readSiteSettings } from '../server/site/settings';
import { getServerRuntime } from '../server/startup/server-start';

const readBrand = cache(async () => {
  await connection();
  return readSiteSettings(getServerRuntime().connection.db);
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await readBrand();
  return {
    title: settings?.name ?? 'Ariso',
    description: settings?.description ?? '单用户，自托管图床。',
  };
}

export default async function HomePage() {
  const settings = await readBrand();
  return (
    <PublicShell home>
      <div className="home-brand">
        <h1 className="brand-wordmark" id="home-heading">
          {settings?.name ?? 'Ariso'}
        </h1>
        <div className="brand-underline" aria-hidden="true" />
        <p className="home-description">
          {settings?.description ?? '轻装简从'}
        </p>
        <p className="home-availability">
          {settings
            ? '登录后进入你的工作空间。'
            : '首次使用，请完成站点初始化。'}
        </p>
        <Link href={settings ? '/login' : '/setup'}>
          {settings ? '登录' : '开始初始化'}
        </Link>
        <p className="home-caption">开源 · 极简 · 图片托管</p>
      </div>
    </PublicShell>
  );
}
