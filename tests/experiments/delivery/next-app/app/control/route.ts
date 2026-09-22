import { cases, create } from '../../context.ts';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const { id, state, release } = await request.json();
  let probe = cases.get(id);
  if (!probe) probe = create(id, state);
  else Object.assign(probe.state, state);
  if (release) probe.releases.shift()?.();
  return Response.json({ ok: true });
}
export async function GET(request: Request) {
  const probe = cases.get(new URL(request.url).searchParams.get('id')!);
  return Response.json(
    probe ? { ...probe, releases: probe.releases.length } : null,
  );
}
