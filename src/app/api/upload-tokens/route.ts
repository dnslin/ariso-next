import {
  publicUploadToken,
  readUploadTokenInput,
  uploadTokenResponse,
} from '../../../server/identity/tokens.ts';
import { uploadTokenCreateInputSchema } from '../../../server/identity/validation.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return uploadTokenResponse(request, async (auth) => {
    const result = await auth.api.listApiKeys({
      headers: request.headers,
      returnHeaders: true,
    });
    return {
      response: { tokens: result.response.apiKeys.map(publicUploadToken) },
      headers: result.headers,
    };
  });
}

export function POST(request: Request) {
  return uploadTokenResponse(request, async (auth) => {
    const body = await readUploadTokenInput(
      request,
      uploadTokenCreateInputSchema,
    );
    const created = await auth.api.createApiKey({
      headers: request.headers,
      body,
      returnHeaders: true,
    });
    return {
      response: {
        token: publicUploadToken(created.response),
        key: created.response.key,
      },
      headers: created.headers,
    };
  });
}
