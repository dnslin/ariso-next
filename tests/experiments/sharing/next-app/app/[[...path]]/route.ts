import { createSharingHttp } from '../../../http.ts';
const state = globalThis as typeof globalThis & {
  sharingExperiment?: ReturnType<typeof createSharingHttp>;
};
const getExperiment = () =>
  (state.sharingExperiment ??= createSharingHttp(
    process.env.SHARING_DATABASE!,
    process.env.SHARING_CONFIG!,
    process.env.BETTER_AUTH_SECRET!,
  ));
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const GET = (request: import('next/server').NextRequest) =>
  getExperiment().handle(request);
export const POST = GET;
