import {
  resolveSmartRules,
  normalizeSmartRules,
} from '../../../../../server/library/smart-rules.ts';
import { respondToLibraryQuery } from '../../../images/query-response.ts';
import { readSmartCollectionBody } from '../response.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Resolve the browsing boundary without saving or changing a collection. */
export function POST(request: Request) {
  return respondToLibraryQuery(request, async () => ({
    query: resolveSmartRules(
      normalizeSmartRules(await readSmartCollectionBody(request)),
    ),
  }));
}
