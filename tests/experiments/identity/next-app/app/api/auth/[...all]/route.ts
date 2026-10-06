import { getAuth } from '../../../../context.ts';

export function GET(request: Request) {
  if (process.env.IDENTITY_GITHUB_SETTINGS) {
    const allowed: Record<string, string> = {
      '/api/auth/get-session': 'GET',
      '/api/auth/callback/github': 'GET',
      '/api/auth/sign-in/email': 'POST',
      '/api/auth/sign-in/social': 'POST',
      '/api/auth/sign-up/email': 'POST',
      '/api/auth/sign-out': 'POST',
    };
    if (allowed[new URL(request.url).pathname] !== request.method)
      return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
  }
  return getAuth().handler(request);
}
export const POST = GET;
