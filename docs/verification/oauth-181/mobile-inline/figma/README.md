# 获批手机左右排列的 Figma 同步

本轮按用户最新批准的 `mobileInline=true` 原型，只更新账号设置行：左侧依次呈现图标标签、值/短状态，右侧紧凑操作垂直居中；无操作时信息占整行。640px 起保留既有桌面三列。依据为 `account-rows-preview.tsx:294–345`、实际获批 `mobile-inline-390-dark.png` 与原型独立审阅记录。该批准替代本 Issue 旧“手机操作放在值下方”方案，不改变状态职责和数据契约。

实际应用 using-agent-skills 选择 Figma 读取/写入技能；figma-design-to-code 用于当前设计上下文与初次截图，figma-use/figma-generate-design 用于原生布局更新，figma-generate-library 用于账号专属行组件的原位协调。已读项目 AGENTS、handoff 与执行约定的前端验收边界，并核对相关字体、变量、组件和 Plugin API。没有相关 Code Connect 文件；复用当前本地组件，不引入外部组件或新图标。

## 实际写入与保留范围

源组件 [836:13855](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=836-13855) 原位更新。Label 移入已有 Information 容器，Action 移为行末；没有新建组件或 detach。手机主浅色 [102:1713](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1713)、主深色 [847:32225](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=847-32225) 及另外 15 个适用账号来源，共 68 行；原完整滚动区 `819:27634` 另有 2 行，一共 70 个实例。全部节点与原生写入结果见 [manifest.json](manifest.json) 和 [write-results.json](write-results.json)。

行左右/上下内距 16px，列间 12px；标签 13px、图标 16px/间距 8px，标签和值间 4px，值 14/20px。按钮继续复用本地手机来源，高 44px、内容自然宽，保留圆角和主题。左列可收缩及换行，短视口仍自然滚动；没有压缩字体或按钮。公共 Header、标题/分类、桌面来源、弹窗与待重启摘要/Accordion 没有重画。

[before-state.json](before-state.json) / [after-state.json](after-state.json) 原生读回确认：17 个手机来源与完整区域的状态文字、图标/加载/操作属性没有丢失，公共 Header 几何保持一致。17 个桌面来源的 Main、业务标题和设置行等已记录几何完全一致；桌面没有写入。原生布局审计 70 行中 63 行有操作、7 行无操作，没有列宽、按钮高度或居中违规，见 [layout-audit.json](layout-audit.json)。展开来源为可编辑的原生文字、向量、组件和层级，没有整页图片填充。

## 截图与逐项静态对照

| 最终代表状态     | 手机节点    | 原始截图                                                                         |
| ---------------- | ----------- | -------------------------------------------------------------------------------- |
| 主浅色           | `102:1713`  | [main-light-after.png](main-light-after.png)                                     |
| 主深色           | `847:32225` | [main-dark-after.png](main-dark-after.png)                                       |
| 已绑定           | `197:2092`  | [bound-light-after.png](bound-light-after.png)                                   |
| 配置结果待核对   | `814:29892` | [config-unknown-light-after-current.png](config-unknown-light-after-current.png) |
| 待重启深色       | `814:29997` | [pending-dark-after.png](pending-dark-after.png)                                 |
| 配置差异展开     | `847:32261` | [expanded-light-after.png](expanded-light-after.png)                             |
| 展开完整业务内容 | `847:32274` | [expanded-full-content-after.png](expanded-full-content-after.png)               |

整页代表图为 390×844，完整展开业务内容为 358×707；六组 before 及全部旧任务证据保留。完整内容导出后已恢复视口裁切和透明业务容器。同步者已逐张查看最终图：整页品牌、标题、说明、分类沿既有；邮箱/密码与操作左右对应；未绑定无操作占整行；配置待核对仍归属配置；待重启保存/生效比较、重启后果与完整快照保留，Accordion 左右 16px 及三行/4px/12px 间距不变。

配置未知状态初次整页导出没有显示已存在的标签。实际原生读取确认 Label 可见、层级与坐标正常，定向行截图及再次整页导出均正确；最终使用 `*-after-current.png`，过程图 `config-unknown-light-after.png` 与 `config-unknown-row-composition.png` 保留，不把过程图当最终通过证据。该复核没有额外改产品或状态内容。

当前前后实时设计读取见 [design-context.json](design-context.json)，读取带 `skillNames=figma-design-to-code` 并包含初次截图。没有保存临时资产 URL。

## 当前完成边界

已实际查看父任务正式构建取得的 390×844 主页面浅深色截图，并读取 [product-metrics.json](../browser/product-metrics.json) 中对应 DOM 布局。逐项原始对照见 [product-comparison.json](product-comparison.json)。手机左信息/右居中操作与无操作整行均对应获批结构；邮箱/密码操作的 x267、y341/418、90×44px 与正式产品相同。没有在本子任务中新增浏览器测量。

| 位置                    | Figma       | 实际产品 DOM      | 处理                                           |
| ----------------------- | ----------- | ----------------- | ---------------------------------------------- |
| 邮箱/密码值 y           | 365 / 442px | 364.75 / 441.75px | 13/19.5 标签的原生文字框取整留下 0.25px 差异   |
| GitHub 无操作信息块高度 | 68px        | 67px              | 标签及次要说明各 19.5→20px 文字框，累计 1px    |
| 配置操作 y              | 669px       | 668px             | 承接上行文字框的 1px 累计差异                  |
| 配置操作 x / 宽         | 247 / 110px | 247.75 / 109.25px | 内容自然宽的 0.75px 字形近似，右边缘同为 357px |

这些小数近似如实保留，不把 Figma 原生坐标或图片像素取整写成新增 DOM 精确测量。正式站点邮箱与 Figma 示例邮箱不同，属于实际测试数据，不改数据契约或字体主题。桌面继续只读核对，未因手机批准移动桌面。

Figma 原生写入、同步者静态对照及上述正式主页面精度对照完成。独立设计复核等待最终结论；正式异常状态、长邮箱和本轮人工验收由父任务独立记录。本轮没有操作 Ego/其它浏览器、读取凭据、修改产品、运行应用检查、提交或推送。Figma 静态截图不证明产品行为、OAuth 或本轮人工验收通过。
