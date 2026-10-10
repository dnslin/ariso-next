# PR #273 结构与可维护性独立评审

日期：2026-10-10。使用 `thermo-nuclear-code-quality-review`，并实际读取项目 AGENTS.md、docs/README.md、任务执行约定、完整设计交接、analytics/library 规格及 React 性能技能的相关规则。评审固定输入：

- Base：`f4c0fecd046c301bfd4dddd97549a367ab046093`。
- Head：`87bba340c856624b9e017e061305d1ebd35d2c32`。
- PR：[dnslin/ariso-next#273](https://github.com/dnslin/ariso-next/pull/273)。

**结论：Request changes。1 项 Required / P2，未发现 Critical / P1。** 用户本轮明确人工验收通过；这不替代对未覆盖分支与模块契约的评审。本评审没有修改产品源码、执行浏览器或重复既有测试；下述发现来自固定 head 的完整静态调用路径确认，未新增浏览器复现。

## Required / P2：新增异常筛选未接入图库空结果判定

位置：`src/app/library/library-screen.tsx:245–257`，消费位置 `:493–525`；本 PR 新增异常类型入口位于 `:326–354`。

在图库已有正常图片、指定异常类型没有匹配图片时，打开 `/library?failure=initial` 或 `/library?failure=reprocess`，服务端与列表查询会正确返回 `total=0/items=[]`。但是 `filtered` 只枚举旧筛选字段，遗漏本 PR 新增的 `query.filters.failure`。该场景因此沿用“图库还没有图片 / 上传第一张图片”的空库文案，并不提供既有“清除筛选”按钮。相册直接使用相同 failure 查询时也会误称相册为空。用户看到的空库事实与实际数据不一致。

静态调用链：`parseLibraryLocation` → `libraryQuerySchema` 将 failure 保留在 filters → `useLibraryQuery` 将其传入请求与 query key → `mediaProcessingFailure` 正确筛出当前异常 → `LibraryScreen` 的旧字段枚举将这个真实筛选误判为未筛选 → 空结果分支选错文案与操作。`e2e/analytics-consumers.mjs:157–184` 当前两类都使用有匹配项的样本，未覆盖异常为零而图库非空的组合。

这是同一个查询模型在新增字段和旧展示条件之间未闭合的问题；无需重新设计交互或创建通用筛选框架。最小修复是在现有 `filtered` 条件纳入 `query.filters.failure`，补“有正常图片但指定异常为零”的回归，验证既有匹配空态与“清除筛选”操作；清除后应回到真实现存图片。保留失败类别切换、现有 API 和其他筛选行为。

## 覆盖与结构结论

本次检查整个 PR 相对 base 的源码、测试、配置和模块接入，未以最后一次局部标签提交代替完整 PR 审查。

| 范围                 | 实际核对与结论                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| analytics 页面与读取 | 检查新增页面、screen、查询选项/共用 hook、JSON 日期类型与 HTTP 错误边界。查询客户端由页面持有；TanStack Query 承担取消、查询身份、轮询与可见性，未自建第二套调度/缓存。`useAnalyticsQuery` 的封装承载 client mount/unmount 与禁止取消进行中刷新两项实际约束，不是空透传层。                                                                     |
| 展示与图表           | 检查 overview、usage、popular、daily、scope、单图统计、两种图表及逐位数字组件。业务内容按职责拆分，图表动态加载；HeroUI/Lucide 组合延续现有栈。三个单图周期明确为合计，没有引入虚构日序列或新的后端模型。组成完整性与存储启停分离，没有增加状态机或兼容模式。                                                                                   |
| 图库/回收与会话      | 检查页面层统计组合、详情入口、query 启停与 sessionEnded 生命周期。统计业务没有进入 library 服务或共享 shell；公共组件只接回调。终止状态用于先停 observer 再清缓存的实际竞争，不建议将其删除成单纯衍生错误值。异常空结果遗漏见上方必修项。                                                                                                       |
| 失败口径与排行       | `mediaProcessingFailure` 位于 media 并被 usage counts 与 library predicate 共用，避免独立复制“最新 process 失败”口径。可选 SQL 投影保留既有批量 latest-job join，并非吞错回退。排行先排除不存在的实体再取十项，历史聚合未被删除；未加第二份资产/排行清单。                                                                                      |
| 导航与快照           | 返回地址限定实际 analytics/dashboard 周期，页面层只保存 source、imageId、scrollTop。恢复使用可取消的一次 animation frame，真实目标出现后才消费快照；未保存完整图片及关联对象。无需为这一受控内部结构再加版本兼容、通用持久化或额外校验框架。                                                                                                    |
| 浏览器编排与资源     | 检查 analytics 主入口、fixture、helpers、behavior、recovery、detail、consumers、owner-shell，以及 identity/workspace/library 定向接入。默认 full 调度 analytics，无 phase 时运行六项；定向参数仅进入所属场景。故障注入、时钟和夹具清理均有显式退出路径；stop-aware 控制避免接管后继续浏览器清理。新定向入口复用已有场景，不另维护产品行为副本。 |
| 配置与原型           | 核对依赖/锁文件增量、root ESLint/TypeScript 排除、全局主题变量与原型入口。原型样本和演示控件未进入产品 API；根排除针对独立原型产物/类型边界，没有排除产品源码或业务测试。Recharts 是初始实现依赖增量，后续局部提交“无新依赖”仅描述该局部，不据此声称整个 PR 没有依赖变化。                                                                      |
| 测试有效性与证据     | 静态检查 presentation/read/navigation 单元、failure 查询及排行集成、默认/定向运行器计划、真实浏览器场景。已有测试覆盖取消/迟到、可见性、重试、删除资格、独立异常口径及返回生命周期；新增 failure 空结果组合仍遗漏。没有把浅层字符串断言当作浏览器行为证明。                                                                                     |

未发现需要为保留行为而进行大规模重构的证据。已拆分的业务组件、规范查询层与场景模块可直接承担本功能；把现有分支集中进新的 dispatcher、状态机或通用统计配置，当前只会增加概念。两个图表共享库但数据含义与交互标签不同，少量 JSX 相似不足以支持新增通用图表抽象。

## 文件体积核对

实际对固定 base/head 的变更 `.ts/.tsx/.mjs` 用 Git 内容逐文件计数，不包含截图、日志和生成文件：

| 文件                                          | Base 行数 | Head 行数 | 判定                                                                        |
| --------------------------------------------- | --------: | --------: | --------------------------------------------------------------------------- |
| `e2e/analytics-behavior.mjs`                  |         0 |       819 | 新增，包含 representative 与 behavior；未越过 1000。                        |
| `e2e/analytics-image-statistics.mjs`          |         0 |       794 | 新增，按实际观察顺序、注入与清理组织；未越过 1000。                         |
| `e2e/identity.mjs`                            |       835 |       835 | 仅目的地调整，未增长。                                                      |
| `e2e/owner-shell.mjs`                         |       590 |       604 | 消费路由与正文起点断言的必要增量。                                          |
| `scripts/verify-browser.mjs`                  |      1076 |      1079 | base 已超过 1000；本 PR 仅新增三条报告名，不将 analytics 编排塞入该大文件。 |
| `src/app/library/library-screen.tsx`          |       577 |       679 | 详情统计、异常入口及实际会话生命周期接入；没有跨过 1000。                   |
| `src/app/trash/trash-screen.tsx`              |       792 |       839 | 同上，未跨过 1000。                                                         |
| `tests/integration/analytics/reports.test.ts` |       662 |       677 | 排除删除前十与保留历史的关联断言。                                          |
| `tests/integration/identity/auth.test.ts`     |       615 |       634 | 工作台默认目的地与认证回归。                                                |
| `tests/integration/library/query.test.ts`     |       660 |       793 | 当前异常口径、范围、邻居、选择与分页的真实查询测试。                        |

没有文件被本 PR 从 1000 以下推到以上。新增最长两个场景文件是观察步骤较多，并没有把产品业务逻辑复制进去；不单凭长度要求改动无关模块。已有大运行器应由其自身后续维护范围处理，本 PR 的报告名增量不构成新的架构退化。

## 验证边界

本次实际执行的是只读 Git diff、固定版本内容读取、文件行数核对及调用链/证据核验，并对本报告执行 `pnpm exec prettier --write docs/verification/analytics-179/pr-review-20261010/structure-review.md`（退出0）；未运行单元、构建、浏览器、发布或容器检查，未执行变异实验。另一评审者的实验不记作本评审执行。

已阅读原实施与占用页局部验证记录，确认本地通过项、全量集成曾有 1 项 ECONNRESET、历史默认浏览器 14 项失败与后续定向通过分开记录。当前 behavior 的 runner/analytics 报告为通过，临时目录及 fixture 恢复有实际记录；这些报告不证明上述未覆盖空结果组合，也不证明默认全量重新全绿。本次结构评审不重新作 Figma/页面视觉评审。

本报告评审输入保持上述固定 head。必修项未修复前不批准该 head；修复后应只复核相关空结果与清除行为及受影响验证，不机械重跑无关检查。
