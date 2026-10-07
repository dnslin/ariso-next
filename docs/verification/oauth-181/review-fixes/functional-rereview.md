# PR #255 修复后功能与测试有效性独立复审

结论：**通过，原 Required/P2 已关闭；本轮增量没有新的 Critical 或 Required。** 原问题是安全回归测试未覆盖真实可达的已验证本地邮箱状态，并非原产品配置存在已证实绕过。本轮保持产品安全配置正确，通过新增真实准备流程及成功杀死条件变异关闭测试缺口。

范围：当前工作树相对 `8cdcd30c9b3f3a7b001c154f7c9dc78ad4a9087e` 的三个文件增量。沿用已实际读过的 AGENTS.md、using-agent-skills、code-review-and-quality、完整 handoff/execution、SPEC-identity、T-ID-05 及 vercel-react-best-practices。先读测试变化，再核对准备/调用链和组件消费者。本 reviewer 本轮仅只读复审并写本报告，没有修改源码、执行测试、操作浏览器/预览或提交。

## Critical

无。

## Required

无未关闭项。原 P2 关闭证据如下。

- `tests/integration/identity/oauth.test.ts:393–400`：保留原四个用例，新增同邮箱且本地已验证的普通登录和显式 `requestSignUp=true` 两种攻击入口，合计六种参数。
- `tests/integration/identity/oauth.test.ts:403–420`：通过真实主动绑定、一次同邮箱 GitHub 登录、读取有效所有者会话和生产解绑入口准备状态；不直接修改本地 `emailVerified`，也不 mock 绑定/登录/解绑结果。GitHub HTTP 仍是现有 provider 替身，不冒充真实外部 OAuth 验证。
- `tests/integration/identity/oauth.test.ts:422–431`：显式验证本地邮箱状态为参数值及绑定已删除，记录现有会话 ID 后才进入匿名回调。`begin(false, explicit)` 使用 `postAuth` 默认空 Cookie；回调只发送本次 OAuth state Cookie，不借用准备阶段的所有者会话。
- `tests/integration/identity/oauth.test.ts:432–447`：检查预期拒绝错误、无 GitHub 关系、用户数量保持一人、会话 ID 集合未增加、无 session token 响应 Cookie，且响应 Cookie 无法解析出有效会话。旧断言没有被弱化。
- 对真实 `src/server/identity/auth.ts` 的 `disableImplicitLinking: true → false` 变异，恰好两个新增的已验证邮箱用例在 `oauth.test.ts:434` 失败，预期 `account_not_linked` 实际为 `null`。准备流程已通过才到此断言；其余 20 项通过。由此证明新增用例确实能发现本次要求防止的安全条件回归。

这与原始评审相同变异仍 20 项全绿形成直接对照。无需新增产品条件、锁或其他防御机制。

## Optional

功能角度无新增建议。结构 Optional 的小修复也已核对：`src/components/identity/github-settings-editor.tsx:77–84` 唯一调用此前总是传 `verified=true`；`src/components/identity/github-settings-summary.tsx:97–119` 删除未使用的 false 模式，保留真实核对状态下的标题、test ID 和 pendingRestart 后果文字，不改变有效调用的行为。完整结构结论由另一 reviewer 独立负责。

## 实际读取的验证证据

以下测试由父 agent 执行；本 reviewer 没有重跑，而是实际读取 `.data/reviews/pr255/fixes/` 下日志、JUnit XML 和 `mutation.json`。父 agent 指定环境为 Node 24.18.1 / pnpm 11.19.0；日志明确记录 pnpm 11.19.0。package.json 的默认集成入口展开为 `vitest run --project integration --project media-tools`。

| 阶段         | 日志中实际执行的展开命令                                                                                                                                                                                                                                     | 读取结果                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| 正确源码基线 | `vitest run --project integration --project media-tools tests/integration/identity/oauth.test.ts tests/integration/identity/oauth-startup.test.ts --maxWorkers=1 --reporter=default --reporter=junit --outputFile=.data/reviews/pr255/fixes/oauth-green.xml` | 26 passed，OAuth 22 + startup 4，无失败/跳过                |
| 真实条件变异 | `vitest run --project integration --project media-tools tests/integration/identity/oauth.test.ts --maxWorkers=1 --reporter=default --reporter=junit --outputFile=.data/reviews/pr255/fixes/oauth-mutation.xml`                                               | 20 passed / 2 failed；退出 1；仅两条新增 verified=true 失败 |
| 恢复源码     | `vitest run --project integration --project media-tools tests/integration/identity/oauth.test.ts --maxWorkers=1 --reporter=default --reporter=junit --outputFile=.data/reviews/pr255/fixes/oauth-restored.xml`                                               | 22 passed，无失败/跳过                                      |

`mutation.json` 记录从原始字节副本 finally 恢复，`restoredByteEqual=true`。原始与恢复后的 SHA256 均为 `ee073f1185f844ca73a716f4d6fbb1cbdd18d1e68345afb5e3a649a7e09198d8`，与原评审固定 head 的 auth.ts 校验值一致。变异期间没有更改测试断言。恢复阶段只重跑受影响 OAuth 22 项，没有冒称再次跑完 startup 或全量。

父 agent 随后确认：基线会话 44788 完整退出 0；变异与 finally 恢复会话 24636 完整退出 0，其中变异测试退出 1，最后的默认集成入口恢复测试退出 0。变异窗口结束后，本 reviewer 另行读取 `git diff --exit-code -- src/server/identity/auth.ts`（无差异）、`shasum -a 256`（上述一致值）、`git status --short`（仅本轮三个修复文件）、`git rev-parse HEAD`（仍是固定 head）及 `git check-ignore`（本报告确为 ignored）。这次额外读取没有执行测试。

## FYI / 本轮边界

- 原人工 Promise gate 的登录/解绑交错仍是排除项：没有证实当前生产单进程同步 SQLite 调度可达，不要求添加竞态防御。
- 本轮结论仅关闭本次修复范围内的问题。旧默认浏览器 55 passed / 7 failed / 6 blocked 没有因本次定向通过而被改记为全绿。历史 1636 项单元、OAuth/账号定向及真实 OAuth 证据仍分别保留。
- 本 reviewer 没有重新执行全量、构建、浏览器、真实 OAuth 或进程重启；父 agent 其他交付检查由其报告。无远端 CI 不能当作 CI 通过。最新手机布局最终用户人工验收仍待完成。
- 本报告为 reviewer 唯一写入；不修改原始评审报告，以保留问题发现、修复和复审的证据顺序。
