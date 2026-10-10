# 默认浏览器失败后的产品缺陷返修

2026-10-10，所有者授权修复 Issue #184 验证中暴露的产品缺陷，并明确不重复执行无关测试。本轮从 `origin/main`（`eb685ea6`）创建独立工作区、分支 `codex/browser-product-regressions`，保留 [PR #275](https://github.com/dnslin/ariso-next/pull/275) 及已人工验收的密码恢复预览。实施依据继续使用 [SPEC-identity](../../specs/SPEC-identity.md)、[设计交付](../../design/handoff.md)及[执行约定](../../tasks/execution.md)，不新增规则。

## 实际修复

| 行为                          | 原因与改动                                                                                                                                                                                             | 证据边界                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub 配置未知结果核对后回焦 | 原回调只等待一帧，可能先于查询观察者和配置按钮的提交。改为在 `settingsReady` 的提交后消费一次待回焦意图，保留原页面与滚动。                                                                            | 旧代码局部用例失败，修复后原文件 16 项通过；1440 浅色、390 深色真实核对、回焦、原滚动及 Enter 重开通过；尚未证明历史 full 失败的全部时序。 |
| SMTP 保存后继续键盘操作       | 旧保存回调可以在用户已经转向测试按钮后才执行，抢走焦点。改为在空闲 DOM 的布局提交阶段完成回焦，保留现有目标与禁用时标题回退。                                                                          | 单元先失败后通过，最终 4 项覆盖保存、继续编辑、确认取消及发送后的焦点；1440/390 真实保存、继续编辑、Enter 确认及取消通过。                 |
| 成功退出后跳转                | 服务端 `handleAuthRequest` 已在返回成功前用原 Cookie 核实会话撤销，异常返回 500。客户端额外 GET 会被 429/网络失败阻止完成退出。删除重复读取，仍清理上传队列并跳转明确目的地；POST 失败仍允许显式重试。 | 新增 3 项先失败后通过，覆盖限流、失败重试和背景 null 不抢显式退出。原生限流不变。                                                          |

本轮不修改公共外壳、视觉布局、接口数据、权限、原生限流或上传输入。没有新交互方案或 Figma 写入；恢复的是既有焦点和退出契约。公共退出钩子的全部消费路由仍共用相同实现。本轮真实浏览器验证桌面账号菜单的成功退出；手机账号/密码恢复目的地未重复运行，由相关定向单元及退出服务端契约覆盖代码边界，不冒称全部消费路由已重验。

## 原失败的逐项处置

历史 full 为 77 阶段：57 通过、17 失败、3 阻塞，不在本轮重写为通过。原始详细分析保留在 [PR #275 的历史证据](https://github.com/dnslin/ariso-next/blob/codex/issue-184-password-reset/docs/verification/identity-184/browser-regressions.md)。这 17 项不是 17 个已经证实的产品缺陷。

| 原阶段             | 本轮处置                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tokens-1440        | 会话读取真实 429；请求数量与触发来源未捕获，不放宽限流、不增加猜测性重试。                                                                                  |
| oauth-1440-before  | 修复配置按钮提交前消耗回焦的可达竞态；两端真实保存未知 → 失败核对仍未知 → 成功核对回焦/Enter 重开通过。                                                     |
| processing         | 素材重读按钮在浏览器解析时脱离；尚无可信激活及恢复证据，不按猜测改产品。                                                                                    |
| storage-admin      | 服务端实际拒绝非法路径且数据库未改；告警出现与等待不一致，保留未确定。                                                                                      |
| library            | 浏览器执行上下文丢失，不能当作 HEIC 查看器业务失败。                                                                                                        |
| library-batch      | 浏览器执行上下文丢失，不能当作恢复业务失败。                                                                                                                |
| library-reprocess  | worker 实际成功；列表故障夹具等待分页 GET，真实页面可能走无限加载状态读取，故障恢复仍未验证。                                                               |
| library-copy       | 原生图片选择返回后没有队列；本轮原生普通图片选择实际触发一次 change 并进入待上传队列；旧失败序列仍未复现，不猜测其原因。                                    |
| album-cover        | 已登录图库合法规范化为 `?page=1`，精确地址等待不匹配；封面检查未开始。                                                                                      |
| upload-input       | 原生目录枚举返回 cancel、0 文件，产品未接到有效输入；不改成合成输入冒充通过。                                                                               |
| upload-relations   | 本轮 390×400 深色空选项状态 Enter 实际打开标签浮层并聚焦搜索；旧选择/取消序列未复现，未修改产品。                                                           |
| sharing-management | 已返回正确相册，地址追加合法 `?page=1`，精确等待不匹配。                                                                                                    |
| upload-usage       | 库在门户卸载后一帧恢复焦点，原断言可能读取过早；本轮 360 浅色 Escape 关闭后立即及后续 12 帧均回到原 Tips 入口；旧症状未复现，不补手写回焦。                 |
| site-general       | 重新登录后合法 `?page=1` 与共用精确等待不匹配。                                                                                                             |
| password-reset     | 迟到响应覆盖离页已在 PR #275 修复；不在新分支重复实现或测试。                                                                                               |
| smtp               | 原 CA subject 碰撞已在 PR #275 修复。后续新增保存/测试确认失败另取得本轮焦点竞态证据，不称完整 SMTP 已通过。                                                |
| account-390        | 背景读取 429 的来源仍未确定。本轮修复成功退出后的重复读取，真实原生会话读取 429 下 POST 退出 200 并到 signed-out 登录页；不改变该背景断言或冒称原场景通过。 |

三个 OAuth 后继阻塞阶段与最终 SMTP 未执行部分仍保留未验证。测试地址等待、浏览器控制/枚举故障及未证实项不通过修改产品或削弱断言来消除。

## 实际验证

环境：macOS arm64、Node 24.18.1、pnpm 11.19.0、React 19.3.0、HeroUI 3.2.6、Better Auth 1.7.5。

| 实际命令                                                                                                                                                       | 结果                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                               | 通过，未改依赖或锁文件。                                                                                                                           |
| `pnpm exec vitest run --project unit tests/unit/identity/github-navigation-restore.test.ts -t 'restores configuration focus after readback commits'`（旧实现） | 1 失败、15 未选中，取得失败证据。                                                                                                                  |
| `pnpm exec vitest run --project unit tests/unit/identity/github-navigation-restore.test.ts`（修后）                                                            | 16 通过。                                                                                                                                          |
| `pnpm exec vitest run --project unit tests/unit/identity/session-controls.test.ts`                                                                             | 旧实现 3 失败；修后 3 通过。                                                                                                                       |
| `pnpm exec vitest run --project unit tests/unit/identity/smtp-focus.test.ts`                                                                                   | 旧实现 1 失败/1 通过；修后先 2 通过，补受影响取消/发送用例后最终 4 通过。                                                                          |
| `pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts -t smtp`                                                                          | 9 通过、99 未选中；其他场景没有执行。                                                                                                              |
| 改动文件的 `pnpm exec prettier ... --check`、`pnpm exec eslint ... --max-warnings=0`、`git diff --check`                                                       | 通过。                                                                                                                                             |
| `pnpm run typecheck`                                                                                                                                           | 通过。                                                                                                                                             |
| `pnpm run build`                                                                                                                                               | 基线和产品修后各执行一次，均退出 0；Next 构建及 standalone 包装完成。追踪仍报告其他平台可选原生文件及可选 OpenTelemetry 依赖解析告警，本轮未处理。 |
| `pnpm exec vitest run --project integration tests/integration/identity/auth.test.ts -t logout`                                                                 | 3 通过、15 未选中；实际 SQLite/HTTP 验证成功撤销及读取/删除故障保 Cookie、显式重试。                                                               |

定向测试只筛选相关用例；报告中的未选中不表示禁用测试。默认单元入口仍收集新增用例。SMTP 新浏览器案例通过 `verify-browser.mjs` → `browser-plan.mjs` → `smtp.mjs` → `smtp-focus.mjs` 调用，默认 full 和 SMTP interactions 均会执行；`--suite smtp --only focus` 只执行真实保存/继续编辑/键盘确认，参数仅归 SMTP。没有运行 full、全量单元/集成、SMTP 无关协议或其他模块场景。

局部 hook 测试控制状态提交与 HTTP/帧交付，不能代替实际 React/TanStack/HeroUI 在浏览器中的联验。安全的单元红绿输出及命令记录见 [checks](./checks/)；其中 OAuth/SMTP 红绿记录为从实际工具输出保存的摘录，注明了受控模型边界，不冒充浏览器日志。

## 本轮定向真实浏览器

原空间 1 消失时遵守 `ego-browser` 停止边界。所有者随后明确允许新建修复测试空间，本轮仅使用 Ego Lite 空间 4 / p1、独立生产 standalone、独立 SQLite/测试账号。没有使用原 #184 预览数据，没有操作其他任务空间。验证结束后清除本轮设备/媒体模拟，`finish({ keep: ['p1'] })` 已完成一次，保留返修预览供人工验收。

| 实际入口与结果                                                                                                                                                                                 | 证据与边界                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EGO_TASK_SPACE=4 EGO_PAGE_LABEL=p1 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-product-regressions/smtp-focus node scripts/verify-browser.mjs --suite smtp --only focus`，退出 0 | [运行器](browser-results/smtp-focus/runner.json)、[SMTP 焦点结果](browser-results/smtp-focus/smtp.json)。1440/390 浅色：真实 PATCH 200，扩大旧帧延迟窗口，继续编辑、Enter 确认、取消保留草稿和焦点；没有发送邮件。报告的通用 TLS/投递限制是全 SMTP 套件说明，本次 focus 不代表执行这些协议。                                                                                                       |
| `ego-browser nodejs < .data/repair-preview/oauth-check.mjs`，退出 0                                                                                                                            | [OAuth 结果](browser-results/oauth-focus/report.json)。复用现有 `account-auth`、`oauth-page`、`oauth-transport`：1440 浅色/390 深色真实 PATCH 200 后丢弃交付，读取故障仍未知，恢复真实 GET 后配置按钮得到焦点、滚动保持，直接 Enter 重开并读到已保存 clientId。脚本/私有配置在本地 ignored 目录，凭据未进入证据。                                                                                  |
| `ego-browser nodejs < .data/repair-preview/logout-check.mjs`，首次观察退出 1；随后对同一 trace 只读补核对成功                                                                                  | [原观察失败](browser-results/logout/initial-observer-failure.txt)、[同一 trace 与补核说明](browser-results/logout/report.json)。100 次真实读取触发原生 429；实际 POST 200 并进入 `/login?reason=signed-out`。初始观察错误要求整个响应列表只有 POST；实际 GET429 响应先于 POST200 被记录，没有随后 GET 记录。响应记录顺序不证明 GET 发起时间，不将原命令写为退出 0，也不据此解决历史背景 429 来源。 |
| 原页面补充短视口/主题对照                                                                                                                                                                      | [SMTP 布局结果](browser-results/design/smtp-layout.json)、[真实截图与逐项设计评审](design-source-review.md#恢复浏览器后的真实截图逐项对照)。390×400 深色说明与操作可达，Escape 返回测试入口并保留草稿。                                                                                                                                                                                            |
| 三个原上传疑点的最小诊断，没有改产品                                                                                                                                                           | [Tips 12 帧](browser-results/upload-diagnostics/usage-focus.json)、[短视口标签 Enter](browser-results/upload-diagnostics/relation-enter.json)、[原生图片 change/队列](browser-results/upload-diagnostics/native-image.json)。只证明本次最小路径，不能代替旧完整场景通过；原生目录取消等没有重跑。图片未开始上传，诊断后移除独立待上传项。                                                          |

真实截图在 [browser-design](browser-design/)。定向 SMTP 是已进入默认入口的回归场景；OAuth/退出补核使用现有生产页面和辅助方法，无外部 GitHub 登录或真实外部邮件投递。没有重跑 full 或 SMTP 协议矩阵。

## 人工验收入口

独立返修预览：[邮件设置](http://repair276-preview.localhost:50249/settings/email)、[账号设置](http://repair276-preview.localhost:50249/settings/account)。账号密码仅在私有会话提供；独立 ignored `private.json` 权限 0600，不进入 Git、PR 或公开证据。预览保留可用，直到所有者明确要求停止/清理。

请验收 SMTP 保存后继续编辑并用键盘打开测试确认、取消后草稿保留；账号 GitHub 配置打开/关闭及原页焦点；账号菜单成功退出的登录目的地。未知结果/原生限流已由本轮定向故障场景验证，不要求人工制造。预览 SMTP 使用独立本地占位配置，没有外部 SMTP 服务，不能据此验收邮件最终投递。此次没有新视觉方案；对应 Figma 节点和已知既有差异见设计评审。本次人工验收仍待用户；#184 密码恢复 UI 已通过的验收保持原状态。

## 评审与完成状态

独立 `code-review-and-quality` 评审者已核对三处产品改动、服务端退出契约、失败/修后证据和默认/定向入口，无必改项；评审者未重复执行检查，见[最终代码审计](./code-review.md)。设计来源和最小真实页面对照清单见[设计来源核对](./design-source-review.md)。

| 层次                   | 当前状态                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 三处代码修复与定向单元 | 已完成。                                                                                                            |
| 本地静态、类型、构建   | 已通过。                                                                                                            |
| 真实浏览器             | 受影响 SMTP/OAuth 定向通过；真实 429 下退出达到预期，原观察命令失败及补核边界单列。没有重跑历史 full。              |
| 本轮真实页面设计评审   | 独立评审者实际查看 11 张产品图及 Figma；本次行为增量通过，既有差异单列，非整页逐像素一致。                          |
| 人工验收               | PR #275 的密码恢复 UI 已通过，本轮新增修复尚未验收。                                                                |
| 远端检查               | [PR #276](https://github.com/dnslin/ariso-next/pull/276) 已创建，OPEN / DRAFT；实际查询无远端检查，不记作 CI 通过。 |

本轮 PR 保持草稿，等待本次人工验收；原 full 失败和未执行项保留。没有合并、关闭 Issue、发布、部署、删除分支/工作区或停止既有预览。原 #184 预览与测试数据保持原样，返修独立预览也持续保留。
