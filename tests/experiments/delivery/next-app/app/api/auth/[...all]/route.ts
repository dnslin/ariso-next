import { getAuth } from '../../../../context.ts';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return getAuth().handler(request);
}
