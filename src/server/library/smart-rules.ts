import { z } from 'zod';
import {
  LibraryQueryError,
  parseLibraryQuery,
  type LibraryFilters,
} from './query-schema.ts';
import { libraryRequestParams } from './query-params.ts';

/** Saved criteria use the same named fields as the library HTTP query, without navigation state. */
export type SmartCollectionRules = Record<string, string | string[]>;
export interface SmartCollection {
  id: string;
  name: string;
  rules: SmartCollectionRules;
  createdAt: string;
  updatedAt: string;
}
const navigationKeys = ['scope', 'pageSize', 'page', 'cursor', 'relativeTo'];
const inputSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())]),
);

function rulesParams(rules: SmartCollectionRules) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rules)) {
    if (Array.isArray(value))
      for (const item of value) params.append(key, item);
    else params.set(key, value);
  }
  return params;
}

export function smartRulesFromFilters(
  filters: LibraryFilters,
): SmartCollectionRules {
  const params = libraryRequestParams(filters, {});
  for (const key of navigationKeys) params.delete(key);
  return Object.fromEntries(
    [...new Set(params.keys())].map((key) => [
      key,
      key === 'tagId' ? params.getAll(key) : params.get(key)!,
    ]),
  );
}

export function normalizeSmartRules(input: unknown): SmartCollectionRules {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    throw new LibraryQueryError('集合条件必须是有效的筛选字段');
  if (navigationKeys.some((key) => Object.hasOwn(parsed.data, key)))
    throw new LibraryQueryError('集合不能保存页码、范围或本次浏览时间');
  const params = rulesParams(parsed.data);
  if (params.has('recentDays'))
    params.set('relativeTo', new Date(0).toISOString());
  const query = parseLibraryQuery(params);
  return smartRulesFromFilters(query.filters);
}

export function resolveSmartRules(
  rules: SmartCollectionRules,
  now = new Date(),
): string {
  const params = rulesParams(rules);
  if (params.has('recentDays')) params.set('relativeTo', now.toISOString());
  return libraryRequestParams(parseLibraryQuery(params).filters, {}).toString();
}
