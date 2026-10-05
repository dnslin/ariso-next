# DG-ACCOUNT 独立文档与代码依据审计

日期：2026-10-05（Asia/Shanghai）。结论：**Approve**。未发现需要阻塞本次文档交付的 Critical 或 Required 问题。本结论只覆盖 Issue #127 的设计适用核对，不代表账号管理、OAuth、浏览器或人工验收完成。

## 审计范围与依据

独立审计者使用 `code-review-and-quality`，读取项目 AGENTS.md、`docs/README.md`、[执行约定](../../execution.md)、[设计交接](../../../design/handoff.md)、[待验收清单](../../../design/acceptance.md)、SPEC-identity §5–7/10–14，以及基线 `569e34d7d2e628bba290734fba707b4c5756a557` 后的本次文档差异。审查对象为两消费卡的 DG-ACCOUNT 小节、gates 证据入口、本目录 README 和 GitHub/Figma JSON。没有改业务代码或重审已确认产品选择。

实际只读操作包括 `gh issue view 127 --repo dnslin/ariso-next --json number,title,body,state,comments,url`、原生 `dependencies/blocked_by` 与 `dependencies/blocking` 回读、`git diff`、相关实现/测试/配置阅读及 Node 24 对 JSON 的解析。#127 仍 OPEN、无评论、无直接前置，直接消费者为 #165/T-ID-04 和 #181/T-ID-05，与 [GitHub 快照](./github.json)一致。

## 核对结果

- 需求覆盖：T-ID-04 与 T-ID-05 分别列明桌面/手机可复用节点、适用状态、真实行为和验收责任。邮箱核对中/失败、并发改密重试、保存值与生效值差异、配置/绑定读取失败及未知结果的表达缺口均指定消费任务承接。成功呈现与用户最新偏好之间的差异明确保留原型批准边界，没有借本 DG 批准新布局或关闭 DES/RG。
- 输入与错误契约：邮箱规范化、密码保留空白与 8–128 字符、当前密码核对、emailVerified/SMTP 无关性、改邮箱撤销未用重置凭据及保留 GitHub 关系，均符合 SPEC-identity。改密保留当前会话并撤销其他会话的步骤修正有 §6.2/14 依据。已确认错误与连接中断后的未知结果分开，不声称旧值必定未变，不自动重复提交。
- OAuth 边界：主动绑定、稳定 provider account ID、不同邮箱、禁止隐式绑定/注册、Secret 保留/替换/清除、站点地址立即供新请求使用，均沿已评审规格。设计审计提出的待重启修正已回读：从未启用保存为启用仍不可登录；原已启用修改凭据仍用旧生效凭据；停用/清除未重启仍沿旧配置。没有增加自动重启或 Docker 权限。
- 实现现状：实际读取 `src/server/identity/{auth,owner,owner-page,validation,schema}.ts`、登录页/表单、IdentityField、OwnerShell、SettingsCategories 与 returnTo。生产认证只放行本地登录、退出、会话读取；没有生产账号管理路由、账号页面或 GitHub provider。唯一所有者/provider 约束已经存在。OAuth HTTP 测试导入 `tests/experiments/identity`，不能冒充生产接入或真实 GitHub 回调验收。README 对已实现、占位和计划能力的区分成立。
- 模块与组件职责：公共壳、导航/会话、分类和业务表单的复用边界与实现一致。IdentityField 的 `isRequired` 固定存在，不能直接承载可留空 Secret；采用已有 HeroUI 可选字段组合的交接无需新增依赖。公共入口和登录目的地仍须随真实页面交付更新。
- 验证调用链：核对 `package.json` → `scripts/verify-browser.mjs` 默认 `suite=full` → runtime 与真实生产 identity setup/restart 场景。当前没有生产 account/oauth 场景的说法属实。两消费卡要求新增场景接入默认流程，未以定向入口替代默认覆盖。本次未修改运行器或 suite/only 参数。
- 文档检查与链接：`docs/tasks/check.mjs` 的任务解析以三级标题和任务字段为准，本次四级 DG 小节不会变成重复任务或改写需求/依赖；其结构与拒绝夹具检查不能证明真实业务完成。新增消费卡锚点与 gates/README 引用一致，JSON 和截图本地目标均存在；设计审计入口也已生成。原始 JSON 的文件键、只读标志、30/31 个账号分区节点及12个补充节点与 README 一致。

## 验证边界

格式、任务检查、自检和统一本地链接检查由主 agent 本轮执行并记录到 [交付证据](./README.md)，独立审计没有机械复跑，也没有声称这些命令已通过。审计时 README 中检查、最终审计和 PR 状态的暂时占位不被视为产品完成声明；交付前应按实际结果填入。

本次纯文档改动不涉及业务或构建输入，未运行应用 lint/typecheck/build/unit/integration/browser、数据库迁移或 Release 镜像/容器验证。没有独立验证 Figma 视觉或真实网页截图；[设计审计](./design-review.md)分别承担设计适用结论。后续真实账号/OAuth 行为、深色及各宽度、键盘/焦点、短视口、复制和用户人工验收仍开放。
