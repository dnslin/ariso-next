import { getAuth } from '../../../context.ts';

// Deliberately probes the trusted server API boundary; never a production route.
export async function POST(request: Request) {
  return getAuth().api.signInEmail({
    headers: request.headers,
    body: await request.json(),
    asResponse: true,
  });
}
