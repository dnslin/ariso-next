import { getAuth } from '../../../context.ts';

export async function POST(request: Request) {
  return getAuth().api.signInSocial({
    headers: request.headers,
    body: await request.json(),
    asResponse: true,
  });
}
