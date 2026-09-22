# PR #106 P2 behavioral regression verification

Environment: macOS arm64; Node v24.18.1; pnpm 11.19.0; installed ImageMagick and ExifTool.
Commands used PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH.

## Before the implementation fixes

Executed:

```sh
pnpm exec vitest run --project media-tools tests/integration/media/recovery-tools.test.ts tests/integration/media/process.test.ts -t 'preserves healthy concurrent|rolls back failed job' --maxWorkers=1 --cache=false
```

Exit 1. Three selected tests failed, 33 tests not selected. Duration 1.91 seconds.

- Queue claim failure: the independent healthy task was persisted as failed with MEDIA_CANCELLED, instead of running with MEDIA_INTERRUPTED.
- Queue settlement failure: the independent healthy task was likewise persisted as failed with MEDIA_CANCELLED.
- Candidate cleanup registration failure: after closing and reopening SQLite, the job was already failed with a finished timestamp, instead of remaining running.

No XML was generated for this red run. This record summarizes its actual captured terminal output; it is not a reconstructed XML report.

## After the implementation fixes

Executed:

```sh
pnpm exec vitest run --project media-tools tests/integration/media/recovery-tools.test.ts tests/integration/media/process.test.ts --maxWorkers=1 --cache=false --reporter=default --reporter=junit --outputFile.junit=test-results/media-64/revision/p2-regressions.xml
```

Exit 0. Two files, all 36 tests passed. Duration 26.42 seconds. Raw JUnit report: p2-regressions.xml.

The two queue regressions also remove the injected database failure, reopen SQLite, restart the production queue, and confirm all three real PNG tasks succeed without changing original bytes. The atomic settlement regression checks published compressed and recovered thumbnail object IDs are preserved after reopening and recovering.

All image tools are real installed programs. The settlement concurrency case uses a startup spy to send SIGSTOP to the healthy tool, retaining it until production cancellation occurs. Existing recovery tests continue to verify no remaining live tools during teardown.

Also executed:

```sh
pnpm exec prettier tests/integration/media/recovery-tools.test.ts tests/integration/media/process.test.ts --write
pnpm exec eslint tests/integration/media/recovery-tools.test.ts tests/integration/media/process.test.ts --max-warnings=0
```

Both exited 0. The only edit after the green run was a comment clarifying the startup spy and real tools.
