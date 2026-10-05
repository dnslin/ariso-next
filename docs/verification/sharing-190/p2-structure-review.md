# PR #247 P2 修复：运行器独立结构复审

结论：**运行器结构 Required/P2 已关闭，复审通过。** 本轮没有新增 Critical/Required 结构问题。功能正确性与结构批准分开；本结论不把历史 full 的失败改成通过，也不批准合并。

## 范围与独立性

基线为冻结 HEAD `7ed26dc2445197bdb15a2698e2b7d7eb62d1d853`，对照 root 当前未提交改动：`scripts/verify-browser.mjs`、新 `scripts/browser-plan.mjs`、新 `scripts/browser-m2.mjs`，以及对应参数/计划/M2 单元测试。本评审者没有编写这些修改。使用此前实际读取的 `thermo-nuclear-code-quality-review` 与项目约定。

本评审者编写的 upload 拆分不属于本次独立复审，交另一位评审者处理。本轮只读，唯一写入为本忽略报告，没有运行检查、启动服务、操作浏览器或用户预览。

## 原 Required 的关闭依据

1. **规则已经收敛到实际事实来源。** `browser-plan.mjs:149` 的 `selectBrowserPlan` 在资源创建前校验 suite、only、page label 和专属存储/预览参数，并返回实际 stages 与当前 suite 配置。六个原 singleSuites、library/recovery、upload-regression/main 等均在同一明确表中。运行器 `verify-browser.mjs:32` 只消费选择结果。
2. **删除了分支，而非仅搬移长条件链。** 原 stages 多层 ternary 与执行循环里的 trash/upload/upload-regression `continue` 过滤均已删除。每个表项直接表达当前脚本序列；upload-regression/main 直接返回 upload，trash/cleanup 直接返回 cleanup。phase 注入不再在 focusedConfig 与循环里重复判断，focusedConfig 只合并 plan.config。
3. **页面能力与入口同处维护。** albums、album-cover、tags、upload-input 的 `primaryPage: true` 与其脚本映射位于同一表项，full/m2-mobile 的 p1 限制保持。共享校验发生在 mkdir/运行时资源启动之前。该结构消除了本轮已出现的四入口 p2 契约遗漏来源，没有逐处补散落检查。
4. **M2 保留真实依赖，删除重复生命周期。** `browser-m2.mjs:13` 的 `runM2Restart` 被 focused m2-mobile 与 full 共用。before 明确消费 full 的 ownerName 前置；after 明确依赖 before。after 只在 before 成功后调用 restart，同一 `config.dataDirectory`、返回 setup codes 必须为空、脚本 phase/log 名保持。运行器 `:462` 的 restartProduction 保留 stop→start 的真实顺序。这不是通用状态机或可配置夹具框架。
5. **必要的特例仍对应实际资源边界。** sharing 独立生产夹具、storage live/feedback 的外部配置与 M2 专属重启流程保持显式；没有为全部 suite 添加统一夹具协议。full 已有 48 阶段清单、独立失败继续、真实 blocked 前置及最终失败退出语义不变。

行数实际复核：verify-browser **1178→976**；browser-plan **182**；browser-m2 在后续仅补充明确 JSDoc 类型契约后为 **44**。三个模块共 1202 行，重构不是总行数净减少；它删除了共享路径条件交织，把选择事实和 M2 唯一生命周期分开，同时主运行器回到 1k 以内。新增模块分别拥有清楚的当前职责，符合原 Required 的目标，不需要再压行数或新增抽象。

## 证据与限制

实际读取 `test-results/pr247-p2-unit.txt`：Vitest 5.0.0，**4 文件 / 162 项全部通过**，2026-10-06 00:23:40，39.01 秒。这是 root 已执行的结果，本评审者没有重跑。

实际阅读参数测试对六个 primary-page suite 的拒绝覆盖；plan 测试覆盖默认/only 脚本序列和所属配置；M2 测试覆盖同目录 before→restart→after、before 失败阻塞且独立工作继续、owner 前置失败不执行、出现新 setup code 拒绝 after。旧 browser-stages 的失败观察与继续机制仍复用。

本评审者执行的只读操作为 git diff/read、文件行数读取与证据读取，未重复 Node check、格式、静态、类型、单元或浏览器检查。root 后续静态检查证据另行维护。

本次没有取得新的浏览器运行证据；历史 full 仍为 40 passed / 7 failed / 1 blocked，后续定向通过仍只证明相应范围。PR 的 draft/CONFLICTING、人工验收未完成和预览保持等交付边界不因结构复审改变。
