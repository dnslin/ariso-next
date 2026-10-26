import Prototype from './prototype';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  return <Prototype initialView={params.view === 'web' ? 'web' : 'upload'} />;
}
