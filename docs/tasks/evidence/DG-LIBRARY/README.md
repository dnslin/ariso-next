# DG-LIBRARY 设计适用核对证据

日期：2026-09-30（Asia/Shanghai）；关联 [Issue #131](https://github.com/dnslin/ariso-next/issues/131)。本项是文档交付，无业务代码、UI 或 Figma 修改。可复用规则和真实验收范围只维护在消费任务，不在此复制：

| 消费任务        | 核对结论                                                                             | 当次仍开放的其他直接前置（不含 #131） |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------- |
| T-LIB-04 / #173 | [查询、布局与历史](../../m3-m4-experience.md#dg-library-t-lib-04-核对结论)           | 无                                    |
| T-LIB-05 / #174 | [跨页显式选择](../../m3-m4-experience.md#dg-library-t-lib-05-核对结论)               | #173                                  |
| T-LIB-06 / #171 | [详情、完整元数据与编辑](../../m3-m4-experience.md#dg-library-t-lib-06-核对结论)     | #153 T-MED-10                         |
| T-LIB-07 / #185 | [大图及上下文恢复](../../m3-m4-experience.md#dg-library-t-lib-07-核对结论)           | #173、#171                            |
| T-LIB-08 / #177 | [批量关系、可见性、回收恢复](../../m3-m4-experience.md#dg-library-t-lib-08-核对结论) | #174、#176 T-COL-03                   |
| T-LIB-09 / #186 | [批量重处理](../../m3-m4-experience.md#dg-library-t-lib-09-核对结论)                 | #177、#153                            |
| T-LIB-10 / #187 | [批量复制](../../m3-m4-experience.md#dg-library-t-lib-10-核对结论)                   | #174                                  |

## 范围与前置

`gh issue view 131 --json number,title,body,comments,state,url` 返回 OPEN、无评论；原生 `dependencies/blocked_by` 为空，`dependencies/blocking` 正好是上表七项。逐项读取七个 Issue、评论及 blocked_by，均 OPEN、无评论；原始快照见 [github.json](./github.json)。不改远端任务或依赖，不把 DG 完成当作其他前置已完成。

`git fetch origin` 后，基线为 `f7a2b5de0dbf6f860294489efa1e3d0eac17d7d6`。原目录 `/Volumes/data/project/ariso` 在 main 且无未提交改动；本次使用独立 worktree `/Users/dnslin/.codex/worktrees/issue-131-library-design/ariso` 与分支 `codex/issue-131-library-design`，保留原工作区。

从 [docs/README](../../../README.md) 阅读能力地图、PRD 13/15、library §3–11、media §9.1、任务定义、需求覆盖与既有 M2/查询/元数据证据。沿[设计交付规范](../../../design/handoff.md)和[执行约定](../../execution.md)核对，不重写冻结 PRD、需求编号、模块边界或依赖。能力地图/阶段顺序中的早期“尚未实现”描述不覆盖已合并代码；历史图中的旧面包屑、刷新菜单和 GPS 信息按钮按当前交接处理，不倒改历史证据。

采用 using-agent-skills、documentation-and-adrs、figma-use 和 code-review-and-quality。只读实现盘点另读取 vercel-react-best-practices；没有 React/Next.js 实现变更，不新增依赖或空测试。

## 实时设计依据与结论

通过只读 Figma Plugin API 读取文件 `74sT9Hrf8G4czcWeTkET5b` 的桌面页 `0:1`、手机页 `97:748`。读取七张消费卡列出的 30 个具体节点的名称、尺寸和全部文本，见 [nodes.json](./figma/nodes.json)。补查两页相关名称的画板，找到已交付的名称编辑及元数据重读中/旧值失败状态，相关八节点见 [supplement.json](./figma/supplement.json)。这是设计资料读取，不是播放器点击或请求验证。

下表均为本次实际下载并目视检查的 **Figma 浅色截图**，不是产品页面截图。桌面 1440×1080，手机 390×844，原尺寸导出。没有修改主题变量；深色只核对 handoff 的既有语义颜色与适用规则，不声称本轮已截图验证深色。

| 对象       | 桌面截图 / 节点                    | 手机截图 / 节点                    | 逐项适用结论                                                                                                                                                  |
| ---------- | ---------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 图库       | [30:285](./figma/30-285.png)       | [98:748](./figma/98-748.png)       | 桌面侧栏/工具区、手机菜单/双列及底部数量可复用；固定八张照片不代表加载/筛选已实现                                                                             |
| 已选清单   | [388:2608](./figma/388-2608.png)   | [388:5896](./figma/388-5896.png)   | 总数/当前与其他页、来源、缩略图、逐项移除及固定操作区可复用；截屏外行需真实滚动验证                                                                           |
| 元数据     | [388:5946](./figma/388-5946.png)   | [388:6159](./figma/388-6159.png)   | 只有四组摘要与返回/重读，未表达完整树、字段搜索和长值；明确留给 T-LIB-06 补齐设计交接                                                                         |
| 元数据失败 | [369:9106](./figma/369-9106.png)   | [369:9309](./figma/369-9309.png)   | 已说明旧值不是本次读取、图片处理仍成功，可复用；GET 失败/未读取/无摄影字段/无旧值失败沿既有错误或空容器说明真实原因，仅有旧值才显示历史结果，无需分别新增画板 |
| 大图       | [390:6943](./figma/390-6943.png)   | [390:6996](./figma/390-6996.png)   | 版本、实际格式/大小、关闭、首端禁用、缩放/下一张可复用；无下载/分享/幻灯片；跨页/手势/全屏须真实验证                                                          |
| 关系结果   | [522:13173](./figma/522-13173.png) | [522:13729](./figma/522-13729.png) | 逐图 ID/来源/结果与失败保留可复用；同名目标、事务和任意数量须真实数据验证                                                                                     |
| 重处理结果 | [388:7246](./figma/388-7246.png)   | [388:7454](./figma/388-7454.png)   | 已受理与首次失败范围冲突清楚；汇总“其他10张”不能替代真实逐图任务/错误                                                                                         |
| 复制结果   | [388:6482](./figma/388-6482.png)   | [388:6690](./figma/388-6690.png)   | 不可复制原因与部分成功可复用；手机副标题在代表图左侧有裁切，后续按现有响应式规则保证完整可读，不照搬裁切；所有格式/版本和 Clipboard 仍待真实验证              |

完整元数据树及单图 visibility 编辑入口/表单的表达缺口列在 T-LIB-06；仅阻塞这些 UI 的实现与该任务完整验收。旧值失败、名称编辑及无关服务端不重做。本 DG 的验收允许识别缺口并明确负责人，不因此把任务扩成补画全部设计。未批准任何新设计偏差，也未关闭 DES-06-LIBRARY、RG-01/02/04/06；T-LIB-09 原有关联 RG-05、跨页主题/焦点 DES-05/07 与 RG-07 仍保持真实验收责任。

七项消费任务均适用桌面/手机、浅深色及加载/空/错误/成功/禁用检查；具体状态和不可混淆的错误语义已逐卡列出。所有宽度、键盘/焦点、点击区与短视口沿现有执行约定，不另建规则。**本次无新页面，不运行浏览器验收；后续 UI 必须有真实页面对照和用户人工验收，本记录不能替代。**

## 当前实现边界

只读检查 `src/app/library/library-screen.tsx`、`src/components/library/`、`src/server/library/`、`src/server/media/metadata.ts`、相关 HTTP 路由及单元/集成和 e2e 文件：

- 已有固定网格/40 张加载更多、只读详情、真实四版本与复制/下载、单图回收恢复；T-LIB-03 已交付完整查询/邻居/80 项状态批读接口。完整筛选 UI、显式选择、批量及大图尚未接入。nuqs/YARL 只在隔离实验；相册管理存在不等于相册内容已开放。
- 元数据已由 media 持久化完整分组值和摄影投影。内部 `readMediaMetadata` 返回读取状态及 `historical`（有旧数据且非 succeeded，包括 queued/running/failed），尚无生产调用者；尚无元数据 GET 或详情字段 PATCH。`POST /api/images/{id}/metadata/read` 已有所有者/来源检查、空 body、202 受理和 401/403/404/409/422/500 错误；不能当作详情读取已连通。重读目前仅 local，S3 后续验证不能记作完成。
- 公共界面继续使用 OwnerShell/AdminShell，详情继续组合 LibraryDetail、DetailPreview/PreviewImage、DetailCopy、AccessDisclosure 和 TrashAction。HeroUI 3.2.6 已安装；组件名称仅作已有任务映射，不以存在 Accordion/SearchField 就断言完整树视觉已明确。

既有测试与验证记录只用于判定底座边界，本轮未重跑业务测试，不把历史通过算成本次验证。新增完整字段展示与编辑、批量、相册内容、查看器均由原消费任务承接。

## 本地验证

环境：macOS / Darwin arm64；Node 24.18.1，pnpm 11.19.0。初始 shell 是 Node 26.10.0，执行任何安装/检查前已在当前命令 PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`；未改全局设置。

| 实际命令                         | 结果                             |
| -------------------------------- | -------------------------------- |
| `pnpm install --frozen-lockfile` | 通过；611 包复用缓存，锁文件不变 |

实际完成的文档检查：

| 实际命令／检查                                                                                                                                                                                                                                                           | 结果                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `pnpm exec prettier --write docs/tasks/m3-m4-experience.md docs/tasks/gates.md docs/tasks/evidence/DG-LIBRARY/README.md docs/tasks/evidence/DG-LIBRARY/github.json docs/tasks/evidence/DG-LIBRARY/figma/nodes.json docs/tasks/evidence/DG-LIBRARY/figma/supplement.json` | 通过，仅格式化本次文件                                                                      |
| `pnpm run format:check`                                                                                                                                                                                                                                                  | 通过，全仓匹配文件格式符合配置                                                              |
| `node docs/tasks/check.mjs`                                                                                                                                                                                                                                              | 通过；120 任务、298 需求，无缺失 ID 或循环，映射/依赖报告未过期                             |
| `node docs/tasks/check.mjs --self-test`                                                                                                                                                                                                                                  | 通过；5 个拒绝场景                                                                          |
| `git diff --check`                                                                                                                                                                                                                                                       | 通过                                                                                        |
| `python3` 标准库一次性检查 Markdown 相对链接/标题锚点、JSON 节点及 PNG 文件头                                                                                                                                                                                            | 184 个本地链接、35 个锚点通过；30 个不重复消费节点、8 个补充节点与 16 张 PNG 存在且格式正确 |

纯文档适用格式、任务依赖/映射、链接及配置走查；未运行应用 lint/typecheck/单元/集成/build/browser，没有运行时或构建输入变化，不标记这些检查通过。未执行物理设备、AMD64/ARM64 镜像或容器验证；发布验证按既有 Release 流程，不为本 PR 触发发布。

## 独立审计与设计适用复核

两位独立 agent 分别完成以下复核：

- **代码/文档审计**：使用 code-review-and-quality 对照七项新增结论、library §3–11、media §9.1、实际查询/详情/metadata 代码与证据；Critical 0、Required 0。独立运行任务校验、自测和 diff 检查通过；184 个本地链接目标存在，三份 JSON 可解析。确认不引入运行时行为、依赖或架构，测试适用范围没有被伪报。
- **设计适用复核**：独立只读读取实时 Figma 两页的关键节点及相关文本，查看 16 张两端截图。发现一项 Required：初稿把无旧值失败等可复用状态扩大为设计阻塞；已收窄到完整树/搜索布局和单图 visibility 编辑，GET/空/无旧值错误复用现有容器。评审者回读任务卡与本记录，最终 Required 0，设计适用核对通过。手机复制结果副标题的既有裁切已明确交由 T-LIB-10 按现有响应式规则处理，未改 Figma。

真实页面功能验收与设计验收均不适用本次纯文档交付，继续归消费任务，不能写“UI 验收通过”。

## PR 与远端验证

待提交推送后记录 PR 和实际检查。已读取 `.github/workflows/ci.yml`（workflow_call）及 `images.yml`（release.published）；当前日常 PR 以本地适用检查为准。无检查不等于 CI 通过，不等待不存在的工作流。不合并、不主动关闭 Issue、不创建 Release、不部署、不删除分支或 worktree。
