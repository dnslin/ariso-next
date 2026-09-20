import { getAuth } from '../../../context.ts';

export async function GET(request: Request) {
  return Response.json(
    await getAuth().api.getSession({ headers: request.headers }),
  );
}
