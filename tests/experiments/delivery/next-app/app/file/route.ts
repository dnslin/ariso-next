import { cases, getAuth } from '../../context.ts';
import { deliver } from '../../../fixture.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  const probe = cases.get(new URL(request.url).searchParams.get('id')!);
  if (!probe) return new Response(null, { status: 404 });
  return deliver(
    request,
    probe,
    process.env.DELIVERY_ROOT!,
    async () =>
      !!(await getAuth().api.getSession({
        headers: request.headers,
        query: { disableRefresh: true },
      })),
  );
}
export { handle as GET, handle as HEAD };
