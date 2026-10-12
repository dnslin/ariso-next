import { createContext, useContext, useState, type ReactNode } from 'react';
import { caseFold } from 'unicode-case-folding';

export type Photo = {
  id: string;
  name: string;
  src: string;
  size: string;
  visibility: 'public' | 'private';
  albumIds: string[];
  tags: string[];
  trashed?: boolean;
  deleting?: boolean;
};
export type Album = { id: string; name: string; coverId?: string };
export type ShareDraft = {
  enabled: boolean;
  hideName: boolean;
  password: string;
  expires: string;
};
export type Scenario = 'sample' | 'empty' | 'attention';
export type UploadDraft = {
  files: Photo[];
  storage: string;
  visibility: Photo['visibility'];
  albumIds: string[];
  phase: 'draft' | 'uploading' | 'done' | 'failed';
};
export const tagKey = (name: string) =>
  caseFold(name.trim().normalize('NFC')).normalize('NFC');
const initialPhotos: Photo[] = [
  {
    id: 'forest',
    name: '林间清晨.jpg',
    src: '/samples/forest.jpg',
    size: '3.8 MB',
    visibility: 'public',
    albumIds: ['forest'],
    tags: ['旅行'],
  },
  {
    id: 'lake',
    name: '远山与湖.jpg',
    src: '/samples/mountain.jpg',
    size: '5.2 MB',
    visibility: 'private',
    albumIds: ['forest', 'mountain'],
    tags: ['风景'],
  },
  {
    id: 'path',
    name: '森林小路.jpg',
    src: '/samples/forest.jpg',
    size: '2.6 MB',
    visibility: 'private',
    albumIds: [],
    tags: [],
  },
  {
    id: 'dusk',
    name: '湖畔傍晚.jpg',
    src: '/samples/mountain.jpg',
    size: '4.1 MB',
    visibility: 'public',
    albumIds: ['mountain'],
    tags: ['旅行', '风景'],
  },
  {
    id: 'woods',
    name: '绿意深处.jpg',
    src: '/samples/forest.jpg',
    size: '3.2 MB',
    visibility: 'private',
    albumIds: ['forest'],
    tags: ['日常'],
  },
  {
    id: 'peak',
    name: '群山之间.jpg',
    src: '/samples/mountain.jpg',
    size: '4.6 MB',
    visibility: 'public',
    albumIds: [],
    tags: [],
  },
  {
    id: 'old-lake',
    name: '湖面倒影.jpg',
    src: '/samples/mountain.jpg',
    size: '3.4 MB',
    visibility: 'private',
    albumIds: ['mountain'],
    tags: ['风景'],
    trashed: true,
  },
  {
    id: 'old-forest',
    name: '旧日森林.jpg',
    src: '/samples/forest.jpg',
    size: '2.9 MB',
    visibility: 'public',
    albumIds: [],
    tags: [],
    trashed: true,
  },
];
function useData(scenario: Scenario) {
  const [photos, setPhotos] = useState<Photo[]>(
    scenario === 'empty' ? [] : initialPhotos,
  );
  const [albums, setAlbums] = useState<Album[]>(
    scenario === 'empty'
      ? []
      : [
          { id: 'forest', name: '林间日记' },
          { id: 'mountain', name: '山与湖' },
          { id: 'empty', name: '待整理' },
        ],
  );
  const [tags, setTags] = useState(
    scenario === 'empty' ? [] : ['旅行', '风景', '日常', 'fellow'],
  );
  const [shares, setShares] = useState<Record<string, ShareDraft>>({
    mountain: { enabled: true, hideName: false, password: '', expires: '' },
  });
  const [failed, setFailed] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UploadDraft>>({});
  function consumeFailure(key: string) {
    if (scenario !== 'attention' || failed.includes(key)) return false;
    setFailed((current) => [...current, key]);
    return true;
  }
  function createTag(name: string) {
    const display = name.trim().normalize('NFC');
    if (!display) return { error: '请输入标签名称' };
    if (tags.some((tag) => tagKey(tag) === tagKey(display)))
      return { error: '已有同名标签，请直接选择' };
    setTags((current) => [...current, display]);
    return {};
  }
  return {
    photos,
    setPhotos,
    albums,
    setAlbums,
    tags,
    createTag,
    shares,
    setShares,
    consumeFailure,
    drafts,
    setDrafts,
  };
}
const DataContext = createContext<ReturnType<typeof useData> | null>(null);
export function DataProvider({
  scenario,
  children,
}: {
  scenario: Scenario;
  children: ReactNode;
}) {
  const value = useData(scenario);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
export function useDataStore() {
  const value = useContext(DataContext);
  if (!value) throw new Error('Missing prototype data');
  return value;
}
