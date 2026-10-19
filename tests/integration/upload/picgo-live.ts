import {
  readLiveUploadTargets,
  runLiveUploadTarget,
} from './live-storage-fixture.ts';
import { packagedPicgo } from './picgo-fixture.ts';
import { verifyPicgoUploads } from './picgo-scenarios.ts';

const { targets, output } = await readLiveUploadTargets(
  'test-results/picgo-292-live',
);
const packaged = await packagedPicgo();
try {
  let passed = true;
  for (const target of targets) {
    const result = await runLiveUploadTarget(target, output, {
      name: `Issue 292 ${target.service} real PicGo`,
      metadata: { picgoCore: '3.1.0' },
      limits: [
        'Packed npm artifact installed locally; real Core lifecycle and standalone HTTP with isolated database/storage namespace.',
        'No npm publication, production data, GUI, clipboard shortcut, Typora, bucket policy/CORS or container release verification.',
      ],
      async verify({ fixture, storageId, onCheck }) {
        await verifyPicgoUploads(fixture, packaged, storageId, onCheck);
      },
    });
    passed = result && passed;
  }
  process.exitCode = passed ? 0 : 1;
} finally {
  await packaged.close();
}
