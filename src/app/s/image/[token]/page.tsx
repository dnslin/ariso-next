import type { Metadata } from 'next';
import { connection } from 'next/server';
import { PublicShell } from '../../../../components/shell/public-shell';
import { ImageShareScreen } from '../../../../components/sharing/image-share-screen';
import { createRuntimeLogger } from '../../../../server/runtime/logger';
import { readPublicImageShare } from '../../../../server/sharing/image-configuration';
import { readSiteSettings } from '../../../../server/site/settings';
import { brandingUrl } from '../../../../server/site/urls';
import { getServerRuntime } from '../../../../server/startup/server-start';

export const metadata: Metadata = {
  description: '查看临时分享的图片。',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function ImageSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection();
  const { token } = await params;
  const runtime = getServerRuntime();
  const site = readSiteSettings(runtime.connection.db);
  let initial: {
    status: number;
    view: ReturnType<typeof readPublicImageShare> | null;
  };
  try {
    initial = {
      status: 200,
      view: readPublicImageShare(runtime.connection.db, token),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string' &&
      error.code.startsWith('SHARING_') &&
      'status' in error &&
      typeof error.status === 'number'
    )
      initial = { status: error.status, view: null };
    else {
      createRuntimeLogger('sharing.image.page', runtime.config.logLevel).error(
        { err: error },
        'Private image share page failed',
      );
      initial = { status: 500, view: null };
    }
  }
  return (
    <PublicShell layout="share">
      <ImageShareScreen
        token={token}
        initial={initial}
        timeZone={site?.timeZone ?? 'UTC'}
        brand={{
          name: site?.name ?? 'Ariso',
          description: '',
          logoUrl: site ? brandingUrl(site.logoKey) : null,
        }}
      />
    </PublicShell>
  );
}
