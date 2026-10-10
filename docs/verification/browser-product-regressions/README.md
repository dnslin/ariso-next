# 默认浏览器失败后的产品缺陷返修

2026-10-10，所有者授权修复 Issue #184 验证中暴露的产品缺陷，并明确不重复执行无关测试。本轮从 `origin/main`（`eb685ea6`）创建独立工作区、分支 `codex/browser-product-regressions`，保留 [PR #275](https://github.com/dnslin/ariso-next/pull/275) 及已人工验收的密码恢复预览。实施依据继续使用 [SPEC-identity](../../specs/SPEC-identity.md)、[设计交付](../../design/handoff.md)及[执行约定](../../tasks/execution.md)，不新增规则。

## 实际修复

| 行为                          | 原因与改动                                                                                                                                                                                             | 证据边界                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| GitHub 配置未知结果核对后回焦 | 原回调只等待一帧，可能先于查询观察者和配置按钮的提交。改为在 `settingsReady` 的提交后消费一次待回焦意图，保留原页面与滚动。                                                                            | 旧代码局部用例失败，修复后原文件 16 项通过；尚未证明历史浏览器失败的全部时序。            |
| SMTP 保存后继续键盘操作       | 旧保存回调可以在用户已经转向测试按钮后才执行，抢走焦点。改为在空闲 DOM 的布局提交阶段完成回焦，保留现有目标与禁用时标题回退。                                                                          | 单元先失败后通过，最终 4 项覆盖保存、继续编辑、确认取消及发送后的焦点；真实浏览器待执行。 |
| 成功退出后跳转                | 服务端 `handleAuthRequest` 已在返回成功前用原 Cookie 核实会话撤销，异常返回 500。客户端额外 GET 会被 429/网络失败阻止完成退出。删除重复读取，仍清理上传队列并跳转明确目的地；POST 失败仍允许显式重试。 | 新增 3 项先失败后通过，覆盖限流、失败重试和背景 null 不抢显式退出。原生限流不变。         |

本轮不修改公共外壳、视觉布局、接口数据、权限、原生限流或上传输入。没有新交互方案或 Figma 写入；恢复的是既有焦点和退出契约。公共退出钩子的全部消费路由仍共用相同实现，真实浏览器消费路由复查保持待执行。

## 原失败的逐项处置

历史 full 为 77 阶段：57 通过、17 失败、3 阻塞，不在本轮重写为通过。原始详细分析保留在 [PR #275 的历史证据](https://github.com/dnslin/ariso-next/blob/codex/issue-184-password-reset/docs/verification/identity-184/browser-regressions.md)。这 17 项不是 17 个已经证实的产品缺陷。

| 原阶段             | 本轮处置                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| tokens-1440        | 会话读取真实 429；请求数量与触发来源未捕获，不放宽限流、不增加猜测性重试。                                   |
| oauth-1440-before  | 修复配置按钮提交前消耗回焦的可达竞态；实际浏览器复查待完成。                                                 |
| processing         | 素材重读按钮在浏览器解析时脱离；尚无可信激活及恢复证据，不按猜测改产品。                                     |
| storage-admin      | 服务端实际拒绝非法路径且数据库未改；告警出现与等待不一致，保留未确定。                                       |
| library            | 浏览器执行上下文丢失，不能当作 HEIC 查看器业务失败。                                                         |
| library-batch      | 浏览器执行上下文丢失，不能当作恢复业务失败。                                                                 |
| library-reprocess  | worker 实际成功；列表故障夹具等待分页 GET，真实页面可能走无限加载状态读取，故障恢复仍未验证。                |
| library-copy       | 原生图片选择返回后没有队列；缺 change/FileList/扫描证据，不猜测接收缺陷。                                    |
| album-cover        | 已登录图库合法规范化为 `?page=1`，精确地址等待不匹配；封面检查未开始。                                       |
| upload-input       | 原生目录枚举返回 cancel、0 文件，产品未接到有效输入；不改成合成输入冒充通过。                                |
| upload-relations   | 手机短视口 Enter 未出现浮层，焦点/滚动/开关时序需真实定位，未修改产品。                                      |
| sharing-management | 已返回正确相册，地址追加合法 `?page=1`，精确等待不匹配。                                                     |
| upload-usage       | 库在门户卸载后一帧恢复焦点，原断言可能读取过早；仍需真实逐帧复现，不改标题锚点或补手写回焦。                 |
| site-general       | 重新登录后合法 `?page=1` 与共用精确等待不匹配。                                                              |
| password-reset     | 迟到响应覆盖离页已在 PR #275 修复；不在新分支重复实现或测试。                                                |
| smtp               | 原 CA subject 碰撞已在 PR #275 修复。后续新增保存/测试确认失败另取得本轮焦点竞态证据，不称完整 SMTP 已通过。 |
| account-390        | 背景读取 429 的来源仍未确定。本轮修复成功退出后的重复读取，不改变该背景断言或冒称原场景通过。                |

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

## 评审与完成状态

独立 `code-review-and-quality` 评审者已核对三处产品改动、服务端退出契约、失败/修后证据和默认/定向入口，无必改项；评审者未重复执行检查，见[最终代码审计](./code-review.md)。设计来源和最小真实页面对照清单见[设计来源核对](./design-source-review.md)。

| 层次                   | 当前状态                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| 三处代码修复与定向单元 | 已完成。                                                                                             |
| 本地静态、类型、构建   | 已通过。                                                                                             |
| 真实浏览器             | 未执行：原 Ego 空间 1 已不在列表，遵守技能停止边界，等待所有者确认新测试空间。没有操作其他任务空间。 |
| 本轮真实页面设计评审   | 未完成；Figma 来源核对不代替真实截图对照。                                                           |
| 人工验收               | PR #275 的密码恢复 UI 已通过，本轮新增修复尚未验收。                                                 |
| 远端检查               | 待创建 PR 后回读；没有检查不记作 CI 通过。                                                           |

本轮 PR 保持草稿。没有合并、关闭 Issue、发布、部署、删除分支/工作区或停止既有预览。原 #184 预览与测试数据保持原样；本轮未建立可供验收的新浏览器预览，不复用用户预览数据运行故障场景。
