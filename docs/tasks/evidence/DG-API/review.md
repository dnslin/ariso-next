# Issue #130 DG-API 独立质量审计

审计日期：2026-10-05（Asia/Shanghai）。审计工作区：`/Users/dnslin/.codex/worktrees/issue-130-api-design/ariso`；基线 `origin/main=d337f6f1`。使用 `using-agent-skills` 选择 `code-review-and-quality`。此审计没有编辑产品或任务文档，也没有重复运行实现者的应用检查。

## 当前结论

**Approve。** 已复读最终消费卡变化、README 的实际检查记录与独立设计适用审计。未发现 Critical 或 Required 问题。批准结论只覆盖 DG-API 文档核对，不代表两个生产消费任务或产品 UI 验收完成。

## 审计依据与范围

实际读取 AGENTS.md、docs/README.md、任务执行约定、设计交接完整正文、DES-06-API 待验收责任、能力地图、PRD §6.5/8.4/23.4/26.3、SPEC-identity §9–11、SPEC-upload §10，以及 DG-API、T-ID-08、T-UP-06 和直接前置任务卡。检查修改的 gates.md、m3-m4-platform.md 及新增 DG-API 的 README、issue.json、dependencies.json、figma/nodes.json、design-review.md。

独立 `gh issue view 130 --json number,title,body,comments,state,url` 和 dependencies API 回读确认 #130 开放且无评论、无 blocked_by，blocking 为 #166/#199。另外回读 #166/#199 的 blocked_by：#57、#144 已关闭，#165、#167 与 #130 尚开放，与证据摘要一致。

## 覆盖与正确性

- 两消费任务保留原需求 ID、模块归属和直接前置。identity 负责 Token 生命周期及所有者管理，upload 负责公共上传契约、OpenAPI 与示例；没有引入新业务 API、权限系统或额外状态表。
- 一次明文、关闭/离页/刷新/会话失效清理、复制成功保留页面及焦点、Clipboard 拒绝时手动完整文本均按原需求与用户偏好记录。没有把复制成功当成已保存，也没有持久化完整值或部分原文。
- 未知创建响应不自动重发，仅用已有 ID 数组识别新候选；同名、读取失败及多个候选不假报成功。未知启停/撤销先读取真实记录，未将断线等同于操作未发生。
- 默认无期限、UTC 与站点时区转换、短期/超过一年、`now >= expiresAt`、插件可能清理过期记录、撤销不删除旧图或已接纳任务与 SPEC 一致。
- 用法详情保留既有页面/折叠结构，确认 `/settings/api/usage` 为所有者子页。公开规范仅计划提供 `/api/openapi.json` 的公共上传契约；不把 Web 内部路由或 Token 管理纳入公开接口。最小/完整 curl、重复字段、所有错误、可空字段、私有链接和默认版本缺失均有消费责任。超时先核对与重复 POST 可能建新 ID 的提示保持常驻。
- 具体缺口分配到 T-ID-08/T-UP-06 与 P2-DESIGN，仅阻塞相关 UI 编排。文档明确新增交互需原型与批准；没有声称已补图、已批准或真实页面已验收。
- 最终变化已经把 T-UP-06 的界面字段同步为计划中的 `/settings/api/usage`。T-ID-08 明确限制原型失败正文：只有真实确认时才能写“本次未创建”或“仍可使用”；通用故障先核对，停用/过期记录撤销失败不得称仍可用。该补充避免错误确定性，没有增加新交互或故障框架。

## 实现与验证事实

实际检查 production identity/auth.ts、schema.ts、owner.ts、auth route、settings 路由清单、OwnerShell、SettingsCategories 与 Providers，确认未接生产 apiKey 插件、没有 tokens.ts 或生产 Token/公共上传/OpenAPI 路由。已有所有者身份仍使用 Cookie，当前设置只包含已交付类别。README 没有把计划能力或原型列为实际产品交付。

实际检查 tests/experiments/api-key/options.ts、fixture.ts、http.ts 和 tests/integration/identity/api-key*.test.ts，确认插件哈希、固定 upload:create、无部分原文、到期边界、启停/撤销、数据库故障诊断、原文投影及输入日期溢出测试属于工程实验。`/probe/upload` 仅验证授权，不接收真实图片。该边界与 EV-IDENTITY-02 记录一致，文档没有扩大其验收结论。

实际检查 package.json、vitest.config.ts、scripts/verify-browser.mjs 与 docs/tasks/check.mjs，确认两插件测试在默认 integration include 且未 exclude；unit/integration 与 browser 的 full 入口和定向参数分界符合新增结论。生产 Token/OpenAPI 测试仍需消费者添加，本次没有虚构测试或改变运行器。HeroUI 3.2.6 已安装类型包含 Card、Accordion 与继承 React Aria DatePicker 的能力，组件映射没有新增依赖。

复读 README 并核对主 agent 提供的已执行结果：Node 24.18.1 / pnpm 11.19.0；冻结安装616包且锁文件未改；全仓 `pnpm run format:check` 退出0；`node docs/tasks/check.mjs` 通过120项任务/298项需求；`--self-test` 的5项拒绝用例通过；`python3 /tmp/verify-issue130.py` 通过220个本地链接、52个锚点、74个消费节点/90节点索引及24张PNG自然尺寸匹配；`git diff --check` 退出0。实际读取 Python 检查器，确认它遍历当前文件引用、检查真实路径/锚点/节点存在性与PNG头部尺寸，没有绕过失败或制造空测试。没有重新运行这些检查。

独立设计报告逐项区分 Figma 设计截图与真实产品页面，确认公共旧区域由现行批准规则覆盖，并把未知核对、用法复制/完整内容的缺口交还消费者。本质量审计复读其结论，不替代设计者的实时 Figma 回读或后续真实 UI 对照。

## 完成边界

本任务是纯文档设计适用核对，无业务、构建或公共 UI 变更。应用构建/单元/集成/浏览器、Release 镜像与容器不适用；未执行不写成通过。真实 Token/用法页面、生产联验、设计还原与人工验收仍由消费者完成，不将这些未完成项作为 DG-API 文档完成的阻塞。

文档适用检查与本独立质量终审已收齐。独立设计适用审计由另一个审计者负责；本报告不替代其 Figma 视觉审计或产品真实页面验收。提交、推送与 PR 状态须在真实执行后由主 agent 记录；本审计未声称尚未执行的远端交付已完成。
