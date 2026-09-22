import { notFound, redirect } from 'next/navigation';
import { ShellFixture } from '../shell-fixture';

const routes = [
  'dashboard',
  'empty',
  'long-name',
  'images',
  'settings/basic',
  'settings/storage',
];

export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  const route = path?.join('/') ?? 'dashboard';
  if (route === 'settings') redirect('/settings/basic');
  if (!routes.includes(route)) notFound();
  return <ShellFixture route={route} />;
}
