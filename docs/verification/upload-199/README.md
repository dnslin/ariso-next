# T-UP-06 / Issue #199 实施记录

2026-10-09（Asia/Shanghai）。关联 [Issue #199](https://github.com/dnslin/ariso-next/issues/199) 与 [草稿 PR #269](https://github.com/dnslin/ariso-next/pull/269)。依据 [任务卡](../../tasks/m3-m4-platform.md#t-up-06-openapicurl-示例与上传用法页)、[SPEC-upload §10](../../specs/SPEC-upload.md#10-通用上传-api)、[设计交接](../../design/handoff.md)及[执行约定](../../tasks/execution.md)。保留 R-8.4-08、R-23.4-01、A-26.3-08 和 upload/identity 模块边界，没有改写冻结 PRD。

公开规范、共享 curl、所有者用法页和 Token 入口已实现。用户明确批准表格、复制图标、删减副标题与 Tips 原型后实施，并已实际同步 Figma。独立质量评审通过；完整浏览器流程保留失败，最终用法页定向检查与独立生产设计评审通过，结果分别见下。**2026-10-09 用户明确确认本次 UI 人工验收通过；默认完整浏览器仍有失败/阻塞，PR 保持草稿。**

## 范围、前置与工作区

通过 gh 读取正文、评论和原生 blocked_by/blocking：#199 OPEN、无评论，直接前置 #167/T-UP-05、#57/T-UI-01、#130/DG-API 均 CLOSED，没有 blocking 消费项。前置关闭没有替代本次检查。实施前读取公共接收/等待/错误映射、身份、站点/上传设置、实际 schema、测试、配置与默认运行器。

原工作区 `/Volumes/data/project/ariso` 保留。更新远端，从 `origin/main` 的 `2ba0a60e71b5fff773229b62f2c6380fe3435f9b` 创建管理型隔离 worktree `/Users/dnslin/.codex/worktrees/issue-199-upload-usage/ariso`，分支 `codex/issue-199-upload-usage`。未合并、关闭 Issue、发布、部署、删除分支/worktree 或停止验收预览。

## 实际实现与验证调用链

- `src/server/upload/openapi.ts` 使用已安装 Zod 4.6.2 的 `toJSONSchema(target: openapi-3.0)`，复用运行时输入、结果和错误 schema。OAS3.0.4 仅公开 `POST /api/upload`：重复 multipart 数组、Bearer 权限、13 种实际 HTTP 状态、可空 imageId/actualVersion、真实版本、private 权限、900 秒等待与重发风险。override 仅移除不适用的 contentEncoding、补齐 nullable enum；没有新依赖、通用转换器或公开轮询/幂等键。
- `GET /api/openapi.json` 无需凭据，每次读取当前 site.publicUrl，no-store；未初始化返回409/SITE_NOT_INITIALIZED。不发布管理/存储秘密。静态生成文件使用相对 server `/`，不会把50MiB规范默认值冒充当前站点限制。
- `scripts/generate-upload-openapi.ts` 复用 Prettier 可重复生成并核对 `tests/unit/upload/openapi.generated.json`；默认 `test:unit` 实际执行生成一致性检查。
- `src/shared/upload-usage.ts` 生成最小、完整、未授权及非法参数命令。地址来自当前站点，Token 使用 `${ARISO_UPLOAD_TOKEN}`，完整示例使用重复 albumId/tag 和 shell 单引号处理。没有 PicGo 专用配置。
- `/settings/api/usage` 服务端先验证所有者。页面并行读取真实站点与上传限制；未读到、读取失败或会话失效时不显示可用命令/假上限。实际 HeroUI 单选切换、复制图标、Accordion、三张 Table、Tooltip/Popover 与现行 OwnerShell 组合；登录返回允许列表增加唯一已实现入口。
- `/settings/api` 用真实 Link 替换“尚未开放”占位。往返只保存本次操作需要的滚动数字；读取超过五分钟仍可恢复，返回后消费并移除。未克隆 Token 或图片对象。复制成功保留页面、示例、滚动和焦点，仅中性通知；拒绝后提供完整只读可选文本。恢复成功保留其精确选区并恢复中性边框。
- 标题旁 Tips 保留完整超时/断线核对和重复上传说明；桌面悬停/聚焦，手机点击，Escape/外部点击关闭。使用已安装 HeroUI 原生 `useMediaQuery` 在768断点只挂载对应分支，避免隐藏触发器留下门户；复用浮层公开 triggerRef 对齐标题，未自制定位逻辑。

调用链已逐层核对：`test:unit` → unit 默认文件 → 规范生成/共享命令/返回生命周期；`test:integration` → integration + media-tools → 公开规范实际 HTTP 与真实 curl（usage.test 仅在 media-tools 执行）。`test:browser` → shell/UI 夹具构建 → `verify-browser.mjs` 默认 full → `browser-plan.mjs` → `e2e/upload-usage.mjs`，默认包含所有代表、交互和恢复分支。定向 `--suite upload-usage --only representative|interactions|recovery` 的参数只分配给本场景；现有 suite/only 组合与完整入口单测继续覆盖。Token 默认场景验证实际详情往返，shell-navigation 纳入全部已实现消费路由和本页当前项。

## 真实 curl 与服务

Local 默认集成和 R2/SeaweedFS 手动入口共用 `usage-examples.ts`，执行共享生成器实际命令。真实 Token 经 curl `--config -` 的 stdin，不进入进程参数或共享日志。独立进程、数据库、账号及任务自有命名空间，不改变用户预览数据或 Bucket/CORS 策略。

每个服务验证缺认证401、非法参数400不建资产/任务/标签或暂存文件；最小示例采用当前默认存储和可见性；完整示例在默认存储清空时采用显式storageId，重复相册去重、重复tag匹配/创建。201逐项核对同一真实job、三个保存版本、对象大小与原图字节，private链接拒绝上传Bearer。R2/SeaweedFS各7/7通过，各9个对象删除后再次确认自有命名空间为空。

报告：[R2](live/r2.json)、[SeaweedFS](live/seaweedfs.json)。归档扫描了本机配置的 access key、secret、password/token，无凭据。AWS 按执行约定不要求且未实测，不计通过。

## 获批设计、Figma与实际页面

用户先要求参数/响应用表格，再要求复制图标、删除“用 Token 从脚本上传图片。”、风险说明改 Tips，最后明确“可以 就按照这个去实施 同步更新 figma”。[原型源](prototype/index.html)及[原型审查历史](design-review.md)保留，不把原型模拟复制当作产品剪贴板证据。原型预览3199继续保留。

对应原 Figma 信息与截图均在编写 UI 前实际读取。更新后的节点与19张真实 Figma 截图见[同步记录](figma-sync.md)；主状态248:2137/4061、参数259:1405/3304、响应259:1518/3340、新 Tips984:33083/33890、新复制失败984:33230/33960。原 Token 一次明文失败249:1465/3588只作语义来源，未修改或误搬其关闭语义。

| 逐项对照         | 实际页面证据与处理                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页与公共区域   | [桌面1440×1080浅色](browser/desktop-main.png)、[手机390×844浅色](browser/mobile-main.png)。复用 OwnerShell；业务宽840/358，x264/16，卡片y156/212。原设计的手机“菜单”文字依现行公共 Menu 图标覆盖，不复制占位公共区域。                                                                                                                                                                                                                                                                                                                                                     |
| 示例、字体和控件 | 真实地址/限制，自然换行；水绿代码卡、品牌黄单选、44px Copy/Info，普通说明为简短文字。首次实现使用不存在的primary/secondary色类已修为现行default/accent；库Accordion的border-none导致分隔线不显示，改为局部border-solid。两业务Link恢复原型Regular字重；实际表格单元格固定13px，手动只读命令固定12px/180px，仅此展示框局部覆盖手机普通表单16px规则，未修改公共规则。                                                                                                                                                                                                        |
| 参数与响应表格   | [桌面参数](browser/desktop-parameters.png)、[手机参数](browser/mobile-parameters.png)、[桌面响应](browser/desktop-response.png)、[手机响应](browser/mobile-response.png)。参数5项、响应12项、HTTP13种实际状态，HeroUI表格。400限定重复单值，504限定等待任务超时不会取消已接收任务。                                                                                                                                                                                                                                                                                        |
| 手机完整阅读     | [参数右滚](browser/mobile-parameters-right.png)、[响应右滚](browser/mobile-response-right.png)、[HTTP右滚](browser/mobile-http-right.png)。滚动只在自身容器，首列固定；键盘ArrowRight实测改变scrollLeft，说明完整换行。                                                                                                                                                                                                                                                                                                                                                    |
| Tips             | [桌面](browser/desktop-tips.png)、[手机](browser/mobile-tips.png)。独立审查发现初版双内距与锚点偏差，修为12×16内距、标题左对齐，保留Info触发和完整内容；实际跨断点关闭旧门户。截图等待真实浮层动画结束。                                                                                                                                                                                                                                                                                                                                                                   |
| 复制失败/恢复    | [桌面失败](browser/desktop-copy-failure.png)、[手机失败](browser/mobile-copy-failure.png)、[手机恢复](browser/mobile-copy-recovered.png)。实际权限拒绝触发完整文本，手动框180px；移除原型没有的额外可见Label，保留可访问名称。恢复成功精确选区和焦点保留；边框完成颜色过渡后为中性。                                                                                                                                                                                                                                                                                       |
| Figma源偏差      | 首次同步错误保留gap20/标题1.6/图标18。独立审查核对获批原型和产品，确认真正来源为同步；仅修十个用法业务状态为gap16/1.5/20px。没有修改公共组件或反向改产品。实际重拍全部依赖截图。                                                                                                                                                                                                                                                                                                                                                                                           |
| 其他状态与主题   | [最终用法页报告](browser/reports/usage-final.json)覆盖360/390/430/768/1440、浅深色、390×400、长地址、全部展开及[读取中](browser/loading.png)/[失败](browser/read-error.png)/重试；匿名所有者边界真实307；补充[恢复最终报告](browser/reports/recovery-final.json)实际过期数据库会话，GET设置返回401，用法页移除命令/缓存上限，真实重新登录返回本页。两主题[桌面](browser/session-desktop.png)/[手机](browser/session-mobile.png)分别检查。[公共外壳报告](browser/reports/shell-navigation.json)覆盖全部已实现消费路由。浏览器报告见下。截图数量和无溢出不替代上述设计对照。 |

生产独立评审结论见[设计评审](design-review.md)，同步者的视觉复核没有代替它。2026-10-09 用户已明确确认本次 UI 人工验收通过。

## 环境、命令与实际结果

macOS26.6.2 / Darwin arm64，Node24.18.1、pnpm11.19.0；所有项目检查前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。现有 ImageMagick7、ExifTool、OpenSSL、系统Python和 Ego Lite Chromium152，没有下载浏览器/新增依赖。应用 using-agent-skills、frontend-ui-engineering、vercel-react-best-practices、incremental-implementation、git-workflow-and-versioning、ego-browser、Figma适用技能；独立审查使用 code-review-and-quality，独立设计审查另实际读取 Figma 和真实截图。规则仍只在 handoff/execution 维护。

| 实际命令                                                                                                                                        | 结果与边界                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                | 通过，锁文件未变。                                                                                                                                                                                                                                                               |
| `pnpm run test:unit`                                                                                                                            | UI轮默认全量145文件、1851/1851通过，包含默认生成检查和浏览器分发。随后新增登录返回行为先取得24通过/1失败，再定向返回路径及生命周期26/26通过；不将定向结果写成第二次全量。                                                                                                        |
| `pnpm run build`                                                                                                                                | 最终UI修正后退出0，Next/standalone完成。打包追踪保留其他平台可选原生包及可选telemetry解析警告，不称无警告。                                                                                                                                                                      |
| `pnpm run lint`                                                                                                                                 | 全量通过；后续局部修改执行相应定向ESLint通过。                                                                                                                                                                                                                                   |
| `pnpm run typecheck`                                                                                                                            | 最终Tips/标题ref修正后通过。                                                                                                                                                                                                                                                     |
| `pnpm run format:check`                                                                                                                         | UI轮全量通过；最终改动文件与证据定向Prettier检查通过。                                                                                                                                                                                                                           |
| `pnpm run test:integration --maxWorkers=4`                                                                                                      | 后端轮186文件1765/1765通过；UI轮全量1763通过/2失败：畸形multipart ECONNRESET、水印错误日志尚未出现。未跳过、弱化或删除断言。                                                                                                                                                     |
| `pnpm exec vitest run --project media-tools tests/integration/upload/api.test.ts tests/integration/media/watermark-http.test.ts --maxWorkers=2` | 最终按顺序复跑23/23通过。一次错误地与重构建并行的复跑因临时standalone缺失14失败，记录为执行错误，不当作功能结果；已在构建后纠正。全量失败仍单列。                                                                                                                                |
| `node tests/integration/upload/usage-live.ts --config /Volumes/data/project/ariso/.data/upload-v02.json`                                        | R2/SeaweedFS各7/7通过，清理各9对象，后续仅UI改动未机械重跑。                                                                                                                                                                                                                     |
| `node scripts/verify-browser.mjs --suite upload-usage --only representative`                                                                    | 实际唯一TaskSpace8/p1。修正测试后代表3报告通过，22个布局、32截图，包含两主题/五宽度/短视口/固定首列/键盘/Tips跨断点。这是早期代表结果；最终完整用法suite重新验证锚点、字号和全部分支，见下。                                                                                     |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`、`pnpm --dir tests/experiments/ui run typecheck`                                    | 通过。首轮默认入口因夹具尚未安装在UI构建停止，没有称浏览器行为通过。                                                                                                                                                                                                             |
| `node scripts/verify-browser.mjs --suite upload-usage`                                                                                          | 最终无`--only`完整定向通过：24布局、36截图、10组检查，实际native最小/完整复制、拒绝后手动选择/恢复选区、Tips断点/锚点、真实配置和返回上下文。[运行器](browser/reports/usage-final-runner.json)、[场景](browser/reports/usage-final.json)。                                       |
| `node scripts/verify-browser.mjs --suite upload-usage --only recovery`                                                                          | 最终仅测试新增会话失效检查，无产品修改/构建输入变化；恢复段6布局、6截图通过，覆盖真实401、重新登录返回和原读取异常。既有完整定向24布局/36截图结果保留，不写成第二次完整定向。[运行器](browser/reports/recovery-final-runner.json)、[场景](browser/reports/recovery-final.json)。 |
| `pnpm run test:browser`                                                                                                                         | 最终默认入口完整结束：73阶段63通过、7失败、3阻塞，整体失败。[原报告](browser/reports/full-runner.json)。用法页实际14px≠13px失败取得证据后已修正，由完整定向恢复；其余既有失败保留。此前主动中断不计通过。                                                                        |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`                                                                            | 通过：120任务、298需求，无缺ID/循环；5个故意非法夹具拒绝通过。                                                                                                                                                                                                                   |
| `git diff --check`                                                                                                                              | 最终提交前通过；本轮四份Markdown的本地文件链接检查通过。                                                                                                                                                                                                                         |

[最终预览报告](browser/reports/preview-final.json)记录1440/390真实表格13px、只读命令12px/180px、native复制与精确选区恢复；14张主状态图全部从最终构建重新采集。恢复报告及加载/失败/失效截图使用默认运行器独立数据。

原始本地日志位于 worktree 的 `test-results/issue199-*.log`；任务归档只保留已脱敏报告和相关真实截图。Release镜像、双架构容器、发布与部署按日常边界未执行，不创建Release。真实手机触控/软键盘/非零安全区依当前执行约定不要求，仍保留未实测事实。

浏览器失败修正：规范servers精确对象断言原缺description，取得真实生产器失败后补全对象；HeroUI单选实际是radio/aria-checked，测试按真实语义修正；长地址夹具原切到https改变认证Cookie前缀导致登录失效，改为有效http长地址，并在管理写入前恢复真实站点origin。未改认证契约或绕过来源验证。实际剪贴板保存后，浏览器清理即使抛错也在finally恢复本机内容，原始错误继续传播。

默认全量失败不能由定向结果覆盖：桌面Token等待旧弹窗脱离、桌面GitHub配置隐藏状态、手机Token消费者遗漏已有“邮件服务”分类、上传设置键盘填写58未落入表单（截图仍57）、旧上传场景公共侧栏巡检等待动画未结算，以及独立图库夹具未观察到短暂loading（实际已503）。相关未修改模块与精确原因的验证边界见[独立审查](review.md)。桌面GitHub的三个后续阶段因前置失败阻塞。新增用法页失败为已修正的13px字号；原始[失败报告](browser/reports/full-usage-before-font-fix.json)保留。全量公共外壳场景已通过，不因旧上传场景的另一处动画等待而误记整个外壳未执行。报告中未随本次归档的既有模块截图文件名，指向本机原始`test-results/issue199-ui-browser-complete`，本次真实UI对照图已完整归档。

## 独立评审、完成维度与人工验收

[质量评审](review.md)覆盖后端、curl、产品UI与默认运行器，当前未解决 Critical/Required均0；独立失败注入确认浏览器异常仍执行本机剪贴板恢复，GC改回五分钟后六分钟返回测试实际失败，恢复副本通过。审查者没有重复已通过全仓检查。[生产设计评审](design-review.md)与[Figma同步](figma-sync.md)分别给结论。

| 完成维度                    | 当前状态                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| 代码实现                    | 公开规范、curl、用法页与Token入口已完成                                                            |
| 本地静态/类型/构建/单元     | 已通过，集成全量两项失败与23/23定向恢复分别保留                                                    |
| 真实Local/R2/SeaweedFS curl | 完成                                                                                               |
| 用法页浏览器                | 完整定向通过；最终新增会话检查所在恢复段通过                                                       |
| 默认完整浏览器              | 完整执行，63通过/7失败/3阻塞；不计全量通过                                                         |
| 独立质量评审                | 完成，无必须项                                                                                     |
| Figma同步与同步者复核       | 完成                                                                                               |
| 独立生产设计评审            | 完成，无必须项                                                                                     |
| 用户人工验收                | 2026-10-09 用户明确确认本次 UI 通过                                                                |
| PR/远端检查                 | #269 OPEN草稿；已推送，gh核对远端head与本地一致。statusCheckRollup及分支run list均为空，不计CI通过 |

本机人工验收预览：[Token列表](http://127.0.0.1:3299/settings/api)、[上传用法](http://127.0.0.1:3299/settings/api/usage)、[公开规范](http://127.0.0.1:3299/api/openapi.json)。独立数据目录 `test-results/issue199-preview/data`，账号/密码只在本机私有凭证文件，不提交到仓库、PR或共享日志。预览保持可用直到用户明确要求停止或清理。

本次 UI 人工验收已获用户确认通过；对应范围为 Token 用法入口和返回滚动/焦点、最小/完整选择及真实复制、Info Tips 两端打开/关闭、两折叠区与手机横向阅读。复制失败/配置读取异常已由独立测试数据和实际故障验证，不在人工预览注入失败开关。设计入口与对应截图见上；默认完整流程仍有失败/阻塞，继续保留草稿；人工验收通过不改写历史检查结果。

## 完整浏览器反复失败的现状说明（2026-10-09）

当前默认入口覆盖跨模块的73阶段，本轮耗时约61分钟。它继续执行尚未修正的旧场景，因此后续业务任务会再次触及这些问题。已确认旧分类断言未纳入“邮件服务”；部分等待依赖短暂加载、弹窗退出或全部有限动画结束。焦点未落入输入框、OAuth隐藏/inert状态的精确根因尚未确定，不能一律标为测试误报。真实实现偏差也会失败，本次14px表格偏差已修为13px并在完整用法页定向检查中通过。

这些跨模块问题在本Issue仅定位和记录，没有统一修复，所以整套检查还没有稳定通过。下一步应集中复现并修正过期断言、等待与状态清理问题，同时区分真实产品缺陷；不能靠增加全局超时、自动重试或删除断言把记录变成通过。本次只更新人工验收与事实说明，不修改范围外产品/测试，不重跑未变化的应用检查。
