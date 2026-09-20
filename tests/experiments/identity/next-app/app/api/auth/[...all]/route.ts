import { getAuth } from '../../../../context.ts';

export function GET(request: Request) {
  return getAuth().handler(request);
}
export const POST = GET;
