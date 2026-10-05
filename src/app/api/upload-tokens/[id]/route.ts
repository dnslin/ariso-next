import {
  publicUploadToken,
  readUploadTokenInput,
  uploadTokenResponse,
} from '../../../../server/identity/tokens.ts';
import { uploadTokenUpdateInputSchema } from '../../../../server/identity/validation.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export function PATCH(request: Request, context: Context) {
  return uploadTokenResponse(request, async (auth) => {
    const { id: keyId } = await context.params;
    const body = await readUploadTokenInput(
      request,
      uploadTokenUpdateInputSchema,
    );
    const updated = await auth.api.updateApiKey({
      headers: request.headers,
      body: { keyId, enabled: body.enabled },
      returnHeaders: true,
    });
    return {
      response: { token: publicUploadToken(updated.response) },
      headers: updated.headers,
    };
  });
}

export function DELETE(request: Request, context: Context) {
  return uploadTokenResponse(request, async (auth) => {
    const { id: keyId } = await context.params;
    return auth.api.deleteApiKey({
      headers: request.headers,
      body: { keyId },
      returnHeaders: true,
    });
  });
}
