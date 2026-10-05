# PR #248 P1/P2 补充独立设计评审

本评审独立于产品实现和浏览器执行者，只补审共享会话生命周期修复影响的账号主页面与密码结果未知/前往登录核对状态。原始报告由独立评审者写入忽略目录；这里保存交付副本，既有交付与设计历史记录不修改。

## 当前结论

本轮补充设计评审完成。已实际查看最新两端浅深主页面、密码 unknown 与显式退出等待共 12 张整页图，对照本轮取得的八个当前 Figma 节点，没有发现此次生命周期修复引入的必修视觉/状态缺陷。浮层在等待中完整保留，底层账号页未切成会话失效提示；主操作显示“正在退出…”和可辨识 Spinner，返回与关闭呈禁用。

功能动态结论来自独立执行者的真实报告回读：最后定向 account 入口与业务两端均 passed，后台实际 null 未抢先销毁显式退出浮层。此项不由静态设计评审推导。默认 full 仍为失败记录，人工验收未完成，不能把本补充评审或定向通过改记为完整前端交付通过。

## 实际读取依据

- 完整 [handoff.md](../../../design/handoff.md) 与 [execution.md](../../../tasks/execution.md)，以及既有 [figma-sync.md](../figma-sync.md)、[design-review.md](../design-review.md)。
- `frontend-ui-engineering`、`figma-design-to-code` 和 `figma-use` 的适用指导；本轮调用 Figma `get_design_context` 时携带 `figma-design-to-code`，请求真实截图。
- `OwnerShell`、`SessionControls/useOwnerSession`、`useAccountEditor` 和 `AccountPage/AccountEditor` 的调用关系及当前差异。此次源码变化只让 editor 与 OwnerShell 消费同一会话实例，并复用实际退出确认；既有样式、图标、标题、区域顺序和操作方案未改。
- `e2e/account-password.mjs`、`account-transport.mjs` 的真实退出响应等待场景和 `account-page.mjs` 的截图/状态断言链。测试源码表达预期，不能视为已经运行成功。

Figma 文件 `74sT9Hrf8G4czcWeTkET5b`。本轮实际取得以下八节点的当前设计信息与截图：

| 范围                  | 桌面浅色  | 手机浅色   | 桌面深色    | 手机深色    |
| --------------------- | --------- | ---------- | ----------- | ----------- |
| 账号主页面            | `34:462`  | `102:1713` | `702:15198` | `702:14582` |
| 密码结果未知/登录核对 | `196:877` | `196:1993` | `702:16096` | `702:15108` |

对照按整页/公共区域 → 账号业务区 → 浮层标题、必要说明、主次操作与状态进行。公共区域使用 handoff 中现行 OwnerShell；原 Figma 的旧面包屑和文字“菜单”不要求恢复。实际值按真实账号展示；辅助文字 13px 沿已获批原型与原独立评审，不把旧 Figma 的部分 14px 辅助文字重新变成本轮产品选择。

## 视觉与状态对照

真实来源为根 agent 完成的 `browser/`，本评审逐张使用 `view_image` 查看原图，未操作浏览器或人工预览数据。桌面 1440×1080、手机 390×844；设计整页按相同视口对照，设计浮层自然尺寸额外核对真实整页中的定位、宽度与剩余空间。

| 状态         | 桌面浅/深真实图                                                                                                                        | 手机浅/深真实图                                                                                                                      | 对照结论                                                                                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 账号主页面   | [浅](browser/account-1440-page-light-1440.png) / [深](browser/account-1440-page-dark-1440.png)                                         | [浅](browser/account-390-page-light-390.png) / [深](browser/account-390-page-dark-390.png)                                           | 先核公共品牌、232px 侧栏/手机页眉、当前导航、用户区、标题和分类；沿当前共享组件，无本轮重复外壳。业务顺序、Mail/KeyRound 操作、注册边界与 GitHub 未开放保持，当前密码按钮自身焦点可见，无围住整个业务区的根框 |
| 密码结果未知 | [浅](browser/account-1440-password-unknown-light.png) / [深](browser/account-1440-password-unknown-dark.png)                           | [浅](browser/account-390-password-unknown-light.png) / [深](browser/account-390-password-unknown-dark.png)                           | CircleAlert 标题和简短标题说明保留，正文明确退出后果，黄色登录核对与次要返回层级一致；无再次提交入口。真实注入的响应丢失诊断在正文红字显示，手机完整换行，主次操作未被裁切                                    |
| 显式退出等待 | [浅](browser/account-1440-password-check-logout-pending-light.png) / [深](browser/account-1440-password-check-logout-pending-dark.png) | [浅](browser/account-390-password-check-logout-pending-light.png) / [深](browser/account-390-password-check-logout-pending-dark.png) | 复用密码 unknown 同一浮层、标题、后果说明和操作位置，Spinner 当前文字色在黄底可见，文案“正在退出…”，主次操作与关闭呈禁用。两端浮层完整；后台 null 到达后的底层仍是账号内容，没有误切会话失效恢复卡            |

深色页面/次要操作为 background，卡片/浮层为 surface，主按钮继续黄底深色文字。最新图片中没有丢失图标、错色、意外布局位移或浮层裁切。真实诊断/邮箱导致的自然换行和高度变化沿旧评审的真实数据规则，不要求复制固定示例。unknown 图中的英文 `Verification: account response lost after real write` 来自测试传输注入，保留失败信息的作用已读源码确认，不是本轮新增的静态产品说明。

显式退出等待沿既有 busy 显示方式，没有新增交互方案或 Figma 写入。公共消费者的动态检查由根 agent 单独执行和记录；本报告不从账号代表图推导所有路由已经通过。

## 功能动态证据

已实际回读最后 [runner.json](browser/browser-account-origin-fixed-runner.json) 与 [account.json](browser/browser-account-origin-fixed-account.json)：Node `v24.18.1`，suite `account`，2026-10-05T14:23:34.550Z–14:24:37.668Z，runner/account 均 `passed`，1440/390 两个 business 项均 `passed`，99 个布局/截图、14 条检查记录、41 个真实请求，`browserErrors=[]`。数量不代替设计逐项对照。

P2 动态场景的两条真实请求记录均为 `POST /api/auth/sign-out`、status 200、`backgroundSession: null`、`heldRealResponse: true`，width 分别 1440/390。已读测试调用链确认：退出成功响应被暂缓交给 UI；后台仍向真实服务取得 null，不模拟成功结果。执行中明确断言浮层 `signing-out`、账号页面 `ready`；释放退出响应后明确断言 `/login`、`reason=signed-out`、`returnTo=/settings/account`、当前会话 null，再用真实新密码进入同一账号页。最后通过报告包含两端各自完成的该流程检查文本。退出持久化实际 500 的恢复入口与会话保留亦在同一流程中断言。

本评审没有重跑功能测试。上述时间顺序、HTTP 状态、回到账号目的地与会话清理结论来自执行报告和测试断言链；静态图片仅证明截图时的可见状态。P1 服务端登录竞争的审计/测试结论由代码审计报告另列，不用本设计评审代替。

此前两次定向助手失败仍保留：`browser-account` 的 `page.evaluate` 参数未能 JSON 序列化；`browser-account-json-fixed` 的等待停留在旧服务 origin。根 agent 最小修正参数与登录条件的 origin 核对后，才得到上述最后通过记录，没有用旧失败图冒称产品通过。[默认 full runner](browser/browser-full-runner.json) 的实际状态仍为 failed，停止在账号前的 M2 上传重启等待，不能将定向模式改记为全量通过。

## 验收边界

人工验收仍未完成。手机会话失效没有本轮独立真实截图，本报告不把桌面失效或手机 busy 图当作该状态已补齐。报告中的 `secondBrowserContext` 仍是 `unverified`：能力可以创建空上下文但拒绝 Target.createTarget，独立 HTTP Cookie 会话撤销证据不能冒称两个可导航浏览器上下文已验证。

真实触屏/软键盘/非零安全区按 execution 已取消作为交付阻塞，历史未实测事实仍保留。默认 full 未完整通过、公共消费者检查以及人工验收分别由根 agent 的统一交付记录维护，不由本 12 图补充对照代替。本评审只写这一份忽略报告，未改产品、Figma 或旧历史证据。
