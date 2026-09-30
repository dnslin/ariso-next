# Issue #158 独立代码审计

2026-09-30（Asia/Shanghai）。独立审计 agent 按 `using-agent-skills`、`code-review-and-quality` 和 `vercel-react-best-practices` 执行。已阅读项目 AGENTS、[执行约定](../../tasks/execution.md)、[设计交接](../../design/handoff.md)、[SPEC-storage §7](../../specs/SPEC-storage.md#7-cors-检测与失效) 与 [T-STO-05](../../tasks/m3-m4-platform.md#t-sto-05-真实浏览器-cors-检测与-origin-失效)。本记录是代码审计，不是设计批准或 Issue 完成证明。

## 结论

当前已实现范围内未发现未解决的阻断代码问题。初审发现的清理状态显示问题已修复并复测。后端接口、持久探测、失效与清理可以作为草稿 PR 的已验证范围；UI 路由未接入、真实页面功能和设计验收未完成，交付门槛仍未满足，PR 应保持草稿。

## 阅读范围与核对结果

- 后端：`cors.ts`、`cors-types.ts`、`probes.ts`、`probe-runtime.ts`、schema/0014 迁移、settings，以及 CORS 创建/完成 API。追读 `s3.ts` 的签名、流读取、删除和销毁路径，以及 `storageResponse` → `requireOwner` 的鉴权与来源检查。
- 前端：`cors-api.ts`、`cors-transport.ts`、`use-cors-test.ts`、`cors-dialog.tsx`、`cors-report.tsx`。检查独立请求并行读取、HeroUI 按组件导入、重复操作阻止、卸载时取消浏览器传输、会话过期处理和错误结果保留。现有模块尚未由页面组合消费，未据此宣布完整交互通过。
- 测试：CORS 单元/集成、HTTP 鉴权覆盖、迁移测试、`e2e/storage-cors.mjs`、HTTP 故障夹具、真实服务运行器及 `scripts/verify-browser.mjs` 接入。
- 最终追加审查 `runtime/prestart.test.ts`、`secret-preflight.test.ts`、`startup.test.ts` 的手工迁移夹具修复。启动预检的 `verifyStorageSecrets` 按当前 `storageConfigs` 全列读取，夹具必须执行真实 `0014_silent_shiva.sql` 才能与新增 `cors_report` 等列一致。改动只增加真实迁移及其严格顺序预期，没有移除或放宽错误诊断、事务回滚、历史数据、密钥验证或恢复断言。
- 浏览器响应、服务器内容核验与删除分别判断；opaque、失败响应、缺少方法、错误内容和对象不存在均不能通过。探测与正式上传复用现有签名提供方；生产浏览器请求发送签名要求的 headers，使用 `mode: cors`、`credentials: omit`，没有服务器请求冒充浏览器结果的实现路径。
- site 失效函数接受同步事务并标记活动 probe；保存报告再次比较 origin/revision/失效标记，A→B→A 不能恢复旧通过结果。当前任务只交付供站点设置入口组合的函数，不声称后续设置界面已接入。
- 到期和重启恢复保留确切 Key 清理责任；清理成功释放引用，失败保留可重试记录。旧失败 probe 清理按 probeId 匹配报告，不覆盖后续成功检测。迟到对象扫描仍由 T-STO-06 承接。
- 浏览器请求有取消/超时；服务器核验流在 finally 销毁，S3 客户端在操作末尾销毁。服务停止等待活动操作和清理结束后才交还数据库生命周期。没有新增依赖、兼容层或无关模块重构。

## 已修复发现

**P2：已清理对象仍显示失败或未执行。** 原 `CorsReportRows` 仅使用历史 delete 阶段判断，未消费后台重试成功后的 `cleanupPending=false`。实现现在优先显示当前清理完成事实，同时保留检测失败证据和数据库中的历史阶段报告。

已实际读取本地 `test-results/issue-158/cleanup-render-red.txt` 和 `cleanup-render-green.txt`：新增渲染断言先因缺少“已删除”失败，修复后通过。审计者另行运行该测试并通过；没有仅接受实现者口头结论。

## 审计者实际执行

环境：macOS arm64，Node 24.18.1，pnpm 11.19.0；命令在本 Issue 独立 worktree 根目录执行。

| 命令                                                                                                                                                                                                                                                                | 结果                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `pnpm exec vitest run --project unit tests/unit/storage/cors-browser.test.ts --project integration tests/integration/storage/cors.test.ts`                                                                                                                          | 初审：2 个文件、23 项通过         |
| `pnpm exec vitest run --project unit tests/unit/storage/cors-browser.test.ts tests/unit/storage/cors-http.test.ts tests/unit/storage/cors-report.test.ts --project integration tests/integration/storage/cors.test.ts tests/integration/runtime/migrations.test.ts` | 修复复审：5 个文件、45 项通过     |
| `pnpm exec vitest run --project integration tests/integration/runtime/prestart.test.ts tests/integration/runtime/secret-preflight.test.ts tests/integration/runtime/startup.test.ts`                                                                                | 最终夹具复审：3 个文件、26 项通过 |
| `git diff --check`                                                                                                                                                                                                                                                  | 通过                              |

迁移测试保留历史字段逐值断言，明确新增列默认值，检查向前迁移记录及重复执行不重放；没有通过删除旧断言或跳过检查消除失败。审计者没有独立重跑全量构建、lint、typecheck、集成、浏览器或云服务操作；其实际交付结果由本任务主记录维护。

追加夹具复审时全量检查尚在进行。提交前已读取[完整集成结果](./local/integration-final.txt)与[完整浏览器结果](./local/browser-final.json)，分别记录 863 项通过与浏览器运行器 passed；最终结果由[主记录](./README.md)汇总。审计者未独立重跑这些全量检查，不改变草稿和 UI 未验收结论。

## 证据边界与未完成项

### 浏览器登录限流修复复审

已实际读取 [CORS 首轮失败](./local/cors-first.json) 和 [浏览器首轮失败](./local/browser-first.json)：身份场景之后的 CORS 脚本在登录请求收到真实 HTTP 429，尚未开始存储检测。修复只调整脚本登录准备步骤，不改变应用认证或限流规则。

已对照现有 `e2e/library-trash.mjs` 的服务端等待头处理。新增逻辑仅在 429 时读取 `x-retry-after` 或 `retry-after`，要求有限正数，完整等待后重试，最多重试 6 次，并记录 `loginRetrySeconds`。最终仍严格断言 HTTP 200；无效等待头、其他错误和重试耗尽均失败，没有清空限流数据、跳过登录或放宽成功条件。此修复符合实际失败原因，未发现新的阻断代码问题。

审计者实际运行 `pnpm exec eslint e2e/storage-cors.mjs --max-warnings=0` 和 `git diff --check`，均通过。提交前已读取[修复后的完整浏览器结果](./local/browser-final.json)和[CORS 场景结果](./local/cors-final.json)：运行器及 storageCors 均 passed，登录按服务端期限等待 7 秒后通过，故障与到期场景完成后对象列表为空。这是实施 agent 的实际运行记录，审计者没有独立重跑完整浏览器，也没有以静态审查代替运行结果。

### 浏览器证据的适用范围

已实际读取 [真实服务浏览器报告](./browser-service/live/storage-cors.json)、[确切 Key 与最终对象列表](./browser-service/live/live.json) 和 [执行说明](./browser-service/checks.json)。记录显示 R2、SeaweedFS 的可读浏览器 PUT/GET/HEAD、服务器核验/删除、持久结果以及清理后 HEAD 404/空前缀列表通过；这是其他实施 agent 的实际执行记录，本审计没有重复执行云请求。

`e2e/storage-cors.mjs` 在真实浏览器中执行自己的 `perform()`，没有通过真实页面点击运行生产 `runCorsSample/useCorsTest`。因此这些记录只能证明协议和应用 API，不能代替生产 UI 功能证据。HTTP 故障夹具也不验证 S3 签名；真实服务报告承担此项证据。

当前 `/settings/storage/:id` 检测区域未接入。复制操作、配置来源入口的设计位置、桌面/手机整页组合和适用状态仍待完成；尚无本任务真实页面截图对照、独立设计验收和用户人工验收。本审计未读取 Figma 或检查真实 UI 截图，不给出设计还原通过结论，也不代替用户批准设计差异。
