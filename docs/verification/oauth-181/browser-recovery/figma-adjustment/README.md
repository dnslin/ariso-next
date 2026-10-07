# 已批准产品的桌面与手机 Figma 精度同步

2026-10-07。独立设计者以本轮真实 1440×1080 产品截图发现静态精度差异。获批原型与正式代码一致，因此仅更新 Figma，不改产品或公共规范。完整实际写入 ID、原始坐标和截图对应见 [manifest.json](manifest.json)。

实际重新读取主节点 `34:462` 与深色节点设计信息和截图，逐项核对已安装 HeroUI 样式、获批原型及正式源码后，对 17 个桌面账号来源状态同步以下精度：

- 补上 HeroUI Tabs 根的 8px 间距。既有标题、分类和 Main 的起点保持原位；仅通过原生 Account settings 容器的 8px 顶部留白表达业务前间距。
- 两个业务组标题使用获批 `text-lg` 实际 18px/28px，修正旧 Figma 18px/27px 的 1px 累积。
- 本地桌面设置行值源节点 `836:13844` 使用真实 `text-sm` 的 14px/20px；该源节点属于账号页本地 Row 组件，没有修改公共库母版。
- 登录密码圆点与原型和正式 `tracking-[3px]` 一致，字体为实际全局 Noto Sans SC，字距 3px。仅覆写密码实例，不改变邮箱或其它行的字体。

| 桌面主节点位置              | 旧 Figma     | 精度修正后 | 真实产品     |
| --------------------------- | ------------ | ---------- | ------------ |
| 所有者账号 Card 顶边        | 239px        | 248px      | 248px        |
| 邮箱值顶部 / 行高           | 267.5 / 21px | 277 / 20px | 277 / 20px   |
| 修改邮箱操作顶部 / 高度     | 256 / 44px   | 265 / 44px | 265 / 44px   |
| 密码值顶部 / 行高           | 344.5 / 21px | 354 / 20px | 354 / 20px   |
| 修改密码操作顶部 / 高度     | 333 / 44px   | 342 / 44px | 342 / 44px   |
| GitHub Card 顶边            | 465px        | 475px      | 475px        |
| 配置 GitHub 操作顶部 / 高度 | 560 / 44px   | 569 / 44px | 568.5 / 44px |

配置按钮保留 0.5px 的字行高近似差；真实产品列使用原始 DOM 坐标，不把像素取整参照记作严格相等。

实际导出四个代表状态的 before/after：主页面 Light `34:462`、主页面 Dark `847:15224`、已绑定 Light `197:2245`、差异展开 Light `847:15346`。文件为本目录 `main-*`、`bound-light-*`、`expanded-light-*` 原始 PNG。浅深主图与展开图已按整页、公共区、卡片起点、行值、按钮、密码圆点顺序目视复核；独立设计结论由 [design-review.md](../design-review.md) 维护。

首轮桌面同步时尚无手机测量，因此没有移动手机。随后取得真实手机图与 DOM 布局，才进行下述独立手机同步。旧 [layout-revision Figma 证据](../../layout-revision/figma/README.md) 完整保留，不覆盖历史图片。

## 手机真实测量后的追加同步

实际读取 `oauth-390-before.json` 的 `layouts` 及 390×844 真实图，只保存 [相关数值布局](mobile-product-layout.json)，不读取 requests 或凭据。手机完整写入与最终坐标见 [mobile-manifest.json](mobile-manifest.json)，前后设计读取见 [mobile-design-context.json](mobile-design-context.json)。

- 更新 17 个账号手机来源页与原完整滚动区域 `819:27634`。移除 Figma 标题容器多出的 4px 底部留白，分类内部间距 6→4px，再按实际手机 Tabs 组合表达 8px 业务前间距。Main、手机公共 Header 与所有共享母版保持原位；这不是从桌面推测位移。
- 手机分类当前值复用原选择器克隆为本地 `863:31005`，加入实际已选 ShieldCheck 16px 图标。原公共 `113:1498` 未改。
- 手机组标题 18/28、普通值 14/20、标签与次要说明 13/19.5；密码 Noto Sans SC 与 3px 字距。标签继续对齐第一行值块，操作仍在值列第二行。
- 本地手机 Primary/Outline 按钮为 `863:31001`/`863:31003`，最小宽 44px、左右内边距 16px、自动按内容伸展，边框纳入原生布局；四字操作自然宽 90px。没有把长操作固定成 90px，也没有改桌面 96px 按钮来源。组件说明同步为手机规则。

| 手机主节点位置           | 精度同步后的 Figma | 真实 DOM              |
| ------------------------ | ------------------ | --------------------- |
| 分类框 y / 宽 / 高       | 208 / 358 / 44px   | 208 / 358 / 44px      |
| 所有者账号 Card 顶边     | 324px              | 324px                 |
| 邮箱值 y / 高            | 341 / 20px         | 341 / 20px            |
| 修改邮箱操作 y / 宽 / 高 | 369 / 90 / 44px    | 369 / 90 / 44px       |
| 密码值 y / 高            | 446 / 20px         | 446 / 20px            |
| 修改密码操作 y / 宽 / 高 | 474 / 90 / 44px    | 474 / 90 / 44px       |
| 绑定值块高度             | 44px               | 43.5px                |
| 配置值 y                 | 701px              | 700.5px               |
| 配置操作 y / 宽 / 高     | 729 / 110 / 44px   | 728.5 / 109.25 / 44px |

13px 文字在 Figma 已设 19.5px 行高，但原生文本框高度取整为 20px，保留绑定与配置 0.5px 近似；长配置按钮保留 0.75px 字形宽近似。不把这些数值宣称为严格相等。四个手机代表状态的 before/after 均为本目录 `mobile-*-{before,after}.png`，完整展开另有 `mobile-expanded-full-content-after.png`（358×819）；导出后已经恢复 844px 视口裁切与透明业务容器。同步者已逐张目视复核，独立设计者已查看五张最终图并读取实时 `102:1713`，结论见 [design-review.md](../design-review.md)。

Figma Sidebar 的描述行与独立测试站点空描述有真实数据差异，导航位置随是否存在描述变化；本轮没有把该数据差异误改为公共组件问题。

实际工具为 `figma_get_design_context`（带 `skillNames=figma-design-to-code` 并包含初次截图）、`figma_get_screenshot`、`figma_use_figma` 与本地源码只读检索。写入和 native 坐标读取结果记录在 manifest；设计读取文本在 [design-context.json](design-context.json)，未保存临时截图 URL。

本轮没有操作 Ego、读取登录/OAuth 凭据、修改产品、重跑应用检查或提交。Figma 静态同步不证明浏览器功能与真实 OAuth 通过；用户人工 UI 验收已由父任务单独记录。

## Accordion 横内距补齐

后续真实展开图对照发现，Figma 的“查看配置差异”与快照漏表达 HeroUI 继承的左右 16px 内距。已实际读取已安装 `accordion.css` 第 14–15、56–60 行、正式 `github-settings-summary.tsx` 第 76–91 行及获批 `account-rows-preview.tsx` 第 254–260 行；产品与原型保留该内距，仅覆盖垂直间距和文字样式。本次修正 Figma，产品保持不动。

定向更新桌面 5 个待重启来源 `196:2001`、`196:2002`、`196:2006`、`814:15096`、`847:15346`，手机对应 5 个来源 `196:2011`、`196:2012`、`196:2016`、`814:29997`、`847:32261`，以及原手机完整滚动区域 `819:27634`。实际写入 13 个 trigger/body 原生节点；完整 ID、写入结果与前后坐标见 [accordion-manifest.json](accordion-manifest.json)，桌面展开节点前后实时设计读取见 [accordion-design-context.json](accordion-design-context.json)。没有修改摘要位置、其它行、公共来源或按钮组件。

| 区域                       | 摘要 x 保持 | 修正前 trigger / 快照 x | 修正后 trigger / 快照 x |
| -------------------------- | ----------- | ----------------------- | ----------------------- |
| 桌面整页                   | 285px       | 285px                   | 301px                   |
| 手机整页                   | 33px        | 33px                    | 49px                    |
| 手机完整业务区域的局部坐标 | 17px        | 17px                    | 33px                    |

两端 trigger 与展开 body 均左右 16px；折叠和旋转 180° 的展开箭头按原生边界核对，右内距均为 16px。两份快照仍各三行，份内 4px、份间 12px。产品的 301/49px 由实际摘要边界、已安装样式与真实截图共同核对，没有另取 Accordion DOM 矩形；表内修正后的 Figma 坐标来自原生节点读取。

新增 `accordion-*-{before,after}.png` 四组代表状态：桌面展开 Light、桌面折叠 Dark、手机展开 Light、手机折叠 Dark。手机视口中的 Accordion 在首屏下方，另导出 [完整展开内容](accordion-mobile-expanded-full-content-after.png)（358×819）核对触发器、快照与箭头；导出后恢复视口裁切和透明业务容器。旧精度同步与布局历史截图完整保留。同步者已查看四张最终整页与完整内容图；独立设计结论继续由 [design-review.md](../design-review.md) 维护。
