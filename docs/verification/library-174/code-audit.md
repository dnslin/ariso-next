# Issue #174 独立代码审计

- 日期：2026-10-01（Asia/Shanghai）。
- 审计对象：`codex/issue-174-selection` 工作区相对 `origin/main` 的图库选择实现、服务端读取接口、单元/集成测试及浏览器专项。
- 方法：实际读取 `AGENTS.md`、`using-agent-skills`、`code-review-and-quality`、`vercel-react-best-practices`；先检查测试，再检查生产实现和调用路径。没有以实施者总结代替代码检查。
- 需求依据：[T-LIB-05](../../tasks/m3-m4-experience.md#t-lib-05-跨页显式选择与已选清单)、[library §7](../../specs/SPEC-library.md#7-选择与批量操作)、[设计交付规范](../../design/handoff.md)、[执行约定](../../tasks/execution.md)。

## 当前结论

代码审计通过。初审发现的失效卡片 P2 已在本次修复并独立复审；最终浏览器夹具的外键删除顺序问题也已复现、修复与验证。浏览器专项的版本 URL 断言已修正。当前没有未解决的本次范围内 P1/P2；短视口的源码修复与最终真实浏览器专项均已独立复核。完整浏览器执行与设计还原由对应记录给出结论，本审计不替代设计验收或用户人工验收。

## 初审问题及复审结果

### P2：已确认失效的图片仍能通过旧卡片重新加入选择

`useSelectionReconciliation` 仅移除选择 Map 中的失效项。领域变更通知按既定交互保留已有列表，`useLibraryQuery` 仍缓存旧卡片。核对结束后，勾选或当前页全选可把刚确认删除、回收或离开筛选的 ID 重新加入；选择动作不触发下一次核对，因此它可以继续存在于清单中。

复现路径：当前页选择 A → 另一窗口回收 A → 发出图库变化通知 → 核对移除 A → 再次勾选旧卡片 A。另一个路径是第一页选择 A → 第二页核对确认 A 失效 → Back 回缓存第一页 → 勾选 A。

修复：核对成功后调用 `onSelectionInvalid`，仅移除同一 filters 下分页/加载更多的缓存卡片。保留服务器最后读取时间、total、排序和 cursor，并标记显式刷新；不自动补页，不丢弃其他查询缓存。

复审：实际读取新的缓存更新与 `query-hook.test.ts` 回归。测试覆盖两张分页缓存、加载更多批次、不同查询隔离、cursor/pageParams 保留、dataUpdatedAt 保留及没有新 fetch。旧实现的失败证据见 [cache-before.txt](./cache-before.txt)，独立重跑包含该回归的 20 项单元测试通过。最终专项已实际通过可见失效卡片移除与缓存页历史路径；独立读取最终报告的请求记录和断言，确认其他页有效选择保留，缓存的回收/不匹配卡片不再恢复。

### 测试有效性：按真实 delivery URL 检查图片版本预读

浏览器专项初稿通过 pathname 中的 `/original` 等文本检测原图请求，但实际版本链接是 `/i/{id}?type=original`。此断言捕获不到真实版本请求。已修正为检查所有 `/i/` 资源必须显式为 `type=thumbnail` 且不含 `download`。实际读取修正后的断言，确认可拒绝默认版本、original/compressed/watermark 及下载请求。最终专项夹具为 4 个独立记录补入真实 PNG 缩略图字节和版本，其余记录仅含元数据。实际读取新增断言：桌面/手机浅深色截图前，图库与清单各须有至少两张 complete 且 naturalWidth > 0 的图片。资源断言允许缩略图，拒绝默认/其他版本与下载。该专项不替代其他媒体格式或图片处理全流程验证。

### 最终 E2E 夹具复核：有缩略图记录必须先删除关系

为记录 `library174-selection-000` 增加缩略图版本和对象后，原先直接删除 `media_images` 会被现有外键拒绝。使用实际生产迁移和独立临时 SQLite 数据库复现，得到 `SQLITE_CONSTRAINT_FOREIGNKEY: FOREIGN KEY constraint failed`。随后按版本→对象→图片的顺序删除，三个表的该夹具记录归零，外键保持启用。原始输出见 [e2e-fixture-delete.txt](./e2e-fixture-delete.txt)。

已只修正该明确夹具删除点。`finally` 保留同样的版本→对象→图片→存储顺序，并删除独立缩略图目录；文件读取、写入与清理都限制在运行器的临时 dataDirectory。fetch 包装恢复、延迟响应释放、主题恢复及浏览器尺寸重置仍保留。本次没有操作 Ego 或运行重型全量检查。

最终缓存历史断言已实际读取：当前页失效卡片消失，旧第二页的回收/不匹配项不再有卡片与勾选入口，Back/Forward 保留有效选择并不恢复这些项。真实 API 成功核对与故障/迟到响应注入清楚区分；最终实际运行状态继续由浏览器报告负责。

### 短视口清单修复复审

实际查看修复前的 390×560 浅色页面截图，235 项清单的正文被压缩为细线，不能查看或移除行。原有“挂载 20 行”“按钮尺寸 44px”断言不能发现祖先滚动容器仅剩约 4px 的问题。

已独立阅读最终 `openPanel`：仅对带分页清单，在 trigger 相对 main 的上下可用空间均小于 224px 时，先用即时 `scrollIntoView` 给锚定 Popover 腾出空间，下一动画帧再打开既有控件。224px 来自标题、分页、至少一整行、间距/内边距及定位余量；单页与空间充足的桌面/手机不触发。该修复不更换 Modal、不增加定位库或持久布局状态。Escape 关闭与 preventScroll 回焦逻辑仍保留。

首版同步打开在真实浏览器中再次失败：Popover 已挂载且高 224px，main 滚动 148px 后清单关闭。实际读取 [scroll-close.json](./before/scroll-close.json) 与已安装 React Aria 3.52.1 的 `useCloseOnScroll.mjs`，确认它在浮层打开时监听祖先的 capture scroll 并关闭浮层。

最终源码只把不足空间分支的打开延至 `requestAnimationFrame`，使即时滚动事件先完成；普通分支继续同步打开。没有新增长期计时器、DOM监听器或状态模型，既有查询身份 key 仍卸载旧清单。该调整解决的是已复现的框架时序，而非凭猜测加保护层。

最终浏览器脚本已加强正文高度至少一整行、首行名称/来源可见、真实鼠标滚轮展示非首行、查看/关闭详情保留数量、移除该行以及 Escape 回焦。独立读取最终 [selection-reconciliation.json](./final-browser/library-selection-reconciliation.json)：顶层与核对结果均为 `passed`，28 张截图，37 条列表/核对请求记录。成功核对读取真实 API；503 故障保留全部选择，迟到成功响应记录 aborted=true 且没有恢复旧选择。批次始终是 1–200 个明确 ID，资源只出现明确 thumbnail 类型的 `/i/` 请求。

实际查看最终浅色 390×560 的 235 项清单与深色滚动后清单截图，首行名称、来源、查看/移除区域均完整显示，清单保持打开。报告的真实鼠标滚轮、非首行查看/关闭详情、逐项移除和 Escape 回焦断言全部通过，短视口 P2 已解决。本审计读取实际输出并核对脚本/截图，没有自行操作 Ego，也不把 28 张截图数量当作通过依据。

## 五轴审计

| 轴             | 检查与结论                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正确性         | 当前页增减、跨页保留、查询身份清空、轻量投影已有行为测试；新增服务端测试覆盖删除、回收、删除中、离开筛选、相册/标签关系改变、停用存储和失效引用。明确失效卡片从同查询缓存移除，新增回归已通过。                     |
| 可读性与简单性 | 核对逻辑独立在 `use-selection-reconciliation.ts`；服务器读取独立在 `selection.ts`；复用现有查询 schema/predicate，不新增通用批量引擎、业务兼容路径或新依赖。                                                        |
| 模块职责       | library 只读取 media/collections/storage 的当前字段；不维护第二份图片索引或新增业务数据表。选择类型只保留 ID、名称、缩略图 URL 和存储信息。                                                                         |
| 安全边界       | API 沿用真实所有者 Cookie、既有 Origin 检查和 `no-store` 响应；测试拒绝匿名、Bearer、分享 Cookie、错误 Origin、非法 JSON 和非法输入。SQL 使用 ORM 参数，不暴露媒体对象 Key。                                        |
| 性能与生命周期 | 客户端每批至多 200 个明确 ID，顺序读取；服务器限定 ID 后复用关联谓词和缩略图存在性查询，不读文件或 HEAD 存储。不预读所有分页。effect 清理中止请求，query identity 阻止旧响应写回，BroadcastChannel 订阅在卸载关闭。 |

## 实际执行的审计检查

环境：macOS，Node 24.18.1，pnpm 11.19.0。审计执行以下命令，均在当前工作区运行：

| 命令                                                                                                                                                                 | 实际结果                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm exec vitest run --project unit tests/unit/library/selection.test.ts tests/unit/library/selection-reconciliation.test.ts`                                       | 2 个文件、13 项测试通过。                                                            |
| `pnpm exec vitest run --project unit tests/unit/library/selection.test.ts tests/unit/library/selection-reconciliation.test.ts tests/unit/library/query-hook.test.ts` | 修复复审重跑：3 个文件、20 项测试通过。                                              |
| `git diff --check`                                                                                                                                                   | 通过，没有空白错误。                                                                 |
| `pnpm exec vitest run --project integration tests/integration/library/selection.test.ts tests/integration/library/selection-http.test.ts`                            | 2 个文件、10 项测试通过；HTTP 测试启动已构建的 standalone 服务并使用独立临时数据库。 |

最终 E2E 复核另外执行：

| 命令                                                                         | 实际结果                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `node --input-type=module`（内存数据库读取外键配置）                         | 确认运行器使用的 better-sqlite3 默认 foreign_keys=1。                                      |
| `node --input-type=module`（实际生产迁移的临时数据库复现脚本）               | 直接删图片预期失败；版本→对象→图片顺序成功，三表归零；连接与临时目录在 finally 关闭/删除。 |
| `node --check e2e/library-selection-reconciliation.mjs`                      | 通过。                                                                                     |
| `pnpm exec prettier e2e/library-selection-reconciliation.mjs --check`        | 通过。                                                                                     |
| `pnpm exec eslint e2e/library-selection-reconciliation.mjs --max-warnings=0` | 通过。                                                                                     |

短视口源码复审另外执行 `pnpm exec eslint src/app/library/library-selection-menu.tsx --max-warnings=0`、`pnpm exec prettier src/app/library/library-selection-menu.tsx --check` 和 `git diff --check`，均通过。

首次聚焦 unit 误用默认 Node 26.10.0 也通过，随后切回规定的 Node 24.18.1 重跑；Node 26 结果不作为交付依据。完整格式、lint、typecheck、构建、全量测试和浏览器的结果由主实施记录维护，本审计不把未自行执行的命令标作通过。

## 其余边界

批量关系/可见性/回收操作、复制、下载、Lightbox 等由相关后续任务承接。没有把选择清单或该只读核对 API 描述为这些动作已完成。

本次没有发现需增加安全抽象的具体威胁，也没有独立确认的范围外 P1/P2。物理设备、镜像/容器发布验证和用户人工 UI 验收未由代码审计执行。
