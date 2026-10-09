# T-SITE-03 品牌素材服务与 HTTP

Issue [#195](https://github.com/dnslin/ariso-next/issues/195)。2026-10-09，从最新 `origin/main` 的 `4db067f288a0c9859fe791eea57ac2f36365cef9` 创建管理型独立 worktree 和分支 `codex/issue-195-branding`，原工作区未修改。范围按 [任务卡](../../tasks/m3-m4-experience.md#t-site-03-品牌素材存取静态校验与清理)、[site §6/7](../../specs/SPEC-site.md#6-品牌素材与主题)，检查按 [execution](../../tasks/execution.md#适用检查)。[Issue 正文及评论](./issue.json)、[原生前置](./blocked-by.json)、[原生后置](./blocking.json)为实际 gh 读取；#47/#53/#149 均 CLOSED，直接后置 #196 OPEN。

代码提交 `b335c8dd7adfb9cb43f4fcf209db74df8cc25074` 已推送；[PR #274](https://github.com/dnslin/ariso-next/pull/274) 为 OPEN / 草稿，创建后实际 gh 读取为 MERGEABLE / CLEAN，`statusCheckRollup: []`。没有远端检查记录，不记作 CI 通过；日常 PR 按统一执行约定在本地验证。本次未合并、未关闭 Issue、未发布或部署，分支与 worktree 保留。

## 实施结果与边界

- `src/server/site/branding.ts` 复用 EV-SITE-01 的 ExifTool/ImageMagick/XML/CSS/resvg 解析结论，Logo 接受 PNG/JPEG/WebP/静态 SVG，Favicon 接受 PNG/ICO/静态 SVG，保留确认 MIME。未新增依赖。上传使用既有 `receiveMultipart` 和文件写入器，在接收中限制每份 5 MiB，客户端文件名和 MIME 不决定格式。
- 所有者 `PUT/DELETE /api/settings/site/branding/{logo,favicon}` 复用 identity Cookie 与同源写入保护。multipart 仅单个 `file`，删除独立且幂等；返回 `{url,mime}`，删除两者为 null。站点 GET/PATCH 增加 `logoUrl/faviconUrl`，原文本、公开地址和时区保存边界不变。
- 文件保存在 `assets/branding` 的 `site-{kind}-UUID.ext`。步骤为接收/校验、写新文件、短同步数据库事务提交引用、删除旧文件。接收/写入/提交失败保持旧引用和字节；提交后清理失败保留路径及原错误，下一次启动重试。启动只清自有严格文件名及 `.site-branding-UUID` 工作目录，不碰其他模块数据。关闭取消并等待活动操作后才关闭数据库。
- 匿名 `/branding/<key>` 仅服务当前引用；旧 URL 返回 404。当前引用文件缺失为明确 `500 / SITE_ASSET_MISSING` 并记录实际路径，不回退默认素材。SVG 为 `image/svg+xml`、attachment、nosniff 与 CSP sandbox，只作为图片资源使用。
- root `generateMetadata` 在 `connection()` 进入真实请求后读取名称、描述和 favicon；更新后新请求使用新 URL。首页和分享页现有专属标题保持各自职责。不存在构建期数据库读取或进程级品牌配置缓存。
- 不进入图库、媒体计数或访问统计，不支持自定义 HTML/CSS。名称/描述现有 PATCH 已实现，本次复用并验证。品牌管理 UI、公共标识与登录/分享的视觉联动由 #196 承接。本次无页面结构、控件或视觉修改，Figma、设计评审、响应式/主题矩阵与 UI 人工验收不适用。当前仓库没有内置 favicon 素材，删除恢复原有无自定义 favicon 状态，不将工程 `runtime.svg` 冒充产品图标。

## 验证调用链

`pnpm run test:integration` → Vitest integration + media-tools；新的 `branding.test.ts` 和 `branding-http.test.ts` 在 media-tools 执行，普通 integration 排除，默认入口不漏掉新能力。

`pnpm run test:browser` → 外壳和 UI 夹具构建 → `verify-browser.mjs` full → runtime → brand-experiment → **branding**。新生产阶段自有隔离 standalone 和数据库，在相同 Ego space/p1 验证五格式、七用途组合、运行时 favicon、SVG 图片解码/普通链接下载、活动内容拒绝及删除。定向 `--suite branding` 使用同一场景，拒绝无关 only/storage/preview 参数。报告、截图、下载及服务日志接入已有启动清理。独立脚本不输出凭证，保存日志脱敏初始化码和密码。

## 环境与实际检查

macOS 26.6.2 / Apple Silicon arm64；Node **24.18.1**、pnpm **11.19.0**、ImageMagick **7.1.2-32**、ExifTool **13.55**。命令均使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。Ego Lite 唯一 task space **3**，没有下载浏览器。测试数据为独立临时目录；没有修改人工预览或用户数据。Release 镜像/双架构未运行，按现有发布流程承接。

| 检查       | 实际命令与结果                                                                                                                                                                                                               | 证据                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 冻结安装   | `pnpm install --frozen-lockfile` 通过；UI 夹具初次缺依赖后以 `pnpm --dir tests/experiments/ui install --frozen-lockfile` 安装通过                                                                                            | [UI 安装](./checks/ui-install.log)                                                                                                                                                                 |
| 类型       | `pnpm run typecheck` 初次暴露新响应字段夹具与返回类型问题，修复后通过；最终审计修复后再通过                                                                                                                                  | [初次](./checks/typecheck-first.log)、[最终](./checks/typecheck-reviewed.log)                                                                                                                      |
| 静态       | `pnpm run lint` 通过；审计修复后仅 `pnpm exec eslint src/server/site/branding.ts tests/integration/site/branding.test.ts tests/integration/site/branding-http.test.ts --max-warnings=0` 通过                                 | [全量](./checks/lint.log)、[受影响文件](./checks/lint-reviewed.log)                                                                                                                                |
| 构建       | `pnpm run build` 初次发现新增测试 mock 的类型错误，修复后通过；审计修复后最终构建通过。保留 Next NFT 的非本机可选二进制及可选 OpenTelemetry 警告                                                                             | [初次](./checks/build-first.log)、[最终](./checks/build-reviewed.log)                                                                                                                              |
| 单元       | `pnpm run test:unit` 149 文件 / 1899 测试通过；agent 对最终新增运行器矩阵执行 `pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-runner.test.ts`，2 文件 / 315 测试通过 | [全量](./checks/unit.log)；315 项结果为该命令实际执行报告，未另存日志                                                                                                                              |
| 品牌服务   | `pnpm exec vitest run --project media-tools tests/integration/site/branding.test.ts` 初版 32/32 通过。独立审计再取得旧 URL 交错读取失败证据；修复后 replace/remove 及当前缺文件三项通过                                      | [修复前](./checks/core-race-before.log)、[修复后](./checks/core-race-after.log)                                                                                                                    |
| 品牌 HTTP  | 首次 11/12 通过，缺路径测试误将 Next 标准 `/branding/` 308 预期为 404；修正为精确 308/Location + 规范路径 404 后该项通过。最终构建后三项定向检查 3/3 通过（实际命令见下方），含两用途 5 MiB−1/精确上限/+1                    | [初次](./checks/branding-http-first.log)、[路由修正](./checks/branding-http-routing.log)、[最终三项](./checks/branding-http-reviewed.log)                                                          |
| 定向浏览器 | `EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/branding-195 node scripts/verify-browser.mjs --suite branding` 通过：五格式、七用途、真实图片解码、SVG 下载保留原页、运行时 metadata、拒绝与删除          | [runner](./browser/runner.json)、[逐项报告](./browser/branding.json)、[协议截图](./browser/branding-image.png)、[下载 SVG](./browser/branding-download.svg)、[输出](./checks/browser-branding.log) |
| 文档       | `node docs/tasks/check.mjs` 120 任务 / 298 需求通过；`--self-test` 五项拒绝案例通过；`git diff --check` 通过                                                                                                                 | [结果](./checks/docs.log)                                                                                                                                                                          |

最终固定源码的 `pnpm run test:integration --maxWorkers=4`：**184 文件通过 / 5 失败，1865 测试通过 / 7 失败**，耗时 659.64 秒。品牌服务 34 项与生产 HTTP 12 项全部通过。失败保留为失败，见[完整日志](./checks/integration-reviewed.log)：隔离无密钥/数据库构建 240 秒超时、secret-preflight 三项请求超时、setup-lifecycle / auth 各一项 5 秒超时、真实 Web + CLI 会话失效一项 CLI 退出码 1。这七项按原断言、`--maxWorkers=1` 定向重跑 **7/7 通过**，5 文件，243.66 秒；其余 53 项为名称过滤未选择，不是修改默认检查。见[串行结果](./checks/integration-failures-reviewed.log)。没有增加超时、削弱断言或修改相关产品代码；不能将串行未复现写成默认全量通过。

修复后 HTTP 和全量失败项的实际定向命令：

```sh
pnpm exec vitest run --project media-tools tests/integration/site/branding-http.test.ts -t '真实上传|匿名读取只服务当前引用'
pnpm exec vitest run --project integration tests/integration/runtime/build.test.ts tests/integration/runtime/secret-preflight.test.ts tests/integration/identity/auth.test.ts tests/integration/identity/reset-password-cli.test.ts tests/integration/identity/setup-lifecycle.test.ts --maxWorkers=1 -t '无密钥和数据库|空生产数据库|wrong key|invalid ciphertext|production constraints|running standalone Web|prestart prepares'
```

`pnpm run format:check` 只报告四份新增证据 JSON 未格式化，修正后对受影响证据执行 `pnpm exec prettier … --check` 通过；产品文件无格式失败。最终新增报告另执行格式、文档结构、链接和差异检查，见[收尾记录](./checks/closeout.log)。

## 默认浏览器最终结果与最终构建复验

冻结安装 UI 夹具后，实际恢复命令为 `pnpm --dir tests/experiments/ui run build`，然后 `EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-195-full node scripts/verify-browser.mjs`，没有传 suite，执行默认 full。2026-10-09 10:55:30–12:38:38 UTC，**50 阶段通过、21 失败、6 阻塞**，进程退出码 1。branding 与最终 isolated-ui 阶段通过。这里是运行器阶段数，包含启动/重启/夹具清理，不能当作业务测试数量或全站验收。

实际失败阶段：`m2-1440-after`、`interaction-polish-1440`、`workspace-continuity-1440`、`oauth-1440-before`、`processing`、`storage-admin`、`storage-cors`、`library`、`library-batch`、`library-reprocess`、`library-copy`、`album-cover`、`upload-input`、`upload-relations`、`upload-usage`、`sharing-management`、`site-general`、`smtp`、`oauth-390-before`、`account-390`、`sharing-viewer`。两端各自的 `oauth-*-after`、`oauth-*-enable-restart`、`oauth-*-enabled` 六阶段被前置失败阻塞，后续能力保持未验证。失败场景内部尚未执行的步骤同样不能记作通过。

[默认运行器完整状态](./browser/full/runner.json)、[失败摘要](./browser/full/failure-summary.json)、[完整输出](./checks/browser-full.log)、[脱敏服务日志](./checks/browser-full-server.log)、[隔离 UI 结果](./browser/full/ui-runner.json)保留实际记录。失败摘要只提取状态、错误和阶段定位；未改写的完整报告及截图保留在本 worktree 的 `test-results/browser-195-full`，不将大量重复图片/布局数据写入 PR。独立只读排查见[审计补充](./review.md)：三个精确地址等待与既有 `?page=1` 初始化不一致；部分失败发生在焦点/弹层或文件选择阶段；M2 恢复后媒体进程检测超时。手机账号场景实际收到认证限流响应，SMTP 等待测试确认弹窗超时，分享查看器等待函数超时。未做修改前后 A/B，不将“源码未修改”当作所有失败无关的证明，也不修改范围外模块来改写结果。

默认浏览器启动后才完成审计 P2 的读取交错修复，生产主夹具在修复前已复制，因此未将该整轮包装成最终源码全绿。最终构建后实际追加 `EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/branding-195-reviewed node scripts/verify-browser.mjs --suite branding`，**通过**：五格式/七用途、真实图片解码、SVG 普通链接下载保留原文档、运行时 favicon metadata、拒绝替换保留旧素材及幂等删除。使用同一 space/p1 与独立临时数据库，没有并行操作 Ego 或改动用户预览数据。见[最终 runner](./browser/reviewed/runner.json)、[逐项报告](./browser/reviewed/branding.json)、[协议截图](./browser/reviewed/branding-image.png)、[输出](./checks/browser-branding-reviewed.log)、[服务日志](./checks/browser-branding-reviewed-server.log)。

## 独立审计与完成状态

[独立代码审计](./review.md)通过，无未解决必修项。审计发现旧文件读取与正常替换/删除交错时误报 500 的 P2，取得失败证据后修复，并独立复审通过。格式条件变异后测试确实失败，恢复后通过。review 中分别保留默认调用链、资源生命周期、模块边界与测试有效性结论，不重复实现者已通过的检查。

本次代码已实现并推送；类型、静态、构建、单元及品牌 46 项集成通过，最终品牌浏览器通过。默认全量集成与浏览器已执行但未通过，原始失败和阻塞状态保留，不能由定向通过替代。没有品牌管理 UI 修改，设计对照及 UI 人工验收不适用，不能声称 T-SITE-04 或 SITE-08 的全页面视觉联动完成。任务卡实施步骤暂不勾选，PR 保留草稿。Release 镜像、双架构与容器未执行，按统一发布流程承接，不创建 Release。

## 执行记录与限制

- 首轮 `pnpm run test:integration --maxWorkers=4` 为 181 文件通过 / 8 失败，1845 通过 / 21 失败 / 6 跳过。运行中曾并发最终构建，构建清理了 HTTP 夹具使用的 `.next/standalone/entrypoint.sh`；P2 两项也在源码固定前执行，故本轮结果受到执行顺序污染。原始失败保留在[日志](./checks/integration-first.log)，最终源码及构建固定后重新运行全量，不将该记录当最终源码结论。
- 首轮全量中的 setup-lifecycle 和 secret-preflight 两项定向重跑 2/2 通过（`-t 'tampered ciphertext|prestart prepares'`），保留[日志](./checks/runtime-failures-rerun.log)；定向未复现不等于全量通过。
- `pnpm run test:browser` 初次在 UI 夹具构建前因未安装夹具依赖失败，见[记录](./checks/browser-first.log)。冻结安装后只重新执行失败的 UI 构建与默认 full 运行器；已通过且输入不变的外壳构建未重复。
- 默认浏览器中的旧 M2 重启场景失败已独立只读核对：同一 job 已恢复一次，随后既有媒体工具进程检测报告 `MEDIA_TOOL_TIMEOUT: Cannot inspect media tool processes`。未发现本次品牌代码因果路径；资源压力是可能性，尚未证实，详见[审计补充](./review.md)。范围外模块未修改。
- 默认浏览器与部分全量集成、串行隔离构建存在并行执行时段，机器也有其他校验负载；没有单独测量资源压力，因此不能把超时或焦点失败归因为压力。原始失败及定向结果分别保留。
- 临时 setup 初始化码和密码不入归档；截图仅记录协议场景，不能当作管理页设计或人工验收证据。原工作区、其他任务的 worktree 与预览未修改。
