import {
  verifyDetail171Fields,
  verifyDetail171Collections,
  verifyDetail171Metadata,
} from './library-detail-171-api.mjs';
import { verifyDetail171Versions } from './library-detail-171-versions.mjs';
import { verifyDetail171Confirmation } from './library-detail-171-confirmation.mjs';
import { verifyDetail171Processing } from './library-detail-171-processing.mjs';
import { verifyDetail171Recovery } from './library-detail-171-recovery.mjs';
import { verifyDetail171Unaccepted } from './library-detail-171-unaccepted.mjs';
import { verifyDetail171Downloads } from './library-detail-171-downloads.mjs';
import { verifyDetail171Disabled } from './library-detail-171-disabled.mjs';
import { verifyDetail171Jobs } from './library-detail-171-jobs.mjs';
import { verifyDetail171ReturnContext } from './library-detail-171-navigation.mjs';
import { verifyDetail171Consumers } from './library-detail-171-consumers.mjs';

export {
  verifyDetail171Fields,
  verifyDetail171Collections,
  verifyDetail171Metadata,
} from './library-detail-171-api.mjs';
export { verifyDetail171Versions } from './library-detail-171-versions.mjs';
export { verifyDetail171Confirmation } from './library-detail-171-confirmation.mjs';
export { verifyDetail171Processing } from './library-detail-171-processing.mjs';
export { verifyDetail171Recovery } from './library-detail-171-recovery.mjs';
export { verifyDetail171Unaccepted } from './library-detail-171-unaccepted.mjs';
export { verifyDetail171Downloads } from './library-detail-171-downloads.mjs';
export { verifyDetail171Disabled } from './library-detail-171-disabled.mjs';
export { verifyDetail171Jobs } from './library-detail-171-jobs.mjs';
export { verifyDetail171ReturnContext } from './library-detail-171-navigation.mjs';
export { verifyDetail171Consumers } from './library-detail-171-consumers.mjs';

// Each verifier owns its preparation and temporary-data cleanup.
export async function verifyLibraryDetail171(context) {
  await verifyDetail171Fields(context);
  await verifyDetail171Collections(context);
  await verifyDetail171Metadata(context);
  await verifyDetail171Versions(context);
  await verifyDetail171Confirmation(context);
  await verifyDetail171Processing(context);
  await verifyDetail171Recovery(context);
  await verifyDetail171Unaccepted(context);
  await verifyDetail171Downloads(context);
  await verifyDetail171Disabled(context);
  await verifyDetail171Jobs(context);
  await verifyDetail171ReturnContext(context);
  await verifyDetail171Consumers(context);
}
