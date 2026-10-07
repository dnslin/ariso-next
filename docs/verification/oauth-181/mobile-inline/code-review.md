# 手机账号行左右排列独立代码评审

2026-10-07。独立使用 `code-review-and-quality` 与 `vercel-react-best-practices`，遵守项目 AGENTS、设计交接及任务执行约定。范围为相对 `044e9188` 的 `account-setting-row.tsx` 和 `e2e/oauth-page.mjs`；产品与测试只有这两个文件变化。本评审者仅阅读源码、调用链和公开证据，未修改产品、运行检查、操作浏览器或读取私有凭证。

## 当前结论

源码与本轮行为证据增量复审通过，没有未解决的 Critical/Required 项。手机标签与值位于同一左列，原操作位于右侧并由外层 grid 垂直居中；无操作行改为单列，符合本轮用户明确批准。桌面由 `sm:contents` 恢复原标签/值/操作三列。没有新增状态、资源、依赖、兼容开关或跨模块职责。本轮构建、类型、静态检查、1636 单元，以及 OAuth/账号定向和独立手机状态验证已有实际通过记录；新手机布局仍待用户人工验收，PR 保持草稿。

已读取旧产品失败证据 [before.json](checks/before.json)：390×844 时邮箱值 y=341/bottom=361，按钮 x 与值同为 161、y=369，sideBySide=false。该记录证明按钮位于值下方，保留为旧布局 RED。新产品 [manual-preview.json](browser/manual-preview.json) 的邮箱左信息块 x=33/right=255，按钮 x=267/y=341、90×44px，间隔 12px，标签和值完整构成 43.5px 高的信息块，按钮中心与之相同；旧 RED 与新布局实际值清楚区分。

## 真实消费与边界

实际搜索全部 `AccountSettingRow` 消费者，仅 `AccountPage` 和 `GithubAccount`，合计四行：登录邮箱、登录密码、GitHub 账号、站点登录配置。

- 所有者邮箱沿用实际 query 读回与既有 `wrap-anywhere`，值容器和内容容器均 min-w-0，右侧成熟 HeroUI Button 保持 44px 高度和既有操作。密码读出语义、编辑器类型和打开回调未改。账号整体 loading/error/session 在这两行之外，仍走原页面分支。
- GitHub 行的已绑定/未绑定/停用提示和用户名包装、配置的 saved/effective/pendingRestart 均保持原数据来源。左列容纳标签与全部值内容，未将状态文本挪入按钮或引入重复状态。长已绑定用户名的既有 `wrap-anywhere` 保留。
- 独立加载时对应 action=null，手机单列使用整行内容宽度；错误时原真实 retry 按钮在右侧；unknown 关闭后的 readback、核对中禁用按钮和真实绑定/配置独立性均由原 view hook 决定。此次只消费原 action，不更改 mutation 是否出现、网络次数或核对结果。
- 每个现有消费行至多一个真实操作。手机使用 `minmax(0,1fr)_auto` 和 12px 横向间隔，宽操作保留自身尺寸，内容可换行；无操作行没有额外空列。桌面外层仍是原 136px/弹性值/auto 操作结构，通用 div 的 contents 不承载角色或控件语义。

DOM 阅读与焦点顺序仍为标签 → 值 → 操作，没有 CSS order、tabIndex、额外交互节点或键盘监听。已有图标 aria-hidden、role=status/alert、密码 aria-label 和 HeroUI Button 可访问名称均保留；内容包装不会重建状态 hook 或改变 modal 的焦点恢复目标。纯展示组件没有新增资源生命周期，复杂度不需要额外抽象或严格结构技能。

## 验证入口与断言有效性

实际核对默认调用链：`package.json:test:browser` → `scripts/verify-browser.mjs` full → `runIdentityManagement` → `runOAuthManagement` → `e2e/oauth.mjs` → `ui.layouts`。定向 suite=oauth 直接调用同一 `runOAuthManagement`。共用运行器和 suite/only 分发没有改动；本评审未扩展至无关套件。

`ui.layouts` 在 before、after 和 enabled 的真实页面代表状态执行；默认 1440 入口检查桌面，390 入口检查 360/390/430/768，定向不传 width 时检查 1440/360/390/430/768。两个主题继续逐项执行，768 使用既有 sm 桌面列结构。

新测试通过每行 scoped data-testid 获取 label/value/content，替代 firstElementChild 和 children[1]，不会因新增包装误把标签或值识别为其他节点。手机宽度要求真实按钮至少 44×44、按钮左边在左列右缘至少 11px 之后、按钮中心与整块标签/值中心偏差小于 1px。桌面仍要求按钮位于值右侧；原标题/图标、四行标签、最大内容宽度、公共几何、主题、弹窗焦点与短视口断言保留。没有跳过旧检查、断言硬编码夹具数据或让旧布局静默通过。

发现并补正的测试覆盖边界：初版新行对齐断言仅在 `ui.layouts`，loading/error/unknown 原有 `ui.geometry` 未执行它。父 agent 随后将同一测量与断言提取为本文件局部 `rowLayout`，由每次 `geometry` 先执行和记录，`layouts` 直接复用 `geometry`。实际复读确认没有重复测量、跳过状态、增加 ready 等待或静默 fallback；共用运行器不变，局部复用对应两类真实场景。

逐项核对 `oauth-settings`、`oauth-binding`、`oauth-reads` 的全部 geometry 前置：独立加载/错误先等 GitHub 区域中的状态节点，而该区域只在 AccountPage 的账号 ready 分支中渲染，所以四行仍存在；unknown 只隐藏相应操作，Modal 保留底层四行；匿名登录入口验证结束后先 accountSignIn 才回到采样。没有公共 Login 的 geometry 调用。rowLayout 对四行继续严格断言，不把 loading/unknown 等成正常状态来采样。

Modal 的 inert/aria-hidden 不改变实际 layout box，rowLayout 只读矩形，不尝试交互；原 readGeometry 仍排除 inert 区域的可交互目标，二者职责不同。桌面 contents 包装可返回零矩形，当前断言仅在手机消费 content 的尺寸，桌面仍消费实际 value 和按钮尺寸。

此前手机状态执行边界已补齐：本评审实际读取 [phone-summary.json](browser/phone/phone-summary.json) 与 phone 目录三个 phase，专门以 config.width=390 运行同一 E2E，before/after/enabled 均 passed；其 loading/read-error/配置 unknown 关闭/两种解绑 unknown 关闭/short 行记录均明确为 390px，三 phase browserErrors=[]。共 61+8+35=104 次四行采样，不以未传 width 的 1440 状态记录替代手机结果。无按钮行没有按钮坐标可断言，但实际主页面的无操作信息块 x=33/right=357，占完整行内宽度；单列语义与设计对照分别保留。

## 实际检查与行为证据复核

实际读取 checks 中构建、typecheck、lint、unit 和最终 E2E 静态日志。环境为 macOS arm64、Node 24.18.1、pnpm 11.19.0；浏览器报告使用已有 Ego TaskSpace 7。本评审者没有重跑这些命令。

| 执行项目                                            | 实际结果与证据                                                                                                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run build`                                    | [build.log](checks/build.log) 记录 runtime 类型编译、Next 成功编译、22 页静态生成及最终路由产出；保留后述依赖追踪诊断                                                                                |
| `pnpm run typecheck`                                | [typecheck.log](checks/typecheck.log)，实际 route typegen 与两份 tsconfig 的 tsc 完成；实现者报告退出成功                                                                                            |
| `pnpm run lint`                                     | [lint.log](checks/lint.log)，实际 eslint 全项目、max-warnings=0；实现者报告退出成功                                                                                                                  |
| 默认单元 `vitest run --project unit --maxWorkers=4` | [unit.log](checks/unit.log) 和 [unit.xml](checks/unit.xml)，122 文件 / 1636 项通过；JUnit failures=0、errors=0，未只跑定向                                                                           |
| OAuth 定向                                          | [runner.json](browser/runner.json)，五阶段全部 passed，13:25:07.821Z 至 13:25:55.568Z；三个 phase browserErrors=[]，正常代表覆盖 1440/360/390/430/768 两主题                                         |
| 账号定向                                            | [account-runner.json](browser/account-runner.json) 与 [account.json](browser/account.json)，passed；14 条检查记录、99 次采样、browserErrors=[]；邮箱/密码实际行为、错误、unknown、会话与焦点恢复保持 |
| 390 专门 OAuth 轮                                   | [phone-summary.json](browser/phone/phone-summary.json) 和三个原始 phase，五阶段全部 passed，104 次四行采样；95 字符独立测试邮箱在 360px 时值实际换为 100px 高，手机状态新断言均执行                  |
| 当前 3182 人工预览补验                              | [manual-preview.json](browser/manual-preview.json)，390 浅深主题及 390×400 通过；邮箱、密码、配置三个入口在两主题中通过真实 Tab 补验，均高 44px、焦点环 4px，聚焦控件完整位于 400px 视口内           |

构建日志同时保留 Next nft 对其它平台 resvg 原生模块及 `@opentelemetry/api` 的依赖解析诊断；没有将成功产出写成“日志无诊断”，也不据此声称容器或跨平台发布验证完成。本次产品输入只有展示行和所属浏览器场景，未修改这些依赖或发布流程。

[manual-keyboard-red.json](browser/manual-keyboard-red.json) 保留补验初版的测试模式 RED：指针模式下 programmatic focus 没有 focus-visible 环，不能因此声称键盘样式缺失。执行者改用真实 Tab 后继续严格要求 4px 环与实际可见性，没有改产品或放宽样式断言；最终六条入口记录的 shadow 均包含 4px 环，top/bottom 均在视口内。

实现者记录手机私有夹具启动器首次在 prestart 阶段没有 setup code，随后调整为服务启动后读取。此记录属于夹具启动时序，不当作已经执行的产品场景；实际公开终态是三个 E2E phase 和两次同数据重启全部通过。标准 runner 没有改变，本评审未读取该私有启动器或凭证。phone summary 明确 manualPreviewUntouched=true、fixtureStopped=true；当前人工预览仅做页面与键盘采样，没有用其数据运行变异场景。

## 当前验证状态

| 项目                            | 本评审实际结论                           |
| ------------------------------- | ---------------------------------------- |
| 源码、真实消费者与默认/定向入口 | 已独立复审，通过，无必改项               |
| 旧产品手机失败证据              | 已读取，保留为 RED                       |
| 本轮构建、类型、静态、默认单元  | 已复核实际记录，通过；构建诊断保留       |
| 本轮 OAuth/账号定向与手机状态   | 已复核终态与对应采样，通过               |
| 本轮 Figma/设计复审             | 对应独立设计流程负责；本审查不替代其结论 |
| 本轮新手机产品人工验收          | 尚未完成，PR 保持草稿                    |

默认完整浏览器历史结果 55 passed / 7 failed / 6 blocked 保留，本轮未重新执行，不将上述定向结果改写为默认全量通过。后端与数据契约未变，本轮没有重复集成或真实外部 OAuth；既有功能、集成失败、真实 provider 与旧人工验收记录保持各自历史结论。新手机人工验收、设计结论和最终统一文档检查由对应交付流程收束，本代码评审不替代。
