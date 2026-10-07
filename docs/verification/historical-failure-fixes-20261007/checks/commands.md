# 静态检查实际命令

```sh
pnpm exec eslint e2e/albums.mjs e2e/library-copy-consumers.mjs e2e/library-copy-helpers.mjs e2e/owner-shell.mjs e2e/tags.mjs e2e/tokens-behavior.mjs e2e/tokens-page.mjs e2e/tokens.mjs e2e/upload-relation-choices.mjs e2e/workspace-continuity.mjs src/app/library/library-screen.tsx src/app/library/use-library-query.ts src/components/library/read-detail-status.ts src/server/media/tools.ts tests/integration/media/tools.test.ts tests/unit/library/detail-status.test.ts tests/unit/library/query-hook.test.ts --max-warnings=0
```

修正未使用参数后，仅重跑：

```sh
pnpm exec eslint tests/unit/library/query-hook.test.ts --max-warnings=0
```

浏览器最小场景使用本机忽略目录中的私有配置，不提交凭证。实际入口：

```sh
ego-browser nodejs <<'EOF'
const {run} = await import('/Users/dnslin/.codex/worktrees/historical-failure-fixes/ariso/test-results/historical-failure-fixes/browser-check.mjs');
await run(taskSpace);
EOF
```

首次仅在读取配置时遇到 Ego 进程工作目录为 `/`，尚未操作页面。配置改为相对模块 URL 后在同一 TaskSpace 8 运行，退出 0；没有重跑已执行场景。实际场景源码存于 `../browser/affected-check.mjs`，相对路径按当次 `test-results/historical-failure-fixes/browser-check.mjs` 的执行位置解析；该存档不直接执行。私有配置和一次性密钥未归档。
