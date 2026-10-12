import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePrototype } from './shared';

export type Photo = {
  id: string;
  name: string;
  src: string;
  size: string;
  visibility: 'public' | 'private';
  albumIds: string[];
  tags: string[];
};
export type Album = { id: string; name: string };
export type UploadSettings = {
  storage: string;
  visibility: Photo['visibility'];
  albumId: string;
};
export type UploadJob = UploadSettings & {
  id: string;
  albumName: string;
  files: Photo[];
  progress: number;
  phase: 'uploading' | 'processing' | 'done' | 'failed';
  fail: boolean;
};

const samplePhotos: Photo[] = [
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
    id: 'mountain',
    name: '远山与湖.jpg',
    src: '/samples/mountain.jpg',
    size: '5.2 MB',
    visibility: 'private',
    albumIds: ['mountain', 'forest'],
    tags: ['风景'],
  },
  {
    id: 'forest-2',
    name: '森林小路.jpg',
    src: '/samples/forest.jpg',
    size: '2.6 MB',
    visibility: 'private',
    albumIds: [],
    tags: [],
  },
  {
    id: 'mountain-2',
    name: '湖畔傍晚.jpg',
    src: '/samples/mountain.jpg',
    size: '4.1 MB',
    visibility: 'public',
    albumIds: ['mountain'],
    tags: ['风景'],
  },
];

function useCollectionState() {
  const { scenario, notify } = usePrototype();
  const [photos, setPhotos] = useState<Photo[]>(
    scenario === 'empty' ? [] : samplePhotos,
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
  const [uploadTarget, setUploadTarget] = useState<{ albumId: string } | null>(
    null,
  );
  const [uploadOpen, setUploadOpen] = useState(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const failedActions = useRef(new Set<string>());
  const localUrls = useRef<string[]>([]);
  const uploadOpener = useRef<HTMLElement | null>(null);
  function consumeFailure(action: string) {
    if (scenario !== 'attention' || failedActions.current.has(action))
      return false;
    failedActions.current.add(action);
    return true;
  }
  useEffect(
    () => () => localUrls.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );
  useEffect(() => {
    if (
      !jobs.some(
        (job) => job.phase === 'uploading' || job.phase === 'processing',
      )
    )
      return;
    // Only the standalone prototype advances these simulated jobs. No upload API is called.
    const timer = setTimeout(() => {
      const completed = jobs.filter((job) => job.phase === 'processing');
      setJobs(
        jobs.map((job) => {
          if (job.phase === 'processing') return { ...job, phase: 'done' };
          if (job.phase !== 'uploading') return job;
          if (job.fail) return { ...job, phase: 'failed' };
          const progress = Math.min(100, job.progress + 35);
          return {
            ...job,
            progress,
            phase: progress === 100 ? 'processing' : 'uploading',
          };
        }),
      );
      if (completed.length) {
        setPhotos((current) => [
          ...completed.flatMap((job) => job.files),
          ...current,
        ]);
        notify(
          `已上传 ${completed.reduce((count, job) => count + job.files.length, 0)} 张图片`,
        );
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [jobs, notify]);
  return {
    photos,
    setPhotos,
    albums,
    setAlbums,
    uploadTarget,
    uploadOpen,
    setUploadOpen,
    jobs,
    consumeFailure,
    openUpload: (albumId = '', opener?: HTMLElement | null) => {
      uploadOpener.current =
        opener ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);
      setUploadTarget({ albumId });
      setUploadOpen(true);
    },
    closeUpload: () => {
      setUploadOpen(false);
      requestAnimationFrame(() => uploadOpener.current?.focus());
    },
    createLocalPhoto: (file: File): Photo => {
      const src = URL.createObjectURL(file);
      localUrls.current.push(src);
      return {
        id: crypto.randomUUID(),
        name: file.name,
        src,
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        visibility: 'private',
        albumIds: [],
        tags: [],
      };
    },
    startUpload: (files: Photo[], settings: UploadSettings) => {
      const job: UploadJob = {
        ...settings,
        id: crypto.randomUUID(),
        albumName:
          albums.find((album) => album.id === settings.albumId)?.name ?? '',
        files: files.map((file) => ({
          ...file,
          visibility: settings.visibility,
          albumIds: settings.albumId ? [settings.albumId] : [],
        })),
        progress: 0,
        phase: 'uploading',
        fail: consumeFailure('upload'),
      };
      setJobs((current) => [...current, job]);
    },
    retryUpload: (id: string) =>
      setJobs((current) =>
        current.map((job) =>
          job.id === id
            ? { ...job, phase: 'uploading', fail: false, progress: 0 }
            : job,
        ),
      ),
    addToAlbum: (ids: string[], albumId: string) =>
      setPhotos((current) =>
        current.map((photo) =>
          ids.includes(photo.id)
            ? { ...photo, albumIds: [...new Set([...photo.albumIds, albumId])] }
            : photo,
        ),
      ),
  };
}

const CollectionContext = createContext<ReturnType<
  typeof useCollectionState
> | null>(null);
export function CollectionProvider({ children }: { children: ReactNode }) {
  const value = useCollectionState();
  return (
    <CollectionContext.Provider value={value}>
      {children}
    </CollectionContext.Provider>
  );
}
export function useCollections() {
  const value = useContext(CollectionContext);
  if (!value) throw new Error('CollectionProvider is required');
  return value;
}
