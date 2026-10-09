# DG-THEME 独立文档与契约审计

2026-10-09，使用 `code-review-and-quality`。范围为 Issue #139 的消费任务交接、设计索引及统一证据，不修改产品代码、Figma 或任务正文。

## 结论

**通过本次纯文档审计。** 当前未发现需要阻止 DG-THEME 交付的正确性、模块边界或证据失真问题。曾发现 1 处 SPEC 定位错误，实施者已修复并经复核确认。最终格式、任务依赖检查与交付状态由实施者统一收齐；本审计不冒称这些命令已由评审者运行。

DG 完成仅表示已将可复用规则、具体缺口和真实验收责任交给 T-SITE-05/#197。DES-05、RG-07、主题生产实现、真实浏览器、产品设计对照及用户人工验收继续开放；这些消费者工作未完成不构成本次文档门禁的遗漏。

## 依据与实际核对

- 已读 AGENTS.md、技能全文、docs 导航、execution、handoff 适用规则、site §6、DG-THEME/T-SITE-05、设计待验收索引、全部本轮 Markdown 差异，以及设计 JSON、截图清单、对比数据和独立设计评审记录。
- 独立执行 `gh issue view 139 --json number,title,body,comments,state,url`，回读 #139 的原生 blocked_by/blocking；确认无前置、唯一直接消费者 #197、无评论。另回读 #197 的原生 blocked_by 及 #57 状态：#57 CLOSED、#139 OPEN。正文没有把记录写回误说为已解锁 #197。
- 实际读取 `src/app/layout.tsx`、`src/components/shell/providers.tsx`、`src/app/globals.css`、`src/components/site/related-settings.tsx`，并搜索生产 `src` 的 `useTheme/setTheme`。顶层统一 Provider 和主题颜色已有基础接入；“界面主题 / 后续独立设置”无操作入口。文档对已实现能力、占位和待实施选择器的划分准确。
- 实际读取 `src/server/site/schema.ts`、`validation.ts`、`src/app/api/settings/site/route.ts`。SQLite site 表无主题字段，严格 PATCH 仅接 name/description/publicUrl/timeZone；新文档未改写数据契约或转移上传、品牌、身份、sharing/analytics 的业务责任。
- 读取实际安装的 next-themes 0.4.6 的 README、类型及实现，核对 `theme/setTheme`、`resolvedTheme/systemTheme`、默认 storageKey、初始脚本、媒体监听及 storage 事件。生产默认 `theme` 与夹具 `ev-ui-01-theme` 的区别准确；库已有能力没有被误记为产品验证结果。
- 读取实际安装 HeroUI 3.2.6 的 RadioGroup/Modal 类型与主题变量，核对单选、弹窗组合及 disabled/danger/success/warning 的独立组合。文档要求复用现有依赖，没有借 11 项 Figma 变量宣称全部控件通过。
- 从 `package.json:test:browser` 继续读取 `scripts/verify-browser.mjs`、`scripts/browser-plan.mjs`、`e2e/runtime.mjs`、`tests/experiments/ui/run-browser.mjs`、`browser.mjs` 与夹具 Provider。默认 full 包含 runtime、业务阶段与 isolated-ui，首页系统色与夹具三模式/刷新检查真实存在；当前不能代替产品选择器、跨标签或全部消费路由。文档要求新增产品场景接入默认入口，未修改共用运行器。

## 颜色与证据准确性

使用 Python 只读解析本轮 `figma/desktop.json`，从浮点 sRGB 独立计算相对亮度和对比。浅色 destructive/surface 为 **4.355990547372512:1**，深色为 **6.53277199496054:1**，与 contrast.json 和正文的三位小数一致。浅色 muted-foreground/focus-ring 四舍五入为 **#2D334A/#386176**，当前 globals.css 为 **#41445B/#287E79**，两项实现偏差描述准确。

独立解析 `states-desktop.json` 与 `rules-mobile.json`：`266:1574/266:3471` 均为 12px、不透明、绑定 `VariableID:2:9`（destructive）。文档没有将其误说为硬编码红色，也没有将这个不透明颜色对的静态计算扩展为照片、透明度或全部错误状态的实际验收。读取 [W3C 普通文字对比说明](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)及[非文字对比说明](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)，确认普通文字 4.5:1、12px 不属大字及真正禁用控件的豁免边界；必要正文不因附近有禁用控件自动豁免。

独立核对截图清单：34 项、34 个实际 PNG、无缺失。本评审核对的是证据结构与文档事实；实时 Figma 来源和视觉适用结论由独立[设计评审](./design-review.md)记录，不以本审计代替其视觉判断。未将 Figma PNG 写成产品网页截图。

## 发现与修复复核

- **已修复：SPEC 片段定位错误。** 初稿统一证据引用 `SPEC-site.md#6-品牌与主题`，实际标题为“6. 品牌素材与主题”。已通知实施者，当前已改成 `#6-品牌素材与主题` 并复核。PRD §21.3、handoff 视觉基础、R6 节点矩阵及消费任务锚点均有对应标题。
- **无未解决的 Required/Critical 发现。** 变更限于门禁、消费任务、设计索引和证据。没有产品代码、依赖、运行器、冻结 PRD 或现有规范变更；没有增加不必要抽象或跨模块责任。无新增执行逻辑，因此未引入资源生命周期、安全或性能行为变化。

## 验证边界

本评审实际运行 GitHub 只读查询、源码/已安装类型与实现读取、文本搜索，以及上述颜色和截图清单复核。没有机械重跑实施者的安装、格式、任务检查，也没有执行应用 lint/typecheck/unit/build/integration/browser、迁移或发布验证。纯文档没有新增行为或条件，代码 mutation 不适用，不添加空测试。

生产系统变化、三偏好、跨页/刷新/跨标签、首屏水合、全部消费路由与状态、焦点回归、短视口和人工验收均仍由 #197 及最终 T-QA-02 取得真实证据。本轮未运行播放器、产品浏览器或人工验收；未给消费者缺口提前作设计批准。
