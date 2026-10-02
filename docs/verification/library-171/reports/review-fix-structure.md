# PR #227 修复后的独立结构复审

结论：**原两项 P2 / Required 已关闭；复审中发现的手写 React hook 测试运行器也已移除并关闭。当前修复通过本轮源码结构复审，没有遗留的高置信 Required。** 没有新增产品架构阻塞项。未列格式问题或低价值拆分建议。这一结论不包含运行或设计验收。

评审仓库为 `/Volumes/data/project/ariso-issue-171`。HEAD 仍为 `6c1cb7ff85fd43b5bbcd1545ed24e9232da3162b`。本报告评审的是该提交之上的未提交修复及新增文件，不是一个已冻结的新提交。以下引用是复审读取时工作区的 1-based 行号。复审延续已实际读取的 `thermo-nuclear-code-quality-review`、`using-agent-skills`、React 最佳实践、项目 AGENTS.md 与设计/执行约定；不沿用历史通过结论。

## 复审新增 Required 已关闭：测试不再自制 React 运行器

中间版本曾用 `vi.mock('react')` 重写 `useState`、`useRef`、`useEffect`，自行维护槽位、依赖比较、cleanup 和最多 10 次同步重渲染。这会把 React 生命周期变成项目额外维护的测试框架，也无法证明真实 React 的挂载和异步执行语义。我已将它作为 P2 / Required 返回主任务。

最终完整回读 [reprocess-recovery.test.ts:1](/Volumes/data/project/ariso-issue-171/tests/unit/library/reprocess-recovery.test.ts:1) 确认上述运行器、React mock、模拟 renderer 和手动 effects 循环已全部删除。407 行测试直接导入并调用生产模型，覆盖新匹配任务的五种阶段、旧任务排除、实际提交范围、已知 receipt 身份、核对前后恢复资格、活动任务阻止恢复和阶段推导。它不再声称完成异步挂载、切图 cleanup 或焦点的单元实测。

[detail-reprocess-model.ts:37](/Volumes/data/project/ariso-issue-171/src/components/library/detail-reprocess-model.ts:37) 的 `reprocessAvailability` 是从 hook 收拢的真实可用性规则；[use-detail-reprocess.ts:142](/Volumes/data/project/ariso-issue-171/src/components/library/use-detail-reprocess.ts:142) 直接消费它，旧的同一套表达式已从 hook 删除。`resumeReprocessState` 也被 [use-detail-reprocess.ts:260](/Volumes/data/project/ariso-issue-171/src/components/library/use-detail-reprocess.ts:260) 的实际恢复动作调用。因此测试与产品没有各存一套派生逻辑，也没有新增通用状态容器、测试依赖或框架。该 Required 关闭。

纯模型测试的结论只适用于状态规则。真实提交次数、worker 结果和回焦仍由已经保留的真实 E2E 断言承担；本轮这些场景未运行。挂载期间竞态及 cleanup 不能因纯模型测试存在就记为已验证。

## 原 Required 1 已关闭：重处理阶段与动作收回控制器

核对了 [use-detail-reprocess.ts:76](/Volumes/data/project/ariso-issue-171/src/components/library/use-detail-reprocess.ts:76)、[detail-reprocess-model.ts:156](/Volumes/data/project/ariso-issue-171/src/components/library/detail-reprocess-model.ts:156)、[library-screen.tsx:157](/Volumes/data/project/ariso-issue-171/src/app/library/library-screen.tsx:157)、[detail-reprocess.tsx:275](/Volumes/data/project/ariso-issue-171/src/components/library/detail-reprocess.tsx:275) 和 [detail-reprocess-confirmation.tsx:20](/Volumes/data/project/ariso-issue-171/src/components/library/detail-reprocess-confirmation.tsx:20)。

- `reprocessView` 一次推导 selection / all-queued / result，并以 `receiptJob` 匹配实际受理任务。原先正文和底栏重复的完整结果判定已经删除。
- `canSubmit`、`choicesDisabled` 和恢复资格由同一个生产模型计算，hook 统一产生 footer actions。确认层与底栏不再各自组合 pending / unknown / query error / scope 的规则。
- `open()` 负责匹配终态后的复位。父列表只交付导航回调和渲染插槽，不再比较 jobId 或识别三种任务终态。
- 详情数据是否仍可用于重处理由控制器决定。父列表不再需要“读取错误但 reprocess 可以保留数据”的例外表达式。
- 确认组件使用明确的 `Pick<DetailReprocessController, …>` 控件契约，不再接收整个 query hook 的 `ReturnType`；footer 仅消费动作列表。`receiptJob` 已移入纯模型，而且真实产品路径确实使用它，没有遗留旧 UI 导出。

这次删除了多个组件各自决定同一业务状态的维护点，满足原 finding；不是仅把长 JSX 搬走。保留 receipt、submitted 的范围和前任务 ID、核对结果与未知受理状态有当前行为依据，不能为了减少字段把本次受理和“最新任务”混为一谈。纯模型不保存派生 view；React Query 仍负责查询，未新增全局状态库或通用业务框架。

最终读取时的文件增长为：父列表 483→463 行，正文与底栏文件 378→299 行，确认层 106→118 行，结果组件 224→219 行，hook 111→381 行，纯模型 0→184 行。hook 的增长包括明确边界、动作归属，以及本轮新增的未知受理核对恢复。其责任集中在同一处理流程，不能仅凭总行数增加判定退步。此次拆分实际减少了跨组件协调点。

## 原 Required 2 已关闭：浏览器场景形成独立的准备与清理边界

入口 [library-detail-171.mjs:34](/Volumes/data/project/ariso-issue-171/e2e/library-detail-171.mjs:34) 从 2056 行缩为 48 行，仅组合和导出 verifier。另有 13 个窄模块；场景最大 300 行，共用 helpers 为 252 行、布局测量为 228 行。原来 1285 行的 `verifyReprocess` 及它共享的巨大闭包已消除。

逐个完整读取后的边界如下：

| 场景               | 独立准备及恢复依据                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 字段、关系、元数据 | 字段与关系保存原值并在 finally 恢复；临时 album/tag 单独清理；metadata 自己制造 unread 起点并恢复旧记录                   |
| 版本与确认         | 版本场景只依赖 runner 明确 seed 的 original/compressed；确认自己启用设置并恢复，fetch 计数注入有局部 finally              |
| 真实处理           | 自己设置 failed 起点，验证真实全部任务及同图第二次单项任务；局部恢复 fetch、设置和图片原状态                              |
| 受理响应丢失       | 显式准备四版本，真实 POST 受理后丢响应，真实 GET 读取任务；自身恢复 fetch 与设置                                          |
| 请求未到服务端     | 自己保存任务和对象起点，阻断 POST；核对仍无新任务后才允许显式恢复；finally 恢复注入及设置                                 |
| 下载、禁用、导航   | 都显式调用真实四版本准备，不再等待“真实处理场景”留下水印图；禁用恢复设置，导航恢复原列表布局                              |
| 持久任务展示       | 自己保存 job/image，创建真实候选文件；finally 恢复 job/image 并删除候选记录和文件                                         |
| 上传及相册消费者   | 自己执行真实上传、建立临时相册并在 finally 删除相册；接受的上传内容留在 runner 的 disposable DATA_DIR，这一边界有注释说明 |

[prepareDetail171Versions:61](/Volumes/data/project/ariso-issue-171/e2e/library-detail-171-helpers.mjs:61) 在缺版本时走真实 all-scope POST 和 worker，按回执 ID 等待终态，检查 succeeded、expectedVersions、四个 saved 版本与原图对象不变，再恢复设置。没有 mock 成功响应，也没有把产品数据构造移到一个隐含闭包中。`seedLibraryDetail` 实际提供版本展示场景所需的 original/compressed，故它不依赖别的 verifier 生成派生内容。

核对的核心断言保留了：真实对象替换且原图不变、同图第二任务、只提交一次、状态轮询停止与手动恢复、四版本下载字节与 filename、多主题尺寸与 44px 控件、确认取消/Escape/回焦、来源过滤/选择/布局/滚动/触发焦点、上传队列和相册消费者。

原断言中“成功 GET 后仍永远保持 unknown”的部分按本轮修复契约替换为“认领新且同范围的真实终态任务”；新断言同时检查回执 ID、scope、实际成功、仅缩略图对象变化、数据库只增加一个任务。新增未受理场景检查没有新任务或对象变化、必须显式恢复、恢复不发第二次 POST。因此没有把核对失败或未知受理改成无条件成功。静态 `assert.*` 计数从 181 处增到 201 处，仅作为辅助核对，不作为行为等价证明。

以上独立性结论来自源码的数据流、准备函数与 finally 边界。**本轮没有单独执行这些场景，不能宣称已用真实浏览器证明任意顺序运行通过。**

## 实际检查与未验证范围

本轮完整读取入口与 13 个新 E2E 模块，逐段对照冻结 HEAD 的旧脚本；读取父列表、query hook、reprocess hook、纯模型、正文、结果、确认组件及请求函数；读取变更的静态渲染测试、结果测试与新增恢复测试，并核对 package、Vitest 配置、基础 seed 和 handoff 中的本轮恢复契约。最后又完整读取了移除运行器后的 407 行恢复测试、184 行模型和 381 行 hook，确认上述新问题已消除。未重新审计冻结产品选择或明确未实施的 UI。

实际执行仅为只读命令：`git status --short`、`git diff --stat`、指定文件的 `git diff` / `git show`、`git rev-parse HEAD`，以及 `cat`、`sed`、`rg`、`nl -ba`、`wc -l` 和 Python 静态行数/断言计数。读取成功，HEAD 与冻结值一致。没有运行测试、syntax、lint、typecheck、build，没有安装依赖。

没有浏览器、Ego、CDP 操作，没有读写用户预览数据库，没有修改仓库、提交、推送或写 GitHub 评论。本报告仅写到指定 projectless 报告目录。

**真实浏览器未运行，当前确认与恢复 UI 的设计未验收。** 本报告关闭的是原结构问题；不能替代运行验证或设计验收，也不把此前的执行结果记作本轮通过。
