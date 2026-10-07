# T-SHR-04 匿名大图与撤权联验

Issue [#193](https://github.com/dnslin/ariso-next/issues/193)，需求 `R-16.3-01`、`R-17.2-01/02`、`R-17.3-01`、`R-17.4-02`、`A-26.10-03/05`。依据为 [sharing §7](../../specs/SPEC-sharing.md#7-列表大图与打开中的变化)、[任务卡](../../tasks/m3-m4-experience.md#t-shr-04-匿名大图与删除相册后失效联验)、[设计交接](../../design/handoff.md)和[执行约定](../../tasks/execution.md)。不修改冻结 PRD。

匿名功能范围为查看器、公开邻居查询和打开中成员/授权变化。前置 #192、#191、#185、#161、#134 在实施前已从 GitHub 原生依赖回读为 CLOSED。管理查看器、分享管理、相册删除和内容鉴权沿用实际生产能力；不新增下载、管理详情、版本菜单、幻灯片或生成文件。

2026-10-07 用户在人工预览中明确追加两项分享设置反馈：返回入口改为右上图标按钮，“已过期”仅用红色字体且不加 Halo。实现、Figma 同步、本轮适用检查和独立审查另记在[本轮反馈证据](./feedback-settings/README.md)。此处原匿名查看器的通过记录不替代新增设置控件的浏览器验证、设计对照或人工验收。

交付 PR：[草稿 #256](https://github.com/dnslin/ariso-next/pull/256)，分支 `codex/issue-193-public-viewer`。实施与证据提交 `ec1508fe` 已推送；实际回读为 OPEN、draft、MERGEABLE，`statusCheckRollup` 为空，`gh pr checks` 未报告检查，不能记为 CI 通过。尚未合并、关闭 Issue、发布或部署；分支和 worktree 保留，独立人工预览继续运行。

## 实际实现

- `/s/{token}/items?imageId=…` 先校验分享授权，再由 collections 在同一读事务按加入时间降序、ID 升序读取当前/前后邻居、公开序号和数量。响应最多三张，只含匿名字段；名称服从当前 `showName`。
- delivery 从已发布版本选择显式 `type` 的 `previewUrl`。普通图优先可显示 compressed，动画优先 original，SVG/ICO/多页等沿既定 thumbnail 预览。实际加载错误保留同一版本并允许重试，不换文件掩盖错误。
- sharing 复用 YARL Inline/Zoom 和 `ViewerImage` 展示组件，不消费 `LibraryDetail` 或后台接口。最多保留/预载当前与前后各一张，首尾不循环；提供前后、缩放/平移、关闭及支持时全屏。
- 既有五秒可见页检查同时检查已加载卡片与当前/邻居 ID，不增加轮询器。授权、名称策略、批次变化、关闭及停止都会取消旧请求。当前成员移除清掉卡片与大图；授权失效清掉相册、名称、大图及邻居并返回门禁。
- 列表保留真实 DOM 和滚动位置，查看时停止其交互；关闭恢复来源卡片焦点。公开页面继续复用 PublicShell、品牌、返回首页及公共装饰。
- 删除相册沿用真实级联删除分享/授权，不删除图片。关闭分享、改密、到期、重生成和删册不会撤销公开图片的独立内容地址；改私有、回收或停用存储阻止新的匿名内容请求。已下载字节和已签发最长 300 秒的 S3 地址保留既定边界。

## 环境与验证入口

2026-10-06 至 07，macOS arm64，Mac16,10，16 GiB，Node 24.18.1、pnpm 11.19.0。隔离 worktree `codex/issue-193-public-viewer` 从当时最新 `origin/main@a0384c78` 创建；应用和浏览器夹具均使用独立临时数据库、目录与端口。Ego Lite 最初使用本任务 TaskSpace 43；用户中断后该空间已不存在，继续执行时另建 TaskSpace 2。没有浏览器下载。收尾时远端 main 合入 #167 公共上传（`7e4339f1`），与本次修改文件无交集；本分支未整合该并发提交。

默认单元入口包含 `tests/unit/**/*.test.ts`，默认集成入口包含 `tests/integration/**/*.test.ts` 以及真实媒体工具组。默认 `pnpm run test:browser` 经 `scripts/verify-browser.mjs` 顺序执行新增 `sharing-viewer`，不限于定向入口。suite/only 分发由 browser-plan、browser-sharing 和真实参数入口测试覆盖；viewer 参数只进入 viewer 场景。

定向浏览器入口：

```sh
EGO_TASK_SPACE=2 EGO_KEEP_SPACE=1 node scripts/verify-browser.mjs --suite sharing-viewer
# --only representative|interactions|revocation|race 仅缩短重跑
```

真实对象服务入口使用现有私有配置，不保存凭证：

```sh
node tests/integration/sharing/viewer-live.ts --config /Volumes/data/project/ariso/.data/upload-v02.json --output test-results/sharing-193-live
```

Cloudflare R2 与 SeaweedFS 本轮各 9/9 通过。真实管理 HTTP 修改关闭/改密/到期/rotate/删除，随后分别检查 HTML、RSC、列表、邻居和刷新；独立 Cookie 请求证明旧授权不再放行。成员私有/回收/移出/停用均检查新的匿名内容和邻居响应。两服务各四个测试版本精确删除并 HEAD 确认不存在。保留旧签名仍可读取且声明 300 秒的证据，本轮没有等待五分钟实测签名到期；到期能力沿用 delivery 既有证据。

| 实际检查                                                                                      | 结果与边界                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`、`pnpm --dir tests/experiments/ui install --frozen-lockfile` | 通过，无锁文件或依赖变更。                                                                                                                                                                                              |
| `pnpm run format:check`                                                                       | 首次检查期间 interactions 文件仍在修改，警告保留；收齐最终证据后的默认入口退出0（`format-complete.log`）。补记此结果只改本文，随后定向核对格式。                                                                        |
| `pnpm run lint`                                                                               | 首次仅新增浏览器脚本 unused stage 警告，退出 1；修正后的最终默认完整入口退出 0（`lint-complete.log`）。没有降低门槛；随后仅改浏览器脚本，其定向 ESLint 也已通过。                                                       |
| `pnpm run typecheck`、`pnpm --dir tests/experiments/ui run typecheck`                         | 通过；主应用最新类型检查和 UI 夹具类型检查均已实际执行。                                                                                                                                                                |
| `pnpm run test:unit`                                                                          | 默认入口 114 文件、1585 测试通过。随后修改会话/运行器输入，对 share-session、browser-sharing、browser-plan 定向复验 3 文件/115 测试通过，browser-runner 实际参数入口 173 测试通过；不把初次计数当成最后输入的全量重跑。 |
| `pnpm run build`                                                                              | 最终 `build-wheel-focus.log` 退出 0，包含错误卡片、全屏/放大焦点、放大布局、可见等待状态和舞台 Escape 修正。保持既有可选依赖追踪警告。                                                                                  |
| `pnpm run test:integration --maxWorkers=4`                                                    | 默认普通集成与真实工具组共 160 文件：145 通过/15 失败；1529 测试：1510 通过/19 失败。没有跳过失败。                                                                                                                     |
| 串行集成完整命令见下方                                                                        | 串行复验 18 文件：15 通过/3 失败；160 测试：157 通过/3 失败。本 Issue 的 public-query、public-http、production-http、viewer-local、viewer-s3 全部通过。                                                                 |
| `node docs/tasks/check.mjs`                                                                   | 收尾 `docs-complete.log` 退出0：120任务、298需求，无缺失ID或循环。                                                                                                                                                      |
| `node …/viewer-live.ts --config … --output …`                                                 | 实际 Cloudflare R2、SeaweedFS 各 9/9 通过；报告 [R2](./r2.json)、[SeaweedFS](./seaweedfs.json)。                                                                                                                        |

串行复验的实际完整命令：

```sh
pnpm exec vitest run --project integration --project media-tools --maxWorkers=1 tests/integration/storage/settings-http.test.ts tests/integration/identity/http.test.ts tests/integration/identity/auth.test.ts tests/integration/identity/setup-dev.test.ts tests/integration/identity/setup-process-http.test.ts tests/integration/identity/setup-lifecycle.test.ts tests/integration/runtime/secret-preflight.test.ts tests/integration/runtime/logging.test.ts tests/integration/runtime/health.test.ts tests/integration/runtime/build.test.ts tests/integration/sharing/production-http.test.ts tests/integration/sharing/viewer-local.test.ts tests/integration/sharing/viewer-s3.test.ts tests/integration/sharing/public-http.test.ts tests/integration/sharing/public-query.test.ts tests/integration/media/metadata.test.ts tests/integration/media/preview.test.ts tests/integration/media/reprocess.test.ts tests/integration/upload/local.test.ts
```

原调用传入19个过滤参数，其中 `identity/setup-process-http.test.ts` 当前不存在；实际匹配18个文件。未命中的参数不计为已执行检查，保留原调用，不以重建命令替换历史记录。

串行仍失败的是 `identity/setup-dev.test.ts`（120 秒）、`identity/setup-lifecycle.test.ts` 的 prestart/module reload 项（5 秒）、`runtime/build.test.ts`（240 秒）。这些模块和测试本次未改，已保留具体失败与调用路径；根因未完全定位，不宣称是已证明的 main 基线问题。初次并发时其余 14 项超时在串行未复现；实测同时运行其他任务和负载压力不能代替每项根因证明。Local 夹具原本只有原图却断言 thumbnail ready，补真实缩略图后通过；sharing 日志观察时序问题在串行未复现。完整调查见 [独立代码审计](./code-review.md)。

## 浏览器、审计与设计证据

默认 `EGO_TASK_SPACE=43 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/sharing-193/default pnpm run test:browser` 实际执行全部 57 阶段，36 通过、21 失败，退出 1，临时目录已清理。新增 viewer 确实进入默认流程；其连续键盘焦点失败已取得真实 RED，另 20 个阶段的具体错误与范围调查见[独立代码审计](./code-review.md#默认浏览器结果与分发范围核对)。没有将定向运行替代或改写默认结果。[默认运行报告](./browser-default.json)。

本次确认并修正：失效成员仍留列表、状态重试发错请求、连续切图丢焦点、全屏切换丢焦点、Inline 舞台吞掉 Escape，以及滚轮放大后被移除的按钮丢焦点。前两项保留行为测试；焦点/键盘问题有真实浏览器失败与修正后的复验。错误卡片、放大和全屏按已获批 Figma 实施。加载说明原先仅供辅助阅读，现按任务卡连续加载表达及 HeroUI Spinner 规则在已有状态区域可见。没有新增页面流程或改变公共规范。

首次全量 viewer 定向运行在名称隐藏等待失败，报告保留于[修正断言前](./browser-viewer-before-race-fix.json)。实际 DOM 诊断中，旧名称只存在于 `body` 下 Next 首屏 `SCRIPT`，不在 `main` 文本或名称属性中；随后测试检查可见页面文字及全页 `alt/title/aria-label`，保留实际旧邻居响应、释放前后名称清理和当前图不前进断言。已授权首屏脚本不是当前显示状态，亦不承诺撤回已收到字节。

最后的 interactions 定向入口退出 0，报告为 passed：56 项检查、20 组布局，涵盖连续键盘、滚轮/双指放大和平移、名称态、全屏、Escape、跨批次、首尾、关闭回焦/滚动和短视口。见[通过报告](./browser-interactions.json)和[独立设计对照](./design-review.md)。入口收集器另存旧页面 origin 的错误，当前页面错误仍执行原严格断言；之前完成56项后读到旧事件的失败原样保留于[修正前报告](./browser-interactions-before-buffer-fix.json)。历史失败报告分别保留：[首次连续切图](./browser-viewer-initial.json)、[定向入口](./browser-bootstrap-initial.json)、[全屏焦点](./browser-fullscreen-initial.json)、[舞台 Escape](./browser-stage-escape-initial.json)、[滚轮放大焦点](./browser-wheel-zoom-initial.json)。`viewer-complete` 已取得普通/错误代表状态、舞台 Escape 与四组放大布局，随后浏览器 `Input.dispatchMouseEvent` 超时；[原报告](./browser-viewer-before-input-retry.json)保持 failed，定向复验只重跑受影响/未完成阶段。不以截图数量或自动断言替代同视口设计核对。

最后的 race 定向入口在同一 TaskSpace 2 恢复后退出 0，10 项检查、12 组布局。真实按钮激活计入 `manualPosts: 1`，独立于自动五秒检查；成功后警告清除且当前图保留。真实扣留的已授权邻居响应在隐藏名称、关闭重开及撤权后均不能填回旧状态。见[通过报告](./browser-race.json)。恢复前的页面求值超时原样保留于[失败报告](./browser-race-before-page-recovery.json)，没有增加超时或削弱断言。

当前代表状态26组来自 `viewer-complete` 已完成段，撤权/成员状态九种情况来自 `viewer-final` 已完成段，分别保留其整体 failed；最后两次定向只复验受影响的 interactions/race，不机械重跑输入未变化的阶段。截图归档为 `actual/representative`、`actual/interactions`、`actual/revocation`、`actual/race`，独立设计评审逐项读取后未发现遗留视觉偏差。没有声称最后一次默认或完整 viewer 入口通过。

| 交付状态            | 当前事实                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| 代码实施            | 已完成本 Issue 范围，六项 P2 已修正并独立复审。                                                |
| 本地适用检查        | 格式、静态、类型、单元与根构建通过；完整集成与默认浏览器仍有实际失败，明细保留。               |
| 本 Issue 浏览器功能 | 代表、交互、九种撤权/成员变化和迟到响应/恢复场景分别取得实际证据；两独立浏览器上下文仍未验证。 |
| 独立设计评审        | 已完成桌面/手机、浅/深主题和适用状态对照；无遗留本次视觉偏差。                                 |
| 用户人工验收        | 未完成。独立预览保持运行，PR 为草稿。                                                          |

本地原始记录保留于 `test-results/sharing-193/` 与 `test-results/sharing-193-live/`；公开证据不保存凭证。代码完成、本地检查、浏览器功能、设计评审和人工验收分别记录。默认完整检查仍有失败，人工验收尚未完成，PR 保持草稿。

## 限制与人工验收

Ego 两标签是同一 profile，不能据此声称两个独立浏览器上下文通过。HTTP 联验使用独立 Cookie 请求。AWS、跨浏览器矩阵、真实手机/物理软键盘/非零安全区及 Release 容器本轮未验证，适用范围按执行约定记录。

人工预览使用另建数据，不复用自动测试场景。地址与独立账号、密码只在本次聊天交付，不提交到仓库或 PR。需检查：网格/瀑布流点开、隐藏/显示名称、前后及首尾、缩放/平移/全屏、关闭返回与焦点、手机底栏、真实加载失败及撤权后的门禁。预览保持运行，直到用户明确要求停止或清理。
