# 后台界面精简方案

状态：2026-10-11 用户以“就按照这个去改”批准原型方向用于产品实施。产品修改及定向运行检查已完成，等待用户人工验收。完整集成检查仍有两项失败，详见本轮记录。

原型：[打开界面原型](http://127.0.0.1:61510/dashboard?scenario=empty)。支持桌面 / 手机，以及空白 / 有数据 / 异常三种状态。范围与验证见 [原型说明](prototype/README.md)。

方案初稿基线：`67d413652db8bfa055697e6bfe2d4894568bf5c1`。下方问题证据记录修改前状态；当前批准内容与验收状态按本文件和本轮证据区分。

## Design language

- Audited surface：Ariso 后台一级页面及存储详情、引用与清理页面。
- Design sources：用户本轮六张截图、上传下拉选项批注、`docs/design/handoff.md`、对应 SPEC 和实际页面调用链。
- Documented decisions：继续使用现有品牌、OwnerShell、HeroUI、Lucide / Gravity 图标和响应式布局。通用说明允许按需展示；真实错误、禁用原因和必要操作后果直接展示。
- Governing owners and consumers：各业务页面负责自己的文案和状态；`SettingsHeading` 负责站点设置公共标题；`AnalyticsScreen` 分别组合总览 `DashboardPanel` 和访问报表 `AnalyticsOverviewPanel`；现有全局主题规则明确后台 Select 弹层和选项圆角。
- Explicit exceptions：本轮批准覆盖六项方案中的正常态文案、操作位置和页面分工，不改变既有错误、风险、权限和数据契约。统计原始 Figma 节点仍有旧示例，不能拿旧的已删除图片样本覆盖当前排行规则。

## Findings

| #   | Problem                                | Evidence                                                                                                                                                                             | Proposed change                                                              | Scope              | Confidence |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------ | ---------- |
| 1   | 正常页面大量常驻说明挤占内容           | 用户截图 1、4、5、6；`analytics/screen.tsx`、`overview-summary.tsx`、`storage-form.tsx`、`storage-reference-view.tsx` 实际渲染这些文字；本轮用户明确否定标题复述和常规说明的常驻呈现 | 应用统一文案准则：删除标题复述和口号，次要规则收进按需帮助，当前状态直接展示 | 后台页面及存储详情 | 高         |
| 2   | 相册空态出现两个相同的创建操作         | 用户截图 2；`src/app/albums/screen.tsx` 的工具栏按钮和空态按钮都调用 `openAction({ kind: 'create' })`                                                                                | 保留工具栏“新建相册”，删除空态重复创建按钮                                   | 相册列表           | 高         |
| 3   | 回收站搜索框预留了图标位置，但没有图标 | 用户截图 3；`TrashSearch` 只渲染 Input 和 ClearButton，输入仍有 `pl-9`；项目同类相册搜索已使用 Search 图标                                                                           | 用当前 HeroUI SearchField 的搜索图标槽补上库图标，保留搜索行为               | 回收站列表         | 高         |

## Improve first

先统一正常页面文案的呈现规则。用户提供的多个页面都存在这一问题；它直接影响内容起点、页面高度和扫读效率。

## 调整依据

- 修改前工作台和访问统计共用 `AnalyticsOverviewPanel`。2026-10-11 只读查询 Figma `19:38` 与 `30:1225`，两者都有四指标、周期、趋势、版本、热门和占用内容。两页分工是本轮经用户批准的产品调整，不追认旧设计为违规。
- 修改前上传下拉框未明确设置 Popover 和 Item 圆角；已安装 HeroUI 样式中 `.select__popover` 默认使用 `min(32px, var(--radius-3xl))`。批准尺寸为触发器 8px、弹层 12px、选项 8px；本轮真实浏览器已检查 78 个下拉框实例的计算样式、键盘展开、取消与焦点恢复。
- 修改前存储返回链接使用字符箭头。本轮批准改为 Lucide ArrowLeft 加“返回”，放在标题行，保持原返回目标和未保存确认。

## 已批准的六项方案

1. [页面文案与帮助](01-copy-and-help.md)：一级页面去掉泛描述；帮助按需显示；状态保持直接可见。
2. [相册单一创建入口](02-album-action.md)：只保留工具栏“新建相册”。
3. [搜索图标](03-search-icon.md)：补齐回收站搜索图标并核对同类搜索框。
4. [下拉框圆角](04-select-radius.md)：建议弹层 12px、选项 8px，明确覆盖组件默认值。
5. [存储页面](05-storage-layout.md)：返回按钮、操作图标、目录展示和引用列表精简。
6. [总览与访问统计](06-dashboard-roles.md)：资源与待办总览、访问分析分开。

2026-10-11 用户先要求“现在开始做原型”，当时只授权原型制作。用户随后以“就按照这个去改”批准产品实施；两次授权分开记录，不将原型检查当作真实产品验收。

## 产品实施与 Figma

六项方案对应的产品代码及受影响展示断言已修改。统计页面分工和按需说明同步到 `docs/specs/SPEC-analytics.md`；批准的共用呈现规则同步到 [设计交付规范](../../docs/design/handoff.md#后台正常态精简2026-10-11用户批准)。原有错误、待核对、禁用原因、删除后果、提交与状态恢复契约继续有效。

Figma 文件为 `74sT9Hrf8G4czcWeTkET5b`，本轮补充 [section 1081:19457](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1081-19457)。四个核心页的桌面/手机、浅/深色共 16 个可编辑正常态 frame 已补充；其他八类页面的现有桌面/手机主 frame 已删除对应常规描述。回读与代表截图、产品结构对照见本轮记录；没有重画全部历史状态，也不宣称全部 Figma 状态逐像素验收。

本轮实际检查结果、截图和未完成项见 [实施记录](../../docs/verification/m2-85/ui-refinement/20261011/README.md)，不能复用 2026-09-27 的历史通过结论。新版真实产品预览为 [本地预览](http://127.0.0.1:3001/dashboard)，与原型及原来的 3000 端口数据分开。

## 本轮验证边界

方案准备阶段已执行 `git status --short --branch`、`git rev-parse HEAD`、相关源文件和依赖样式读取，以及只读 Figma 文本查询。

参考了 [IBM Carbon 空态规范](https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states) 关于精简内容和聚焦主要动作的做法，以及 [Tooltip 规范](https://www.carbondesignsystem.com/building-blocks/core/components/tooltip/guidelines) 关于补充信息的呈现方式。项目现有组件和本轮用户选择优先。

独立原型的类型、静态、构建和浏览器检查结果见原型说明，只证明演示环境。产品已执行构建、类型、静态、全量单元和定向浏览器检查；集成检查的两项失败、全仓格式检查的两份未修改历史 JSON 均单独保留。六项方案中的验证清单是验收要求，不是通过记录；实际命令和结果在本轮证据中另记。
