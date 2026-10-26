# PR #301 日志集成测试超时修复

- 授权：排查并修复`logging.test.ts`超时，不放宽或跳过测试。全部CI通过且无遗留问题后合并，不发布部署。
- 起点：`55fa4ff8640c352d620e93af862a75059da89b97`，对应[失败CI](https://github.com/dnslin/ariso-next/actions/runs/40219611021)。checks和Media tools通过，Production integration为1607通过、1失败。
- 修改范围：日志集成测试与本记录。没有修改生产代码、框架、依赖、CI并发、测试重跑规则或其他功能。

## 根因与直接证据

锁定的Next16.4.1在`server/lib/start-server.js`中先输出`Ready in`，之后才加载配置和请求处理器。此时TCP已监听，但HTTP请求仍等待处理器初始化。日志测试把这个提前输出当成就绪信号，随即让正常请求的2秒截止时间承担剩余启动时间，导致CI冷启动时超时。

项目的`register()`同步初始化运行时，没有遗漏异步await。独立调查检查了真实SSR与启动调用链，没有找到404等待外部网络或日志管道饱和的证据。本机五轮隔离产物诊断中，Ready后的首次健康请求为354–733ms，健康就绪后的冷404为82–96ms；这些本机数据不冒充CI性能阈值。CI旧日志未标记具体请求阶段，不从它单独断言某一次fetch的超时位置。

已有[secret-preflight测试](../../../tests/integration/runtime/secret-preflight.test.ts)使用真实HTTP就绪判定，并通过延迟router初始化覆盖同一框架行为。本轮沿用该合同，以原15秒启动预算等待健康接口200及`{status:'ok'}`，之后继续执行原先的三个正常请求。

## 保持不变的要求

| 项目                   | 修复前后                                                |
| ---------------------- | ------------------------------------------------------- |
| 启动等待预算           | 15000ms；改为真实HTTP状态，不以提前的日志代替           |
| 每次健康接口请求期限   | 2000ms                                                  |
| 两个未开放接口请求期限 | 各2000ms                                                |
| 原有正常启动用例总期限 | 30000ms                                                 |
| 健康响应               | 200及完整JSON结构                                       |
| 两个故障接口           | 404并完整读取正文                                       |
| 日志/打包              | 逐行合法JSON、prestart及Ready记录、产物不含测试故障路由 |
| 原有失败启动和脱敏用例 | 保留全部执行与断言                                      |

没有把原来的日志等待与新的HTTP等待串成两个启动预算。就绪检查完成后，原有健康请求和两个404请求依然各自受2秒期限约束。

## 失败先行与验证

先提取原流程供两个场景复用，保持原逻辑，再新增真实子进程的router初始化延迟2500ms场景。延迟脚本只位于测试临时目录，子进程保留`--no-experimental-strip-types`；检查点日志保证故障注入确实执行，不进入生产产物。

`pnpm exec vitest run --project integration tests/integration/runtime/logging.test.ts --maxWorkers=1`：

- RED：原有3项通过，新增延迟用例发生TimeoutError，整体退出1。
- GREEN：改为真实HTTP就绪判定后4项全部通过，退出0。

其他实际检查：

- `pnpm exec vitest run --project integration tests/integration/runtime/logging.test.ts tests/integration/runtime/secret-preflight.test.ts tests/integration/runtime/standalone.test.ts --maxWorkers=2`：3文件21项通过。
- `pnpm exec eslint tests/integration/runtime/logging.test.ts --max-warnings=0`：通过。
- `pnpm run typecheck`：通过。
- `pnpm run format:check`、`git diff --check`：通过。

本机复用同一生产源码的隔离standalone（构建`v0.0.0-image-editor-pr.3` / `1a2bcfd8`），没有为测试改动重复构建或重跑无关浏览器流程。完整CI会重新构建并执行其全部检查，平台最新结果以[PR #301](https://github.com/dnslin/ariso-next/pull/301)为准。仅全部CI通过且无遗留问题才合并；本机未使用Docker/Colima，没有发布或部署。

随后因主分支合入PR #300而整合最新main，日志修复原样保留；新组合重新构建并通过219文件2275项完整集成。新迁移、浏览器及独立复核证据见[整合记录](./main-integration-20261026.md)。
