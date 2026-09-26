# T-UP-02 手动上传单图与结果界面

2026-09-26，关联 [Issue #81](https://github.com/dnslin/ariso-next/issues/81)。需求归属保持 R-7.4-01、R-7.4-02、R-7.4-03、R-7.5-01、R-7.5-03、R-7.5-04、A-26.2-06；仅交付 M2 单文件本地路径，不关闭完整 UPLOAD-QUEUE。

## 前置与实现

实际通过 `gh issue view 81 --json number,title,body,state,comments,url` 及 `gh api repos/dnslin/ariso-next/issues/81/dependencies/blocked_by`、`blocking` 核对：六项前置 #73、#77、#79、#57、#72、#80 均 CLOSED，#81 无评论，下游 #85 OPEN。消费现有接收/原子交接、详情/回收、外壳与 Uppy 实验证据，没有重新审计冻结产品选择。

原工作区 main 无未提交改动。独立 worktree 为 `/Users/dnslin/.codex/worktrees/81-manual-upload/ariso`，分支 `codex/81-manual-upload`，基于远端 main `2cf9d788570b0ad65a29eb2173fd3712b2cd5f68`。最初直连 GitHub 超时；按系统已有代理通过 `git -c http.proxy=http://127.0.0.1:7897 fetch origin` 更新，并用 GitHub API 确认提交一致。未修改全局 Git 配置。

- `/upload` 在服务端验证所有者，匿名登录后返回本页；`GET /upload/settings` 组合已有上传、媒体、存储配置，仅返回所需字段并禁止缓存。
- 普通选择单张 JPEG/PNG。Uppy Core / XHRUpload 沿用 UPLOAD-V03 的 5.2.0；使用手动开始、独立随机队列 ID、禁用自动重传与客户端进度超时。未添加其他上传库。
- 开始时固定可见性与明确选择的本地存储。空/超限/不支持格式有原因；默认缺失/停用不会自动换目标。
- 201 只表示提交，100% 转校验/保存，202 只表示交接；本次 job 的实际状态决定排队、处理中、成功或失败。
- 断连保留待核对；创建响应丢失只以同 requestId 和原 metadata 核对，不重传 content。取消由服务端交接事务裁决，409 保留真实 imageId。旧查询和迟到传输响应不能覆盖已确认结果。
- 交接与终态释放 Uppy/File/Blob URL；结果只保留轻量元数据。重开不恢复队列，已交接任务继续。清空结果不删除资产或中止服务器清理。
- 结果读取复用 library 的真实详情与 delivery 链接，复制 URL/Markdown/HTML、默认链接不可用、私有图说明及手动复制复用现有组件；详情返回原上传结果与焦点。失败图通过详情中的现有回收操作处理。

## 设计与复用

实际使用 Figma `get_design_context` 读取并查看截图：桌面/手机主节点 30:97 / 101:1014、保存 316:4802 / 316:4945、结果 317:4074 / 317:4225、处理失败 317:4052 / 317:4063。未修改 Figma。

复用 AdminShell、HeroUI Button/Card/Select/Alert/AlertDialog/ProgressBar，以及 LibraryDetail、DetailCopy、TrashAction。Lucide 提供图标，Tailwind 组合布局。文件图片为真实数据，不复制原型示例照片。桌面分栏、手机堆叠、固定底部操作与状态操作列遵循交接。

必要差异：按 M2 已实现服务只显示 JPEG/PNG 单图选择、本地存储及可见性；原型多文件、目录/粘贴、相册/标签与重新处理入口由后续任务交付，不显示假动作。详情/回收在现有详情浮层完成；返回标签和失效后的回跳由调用页面明确传入。设备范围沿用 [执行约定](../../tasks/execution.md#前端共用验收)，不把浏览器模拟当物理设备实测。

依赖依据：[Uppy core](https://uppy.io/docs/uppy/)、[XHRUpload](https://uppy.io/docs/xhr-upload/)、[HeroUI ProgressBar](https://heroui.com/en/docs/react/components/progress-bar)、[Select](https://heroui.com/en/docs/react/components/select)及安装版本的类型定义。未升级前置锁定的 Uppy 版本。

## 审计与验证

环境：macOS 26.6.2 / ARM64、Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-31、ExifTool 13.55。命令将 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin` 前置 PATH。

使用 `code-review-and-quality` 进行独立只读审计。发现并修正迟到 XHR 失败污染结果、旧状态查询抹去已确认 imageId、StrictMode 控制器提前销毁、浏览器取消场景的计时竞争；分别补交错响应测试、实例生命周期与真实响应持有测试。另外，无请求包装的开发模式验证发现默认原生 `fetch` 被作为控制器方法调用时丢失浏览器上下文；已绑定 `globalThis`，增加默认请求路径单测，并在正式浏览器脚本任何故障注入之前先完成真实原生请求上传。最终五轴复核（正确性、可读性、架构、安全、性能）无未解决 Critical / Required 问题。浏览器发现的 `/upload` 登录回跳遗漏、退出按钮点击区和错误告警语义也已修正；Markdown 测试按既有 `<URL>` 格式核对，仍验证真实 ID 与完整内容。

首次全量集成与本地重建重叠，部分 standalone 夹具读取失败；已终止该轮，在构建完成后顺序重跑。未跳过断言、修改超时或削弱测试。构建退出 0，但既有依赖追踪打印 better-sqlite3 可选 Debug 绑定、可选 OpenTelemetry 和 Next 开发 sourcemap 警告；实际生产运行由集成与浏览器验证，不以日志中出现构建路由替代验证。

实际命令与结果：

| 命令                                                                                                 | 结果                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                     | 通过，锁文件无需更新                                                                                         |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                          | 通过                                                                                                         |
| `pnpm --dir tests/experiments/ui run typecheck` / `run build`                                        | 通过                                                                                                         |
| `pnpm run format:check` / `pnpm run lint` / `pnpm run typecheck`                                     | 通过                                                                                                         |
| `pnpm run test:unit`                                                                                 | 30 文件、459 项通过                                                                                          |
| `pnpm run build` / `pnpm run build:shell`                                                            | 通过；上述可选依赖追踪警告仍存在                                                                             |
| `pnpm run test:integration`                                                                          | 首次顺序运行 62 文件、507 项通过；最终重复运行与浏览器并行时统计文件 5 项超时，其他 502 项通过               |
| `pnpm exec vitest run --project integration tests/integration/analytics/count.test.ts`               | 超时文件单独复核：13 项通过                                                                                  |
| `pnpm run test:integration --maxWorkers=4`                                                           | 62 文件、507 项通过，退出 0                                                                                  |
| `EGO_TASK_SPACE=1 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-81 pnpm run test:browser` | 完整运行退出 0；2026-09-26T08:14:04.379Z 至 2026-09-26T08:17:32.979Z；运行时、身份、图库、上传及隔离 UI 通过 |
| `node docs/tasks/check.mjs` / `--self-test`                                                          | 120 任务、298 需求通过；5 项拒绝夹具通过                                                                     |
| `git diff --check`                                                                                   | 通过                                                                                                         |

最后保留初次提交错误的底层原因后，重新运行单元、构建、类型、lint 与格式检查，均通过。使用临时初始化夹具执行 `node test-results/upload-focused/run.mjs`，直接运行同一 `e2e/upload.mjs`，14 组行为与 130 布局再次通过；本目录 `upload.json` 和截图保存这次最终专项结果。完整运行记录仍单独保留。

没有 schema 变化，未运行 `db:generate`。统计文件超时没有通过修改业务、增加超时或删除断言处理；按既有验证记录限制并行数量后重新执行完整集成。

开发模式额外实测：Node 24 启动 `next dev`，在同一 Ego task space 使用临时初始化数据库，未包装原生 fetch；真实选择后依次到达 queued / ready。201、202 和实际状态查询均返回成功，验证 React StrictMode 重复挂载不破坏控制器。[结果记录](./browser/dev-strictmode.json)。

### 浏览器证据

[完整运行](./browser/runner.json)、[上传行为与布局](./browser/upload.json)、[隔离 UI 运行](./browser/ui-runner.json)。上传共 14 组行为与 130 组布局；既有图库/详情/回收 27 组行为、220 组布局也随完整运行通过。

- 真实文件选择、手动提交、真实 worker 处理成功；无自动上传。移除、交接、成功、失败和取消后通过 `HeapProfiler.collectGarbage` 与 `WeakRef` 核对 File 释放，Blob URL 集合和 input files 均清空。
- 真实格式检查失败无 imageId；持久化派生版本失败保留 imageId 与原图。失败项进入实际详情回收后，数据库回收标记正确，原图记录及磁盘字节仍存在。
- 丢失真实提交响应只核对原 requestId；保持真实 XHR 完成和查询响应，验证 100% 仍为保存中。服务器已交接后取消实际返回 409，最终保留同一私有图 ID。
- 离开/重开清空本地队列；释放调度夹具后真实 worker 继续处理同一已接收图。清结果不删除图库记录。
- 真实 URL 复制和链接请求通过；剪贴板拒绝时完整 Markdown/HTML 保留真实 ID，手动文本获取焦点并全选。详情返回保留当前结果；取消浮层 Escape 返回触发按钮。
- 真实修改默认存储及停用配置验证开始时解析和禁用状态。读取响应丢失呈现错误并可重试。
- 13 状态分别以浅/深色、360/390/430/768/1440 宽度检查无横向溢出、可见按钮/链接至少 44px。减少动态效果和短视口操作栏已检查。设备模拟不算物理软键盘和安全区证据。

截图：[桌面选择](./browser/upload-empty-light-1440.png)、[手机待提交](./browser/upload-queued-light-390.png)、[手机保存中](./browser/upload-saving-dark-390.png)、[桌面结果](./browser/upload-ready-light-1440.png)、[手机处理失败](./browser/upload-processing-failed-dark-390.png)、[设置错误](./browser/upload-settings-error-light-390.png)、[短视口](./browser/upload-short-viewport.png)。

## 远端边界

`.github/workflows/ci.yml` 只有 workflow_call，`images.yml` 只有 release.published；无 PR/push/workflow_dispatch 验证入口。本次遵循 [执行约定](../../tasks/execution.md#适用检查)执行本地适用检查，不创建 Release、发布镜像或部署。AMD64/ARM64 容器与真实手机触控/软键盘/非零安全区未执行，保留各自责任，不标通过。
