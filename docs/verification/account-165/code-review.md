# Issue #165 独立代码审计

日期：2026-10-05（Asia/Shanghai）。审计者为独立 agent，实际读取并应用 `code-review-and-quality`、`vercel-react-best-practices` 及其相关规则。本记录不包含测试凭证。

## 当前完整代码结论

用户批准图标版原型后，已审查本次完整产品代码、公共组件消费者与验证入口，未发现必须修复的产品实现问题，代码审计通过。最终账号定向浏览器流程已在 1440 和 390 两端通过，两个视口均覆盖真实并发 409、字段保留、错误焦点与显式重试。全量 integration 未绿、默认 full 浏览器中途失败、两可导航浏览器上下文未验证和人工验收未完成仍保留。代码审计及账号定向通过不代替这些完成条件或独立设计审计，PR 仍须按实际状态保留草稿。

本次代码范围按工作树相对 `HEAD=d337f6f1` 核对。任务期间远端 main 的其他文档提交，不误认为本任务的文件删除；最终 PR 仍需核对最新远端状态。

## 后端阶段结论

本轮后端静态审计及新增请求处理器复审未发现必须修复的功能、权限或事务问题。此结论只覆盖当前账号服务、API、输入契约、所有者会话调整、请求错误处理和新增测试，不代表整个 Issue 已批准。UI、真实浏览器验证、独立设计审计及人工验收仍待完成；完整变更须再审。

审计依据为项目 `AGENTS.md`、[文档导航](../../README.md)、[执行约定](../../tasks/execution.md)、[T-ID-04 与 DG-ACCOUNT](../../tasks/m3-m4-platform.md#t-id-04-邮箱与密码管理)、[identity 规格 §5/6/10](../../specs/SPEC-identity.md)及 GitHub Issue #165。先阅读 `tests/integration/identity/account.test.ts`、输入校验和运行器单元测试，再逐条追踪服务、路由、认证实例、所有者入口、数据库约束、连接与日志。

## 核对结果

| 维度         | 当前结论与依据                                                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 需求覆盖     | GET 只返回真实邮箱。邮箱更新核对本地密码、不依赖 SMTP，事务内重置验证状态并撤销本用户未用重置凭据。GitHub account 行不被修改。密码更新保留当前 Cookie 对应的同一 session，删除同一所有者其他 session。                                                             |
| 输入与权限   | Zod 规范化邮箱且保留密码空白，服务端检查 8–128 字符与确认密码。路由先读取库签名 Cookie 会话并检查保存的站点 origin；客户端 userId、sessionId、revokeOtherSessions 不能改变操作对象或策略。原生任意用户更新、credential 解绑、changeEmail/changePassword 仍未开放。 |
| 并发与一致性 | 密码验证和新密码哈希在事务外完成。IMMEDIATE 同步事务先复核 credential ID/哈希与当前 session，再执行写入；校验期间密码变化要求显式重试。事务回滚不会留下邮箱/凭据与会话各自一半的结果。                                                                             |
| 模块与简洁性 | 修改留在 identity，未引入新依赖、兼容层或跨 storage/media 的账号职责。`requireOwnerSession` 返回库会话，原 `requireOwner` 仍只投影 `.user`；已检查现有消费者调用方式，未改变其返回契约。                                                                           |
| 资源与诊断   | 服务复用 runtime 所持数据库连接，不新增连接、计时器或独立 session 缓存。已检查错误映射与日志路径，数据库失败保留底层诊断与路径，剥离可能包含哈希参数的 Drizzle 外层错误。                                                                                          |
| 测试有效性   | 新增集成测试使用独立临时目录、真实 standalone HTTP 进程、Better Auth 和 SQLite，覆盖 verified=true/false、无 SMTP、新旧邮箱/密码登录、两个 Cookie、输入/来源失败、并发密码变化及触发器注入的事务回滚。数据库快照与真实请求相互验证，不仅断言 mock 调用。           |
| 默认验证入口 | `test:integration` 的 integration 通配确实包含账号测试。浏览器 `account` 已接入定向入口与默认 full 流程，full 在其他 suite 使用完原凭证后执行账号修改；完整 UI/e2e 已进行源码审查，实际执行结果单独记录。                                                          |

## Better Auth 1.7.5 核对

实际读取了当前安装包的 `dist/crypto/password.mjs` / 类型、`dist/api/routes/update-user.mjs`、`password.mjs`、`session.mjs`，以及 Drizzle better-sqlite3 的同步事务实现。

原生 `changePassword` 在更新 credential 后依次删除全部 session、创建新 session、设置新 Cookie。这些写入不是单个同步事务，也无法保留现有 session ID。当前实现复用库 `hashPassword` / `verifyPassword`，自行执行短事务，有充分源码依据，满足本任务既定行为。复审已回读 identity 规格 §6.2 的实际机制说明；产品行为没有新增。

库重置记录的准确形状为 `identifier = reset-password:<token>`，`value = user.id`。当前删除条件同时约束 prefix 与 owner ID，与源码相符。

## 后端与请求处理复审

上轮两项非阻塞建议均已落实：账号集成测试新增邮箱和密码校验期间当前 session 被撤销的两例，真实异步核密码后返回 401，持久状态与并发撤销后的快照一致；重置记录注释已修正为 token 前缀和 value 用户 ID。

先读新增的 `tests/unit/identity/account-request.test.ts` 与失败/通过记录，再审 `src/components/identity/account-request.ts`。失败 HTTP 响应的 JSON 是 null、数组或字段类型异常时，错误保留 HTTP status，并仅向表单传递有效字符串字段消息。非 JSON 的失败响应同样保留 HTTP status。成功 HTTP 响应不可读或连接断开会继续抛出错误，没有把它们包装成修改成功或“未发生写入”。没有自动重试请求。

后端阶段复审时，产品 UI 尚未实施。以下完整 UI 审计已补充其消费者路径，运行证据仍与源码结论分别记录。

文档复审发现 §10 的密码接口职责仍保留“库 changePassword”，与 §6.2 和实现不一致；实施者已同步实际机制并补充 GET `/api/account` 的 Cookie 所有者与只读邮箱职责。回读确认修正生效。

## 完整 UI 与公共组件审计

实际读取了 `AccountPage`、`AccountEditor`、`useAccountEditor`、账号请求与页面入口，相关校验/回跳测试、完整 `e2e/account.mjs`、公共导航场景、浏览器运行器，以及 HeroUI 3.2.6 Modal 的源码和类型、TanStack Query 5.103.1 的默认参数与查询更新实现。

| 核对项         | 代码结论                                                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 读取与数据来源 | 服务端页面独立鉴权，API 独立鉴权。页面先取得真实 GET 邮箱再开放编辑；请求失败呈现重读，401 呈现登录入口。只传递外壳实际需要的站点、邮箱、名称与折叠偏好，没有传 credential、完整 session 或密钥。                                                                                                             |
| 保存与字段状态 | 点击动作内先校验；`inFlight` 立即禁止重复请求，phase 控制显示和禁用。错误密码/字段错误保留其他输入。当前服务器唯一的 409 来源是并发 credential 变化，页面清空旧当前密码、保留新邮箱/新密码与确认值，并回焦当前密码。                                                                                          |
| 结果未知       | 5xx、成功响应不可读、异常成功形状和断线不报告成功。邮箱只回读当前值，核对成功也明确其他结果未确认；密码不能回读，只有显式退出后登录核对。未知界面不提供重新保存，未调用未实现的邮件/CLI 恢复能力。                                                                                                            |
| 会话与成功     | 正常保存使用真实响应更新当前邮箱，关闭原 Modal 并使用共享中性 Toast。当前会话保留语义与服务器一致。密码未知核对必须先取得实际 sign-out 成功；失败留在同一恢复 Modal，不抢先跳转或隐藏失败。                                                                                                                   |
| 焦点与生命周期 | 使用 HeroUI/React Aria 原生 Modal、焦点范围与回焦。首次字段聚焦的动画帧在卸载时取消；卸载后 mounted 标志阻止更新旧编辑器，已发送写入继续完成。忙碌时字段、密码显示按钮、关闭、取消及 Escape 均禁用；提交前/关闭的同步 ref 守卫涵盖 React 尚未提交禁用态的间隙。运行中的焦点恢复和短视口结果以浏览器证据为准。 |
| React/Next.js  | HeroUI 使用组件子路径；Next 16.3.5 内置优化列表包含 `lucide-react`，不添加重复配置。busy 等简单状态直接推导，回调使用实际依赖，未引入新的全局监听或轮询。TanStack `networkMode: always` 默认关闭 reconnect 重读；页面另明确关闭窗口聚焦重读，成功更新没有未声明的后台重读分支。                               |
| 公共消费者     | 账号与处理设置共用 `SettingsHeading`、真实分类配置和桌面 Tabs/手机 Select。外壳 `activePaths` 仅为账号页归属已有站点设置项，不复制导航。已读全部 SettingsCategories 消费者（处理、账号、外壳夹具），及 IdentityField 消费者（初始化、登录、账号）；新增 isDisabled 默认 false 保持既有消费者行为。            |
| 验证入口与场景 | 默认 full 在其他场景消费原凭证后执行两个代表宽度的 account；定向 account 不接受其他 suite 的共享参数。场景使用独立生产目录、真实 HTTP/SQLite、真实写入后保持/丢失响应，断言输入保留、字段关联、焦点、滚动、单次写入、旧登录失效、其他真实 Cookie 会话撤销和退出持久失败恢复。没有用伪造接口成功替代真实提交。 |

没有引入需要额外结构审查的复杂框架。页面、展示与编辑状态职责分开，未要求无具体失败依据的防御层或不必要抽象。

### 布局与并发验证调整复审

已回读最终展示调整：Modal Header 使用 `items-start`，未知结果的说明归入 Header，邮箱核对使用 Check 图标；两组 Footer 明确 `grid-cols-1`，修正实际截图中仅 108px 宽的操作按钮。共享 SettingsCategories 的 Tabs 使用自动宽度、禁止压缩和折行，手机选项的图标与标签由同一 flex span 排列。这些调整没有改变请求或状态契约。

账号入口的两项 outline 操作、Modal 取消/返回按钮显式使用 `bg-background`，与深色主题的设计修正一致。未知结果的主操作保留原主题主色。此处只核对代码影响，截图与 Figma 对照由独立设计审计记录。

新增 `passwordConflict` 发起两次真实密码请求，必须取得真实 UI 409 后验证清空当前密码、保留新密码与确认值、关联错误及焦点，再由用户动作显式重试。若 UI 先赢，先验证实际持久密码再使用不同输入进入下一轮；三轮仍未取得 UI 409 会失败，不跳过该分支，也不伪造服务端成功。持久密码使用实际 SQLite credential 和 Better Auth `verifyPassword` 核对。

`stateGeometry` 只在同一个真实状态切换两种主题并截图，不重新提交写入。通知定位修正仅保存操作打开前的 title ID 数组，成功必须看到同标题且具有新非空 ID 的通知，不会因旧通知仍可见而误认成功，也未保存完整节点或正文快照。上述源码复审未发现需要进一步修改的问题。

### 最后验证脚本与焦点样式复审

再次实际读取 `code-review-and-quality` 后，复审了最终增量。账号定向在独立测试数据上依次执行 1440、390 的邮箱、竞态密码、常规密码和未知结果恢复场景，每端完成才写入 `business: passed`；默认 full 的定向宽度仍只执行当前端的业务流程，没有降低默认入口覆盖。

登录重试只允许真实认证 429。脚本读取实际 `x-retry-after`，要求 0–60 秒内的有效正值，最多三次真实请求；每次 429 与等待窗口保留在报告。账号邮箱/密码写入不在这个重试范围。UI 登录仍通过真实输入与 Enter，保留原登录 reason、returnTo 和输入；非 429 失败会直接使断言失败。独立 Cookie 登录在重试前消费失败响应，未关闭认证限流或篡改服务结果。

下一编辑操作前，通过当前最前方 Toast 的真实关闭控件与 Enter 关闭旧通知，并等待其 ID 与最终节点消失。当前成功仍必须看到本次新通知 ID；旧通知处理没有替代成功回焦或滚动断言。密码竞态仍强制取得 UI 409；合法 UI 赢家核对实际持久密码后使用新输入进入下一轮，达不到指定分支便失败。

共享 Tabs 的 `outline-none` 只加在根节点。已读取 HeroUI 与 React Aria Tabs 源码：根节点使用 `useFocusRing({ within: true })` 表示内部焦点且未设置 tabIndex，因此全局 `[data-focus-visible=true]` 会给整个容器添加多余轮廓。局部规则不继承给实际 Tab、Select、按钮、字段或 TabPanel，它们原有的焦点规则保留。已回读 [处理设置焦点记录](./browser/settings-focus.json)：真实键盘 Tab 在两种主题下保持 Select 的 4px box-shadow 焦点环，Tabs 根轮廓为 none；没有写入处理设置数据。该记录只证明实际测量的消费者与控件，不扩大为全部焦点状态的运行结论。

### 最后加载图标修正复审

产品增量仅为 AccountEditor 两处 Spinner 的 `color="current"`。实际读取 HeroUI Spinner 类型、渲染和样式：默认 accent 对应黄色，`spinner--current` 使用 `color: inherit`，SVG 渐变使用 `currentColor`。因此显式继承按钮前景是库已有能力，可以修正黄色主操作上的同色加载图标，无需新增 SVG 或改变 busy 状态及请求。

新增浏览器断言在真实邮箱保存、密码保存与邮箱核对状态要求恰好一个 Spinner，所属按钮必须 disabled；实际 Spinner 前景必须等于按钮前景且不同于按钮背景。在同一真实状态切换主题，两端业务流程均调用该检查，没有为了截图重新发起写入，也未降低此前行为断言。此次源码复审无必修问题。

## 已发现的验证与范围外问题

- **已补齐的页面分支**：已回读 [账号通知定位失败记录](./browser/account-toast-locator-failure.json)。该次运行已通过读取、响应式、邮箱和并发密码场景；真实第一轮 UI 409 / 另一请求 200，随后实际字段保留、错误焦点与显式重试断言通过。这不等于整套账号浏览器通过。两个独立 Cookie 会话已覆盖撤销，Ego 的两可导航浏览器上下文仍明确未验证。
- **浏览器脚本失败与修复**：最初 `account-1440` 在 responsive 的取消按钮定位匹配两项，已限定当前 Modal 内业务控件。后续运行在正常密码成功阶段，因前一次密码通知尚可见，旧按标题定位匹配两个通知；保留失败记录，已改为识别本次新增通知 ID。修正后最终账号定向实际通过；此前默认 full 的失败不改写为通过。
- **既有范围外问题**：`src/components/processing/processing-page.tsx` 的 `SessionLink` 传 `returnTo=/settings/processing`，但原基线和当前 `loginDestination` 都不接受该路由。处理设置会话失效后登录会回 `/admin`，随后进入上传页。本任务新增的账号回跳正确。已向实施者报告，未越界修改。
- **既有集成失败**：首轮全量及五个失败文件复验中的 SQLite 锁竞争/超时情况，沿用 [只读诊断](./integration-diagnosis.md)，不重新归因或改写通过状态。受影响的代码相对任务基线未改，静态事实不等于基线执行已经排除回归。

## 验证状态

本审计没有重复执行实施者的业务测试、构建或浏览器流程。实际执行的是文件/源码读取、Git diff、Issue 读取，以及审计文档的定向 Prettier 格式化与检查。

复审已回读以下已有执行记录，没有重复运行：

- `checks/backend-unit.txt`：定向输入校验 11/11。
- `checks/backend-build.txt`：首次类型检查失败，保留为实际修复过程。
- `checks/backend-build-fixed.txt`：修正后编译、TypeScript 与路由生成完成；实施者记录命令退出 0。追踪其他平台的可选原生依赖与 OpenTelemetry 依赖时仍有警告，未冒称发布镜像已验证。
- `checks/backend-integration.txt`：账号真实集成 14/14，包含新增并发撤销两例。
- `checks/account-request-red.txt` / `account-request-green.txt`：异常 JSON 响应先有 2 项真实失败，修正后 7/7。
- `checks/unit.txt`：全量 unit 98 个文件、1284 个测试通过。

完整 UI 审查还回读 `ui-unit.txt` 的 32/32、`ui-lint.txt`、`ui-typecheck-product.txt`、`ui-build.txt` 和 `ui-build-final.txt`。最终布局修正的构建完成编译、TypeScript 和页面生成，实施者确认退出 0。`ui-build-focus-final.txt`、`ui-delivery-typecheck.txt`、`ui-design-final-lint.txt` 亦已回读，实施者确认三项均退出 0。最后加载图标修正的 `ui-build-spinner-final.txt` 和 `ui-spinner-lint.txt` 已回读，实施者确认退出 0；构建中 TypeScript 与页面生成完成。

已回读 [公共导航](./browser/shell-navigation.json) 与 [图片处理消费者](./browser/processing-consumers.json)，两份记录均为 passed，实施者确认共享消费者定向命令退出 0。全量 integration 首次失败，五个失败文件复验仍有一项锁竞争失败。`browser-full.txt` 本轮在 account-1440 定位阶段退出 1；后续账号定向运行在密码 Toast 定位阶段退出 1，两个实际失败均保留，没有记全量浏览器通过。

加载图标修正前的 [账号定向报告](./browser/account-delivery.json) 与 `test-results/browser-account-delivery/runner.json` 均为 passed，实施者确认命令退出 0，独立生产临时目录已移除。报告的 `business` 包含 1440/390 两端 passed，两个视口第一轮均为真实 UI 409 / 并发写入 200，显式重试通过；其后其他 Cookie 会话撤销、未知结果与真实退出失败恢复也通过，`browserErrors=[]`。记录中的真实限流为 page-fetch 的 10 秒窗口及独立 Cookie 登录的 4 秒窗口；未将源码覆盖的 UI 429 分支冒称该轮真实触发。

最后 [加载图标修正后账号报告](./browser/account-spinner-final.json) 与 `test-results/browser-account-spinner-final/runner.json` 均为 passed，实施者确认账号入口命令退出 0，1440/390 两端完整业务通过且 `browserErrors=[]`。12 项真实样式记录覆盖三种 busy 状态、两端和两主题：Spinner 与按钮前景均为 `rgb(39, 35, 67)`，按钮背景为 `rgb(255, 216, 7)`，按钮 disabled 为 true。两可导航浏览器上下文仍为 unverified。最终设计/人工验收状态继续以统一 [实施记录](./README.md) 为准，不机械重跑已过检查。

源码未发现未处理的必修问题。真实浏览器、设计对照与用户人工验收分别保留实际完成状态；未完成项不得由本代码审计代替。
