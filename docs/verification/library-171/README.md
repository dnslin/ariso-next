# Issue #171：完整详情与单图操作的部分实施

本次保留 `T-LIB-06` 与原需求编号，未改写冻结 PRD。Issue 完整验收尚未完成，PR 保持草稿，界面仍需用户人工验收。

2026-10-02 人工反馈后已返修版本入口、说明 Tips、重处理选项和返回悬停，后续又将单项确认改为紧凑弹窗；当前结果见[确认弹窗返修](#单项确认的紧凑弹窗返修2026-10-02)。下方既有截图与设计通过结论属于返修前版本，不能替代新页面验收。

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

上述消费者由独立设计评审逐张复核8张版本页截图通过，并经独立代码补审确认没有新P1/P2；按版本节点 `388:6214/388:6427` 和公共handoff核对，不重审已确认的上传/相册产品选择。没有新增公共导航配置；回收站真实行为已在最终详情聚焦流程中回归。这些是首次实现的历史证据，不代表下方返修界面的验收结果。

## 人工反馈后的布局返修（2026-10-02）

用户要求重新设计标出的区域，缩短说明并提供 Tips，改善过长选项与返回悬停。局部设计调整写回既有[交接文档](../../design/handoff.md#图片详情与重处理布局返修2026-10-02)，没有修改 Figma 或冻结 PRD。以下是用户实际提供的返修前桌面浅色截图，像素尺寸不代表已知 CSS 视口；缩放和设备像素比例未提供。

| 用户反馈与实际截图                                              | 对应基线节点                              | 本轮处理与当前结论                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [版本入口](./feedback/version-entry.png)，1053×812              | `36:312 / 102:3228`                       | 移至文件名标题旁，44px Lucide 图标按钮、可访问名称和 Tooltip。长名换行，点击仍直接进入同一版本工作区。源码复审通过，新页面视觉待验收。                                                                                   |
| [版本长说明](./feedback/version-copy.png)，981×104              | `388:6214 / 388:6427`                     | 两段次要说明改为标题旁可点击的 HeroUI Popover；已有文件资料与不可读原因仍直接展示。初始折叠单元断言通过，实际打开/关闭与回焦待浏览器验收。                                                                               |
| [范围过长与排版](./feedback/scope-layout.png)，1700×720         | `521:10712 / 521:10141`，相同禁用状态节点 | 最大640px，768px起两列，手机单列；原生 Radio.Control/Indicator、56px控件、左对齐与已选状态。实际更新范围、单项禁用原因、首次失败限制和确认替换范围仍可见。相同禁用原因只展示一次。源码结构通过，实际几何与浅深色待验收。 |
| [返回悬停与停用重复说明](./feedback/return-hover.png)，1700×701 | 范围页上述节点；停用存储无专项帧          | 返回取消 hover/pressed 背景，44px命中与焦点框保留；公共禁用原因直接展示一次。选择/确认底栏桌面200×48px、手机等分。源码结构通过，真实 hover/焦点与短视口待验收。                                                          |

实际重读归档的设计信息和桌面/手机截图，版本与范围原始材料见 [figma/](./figma/)。本轮用户指令覆盖上述局部长条布局、说明和入口位置；公共 OwnerShell、品牌、账号、导航、字体和主题继续复用。详情入口由图库、相册来源和上传结果共同消费；本轮未改变数据契约、任务提交/轮询或导航回调。

先运行新增 `tests/unit/library/detail-help.test.ts`，旧实现实际为4失败、1通过，见[原始输出](./reports/ui-feedback-before.txt)。随后修复。测试证明默认收起说明、仍展示实际版本资料/更新范围、单次共同禁用原因、可见确认后果与提交错误；它们仅检查服务端初始 HTML，不声称证明浮层交互或实际布局。第一轮类型检查发现新增测试夹具不完整，补齐为完整 `LibraryDetail` 后通过，未弱化断言。

本轮环境仍为 macOS ARM64、Node 24.18.1、pnpm 11.19.0。实际运行结果：

| 命令                                             | 本轮结果                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                 | 通过，锁文件未变；没有新依赖。                                                                                     |
| `pnpm run format:check`                          | 通过。                                                                                                             |
| `pnpm run lint`                                  | 通过。                                                                                                             |
| `pnpm run typecheck`                             | 修正完整测试夹具后通过。                                                                                           |
| `pnpm run test:unit`                             | 65文件、790项通过。                                                                                                |
| `pnpm run build`                                 | 退出0，生产构建和standalone打包完成；保留既有其他平台 resvg 可选依赖追踪警告，未声称跨架构验证。                   |
| `node --check e2e/library-detail-171.mjs`        | 通过，仅语法检查；新增场景尚未运行。                                                                               |
| `node docs/tasks/check.mjs` / `git diff --check` | 通过。                                                                                                             |
| 本轮集成与真实工具组                             | 未重跑：此次只改UI，后端没有变化；此前同一后端提交的982项结果保留为历史证据，不冒充本轮执行。                      |
| 本轮浏览器检查/新截图                            | 未执行：工具安全策略拒绝打开本地预览地址，并禁止通过其他浏览器、端口或域名绕过。既有完整浏览器上传宽度失败也保留。 |

现有 `e2e/library-detail-171.mjs` 已补默认折叠、点击/Enter打开、Escape关闭归还焦点、44px提示入口、浮层边界、返回透明悬停、桌面两列/手机单列、单次共同禁用理由和原始业务断言。语法通过不等于这些场景已在浏览器通过。

独立代码补审通过，未发现剩余P1/P2；发现的版本页顶部文案与真实动作错配已恢复为“返回图库”，没有改动来源恢复行为。独立设计补审实际读取用户四张截图、既有Figma基线和修改源码，确认四处反馈已在结构上覆盖；没有新实际页面截图，因此最终设计验收未执行，也未沿用旧通过结论。

生产预览已用新构建重启于 `http://detail-51801.localhost:51801`，沿用同一 DATA_DIR、账号和运行密钥，只停止本任务原进程。实际健康接口和登录页均返回200；这仅证明服务可达，不等于UI验收。没有修改用户正在查看的图片或任务数据。

人工复核入口：`/library?image=library-007` 的标题旁版本图标；`/library?image=library-007&detailView=versions` 的版本说明 Tips；`/library?image=library-007&detailView=reprocess` 的选项与返回悬停；`/library?image=library-006&detailView=reprocess` 的停用存储。待核对桌面1440×1080、手机390×844及360/430/768、浅深色、短视口、键盘/焦点、单项确认、提交与实际终态；本轮均未标为通过。没有改动的加载/空/任务结果仍保留既有实现与历史记录。

本轮界面仍需用户人工验收，Issue完整未完成范围仍按上方范围章节保留，PR #227保持草稿。没有远端检查的空列表不记作CI通过，镜像、容器与双架构仍按Release流程验证。

## 单项确认的紧凑弹窗返修（2026-10-02）

用户实际提供[深色桌面确认页截图](./feedback/confirmation-full-page.png)（2071×1115像素，CSS视口及缩放未知），指出信息很少却占整页，以及反复彩色说明提示不协调。这是上一轮实际页面的失败证据，不是当前弹窗截图。重读单缩略图确认 `521:11772/521:10431` 的归档信息与截图，旧基线确为整页确认、说明条与远端固定底栏；按本次明确重设计反馈覆盖这三处，不改Figma或冻结PRD。

单压缩、缩略图和水印确认现在使用范围页面上的 HeroUI AlertDialog。最大480px、四周至少16px、自然高度；图片身份64×48，摘要只列“更新”与实际已保存的“保留”版本，不把未生成文件写作已有版本。弹窗不再含重复Tips或彩色说明条；水印临时压缩仅在压缩开启时显示一行必要后果。正文独立滚动，取消/提交48px按钮留在同一弹窗底部。正常范围页与公共外壳继续复用。

取消/Esc只关闭确认，保留所选范围、真实错误和待核对状态；底栏再次点击单项操作只重开确认，不直接提交。提交中禁止取消/Esc，未知受理结果禁止重复提交，核对入口仍可用。没有改变后端请求、真实receipt或版本发布协议。

代码审计发现并修复两项本轮问题：缓存详情的核对GET失败后仍保留确认与取消入口，明确显示真实核对错误，并禁用范围选择和提交；底栏触发按钮被卸载后，关闭弹窗明确恢复到仍存在的范围输入，控件不可用时回到标题。401仍清理缓存并跳转登录；其他读取错误不伪装为最新资料，也不允许使用旧快照提交。

独立代码终审已实际复读修复后的调用路径及浏览器断言，关闭上述两项P2，未发现剩余P1/P2。评审者独立执行相关4文件23项单元测试、浏览器脚本语法及差异检查，均通过；没有运行浏览器，不将焦点恢复或弹窗几何标为实测通过。

Node 24.18.1 / pnpm 11.19.0、macOS ARM64，本轮实际命令：`pnpm install --frozen-lockfile`、`pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run test:unit`（65文件793项）、`pnpm run build`、`node --check e2e/library-detail-171.mjs`、`node docs/tasks/check.mjs`、`git diff --check`。最终均通过。首轮新增hook夹具的React Query联合类型错误已修复后重跑类型/构建；构建保留原有其他平台resvg可选依赖追踪警告，退出0。后端未变，未重复982项集成/真实工具组，不把历史结果当本轮执行。

单元测试实际操作同一hook的选择→取消→重开，确认不产生receipt；直接渲染弹窗验证真实保留版本、无重复Tips、未知受理/核对错误可见且禁止提交。它们不证明真实焦点和布局。既有浏览器场景已更新为弹窗，覆盖取消/Esc回焦、底栏重开、短视口、pending与未知受理/核对失败，保留真实任务和单次提交断言；本轮仅语法检查，未实际执行。

独立设计审查实际读取本次用户图、上述归档Figma及源码，确认反馈已在结构上处理。最终浏览器布局、浅深色、键盘和设计验收仍未执行：先前工具安全策略拒绝打开本地预览，禁止用其他工具/域名/端口绕过。旧截图及源码审查不能替代当前实际页面；仍需用户人工验收，PR保持草稿。

新构建更新到原预览，使用同一账号、DATA_DIR和运行密钥，没有使用测试脚本修改预览数据。实际健康接口/登录页HTTP200只代表服务可达。人工入口为 `/library?image=library-007&detailView=reprocess`，选择“仅缩略图”即可检查确认弹窗；本轮不主动触发用户预览中的处理任务。

## 双角度评审后的恢复与结构修复（2026-10-02）

本轮针对冻结提交 `6c1cb7ff85fd43b5bbcd1545ed24e9232da3162b` 的两份独立评审：[功能与质量报告](./reports/review-6c1cb7-quality.md)、[严格结构报告](./reports/review-6c1cb7-structure.md)。前者确认一项P2：丢失提交响应后，成功核对到新任务终态仍永久待核对；四项直接导入旧hook的隔离复现确认故障，不把复现测试的通过当修复通过。后者确认两项P2：重处理阶段/提交条件/底栏动作散落，以及1285行浏览器函数的隐式顺序依赖。用户明确要求修复并取消重复测试，以下只记录本次增量检查，不重新执行历史全量关卡。

- 提交前记录最新处理任务ID与实际提交范围。核对得到身份不同且范围相同的新任务时，接受其真实阶段，包括成功、失败与取消；不会把旧成功任务当本次结果。首次失败重试中的`processing`也按同一提交身份核对。
- 仍无法归属时保持待核对。只有成功读取当前详情且无活动任务，才开放“重新选择处理范围”；该明确操作清除未知状态、回默认全部范围，不导航、不发POST。读取失败/核对中/存在活动任务时仍锁定，不自动重发。
- 现有控制器统一导出`view`、`canSubmit`、`footerActions`和`open`。父列表不再识别任务终态、隐藏确认底栏或补缓存错误例外；正文、底栏、确认浮层消费同一结果。精确receipt匹配移到纯模型并删除旧UI导出；测试使用完整的最小查询契约，没有整个hook/Query强制转换。
- 浏览器入口由2056行缩为48行，13个职责模块的最大场景300行。字段、关系、元数据、版本、确认、真实处理、响应丢失、未受理、下载、禁用、持久任务、来源恢复与消费者可以独立进入。需要四版本的场景显式调用真实POST/worker准备，并核对实际saved版本；设置、fetch注入、持久任务及候选文件在所属场景恢复。保留真实任务/一次POST/一个job/对象身份/候选/下载字节/焦点断言，没有用成功mock替代worker。旧“成功核对后永久unknown”断言改为新匹配终态与真实单任务断言。

UI仅在真实提交错误区域补44px人工恢复动作，取消与恢复复用范围回焦逻辑。正常480px确认弹窗、范围布局与公共OwnerShell未改设计；基线仍是实际重读的`521:11772/521:10431`和按用户反馈实施的紧凑弹窗返修。没有新的真实页面截图，因此当前恢复按钮的几何、浅深色、键盘焦点及最终设计/用户人工验收未执行，不能用单元HTML或源码评审替代。此前工具安全策略禁止打开本地预览及绕过访问，本轮没有重试浏览器或访问预览数据库。

环境：macOS ARM64、Node24.18.1、pnpm11.19.0。实际增量命令与结果：

| 命令                                                                                                                                    | 本轮结果                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run --project unit tests/unit/library/detail-help.test.ts tests/unit/library/reprocess-result.test.ts --maxWorkers=1` | 2文件15项通过。验证真实版本摘要/错误展示/人工恢复入口及精确receipt对应结果，不证明浏览器布局或焦点。               |
| `pnpm exec tsc --noEmit --project tsconfig.json`                                                                                        | 通过，覆盖修改后的应用调用契约及当时已写入的组件测试。新恢复测试随后另做定向类型检查。                             |
| `pnpm exec prettier --write <本轮修改文件>`、`pnpm exec eslint <本轮修改的产品与组件测试文件> --max-warnings=0`                         | 通过，实际文件为父列表、重处理正文/确认/结果及两份组件测试；未全量格式化。                                         |
| `node --check <入口或场景文件>`（对14个文件分别执行）、定向Prettier/ESLint                                                              | 14文件语法通过；格式完成。ESLint发现消费者模块未使用导入，删除后仅重查该文件通过。场景未实际运行。                 |
| 安装、全量格式/lint/typecheck、全部单元/集成/真实工具与浏览器                                                                           | 按用户本轮指令未重复；历史793项单元、982项集成和构建仅保留原时点证据。原完整浏览器上传宽度失败仍保留，不改写通过。 |

默认沙箱启动格式命令长时间无输出，停止该未完成尝试后，以本任务已授权的最小提权执行上述定向检查；未更改全局代理/权限或锁文件。未新建依赖、迁移、框架、兼容层，也未修改范围外问题。

结构复审曾发现新增测试自建React hooks执行器，作为本轮Required当场处理：完整删除React mock/槽位/effect循环，把现有可用性与明确恢复转换收进生产模型并由真实hook消费，再直接测试模型。中间22项模拟用例虽曾通过，已全部替换，不作为最终证据，不把它们当真实React生命周期验证。

| 后续实际命令                                                                                                                                                                                                               | 最终结果                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --project unit tests/unit/library/reprocess-recovery.test.ts --maxWorkers=1`                                                                                                                         | 替换为纯生产模型后1文件31项通过；涵盖五任务阶段、旧任务/错范围排除、首次失败processing、已核对无活动任务才恢复、读取失败/进行中/活动任务锁定、精确receipt及阶段一致性。 |
| `pnpm exec prettier --write src/components/library/use-detail-reprocess.ts src/components/library/detail-reprocess-model.ts tests/unit/library/reprocess-recovery.test.ts` / 同三文件`pnpm exec eslint … --max-warnings=0` | 通过；移除测试执行器后只重查这些受影响文件，没有重跑已通过的15项组件测试。                                                                                              |
| `pnpm --dir /Volumes/data/project/ariso-issue-171 exec tsc --noEmit --project /Users/dnslin/Documents/Codex/2026-10-02/ariso-next-github-issue-160-volumes-2/work/pr-227-review-fix/recovery-tsconfig.json`                | 通过；临时配置继承项目配置，仅纳入新增恢复测试与控制器及其实际依赖，关闭incremental以免共享缓存。不重复整仓检查。                                                       |
| `pnpm run build`                                                                                                                                                                                                           | 为更新用户原地址的最新预览只生成一次新包，退出0；runtime、Next生产构建与standalone打包完成。保留既有resvg其他平台可选依赖追踪告警，未作为新架构/容器通过。              |
| `node work/restart-preview-171.mjs`（项目less目录）                                                                                                                                                                        | 已先确认并正常停止本任务原PID8314，再以同一账号、DATA_DIR和密钥启动PID87250。健康接口与登录页均HTTP200；只证明服务可达，不证明页面/设计通过。                           |

两位独立agent完成修复增量复审：[代码质量复审](./reports/review-fix-code.md)关闭unknown恢复P2，未发现新的Critical/Required；[严格结构复审](./reports/review-fix-structure.md)关闭两项原P2及本轮自制测试执行器问题，无遗留高置信Required。评审者实际读取最终代码和测试，并对照旧浏览器脚本；没有重复运行验证命令。功能与结构源码结论不冒充设计验收或真实异步执行证据。

最终定向单元为15项组件/结果加31项模型，共46项，来自两次独立命令，不拼成虚构的全量报告。真实请求次数、React卸载/切图迟到请求、Escape/回焦、浅深色/短视口/点击目标和新页面设计仍待浏览器及人工验收；既有真实E2E断言已保留，但本轮未执行。生产预览已更新到本轮代码，入口仍为`http://detail-51801.localhost:51801/library?image=library-007&detailView=reprocess`；本轮没有提交该预览中的处理请求或运行测试SQL。

整个Issue的元数据树/搜索/重读页面与名称、visibility、关系编辑界面仍未完成，承接边界沿用上方范围章节。PR继续草稿，当前无远端检查，不记CI通过；没有合并、关闭Issue、Release、镜像发布、部署或删除分支/worktree。

## 所有者合并与关闭指令（2026-10-02）

所有者在本次修复与两份独立复审完成后，明确要求“合并pr 清理并更新本地分支 关闭issue”。按该指令推进PR #227合并、关闭Issue #171、更新本地main及清理本次开发分支/worktree。此前记录的完整编辑/元数据UI未实现范围、真实浏览器及人工设计未验收、范围外完整浏览器失败仍保留，不因本次合并或关闭改写为通过。清理本次worktree时停止其临时预览，独立预览数据保留；没有Release、镜像发布或部署。
