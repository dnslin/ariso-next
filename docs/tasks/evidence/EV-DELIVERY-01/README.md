# EV-DELIVERY-01 Next 本地流与条件请求验证

日期：2026-09-22。关联 [Issue #68](https://github.com/dnslin/ariso-next/issues/68)；依据 [任务定义](../../gates.md#ev-delivery-01-next-本地流与条件请求验证)与 [delivery §4/6–10](../../../specs/SPEC-delivery.md)。保留原需求编号：DL-07/09–14/15–17 对应的本地传输接入实验，不代表这些业务验收已全部关闭。

## 前置与修改边界

`gh issue view 68 --json number,title,body,state,url,comments` 确认无评论。原生 `issues/68/dependencies/blocked_by` 为已关闭的 #48、#52，`blocking` 为 #69、#82。已核对 [EV-STORAGE-LOCAL](../EV-STORAGE-LOCAL/README.md) 的真实文件系统/双架构证据及 [EV-IDENTITY-01](../EV-IDENTITY-01/README.md) 的真实认证 HTTP/会话撤销证据。

从 `origin/main` 的 `a30ae21` 建立 `codex/issue-68-delivery-validation`，独立目录 `/Volumes/data/project/ariso-issue-68`。原目录已有其他任务的未提交修改，完整保留。

实现仅在 `tests/experiments/delivery/` 与所属测试；无生产路由、数据库迁移或 delivery 模块。复用现有 `storage.readObject` 和认证实验的真实 Better Auth/SQLite；测试状态、可控等待点和观测端点只属于监听 loopback 的实验应用，不能直接复制成产品 API。媒体状态与版本记录是实验输入，尚无真实 media/analytics 消费者，后续由 T-DEL-01 与 EV-ANALYTICS-01 接入。

无产品 UI 或 Figma 修改，响应式、主题、键盘/触控、软键盘和安全区域不适用于本协议实验，不关闭 DES/RG。

## 实验结论与下游约束

| 验证范围                    | 接入结论与断言                                                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request → 文件流 → Response | 真实 `next build --webpack` / `next start`，复用生产本地存储打开普通文件。Web 流 `highWaterMark: 0`，只在消费者拉取并成功 `enqueue` 首块后触发一次开始回调。打开文件、构造 Response 都不计数；单测还断言最终句柄 `EBADF`。    |
| 条件与 HEAD                 | 先会话、权限、文件打开/实际大小、最终权限/版本复核，再判断条件。HEAD、304 无正文，412 不计数。If-Match 强比较优先于 If-None-Match 弱比较，支持列表和 `*`。不发送 Last-Modified，因此日期条件忽略。                            |
| Range                       | 普通、有效范围及超出文件的范围均完整 200，`Accept-Ranges: none`，实际字节和 Content-Length 一致。                                                                                                                             |
| 权限变化                    | 文件打开后的等待点可切换私有、非 ready、回收、停用；条件命中仍不能绕过拒绝。真实所有者 Cookie 在等待期间从 SQLite 撤销后重新判断资格及计数。有效所有者可继续读取私有版本。                                                    |
| 版本变化                    | 对象或实际版本切换最多重选一次，两次冲突返回 409/IMAGE_CHANGED；每个旧流均关闭。                                                                                                                                              |
| 故障与取消                  | 首次读取注入 EIO 导致真实 Next HTTP 失败且无计数；首块后注入 EIO 使连接中断并保留一次计数。真实客户端在响应前及首个网络块后断连，文件流 close 数与打开数一致。磁盘错误是注入，不宣称制造了真实介质故障。                      |
| 缓存与文件名                | GET/HEAD/304/412/权限及存储错误为 private, no-store, no-transform 与 nosniff。中文、点段、同后缀、JPG/JPEG、控制字符、空名、长 Unicode 名有矩阵测试。SVG 强制附件。HTTP 头矩阵的 MIME 是受控输入，不代替 media 格式识别验收。 |
| 计数边界                    | 匿名公开 ready 原图/压缩图/水印图才产生事件；thumbnail、所有者、拒绝响应不计。事件保留实际版本与 UTC 时点。附件与展示是同一指标；首块后取消不撤回。计数消费者抛错保留错误且不截断文件。                                       |

开始事件是应用交付时点，不能证明客户端收到字节或完整下载。已开始流允许结束，状态变化约束下一次请求。不为每个字节持续查权限。

本实验不验证 S3、完整版本解析与链接生成、图片 ID 路由/参数错误、真实统计落库或反向代理环境。这些属于后续任务，不作为本地协议通过的隐含结论。

## 依赖和实现依据

- [Next Route Handler](https://nextjs.org/docs/app/api-reference/file-conventions/route)：公开 Request/Response 流与显式 GET/HEAD；同时核对当前安装的 Next 16.3.5 `pipe-readable` 与 Node 24 类型，确认真实网络断连由框架传递取消。不导入 Next 内部函数。
- [HTTP 条件优先级](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.2.2)：授权和正常资源检查先于前提条件。
- [content-disposition](https://github.com/jshttp/content-disposition)：现有依赖只有 Next 内部 compiled 副本，不能作为公开 API。新增开发依赖 3.0.0，使用公开 `create` 和自带类型。ASCII 回退与 UTF-8 编码交给成熟库，仅产品名称清洗在实验内实现。

## 本地环境与实际命令

macOS arm64，Node 24.18.1、pnpm 11.19.0、Next 16.3.5，依赖由锁文件固定。Ego Lite 使用已有 Chrome 152，没有安装 Playwright/Chromium。命令中的 PATH 仅作用于本任务，不改变全局配置。

```sh
export PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run build:shell
pnpm run test:integration --reporter=default --reporter=junit --outputFile=test-results/integration.xml
pnpm exec vitest run --project integration tests/integration/delivery --reporter=default --reporter=junit --outputFile=test-results/delivery.xml
EGO_TASK_SPACE=5 node tests/experiments/delivery/run-browser.ts
git diff --check
```

验证过程：首次接入时 headers 文件尚未完成，Next 构建/HTTP 测试失败；依赖文件完成后原断言通过。lint 曾因匿名默认导出配置警告失败，改为命名配置后通过。生产构建仍保留既有 better-sqlite3 Debug 二进制追踪诊断；不隐藏日志，以退出码和实际 Release SQLite 回归为准。

本地格式、lint、类型检查、267 项单元测试、生产构建及 shell 验证应用构建通过。全套集成首次通过 213 项；随后新增 3 组场景，最终 delivery 定向复跑 12 项通过，见 [JUnit](./local-delivery.xml)。真实浏览器完成中文 PNG/SVG 附件下载，下载名及落盘字节一致，HEAD/304 无正文，见 [浏览器报告](./browser.json)。环境见 [environment.json](./environment.json)。

新增 HTTP 矩阵初次发现测试夹具使用非 IP 字符串导致认证库仍按同一个来源限流；改为合法的独立实验 IP，保留真实限流。另一项测试误要求库必须给 ASCII filename 加引号，现使用公开解析器断言相同文件名；不要求 HTTP 可选的引号形式。修正后原业务断言通过。

## 审计

使用 `code-review-and-quality` 独立审计需求覆盖、权限/版本复核、首块计数、释放责任及测试有效性。发现并修复两项必改：测试 hook 期限短于构建上限，可能遗留 detached 服务；现让构建/启动接收取消信号，测试期限覆盖内部上限。首块单测原先未保证真实预读完成，可能漏检高水位误设；现先等待文件 readable，再构造 Response 验证零计数。文件名矩阵明确只验证格式元数据，缺文件错误码也与规格对齐。独立复审无剩余必改：临时副本将高水位 0 改为 1 后，消费前计数从 0 变成 1，确认新断言能捕获回归；正常完成的句柄均为 EBADF。预取消的启动调用保留原始取消原因并且无临时目录残留。构建中/启动中取消路径仅静态核对，不宣称已执行故障实验。

## 远端验证

PR 将触发 CI 与 Docker build。images 工作流在原生 AMD64/ARM64 runner 上运行同一生产模式 Next HTTP 实验，保存 delivery JUnit 和服务日志；同时保留现有 Docker 构建、镜像内容、图片转换、存储挂载与生命周期检查。只运行验证事件，发布仍限定 release，不发布镜像或部署。远端运行结果将在完成后补充，当前未标通过。
