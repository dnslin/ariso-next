import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { cache } from 'react';
import { PublicShell } from '../../../components/shell/public-shell';
import { ShareScreen } from '../../../components/sharing/screen';
import { createRuntimeLogger } from '../../../server/runtime/logger';
import { shareGrantCookie } from '../../../server/sharing/authorization';
import { readPublicSharePage } from '../../../server/sharing/public-query';
import type { PublicSharePage } from '../../../server/sharing/public-types';
import { readSiteSettings } from '../../../server/site/settings';
import { brandingUrl } from '../../../server/site/urls';
import { getServerRuntime } from '../../../server/startup/server-start';

const readBrand = cache(async () => {
  await connection();
  const site = readSiteSettings(getServerRuntime().connection.db);
  return {
    name: site?.name ?? 'Ariso',
    description: site?.description ?? '',
    logoUrl: site ? brandingUrl(site.logoKey) : null,
  };
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = await readBrand();
  return {
    title: `${brand.name} · 相册分享`,
    description: '查看分享的公开图片。',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection();
  const { token } = await params;
  const runtime = getServerRuntime();
  const grantSecret = (await cookies()).get(shareGrantCookie)?.value;
  let initial: { status: number; page: PublicSharePage | null };
  try {
    initial = {
      status: 200,
      page: readPublicSharePage(runtime.connection.db, { token, grantSecret }),
    };
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      typeof err.code === 'string' &&
      err.code.startsWith('SHARING_') &&
      'status' in err &&
      typeof err.status === 'number'
    ) {
      initial = { status: err.status, page: null };
    } else {
      createRuntimeLogger('sharing.page', runtime.config.logLevel).error(
        { err },
        'Public share page read failed',
      );
      initial = { status: 500, page: null };
    }
  }
  return (
    <PublicShell layout="share">
      <ShareScreen
        key={token}
        token={token}
        initial={initial}
        brand={await readBrand()}
      />
    </PublicShell>
  );
}
