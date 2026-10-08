# PR #264 与最新 main 的联合设置页：独立结构复审

结论：当前联合增量没有可行动的 P1/P2 结构必修项。可以批准本次代码结构。未发现能够保留双方批准行为、同时显著删除整层复杂度的遗漏；不建议引入通用设置引擎、全局请求代次或跨模块保存事务。

## 阅读范围与基准

- 实际重新读取 `/Users/dnslin/.agents/skills/thermo-nuclear-code-quality-review/SKILL.md` 后执行本次审计。
- 审计工作区位于 `issue-200-upload-settings/ariso`，读取时 HEAD 为 `59281ad84237e856cee8b2c46ec904dd2584a1a4`，MERGE_HEAD 为 `7e88af4a24194dec880f6bb6b8a7e6367fe3b188`。报告针对正在合并的工作区候选内容，不声称 merge 已提交或冲突已全部标记解决。
- 完整阅读联合 `site/general-page.tsx`、两个 read-state、nullable upload hook、upload form/feedback、site hook/model/form/navigation/related-settings、生产 general 路由；读取 main 版本 GeneralPage 和工作区增量进行对照。
- 完整阅读 `e2e/general-settings-merge.mjs`，核对它在 `e2e/site-general.mjs` 的 behavior/default 场景接入以及双方 canonical helpers。读取 upload 初始化单元用例；site 初始加载用例仍由另一 agent 同步修改，不用其旧内容对新页面下结论。
- 未修改产品代码或测试，未运行 Ego，未重跑检查。

## 结构结论

以下行号指本次读取到的工作区候选内容。

- **模块保存边界保持正确。** `src/components/site/general-page.tsx:46` 分别组合既有 site/upload hooks；`:134` 起底栏的两个 submit 明确通过 form 属性绑定各自表单。SiteForm 和 UploadLimitsForm 是并列的独立表单，没有嵌套，也没有把上传字段送入 site PATCH。地址变化、站点品牌刷新、上传旧/新提交快照等仍留在各自模块。
- **页面组合减少了整层重复。** 原上传独立 page 文件已删除。GeneralPage 保留唯一 OwnerShell、SettingsHeading、SettingsCategories、关联设置和底栏，旧 GeneralFrame 包装也消失。新增 read-state 仅负责各自初次读取的可见状态；它们隔离不同的错误协议和初始化出口，不是没有职责的转发包装。`RelatedSettings` 的“上传限制尚未开放”占位已删除。
- **独立读取没有被联合页面串行化。** `general-page.tsx:49`、`:57` 保留两份 Query，它们能够同时读取，各组成功后独立显示表单。另一组的加载、错误和重试不会重建已开始编辑的表单。
- **nullable 输入对应真实系统状态。** `use-upload-limits.ts:21` 的 null 表示尚未取得服务器配置。`:26` 的 NaN 不展示为伪造默认值，saved=null 时表单不渲染，change/save/reconcile/chooseSaved 均有同一就绪约束。`:45` 只消费首次成功输入，后续 initial 变化或 site router.refresh 不覆盖上传草稿。失效后不会消费迟到初始值。类型窄化发生在实际 saved 分支，再交给要求完整 saved 的 form/feedback，没有新增断言 cast 或兼容 fallback。
- **共享会话处理只在组合点协调。** `general-page.tsx:65` 汇总两边实际 401，`:72` 调用各自的 expire。表单立即按 sessionLost 禁用，随后 effect 落实各自异步生命周期终止及上传资源清理。没有让 site hook 反向理解上传状态，也没有让 upload hook 接管站点字段。原 active 迟到结果保护保持局部作用域。
- **离页判断复用既有行为。** `general-page.tsx:88` 以双方真实脏值或未确定请求决定是否确认离页；原 useSiteNavigation/SiteLeaveDialog 继续处理分类、链接、历史遍历及取消/放弃。没有新增第二套导航监听或第二个弹窗。`:224` 的 pending 只改变真实未确定保存的文案；会话失效时解除离页阻挡，避免重新登录入口被草稿确认阻塞。
- **E2E 增量围绕联合契约，没有发明通用框架。** `e2e/general-settings-merge.mjs:70` 复用双方现有工具和几何断言。局部 monitor 观察真实 PATCH 与已完成的 RSC refresh，没有替换响应或绕过保存。它验证两份草稿不互相清空、Enter 只提交所属表单、upload-only 和 joint dirty 的离页处理、两边 401 锁住双方输入，以及清理时恢复实际保存值。接入既有 site behavior，也接入其默认全部场景；不是只存在于手动入口。暂不把脚本静态阅读记作实际浏览器通过。

## 文件增长与结果边界

- 联合 GeneralPage 236 行；site read-state 69 行；upload read-state 56 行；upload hook 262 行；联合 E2E 338 行。没有本增量造成的千行源码膨胀。
- Required / P1：0；Required / P2：0；Optional：没有需要在这次合并前追加的结构重构。
- 本报告只批准维护性与模块边界，不替代尚在补写的单元测试、联合页面真实浏览器验证、设计对照或合并前最终远端核对。

## 2026-10-08 追加：上传 behavior 最终诊断与真实键盘输入复读

本节记录后续增量的独立维护性复读，保留以上联合候选评审时点及当时验证边界。实际重新读取 thermo-nuclear-code-quality-review 技能，完整阅读 `e2e/upload-settings-behavior.mjs`、`e2e/upload-settings-helpers.mjs` 及 `e2e/upload-settings.mjs` 的调用、失败报告和清理路径，并对照现有 `e2e/processing-preview.mjs:29` 起的真实键盘输入模式。没有修改产品或测试，没有运行 Ego，也没有重跑检查。

结论：**Required / P1：0；Required / P2：0；Optional：没有值得本轮追加的结构删改。** 剩余诊断与实际故障定位需要相称，没有保留临时完整事件 probe 或打开页面时的全量快照。

- `e2e/upload-settings-behavior.mjs:5` 的 behaviorStep 记录当前业务场景；`e2e/upload-settings-helpers.mjs:179` 起的 uploadOperation 记录公共 helper 当前等待步骤。两者均覆盖最后位置，大小固定，没有累积事件流，也没有引入诊断框架或改变业务断言。
- `e2e/upload-settings-helpers.mjs:202` 起依次实际 focus、键盘全选、type 和 Tab；`:209` 起仍等待 FormData 中的字段值精确等于输入值。没有直接注入 DOM 值、修改 React 内部状态、固定延时、备用重试或放宽断言。它复用项目已有输入方式，足以覆盖受控输入在失焦后的真实提交值。
- `e2e/upload-settings-behavior.mjs:221` 起的 newSubmissionEdit 只保留三个真实输入值、上传模块唯一 PATCH 及独立 GET 的保存结果。`:240` 起旧/新提交字节上限、分批数、不可变旧快照、数据库队列值和唯一 PATCH 请求体的原有断言仍在。
- `e2e/upload-settings-behavior.mjs:292` 起仅在失败时执行一次上下文读取，包含当前路由、三字段与 FormData、焦点、保存按钮、滚动、已有请求记录及可见错误。诊断自身失败单独记录后仍抛出原始错误；外层报告和清理链继续保留失败。没有吞错或把诊断变成通过条件。
- behavior 文件 338 行、helpers 文件 349 行；本次变化没有带来需要删除整层概念的文件增长。证据记录和输入操作各自留在现有职责内。

实际回读 `test-results/merge-264/upload-behavior-keyboard/upload-settings.json`：phase=behavior、status=passed，2 checks、5 layouts，browserErrors 为空，没有 error 或 cleanupError。newSubmissionEdit 记录输入 1/1/100、唯一所属 PATCH 返回 200，以及独立 GET 持有相同保存值。本次复读没有重新执行该浏览器检查；该局部结果不等于全部浏览器场景、PR 完成条件或人工验收已通过。
