# DG-ANALYTICS 独立契约与质量审查

日期：2026-10-09。审查工作区：`/Users/dnslin/.codex/worktrees/issue-129-analytics-design/ariso`。使用已实际读取的 `code-review-and-quality` 和项目 AGENTS.md。本审查只写本文件，未修改其他文件，未重复运行应用或文档检查。

## 结论

文档内容结论：**Approve**。未发现 Critical / Required。提交前仍须将 README 中尚待记录的本地检查、独立设计适用审查和 PR 状态更新为实际结果；本内容审查不代替这些步骤。

审查了四份现行文档增量、DG-ANALYTICS README、Issue/原生依赖快照、Figma nodes/states/screenshots JSON。另读生产查询、用量、HTTP、刷库健康、media 数量、图库/回收详情调用链与类型，以及关联测试和 #168/#169 验证记录。55 个状态记录 ID 唯一且均有完整文案记录，16 个截图清单明确为设计截图。Figma 实时访问及视觉对照由独立设计适用审查承担，本审查不声称已完成产品浏览器或设计交互验收。

## 契约与需求覆盖

- [消费结论](../../m3-m4-experience.md#dg-analytics-对-t-ana-05-的核对结论)正确区分 overview、独立 usage 和单图统计；单图没有逐日趋势或周期三版本拆分。与 `src/server/analytics/queries.ts:133-143,175-188` 和 `usage.ts:62-77` 一致，没有从设计样例添加不存在的字段。
- 正常/私有、停用、回收/删除中/清理失败及永久删除排行分别使用实际身份和管理目标。回收名称/缩略图与永久删除全部链接为空，历史数字保留；与 `queries.ts:68-88` 及 `tests/integration/analytics/reports.test.ts:375-488` 一致。
- `src/app/library/use-detail-navigation.ts:7-14` 和 `src/app/trash/trash-screen.tsx:69-106` 已消费 image 参数，管理详情实际只读 `/api/images/{id}`；`src/server/library/detail-types.ts:46-92` 没有统计字段。文档正确将统计组合留给 #179，没有改动 library 的职责。
- 异常 counts 没有图片 ID 列表；ready 图片的最新重处理失败不会被 status=failed 筛出。文档登记了明确的导航缺口和 #179 责任，没有虚构查询参数。依据 `src/server/media/usage.ts:32-39`、`src/server/library/query-schema.ts:52` 和 SPEC-library 查询契约。
- HTTP 400/401/404/500、private/no-store、真实故障不补零、健康状态和近似边界符合 `http.ts:10-58`、`queries.ts:37-47`、`flush.ts:109-122`。空库 idle/null、未刷增量、已发生漏计与空间待核对分开。
- URL days、10 秒可见轮询、隐藏暂停、恢复读取、迟到请求、注销缓存、旧值标注、等价数值表与导航返回明确属于 #179 的待实现及真实验收职责。没有以既有服务端检查代替 UI 交付。

## 范围与证据有效性

现行变更限于消费任务、设计前置记录、设计索引和验收索引；无产品代码、依赖、配置、SPEC 或冻结 PRD 修改。Issue 快照和原生依赖快照支持“无前置、唯一消费者 #179、消费者另四个前置 closed”的结论。没有将 #129 文档核对解释为 #179 或 DES/RG 完成。

OwnerShell 的 /admin 和 /analytics 仍禁用，/admin 鉴权后跳上传；无 /dashboard 或 /analytics 页面。文档准确表达这个现状。缺失单图布局、精准导航、长名/十项、真实元信息及图表/刷新交互均有具体证据和负责人，后续新增交互须先原型获批，没有在本次文档中决定新视觉方案。

格式、任务结构和链接检查由实施者执行并保存原始结果；本审查未重复执行。纯文档没有新增程序条件或行为测试，因此条件变异实验不适用。浏览器 full 计划当前没有 analytics 阶段，现有 analytics 集成测试被默认 integration include 收集；文档要求 #179 接入默认流程，未修改 suite/only 分派。#169 的 1727/1728 完整集成失败仍明确保留，没有被定向复验或审查结论改写。

五轴审查结果：正确性与模块边界一致；表达能区分现状、设计样例和计划；复用统一交接/执行规范，没有新建规则；证据不含测试账号、密码或存储凭据；没有业务性能或资源生命周期变化。无范围外修复建议。
