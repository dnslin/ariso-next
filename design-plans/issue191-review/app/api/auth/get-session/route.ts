// This isolated prototype only simulates the shared shell's session check.
export function GET() {
  return Response.json({ user: { id: 'prototype-owner', name: '演示账号' } });
}
