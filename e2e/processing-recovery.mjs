import { verifyProcessingSettingsRecovery } from './processing-settings-recovery.mjs';
import { verifyProcessingPreviewRecovery } from './processing-preview-recovery.mjs';
import { verifyProcessingSessionRecovery } from './processing-session-recovery.mjs';

export async function verifyProcessingRecovery(page, config, tools, report) {
  await verifyProcessingSettingsRecovery(page, config, tools, report);
  await verifyProcessingPreviewRecovery(page, config, tools, report);
  await verifyProcessingSessionRecovery(page, config, tools, report);
}
