# PR #227 修复增量独立代码复审

结论：**本次代码修复增量可接受，未发现新的 Critical / Required。** 原 `6c1cb7` 质量报告的 P2「成功核对终态后仍无法退出 unknown」已在当前实现与纯模型回归中闭环。共享阶段、提交条件和底栏动作的结构问题也已按拥有业务状态的控制器收拢。结构审计本轮指出的自建 React 测试执行器已移除，本评审复查了替换后的最终用例。这个结论不代表浏览器运行、设计或整项 Issue #171 验收通过，PR 仍应保留草稿等待已有缺口与人工验收。

## 身份与范围

- 评审者：独立 agent `/root/fix_code_audit`，没有参与本轮实现。
- PR：<https://github.com/dnslin/ariso-next/pull/227>。
- 工作目录：`/Volumes/data/project/ariso-issue-171`。
- 复审基点：`6c1cb7ff85fd43b5bbcd1545ed24e9232da3162b`；审查其后的当前未提交修复差异，不重审此前整项产品选择。
- 已读取 `AGENTS.md`、`using-agent-skills`、`code-review-and-quality`、`vercel-react-best-practices`，以及 `docs/design/handoff.md`、`docs/tasks/execution.md`、`SPEC-library.md` 中 unknown 核对和可恢复反馈要求、原质量报告。
- 实际阅读新模型、控制器、页面集成、范围页与确认组件、结果组件及相关单元测试；补读原详情 GET/status 查询与图切换导航、POST 请求和服务端任务详情类型；静态核对新的丢失响应和未受理 E2E 场景。
- 超长 E2E 的完整拆分与场景独立性由结构角度的另一份审计负责。本报告只核对其中两段恢复断言是否表达产品契约。

## 原问题处理与五轴判断

**正确性。** [detail-reprocess-model.ts:111](/Volumes/data/project/ariso-issue-171/src/components/library/detail-reprocess-model.ts:111) 使用提交时的范围和提交前最新任务 ID 区分随后出现的对应任务；在成功核对时接受其 queued / running / succeeded / failed / cancelled 真实阶段，不再只认领活动任务。它不会把同一历史任务或不同范围的任务当成本次结果。普通已有活动任务的发现仍保留 ready / failed 边界，首次上传处理不被误认成单图重处理；本次明确提交的首次失败重试可以在图片仍为 processing 时恢复。

[detail-reprocess-model.ts:37](/Volumes/data/project/ariso-issue-171/src/components/library/detail-reprocess-model.ts:37) 只在 unknown、已成功核对当前详情、没有活动任务、没有读取错误或进行中的请求时开放人工恢复；[detail-reprocess-model.ts:68](/Volumes/data/project/ariso-issue-171/src/components/library/detail-reprocess-model.ts:68) 只清到默认全部范围，没有 POST，hook 的 resume 实际调用该函数。查询失败不会解除 unknown，cancel / choose / open 也不会偷偷解除 unknown。新任务认领和已知 receipt 的呈现分开，后者继续只接受精确 job ID。

**生命周期的源码检查。** [use-detail-reprocess.ts:146](/Volumes/data/project/ariso-issue-171/src/components/library/use-detail-reprocess.ts:146) 对详情核对使用当前图 ID 和本次核对 token；切图或卸载失效 token，不应用迟到 GET。POST 使用 AbortController、当前图 ID 和当前请求身份共同限制后续状态写入，切图或卸载中止本次请求。处理范围在发 POST 时保留，后续换范围不会改变该请求的归属依据。后台/focus 刷新也走同一任务观察逻辑。没有以纯模型用例声称这些异步/React 生命周期已运行验证。

**可读性与架构。** [detail-reprocess-model.ts:156](/Volumes/data/project/ariso-issue-171/src/components/library/detail-reprocess-model.ts:156) 是正文与底栏共享的阶段来源；[detail-reprocess-model.ts:37](/Volumes/data/project/ariso-issue-171/src/components/library/detail-reprocess-model.ts:37) 是实际提交、弹窗按钮和底栏按钮的同一可提交条件；[use-detail-reprocess.ts:291](/Volumes/data/project/ariso-issue-171/src/components/library/use-detail-reprocess.ts:291) 生成底栏动作。重新进入时的终态重置由控制器 `open` 负责。[library-screen.tsx:159](/Volumes/data/project/ariso-issue-171/src/app/library/library-screen.tsx:159) 只连接路由与渲染来源，不再检查 job 终态或确认状态。Footer 只渲染动作，确认组件接受窄控制属性；原依赖整个 query hook 返回值的 props / 测试强制类型转换已移除。`receiptJob` 现在位于纯业务模型；模型执行精确匹配，结果组件消费匹配后的 job，结果测试使用同一模型 helper。不产生 hook→UI 反向依赖。没有新增状态机框架、依赖或兼容层。

**UI 交互的代码检查。** [detail-reprocess.tsx:32](/Volumes/data/project/ariso-issue-171/src/components/library/detail-reprocess.tsx:32) 让 cancel 继续保留已选范围；manual resume 清到 all 后复用同一两帧回焦逻辑，存活且可用的范围控件优先，否则回标题。待提交时 Esc 和 cancel 继续阻断。确认几何、信息摘要与正常控件样式沿用已授权的紧凑弹窗方案。新恢复动作仅在真实错误区域出现，采用现有 HeroUI Button 和 44px 高度；错误和必要操作结果没有收进 Tips。这里仅是源码检查，不能证明真实浏览器的焦点恢复或样式已通过。

**安全与性能。** 本轮没有新增 API、存储契约、日志、秘密输出或依赖，仍沿用现有已鉴权接口。没有自动重新发 POST、额外全局 listener、无界轮询或后台重试框架。模型的任务匹配与四种输出选择是有界计算；与既有查询联动没有新增逐行/逐版本请求。没有进行规模测量。

## 测试有效性与执行边界

已静态阅读最终 [reprocess-recovery.test.ts:96](/Volumes/data/project/ariso-issue-171/tests/unit/library/reprocess-recovery.test.ts:96) 起的 31 项纯模型回归。它们直接测试生产 `observeReprocessDetail`、`reprocessAvailability`、`resumeReprocessState`、`reprocessView` 和 `receiptJob`，没有 mock React 或自建 hooks 执行器，涵盖：

1. 响应丢失对应任务五种真实阶段的认领，以及首次失败重试时图片仍为 processing 的 queued / running 恢复。
2. 相同历史任务、不同范围任务不会冒充结果；成功核对但无法归属时保留 unknown，人工 resume 才清到 all；未核对数据不构成恢复权限。
3. pending / checking / fetching / query-error / read-error，以及 process / metadata / 图片处理活动状态均锁定恢复；仅当前已成功核对的详情可恢复，detail 不可用或范围不可用时不能提交。
4. 已知 receipt 精确 ID、all-queued 与结果阶段匹配、首次上传和 dismissed job 边界、后续选择不覆盖提交时范围、恢复函数确实被生产 hook 使用。

单元覆盖对象是生产纯模型，不证明 fetch 请求次数、图切换的迟到请求、Footer 动作实际调用、取消、Esc、DOM 焦点或 HeroUI overlay 生命周期。这些内容本轮只有源码和浏览器脚本静态检查，运行部分仍待真实浏览器。两段 E2E 保留一次真实受理 POST / job / 对象身份断言，并更新了旧的永久 unknown 断言；本评审未执行它们。

**本评审实际执行：** 只读 `cat` / `sed` / `rg` / `nl`、`git status --short`、`git diff` / `git diff --stat`，并写入本报告。没有运行冻结安装、测试、格式检查、lint、类型检查、构建、浏览器、容器或远端检查，没有接触用户正在预览的 DATA。实施者本轮定向验证结果由主交付记录独立记录，本报告不将其称作独立执行结果。

主实现者与模型实现 agent 在最终文件冻结后告知：31 项恢复模型用例通过，模型/控制器/恢复测试三文件 lint 和格式通过，定向控制器依赖类型检查退出 0；主实现者此前运行的 UI 15 项继续保留当时结果而不重复。具体命令与日志由主交付记录维护，本评审没有独立重跑这些检查。

浏览器工具已有安全拒绝，本评审未尝试其他入口或绕过。最新 UI 没有本轮真实页面截图和人工验收结论；既有浏览器失败与未实现范围保持原记录。没有提交、推送、GitHub 评论、合并或关闭 Issue。
