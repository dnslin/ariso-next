# PR #255 双角度评审修复

日期：2026-10-07。本轮在 `8cdcd30c9b3f3a7b001c154f7c9dc78ad4a9087e` 基础上处理用户明确授权的两项建议。规则仍由[任务执行约定](../../../tasks/execution.md)和[设计交付规范](../../../design/handoff.md)维护。

## 范围与结果

功能评审的 Required/P2 是测试有效性缺口，原产品 `disableImplicitLinking: true` 配置正确。原20项测试只面对本地 `emailVerified=false`，被库默认的本地邮箱验证要求提前拒绝；移除隐式关联保护仍全绿。本轮保留原四条拒绝用例，新增两条已验证同邮箱拒绝用例，分别覆盖普通登录与 `requestSignUp=true`。

新状态通过生产主动绑定、同邮箱 GitHub 登录及生产解绑入口准备，明确核对 `emailVerified=true` 和绑定不存在，再使用匿名登录和本次 state Cookie 发起回调。不直接写邮箱验证字段，不替换认证结果。拒绝断言同时检查实际错误、无 GitHub 关系、唯一用户、没有新增会话ID、没有会话 Cookie且读取不到有效会话。只保留当前断言需要的会话 ID。SQLite、认证库、生产路由及 hooks 真实执行；只有现有 GitHub HTTP 替身，不冒充外部 OAuth。

结构评审的 Optional 是 `GithubSettingsSummary` 无消费者的 `verified=false` 模式。删除该可选prop及两处分支，唯一调用方只传settings；实际 `editor.verified` 核对状态、`pendingRestart` 后果说明及独立待重启摘要均保留。使用现有组件，无新依赖、包装层或防御机制。

## 实际验证

环境：macOS、Node **24.18.1**、pnpm **11.19.0**、Better Auth **1.7.5**。从项目根目录执行，PATH 指向 Node 24。完整命令和报告计数见[检查记录](./checks.json)。原本地 stdout/stderr 和全量单元 XML 保存在 ignored `.data/reviews/pr255/fixes/`，不将其中的其他模块输出重复提交。

| 检查                                                                                                                                                          | 结果                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                              | 通过，锁文件未变                                                                                      |
| `pnpm run build`                                                                                                                                              | 退出0；既有可选原生模块、source map和OpenTelemetry追踪警告保留                                        |
| `pnpm run typecheck`                                                                                                                                          | Next路由、应用和runtime类型检查通过                                                                   |
| `pnpm run lint`                                                                                                                                               | 全量通过，无警告                                                                                      |
| `pnpm run format:check`                                                                                                                                       | 全量通过；新增证据随后执行定向格式检查                                                                |
| `pnpm run test:integration tests/integration/identity/oauth.test.ts tests/integration/identity/oauth-startup.test.ts --maxWorkers=1`，附默认与JUnit reporters | [26项通过](./oauth-green.xml)：OAuth22项、startup4项，无失败、跳过                                    |
| `pnpm run test:integration tests/integration/identity/oauth.test.ts --maxWorkers=1`，实际源码 `true→false` 变异，附默认与JUnit reporters                      | [20项通过、2项预期失败](./oauth-mutation.xml)，退出1；恰好两个新增已验证邮箱用例在拒绝结果断言失败    |
| 相同OAuth定向命令，恢复正确源码，附默认与JUnit reporters                                                                                                      | [22项通过](./oauth-restored.xml)，退出0，无失败、跳过                                                 |
| `pnpm run test:unit --maxWorkers=4`，附默认与JUnit reporters                                                                                                  | 122文件、1636项通过，59.60秒，无失败、跳过                                                            |
| 修复前后独立SSR渲染探针                                                                                                                                       | 唯一可达摘要模式的3组完整HTML逐字相同；[原输出](./summary-render-baseline.json)保留，不冒充浏览器验证 |
| `node docs/tasks/check.mjs`                                                                                                                                   | 通过；120个任务、298个需求                                                                            |

变异只临时改变真实 `auth.ts` 的 `disableImplicitLinking`，不改变测试或断言。使用原字节副本在 finally 中恢复，恢复后与原文件及固定head完全一致；[校验记录](./mutation.json)保留。与原20项在同一变异下仍全绿的评审证据对照，两个新用例已能检测产品“必须主动绑定”边界被移除。

默认调用链实际核对为 `package.json` 的 `test:integration` → Vitest `integration/media-tools` 项目 → `tests/integration/**/*.test.ts`；OAuth文件未被exclude，六行参数没有only/skip。新增用例自动进入默认全量入口。本轮只定向重跑受影响集成，不把26项通过记成完整集成全绿；共用运行器未修改。

## 独立复审

- [功能与测试有效性复审](./functional-rereview.md)：Required/P2已关闭，无新增Critical/Required；已实际读取源码增量、绿/变异/恢复日志、XML和恢复哈希。
- [结构与可维护性复审](./structural-rereview.md)：Optional已关闭，无新增finding；组件模式直接删除，新测试复用实际调用链，没有额外抽象。

两位评审者只读本轮增量和实现者已有结果，没有重复运行测试或操作浏览器。此前人为Promise暂停构造的解绑交错未证明当前生产可达，保持排除结论，不为此添加锁或额外检查。

## 交付边界

本轮代码、适用本地检查及双角度复审已完成。没有改页面视觉或交互，摘要实际渲染相同，因此没有修改Figma或重新执行设计验收；此前设计对照不改记成此次浏览器实测。

Ego仍处于交回用户的边界，本轮未操作浏览器、真实GitHub或新建空间。人工预览未重启，原数据与凭据保留；HTTP核对登录、健康接口为200，原登录页17个脚本均为200。预览仍服务先前构建，不声称已运行本轮新构建。

历史完整集成失败/定向复验及默认浏览器 **55 passed / 7 failed / 6 blocked** 均保留。最新手机布局的产品人工验收仍待完成；先前UI验收不覆盖新手机布局。PR保持草稿，无远端检查不记CI通过。本轮不合并、不关闭Issue、不发布、不部署或清理。统一状态见[Issue #181记录](../README.md)。
