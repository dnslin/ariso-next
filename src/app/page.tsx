import type { Metadata } from 'next';
import { connection } from 'next/server';
import { cache } from 'react';
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
          账号初始化、登录和图片上传尚未开放。
        </p>
        <p className="home-caption">开源 · 极简 · 图片托管</p>
      </div>
    </PublicShell>
  );
}
