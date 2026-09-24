# PR #116 评审修复计划与验证

范围：仅修复 2026-09-24 双 agent 评审确认的三项 P2。沿用 Issue #73、现有模块职责和 API；无 schema 变化、无新增依赖。计划与执行记录放在本验证目录，避免另建重复任务体系。

## 计划

1. 交接活动时间归入 `acceptSession` 事务（`accept.ts`、`receive.ts`、`local.test.ts`）。先注入仅在 accepted 后触发的活动时间更新失败；验收资产、任务、关系全部回滚，候选文件清理。
2. 文件 I/O 与客户端解析错误分别分类（`multipart.ts`、`http.ts` 及其测试）。EIO/EACCES 返回 500，ENOSPC 保持 507；请求错误仍为 400，配置状态冲突仍为 409。先运行故障注入测试证明原实现失败。
3. 过期处理改为单条集合更新（`cleanup.ts`、`sessions.test.ts`）。混合状态测试仅过期超过一小时的 queued；历史记录增加时 SQL 数量不增长，不引入耗时阈值断言。

三项相互独立；第 2 项按文件边界交由独立 agent，主 agent 顺序实现第 1、3 项。每项先 RED 再 GREEN，全部完成后统一检查和审计。

## 检查点

- [x] 三项回归测试均曾失败，修复后通过。
- [x] 冻结安装、格式、lint、类型、单元、构建和全量集成通过。
- [x] 按项目约定运行已有 Ego 浏览器回归；不据此声称上传 UI 已交付。
- [x] `code-review-and-quality` 审计通过，更新证据。

镜像与双架构验证仍按发布阶段执行，本轮不发布、不部署、不合并。

## 实际结果

环境沿用本目录初次实施记录：macOS 26.6.2 ARM64，Node v24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-31、ExifTool 13.55。以下命令从仓库根目录运行，PATH 优先使用 Node 24 并包含现有图片工具。

| 命令                                                                                                                          | 结果                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --project media-tools tests/integration/upload/local.test.ts -t 'recording the final'`                  | RED：1 项失败，故障注入后资产仍存在，复现交接事务边界问题                                                                                                                                                |
| `pnpm exec vitest run --project media-tools tests/integration/upload/local.test.ts`                                           | GREEN：11 项通过，活动时间失败时全部回滚并清理文件                                                                                                                                                       |
| `pnpm exec vitest run --project integration tests/integration/upload/sessions.test.ts`                                        | RED：增加 200 条历史记录后 SQL 从 9 条增至 209 条；GREEN：6 项通过，更新保持单条 SQL，混合状态及临界时间符合预期                                                                                         |
| `pnpm exec vitest run --project integration tests/integration/upload/multipart.test.ts tests/integration/upload/http.test.ts` | RED：8 项失败、31 项通过；修复并补进度持久化故障测试后 GREEN：40 项通过                                                                                                                                  |
| `pnpm install --frozen-lockfile`                                                                                              | 通过，无锁文件变化                                                                                                                                                                                       |
| `pnpm run format:check`                                                                                                       | 通过                                                                                                                                                                                                     |
| `pnpm run lint`                                                                                                               | 通过                                                                                                                                                                                                     |
| `pnpm run typecheck`                                                                                                          | 通过                                                                                                                                                                                                     |
| `pnpm run test:unit`                                                                                                          | 24 文件、392 项通过                                                                                                                                                                                      |
| `pnpm run build`                                                                                                              | 通过；保留既有 better-sqlite3 可选 Debug 二进制追踪警告，真实 HTTP 测试使用本次新构建                                                                                                                    |
| `pnpm run test:integration --maxWorkers=4`                                                                                    | 53 文件、456 项通过，88.16 秒；包含普通集成与真实图片工具两组                                                                                                                                            |
| `BROWSER_REPORT_DIR=/tmp/ariso-116-browser pnpm run test:browser`                                                             | 未完成：runtime/shell 和桌面 setup 已通过；identity-1440-restart 的 Ego CLI 退出码 1、空日志，随后任务空间 1 不存在且列表为空。失败原始报告见 [review-browser-failed.json](./review-browser-failed.json) |
| `node docs/tasks/check.mjs`                                                                                                   | 120 任务、298 需求通过                                                                                                                                                                                   |
| `node docs/tasks/check.mjs --self-test`                                                                                       | 5 项拒绝场景通过                                                                                                                                                                                         |

独立 agent 按 `code-review-and-quality` 复审本轮全部实现和测试差异，未发现新的必修问题。其复审是静态审阅；上述测试由实施 agent 实际执行。新增回归共 18 项，没有删除、跳过或削弱已有断言。错误注入证明分类及事务行为，不等同于真实挂载盘故障或生产容量测试。

浏览器重跑：所有者确认上次测试期间误关 Ego，并授权新建任务空间。执行 `BROWSER_REPORT_DIR=/tmp/ariso-116-browser-rerun pnpm run test:browser`，退出码 0，完整回归通过（含 runtime/shell、1440/390 两端初始化与重启登录、组件交互）。本次报告见 [review-browser.json](./review-browser.json)。上次中断报告保留，不改写为成功。本次仅更新验证证据，未修改应用代码。
