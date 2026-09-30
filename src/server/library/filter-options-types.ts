export type LibraryFilterOptionKind = 'tags' | 'albums' | 'storages';

export type LibraryFilterOption = {
  id: string;
  name: string;
  enabled?: boolean;
};

export type LibraryFilterOptions = {
  items: LibraryFilterOption[];
  selected: LibraryFilterOption[];
  missingIds: string[];
  page: number;
  hasMore: boolean;
};
