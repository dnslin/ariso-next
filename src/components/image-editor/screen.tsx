'use client';

import { useRouter } from 'next/navigation';
import { OwnerShell } from '../shell/owner-shell';
import { ImageEditorWorkspace } from './editor-workspace';
export function ImageEditorScreen(props: {
  name: string;
  logoUrl: string | null;
  description: string;
  email: string;
  ownerName: string;
  initialSidebarCollapsed: boolean;
  imageIds: string[];
  requestId?: string;
  returnTo: string;
}) {
  const router = useRouter();
  const query = new URLSearchParams();
  props.imageIds.forEach((id) => query.append('image', id));
  if (props.requestId) query.set('requestId', props.requestId);
  query.set('returnTo', props.returnTo);
  return (
    <OwnerShell {...props} returnTo={`/library/edit?${query}`}>
      <ImageEditorWorkspace
        imageIds={props.imageIds}
        requestId={props.requestId}
        onClose={() => router.push(props.returnTo)}
      />
    </OwnerShell>
  );
}
