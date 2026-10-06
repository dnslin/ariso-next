# Issue #191 · 分享管理与独立设置保存

本记录对应 T-SHR-02、R-17.1-01、R-17.1-02、R-17.4-01、A-26.10-01、A-26.10-02、A-26.10-06。执行与完成条件仍以 [任务执行约定](../../tasks/execution.md) 为准，界面依据仍以 [设计交接](../../design/handoff.md) 为准。

## 当前交付状态（2026-10-06）

| 项目           | 实际状态                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 前置           | 原生 blocked by #190、#175、#57、#134均已关闭；已读取Issue、评论与原生关系                                                        |
| 工作区         | 创建于当时最新 `origin/main ffecff2e` 的独立管理型worktree；现已整合并发main `03db847c`，仅处理本任务分支，原工作区与其他任务保留 |
| 产品代码       | 列表、设置、相册入口及批量封面已实施；分享代码在并发同步中保持，未替代匿名访客能力                                                |
| 本地检查       | 原基线全量与受影响失败复核完成；并发同步后的实际检查另见文末，不沿用旧构建代替新构建                                              |
| 浏览器验证     | 原基线完整默认流程及全部失败阶段定向复核完成；新 `/settings/api` 消费路由尚未在整合分支验证                                       |
| 独立功能审计   | 用户要求的双角度PR评审及本轮窄修复复审已完成；原P2结构项已解决，新增浏览器回归尚未执行                                            |
| 独立设计评审   | 本次实际核对基线与分享状态终审通过；不扩大为新增API消费路由已检查                                                                 |
| 原型批准       | 2026-10-06用户明确指令“OK，现在按照这个原型进行实施”，第二版已批准；原型数据与响应为模拟                                          |
| Figma同步      | 本次业务与公共局部已真实同步；错误态、Alert、日历及24个通知位置已窄同步并独立回读                                                 |
| 人工验收       | 用户已明确确认验收时UI无问题；随后本轮成功收尾修复的新增回归尚未执行；独立验收预览继续保留                                        |
| 提交、推送、PR | 已提交并推送；[PR #252](https://github.com/dnslin/ariso-next/pull/252) 为OPEN/DRAFT，远端没有检查，不记作CI通过                   |

## 范围与现状

本次包含 `/shares` 列表、相册分享入口、创建/复制、密码、有效期、启停、地址轮换与展示配置独立保存。#190 已实现真实管理 API、严格输入和授权失效规则；本次复用它们。#192 访客画廊与 #193 匿名访问联调不属于本次范围，不把禁用预览入口记作访客能力已完成。

已读取相关分享配置、输入类型、鉴权 HTTP 边界、相册封面身份与图库封面展示路径，以及分享单元/集成测试。修改前 `listShares` 只返回分享配置与相册名称。本次通过 collections 批量聚合与 delivery 轻量封面读取补充公开图片数及真实封面状态，查询数不随行数增长，sharing 不依赖 library，不逐行请求相册。

接口审计确认：未知的新密码结果不能由 `hasPassword=true` 证明；轮换需比较原 token 与回读 token；重复创建会返回现有记录而不覆盖配置；管理 PATCH 当前没有版本冲突协议，不能虚构 409；停用状态下仍须检查实际截止时间，过期启用要同时提交未来期限或清除期限。

## 原型阶段历史记录

以下记录保留当时结果与失败过程。文中待批准、待实施、未验证状态仅指原型阶段；当前交付状态与正式产品结果见上表及文末。

### 第二版设计提案

- 当前可点击入口：<http://127.0.0.1:53524/design-plans/issue191-review/?revision=routing-3>（避开先前已缓存的入口）。
- 真实组件页面：<http://127.0.0.1:53525/shares>。
- [自包含提案与范围](../../../design-plans/issue191-review/PLAN.md)。
- 第一版被用户要求调整，第二版改为普通可选文本地址与复制图标，Card 分区、访问设置 Accordion、展示 ToggleButtonGroup / Switch；桌面并排、手机纵向，各组仍独立保存。
- 当前原型借用实际 OwnerShell、SessionControls、Providers、ToastProvider、主题和字体。公共导航反映现有产品状态，正式实施后才开放分享入口。
- 控件采用 Card、Accordion、Button、Tooltip、Chip、Switch、ToggleButtonGroup、DatePicker、DateInputGroup、Calendar、TextField、InputGroup、TextArea、Modal、Toast。图标来自现有 Lucide，无新增依赖。
- 已检查本地 3.2.6 类型与实际组合；官网 Switch 已更新，原型依照本地版本的 Switch.Content 包裹方式。时间转换和 DST 的正式行为仍遵守 SPEC；原型仅模拟 Asia/Shanghai。

Figma 对照源为 [桌面设置 431:3753](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3753)、[手机设置 431:8415](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8415)、过期启用 `431:4090 / 431:8594`、未知结果 `431:4183 / 431:8687`。实现者和独立设计评审者均实际读取设计信息与截图。新业务结构已获第二版原型批准；Figma同步和产品设计验收分别记录。

| 对照区域       | 实际检查与处理                                                                    | 当前结论                                          |
| -------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| 整页与公共区域 | 1440×1080 浅色与 390×844 手机，复用实际外壳，正文起点、侧栏、品牌、账号、页脚保持 | 原型对照完成；补拍主题稳定且无遮挡的桌面图        |
| 分享地址       | 普通文本、复制图标紧邻地址，长地址完整展示；复制目标44px                          | 原型阶段待批准；随后明确批准                      |
| 访问与展示     | Card / Accordion / 直接布局切换 / Switch，桌面并排与手机纵向                      | 原型设计复审通过；随后明确批准                    |
| 日期控件       | 默认日期目标约36px，经评审改为308px网格与44px Cell，浮层内距8px                   | 360×640 实测全部日期目标≥44px，浮层完整位于视口内 |
| 保存与核对     | 展示错误移到所属卡；同步阻止重复提交，核对时禁用面板内控件，重试也进入忙碌        | 必修项已修正，原型真实操作确认                    |
| 焦点           | 正常关闭回来源；核对期间进入反馈，解除忙碌后回来源；保留弹窗操作标题至退场        | 正常与未知结果启用均检查通过                      |

真实截图位于 `design-plans/issue191-review/`：

- [桌面整页](../../../design-plans/issue191-review/settings-v2-desktop.png)、[手机整页](../../../design-plans/issue191-review/settings-v2-phone.png)。
- [密码展开（深色）](../../../design-plans/issue191-review/password-v2-phone-dark.png)、[未知密码结果（深色）](../../../design-plans/issue191-review/unknown-v2-phone-dark.png)。
- [手机日历](../../../design-plans/issue191-review/calendar-v2-phone.png)、[360×640 日历](../../../design-plans/issue191-review/calendar-v2-360-short.png)。
- [过期启用](../../../design-plans/issue191-review/restore-v2-phone.png)、[长地址手动复制（深色）](../../../design-plans/issue191-review/manual-v2-phone-dark.png)。

## 实际检查

环境为 macOS、Node `24.18.1`、pnpm `11.19.0`、Next `16.3.5`、HeroUI `3.2.6`。使用现有 Ego Lite，沿用同一 TaskSpace `35` / `p1`，没有安装浏览器。

| 实际命令或操作                                                                                | 结果与限制                                                                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`（Node 24）                                                   | 通过                                                                                  |
| `node --check design-plans/issue191-review/surface.js`                                        | 第一版模拟脚本语法通过，不是产品行为验证                                              |
| `pnpm exec next dev design-plans/issue191-review --webpack --hostname 127.0.0.1 --port 53525` | 第二版预览正在运行；类型导入与服务端/客户端边界的初次编译错误已修正                   |
| `pnpm exec tsc -p design-plans/issue191-review/tsconfig.json --noEmit`（Node 24）             | 最终通过；中途发现 Modal.Dialog 类型不接受 ref，改为 Header 实际 DOM 的卸载回调后复核 |
| `ego-browser nodejs`：正常模拟复制，检查普通文本、44px目标、中性通知、页面选择和滚动          | 断言通过。成功结果为模拟，未把它记作真实剪贴板权限检查                                |
| `ego-browser nodejs`：展示模拟保存失败                                                        | 断言错误位于“访客展示”卡，通过                                                        |
| `ego-browser nodejs`：密码断连、再次核对                                                      | 输入和保存按钮在核对中禁用，重试进入忙碌，显示新密码无法确认；通过                    |
| `ego-browser nodejs`：过期启用选择不过期                                                      | 启用与来源焦点断言通过                                                                |
| `ego-browser nodejs`：未知结果启用，键盘 Space 打开与核对后回焦                               | 断言通过                                                                              |
| `ego-browser nodejs`：长地址手动复制                                                          | 完整文本选中断言通过                                                                  |
| `ego-browser nodejs`：360×640 日历                                                            | 动画稳定后全部日期目标≥44px；浮层左17、右343、上12、下375，断言通过                   |

中途浏览器失败没有当作通过：一次开发服务器自动重启期间连接被拒绝；一次布局脚本块加载超时造成服务端静态页面尚未完成客户端接管，恢复同一页面后增加原型就绪标记并等待；一次日期几何断言捕获缩放入场动画，等待真实44px目标稳定后复核。均未创建新的 TaskSpace 绕过失败或跳过断言。

原型阶段产品的 format/lint/typecheck/unit/build/integration、默认全量浏览器入口、新管理场景与真实接口测试尚未执行。430/768视口、完整主题与状态矩阵、真实时间转换/DST、真实复制权限、登录过期与生产数据操作仍未验证。后续只能在实际执行后更新。

## 独立审计

- 接口契约审计者使用 code-review-and-quality，只读核对状态、密码可观测性、轮换、独立 PATCH 和模块职责，未以现有测试文件替代本次实际运行。
- 独立设计评审者重新实际读取 Figma 设置节点并查看真实截图；第二版最终结论为原型设计复审通过。展示失败不可见、核对中重复提交、日期目标不足44px已修正；稳定主题整页与未知结果回焦已补证据。
- 最终产品代码评审、最终产品设计评审、用户人工验收均待正式实施后完成。原型批准也不等于产品人工验收。

预览保留运行，直到用户明确要求停止或清理。当前使用模拟账号，无人工验收真实账号或密码；正式独立测试凭证后续私下提供，不提交到代码或 PR。

## 第二版用户反馈修正（2026-10-06）

用户指出密码显隐图标在输入框外、桌面保存按钮没有与输入框平行，以及从管理列表进入旧版设置。两项都来自原型实现；没有归因于设计规范，也没有更改公共组件或现行 Figma。

| 反馈           | 失败证据、实际修正与检查                                                                                                                                                                                                                                         | 结论                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 密码输入与保存 | 用户实际截图显示图标位于卡片最右侧；改用已有 identity-field 的 HeroUI InputGroup.Input / Suffix 组合。1440×1080浅色实测输入组 `(305,449,378,48)`、保存 `(695,449,88,48)`、图标 `(636,451,44,44)`；图标在输入组内，两项同排对齐。显隐切换后含首尾空格的输入值保留 | 原型行为检查通过                     |
| 手机密码展开   | 390×844深色实测输入组 `(49,501,292,48)`、图标 `(294,503,44,44)`；无横向溢出，保存按钮在输入下方左对齐                                                                                                                                                            | 原型布局检查通过                     |
| 列表进入新版   | 修正前实际页面选择仍为list、iframe仍为surface.html，并显示旧地址文本框。删去静态旧设置渲染；列表正常/过期/停用与创建成功均通过父页面导航进入53525新版                                                                                                            | 真实操作及新版复制图标出现断言通过   |
| 原型参数       | 在列表选择unknown、dark、long后进入设置，地址实际为 `53525/shares?screen=settings&outcome=unknown&dark=1&long=1`                                                                                                                                                 | 响应模拟、主题与长地址参数保留，通过 |

新截图：[桌面密码修正](../../../design-plans/issue191-review/password-v2-desktop-fixed.png)、[手机密码修正](../../../design-plans/issue191-review/password-v2-phone-fixed.png)、[列表返回新版设置](../../../design-plans/issue191-review/route-v2-settings-fixed.png)。独立评审者实际查看三张截图，核对密码组合、导航代码与真实跳转证据，最终功能与设计复审均通过，无剩余必修项。

实际命令为 Node 24 的 `pnpm exec tsc -p design-plans/issue191-review/tsconfig.json --noEmit`（通过）、`pnpm exec prettier --write`（本次原型源文件与两份记录）、`node --check design-plans/issue191-review/surface.js`（通过），以及同一 Ego TaskSpace 35的真实密码与跳转操作。`node docs/tasks/check.mjs` 通过，120项任务、298项需求，无缺失编号或环路。一次浏览器调用在iframe导航期间丢失上下文；随后跳转断言失败，实际读取发现浏览器仍使用旧index/surface脚本。核对服务端新文件后，仅对当前页执行 `Page.reload({ignoreCache:true})` 并等待新版控件出现，受影响跳转检查通过。没有清除用户整个浏览器profile的缓存或会话。

上述结论当时仅适用于待批准原型。该时点新设计批准、Figma同步、产品实现、产品验证和最终人工验收均未完成；分支尚未提交、推送或创建PR。

## 用户再次报告旧页：预览缓存修正（2026-10-06）

用户提供两张真实截图，同一入口中“分享设置”显示新版，但在“管理列表”点击管理仍显示旧地址文本框。上轮只在实现者测试页强制刷新后验证，没有处理用户仍可加载旧index与surface脚本的情况；上一轮原型修复结论在这条用户路径上不充分。

服务端源文件已删除旧设置，但 `python3 -m http.server` 对入口和脚本没有发送缓存策略。Node 24实际HTTP断言取得失败证据：脚本响应200，`cache-control=null`，要求 `no-store` 的断言失败。

本轮仅修正预览加载，不改变UI方案或产品代码：

- 新增 `design-plans/issue191-review/serve.py`，复用Python标准库HTTP服务，对静态响应发送 `Cache-Control: no-store`。核对原53524进程的启动命令与工作目录属于本任务后，在相同地址替换为 `python3 -u design-plans/issue191-review/serve.py`；53525的Next原型仍保留。
- 父页面的iframe地址与列表脚本引用使用明确的 `revision=routing-3`，使新入口首次加载不会使用旧URL对应的已缓存文件。当前入口为本页上方链接；仅在新入口普通刷新即可。
- Node 24的HTTP断言重新检查入口、列表HTML及脚本，全部200且 `cache-control=no-store`，通过。
- 同一Ego TaskSpace35/p1普通打开新入口，再用普通 `page.reload()` 后检查列表正常/过期/停用和创建成功。每项都核对父页面选择值、新版53525地址及真实新版复制图标出现，全部通过；本轮未使用 `ignoreCache` 或清除浏览器缓存。
- [本轮真实页面截图](../../../design-plans/issue191-review/route-v3-no-cache.png)。密码修复和业务视觉没有新变化，沿用前次两端设计对照。
- 独立评审者只读核对这三份加载修改，并实际查看本轮截图；结合普通打开、普通刷新与HTTP断言，功能审计通过，无剩余必修项。未重复运行检查；此结论仅针对原型加载。
- Node 24执行 `pnpm exec prettier --check design-plans/issue191-review/index.html design-plans/issue191-review/surface.html docs/verification/sharing-191/README.md`，通过。

已打开的旧页面仍持有旧脚本，本轮提供新入口来加载替换文件，不声称服务端修改会自动替换浏览器中已经执行的代码。该时点设计批准、产品实施与PR状态仍待完成，预览继续运行供审阅。

## 第二版批准与正式实施（2026-10-06）

用户在缓存与布局修正后明确回复“OK，现在按照这个原型进行实施”。批准范围是第二版设置布局与交互：普通可选地址和复制图标、Card/Accordion分区、桌面并排/手机纵向、InputGroup内显隐图标与桌面对齐保存、直接选择展示格式、过期恢复选择期限、原页中性成功通知、未知结果只读核对。原型批准不代替正式产品人工验收。

正式路由为 `/shares` 管理列表与 `/shares/{albumId}` 设置，相册更多入口携带 `?from=album`。#192访客页面仍未实施，预览保留禁用说明。正式检查结果记录如下，原型测试不作为产品测试结果。

## 正式产品实施与检查

实施边界为分享管理页面及其真实管理接口消费，不包含匿名画廊或匿名查看器。新增列表 DTO 仅含封面消费所需身份、显示名、状态及缩略图地址，不带完整图片、版本或任务对象。设置中的未知操作快照只保存本次提交字段和核对所需原 token，密码原文不留在核对快照。沿用 #190 实际 API，不建立兼容接口或假冲突协议。

- `/shares` 支持真实搜索、20/40/80分页、公开图片数、封面及访问/启停/到期状态；公共导航开放，既有路由继续复用 `OwnerShell`。
- `/shares/{albumId}` 支持创建、复制与完整地址手动复制、设置/清除密码、指定时间/不过期、启停、过期重新启用和轮换地址。地址为普通可选文本，复制图标44px。成功用现有中性通知，页面、选择和滚动保留。
- 密码、期限、展示分别保存。展示 PATCH 只包含实际改动的 layout/showName，其他标签页修改不被重写。日期使用已有国际日期库，按实际 IANA 站点时区显示与转换；夏令时重复时间必须选择具体一次，跳过时间拒绝，修改站点时区不改变已存 UTC 时刻。
- 网络失败、5xx或不可读取的成功响应先 GET 回读，不自动重复 POST/PATCH。新密码即使 `hasPassword=true` 仍无法证明已应用；轮换必须比较原 token。轮换尚未核对时禁用复制旧地址，读取失败可重试读取，不能以“结束核对”绕过这一未知状态。
- 401 清理当前用户缓存后回登录，登录保留真实返回路径；404明确反馈目标消失。弹窗、异常反馈、来源被禁用或移除时均有实际焦点目标；请求卸载时取消。

环境为 macOS、Node24.18.1、pnpm11.19.0、Next16.3.5、HeroUI3.2.6。根冻结安装已执行；schema未变化，无迁移。以下保留初次失败和定向复核，未将失败命令记为通过。

| 实际命令                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 结果与处理                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 通过，锁文件未变。                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm run format:check` / `pnpm run lint`                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 全量最终通过。初次发现原型生成目录参与lint及原型配置匿名导出；仅按现有实验目录方式排除生成文件并修正配置。未排除产品源码。                                                                                                                                                                                                                                                                                                                                   |
| `pnpm run typecheck`；最终 `pnpm exec tsc --noEmit --project tsconfig.json`                                                                                                                                                                                                                                                                                                                                                                                                                   | 通过。首次 ModalRoot 不接受遮罩属性，读取本地类型后将属性放到正确的 Modal.Backdrop。                                                                                                                                                                                                                                                                                                                                                                         |
| `pnpm run test:unit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 104文件1430测试。首次1428通过、2个浏览器运行器子进程用例超时；未改超时/断言。                                                                                                                                                                                                                                                                                                                                                                                |
| `pnpm exec vitest run --project unit tests/unit/runtime/browser-runner.test.ts --testNamePattern 'accepts suite (album-cover\|tags) and its only undefined'`                                                                                                                                                                                                                                                                                                                                  | 仅复核上述2失败用例，2通过；其余未选用例已在全量通过。合并证据覆盖1430测试。                                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm run build`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 最终优化构建、Next类型及standalone打包通过；构建无需部署密钥/数据库。构建仍输出既有跨平台模块、source map 与 `@opentelemetry/api` 的追踪提示（#190日志也有），命令实际退出0；本地启动、鉴权及图片真实运行另有验证，未声称消除这些提示或补入兼容层。                                                                                                                                                                                                          |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 首次152文件1479测试中142文件1456通过；10文件失败含16失败、7因setup失败未执行。实施者误将审计修复后的构建与集成并行，部分测试读取正在替换的standalone；另有资源竞争/数据库锁。失败记录保留。                                                                                                                                                                                                                                                                  |
| `pnpm run test:integration --maxWorkers=1 tests/integration/storage/settings-http.test.ts tests/integration/library/base.test.ts tests/integration/library/batch-cleanup.test.ts tests/integration/identity/account.test.ts tests/integration/identity/auth.test.ts tests/integration/identity/setup.test.ts tests/integration/delivery/local-http.test.ts tests/integration/media/recovery-tools.test.ts tests/integration/media/watermark.test.ts tests/integration/media/metadata.test.ts` | 构建结束后只复核10失败文件，138测试全部通过。未机械重跑142个已通过文件，合并覆盖152文件1479测试（含真实工具组）。                                                                                                                                                                                                                                                                                                                                            |
| `pnpm --dir tests/experiments/ui install --offline --frozen-lockfile` / `pnpm --dir tests/experiments/ui run typecheck` / `pnpm --dir tests/experiments/ui run build`                                                                                                                                                                                                                                                                                                                         | 使用本地缓存恢复实验夹具依赖，0下载；实际独立类型检查及构建通过。shell预构建已通过，不重复。                                                                                                                                                                                                                                                                                                                                                                 |
| `node docs/tasks/check.mjs` / `node docs/tasks/check.mjs --self-test`                                                                                                                                                                                                                                                                                                                                                                                                                         | 120任务、298需求通过；5个结构拒绝用例通过。编号和模块归属保留。                                                                                                                                                                                                                                                                                                                                                                                              |
| `EGO_TASK_SPACE=35 EGO_PAGE_LABEL=p1 EGO_KEEP_SPACE=1 node scripts/verify-browser.mjs --suite=sharing-management --only=representative`                                                                                                                                                                                                                                                                                                                                                       | 受影响代表场景最终通过；38布局记录、0运行时/资源错误。初次业务断言通过后独立夹具清理外键顺序错误导致整体失败，修正清理后定向复核，未记初次为通过。                                                                                                                                                                                                                                                                                                           |
| `pnpm run test:browser`，失败子构建恢复后 `node scripts/verify-browser.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                   | 默认全量已完整执行51阶段：48通过，3因下述夹具问题失败；受影响阶段已分别定向复核通过，原全量失败结果保留。首次shell构建通过，UI实验夹具缺自身依赖导致预构建失败；该目录冻结离线安装（0下载）后只复核UI build，接续默认无suite/only的完整运行器。默认既有14业务阶段和新增sharing-management均在全量计划，另有初始化/公共/隔离界面等入口阶段，参数按所属场景限定。原始默认状态归档于 [browser-default.json](./product/browser-default.json)，未替换其失败结果。 |

默认全量在既有查看器夹具准备中发现失败：`original.png` 仅作渲染模板，位于活动 storage namespace 却未注册为对象，批量SQL后再次读取时已消失。实际核对该namespace扫描已通过、模板无引用；已把渲染源和中间图移到独立测试数据目录的 `viewer-source-fixtures`，真实版本、对象记录和所有行为断言保持。后台扫描策略未改，原默认调度顺序未改。全量失败报告保留，已实际单独复核全部查看器场景：`--suite=viewer` 的 full 阶段通过20组真实检查、27布局，临时目录已移除；默认library主业务39组此前已通过，两次证据组合覆盖该失败阶段。原默认报告保持failed，不把后续复核改写为首次通过。 随后的上传主流程在“停用默认存储后暂无可用存储”等待超时：实际页面显示“默认存储缺失或已停用，请明确选择可用的存储”，只读数据库核对发现失败seed留下启用的 `issue185-storage`，实际产品提示与当时存储集合一致。该失败及快照保留，已在独立干净夹具实际复核 `--suite=upload-regression --only=main`，16组真实上传检查及共用外壳检查全部通过、临时目录已移除；已通过的轮询/输入/提交不重复。

分享套件首次默认执行完成代表矩阵后，在行为阶段的长地址夹具失败：测试把 `public_url` 从HTTP改为HTTPS，实际认证cookie协议条件变化导致登录失效，设置就绪等待超时。该失败报告及已完成代表断言保留；夹具改为同一HTTP协议下的合法长地址，不改产品认证策略。后续仅补跑未完成的behavior/recovery，代表部分不重跑。字段边界随后取得真实失败证据并修复，最终 recovery 定向复核通过，见下文。 behavior首次定向复核又发现日历定位使用严格名称“打开日历”，实际HeroUI可访问名称为“打开日历 截止时间”；按其真实aria-label修正定位，保留失败报告，未改产品名称、超时或行为断言。该失败时已完成4组真实操作；顺序依赖的behavior链最终完成并通过，结果如下。

最终分享定向流程均实际通过：`EGO_TASK_SPACE=35 EGO_PAGE_LABEL=p1 EGO_KEEP_SPACE=1 node scripts/verify-browser.mjs --suite=sharing-management --only=behavior` 为8组行为/36布局；相同前缀的 `--only=recovery` 为10组行为/44布局，首次behavior/recovery复核时代表输入未变，未重复；随后密码字段布局和本页通知位置改变，再实际定向复核representative，最终38布局/23图通过。新增浅桌面、深手机真实复制时通知仍可见、底栏无遮挡，并实际返回列表。原型截图不代替这些真实页面与接口验证。过程还修正了测试切换视口时未关闭日历浮层、独立测试站点的历史主题设置与布局测量选择到错误卡片的问题；未改产品主题行为、超时或削弱44px、回焦与提交断言。详细元数据见 [behavior.json](./product/behavior.json)、[recovery.json](./product/recovery.json)。

本地原始日志位于忽略目录 `test-results/issue191-local/`；最终代表报告位于 `test-results/issue191-browser-representative-final/`，此前结果及失败过程仍保留。可随PR查看的真实产品截图已保存于 [product](./product/)，代表元数据见 [representative.json](./product/representative.json)，所有受影响复核的命令/结果见 [browser-focused.json](./product/browser-focused.json)。截图只是对照依据，不代替行为断言；独立设计评审逐项说明实际查看内容。

## 正式独立审计与人工验收

独立功能评审使用 `code-review-and-quality`，结合严格复杂度评审核对调用路径、模块职责、生命周期、最小快照与测试有效性。最终静态审计通过，无剩余必须修复项。审计中本次已修正登录返回路径、404反馈焦点、夏令时重复时间dirty判断、轮换核对失败后旧地址复制等问题；失败测试或真实行为证据与定向验证按实际保留，不弱化断言。实际浏览器和设计结论另记。

独立设计结论见 [设计评审](./design-review.md)，Figma实际写入与截图核对见 [Figma同步](./figma-sync.md)。原工作基线上的实际状态终审已通过，Figma终稿也已独立回读；新增API消费路由的未验证状态另列，不由旧结论代替。用户人工验收尚未完成，PR保持草稿。

人工验收预览为 <http://ariso-191.localhost:53526/shares/issue191-preview>，独立本地数据库、图片与测试所有者账号；凭证仅私下提供，不提交代码、PR或公开日志。可检查管理列表、普通设置、未创建分享与过期分享；对照获批第二版布局、密码图标/保存排列、复制反馈、独立保存及过期启用。预览保持可用直到用户明确停止或清理。

物理手机、软键盘、非零安全区实测按执行约定的2026-09-22调整不作为本轮必需项；匿名#192/#193、现场云存储与Release容器/双架构不在本次实现或日常验证范围。尚未执行的项目保持未验证，不据此关闭关联需求或Issue。

### 正式状态对照发现与修复

独立设计评审实际查看连续复制操作的手机图，发现上一次成功通知覆盖下一次Clipboard拒绝弹窗的“完成”按钮，失败图保留为 [浅色](./product/sharing-management-copy-manual-light-390-before.png) / [深色](./product/sharing-management-copy-manual-dark-390-before.png)。来源是本页通知生命周期，未归因于公共设计规范。读取本地HeroUI 3.2.6的toast类型与退场实现后，仅保存本页通知ID，打开本页弹窗、替换通知和卸载时关闭该通知，不清全局队列、不改公共布局。连续操作的新浏览器检查已通过：手机浅深色“完成”按钮中心命中正确、上次通知已关闭，实际点击关闭后回焦；独立设计者实际查看两图通过。

真实字段边界取得修前证据：创建密码129 ASCII时0 POST、完整输入保留，但文字落到期限之后且密码缺错误边界；普通密码129时0 PATCH、aria-invalid已真、可见红色outline/box-shadow已存在，问题是错误文字不在TextField内（原borderColor测量不代替可见边界）；过去期限时0 PATCH、输入/保存值保留，但aria-invalid为假且日期缺错误边界。对应原图在product下以`-before.png`保留。

本次修复将密码错误归入TextField/FieldError，将日期错误归入DatePicker/FieldError及aria-invalid，使用明确的dialogPassword/dialogExpiry，不把普通HTTP模态错误染到所有字段；显式danger边框沿现有主题。主密码桌面grid固定输入/保存同一行，错误在输入下方，手机仍纵向。不设原生maxLength128，以保留Unicode码点规则。forever模式收到已知HTTP错误仍有组内可见说明。新类型检查发现FieldError不接受自定义role，已按本地组件类型移除，使用成熟字段描述语义。字段与通知修复后的 `pnpm run build` 已通过，Next类型与standalone打包完成。最终 `--suite=sharing-management --only=recovery` 通过10组实际行为、44条布局，确认字段错误、输入保留、过去日期0 PATCH、不过期HTTP400错误可见以及未来日期启用的单条组合PATCH。独立设计者已实际查看对应两端浅深色状态并通过，详见 [recovery.json](./product/recovery.json)。

字段/通知/查看器夹具修改后的独立功能窄复审已完成：明确错误字段、不过期请求失败可见、输入与保存布局、通知仅按本页ID关闭与卸载清理、测试中间图移出业务清理命名空间均通过静态审计，无剩余必须修复项。HeroUI通知仍有默认退场动画，静态调用close不代替连续弹窗点击的实际复核；该项由新浏览器记录承担。未机械重复单元/集成、未改其超时或断言。

成功创建后的实际点击又发现通知覆盖固定底栏“返回相册”：旧通知离底24px，按钮中心命中Toast。来源为本路由共享通知位置，已将 `Providers` 的既有处理设置页100px避让仅扩至 `/shares/` 设置路由，其他路由分支不变。最终构建 `build-final-toast.log` 已通过（BUILD_ID `BCb8OIZHb0nV7n0wwVnYq`）；浏览器严格要求通知仍可见，确认按钮中心无遮挡，实际点击返回来源相册。对应 [实际桌面图](./product/sharing-management-created-return-with-notice-dark-1440.png) 保留通知与底栏同屏，未手动关闭通知规避。

最终共享通知条件的独立功能窄复审通过：仅 `/shares/{albumId}` 应用既有100px避让，列表及其他路由分支保持，未增加抽象；辅助说明保留关联并去掉Issue编号。评审者实际核对 `behavior.json` 的通知可见/命中断言与真实返回行为，未机械重跑检查。

验收预览最终只读浏览器smoke已通过：正常登录、1440桌面真实地址与禁用预览的辅助说明均可见。专用邮箱在该私下页面可见，因此没有归档该页面截图；公开设计图均来自独立测试夹具。账号凭证不进入仓库。Ego已执行一次 `task.finish({keep:['p1']})`，保留验收预览并停止自动浏览器操作；恢复此页自动操作需要用户明确指令“继续浏览器验证”。构建成品、独立数据、图片与密钥均保留，预览服务继续运行。

## 推送前并发 main 的整合（2026-10-06）

最终fetch发现 `origin/main` 已由 `ffecff2e` 推进到 `03db847caf0ddf28a01309fa9ee59c2bfc809a54`，包括 #249 GitHub实验和 #250上传Token。先保存本次实现提交 `09b55067`，再在本任务分支整合；没有合并远端PR、修改本地main或清理其他工作区。

四处冲突已保留双方：设计交接两份独立批准记录、分享/API登录返回测试、两个suite的全部定向组合、recovery参数的所属边界。实现同时保留分享真实入口与API设置activePath；默认business阶段保留原14项并加入分享，Token→同数据目录重启→账号由main现有 `runIdentityManagement` 协调器在末尾执行，不重复加入阶段表。新Token/GitHub/鉴权/依赖文件原样保留。独立审计已实际读重叠实现与调用链，冲突后静态复审通过。

已实际执行冻结安装（锁文件仅将既有同版API key库从dev移到production）、完整lint/typecheck及4个受影响unit文件；后者231测试通过。新构建已通过，再顺序执行 sharing生产HTTP与runtime健康/迁移集成，3文件25测试通过。原全量单元/集成及浏览器记录对应上述原基线；不把其测试总数冒充更新后main的全量总数。

浏览器已完成并交还。新增 `/settings/api` 在整合分支上的公共菜单/设置分类/两端主题对照尚未执行；main的Token自身证据不代替本次分享入口变化后的消费验证。按实际Ego停止边界，不自动claim已交还空间；需要用户明确“继续浏览器验证”后，沿用TaskSpace35补查受影响公共路由并完成必要设计窄复审。离线整合、提交推送与草稿PR继续按已获授权推进。

并发整合后的实际命令与结果（Node24.18.1 / pnpm11.19.0）：

| 命令                                                                                                                                                                                                                 | 结果                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                     | 通过，既有同版依赖分类更新，无新增本次依赖                           |
| `pnpm run lint` / `pnpm run typecheck`                                                                                                                                                                               | 均通过                                                               |
| `pnpm exec vitest run --project unit tests/unit/identity/return-to.test.ts tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-runner.test.ts tests/unit/runtime/browser-identity-management.test.ts` | 4文件231测试通过                                                     |
| `pnpm run build`                                                                                                                                                                                                     | 优化构建、类型及standalone打包通过，BUILD_ID `ASMe18YfaC_LNQM2K-vxK` |
| `pnpm run test:integration --maxWorkers=1 tests/integration/sharing/production-http.test.ts tests/integration/runtime/health.test.ts tests/integration/runtime/migrations.test.ts`                                   | 新构建后顺序执行，3文件25测试通过                                    |

完整 `pnpm run format:check`、`node docs/tasks/check.mjs` 与 `node docs/tasks/check.mjs --self-test` 也已通过，后两项分别为120任务/298需求与5个拒绝用例。

命令日志在 `test-results/issue191-local/main-sync-*.log`，可提交的概要为 [main-sync.json](product/main-sync.json)。验收预览也已刷新到此新成品，独立数据与密钥保留；新构建的服务健康检查通过，其新增API消费页面仍未取得本轮浏览器/设计对照，不据服务健康改写为UI已验证。

## 远端交付

实现提交 `09b55067`、并发整合提交 `e7f8af23` 已推送到 `codex/issue-191-sharing-management`。[PR #252](https://github.com/dnslin/ariso-next/pull/252) 已创建并附到本任务，base为main，Issue #191保持开放。创建后的实际 `gh pr view 252 --json ...` 回读为OPEN、isDraft=true、MERGEABLE/CLEAN、base `03db847c`，见 [创建时状态](product/pr-created.json)。`gh pr checks 252` 输出no checks（该CLI退出1）；没有远端检查，不记作CI通过，也不等待不存在的工作流。

该次交付时剩余项为新增API消费路由的浏览器/设计补查及用户人工验收。用户随后已确认验收时UI无问题，见下方本轮记录。已提供具体恢复浏览器的授权问题；未收到明确回复前不接管已交还空间。当前保留草稿、分支、worktree与预览；没有合并PR、关闭Issue、发布或部署，也未清理上述资源。

## 人工反馈后的双角度PR评审（2026-10-06）

用户明确表示“我手动验证的UI没什么问题”，并要求分别使用 `code-review-and-quality` 与 `thermo-nuclear-code-quality-review` 的两个agent评审PR。此确认记录为验收时成品 `ASMe18YfaC_LNQM2K-vxK` 的人工UI结果，不扩大为新增API消费路由的自动浏览器/设计补查已完成，也不冒称用户已验证随后新增的丢失响应回归。原始 `main-sync.json` 等历史报告保留当时状态。

两位评审独立锁定 `03db847caf0ddf28a01309fa9ee59c2bfc809a54..4602b47c4749138d9f0ff0a35a9db769d72ff3fb`，实际读取完整本地差异、相关规格、实现、类型、测试及运行器；没有用GitHub返回的前100个文件代替完整清单。评审者没有修改代码、操作浏览器、重复测试或读取专用验收凭证。

| 评审者与技能                                                                  | 实际关注                                                                      | 初审结论                                                                                 |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pr252_correctness_review` / GPT-6.1 Sol / `code-review-and-quality`          | 需求、独立PATCH、时区/DST、未知响应、资源生命周期、授权、批量查询与测试有效性 | 无高置信P1/P2功能必改项；交叉核对后将清除密码草稿差异列为可选一致性改进                  |
| `pr252_structure_review` / GPT-6 Astra / `thermo-nuclear-code-quality-review` | 模块职责、确认状态、分支重复、文件规模、类型边界与公共运行器                  | 1项P2结构必改：正常写入成功与GET确认成功重复维护草稿收尾，且已产生差异；其余无必须修复项 |

具体修前证据是 `4602b47c` 的 `use-settings.tsx:203–210` 与 `:262–274` 两条实际路径：已有密码并输入未提交的替换草稿后清除，正常响应会清空草稿；服务端清除成功而响应丢失，GET确认 `hasPassword:false` 后仍保留草稿，返回还提示未保存修改。两位均静态确认该差异；本轮没有取得运行失败截图，不能把静态证据冒称浏览器复现。服务端清除及无自动重新设置始终正确，差异属于本页成功收尾的一致性。

按原实施修复授权，仅新增本地 `finishConfirmed(next, operation)` 收敛已确认操作的草稿处理。直接写入成功与回读确认成功共用；无法确认的新密码仍只 `accept` 真实快照并保留草稿。其他分组草稿、创建只读已有设置、精确PATCH字段及rotate不自动重发保持。未增加状态机、共享框架、依赖或新布局，也不要求新的设计选择。

浏览器场景先补齐再改产品：既有behavior清除增加替换草稿、清空与直接返回断言；recovery新增真实提交后丢失响应、仅一次清除PATCH与GET、清空草稿、其他字段不变及无需丢弃提示返回。新增场景沿原默认全量与定向入口执行，未改共用分发。两位实际检查前后阶段：随后日期重新进入设置，rotate按清除后的当前快照比较，未依赖密码必须存在。

两位对本轮两文件窄差异的独立复审均通过：原结构必改已解决，无新增必须修复项。此结论是代码与测试设计复审；新增behavior/recovery浏览器断言尚未执行，不能记作运行回归通过。Ego仍已交还，用户的人工UI确认和要求离线评审不视为恢复浏览器授权。

本轮实际执行环境仍为Node24.18.1/pnpm11.19.0。`pnpm run lint`、`pnpm run typecheck`、`pnpm exec vitest run --project unit tests/unit/sharing/management-model.test.ts`（1文件8测试）、`node --check e2e/sharing-management.mjs` 及 `git diff --check` 均通过。`pnpm run build` 退出0，优化构建与standalone打包通过，BUILD_ID为 `VLSER5xqfuEBHElfizfY2`；既有Next NFT原生跨平台模块/追踪告警仍存在，不记作无告警。8项模型测试验证原有决策契约，不替代新增草稿回归的真实浏览器执行。日志为 `test-results/issue191-local/pr-review-{lint,typecheck,unit,build}.log`。

独立验收预览已刷新到本轮新构建，实际服务健康检查通过；数据、账号和密钥保留。这是预览进程与HTTP健康验证，没有重新接管浏览器或取得新的页面截图，用户原人工确认仍按验收时成品记录。刷新日志为 `test-results/issue191-local/pr-review-preview-refresh.log`。

本轮完整 `pnpm run format:check` 与 `node docs/tasks/check.mjs` 也已通过，后者为120任务/298需求。日志为 `test-results/issue191-local/pr-review-{format-check,task-check}.log`；记录补充后的本文格式另作定向核对。

本轮未改变服务端、依赖、数据库或共用运行器输入，不机械重跑无关全量及集成测试。剩余浏览器项为新增清除草稿behavior/recovery场景与原 `/settings/api` 消费页面补查；恢复仍需用户明确指令。PR保持草稿，分支、worktree和独立预览保留。
