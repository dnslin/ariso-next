# PR #114 评审修订

日期：2026-09-23。对应 [PR #114](https://github.com/dnslin/ariso-next/pull/114) 的三项评审发现，沿用 [T-DEL-01 实施记录](../README.md) 的需求范围与边界。

## 修改结果

- 删除实验目录的重复流适配器。真实 Next HTTP 实验直接调用生产 `responseStream`；读错注入和节流仅保留在实验夹具。实验的场景授权模型仍属于测试夹具，不将其称为正式 `/i` 路由。
- `errors.ts` 统一错误码、HTTP 状态和消息。领域错误与 HTTP 响应消费同一份定义，调用点不再重复写状态和消息，没有增加错误类层级。
- 文件流错误由调用方已有的 `error` 监听器记录。适配器只记录自身或计数消费者错误，关闭等待不重复记录。覆盖首读、中途读错、不消费响应以及计数回调异常；每次故障恰好记录一次。

无页面、数据结构、依赖或冻结 PRD 变更。删除旧代码，没有引入兼容层或生产测试开关。

## 实际验证

环境：macOS arm64，Node 24.18.1、pnpm 11.19.0；命令使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。浏览器使用现有 Ego Lite，TaskSpace 4，验证成功后已关闭。

| 命令                                                                                                                                       | 结果                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                           | 通过                                                                                                                                      |
| `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`                                                                             | 通过                                                                                                                                      |
| `pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/delivery-revision-unit.xml`                              | 23 文件、384 项通过；[JUnit](./unit.xml)                                                                                                  |
| `pnpm run build`                                                                                                                           | 通过；仍有既有 SQLite 可选 Debug 二进制追踪诊断                                                                                           |
| `pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/delivery-revision-integration.xml` | 48 文件、395 项通过；[JUnit](./integration.xml)                                                                                           |
| `pnpm exec vitest run --project integration tests/integration/delivery/http.test.ts`                                                       | 12 项通过，真实 HTTP 流故障断言日志恰好一次                                                                                               |
| `pnpm exec vitest run --project unit tests/unit/delivery --project integration tests/integration/delivery/local.test.ts`                   | 独立复审执行，5 文件、100 项通过                                                                                                          |
| `EGO_TASK_SPACE=4 node tests/verification/delivery/run-browser.ts`                                                                         | 退出码 0，外站图片宽度 64、中文 PNG/SVG 名称及字节一致、Cookie 私有访问 200、撤销后 401；[浏览器](./browser.json)、[会话](./session.json) |

先运行 `pnpm exec vitest run --project integration tests/integration/delivery/local.test.ts -t 'first read failure|after first block'`，两项日志断言按预期失败，实际 3 次而期望 1 次；修复后定向和完整测试按原断言复跑。完整集成首跑为 394 通过、1 失败：独立构建夹具从 Git 索引复制文件，未暂存的删除仍指向实验 `stream.ts`，报 ENOENT。同步新增和删除文件到索引后重跑，没有改测试逻辑或削弱断言。

另执行 `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`、`git diff --check`，均通过。

JUnit 归档移除 stdout/stderr，保留测试条目与结果，避免保存测试的一次性初始化码。本轮未重跑整个 UI 浏览器套件；之前的结果保留在父记录，本轮复跑与修改相关的生产交付浏览器验证。

## 复审与远端边界

按 `code-review-and-quality` 与 `thermo-nuclear-code-quality-review` 的既有发现逐项复核。独立结构复审确认三项问题均已消除，未发现新增结构问题。主代理复核调用方日志职责、异常保留和测试覆盖，无剩余必改项。

仓库无 PR/push 日常 CI 或手动容器验证入口。本轮不触发 Release、镜像发布或部署，AMD64/ARM64 未执行。推送后回读远端检查状态，不把无检查项视为 CI 通过。
