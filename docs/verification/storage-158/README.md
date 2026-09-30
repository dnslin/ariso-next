# T-STO-05 真实浏览器 CORS 检测与 origin 失效

关联 [Issue #158](https://github.com/dnslin/ariso-next/issues/158)。2026-09-30 从 `origin/main` 的 `117c66a` 创建独立 worktree `/Users/dnslin/.codex/worktrees/issue-158-storage-cors/ariso`，分支 `codex/issue-158-storage-cors`。原工作区另有任务使用，本次没有修改它。本记录遵守[任务执行约定](../../tasks/execution.md)与[设计交接](../../design/handoff.md)，不改写冻结 PRD。

**当前 #158 产品页面、专项生产验证、完整浏览器第三轮、独立代码审计与设计还原评审均已通过；PR 保留草稿，等待用户人工 UI 验收。** 2026-09-30 用户批准此前提出的按钮位置及独立 CORS 页面组合，并限定只实现 #158。人工 UI 验收仍须由用户完成。没有扩大到 #198 存储管理、#162 上传链路、#164 孤儿扫描或 #194 站点设置。

## 前置与实现边界

通过 `gh issue view 158 --repo dnslin/ariso-next --json number,title,body,state,comments,url` 和 `gh api repos/dnslin/ariso-next/issues/158/dependencies/{blocked_by,blocking}` 实际读取：Issue OPEN、无评论；四个直接前置 #157、#57、#142、#137 均 CLOSED。直接下游 #162、#164、#194 仍 OPEN。完整存储管理页面由 #198 承接，当前公共导航 `/storage` 尚不可用；没有用虚构页面或假接口补齐。

- 新增读取/创建 `GET/POST /api/storages/:id/cors-tests` 和 `POST /api/storages/:id/cors-tests/:probeId/complete`。所有者鉴权、来源限制、配置 revision 和通过的连接报告均沿用真实服务边界。
- 示例来自当前站点 origin，使用正式上传/读取提供方的 PUT、GET、HEAD 签名和必需 `content-type`。不自动修改 Bucket 配置。
- 创建签名前持久登记随机确切 Key。只有三次浏览器请求可读成功、服务端字节核验和删除均成功才记录 passed。响应错误、opaque、缺失方法、内容不同或清理失败均不能通过。
- `invalidateS3Cors(tx)` 供 #194 的站点设置事务组合使用。origin/revision 不符和 A→B→A 的旧回包均不能恢复通过；该函数已经过事务集成测试，但尚无后续设置页面消费入口。
- 未完成探测由到期维护或重启恢复接管；删除失败保留确切 Key、错误和引用，复用已有手动重试入口。已知对象清理成功释放引用；迟到对象扫描由 #164 承接，本次没有宣称扫描已实现。
- 迁移 `0014_silent_shiva.sql` 新增配置 CORS 报告及 probe 的 origin、invalidated、expires_at。没有新依赖；复用 AWS SDK、Drizzle、现有探测维护实例和 React Query。
- `/settings/storage/:id` 提供受所有者会话保护的 CORS 页面，复用 OwnerShell、AdminShell、SessionControls。正式按钮调用生产 hook 与浏览器传输；提供示例复制、复制失败的完整可选文本、配置来源导航、检测结果、清理状态和重试。当前 revision 未通过连接测试时禁止开始；停用的存储仍可预先检测，不新增 enabled 门槛。

## 首轮后端与协议证据（UI 接入前）

环境为 macOS arm64、Node 24.18.1、pnpm 11.19.0，使用现有 Ego Lite、唯一 TaskSpace 1。真实服务轮次使用 Next.js 开发服务和独立初始化数据库 `.data/issue-158-preview/data`，站点 origin `http://127.0.0.1:47070`；云端对象均在独立随机存储命名空间，不修改用户预览数据和 Bucket 策略。完整浏览器门禁使用另一个临时生产 Standalone 和空数据库。

[完整命令与环境](./browser-service/checks.json)、[R2/SeaweedFS 浏览器报告](./browser-service/live-origin/storage-cors.json)、[最终对象检查](./browser-service/live-origin/live.json)记录两服务的实际可读 PUT/GET/HEAD、服务器核验与删除、刷新后持久结果，以及确切 Key HEAD 404、前缀对象列表为空。错误 Origin 在创建 probe 前被拒绝。R2 全 Bucket 无锁确认沿用同一目标的已有所有者证据，未要求新增管理权限。

[本地 HTTP 故障夹具报告](./browser-service/fixture/storage-cors.json)覆盖缺少 CORS、删除失败与重试、页面退出后控制持久到期时间并由真实服务维护清理。夹具不验证 AWS 签名，也没有修改云端策略制造失败。真实浏览器脚本调用应用 API 并执行自己的 fetch 流程，**没有点击生产 React 页面或执行其 hook**；不能代替 UI 功能与设计验收。

## 设计读取与批准边界

实施前使用 Figma 技能实际读取设计信息和截图，文件 `74sT9Hrf8G4czcWeTkET5b`。以下节点均读取过，不是只读链接或文字交接：

| 状态     | 桌面 / 手机节点     | 当前结果                                                                                                                                         |
| -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 主页面   | 346:4712 / 346:4807 | [桌面设计原图](./figma/346-4712.png) 1440×1080、[手机设计原图](./figma/346-4807.png) 390×844；浅色。本轮已取得同视口实际页面截图，独立评审通过。 |
| 示例     | 346:4865 / 346:4876 | 已按批准位置接入复制；使用可选 TextArea 保留完整 JSON。                                                                                          |
| 来源错误 | 346:5337 / 346:5326 | 已按批准位置接入打开配置地址，保留当前和配置来源。                                                                                               |
| 失效     | 346:5348 / 346:5361 | 已接入页面，专项生产验证及独立设计对照通过。                                                                                                     |
| 检测中   | 346:4905 / 346:4887 | 已接入页面，专项生产验证及独立设计对照通过。                                                                                                     |
| 成功     | 346:5048 / 346:5030 | 旧等待签名窗口文字按现行 SPEC §7/9.4 调整，不能恢复旧协议。                                                                                      |
| 失败     | 346:5183 / 346:5278 | 已接入页面，专项生产验证及独立设计对照通过。                                                                                                     |
| 清理     | 346:6259 / 346:6272 | 按已知对象清理责任表达状态；已接入刷新及失败重试。                                                                                               |

公共区域必须复用现有 OwnerShell、AdminShell 和 SessionControls。没有改公共导航，也没有增加独立复制的侧栏。通用控件已核对 HeroUI 3.2.6 类型及官方文档，页面使用 Button、Link、Modal、CloseButton、TextArea、Card、Alert 和 Spinner；右上关闭与焦点恢复遵循交接。

[T-STO-05 的设计核对结论](../../tasks/m3-m4-platform.md#dg-storage-对-t-sto-05-的核对结论2026-09-30)明确要求“具体新增操作位置需用户确认，不由实现者自行设计”。以下两个具体方案已于 2026-09-30 获用户批准（“现在批准了，但是 UI 界面只允许你完成 158 这个要求的产品界面，不能超过 158 的边界”）：

1. 在示例 JSON/来源说明下方、原返回按钮上方增加 48px 描边按钮；复制失败时在按钮前保留错误与完整可选文本。影响示例及来源错误四个节点的操作区域高度。
2. 在 #198 编辑页不存在期间，以 `/settings/storage/:id` 直接承载已设计的 CORS 页面；管理与返回入口显示尚未开放，公共存储导航仍不可用。本页不增加配置列表或编辑能力，后续由 #198 承接完整管理入口。

**本轮设计结论：独立评审通过，人工验收待用户完成。** [设计评审记录](./design-review.md)包含 16 个实际读取的 Figma 节点、同视口真实页面、逐项对照结论、修前证据与本轮修复结果。不是以源设计截图或功能断言替代视觉验收。

## 本轮 UI 实施与验证（批准后）

本轮只开放 #158 的 CORS 检测页面。成功页仅表达配置来源检测通过，不把 #162 的上传链路写成已启用；没有引入存储列表、配置编辑、站点设置或扫描器。管理与返回存储管理的入口保持“尚未开放”。清理弹窗的“返回直传设置”在本页内部返回配置说明，可重新查看示例和发起检测。

[专项生产报告](./ui/focused/storage-cors.json)最终通过。浏览器实际点击正式 React 页面，调用生产 `useCorsTest` / `runCorsSample`，未用另写的 fetch 主流程替代。覆盖五种宽度与浅深色，以及加载、读取失败、成功、失败、来源不一致、失效、清理、禁用、空/不存在配置边界。不存在、已删除及 Local 配置返回真实 404/400，不能开始探测；未实现的空列表由 #198 承接。

长来源由独立测试数据库中的真实站点设置事务与 `invalidateS3Cors(tx)` 设置，恢复后也必须重新检测；没有访问合成域名。两次应用复制后的系统剪贴板全文与页面 JSON 实际等值；复制被浏览器权限策略拒绝时保留错误及完整选中文本。390×480 下长正文可视区为 y=87–311，操作区从 y=327 开始；真实滚轮滚至正文末尾，关闭和操作保持可见。清理成功后键盘焦点位于“刷新清理状态”，没有落到页面 BODY。

[R2 / SeaweedFS 最终生产页面报告](./ui/live/storage-cors.json)及[对象复核](./ui/live/live.json)均通过。使用与最终构建相同的 Standalone、独立数据目录及随机存储前缀。两服务的浏览器 PUT/GET/HEAD 可读、服务器内容复核和删除、确切 Key 的 HEAD 404 以及最终前缀列表为空均有实际证据。所有连接测试通过的配置均可在停用状态预先检测。

本轮发现并修复：缓存通过后读取失败仍显示成功；复制操作禁用按钮导致焦点丢失；弹窗按钮未铺满、手机只读 JSON 被公共编辑控件字号覆盖；长来源短视口正文压到操作区；清理成功移除按钮后焦点离开弹窗；失效弹窗未在内部说明连接测试前置。代码与布局修正均在本轮完成，未归到后续任务。关键失败证据见 [复制焦点](./ui/regressions/copy-focus-red.json)、[按钮与字号](./ui/regressions/example-design-red.json)、[长来源重叠](./ui/regressions/long-origin-short-red.json)、[清理焦点](./ui/regressions/cleanup-focus/result.json)。独立代码评审及复核见[审计记录](./code-review.md)。

专项测试迭代中，另修正了 Ego selector 写法、网络故障注入和按钮恢复的时序、过渡动画/Toast 截图时机。失败轮次均保留在本地 `test-results/issue-158/ui/production-fixture*`，第 9 轮是整轮通过的专项结果；没有将前几轮部分成功写成整体通过。测试未改变生产查询策略、伪造成功响应或削弱断言。

[实际本地检查记录](./ui/local-checks.json)与[最终构建摘要](./ui/build-summary.txt)保留环境、退出码、用例数量及已有依赖追踪诊断。设计截图和逐项对照由[独立设计评审](./design-review.md#真实截图索引)集中索引。

本轮实际命令（Node 24.18.1 / pnpm 11.19.0，环境与首轮相同）：

| 命令                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 结果                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                                                                                                                                                                                          | 退出 0，锁文件未变更。                                                           |
| `pnpm run lint`、`pnpm run typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                     | 最后一次实现修复后退出 0。                                                       |
| `pnpm run test:unit`                                                                                                                                                                                                                                                                                                                                                                                                                                      | 45 文件、621 项通过。                                                            |
| `pnpm run build`                                                                                                                                                                                                                                                                                                                                                                                                                                          | 最后一次实现修复后退出 0，包含新增产品路由。                                     |
| `pnpm run test:integration --maxWorkers=1`                                                                                                                                                                                                                                                                                                                                                                                                                | 构建后运行，95 文件、863 项通过（516 秒）；之后仅修正 UI 和浏览器验证。          |
| `node .data/issue-158-preview/run-ui-fixture.mjs`                                                                                                                                                                                                                                                                                                                                                                                                         | 最终第 9 轮退出 0，运行已接入正式运行器的相同浏览器模块；私有编排文件未提交。    |
| `EGO_TASK_SPACE=1 node tests/experiments/storage-s3/verify-cors-browser.mjs --config /Volumes/data/project/ariso/.data/upload-v02.json --credentials .data/issue-158-preview/credentials.json --origin http://127.0.0.1:47070 --output test-results/issue-158/ui/live-ui-production --r2-no-lock-evidence 'docs/tasks/evidence/EV-STORAGE-01/README.md records owner confirmation for the same R2 image bucket; reused in the authorized Issue 158 test'` | 最终生产两服务退出 0。文件仅含独立测试凭据，未提交或输出凭据。                   |
| `EGO_TASK_SPACE=1 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/issue-158/ui/full-browser-1 pnpm run test:browser`                                                                                                                                                                                                                                                                                                                                     | 退出 1：导航后 probe 必须仍为 running 的断言失败；修正后第二、三轮 CORS 均通过。 |
| `EGO_TASK_SPACE=1 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/issue-158/ui/full-browser-2 pnpm run test:browser`                                                                                                                                                                                                                                                                                                                                     | 退出 1：CORS 和图库通过，相册末尾第二次登出后未确认会话退出。                    |
| `EGO_TASK_SPACE=1 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/issue-158/ui/full-browser-3 pnpm run test:browser`                                                                                                                                                                                                                                                                                                                                     | 第三轮完整通过，运行器完成隔离目录清理，约 18 分钟。                             |
| `pnpm run format:check`、`git diff --check`                                                                                                                                                                                                                                                                                                                                                                                                               | 最终通过；新增归档 JSON 的格式问题已修正。                                       |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`                                                                                                                                                                                                                                                                                                                                                                                      | 120 任务 / 298 需求、5 项拒绝自测通过。                                          |

[完整回归首轮失败](./ui/regressions/full-browser-first/runner.json)及[具体场景](./ui/regressions/full-browser-first/storage-cors.json)已保留。该轮临时库已由运行器回收，未保存失败瞬间的持久 state，不能断言其具体终态。追加[真实导航诊断](./ui/regressions/navigation-completion-attempt.json)记录到 complete 请求确实被尝试发出，但这一诊断中服务器仍为 running；结合生产代码可确认“导航必然没有完成回报”不是可靠前置，不能将首轮失败直接认定为产品清理缺陷。修正只在测试中明确拒绝生产 POST /complete 请求，其他请求保持真实，断言中断回报确已尝试、原 probe 仍 running，再由实际维护循环处理到期并核对对象为空。未修改生产实现或降低原后端断言。第二轮 [CORS 报告](./ui/full-browser/storage-cors.json)已实际通过，记录到一次失败完成回报、持久 running、同一 probe 的到期失败报告和最终对象为空；第二轮整体随后在既有相册套件末尾失败，见下文。静态设计截图保留第 9 轮同版本布局的 [统一索引](./design-review.md#真实截图索引)，第二轮完整截图留在本地 `test-results/issue-158/ui/full-browser-2/`，避免重复提交相同布局图。[第二轮运行器](./ui/regressions/full-browser-second/runner.json)与[相册失败记录](./ui/regressions/full-browser-second/albums.json)显示：相册主要操作及首次退出/重新登录均通过，衔接上传套件的第二次退出未确认会话已清空，随后等待登录表单超时。此处认证实现与相册测试本次未修改；报告未保存该次会话复核 HTTP 响应，不能断言原因或宣称已修复。按范围约定只记录，第三轮原样重跑，不修改相册/认证产品逻辑或放宽检查。第三轮 [相册报告](./ui/full-browser/albums-third.json)已实际通过，包括此前失败的登出衔接；这是原样重跑未重现，不是问题已修复的证据。第三轮[完整运行器](./ui/full-browser/runner-third.json)最终 passed，所有身份、M2、交互、连续性、CORS、图库、相册、上传及上传轮询检查均通过；[第三轮 CORS 明细](./ui/full-browser/storage-cors-third.json)再次保留同一强断言和最终清理证据。前两轮失败原样保留，不把第三轮通过解释为范围外登出问题已修复。没有因本次验证创建 Release、发布镜像或部署。人工 UI 验收仍须由用户执行；PR 保持草稿。

## 首轮代码审计与检查（UI 接入前）

[独立代码审计](./code-review.md)认为已实现范围无未解决的阻断问题。审计发现的 P2（清理重试成功后仍显示历史删除失败）已有先失败后通过的渲染回归；独立复审 45 项通过。审计没有把 API 浏览器证据当作 UI 验收。

本地命令均在独立 worktree 根目录运行，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。环境：macOS 26.6.2（25G83）arm64、Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-32、ExifTool 13.55。

| 实际命令                                                             | 结果                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                     | Node 24 下通过，锁文件未变更。初次误用默认 Node 26，随后已在指定 Node 24 下重跑。                                                           |
| `pnpm run db:generate`                                               | 生成并审查四条 ALTER；最终复查无额外 schema 差异。[输出](./local/db-generate-final.txt)。                                                   |
| `pnpm run format:check`                                              | 初次发现迁移快照/journal 和测试格式问题，修正后完整检查通过。                                                                               |
| `pnpm run lint`、`pnpm run typecheck`                                | 最终均通过。                                                                                                                                |
| `pnpm run test:unit --maxWorkers=2`                                  | 45 文件、621 项通过。[输出](./local/unit.txt)。                                                                                             |
| `pnpm run build`                                                     | 最终退出 0。包含已有原生可选依赖追踪诊断，未当成零告警；[构建摘要](./local/build-final-summary.txt)。                                       |
| `pnpm run test:integration --maxWorkers=2`                           | 首轮 837 通过、26 失败；[失败摘要](./local/integration-first-summary.txt)。修复及重跑见下文。                                               |
| `pnpm run test:integration --maxWorkers=1`                           | 最终构建后完整复跑退出 0，95 文件、863 项通过。[输出](./local/integration-final.txt)。                                                      |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`          | 通过；未下载浏览器。                                                                                                                        |
| `EGO_TASK_SPACE=1 EGO_KEEP_SPACE=1 pnpm run test:browser`            | 首轮登录 429 失败；修复后完整重跑退出 0。[最终运行器](./local/browser-final.json)、[CORS 专项](./local/cors-final.json)。首轮报告继续保留。 |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test` | 120 任务 / 298 需求检查通过，5 项拒绝自测通过。                                                                                             |
| `git diff --check`                                                   | 通过。                                                                                                                                      |

浏览器命令保留原 `NO_PROXY/no_proxy` 并补充 `localhost,127.0.0.1,::1,.localhost`。完整本地日志在 worktree 的 `test-results/issue-158/`，浏览器报告在 `test-results/browser/`；提交日志对一次性初始化码脱敏，摘要保留诊断类型、原路径与结果。

首轮集成的 26 项失败中，25 项来自旧迁移测试的列预期和三份启动夹具遗漏当前 CORS 迁移。现已使用真实 SQL、断言新列默认值及完整迁移顺序，并保留历史数据、回滚和密钥失败断言。迁移聚焦 13 项、启动聚焦 26 项通过；后者经独立 agent 再跑确认。剩余统计用例因原有 5000ms 时限失败，独立聚焦 13 项通过；没有修改该模块或增加超时，降低并行度后的完整复跑 863 项全部通过。

浏览器首轮新增场景紧随真实身份限流测试，直接登录得到 429。已按既有测试方式读取服务端 `x-retry-after/retry-after`，等待完整期限再试；最多六次，最终仍要求 HTTP 200，不清限流数据。[首轮运行器](./local/browser-first.json)与[具体失败](./local/cors-first.json)保留。独立审计通过；完整复跑实际等待 7 秒后成功，新增 CORS 专项与全部既有浏览器流程均通过。此轮没有修改云端协议，R2/SeaweedFS 记录来自前面的真实服务轮次，没有伪称在登录修复后再次执行云请求。

P2 显示问题的[失败证据](./local/cleanup-render-red.txt)和[修复后证据](./local/cleanup-render-green.txt)保留；新断言先因缺少“已删除”失败，修复后通过。不能把单个聚焦测试通过写成完整检查通过。

AWS S3 按现行约定不要求实测，本次未验证。物理设备不在当前要求内；其他浏览器引擎未验证。AMD64/ARM64 镜像与容器留给 Release 流程，本次未创建 Release、发布镜像或部署。PR 保持草稿，不合并、不主动关闭 Issue，不删除分支或 worktree。
