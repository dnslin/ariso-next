# T-DEL-01 本地稳定图片访问与下载

日期：2026-09-23。对应 [Issue #69](https://github.com/dnslin/ariso-next/issues/69)，范围沿用 [T-DEL-01](../../tasks/m1-m2.md#t-del-01-本地稳定图片访问与下载) 和 [delivery 规格](../../specs/SPEC-delivery.md)。保留 R-14.2-01、R-14.3-01、R-14.5-01、R-14.6-01/02、R-14.7-01、R-14.8-01、R-14.9-01、R-14.10-01/02、A-26.6-01/02 的既有编号与模块边界，不改冻结 PRD。

## 前置与实现

通过 `gh issue view 69 --json title,body,comments,state,url` 及原生 `issues/69/dependencies/blocked_by`、`blocking` 核对：无评论，#47、#53、#49、#64、#67、#68 均 closed；原生后置为 #73、#76、#83。前置证据见 [site](../site-47/README.md)、[identity](../identity-53/README.md)、[storage](../storage-49/README.md)、[media 恢复](../media-64/README.md)、[回收恢复](../media-67/README.md)、[本地流实验](../../tasks/evidence/EV-DELIVERY-01/README.md)。历史规格中的“未实现”不覆盖已经交付的模块契约。

从最新 `origin/main` 的 `a4d4f9e40250f2df1000304af727f83fea2ead2c` 创建 `codex/69-local-delivery`，独立 worktree `/Volumes/data/project/ariso-issue-69`。原工作区和 #72 worktree 保留。本任务无页面、Figma、schema 或迁移变更，响应式、主题、触控、软键盘和安全区没有新增界面验收对象。

- `/i/{imageId}` 显式 GET/HEAD，按当前媒体设置解析默认版本；明确选版不回退，只有默认格式不适用才选原图。图片 ID 沿用现有不透明字符串契约，仅用于数据库查询。
- 使用真实所有者 Cookie，Bearer 和分享 Cookie 不授予私有读取权限。复用 media 访问状态和 storage 文件读取，不复制对象路径或会话验证。
- 文件打开后重新读取会话和完整权限/状态/版本。目标变化最多重选一次；旧对象在打开前删除时，仅在已发布目标确实变化后重选。物理大小不一致保留错误。
- 流按需拉取，正常结束、取消和错误关闭句柄。首块交付响应流才触发一次 `{imageId, storageId, actualVersion, occurredAt}`；统计消费者异常记录日志，不截断获准字节。此处提供事件契约，生产路由尚未接统计消费者，#83 负责内存聚合和联验，不能称统计功能已完成。
- 成功、错误、方法响应均 no-store/nosniff。HEAD/304 无正文且不计数；412 不计数；Range 忽略并返回完整 200，按普通 GET 口径计数。条件请求在授权和实际文件检查之后求值。
- 中文附件使用现有 content-disposition 3.0.0；仅将其移到运行依赖，版本不变。SVG 强制附件并保留原字节。链接构建复用 site 的 `buildSiteUrl`。

实现依据复用前置实验，并核对 [Next Route Handler](https://nextjs.org/docs/app/api-reference/file-conventions/route)、[RFC 9110 条件请求优先级](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.2.2)、[content-disposition](https://github.com/jshttp/content-disposition) 的公开 API 和安装类型。实验响应头现在直接消费生产规则；实验故障控制不进入生产接口。

## 验证与审计

环境：macOS / Darwin 25.6.0 arm64，Node 24.18.1、pnpm 11.19.0、Next 16.3.5、ImageMagick 7.1.2-31、ExifTool 13.55。命令使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。现有 Ego Lite / Chrome 152，复用 TaskSpace 2，最后由项目浏览器运行器关闭；没有下载浏览器。

| 实际命令                                                                                                                                                                    | 结果与证据                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                            | 通过；依赖分类调整后再次冻结安装通过                                                                                                |
| `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`                                                                                                              | 通过                                                                                                                                |
| `pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/unit.xml`                                                                                 | 22 文件、374 项通过；[JUnit](./unit.xml)                                                                                            |
| `pnpm run build`                                                                                                                                                            | 通过，包含新 `/i/[imageId]` 动态路由；保留既有 SQLite 可选 Debug 二进制追踪诊断，实际 Release 驱动通过运行测试                      |
| `pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/integration-final.xml`                                              | 48 文件、394 项通过，含真实工具、无密钥/无数据库独立构建；[JUnit](./integration.xml)                                                |
| `pnpm exec vitest run --project integration tests/integration/identity/setup-dev.test.ts --reporter=default --reporter=junit --outputFile=test-results/setup-dev-retry.xml` | 1 项通过；[单独复跑](./setup-dev-retry.xml)                                                                                         |
| `pnpm exec vitest run --project unit tests/unit/delivery --reporter=default --reporter=junit --outputFile=test-results/delivery-unit.xml`                                   | 3 文件、59 项通过；最后移除实验响应头重导出文件后复跑                                                                               |
| `EGO_TASK_SPACE=2 node tests/verification/delivery/run-browser.ts`                                                                                                          | 退出码 0；外站 img 实际宽度 64；中文 PNG/SVG 下载名称和字节完全一致；[浏览器](./browser.json)、[私有与撤销](./browser-session.json) |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`、`EGO_TASK_SPACE=2 pnpm run test:browser`                                                                       | 通过；运行器构建 shell/UI 夹具并执行既有响应式、主题、键盘、1440/390 初始化/重启回归；[运行摘要](./browser-regression.json)         |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`、`git diff --check`                                                                                    | 通过                                                                                                                                |

本次新增 `local.test.ts` 的 30 项测试使用真实 SQLite 和文件流，检查打开后权限/状态变化、会话撤销、默认版本切换、旧对象已删除、连续两次版本变化、文件缺失/大小异常、首读/中途错误、取消/Abort 关闭和计数排除。`local-http.test.ts` 的 4 项通过正式 standalone `/i` 路由验证字节、Cookie/Bearer/分享凭证、撤销、GET/HEAD/304/412/Range、方法响应与中文 SVG 附件。既有 `http.test.ts` 仍是前置实验，不用它冒充生产路由测试。

最后清理修复和导入调整后执行 `pnpm exec vitest run --project integration tests/integration/delivery --reporter=default --reporter=junit --outputFile=test-results/delivery-final.xml`，3 文件、46 项通过，见 [delivery JUnit](./delivery.xml)；同期 [delivery 单元 JUnit](./delivery-unit.xml) 为 59 项通过。最终复审无剩余必须修复项。

首次构建因新增测试文件尚在编写而暴露类型错误，修复类型后通过，没有削弱断言。首次完整集成 393 项通过、1 项既有 `setup-dev.test.ts` 未观察到热更新标记；不改源码、超时或断言，单独复跑通过，最终完整复跑 394 项通过。记录为一次重编译观察失败，不断言已查明环境根因。JUnit 归档删除 stdout/stderr，避免归档测试的一次性初始化码；测试条目及结果保留。

使用 `code-review-and-quality` 独立审计需求、模块边界、实际测试有效性、会话/版本竞态、流关闭和依赖变更。发现并修复验证脚本早期失败或日志写入失败会跳过服务清理的问题；实际注入“监听前 seed 失败”和“seed 与日志写入同时失败”，确认原错保留、数据库关闭、服务停止，见[失败清理证据](./cleanup-failures.json)。临时故障脚本已移除，不进入产品。生产实现与最终测试无剩余必须修复项。

## 保留边界

S3 传输属于 T-DEL-02，本次未使用提供的对象存储凭据。SVG 测试使用登记的真实 SVG 文件验证交付，不声称全格式上传/处理已实现。真实磁盘错误通过对真实 ReadStream 注入 EIO 验证，不声称制造了介质损坏。

发布验证按[现行执行约定](../../tasks/execution.md#适用检查)。仓库工作流仅由 Release 触发镜像流程，CI 仅供工作流调用，没有 PR/push 或手动验证入口。本次不发布 Release、镜像或部署，不以未运行的 AMD64/ARM64 镜像测试冒充通过。推送后回读实际检查状态；不合并、主动关闭 Issue，也不删除分支/worktree。
