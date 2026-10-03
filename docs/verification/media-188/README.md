# T-MED-09 / Issue #188 真实临时预览

日期：2026-10-03 至 2026-10-04。关联 [Issue #188](https://github.com/dnslin/ariso-next/issues/188)。分支 `codex/issue-188-media-previews`，基于 `origin/main` 的 `c601be4`；验证期间 main 仅合入 DG-TRASH 文档提交，分支已对齐最新 `4a3e964`；独立 worktree `/Users/dnslin/.codex/worktrees/issue-188-media-previews/ariso`，原工作区未修改。PR 待填写。

## 范围与前置

原生 blocked by #152（T-MED-08）、#64（T-MED-04）均为 closed，实际设置、水印、共享资源及持久调度在主分支已有实现。原生 blocking #189（T-MED-12）。Issue 无评论。覆盖 `R-11.6-01`、`R-11.6-02`、`R-11.2-02`，保留 MEDIA-PREVIEW 边界与现有编号；冻结 PRD 未修改。

- POST 上传临时测试图与完整未保存渲染参数，202 返回预览 ID；GET 状态/实际属性；GET result 返回私有字节；DELETE 等工作结算后取消与清理。接口字段只维护在 [SPEC-media](../../specs/SPEC-media.md#临时预览接口t-med-09)，不复制规则。
- 预览与正式流程共用 `prepareProcessingInput`、`startDerivedEncoding`。压缩水印基于本次新压缩结果；编码、方向、尺寸、背景、质量与去除附加信息保持正式规则。
- 独立 `media_previews` 临时任务无图片/存储引用，不写图库、相册、标签、统计或配置。文件只在 tmp 的 `preview-<id>` 所属目录。迁移 0020 只增加预览表与索引，没有修改旧资产表或引入新依赖。
- 调度与正式处理/元数据共用并发名额。完成后 30 分钟到期；格式不适用与开关关闭明确返回原因。接收、工具和写入均先结算，随后清理/释放素材引用。失败/到期/重启清自己的登记目录，清理失败可查并重试；已解决时 `cleanupStatus=deleted`，`cleanupError` 保留上次失败诊断。

本任务无 UI：未新增处理设置页、预览界面或公共组件，不制作模拟页面。设计还原与 UI 人工验收不适用，T-MED-12 / #189 接入真实界面后仍须实际读取 Figma、浏览器验证、独立设计评审和用户人工验收。现有浏览器回归只证明消费正式处理的已实现页面未回归，不能替代后续设计验收。

## 环境

[实际环境](./environment.txt)：macOS 26.6.2 / ARM64，Node 24.18.1、pnpm 11.19.0，使用已有 ImageMagick、ExifTool、ffmpeg 与 Ego Lite。所有命令使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`；未安装浏览器、未修改全局代理。浏览器运行补充 localhost/127.0.0.1/::1/.localhost 到既有 NO_PROXY/no_proxy。日志仅整理终端回车、行尾空格和多余尾部空行，保留原始结果与诊断。测试使用独立 SQLite、tmp 与复制的生产产物，不使用用户预览数据。

## 实际验证

| 命令                                                                                                         | 实际结果与证据                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                             | 通过，锁文件未修改；[安装](./install.txt)                                                                                                                            |
| `pnpm run db:generate`                                                                                       | 生成 0020，SQL 审查仅新表与索引；[生成](./migration.txt)                                                                                                             |
| `pnpm run test:unit`                                                                                         | 80 文件 / 1049 项通过；[单元](./unit.txt)                                                                                                                            |
| `pnpm run lint`                                                                                              | 通过；[静态检查](./lint.txt)；新增的最后两项集成测试另行定点检查                                                                                                     |
| `pnpm run typecheck`                                                                                         | 通过；[类型](./typecheck.txt)                                                                                                                                        |
| `pnpm run build`                                                                                             | 通过，包含三个真实预览路由；[构建](./build.txt)。保留既有 resvg 跨平台可选包及 @opentelemetry/api 追踪警告，未把警告隐藏或改依赖                                     |
| `pnpm run test:integration --maxWorkers=2`                                                                   | 首次全量 121 文件 / 1195 项通过，7 文件 / 25 项失败；本次引起的问题均已修复并定点复跑，见下表；[原始集成](./integration.txt)                                         |
| `pnpm run test:browser`                                                                                      | 失败于既有图片详情冷进入焦点；中断后的场景未执行。保留草稿，未改范围外 UI；[运行](./browser.txt)、[运行器](./browser-runner.json)、[诊断](./browser-focus/README.md) |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`、`pnpm --dir tests/experiments/ui run typecheck` | 通过；[安装](./ui-install.txt)、[类型](./ui-typecheck.txt)；该夹具 build 由 test:browser 执行                                                                        |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`                                         | 120 tasks / 298 requirements，5 个拒绝用例通过；[文档检查](./docs.txt)                                                                                               |
| `pnpm run format:check`                                                                                      | 首次检查发现生成的两份 Drizzle JSON 格式问题，已格式化并复跑通过；[最终格式](./format.txt)、[首次格式](./format-red.txt)                                             |

`preview.test.ts` 的 24 项核心测试使用真实工具与 SQLite：原图/缩略图、JPEG/WebP/AVIF 压缩、文字/图片水印在压缩开/关时逐字节比较正式结果，并比对实际尺寸、MIME 和字节大小。每次预览对全部非预览业务表做前后快照。生命周期覆盖 30 分钟到期、动画与关闭说明、WriteStream ENOSPC 故障注入、工具结算门控、在途 FileHandle.write 取消、素材引用、精确重启清理、诊断恢复及两种领取顺序共享并发。

`preview-route.test.ts` 42 项验证边界参数、multipart 文件/字段/信封限制、Content-Length、截断、超时/取消、磁盘需求及在途写入等待、所有者检查先于操作与错误返回 previewId。`preview-http.test.ts` 在独立生产进程中执行真实 setup/登录/Cookie，覆盖状态与字节、未保存参数、各管理路由权限/Origin、SVG 附件、无资产、取消、到期及失败 ID 可查。

## 独立代码审计

[独立审计记录](./audit.md)：审计者 `code_audit` 未参与业务实现，后来仅补必要运行夹具，主 agent 复核该夹具增量；使用 `using-agent-skills`、`code-review-and-quality`。已实际阅读规格、实现、测试、迁移、路由及验证日志；需求覆盖、模块边界、资源生命周期和测试有效性审计通过，无未解决代码阻断项。最终运行检查以本表实际结果为准。

| 审计问题                                          | 本次处理与验证                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 原图 SVG inline 响应可能在本站源执行脚本          | 沿用 delivery 的 SVG attachment 响应；保留原字节，HTTP 回归覆盖附件与未授权访问                         |
| 启动 await 恢复后、已关闭数据库的 stop 访问旧连接 | 启动/停止尊重已关闭连接；保留现有队列测试，时序等待真实领取/错误，shutdown 门控实际处理函数而非放宽断言 |
| 接收失败/清理抛错后 ID 不可得，所有者无法查诊断   | 普通/Zod/JSON/工具清理异常均附 previewId；状态、清理失败与原工具错误持续可查；新增两条退出失败回归      |
| 初始预览执行与持久/API职责在一文件过长            | 分为 preview-state、preview-process、previews runtime；共享编码保留正式行为，不增加通用工作流或兼容层   |

[修复前队列证据](./queue-red.txt) 保留 3 项失败：已关闭连接与新增启动异步时序的两项测试。后续聚焦的一次 running 等待失败来自缺失源文件过早终态；最终测试门控真实处理至停止，保持全部原断言。首次构建在检查已安装 content-disposition 类型时失败，已改用现有 delivery 相同的 `create` 命名导出；[首次构建](./build-red.txt)与[最终构建](./build.txt)保留事实。

## 未执行范围

没有发布 Release、发布镜像或部署。AMD64/ARM64 Linux 镜像、受限挂载与容器验证按 [执行约定](../../tasks/execution.md#适用检查) 在 Release 阶段取得证据，本次 macOS ARM64 结果不冒充这两架构验证。预览只用站点 tmp，不消费 S3 对象存储，R2/SeaweedFS 业务矩阵在本任务不适用。没有合并 PR、主动关闭 Issue、删除分支或 worktree。

## 首轮失败与受影响检查复跑

全量集成与浏览器日志保留失败事实，不把定点通过改写成“全量一次通过”。首次集成的 25 项失败包含 20 项运行夹具/产物、4 项首次领取时序，以及 1 项对象存储 multipart 正常场景。

| 实际命令                                                                                                                                                                                                                                                                                 | 结果与证据                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --project integration tests/integration/runtime/startup.test.ts tests/integration/runtime/secret-preflight.test.ts tests/integration/runtime/logging.test.ts tests/integration/runtime/standalone.test.ts tests/integration/runtime/health.test.ts --maxWorkers=2` | 补真实迁移并修复首处路径后 32 通过 / 1 失败；剩下的是产物仍含 result 路由源码；[复跑](./runtime-final.txt)                                              |
| `pnpm exec vitest run --project integration tests/integration/runtime/standalone.test.ts --maxWorkers=2`                                                                                                                                                                                 | 完整运行时路径修复后 9 项通过。三个预览路由及 instrumentation 的追踪无项目 src/tests/docs，生产产物也不存在这些目录；[最终产物](./standalone-final.txt) |
| `pnpm exec vitest run --project media-tools tests/integration/media/preview.test.ts tests/integration/media/preview-http.test.ts --maxWorkers=2`                                                                                                                                         | 24 项真实工具与 6 项生产 HTTP 均通过；[预览](./preview-final.txt)                                                                                       |
| `pnpm exec vitest run --project media-tools tests/integration/media/preview-http.test.ts`                                                                                                                                                                                                | 最终路径修复后 HTTP 6 项通过；[最终 HTTP](./http-final.txt)                                                                                             |
| `pnpm exec vitest run --project media-tools tests/integration/media/recovery-tools.test.ts -t 'runs actual tools with concurrency'`                                                                                                                                                      | 并发 1–4 全部通过，仅等待实际领取，原数量和产物断言保留；[复跑](./recovery-final.txt)                                                                   |
| `pnpm exec vitest run --project integration tests/integration/storage/late-put-multipart.test.ts -t '场景=normal'`                                                                                                                                                                       | 原始全量正常场景失败，单独复跑通过。未改该文件或存储调用路径，不能声称已修复其并发不稳定；[复跑](./multipart-rerun.txt)                                 |

运行夹具只补 0020 真实 SQL 与精确表/迁移期待。路径采用现有正式处理的绝对 tmp 根目录与分隔符写法，避免 Next 输出追踪把动态路径推成项目 glob；未加排除配置或放宽发布产物断言。保留 [夹具失败](./runtime-fixture-red.txt)、[中间检查](./runtime-fixture-intermediate.txt)、[产物中间失败](./standalone-trace-intermediate.txt)。最终路径修改后已重新执行 lint、typecheck 与 build。

浏览器失败位于 `e2e/library-detail-171-confirmation.mjs:31`，预期标题焦点，实际为 body。独立数据定点复现冷进入，等待 3 秒仍无标题 focus；正常点击进入会获得标题焦点。相关页面、组件、读取调用与断言相对 `origin/main` 零差异；详情首次无数据时 focus effect 已执行，数据到达后未再触发。该问题不依赖临时预览，保留范围外问题，未修改 UI 或断言。它阻断本轮完整浏览器完成，因此 PR 保持草稿；不是设计交付通过或全部验证通过。后续浏览器场景未运行，不用已通过部分代替它们。

## PR 状态

待创建并核对实际远端检查；仅在本地适用检查满足后转为正式评审。没有远端检查不记为 CI 通过。本次无 UI 交付；用户人工 UI 验收仍属于 #189，现有冷进入焦点问题需另获范围授权后处理。
