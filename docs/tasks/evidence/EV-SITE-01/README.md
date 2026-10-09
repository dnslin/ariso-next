# EV-SITE-01 品牌文件解析验证

Issue [#149](https://github.com/dnslin/ariso-next/issues/149)。2026-10-09，基于 `origin/main` 的 `2ba0a60e71b5fff773229b62f2c6380fe3435f9b`，独立分支 `codex/issue-149-brand-parser`。任务没有直接前置，GitHub 原生 blocking 指向 [#195 / T-SITE-03](https://github.com/dnslin/ariso-next/issues/195)。行为依据 [site §6/7](../../../specs/SPEC-site.md)，检查边界按 [execution](../../execution.md)。

本实验固定现有依赖的使用路径，验证允许格式、静态内容、5 MiB 流式限额和 HTTP 图片显示。没有新增依赖，没有修改冻结 PRD，没有新增生产 `site/branding` 模块、路由或管理界面。实验引用保存在内存，不能当作数据库提交、鉴权、重启清理或品牌跨页联动的完成证据。

## 解析路径与许可

| 能力                 | 实际版本 / 许可                                           | 已检查的能力与使用方式                                                                                                                                     |
| -------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 内容识别             | ExifTool 13.55 / Perl 同许可（Artistic / GPL）            | 复用 `inspectImageFile`，读取真实容器、维度、帧与 ICO 条目，不使用客户端文件名或 MIME 决定格式                                                             |
| 栅格完整性           | ImageMagick 7.1.2-32 Q16-HDRI arm64 / ImageMagick License | 完整解码 PNG/JPEG/WebP 和每份 ICO 条目；`-regard-warnings` 将损坏警告作为失败，识别或 `-ping` 成功不能替代完整解码                                         |
| SVG XML              | `@xmldom/xmldom` 0.9.12 / MIT                             | 阅读已安装 README、`DOMParserOptions.onError` 类型，复用 `scripts/media/svg-policy.mjs` 的严格 XML 解析与 DOM 遍历                                         |
| SVG CSS              | `css-tree` 3.2.1 / MIT                                    | 复用现有 CSS AST 与 escape 解析，排除动画、过渡和外部 URL                                                                                                  |
| SVG 可渲染性         | `@resvg/resvg-js` 2.6.2 / MPL-2.0                         | 阅读已安装类型，复用 `startSvgPreview`，解析后渲染，不提供外部图片 resolver；原 SVG 保留不改写                                                             |
| multipart / 流式写入 | Busboy 1.6.0 / MIT                                        | 阅读 [Busboy 官方 API](https://github.com/mscdex/busboy#api) 与安装类型，复用 `receiveMultipart` 和 `writeReceivedFile`；文件字节限制独立于 multipart 头尾 |

版本由现有 `package.json` / `pnpm-lock.yaml` 固定，未把 Next 的传递 Sharp 依赖引入为新的品牌解析路径。原生工具版本是本机实测版本，发布平台仍按现有 Release 流程取得证据。

素材复用 [现有 CC0 几何夹具](../../../../tests/fixtures/media-formats/README.md)：PNG、JPEG、WebP、静态 SVG 与三尺寸 ICO。新增 XML/活动内容和边界样本由测试构造，属于同样的原始 CC0 测试素材；没有第三方品牌、照片或私有数据。5 MiB 样本通过 SVG XML 注释填充，仍是完整可解析、可渲染图片，不是只有文件头的伪样本。

## 实测行为与后续承接

- Logo 接受 PNG/JPEG/WebP/静态 SVG；Favicon 接受 PNG/ICO/静态 SVG。ICO 的不同尺寸是替代图标，不能当动画拒绝。
- 文件名为 `misleading.html`、MIME 为 `text/html` 的真实图片仍按内容识别。用途不支持的格式返回 `415 / SITE_ASSET_TYPE_UNSUPPORTED`；损坏内容、APNG/WebP 动画、SVG script/event/SMIL/CSS 动画或外部资源返回 `400 / SITE_ASSET_INVALID`。
- 合法内部片段引用、内部渐变与 viewBox 可以渲染。真实 canary HTTP 服务没有收到外部资源请求。不存在的文件保留 `ENOENT`，取消保留 `UPLOAD_CANCELLED`，操作故障不会被误归为内容错误。
- 两个用途都验证 5 MiB−1、恰好 5 MiB、5 MiB+1；前两者成功，后者返回 `413 / SITE_ASSET_TOO_LARGE`。复用写入器在接收过程中停止超限输入，不能先无限缓冲再查大小。
- 替换先接收/验证、写入新候选，再切换引用，最后删除旧文件。无效输入、模拟写入失败和引用提交失败均保留旧 URL 与原字节；成功替换改变 URL，旧 URL 返回 404，另一个用途不受影响。这里的“提交”是实验故障点，不是 SQLite 事务证据。关闭实验时先取消活动请求、关闭连接，并等待解析工具和请求清理结束；即使请求体已收完，也不能在关闭后提交引用。挂起提交的真实 HTTP 回归验证了旧引用/字节保持、候选文件清理及关闭诊断。
- 响应 MIME 来自检测结果。栅格可 inline；SVG 为 `image/svg+xml`，使用 `Content-Disposition: attachment`、`nosniff` 和 `Content-Security-Policy: sandbox; default-src 'none'`。真实 Ego 通过 `<img>` 解码 SVG；点击普通链接触发下载、原 HTML 文档仍保留。沙箱用于素材文档的同源执行边界，参考 [CSP sandbox](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox)。没有内联 SVG HTML。

实验代码：[lab.ts](../../../../tests/experiments/site-branding/lab.ts)、[实际行为测试](../../../../tests/integration/site/brand-parser.test.ts)、[Ego 场景](../../../../tests/experiments/site-branding/browser.mjs)。#195 应消费上述解析和协议结论，继续落实所有者保护、`assets/branding` 真实持久化、数据库引用提交、自有孤立文件启动清理、删除、缺文件错误以及运行时元信息。不得用实验服务替代生产入口，也不得把图库的入库/计数流程借给品牌素材。

## 验证调用链

`pnpm run test:integration` → Vitest `media-tools` → `tests/integration/site/brand-parser.test.ts`；该文件从普通 integration 排除，仅在真实工具组执行一次。

`pnpm run test:browser` → 外壳/UI 夹具构建 → `scripts/verify-browser.mjs` 默认 full → runtime 取得 Ego space → `brand-experiment` 独立阶段 → `runBrandBrowser` → loopback 独立服务 → `ego-browser nodejs` → 五格式解码、活动内容拒绝、保留引用、SVG 下载。阶段放在后续业务检查之前，与其无数据依赖。

定向入口 `node scripts/verify-browser.mjs --suite brand-experiment` 使用相同实验与场景，只要求已有 `EGO_TASK_SPACE`；不建立产品数据库，不接受 `--only`、storage 或 preview 参数。现有 suite/only 的单元测试保留，并新增该入口的参数边界。

## 环境、实际命令与结果

本地 macOS 26.6.2 / Apple Silicon arm64；Node **24.18.1**、pnpm **11.19.0**。所有项目命令使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。真实浏览器为已有 Ego Lite，task space **9**，Chromium 152；没有下载浏览器。服务及测试数据使用临时目录和 loopback 端口，不修改用户预览数据。

实际结果如下。默认浏览器全量有失败且中止，不能记作通过；最终品牌定向验证完整通过。

| 实际命令                                                                                     | 结果                                                                                                                 |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                             | 通过；锁文件未变                                                                                                     |
| `pnpm run build`                                                                             | 通过；未提供部署密钥/数据库；既有 resvg 非本机 optional 包追踪警告保留于日志                                         |
| `pnpm run test:unit`                                                                         | 140 文件、1831 项通过                                                                                                |
| `pnpm exec vitest run --project media-tools tests/integration/site/brand-parser.test.ts`     | 首轮 46/49；缺失文件与取消分类修复、ICO 尺寸预期纠正后 59/59；补充分块 HTTP 与关闭生命周期后最终 61/61 通过          |
| `pnpm run typecheck`                                                                         | 通过；审计修复后最终输入复查通过                                                                                     |
| `pnpm run lint`                                                                              | 首次 prefer-const 失败；修复后通过                                                                                   |
| `EGO_TASK_SPACE=9 EGO_KEEP_SPACE=1 node scripts/verify-browser.mjs --suite brand-experiment` | 通过；首轮修复预连接关闭阻塞；生命周期审计修复后最终 runner 于 09:38:42–09:38:47 完整通过                            |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                  | 通过；锁文件未变                                                                                                     |
| `pnpm run test:integration --maxWorkers=4`                                                   | 184 文件通过、1 文件失败；1822/1823。健康检查子进程在依赖目录被误触及期间报 `ERR_MODULE_NOT_FOUND`，不是被跳过的断言 |
| `EGO_TASK_SPACE=9 EGO_KEEP_SPACE=1 pnpm run test:browser`                                    | 失败并中止；21 阶段通过、9 失败、3 受阻；后续阶段未执行                                                              |
| `pnpm run format:check`                                                                      | 通过；最终文档另作定向格式检查                                                                                       |

最终 [83 份真实 HTTP 响应](./http.json) 包含未知长度 chunked 请求的 413，旧素材读取和目录清理同步断言。真实服务器接收到的分块输入超过 5 MiB，没有依赖 Content-Length，没有将连接重置冒充错误响应。[定向浏览器报告](./browser/brand-experiment.json)、[runner](./browser/runner.json) 与 [真实图片截图](./browser/brand-image.png) 分别记录五格式解码、SVG 下载保留 HTML 文档与整体退出结果。下载的 SVG 与原始 CC0 样本逐字节相等。

默认全量 [runner](./browser/full-runner.json) 于 09:38:31 中止，记录 m2、交互反馈、上下文保持、token、OAuth、processing、storage-admin 和 library 失败；`library-selection-reconciliation` 因本次 SIGTERM 中止，三项 OAuth 后续受前置失败阻塞。后续 batch/viewer/albums/shares/settings 等未执行。图库场景达到既有 600 秒预算，报告 `CDP request timed out: Page.getFrameTree`；运行器 09:32:58 超时、09:32:59 保存现场，而旧场景 09:33:11 才写出诊断，`failurePage` 已是下一阶段页面。独立评审确认有晚到执行交叠证据，无法将后续检查视为可靠的独立完成，因此停止本任务全量进程并保留上述记录。未证实该失败由品牌实验引起，也未改动范围外图库场景或停止机制。[图库诊断](./browser/library-viewer.json) 和完整命令日志保留失败。随后复用 space 9 执行最终品牌定向检查完整通过，再正常结束该实验空间。

补充实际命令：`pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-runner.test.ts` 在运行器修复后 294/294 通过；`node docs/tasks/check.mjs` 为 120 个任务、298 个需求通过；`node docs/tasks/check.mjs --self-test` 五个拒绝场景通过；最终文档 `pnpm exec prettier --check` 通过；149 个本地 Markdown 链接目标存在，`git diff --check` 通过。

检查日志见 `checks/`。记录只去掉行尾空白及尾部空行，初始化验证码遮盖为 `[redacted]`。评审者的隔离变异测试误用缺少 packageManager 字段且软链主工作区依赖的临时副本，pnpm 自动安装触及本任务的 node_modules；源码、锁文件与其他工作区未变。恢复 `pnpm install --frozen-lockfile` 后，受影响的健康检查定向 `pnpm exec vitest run --project integration tests/integration/runtime/health.test.ts` 4/4 通过。保留原全量失败，不把定向补跑改写为全量一次通过。之后变异验证用 Node 24 直接启动隔离副本的 Vitest，未再触及依赖。没有产品 UI，所以 Figma 节点、响应式主题矩阵、设计独立评审和 UI 人工验收不适用。浏览器实验不关闭 DES/RG，不替代 #196 的人工验收。

## 审计与交付状态

独立 agent 按 `code-review-and-quality` 审阅需求覆盖、模块边界、原始错误、资源生命周期、默认调用链及测试有效性，审计发现并修复两项必修问题：

1. 原先只关连接，没有等待活动 handler；真实已收完请求体、挂起 beforeCommit 的替换会在关闭后提交。增加活动请求的取消和完成等待、写入/提交阶段取消检查，新增真实生命周期回归通过，评审者独立复现确认旧问题消失。
2. 新浏览器报告、截图和下载产物未加入共用运行器的启动清理清单，可能混入上次成功证据。三项已纳入现有清理，无新增证据机制。

变异验证反转“允许格式”条件后 PNG 接受测试失败，恢复条件后 1/1 通过；[变异失败](./checks/mutation-direct.log) 和 [恢复通过](./checks/restored-direct.log) 是独立临时副本证据。独立代码评审通过，复审没有未解决必修项；文档现有结论准确。最终品牌定向浏览器完整通过。默认全量失败与未执行项保持独立记录。

并发 main 已合入 #267/#268 的设计文档。已读取与本次交叠的 `gates.md` 及全部变化路径，并将实现提交重放到 `6a1585a4a86c9f91aef68004c94fa75f01defda7`；双方证据保留，没有应用或验证运行器输入变化，不重跑已通过的业务检查。

代码完成、本地全量检查、浏览器默认检查、独立评审与 PR 状态分别记录。交付保留草稿 PR；远端状态在创建后核对。未执行合并、关闭 Issue、发布、部署或删除工作区。
