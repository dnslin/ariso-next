// Deliberately small HTTP/UI fixture; the separate SQLite experiment measures scale.
export const records = Array.from({ length: 120 }, (_, index) => ({
  id: `image-${String(index + 1).padStart(3, '0')}`,
  name: `${index % 2 ? '海边' : '山间'} ${index + 1}`,
  src: `/library-sample.${index % 2 ? 'jpg' : 'png'}`,
}));
export type RecordItem = (typeof records)[number];
export type Result = { items: RecordItem[]; total: number };
