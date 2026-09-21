// Deliberately deterministic transport fixtures, not a business API.
export async function GET(request: Request) {
  const mode = new URL(request.url).searchParams.get('mode');
  await new Promise((resolve) => setTimeout(resolve, 250));
  return new Response(
    mode === 'empty' ? '' : mode === 'error' ? '实验错误' : '查询成功',
    {
      status: mode === 'error' ? 503 : 200,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
