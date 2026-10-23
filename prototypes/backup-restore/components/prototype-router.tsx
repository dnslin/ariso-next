'use client';

import { usePathname } from 'next/navigation';
import { BackupScreen } from './backup-screen';
import { RestoreScreen } from './restore-screen';
import {
  LibraryScreen,
  UploadScreen,
  PublicImageScreen,
} from './browse-screen';

export function PrototypeRouter() {
  const path = usePathname();
  if (path.startsWith('/setup')) return <RestoreScreen />;
  if (path.startsWith('/library')) return <LibraryScreen />;
  if (path.startsWith('/upload')) return <UploadScreen />;
  if (path.startsWith('/i/')) return <PublicImageScreen />;
  return <BackupScreen />;
}
