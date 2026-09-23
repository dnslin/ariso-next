import { records } from '../records';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1);
  const sort = params.get('sort');
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !['asc', 'desc'].includes(sort ?? '')
  )
    return new Response('实验查询参数无效', { status: 400 });
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (q === 'error') return new Response('实验 HTTP 错误', { status: 503 });
  const matches = records.filter((item) => item.name.includes(q));
  if (sort === 'desc') matches.reverse();
  return Response.json(
    {
      items: matches.slice((page - 1) * 20, page * 20),
      total: matches.length,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
