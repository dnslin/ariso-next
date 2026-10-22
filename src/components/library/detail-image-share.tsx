'use client';

import type { LibraryDetail } from '../../server/library/detail-types';
import { ImageShareBody } from '../sharing/image-share-body';

export function DetailImageShare({
  detail,
  onClose,
  onSessionExpire,
}: {
  detail: LibraryDetail;
  onClose: () => void;
  onSessionExpire?: () => void;
}) {
  return (
    <ImageShareBody
      key={detail.id}
      detail={detail}
      onReturn={onClose}
      onSessionExpire={onSessionExpire}
    />
  );
}
