import assert from 'node:assert/strict';
import {
  readLiveUploadTargets,
  runLiveUploadTarget,
} from './live-storage-fixture.ts';
import { verifyUploadCurlExamples } from './usage-examples.ts';

const { targets, output } = await readLiveUploadTargets(
  'test-results/upload-199-live',
);
let passed = true;
for (const target of targets) {
  const result = await runLiveUploadTarget(target, output, {
    name: `Issue 199 ${target.service} curl fixture`,
    limits: [
      'Generated curl examples, standalone HTTP and own namespace only; no AWS, browser, container or deployment.',
    ],
    async verify({ fixture, storageId, client, track, onCheck }) {
      await verifyUploadCurlExamples(
        fixture,
        storageId,
        async (key) => {
          track(key);
          return client.inspectObject(key, {
            signal: AbortSignal.timeout(30000),
          });
        },
        async (check) => {
          // Failed examples must not leave even a staged object in this own namespace.
          if (check.name.endsWith('creates-no-assets')) {
            const objects: string[] = [];
            for await (const page of client.listObjects({
              signal: AbortSignal.timeout(30000),
            }))
              objects.push(...page.map((object) => object.key));
            assert.deepEqual(objects, []);
          }
          await onCheck(check);
        },
      );
    },
  });
  passed = result && passed;
}
process.exitCode = passed ? 0 : 1;
