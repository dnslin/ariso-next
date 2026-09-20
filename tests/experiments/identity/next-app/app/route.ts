export function GET() {
  return new Response(
    '<!doctype html><title>Identity protocol experiment</title><p>EV-IDENTITY-01 HTTP fixture</p>',
    {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    },
  );
}
