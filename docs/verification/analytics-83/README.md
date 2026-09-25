# T-ANA-01 本地公开访问内存聚合

日期：2026-09-26。关联 [Issue #83](https://github.com/dnslin/ariso-next/issues/83)，范围以 [T-ANA-01 任务卡](../../tasks/m1-m2.md#t-ana-01-本地公开访问内存聚合)为准。覆盖 R-19.2-01/02/03 的本地计数部分，不代表整个 ANALYTICS-COUNT 或持久统计已经完成。

## 前置与实现

`gh issue view 83 --json title,body,comments,state,url` 回读无评论；原生 `dependencies/blocked_by` 为已关闭的 #69、#66、#82，`blocking` 为 #84。已核对 delivery、collections 和 EV-ANALYTICS-01 的交付报告。基线 `origin/main` 为 `33cf562`，独立目录 `/Volumes/data/project/ariso-issue-83`，分支 `codex/issue-83-local-access-count`，原工作区保持不变。

- `src/server/analytics/collector.ts` 同步聚合 imageId/date/timezone/version，不写数据库、文件或网络，不重新查询图片状态。日期复用 site 所用的原生 Intl 时区能力，按事件 occurredAt 提取年月日；只缓存最近一个时区格式器。实现前核对了 [ECMA-402 formatToParts](https://tc39.es/ecma402/#sec-intl.datetimeformat.prototype.formattoparts) 和锁定 TypeScript 的 Intl 类型，无新增依赖。
- `src/app/i/[imageId]/route.ts` 在 delivery 首块事件回调内读取已提交 site 时区并立即聚合，两者之间没有 await。请求内重复回调最多尝试一次，失败不重试内容请求。异常日志保留错误、图片/存储 ID、实际版本、事件时间及时区；合法响应继续返回。
- 进程内单例在开发热更新时复用。缓冲上限沿用实验的 20000 个不同键，满时仍接收旧键增量；新键拒绝、累计 dropped/incomplete 并记录诊断。snapshot 返回副本，调用者不能改写历史增量。
- 本次不创建无人消费的数据库表或迁移。批写、批次确认、定时器、365 天保留与关停协调由 [T-ANA-02 / #84](../../tasks/m1-m2.md#t-ana-02-统计批写保留与退出刷库) 实施。#82 报告中“#83 接入时统一关停”的归属与任务卡不一致；按执行约定的任务卡唯一范围处理。本次不声称关停无损，进程退出仍丢失全部内存计数，缓冲尚不会自动释放。

无产品 UI 改动，不涉及 Figma、主题或布局交接差异。现有浏览器流程仅作为回归；服务端计数使用下列单元/集成证据。

## 行为证据

| 验收点            | 实际检查                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 合格 GET 各计一次 | 原图/压缩/水印，各两次普通与 download 请求；SQLite query_only 开启时仍正常返回并聚合                                             |
| 实际版本          | 默认压缩对动图不适用时响应和增量均为 original                                                                                    |
| 排除              | 所有者、私有、thumbnail、HEAD、304、412、回收、停用及首块读取失败均不增加计数；既有 delivery 套件继续覆盖缺失版本/文件及鉴权矩阵 |
| 时区              | 响应准备后、首块消费前修改真实 SQLite 设置，新事件按新时区聚合；旧增量不变。单测覆盖当地午夜、23 小时日及回拨重复小时            |
| 重复/取消/流失败  | 重复交付相同回调不重计；首块前取消为 0，首块后取消及后续读取失败为 1                                                             |
| 诊断不阻断        | 无效时区与缓冲满均留下上下文日志，HTTP 返回完整原字节                                                                            |
| 内存边界          | 20000 键满载拒绝新键、接收旧键、保留漏计状态；快照和输入 Date 改动不会修改已归档值                                               |

新增 `count.test.ts` 是真实 TCP HTTP 包装生产路由：使用真实 SQLite 和本地文件流，注入 runtime、身份判定及日志以观察内部计数，并用真实文件流故障验证错误时序。它不是 Next standalone 测试，也不替代真实会话验证。原有 `delivery/local-http.test.ts`、`delivery/http.test.ts` 在完整集成中回归真实 Next、会话和传输。

## 实际环境与验证

macOS/Darwin arm64，Node 24.18.1、pnpm 11.19.0、ICU 78.3、ImageMagick 7.1.2-31、ExifTool 13.55。所有主验证命令使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。

| 实际命令                                                                                                 | 结果                                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                         | 通过，锁文件无修改                                                                                           |
| `pnpm run lint` / `pnpm run typecheck`                                                                   | 通过，最终测试补强后已重跑                                                                                   |
| `pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/analytics-83/unit.xml` | 27 文件、428 项通过，见 [JUnit](./unit.xml)（测试名称中的回车转义为 XML 实体，结果未改动）                   |
| `pnpm run build`                                                                                         | 通过，见 [构建日志](./build.txt)；保留既有 SQLite 可选 Debug 二进制追踪诊断，实际 Release 驱动由生产集成验证 |
| `pnpm exec vitest run --project integration tests/integration/analytics/count.test.ts`                   | 新增 13 项真实 HTTP 场景通过                                                                                 |
| `node docs/tasks/check.mjs` / `node docs/tasks/check.mjs --self-test`                                    | 120 任务、298 需求完整无环；5 个拒绝样本通过                                                                 |
| `git diff --check`                                                                                       | 通过                                                                                                         |

`pnpm run test:integration --maxWorkers=2 --reporter=default --reporter=junit --outputFile=test-results/analytics-83/integration.xml`：475 项全部通过，包含普通集成与真实媒体工具两组，见 [JUnit](./integration.xml)。生产构建先于本次完整集成运行。

`pnpm run format:check` 通过。

浏览器实际执行 `pnpm --dir tests/experiments/ui install --frozen-lockfile`（通过）及 `EGO_TASK_SPACE=6 EGO_KEEP_SPACE=1 pnpm run test:browser`。首次在手机 390px 重启后的登录故障注入流程超时：提示“尚未确认登录会话，请重试。”已显示，实际焦点为 BODY，未满足既有错误提示聚焦断言。该步骤尚未访问 `/i/`。保留 [首次运行摘要](./browser-first/runner.json) 和 [失败场景](./browser-first/identity-390-restart.json)，不把部分场景通过写成整体通过。

在同一 Ego Lite TaskSpace 6 检查页面状态后，原代码、断言和超时不变，使用已构建产物执行 `EGO_TASK_SPACE=6 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-retry node scripts/verify-browser.mjs` 复核。第二次仍失败，这次在手机重启后的身份流程等待 `#email` 超时；见 [复核摘要](./browser-retry/runner.json) 和 [失败场景](./browser-retry/identity-390-restart.json)。不把两次不同失败归结为已证明的同一根因。身份/登录代码及浏览器断言未修改，浏览器全套保持未完成，图库后续步骤未运行；PR 保留草稿，等待该范围外问题另行处理。Ego 空间因失败保留，没有新建空间绕过问题。

## 审计

按 `code-review-and-quality` 先审测试，再核对正确性、简洁性、模块边界、安全与性能；另由独立代理只读复核 collector、生产路由和真实 HTTP 夹具。未发现本次范围内必须修复项；采纳建议，补充默认回退时聚合版本必须为 original 的断言。

初次新 HTTP 测试把七次 1MiB 字节逐项比较放在一个 5 秒用例中而超时，拆为每版本独立普通/下载场景与默认回退场景，保持原字节断言及全部请求。初次类型检查发现夹具把数据库当事务传入、Node/Web Stream 类型定义不同；分别改为真实同步事务和 Node 流适配类型，未修改生产规则或放宽断言。

## 远端与剩余边界

当前 `.github/workflows/ci.yml` 只供 workflow_call，`images.yml` 只在 Release published 触发；仓库内没有 PR/推送验证工作流或手动 Docker 入口。GitHub 列表仍可见历史 Analytics experiment 名称，但对应文件已由 #82 删除。本次不触发 Release、镜像发布或部署，Docker/AMD64/ARM64 没有作为本轮已通过证据。

PR 与提交检查状态待推送后回读。浏览器回归未通过，草稿是当前交付状态，不声明任务全部验收完成。本次不合并、不关闭 Issue、不删除分支或 worktree。
