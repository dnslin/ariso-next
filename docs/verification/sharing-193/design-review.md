# Issue #193 独立设计对照

2026-10-07，评审分支 `codex/issue-193-public-viewer`。本记录只评审本次匿名大图及其状态表达；功能、默认检查与人工验收分别由[统一证据](./README.md)承接。

**结论：本次匿名大图的代表页面与改变的状态已完成独立设计对照，没有发现仍需修正的本次视觉偏差。普通/名称态、放大、全屏、读取错误、短视口、停用占位、邻居加载/失败和状态检查失败分别取得实际页面证据。完整功能检查和用户人工验收仍须按各自真实结果记录，不能由本结论替代。**

## 依据与方法

实际读取 `AGENTS.md`、[设计交付规范](../../design/handoff.md)、[前端共用验收](../../tasks/execution.md#前端共用验收)、[sharing §7](../../specs/SPEC-sharing.md#7-列表大图与打开中的变化)和 T-SHR-04。使用 `using-agent-skills` 选择 `frontend-ui-engineering` 核对响应式、状态、控件与焦点表达；读取 `figma-design-to-code` 与 `figma-use`，遵守 Figma 读取及项目组件复用边界。

评审者独立查看下表 14 个已保存 Figma PNG，并通过 Figma MCP 实际读取 `434:4029`、`434:4104`、`494:4348`、`494:9536`、`494:4369`、`494:9557` 的设计信息及截图。先检查同视口整页、公共区域与底栏，再检查业务舞台、名称和控件。深色按 handoff 的 Ariso / Dark 语义颜色对照，不能把浅色 Figma 渲染当作深色设计。本次未写入或修改 Figma。

只读查看产品组件、真实浏览器截图与其几何报告；没有操作 Ego、运行检查或修改产品/测试。以下截图来自真实生产页面及独立测试数据，不是 Figma、静态原型或 UI 外壳夹具。截图布局结论不替代操作是否成功、资源生命周期、独立浏览器上下文或用户人工验收。

## Figma 与真实页面逐项对照

Figma 文件为 `74sT9Hrf8G4czcWeTkET5b`。下列桌面基准为 1440×1080，手机基准为 390×844；每组真实页面均复核浅色、深色。

| 状态与 Figma                                                                                                                                                                                                                                         | 真实截图                                                                          | 整页、业务与控件结论                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 普通隐藏名称：[434:4003](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-4003)、[434:8782](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8782)；[桌面设计](./figma/434-4003.png)、[手机设计](./figma/434-8782.png) | `actual/representative/sharing-viewer-hidden-name-{light,dark}-{1440,390}.png`    | 首页出口、品牌、淡黄/水绿柔光、计数和全屏行顺序正确。桌面业务宽1160px、手机358px。正常舞台上下各15px，实际内部舞台660/360px；底栏80px、按钮48px、间隔12px，位置固定。名称没有占用额外行。                        |
| 显示名称：[494:4279](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=494-4279)、[494:9467](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=494-9467)；[桌面设计](./figma/494-4279.png)、[手机设计](./figma/494-9467.png)     | `actual/representative/sharing-viewer-visible-name-{light,dark}-{1440,390}.png`   | 名称在计数行下方，16px/22px、medium、左对齐。图片区随名称行下移38px，底栏不移动。真实名称和数量来自当前分享；没有以 Figma 的“林间晨光1 / 48”固定值替代。                                                         |
| 隐藏名称放大：[434:4079](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-4079)、[434:8858](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8858)；[桌面设计](./figma/434-4079.png)、[手机设计](./figma/434-8858.png) | `actual/interactions/sharing-viewer-zoomed-{light,dark}-{1440,390}.png`           | 已独立核对居中“序号 / 数量 · 已放大”、收起全屏和前后按钮、690/390px零内缩舞台、下方“可拖动查看图片。”以及等宽关闭/还原。桌面按钮574×48px、手机173×48px，间隔12px。先前保留普通态控件和15px内缩的实现偏差已消除。 |
| 显示名称放大：[494:4348](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=494-4348)、[494:9536](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=494-9536)；[桌面设计](./figma/494-4348.png)、[手机设计](./figma/494-9536.png) | `actual/interactions/sharing-viewer-zoomed-names-{light,dark}-{1440,390}.png`     | 实际四图与对应设计一致：居中放大标记下方保留左对齐16px/22px名称，零内缩舞台分别从桌面216px、手机226px开始；拖动说明在下方，关闭/还原固定。没有以名称替代计数，也没有将名称放进工具条。                           |
| 隐藏名称全屏：[434:4104](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-4104)、[434:8883](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8883)；[桌面设计](./figma/434-4104.png)、[手机设计](./figma/434-8883.png) | `actual/interactions/sharing-viewer-fullscreen-{light,dark}-{1440,390}.png`       | 已复核品牌/首页收起，计数居中，舞台920/684px，底部只留退出全屏。按钮桌面1160×48px、手机358×48px；照片没有随深色主题反色。                                                                                        |
| 显示名称全屏：[494:4369](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=494-4369)、[494:9557](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=494-9557)；[桌面设计](./figma/494-4369.png)、[手机设计](./figma/494-9557.png) | `actual/interactions/sharing-viewer-fullscreen-names-{light,dark}-{1440,390}.png` | 实际四图保留54px处名称行，舞台从92px开始，920/684px舞台与内容滚动沿对应设计。计数居中且退出按钮固定，名称没有被公共品牌或后台信息替代。                                                                          |
| 图片读取错误：[432:3744](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3744)、[432:8084](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-8084)；[桌面设计](./figma/432-3744.png)、[手机设计](./figma/432-8084.png) | `actual/representative/sharing-viewer-preview-error-{light,dark}-{1440,390}.png`  | 品牌和短描述居中，错误 Card 上缘为桌面242px、手机198px，宽480/358px，24px内距与圆角。标题22px/32px，下方保留具体错误、返回相册和黄色重新加载，均48px高。错误恢复不使用正常态固定底栏；与对应错误节点一致。       |

可点击代表图：[桌面普通态](./actual/representative/sharing-viewer-hidden-name-light-1440.png)、[手机名称态](./actual/representative/sharing-viewer-visible-name-dark-390.png)、[桌面名称放大](./actual/interactions/sharing-viewer-zoomed-names-light-1440.png)、[手机名称全屏](./actual/interactions/sharing-viewer-fullscreen-names-dark-390.png)、[桌面错误](./actual/representative/sharing-viewer-preview-error-light-1440.png)、[手机错误](./actual/representative/sharing-viewer-preview-error-dark-390.png)。完整视口、主题和几何数据随统一证据的各浏览器报告保存。

## 响应式与补充状态

| 状态                                  | 实际页面与对照结论                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 360/430/768px，隐藏/显示名称、浅/深色 | 独立查看 `actual/representative/sharing-viewer-{hidden-name,visible-name}-{light,dark}-{360,430,768}.png`。手机左右16px，底栏按现有按钮等分；360px四按钮宽73px且高48px，文字没有截断。768px使用完整公共页层级，内容在底栏前滚动，不靠缩小整张手机或桌面图适配。                                                                           |
| 390×420短视口，浅/深色                | 已查看 `sharing-viewer-short-viewport-{light,dark}-390x420.png` 及 `…short-viewport-scrolled…`，分别归档于 `actual/representative/` 与 `actual/interactions/`。品牌与首页保留，底栏按钮上缘356px、高48px，不跟随正文移动；滚动到底可见图片下缘。实际报告内容区150–340px、最大滚动292px，图片下缘293px，与固定底栏分离。                   |
| 存储停用，1440/390px、浅/深色         | 已查看 `actual/revocation/sharing-viewer-disabled-placeholder-{light,dark}-{1440,390}.png` 对应源图。原舞台中央使用 Lucide ImageOff 和“存储已停用”文字，放大禁用；关闭及有效邻居保留。依据 handoff 的记录占位及禁用原因文字规则，未用原图替代或只靠按钮变灰表达原因。                                                                     |
| 邻居加载，1440/390px、浅/深色         | 已查看 `actual/race/sharing-viewer-neighbor-loading-{light,dark}-{1440,390}.png` 对应源图。HeroUI Spinner 与“正在读取图片…”在舞台下方已有状态区域可见，使用透明背景和中性文字，保留当前图/名称并禁用切换与放大；关闭、首页和全屏保留。说明没有占据彩色块或遮住固定底栏。依据 T-SHR-04 的连续加载表达及 handoff 加载组件规则完成状态补齐。 |
| 邻居读取失败，1440/390px、浅/深色     | 已查看 `actual/race/sharing-viewer-neighbor-error-{light,dark}-{1440,390}.png` 对应源图。实际“图片读取失败，请重试”沿既有错误 Card、品牌和公共背景组合，位置与图片读取错误节点一致；仍有48px返回相册/重新加载。不新造结果页面或沿正常底栏挤入错误。                                                                                       |
| 状态检查失败，1440/390px、浅/深色     | 已查看 `actual/race/sharing-viewer-status-check-error-{light,dark}-{1440,390}.png` 对应源图。保留当前图片和普通底栏，舞台下方显示14px中性“状态检查失败，当前内容已保留。”与44px重试按钮。文字和按钮可见，底栏不遮挡；没有大面积彩色说明。依据 T-SHR-04 连续恢复表达和 #192 的获批检查失败组合。                                           |
| 空/授权失效/成员移除                  | 大图只有有效当前成员才存在，当前图移除返回既有列表；授权失效回既有门禁，不新造空大图或成功页。这里的协议及页面切换属于功能报告，不能由本记录的静态截图宣称通过。列表/门禁公共设计沿 #192 已确认方案。                                                                                                                                     |

## 差异来源与处理

- 当前公共页面有低对比度点阵，而保存的这些大图 Figma 节点尚无点阵。来源是 handoff“公共页面、导航与布局”第一条的明确要求；实现复用现有 `PublicShell`/公共装饰，保留两处柔光且深色减弱，不因旧画板缺口删除已确认规范。本次没有修改公共组件、主题或其他消费路由。
- `434:4029` 的中间示例只有居中计数和关闭/前后按钮，缺少主节点已有的放大和全屏。真实普通态以 `434:4003/434:8782` 的计数行和底栏为控件依据，按公开邻居组合前后按钮；不声称与该中间示例逐控件一致。SPEC §7 与 T-SHR-04 对任意可读当前图要求缩放/平移、关闭及支持时全屏，未按1/2/3/47/48示例序号限制能力。补齐沿用主节点的同一区域，不增加页面结构或新的交互流程；没有写入 Figma，也没有声称节点已同步。
- Figma 的 Ariso、照片、48张与“林间晨光”是数据样例。实际品牌为测试站点“摄影手记”，名称/图片/124张来自独立真实夹具；按 handoff 的动态数据原则保留品牌56px层级和相同槽位，中文使用现有字体回退。测试照片不作为固定设计资产复制进产品。
- HeroUI 的主题颜色、按钮交互及字体渲染复用现有公共实现；本次匿名按钮明确14px、普通字重、8px圆角。错误 Card、Spinner、Button 和共享品牌组成状态，大图由现有 YARL Inline/Zoom 与 ViewerImage 展示能力承担，没有再造通用控件或另建公共 UI 框架。
- 匿名设计保留名称策略、首页出口、普通底栏和全屏。handoff 中 #185 的仅关闭图标批准明确属于管理大图，不能覆盖本任务的匿名节点。

## 功能与人工验收边界

代表状态源为 `viewer-complete`，停用占位源为 `viewer-final`，最终名称放大/全屏已换为 `interactions-verified` 同状态截图，加载/邻居错误/状态检查失败已换为 `race-recovered` 同状态截图；初次独立复核源分别为 `interactions-complete` 和 `race-final`，视觉输入没有改变，主任务归档到上述 `actual/` 目录。焦点修正只改变 effect 触发条件，后续 race 修正只改变测试事件观察，未改变这些视觉输入，故不机械重审未变化截图。

`viewer-complete` 整体在 `Input.dispatchMouseEvent` 超时后为 failed，尽管26个代表状态与4个修复后放大态已经取得。`viewer-final` 整体在名称等待处失败，尽管其中全屏、短视口和停用截图可用于各自布局对照；`interactions-final` 在页面执行超时处失败，也保留该次结果。最新 `interactions-verified`（56检查/20布局）与 `race-recovered`（10检查/12布局）均 passed，由主任务的通过报告单独记录。本记录不会把截图或局部状态当成完整功能通过，默认全量失败也独立保留。

本评审不重新运行实现者已经执行的 checks。键盘连续切图、Escape、滚轮/双指缩放、拖动、退出全屏回焦、关闭回卡片与来源滚动均需真实功能证据。当前 Ego 支持 Fullscreen，不支持该能力的浏览器及系统拒绝全屏状态未取得实际截图。真实手机、物理软键盘及非零安全区本轮未实测，适用执行约定取消的设备门槛；浏览器响应式、短视口和点击目标仍须保留。

最终用户人工验收尚未进行；方案已有依据、代码实现、自动检查、独立设计评审均不能替代它。人工预览及独立凭证由主任务在聊天中交付，本记录和 PR 不保存凭证。
