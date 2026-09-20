# T-SITE-01 实施与验证

对应 [Issue #47](https://github.com/dnslin/ariso-next/issues/47)，需求 R-5.4-01、R-5.5-01；仅交付 SITE-BASE 数据契约。实现位于 `src/server/site/`，没有页面、HTTP 写入入口或 Figma 修改。

## 前置证据

2026-09-20 使用 `gh issue view` 读取 #47、#26 及评论，并通过 `gh api repos/dnslin/ariso-next/issues/47/dependencies/{blocked_by,blocking}` 回读原生关系：唯一直接前置为 #26；后置为 #49、#53、#57、#69。

#26 的实际交付是已合并 [PR #46](https://github.com/dnslin/ariso-next/pull/46)，合并提交 `186a44ef847da4ece8a3389a5e5df70dcf833c49` 属于本次基线 `ada8d1b` 的祖先。回读 [CI](https://github.com/dnslin/ariso-next/actions/runs/35045975963) 与 [双架构验证](https://github.com/dnslin/ariso-next/actions/runs/35045976021) 均为 success；[归档验收](../../archive/runtime/runtime-verification.md)保留命令、容器原始报告与 Ego 证据。未将 Issue 关闭状态作为唯一证据。

## 实际契约

- `siteSettingsInputSchema` 校验并规范化公开 HTTP(S) 根地址与 IANA/UTC 时区。Zod 错误路径分别为 `publicUrl`、`timeZone`。拒绝凭据、子路径、查询、片段及纯偏移；包括 URL 解析会折叠的点路径、空查询和空片段。
- `initializeSiteSettings(tx, input)` 与 `updateSiteSettings(tx, input)` 接收已经通过入口 schema 的对象和调用方持有的同步事务。初始化重复写入由唯一主键拒绝；不覆盖既有记录，不自行开启第二连接。更新仅修改地址、时区和更新时间。完整地址修改入口必须在同一事务组合 storage CORS 操作。
- `readSiteSettings(db)` 空库返回 `null`；`requireSiteSettings(db)` 抛出 `SITE_NOT_INITIALIZED`。查询故障原样传播，未来 HTTP/启动入口负责使用 runtime logger 记录上下文。无进程级配置缓存，同一请求可复用返回的快照。
- `buildSiteUrl(settings, pathname, query)` 使用内部绝对路径和 `URLSearchParams`，不拥有消费方路由规则。缺少配置的调用方先用 `requireSiteSettings`，不推测公开域名。
- `formatSiteInstant` 接收 `Date` 或 Unix 毫秒，避免解释无时区字符串；输出简体中文。数据库 `updated_at` 为 UTC 毫秒，Drizzle 读取为 `Date`，JSON 序列化为 ISO UTC。
- 迁移创建已评审的十字段表；固定主键 1、必填字段、Logo/Favicon 引用成对约束。品牌仅有默认字段，本次没有品牌编辑能力。

复用已有 Zod、Drizzle、better-sqlite3 与平台 URL/Intl，未增加依赖。核对了已安装类型及 [Drizzle 事务](https://orm.drizzle.team/docs/transactions)、[Zod 转换](https://zod.dev/api#transforms)文档。

## 本地验证

环境：2026-09-20，macOS / Darwin arm64，Node `24.18.1`，pnpm `11.19.0`。命令在独立 worktree 执行，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。

| 实际命令                                                                                                                          | 结果                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                  | 通过，锁文件无变化                                                                                           |
| `pnpm run db:generate`                                                                                                            | 生成 `0000_special_thundra.sql` 与快照；人工核对单行和成对约束，无种子地址/时区                              |
| `pnpm run format:check`                                                                                                           | 生成的两个 JSON 初次不符合格式；格式化后通过                                                                 |
| `pnpm run lint`                                                                                                                   | 通过                                                                                                         |
| `pnpm run typecheck`                                                                                                              | 通过                                                                                                         |
| `pnpm exec vitest run --project unit tests/unit/site/settings.test.ts`                                                            | 43 项通过                                                                                                    |
| `pnpm exec vitest run --project integration tests/integration/site/settings.test.ts tests/integration/runtime/migrations.test.ts` | 修复空迁移样本前提后 20 项通过                                                                               |
| `pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/unit.xml`                                       | 8 文件、161 项通过                                                                                           |
| `pnpm run build`                                                                                                                  | 退出 0；保留历史已有的可选 SQLite Debug 二进制追踪提示                                                       |
| `pnpm run test:integration --reporter=default --reporter=junit --outputFile=test-results/integration.xml`                         | 首轮 80/81；修复 prestart 未来版本样本后全量重跑，12 文件、81 项通过（含隔离无密钥构建）                     |
| `EGO_KEEP_SPACE=1 pnpm run test:browser`                                                                                          | 首轮页面/资源/健康通过，390 截图超时；同一空间 9 重跑仍失败，原始报告见本目录 browser-first 与 browser-retry |
| `EGO_TASK_SPACE=9 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-retry pnpm run test:browser`                           | 同一截图调用超时，尚未通过                                                                                   |
| `git diff --check`                                                                                                                | 通过；提交前再次检查                                                                                         |

runtime 原有测试调整只涉及新增生产迁移使旧前提失效之处：空迁移测试改用独立空 journal；未来数据库测试使用晚于生产迁移的样本；未初始化健康检查断言业务表已迁移但没有配置行。未删除断言或跳过测试。

SITE-01–04 的本地证据由 43 项单元和 9 项真实磁盘集成测试提供，覆盖 singleton、必填和成对约束、初始化/更新回滚、重试、跨进程读取、查询故障、快照与最新配置、UTC 原始值及夏令时跳跃/重复小时。SITE-06 仅覆盖底层时区修改；分享/统计尚未接入。隔离生产构建和健康检查验证新增迁移不创建虚构配置。

## 审计与远端验证

按 `code-review-and-quality` 完成独立只读审计，覆盖正确性、可读性、模块边界、输入安全及性能，未发现 Required / Critical 问题。审计者另外执行 `pnpm exec vitest run --project unit tests/unit/site/settings.test.ts --project integration tests/integration/site/settings.test.ts tests/integration/runtime/migrations.test.ts tests/integration/runtime/prestart.test.ts`，4 文件、70 项通过。

草稿 [PR #86](https://github.com/dnslin/ariso-next/pull/86) 已创建。首轮 [CI](https://github.com/dnslin/ariso-next/actions/runs/35497264772) 通过；[Docker](https://github.com/dnslin/ariso-next/actions/runs/35497264844) 两架构构建、工具及图片检查通过，恢复脚本挂载旧测试迁移（1000）覆盖真实生产迁移，触发 `SCHEMA_TOO_NEW`。已修改脚本，从受测镜像复制生产迁移并追加样本，保留原迁移行与回滚/恢复断言；修复后的提交 `74e98a6` 已通过 [CI](https://github.com/dnslin/ariso-next/actions/runs/35497559121) 和 [AMD64/ARM64 Docker](https://github.com/dnslin/ariso-next/actions/runs/35497559369)。原始容器报告：[AMD64](./amd64.json)、[ARM64](./arm64.json)。两架构实际完成图片检查、容器停止/重启、迁移故障回滚、旧版本拒绝和 tar 备份恢复；release-checks/publish 均跳过，没有发布镜像。

容器脚本修改另行通过独立复审，并实际执行 `pnpm run lint`、`pnpm run format:check`、`pnpm run typecheck`、`pnpm exec vitest run --project unit tests/unit/scripts/container.test.ts`（9 项）及 `git diff --check`。Git 首次推送修正提交因连接超时失败，重试后成功，远端提交已核对。

Ego 两次运行均在 `Page.captureScreenshot` 超时，同空间 9 的页面快照正常，`Page.bringToFront` 后截图仍超时；已请求用户恢复窗口。浏览器保持未通过，PR 保留草稿直到该阻塞解除。

## 保留边界

- T-ID-01 负责所有者、初始化码与完整 setup 事务；本次用独立测试表验证事务组合，不声称已交付所有者初始化。
- T-SITE-02 及消费模块负责完整设置、PATCH、鉴权、CORS/OAuth 提示、链接消费和 HTTP 错误映射。
- 品牌、主题、sharing/analytics 时间语义及桌面/手机真实交互仍需对应任务验收。当前无界面改动，键盘、触控、软键盘、浅深色和安全区域不以 runtime 冒烟冒充完成。
- Docker 仅使用 GitHub Actions 验证，不在本机安装 Docker；不执行 Release、镜像发布、部署、合并、关闭 Issue 或清理分支/worktree。
