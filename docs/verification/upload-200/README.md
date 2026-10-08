# Issue #200 上传限制实施记录

2026-10-08（Asia/Shanghai）。[Issue #200](https://github.com/dnslin/ariso-next/issues/200)，任务 [T-UP-08](../../tasks/m3-m4-platform.md#t-up-08-上传限制独立设置界面)，需求 `R-7.2-01/02`。执行与完成条件遵守 [execution](../../tasks/execution.md)，设计遵守 [handoff](../../design/handoff.md)。

## 范围与实际实现

从 `origin/main` 的 `96212bea` 创建 `codex/issue-200-upload-settings`，使用独立 worktree；原项目目录保持干净。实际读取 Issue 正文、评论（无评论）和原生关系，`blocked_by` #160/#57/#71/#135 均 CLOSED；`blocking` 为空。

上传限制已放入 `/settings/general` 的基本设置分类。复用公共 OwnerShell、站点品牌与账号、SettingsHeading、SettingsCategories、固定底栏和 HeroUI NumberField/Form/Toast。客户端独立读取和保存 `/api/settings/upload`，不调用 site PATCH，不包含站点品牌、处理配置或上传关系选择。基本设置目前只实现本 Issue 的上传限制；其他站点字段由各自任务承接。

- 默认 50 MiB/20/500。正整数 MiB 可安全换算为字节，批次 1–200，队列 100–2000，批次不超过队列。同时传输固定 3。
- 共享 Zod 校验保留每字段首条范围错误。上传自己的 PATCH 合并实际配置并在原事务内校验，422/`UPLOAD_SETTINGS_INVALID` 带 `fields`；未初始化仍返回真实 409，不伪造默认值。
- 保存成功保留原页、输入和滚动位置，恢复操作控件焦点，使用简短中性通知。422 保留输入并聚焦首个错误字段。
- 网络或 5xx 导致结果不确定时只 GET 核对，不自动重复 PATCH。核对失败可重新读取；服务器值不同时明确展示双方并由用户选择。
- 实际 401 保留表单并立即清空上传队列、释放 File/Blob URL。确认保存后更新现有上传 provider 的限制，不重建队列。
- 旧 submission 保存自己的限制快照，新 submission 使用新配置。真实 HTTP、数据库读回和同数据目录的实际 standalone 进程重启取得独立证据。

未新增依赖、兼容层、迁移或冻结 PRD 修改。共享导航的站点设置入口指向基本设置；处理、账号和上传 API 仍通过同一分类导航访问。已有浏览器消费者同步使用真实入口，并保留原业务断言。

## 获批设计与 Figma

用户于本次对话明确批准“基本设置中直接编辑上传限制”的[可查看原型](http://127.0.0.1:52000/index.html)。该原型与产品路由隔离，仅表达设计，模拟保存不计产品验证。原型服务保留运行。

Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的桌面/手机正常 `470:10085/470:10377`、字段错误 `470:10430/470:10724`、批次错误 `470:10779/470:11073`、服务失败 `470:11150/470:11442` 已读取设计信息与真实截图，并同步用户批准的结构。移除返回子页结构和大面积水绿静态说明，保留普通规则文字、独立保存底栏、中性成功反馈。沿用原节点 ID，不修改其他任务或公共组件节点。共享底栏实际为 81px（48px 按钮 + 12/20px 内边距 + 1px 边框），原型初始记录的 80px 是测量错误，已纠正并同步 Figma。

[Figma 写入与截图复核](./figma-sync.md)、[独立设计评审](./design-review.md)记录节点、相同视口截图、整页/公共区域/字段与反馈的逐项对照。此前完整定向验证的正常双主题、响应式、字段错误、恢复和会话失效状态已完成独立截图评审。错误框叠加及范围文案覆盖已修复并复审通过。最新键盘焦点线修复和真实 PATCH 409 新场景尚未取得真实截图，保持未验证。获批页面沿用原型的标题与分类间距 20px，分类和业务内容比现有处理/账号/API 页面下移 20px；已明确记录该差异，未改写其他路由布局。真实手机触控、软键盘及非零安全区按共用执行约定不属于本次必需实测，不记为通过。

## 环境与实际验证

macOS arm64，Node 24.18.1，pnpm 11.19.0；使用已有 Ego Lite TaskSpace 1，没有下载浏览器。浏览器运行器使用一次性账号和数据，人工预览使用另一独立数据目录。凭证仅保存在忽略的本机记录中，不提交到仓库或 PR。

验证调用链：默认 Vitest glob 包含新增 unit/HTTP/进程重启测试；`pnpm run test:browser` 经 `scripts/verify-browser.mjs` 与 `scripts/browser-plan.mjs` 执行新增 `upload-settings` 阶段，默认包含 representative/behavior/recovery/consumers 四组。定向 `--only` 只设置上传自己的 `uploadSettingsPhase`，不改变其他模块入口。

| 实际检查                                                                                                                                                                           | 结果与边界                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                   | 通过，锁文件未变                                                                                                                                                                                                      |
| `pnpm run build`                                                                                                                                                                   | 代码/审计/设计修复后退出 0；Next 与 standalone 完成。存在可选平台依赖追踪诊断，不记为无警告                                                                                                                           |
| `pnpm run typecheck`                                                                                                                                                               | 通过；通知生命周期修改后应用 TypeScript 定向检查通过，最新键盘样式修改后生产构建通过                                                                                                                                  |
| `pnpm run lint`、`pnpm run format:check`                                                                                                                                           | 全量 lint 及最终源文件定向复查通过。最终 format 全量发现一个新 unit 文件格式问题，已格式化；该文件及最后修改的证据定向检查通过                                                                                        |
| `node docs/tasks/check.mjs`                                                                                                                                                        | 120 任务、298 需求检查通过                                                                                                                                                                                            |
| `pnpm exec vitest run --project unit tests/unit/upload-settings.test.ts --project integration tests/integration/upload/settings.test.ts tests/integration/upload/sessions.test.ts` | 初轮 3 文件 48 项通过；新增范围错误回归先失败，修复后 shared unit 4 项通过                                                                                                                                            |
| `pnpm exec vitest run --project integration tests/integration/upload/settings-http.test.ts tests/integration/upload/settings-persistence-http.test.ts`                             | 2 文件 2 项通过；真实 HTTP/旧新快照/进程重启                                                                                                                                                                          |
| `pnpm exec vitest run --project integration tests/integration/upload/settings.test.ts tests/integration/upload/settings-http.test.ts --maxWorkers=1`                               | 最终字段错误映射修改后 2 文件 26 项通过                                                                                                                                                                               |
| 新 upload API、shared schema、browser-plan unit                                                                                                                                    | 3 文件 84 项通过；随后 shared schema 新增回归另行通过                                                                                                                                                                 |
| browser-runner unit                                                                                                                                                                | 新 suite 首轮 182 通过/1 失败，修正 recovery 场景归属枚举；对应归属组正确重跑 23 通过/159 未选中。一次错误 `-t` 全部跳过的运行不计通过                                                                                |
| `pnpm run test:unit`                                                                                                                                                               | 默认首轮 124 文件通过/1 文件失败，1680 项通过/7 超时；仅 7 个失败用例复跑全部通过。保留首轮失败，不称单轮全量通过                                                                                                     |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                         | 默认首轮 168 文件通过/10 失败，1700 项通过/17 超时或启动失败。仅失败项串行复跑 16 通过/1 存储上下文断言失败；读取调用链后按完整 storage/settings-http 文件重跑 7/7 通过，不改代码/超时/断言。不将补跑记成单轮全量通过 |
| `node scripts/verify-browser.mjs --suite upload-settings --only behavior`                                                                                                          | 范围、联合限制、安全字节、Enter 保存、真实 422、刷新、原页通知、旧/新提交快照通过；此前快照 21≠1 的失败保留。实际结束 NumberField 编辑、等到表单值提交后复跑通过，未添加产品延时或数据回退                            |
| `node scripts/verify-browser.mjs --suite upload-settings` 与默认 `pnpm run test:browser`                                                                                           | 此前定向四组通过（51 布局，5 项行为结论，无运行时错误）。默认全量退出 1：22 个报告通过，5 个业务/测试失败，另 1 个报告因用户接管暂停；未执行到上传设置阶段。最终增量及公共入口补跑未执行                              |

默认浏览器详情见 [安全摘要](./reports/browser-default-summary.json)：Token 生命周期被通知遮挡、存储 CORS 等待 alert 超时、图库等待 email 超时、图库批量标签点击目标不可见，以及图片处理测试旧动态入口。旧动态入口已修正，未改动其原断言；其他范围外问题未改写产品实现。没有证明这些失败全部是历史问题。图片处理 settings/recovery、Token consumers 的公共入口补跑尚未完成。

默认流程在 library-copy 收到 Ego Lite “The user has taken control of this task space, so browser commands are paused” 后结束。按实际读取的 ego-browser 技能停止边界，未恢复、换空间或换浏览器；本次对话只提出一次恢复询问。需要用户明确允许恢复 **TaskSpace 1** 才能继续。最终新增焦点线、恢复 GET 精确次数、非零滚动、真实 PATCH409、队列 ID 连续性断言保持未执行，旧 51 布局报告不代替这些断言。

原始初轮与补跑记录：[unit 首轮](./reports/unit-first.txt)、[unit 失败项](./reports/unit-timeout-retry.txt)、[HTTP 与重启](./reports/settings-http.txt)。集成原始日志包含临时初始化码，仅保留在本机；仓库记录结果摘要，不公开凭证。通知测量通过真实 hover 展开 HeroUI 堆叠后执行原点击目标断言，未减弱 44px 门槛，不以展开结果声称折叠状态已实测。

## 独立评审与交付状态

[独立代码评审](./code-review.md)使用 code-review-and-quality，核对需求、模块职责、认证与 Origin、事务、资源生命周期、焦点、错误优先级、运行器默认入口和测试有效性；修复 401 队列释放、错误文案覆盖、错误边框和成功焦点后，当前无剩余必须修复的静态发现。评审不机械重跑实现者已通过的检查。功能与设计评审分别记录，静态结论不代替真实页面验证。

代码完成；本地检查已执行，但默认单元/集成首轮和默认浏览器有失败，补跑证据单独记录；此前完整定向浏览器和对应设计评审通过，最新增量浏览器及设计证据因用户接管尚未完成；用户人工验收未完成。因此 PR 必须保持草稿。Release、镜像、容器、发布和部署不属于日常 PR 验证边界，均未执行。未合并、关闭 Issue 或清理分支/worktree/预览。

## 人工验收

本机独立生产预览：`http://ariso-upload-200-50879.localhost:50879/settings/general`。最新生产构建的健康检查与初始化成功；用户接管后未进行真实浏览器登录，因此登录和人工预览页面仍待验收。独立账号和密码仅在本次对话提供，不写到文档或 PR。预览保持运行，直到用户明确要求停止或清理。

请检查基本设置的三个数字字段、范围和批次/队列关联错误、保存与刷新、保存后原页/输入/焦点/滚动保留、手机及深色主题，并通过分类访问处理/账号/上传 API。故障注入场景由隔离的自动验证记录承接，不修改人工预览数据。

## 提交与远端状态

实现提交 `f3831f05` 已推送到 `codex/issue-200-upload-settings`，关联 [草稿 PR #264](https://github.com/dnslin/ariso-next/pull/264)。实际 `gh pr view` 返回 OPEN、isDraft=true、MERGEABLE；`gh pr checks` 返回 `no checks reported`，statusCheckRollup 为空，没有远端 CI 通过结论，也不等待不存在的工作流。人工验收和停止后的浏览器增量证据开放，草稿状态保持。

原项目工作区保持干净。本任务分支、worktree、原型和独立人工预览保留；未合并 PR、关闭 Issue、发布、部署或清理其他任务。
