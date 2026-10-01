# Issue #171：完整详情与单图操作的部分实施

本次保留 `T-LIB-06` 与原需求编号，未改写冻结 PRD。Issue 完整验收尚未完成，PR 保持草稿，界面仍需用户人工验收。

交付 PR：[草稿 #227](https://github.com/dnslin/ariso-next/pull/227)，分支 `codex/issue-171-image-detail`，实施提交 `c4cfb9139615890305e0662317cb436190c14ebc`。2026-10-02 使用 `gh pr view 227 --json state,isDraft,mergeable,statusCheckRollup` 回读：OPEN、isDraft=true、MERGEABLE、statusCheckRollup=[]。没有实际触发远端检查，不记为CI通过，不等待不存在的工作流。

## 范围与前置

读取 Issue 正文、评论（无评论）和 GitHub 原生依赖。五项直接前置 #77、#170、#153、#66、#131 均已关闭，见 [blocked-by.json](./blocked-by.json)。后置 #179、#185 仍开放，见 [blocking.json](./blocking.json)。分支从当时最新 `origin/main`（`3eb585f`）建立为 `codex/issue-171-image-detail`；独立 worktree 保留原项目目录。

已实施的后端切片：media 的单图字段写入、library 对 collections 的单图最终集合编排、完整元数据 GET、详情/批读的真实版本状态和独立 processingJob/metadataJob，以及复用 media 重处理入口的实际范围/快照反馈。无新依赖、数据库迁移或兼容层。

UI 切片为版本信息及单图重处理，复用当前 LibraryDetail、OwnerShell/AdminShell、HeroUI 和 delivery。上传结果详情也消费同一详情组件；公共导航未扩展未交付页面。

以下内容保持未完成：

- `388:5946/388:6159` 仅有四组元数据摘要，完整树层级、展开/收起、长值/数组、搜索位置和结果布局尚未交接。完整元数据 GET 可用，树/搜索与重读页面尚未实现。
- `36:312/102:3228` 的公开/私有 Chip 是权限说明，单图 visibility 编辑入口、表单和失败保留输入尚无明确设计。
- `387:5685/387:5627` 有名称表单，但旧操作菜单 `387:5664/387:5606` 与当前交接仅复制/下载/删除的操作区冲突。名称入口保持未实现，不恢复旧菜单。
- 关系写入接口可用，本次没有将 API 覆盖描述为关系编辑界面完成。
- 大图查看由 #185/T-LIB-07 承接；媒体设置页面由既有后续任务承接，不提供假入口。
- 本地重处理/元数据重读不等于 S3 完整联验，既有服务端仍明确拒绝未实现的远端处理路径。

以上表达缺口已向用户询问补充节点，未收到补充或偏离设计的批准。它们仅阻塞对应 UI 和完整验收，不阻塞已具备契约的后端及已有设计页面。

## 实际设计读取与代表对照

实际读取设计信息和截图，原始材料保存于 [figma/](./figma/)。节点链接和文字描述未替代截图。

实际读取设计信息和截图，原始材料保存于 [figma/](./figma/)。设计稿中的示例图片/名称/格式不替换真实数据。下表的桌面为1440×1080、手机为390×844；每行分别保留浅深色实际生产页面。

| 页面/状态    | 桌面/手机Figma节点                   | 实际截图：桌浅 / 手浅 / 桌深 / 手深                                                                                                                                                                                                                                                                           | 逐项对照与处理                                                                            |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 主详情       | `36:312 / 102:3228`                  | [桌浅](./screens/detail-ready-light-1440.png) / [手浅](./screens/detail-ready-light-390.png) / [桌深](./screens/detail-ready-dark-1440.png) / [手深](./screens/detail-ready-dark-390.png)                                                                                                                     | 继承统一公共区域；真实资料、默认版本、权限说明及操作位置保持；版本入口消费同一详情。      |
| 版本信息     | `388:6214 / 388:6427`                | [桌浅](./screens/detail-171-versions-light-1440.png) / [手浅](./screens/detail-171-versions-light-390.png) / [桌深](./screens/detail-171-versions-dark-1440.png) / [手深](./screens/detail-171-versions-dark-390.png)                                                                                         | 识别图112×84/80×60，四行72px；水绿说明；桌面三列、手机字号/顺序；底栏200px/手机等分48px。 |
| 范围选择     | `521:10712 / 521:10141`              | [桌浅](./screens/detail-171-reprocess-selection-light-1440.png) / [手浅](./screens/detail-171-reprocess-selection-light-390.png) / [桌深](./screens/detail-171-reprocess-selection-dark-1440.png) / [手深](./screens/detail-171-reprocess-selection-dark-390.png)                                             | 标题、识别图112×84/85×64、44px单选、8px范围间距；底栏和双柔光。                           |
| 仅缩略图确认 | `521:11772 / 521:10431`              | [桌浅](./screens/detail-171-reprocess-confirm-thumbnail-light-1440.png) / [手浅](./screens/detail-171-reprocess-confirm-thumbnail-light-390.png) / [桌深](./screens/detail-171-reprocess-confirm-thumbnail-dark-1440.png) / [手深](./screens/detail-171-reprocess-confirm-thumbnail-dark-390.png)             | 确认标题、范围、保留其他版本说明、最新设置说明、重新选择/提交顺序。                       |
| 仅水印图确认 | `521:11560 / 521:10373`              | [桌浅](./screens/confirm-watermark-light-1440.png) / [手浅](./screens/confirm-watermark-light-390.png) / [桌深](./screens/confirm-watermark-dark-1440.png) / [手深](./screens/confirm-watermark-dark-390.png)                                                                                                 | 临时压缩只服务于水印，不替换压缩图；信息块、字号与底栏位置。                              |
| 仅压缩图确认 | `521:11666 / 521:10402`              | [桌浅](./screens/confirm-compressed-light-1440.png) / [手浅](./screens/confirm-compressed-light-390.png) / [桌深](./screens/confirm-compressed-dark-1440.png) / [手深](./screens/confirm-compressed-dark-390.png)                                                                                             | 只替换压缩图及保留另外两版，44px提交与返回操作。                                          |
| 全部派生排队 | `521:11878 / 521:10460`              | [桌浅](./screens/queued-all-light-1440.png) / [手浅](./screens/queued-all-light-390.png) / [桌深](./screens/queued-all-dark-1440.png) / [手深](./screens/queued-all-dark-390.png)                                                                                                                             | 真实持久化受理ID/expected快照；无进度假成功；旧版本说明、双返回操作。                     |
| 单缩略图排队 | `370:5734 / 370:5935`                | [桌浅](./screens/detail-171-reprocess-fixture-queued-light-1440.png) / [手浅](./screens/detail-171-reprocess-fixture-queued-light-390.png) / [桌深](./screens/detail-171-reprocess-fixture-queued-dark-1440.png) / [手深](./screens/detail-171-reprocess-fixture-queued-dark-390.png)                         | 范围/单版应生成快照，统一页头、身份和固定返回。                                           |
| 候选运行     | `369:7614 / 369:7817`                | [桌浅](./screens/detail-171-reprocess-fixture-running-light-1440.png) / [手浅](./screens/detail-171-reprocess-fixture-running-light-390.png) / [桌深](./screens/detail-171-reprocess-fixture-running-dark-1440.png) / [手深](./screens/detail-171-reprocess-fixture-running-dark-390.png)                     | 实际stored压缩候选与remaining两行，尚未替换说明；候选不提供下载。                         |
| 成功         | `369:7862 / 369:8070`                | [桌浅](./screens/detail-171-reprocess-success-light-1440.png) / [手浅](./screens/detail-171-reprocess-success-light-390.png) / [桌深](./screens/detail-171-reprocess-success-dark-1440.png) / [手深](./screens/detail-171-reprocess-success-dark-390.png)                                                     | 桌面名称/已更新/实际编码三列，手机逐项分块；真实生成格式不硬写原型示例。                  |
| 失败         | `369:8120 / 369:8323`                | [桌浅](./screens/detail-171-reprocess-fixture-failed-light-1440.png) / [手浅](./screens/detail-171-reprocess-fixture-failed-light-390.png) / [桌深](./screens/detail-171-reprocess-fixture-failed-dark-1440.png) / [手深](./screens/detail-171-reprocess-fixture-failed-dark-390.png)                         | 已保存版本不变、真实错误原因、按最新设置重试；公共布局保持。                              |
| 仅压缩关闭   | `521:10818 / 521:10170`              | [桌浅](./screens/detail-171-reprocess-disabled-compression-light-1440.png) / [手浅](./screens/detail-171-reprocess-disabled-compression-light-390.png) / [桌深](./screens/detail-171-reprocess-disabled-compression-dark-1440.png) / [手深](./screens/detail-171-reprocess-disabled-compression-dark-390.png) | 压缩不可选原因完整可读；保留设计中的禁用设置入口，明确尚未开放。                          |
| 两开关关闭   | `521:11030 / 521:10228`              | [桌浅](./screens/detail-171-reprocess-disabled-settings-light-1440.png) / [手浅](./screens/detail-171-reprocess-disabled-settings-light-390.png) / [桌深](./screens/detail-171-reprocess-disabled-settings-dark-1440.png) / [手深](./screens/detail-171-reprocess-disabled-settings-dark-390.png)             | 仅控件42%透明；原因100%，仍能选缩略图；不附加设置入口。                                   |
| 首次失败     | `521:11136 / 521:10257`              | [桌浅](./screens/detail-171-reprocess-first-failure-light-1440.png) / [手浅](./screens/detail-171-reprocess-first-failure-light-390.png) / [桌深](./screens/detail-171-reprocess-first-failure-dark-1440.png) / [手深](./screens/detail-171-reprocess-first-failure-dark-390.png)                             | 仅全部派生可选，其他原因100%；不附加开关关闭说明。                                        |
| 存储停用     | `无专项帧；依handoff停用/不可读规则` | [桌浅](./screens/detail-171-reprocess-disabled-storage-light-1440.png) / [手浅](./screens/detail-171-reprocess-disabled-storage-light-390.png) / [桌深](./screens/detail-171-reprocess-disabled-storage-dark-1440.png) / [手深](./screens/detail-171-reprocess-disabled-storage-dark-390.png)                 | 复用上述页布局与占位，明确不可读并禁用提交；不声称有专项Figma验收。                       |

公共区域先对照：同一OwnerShell提供桌面232px侧栏、正文32px内边距，手机顶部入口及16px内边距；品牌/账号/当前项/禁用导航均消费现有来源。浅深色使用既有主题变量，正文与固定底栏分离。然后对照业务区域及控件：标题/身份/说明/范围或版本表/操作栏顺序、上述尺寸与间距、Caveat/Noto Sans SC字体、水绿说明、品牌黄按钮、Lucide图标、焦点状态。

设计返修已闭环：版本说明补水绿底、固定按钮宽度；Radio去除HeroUI默认16px顶距、28px说明缩进及多层禁用淡化；选中使用已有原型的●/○文字，不自绘图标；柔光扩展至业务背景避免矩形截断；成功列表恢复三列；禁用入口仅适用时显示，首次失败不加无关说明；存储停用明确不可读。初次品牌字体未加载是测试页残留请求拦截；清理拦截后等待实际字体加载，未改公共品牌。早期截图仅作返修追溯，最终验收以上表为准。

功能与设计结论分开。排队/运行/失败使用独立数据库中的受控持久化任务以稳定渲染，记录明确不作为真实worker执行证据。真实ImageMagick连续重处理、单版受理及ExifTool成功另由业务断言证明。元数据完整树、visibility编辑和名称入口的缺口见范围章节，未取得偏离设计的批准。

## 验证环境与命令

环境：macOS 26.6.2 ARM64，Apple M4 / 16 GiB，Node 24.18.1、pnpm 11.19.0，ImageMagick 7.1.2-32 Q16 HDRI、ExifTool 13.55，现有 Ego Lite。所有浏览器数据属于独立测试目录，未修改用户预览的真实数据。局部测试和最终检查分开记录。

| 实际命令                                                    | 结果                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                            | 通过，锁文件未变                                                                                           |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile` | 通过                                                                                                       |
| `pnpm run format:check`                                     | 通过                                                                                                       |
| `pnpm run lint`                                             | 通过，零 warning                                                                                           |
| `pnpm run typecheck`                                        | 通过，包含 Next 类型生成、应用及 runtime TypeScript                                                        |
| `pnpm --dir tests/experiments/ui run typecheck`             | 通过                                                                                                       |
| `pnpm run test:unit`                                        | 64 文件 / 785 项通过                                                                                       |
| `pnpm run test:integration --maxWorkers=1`                  | 107 文件 / 982 项通过，726.81 秒；普通集成与真实工具两组均执行                                             |
| `pnpm run build`                                            | 通过，退出 0；保留无部署密钥/无数据库的构建回归。其他平台 resvg 可选依赖追踪有既有警告，本机真实处理已验证 |
| `pnpm run test:browser`                                     | 失败于既有 `interaction-polish` 1920px 上传组合宽度断言；未执行到本次详情场景，不记为通过                  |
| `node docs/tasks/check.mjs`                                 | 120 tasks / 298 requirements 通过，无缺失 ID 或循环                                                        |
| `node docs/tasks/check.mjs --self-test`                     | 5 个拒绝场景通过                                                                                           |
| `git diff --check`                                          | 通过                                                                                                       |

失败证据与修复：

- 关系缺失 HTTP：首轮聚焦 48 项中 47 项通过，旧构建仍含修复前的 409，源码/数据库断言已为 404。重新构建后的完整集成 982 项全部通过。
- 真实候选字段：新增 SQLite 场景先取得旧接口缺少 `generatedVersions` 的失败，修复后实际存储/预期集合过滤及旧任务/临时/水印中间对象边界通过；完整真实工具组也通过。
- 详情 URL：新增 `query-state` 用例先取得 `detailView/preview` 导致严格查询拒绝的失败，修复后图库/相册、筛选/页码/列表身份保持，20 项聚焦测试通过，最终单元组通过。
- 构建中的单元夹具类型错误：只修正夹具数组的可变类型，不削弱断言；随后应用/runtime 类型检查通过。

浏览器新增业务场景位于 `e2e/library-detail-171.mjs`，通过 `scripts/verify-browser.mjs` 接入完整验证流程。验证实际 owner Cookie 修改、原始身份/Key 不变、关系幸存加入时间、真实 ExifTool 元数据读取、版本工作区及上下文恢复。完整树、编辑失败保留输入等缺少界面的验收未执行，不由 API 测试替代。

## 独立审计与交付边界

独立代码审计通过本次已实现的部分切片，未发现剩余 P1/P2 产品代码缺陷。评审者实际读取产品差异、调用路径与新增测试，独立执行了20项query-state单元及最终 `node --check e2e/library-detail-171.mjs`；未独立运行全量构建或浏览器，完整实际执行结果见上表。接口已实施不代表对应编辑界面完成。

预审推动修正空字段 PATCH、缺失关系状态码、子页历史返回、上传详情选版与元数据轮询边界。终审及浏览器用例补齐时发现的五项问题，已在源码独立复查关闭：

- 首次 `pending/processing` 任务不再自动冒充重处理受理结果；当前主动重试仍按受理 ID 读取。
- 版本/重处理子页关闭优先恢复仍存在的来源卡片焦点，直接 URL 无来源时回到列表标题。
- 同一图片实际处理状态、任务 ID 或任务终态变化复用现有 `notifyLibraryChanged`；初始读取不发送变更。图库显示刷新标记并核对不再匹配的已选项。
- 详情专用 `detailView/preview` 不进入图库严格查询校验，保留筛选、页码和列表缓存身份。修复前 `query-state` 单测实际失败（`Unrecognized keys`，1 失败 / 19 通过），修复后 20 项通过；业务未知参数仍拒绝。
- 同一图片完成重处理后，再次点击版本页的重处理入口，只有已匹配受理任务的明确终态才重置结果并进入新范围；活动任务与待核对提交不清除。源码已独立复查，先取得真实旧页面仍显示成功、提交次数为 1 的失败证据（见 `repeated-reprocess-failure.png`），修复后连续两次真实任务的浏览器断言已通过，旧失败报告保留于 [reports/repeated-reprocess-before.json](./reports/repeated-reprocess-before.json)。

媒体提供方返回最新任务真实 `stored` 候选集合，排除旧任务、临时对象、未保存对象和水印范围的压缩中间产物。`generatedVersions` 不等于已发布版本；候选页不提供下载，原有 `media_versions` / 链接在一起发布前保持不变。候选保存但处理步骤未改变时仍刷新详情。

独立设计评审通过已实现切片：实际读取28个Figma节点的设计信息及截图，独立查看真实生产页面；最终禁用16张和补充确认/全部排队12张已逐张复核。上表状态的整页、公共区域、业务布局及控件均已核对，发现的差异已修正且复看关闭，没有剩余未批准的设计偏差。存储停用及取消没有专项Figma帧，不记为专项设计通过。评审者未独立操控浏览器；功能断言与设计结论分开，完整Issue及用户人工验收仍未完成。

用户人工验收、真实物理设备和 Release 双架构/容器验证均未执行。物理设备已取消必需实测和容器验证时机遵守 [execution.md](../../tasks/execution.md)，未把未运行项目记为通过。本次不会创建 Release、发布镜像或部署，不合并 PR、不主动关闭 Issue、不删除分支/worktree。

## 范围外浏览器失败

完整 `pnpm run test:browser` 已实际执行。生产 smoke、外壳、1440 初始化/重启和 M2 场景通过后，`e2e/interaction-polish.mjs` 的宽屏上传断言失败：1920px 视口下上传组合宽 1280px，可用内容宽 1624px，测试要求差值不超过 1px。

实际核对 `origin/main`：`src/components/upload/screen.tsx` 已有 `min-[1200px]:max-w-[1280px]`，相同断言也已存在。本次 UploadScreen 只调整详情查询及版本导航，未改变组合布局。此范围外问题未擅自修复，也未削弱/跳过该断言。完整检查保持失败，PR 保留草稿。

为取得受影响业务证据，另在新隔离 DATA_DIR 的真实生产服务中，用同一 Ego TaskSpace 2 执行仓库 `e2e/library.mjs`（包括接入的 `e2e/library-detail-171.mjs`）。它独立运行既有图库/详情/回收流程和本次新增行为，不替代失败的完整浏览器检查。第一次旧构建实际复现重复处理入口失败，随后更新构建重跑。所有成功数据来自实际接口，受控持久化任务仅用于稳定状态渲染，分别记录。

## 聚焦浏览器记录与修复闭环

完整运行器的失败保留于 [full-browser-runner.json](./reports/full-browser-runner.json) 与 [interaction-polish.json](./reports/full-browser-interaction-polish.json)。没有把空远端检查或聚焦运行替代完整检查。

聚焦执行在本次项目less目录的临时工具中，实际命令为 `node work/run-library-scope-171.mjs final library` 和 `node work/run-library-scope-171.mjs context resume`。工具通过现有 `ego-browser nodejs` 注入生产预览配置、复用同一 TaskSpace 2，执行仓库 `e2e/library.mjs`，没有下载浏览器或伪造成功接口。第一个报告实际为 failed：27 条业务断言通过后，尾段假定目标在首批/虚拟DOM而未找到；[原始报告](./reports/detail-before-context-fix.json)保留该失败。尾段按真实公开查询定位图片，加载实际页并走虚拟窗口，布局控件按实际 radio 语义操作；补跑返回上下文、回收与真实会话失效 [19 条通过](./reports/context-trash-session.json)。它们没有被拼成一个虚构的 passed 报告。

最后一轮重新构建后，在全新隔离数据执行 `node work/run-library-scope-171.mjs accepted library`，额外验证禁用控件计算透明度为 0.42、原因及祖先累计透明度为 1、两开关关闭不出现设置入口、仅压缩关闭时保留禁用入口、首次失败无开关说明和停用存储不称可用。[最终独立原始报告](./reports/detail-final.json)为 passed，46条业务检查、266条布局记录；没有覆盖尚无UI的树/编辑验收。压缩/水印确认和受控全部排队另用实际命令 `node work/detail-states-171.mjs` 采集，[补充原始报告](./reports/additional-states.json)为passed，12张同视口浅深色实际页面；受控字段在finally恢复，不追加假任务。

公共外壳未修改来源配置；变更消费涉及图库、相册内容与上传结果详情。版本工作区仍使用同一 OwnerShell、品牌、账号区和固定底栏，不复制公共菜单。公共区域对照与上述详情行为分开记录。

共享消费的实际命令为 `node work/run-consumers-171.mjs`，[独立原始报告](./reports/consumers.json)为passed：2条完整消费流程、16条实际页面布局记录。真实File上传由worker完成，上传详情→缩略图→版本页→浏览器返回保留同一document、queue ID、image ID和ready结果；实际POST创建隔离相册并用collections PATCH加入真实图片，相册来源的键盘进入/返回保留URL、预览版本、选择、滚动和来源焦点。只删除本次新建相册，媒体保留在可丢弃测试DATA。该回归已接入 `verifyLibraryDetail171`，最终详情46条报告在新增consumer helper前加载，消费者单独报告，不虚构合并数。

| 公共消费者     | 桌浅 / 手浅 / 桌深 / 手深                                                                                                                                                                                                                                                             | 对照结论                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 上传结果版本页 | [桌浅](./screens/detail-171-consumer-upload-versions-light-1440.png) / [手浅](./screens/detail-171-consumer-upload-versions-light-390.png) / [桌深](./screens/detail-171-consumer-upload-versions-dark-1440.png) / [手深](./screens/detail-171-consumer-upload-versions-dark-390.png) | 真实完成后选缩略图进入图库版本页，统一品牌/账号/10导航/当前图库项；返回不丢上传队列。 |
| 相册来源版本页 | [桌浅](./screens/detail-171-consumer-album-versions-light-1440.png) / [手浅](./screens/detail-171-consumer-album-versions-light-390.png) / [桌深](./screens/detail-171-consumer-album-versions-dark-1440.png) / [手深](./screens/detail-171-consumer-album-versions-dark-390.png)     | 仍位于原相册并高亮相册，统一公共来源；业务版本布局与相同Figma节点一致。               |

上述消费者由独立设计评审逐张复核8张版本页截图通过，并经独立代码补审确认没有新P1/P2；按版本节点 `388:6214/388:6427` 和公共handoff核对，不重审已确认的上传/相册产品选择。没有新增公共导航配置；回收站真实行为已在最终详情聚焦流程中回归。
