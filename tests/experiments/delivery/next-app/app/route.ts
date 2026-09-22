export function GET() {
  return new Response(
    '<!doctype html><title>Delivery protocol experiment</title><a href="/file?id=browser&download=1">下载中文文件</a><a href="/file?id=svg">下载 SVG</a>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
