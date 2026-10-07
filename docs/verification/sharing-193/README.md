# T-SHR-04 匿名大图与撤权联验

Issue [#193](https://github.com/dnslin/ariso-next/issues/193)，需求 `R-16.3-01`、`R-17.2-01/02`、`R-17.3-01`、`R-17.4-02`、`A-26.10-03/05`。依据为 [sharing §7](../../specs/SPEC-sharing.md#7-列表大图与打开中的变化)、[任务卡](../../tasks/m3-m4-experience.md#t-shr-04-匿名大图与删除相册后失效联验)、[设计交接](../../design/handoff.md)和[执行约定](../../tasks/execution.md)。不修改冻结 PRD。

匿名功能范围为查看器、公开邻居查询和打开中成员/授权变化。前置 #192、#191、#185、#161、#134 在实施前已从 GitHub 原生依赖回读为 CLOSED。管理查看器、分享管理、相册删除和内容鉴权沿用实际生产能力；不新增下载、管理详情、版本菜单、幻灯片或生成文件。

2026-10-07 用户在人工预览中明确追加两项分享设置反馈：返回入口改为右上图标按钮，“已过期”仅用红色字体且不加 Halo。用户随后明确回复“可以的，就这样，这个UI我审查通过了”，这两项UI人工验收通过；受影响真实浏览器代表流程及独立代码/设计评审也已通过，Figma已同步。修正、失败历史与完成边界见[本轮反馈证据](./feedback-settings/README.md)。原匿名查看器全量检查与其他未验范围仍按下文保留，不能由这两项通过代替。

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

| 交付状态            | 当前事实                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| 代码实施            | 已完成本 Issue 范围，六项 P2 已修正并独立复审。                                                               |
| 本地适用检查        | 格式、静态、类型、单元与根构建通过；原串行剩余3项集成超时已原样复验通过，旧全量失败与默认浏览器未闭环项保留。 |
| 本 Issue 浏览器功能 | 代表、交互、九种撤权/成员变化和迟到响应/恢复场景分别取得实际证据；两独立浏览器会话要求已按用户指令取消。      |
| 独立设计评审        | 已完成桌面/手机、浅/深主题和适用状态对照；无遗留本次视觉偏差。                                                |
| 用户人工验收        | 未完成。独立预览保持运行，PR 为草稿。                                                                         |

本地原始记录保留于 `test-results/sharing-193/` 与 `test-results/sharing-193-live/`；公开证据不保存凭证。代码完成、本地检查、浏览器功能、设计评审和人工验收分别记录。默认完整检查仍有失败，人工验收尚未完成，PR 保持草稿。

## 限制与人工验收

Ego 两标签是同一 profile，历史中没有取得两个独立浏览器会话证据。2026-10-07 用户明确取消此项要求，按[当前执行约定](../../tasks/execution.md#前端共用验收)不再作为未完成项；取消不记作测试通过。HTTP 联验使用独立 Cookie 请求。AWS、跨浏览器矩阵、真实手机/物理软键盘/非零安全区及 Release 容器本轮未验证，适用范围按执行约定记录。

人工预览使用另建数据，不复用自动测试场景。地址与独立账号、密码只在本次聊天交付，不提交到仓库或 PR。需检查：网格/瀑布流点开、隐藏/显示名称、前后及首尾、缩放/平移/全屏、关闭返回与焦点、手机底栏、真实加载失败及撤权后的门禁。预览保持运行，直到用户明确要求停止或清理。

## 失败原因追查与要求调整（2026-10-07）

用户取消两个独立浏览器会话验收，并授权重新打开 Ego 进行失败复验。独立 agent 分别只读调查集成与默认浏览器的原始日志、源码和完整调用链，使用 debugging-and-error-recovery / code-review-and-quality；没有重复执行测试。产品代码与已获批 UI 未改，本轮仅更新实际要求及证据。

Node24.18.1/pnpm11.19.0、macOS arm64、同一隔离分支，冻结离线安装通过。先单独运行原3项失败测试，保留原120秒/默认5秒/240秒预算及全部断言，未与本任务浏览器或构建并发：

```sh
pnpm exec vitest run --project integration --maxWorkers=1 tests/integration/identity/setup-lifecycle.test.ts tests/integration/identity/setup-dev.test.ts tests/integration/runtime/build.test.ts --reporter=verbose --reporter=json --outputFile.json=test-results/sharing-193/failure-followup/integration-original.json
```

实际退出0、3文件/13测试通过、总115.30秒。原生命周期失败项1.337秒，真实Next dev重编译/初始化/登录28.735秒，独立无密钥生产构建73.477秒。见[完整报告](./failure-followup/integration-original.json)、[原始日志](./failure-followup/integration-original.log)与[独立调查](./failure-followup/integration-notes.md)。旧失败都是总预算超时，没有业务断言失败；两个重测试还包含完整依赖/文件复制准备，原日志没有阶段时间，不能证明旧时点资源压力是唯一根因。当前3项失败已不复现，不修改测试预算，也不将这次定向结果拼接成单次默认完整集成通过。

默认浏览器的21项历史失败已[逐项调查](./failure-followup/browser-notes.md)，没有统一归为环境问题：

| 历史分类               | 已证实原因及当前状态                                                                                                                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4项分页地址等待        | 页面实际返回正确目标并补 `?page=1`，旧测试要求完整地址不带query；与现有分页正规化契约不符。范围外脚本未修改。                                                                                                                                                                    |
| 3项桌面上传/连续性等待 | 同一媒体工具清理的 `ps` 命令超过1000ms，报 `MEDIA_TOOL_SHUTDOWN_FAILED` 并停止媒体队列，后续已受理图片等不到处理；重启后同一图片完成。见[无进程列表的日志摘录](./failure-followup/media-queue-failure.json)。这是既有媒体模块的具体运行时故障，未在本Issue修改或以增加等待掩盖。 |
| 2项图库/批量阶段中止   | 共用运行器600秒阶段预算到期，随后出现target/context失联；内部最后停点还未完全定位，不能记作产品通过或选错浏览器。                                                                                                                                                                |
| 2项分享自身失败        | 查看器焦点和设置返回已在本Issue修复并定向通过，历史默认报告保持failed。                                                                                                                                                                                                          |
| 其余10项               | 各自记录具体边界及缺少的证据，包括控件卸载、弹窗遮挡、通知几何、刷新监听、未知态重复关闭、原生目录取消、Token说明/选区滚动和退出后的第二次会话读取。没有把强线索当已证明根因。存储管理一项已通过下述原样复验；其余仍需按范围处理。                                               |

使用用户授权的新TaskSpace5，只复用p1。浏览器在已验证的最终生产构建副本 `/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-feedback-build-Zta2LS` 执行，全部为运行器独立数据和端口，没有修改人工预览。实际命令如下，使用已有参数，没有新增共享参数或改变默认分发：

```sh
EGO_TASK_SPACE=5 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=/Users/dnslin/.codex/worktrees/issue-193-public-viewer/ariso/test-results/sharing-193/failure-followup/browser-storage node scripts/verify-browser.mjs --suite storage-admin
EGO_TASK_SPACE=5 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=/Users/dnslin/.codex/worktrees/issue-193-public-viewer/ariso/test-results/sharing-193/failure-followup/browser-copy node scripts/verify-browser.mjs --suite library-copy --only revision
```

| 入口                                   | 实际结果                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--suite storage-admin`                | 退出0。原失败的路径校验以及10项管理检查/120布局通过；该既有入口的公共导航2项检查/74布局也通过。见[业务报告](./failure-followup/storage-browser.json)、[运行器](./failure-followup/storage-runner.json)、[导航报告](./failure-followup/navigation-browser.json)、路径告警[桌面](./failure-followup/storage-local-error-1440.png)/[手机](./failure-followup/storage-local-error-390.png)。旧告警超时当前未复现，不能直接定性为后端校验缺陷。 |
| `--suite library-copy --only revision` | 退出1，刚进入cross-page-native-copy即收到user takeover，`stoppedForUserControl=true`；尚未到达原通知消费者失败点。见[停止报告](./failure-followup/copy-stopped.json)、[运行器](./failure-followup/copy-stopped-runner.json)。保持未验证，不作为复制缺陷或通过。                                                                                                                                                                            |

当时的控制边界来自[ego-browser SKILL.md](/Users/dnslin/.agents/skills/ego-browser/SKILL.md#user-control-and-completion)：“Stop when the user takes control or the space is inactive or unassigned.” 主执行者已停止浏览器，没有另建空间、接管或用其他能力绕过；TaskSpace5没有调用finish。用户随后已明确指示“继续 Ego 5”，恢复后的结果见下节；此处保留停止时的事实。标签Enter前后观测仅在构建副本临时准备，未执行并已还原；没有把它记录为复验。停止后继续独立离线文档工作。人工预览继续保留。

本轮纯文档更新的 `pnpm run format:check`、`node docs/tasks/check.mjs` 和 `git diff --check` 均退出0。格式检查全量通过，文档检查为120任务/298需求，无缺失编号或循环，见[格式日志](./failure-followup/format.log)与[文档日志](./failure-followup/docs.log)。产品和测试源码没有变动，不重复运行已通过的静态、类型与构建检查。

## Ego5恢复后的失败复验（2026-10-07）

用户明确指示“继续 Ego 5”后，实际调用 `takeOverTaskSpace(5)`，ownership恢复为agent，继续同一p1。沿用上节Node24、最终生产构建副本和独立夹具；人工预览数据与服务未修改。本轮不重跑已经通过的集成、根构建、分享查看器或存储场景，没有修改项目产品/测试/运行器源码。

每行使用 `EGO_TASK_SPACE=5 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=/Users/dnslin/.codex/worktrees/issue-193-public-viewer/ariso/test-results/sharing-193/failure-followup/browser-<报告名> node scripts/verify-browser.mjs <入口>`。本地服务保留原NO_PROXY/no_proxy并追加localhost、127.0.0.1、::1和.localhost。以下报告为实际执行结果，退出1的检查保持failed；定向与诊断结果不改写默认57阶段历史报告。

| 报告名 / 入口                                                    | 实际结果与可以确认的事实                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `copy-resumed` / `--suite library-copy --only revision`          | 退出1，4检查/56布局；原trash通知几何断言复现失败。实测entering=true、translateY72、bottom1124/视口高1080。见[原报告](./failure-followup/copy-resumed.json)、[运行器](./failure-followup/copy-resumed-runner.json)、[入场截图](./failure-followup/copy-entering-failure.png)。原生剪贴板已恢复。                                                                                                                                                                                   |
| `copy-settled` / 同上                                            | 退出0，9检查/85布局。原断言自然通过；首次测量已非entering、transform0、bottom1052/高1080。390×400短视口通知bottom376，44px关闭目标可达。新增“原测量越界后再观测稳定状态”分支本次没有执行，未替换原断言的layout。见[报告](./failure-followup/copy-settled.json)、[运行器](./failure-followup/copy-settled-runner.json)、[恢复通知](./failure-followup/copy-stable-trash.png)、[短视口通知](./failure-followup/copy-stable-tag-short.png)。                                         |
| `tags-resumed` / `--suite tags`                                  | 退出1，8检查/74布局。Enter前实际焦点是“关闭”按钮；Enter后弹窗已正常关闭并出现未知结果notice，原单次写入/count=1检查通过，随后脚本重复dismiss才matched0。是原脚本流程问题；未修改范围外脚本，不能记tags全量通过。见[原生前后观测](./failure-followup/tags-resumed.json)及[运行器](./failure-followup/tags-resumed-runner.json)。                                                                                                                                                   |
| `tokens-resumed` / `--suite tokens --only behavior`              | 退出1，停在1440的一次性密钥流程，尚未到原390失败点。第一轮copy前/后/遮蔽还原后scroll100；第二轮copy之前已0，之后仍0，40..50 backward选区不变。原脚本仍用首轮100比较。变化缩小到两轮之间，具体是关闭通知、主题切换还是遮蔽后的延迟原生滚动仍未定位；不声称手机原失败已复验或复制按钮导致变化。见[数值观测](./failure-followup/tokens-resumed.json)、[运行器](./failure-followup/tokens-resumed-runner.json)。无密钥内容进入新增观测。                                              |
| `token-layouts-resumed` / `--suite tokens --only representative` | 退出1。程序focus时focusVisible=false，Tooltip没有出现。随后同一已加载前端实际Shift+Tab/Tab得到focusVisible=true及完整说明，见[原报告](./failure-followup/token-layouts-resumed.json)、[运行器](./failure-followup/token-layouts-resumed-runner.json)、[原生键盘记录](./failure-followup/token-native-focus.json)/[截图](./failure-followup/token-native-focus.png)。原生补查发生在该夹具停服后，仅证明前端键盘能力；截图中的Failed to fetch来自测试服务已结束，不是新的业务结论。 |
| `account-resumed` / `--suite account`                            | 退出0，14检查/101布局；真实signout200、held background null、登录返回地址/字段及后续session null等原断言通过。导航后旧window消失，新增次读诊断没有留值；不能倒推旧失败429或具体次读状态。见[报告](./failure-followup/account-resumed.json)、[运行器](./failure-followup/account-resumed-runner.json)。                                                                                                                                                                            |
| `batch-resumed` / `--suite library-batch --only lifecycle`       | 退出0，2检查/24布局，精确覆盖旧activeCheck=trash-restore-preserves-surviving-data。旧最后业务停点本次不复现；不把它当batch全矩阵通过或证明旧600秒唯一根因。见[报告](./failure-followup/batch-resumed.json)、[运行器](./failure-followup/batch-resumed-runner.json)。                                                                                                                                                                                                              |
| `library-resumed` / `--suite library`                            | 退出0，原完整library阶段77检查/327布局通过，旧600秒阶段超时当前不复现。见[报告](./failure-followup/library-resumed.json)、[运行器](./failure-followup/library-resumed-runner.json)。这是library阶段全量，不是默认浏览器全部阶段。                                                                                                                                                                                                                                                 |
| `reprocess-resumed` / `--suite library-reprocess`                | 退出0，10检查/64布局；真实terminal succeeded，列表GET200、延迟读取失败与键盘重试通过，apply保持1。旧release等待超时当前不复现。见[报告](./failure-followup/reprocess-resumed.json)、[运行器](./failure-followup/reprocess-resumed-runner.json)。                                                                                                                                                                                                                                  |
| `processing-resumed` / `--suite processing --only settings`      | 退出0，23检查/39布局，originalSettingsRestored=true。原生可信pointerdown后故障读取释放，真实GET200显示已保存素材，原重试断言通过。旧元素断连当前不复现，不据此推定旧精确竞态原因。见[报告](./failure-followup/processing-resumed.json)、[运行器](./failure-followup/processing-resumed-runner.json)。                                                                                                                                                                             |
| `selection-resumed` / `--suite diagnostic-selection`             | 退出0，原selection-reconciliation场景11检查、28截图通过；24次动作前观测记录当时没有遗留选中清单弹窗。旧遮挡当前不复现。此入口仅为构建副本中的临时适配器，将原library-query精确分发到既有phase；没有改项目运行器或宣称公共suite新增能力。见[报告](./failure-followup/selection-resumed.json)、[运行器](./failure-followup/selection-resumed-runner.json)。                                                                                                                         |
| `upload-input-resumed` / `--suite upload-input`                  | 退出0，11检查/82布局；真实webkitdirectory触发change，files=501、相对路径501，无cancel，实际目录上传路径通过。旧原生取消当前不复现，具体旧取消原因仍未证。见[报告](./failure-followup/upload-input-resumed.json)、[运行器](./failure-followup/upload-input-resumed-runner.json)。                                                                                                                                                                                                  |

临时构建副本只增加只读观测及上述唯一场景适配器，见[完整诊断差异](./failure-followup/temporary-diagnostics.patch)。原断言与预算保留；增加观察可能影响采样耗时，因此不声称已证明所有旧瞬时失败的唯一原因。独立审计者回读报告、源码、已安装HeroUI CSS及差异，没有操作浏览器或重复执行检查，结论见[独立审计](./failure-followup/browser-evidence-review.md)。

当前已证实的失败包括四项分页URL旧断言、标签重复关闭、桌面Tooltip输入方式差异、通知入场采样；Token两轮间横向滚动仍缺具体动作归因。原媒体ps1000ms超时停止队列的证据继续有效，本轮不修改该既有模块。另在只读审查中发现图库more模式重处理终态不会读取最新LibraryItem：`use-batch-reprocess` → `library-screen.refresh` → `use-library-query.onBatchCompleted`只使缓存失效，pages才refetch，more保留当前页，且没有更新处理状态/版本/缩略图。它与trash/visibility保持cursor的既有行为需分别评估，属于本Issue之外的既有图库缺口；当前reprocess场景通过不替代真实more链验证。旧脚本虽显式写pages但失败URL没有page的原因仍未证明，没有将其自动归为同一个缺口。

全部复验结束后，实际调用一次 `task.finish({keep:[]})` 并等其成功返回；Ego5已正常结束，没有留下测试页面。上述9个临时诊断文件均已从项目源码还原并逐文件核对一致。人工预览 `sharing-63991.localhost:63991` 继续保留。本轮没有新视觉实现变更，既有Figma同步/独立设计评审/设置两项人工验收继续有效；新的诊断截图不替代设计评审或匿名大图其他人工范围。项目产品、测试与默认分发没有修改，旧全量报告仍保留failed；范围外脚本和既有媒体/图库问题仅报告，PR保持草稿。

归档后的 `pnpm run format:check` 全量通过，`node docs/tasks/check.mjs` 为120任务/298需求、无缺失编号或循环，`git diff --check` 通过；见[本轮格式日志](./failure-followup/ego5-format.log)与[文档日志](./failure-followup/ego5-docs.log)。独立审计发现的上传表格断行已修正，新增审计及最后文案另做定向格式检查，不重复应用检查。
