'use client';

import { usePathname } from 'next/navigation';
import { LibraryPreview } from './library-preview';
import { UploadPreview } from './upload-preview';

export function Prototype() {
  const pathname = usePathname();
  const uploading = pathname.startsWith('/upload');
  const collectionId = pathname.startsWith('/library/collections/')
    ? pathname.split('/').at(-1)
    : undefined;
  return (
    <>
      <UploadPreview active={uploading} />
      {!uploading && (
        <LibraryPreview
          key={pathname}
          collectionId={collectionId}
          trash={pathname === '/trash'}
        />
      )}
    </>
  );
}
