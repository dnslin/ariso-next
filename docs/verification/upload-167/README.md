# T-UP-05 / Issue #167 实施与验证

日期：2026-10-06。Issue：[#167](https://github.com/dnslin/ariso-next/issues/167)。分支：`codex/issue-167-public-upload`。从最新 `origin/main` 的 `a0384c78a05f8457c22fb9e442dc169f25fa8a1d` 创建独立 worktree，保留原项目目录及其他任务。

依据：[SPEC-upload §10](../../specs/SPEC-upload.md#10-通用上传-api)、[T-UP-05](../../tasks/m3-m4-platform.md#t-up-05-同步单文件公共上传-api)、[执行约定](../../tasks/execution.md)、[设计交接](../../design/handoff.md)。沿用任务卡的 R/A 编号及 UP-17–21，不改冻结 PRD。

## 交付范围

实现唯一 `POST /api/upload`。Bearer Token 在读 body 前验证，Cookie 不替代。流式 multipart 只接受一个 file，字段可在文件前后出现；重复 albumId/tag 按集合模块处理，单值重复、未知字段、第二文件、截断、超限明确失败并清理。

未解析目标时，先持久登记受控 tmp 接收行。完整参数通过后在短事务中固定真实存储、可见性、集合与媒体快照；本地和 S3 均由单请求经 Ariso 接收和发布。只保存非秘密 Token ID，不保存 Token 明文。沿用现有 Busboy、Zod、storage、media 与 collections，无新增依赖。

只等本次持久化 job。ready 返回 201；处理失败返回 422 或对应依赖/资源状态，含真实 imageId、步骤和原因，保留原图与已有版本；交接前失败明确 imageId:null。900 秒等待超时返回 504，不取消媒体任务。回收/删除/本次任务不可用返回 409 并保留原 ID。默认缺版本、private、后续重处理和元数据 warning 分别表示真实情况。再次 POST 可以生成新图，没有公开轮询接口。

公共 Zod 输入/结果/错误 schema 可由后续 T-UP-06 消费。本次不实现 OpenAPI、用法页、Token 管理 UI、统计模块、发布或部署。原生 blocked-by #162、#166、#66、#71、#72 均已关闭；blocking #168、#199 仍开放。前置实验和已关闭 Issue 的状态不代替本次实际行为测试。

本任务没有 UI。桌面/手机、Figma、浏览器、设计评审和人工 UI 验收不适用。用户无需提供界面审批，也没有人工预览服务需要保留。

## 验证环境与入口

macOS arm64；Node `24.18.1`，pnpm `11.19.0`，Next `16.3.5`，Busboy `1.6.0`，Better Auth API-key `1.7.5`。使用冻结安装及本机已有真实 ImageMagick/ExifTool。所有 HTTP 夹具使用独立临时目录、数据库、所有者、Token 和进程，不操作用户预览数据。

`pnpm run test:integration` 实际调用 `vitest run --project integration --project media-tools`。新增 api/public-receive 测试只归 media-tools，其余 receipt/multipart/result 归普通 integration；两组均在默认命令执行。新增 CLI/HTTP 单元测试归默认 unit。先完成生产 build，再运行集成；审计修改后更新生产包，最终集成期间不再重建或修改产品代码。

实际命令与最终结果记录在 [checks.json](./checks.json)。首轮中间状态和最终复验分别保留，未将定向通过记成默认全量通过。

| 检查                                                        | 实际结果                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                            | 退出 0，无依赖/锁文件变化                                                                                          |
| `pnpm run db:generate`                                      | 生成 0024 SQL 和快照；已审查，旧库字段/引用/外键和迁移重跑有回归                                                   |
| `pnpm run build`                                            | 最终退出 0；沿用既有可选 `@opentelemetry/api` 追踪警告，未加入依赖掩盖诊断                                         |
| `pnpm run test:unit`                                        | 首轮 114 文件、1572 项通过；新增/修改输入另跑 HTTP 13 项及真实请求预算 1 项通过                                    |
| `pnpm run test:integration --maxWorkers=2`                  | 165 文件、1585 项：1577 通过，8 项旧场景超时；这 8 项串行复验全部通过。原全量结果保持失败                          |
| `pnpm run lint`、`pnpm run typecheck`                       | 全仓退出 0；新增 HTTP 504 测试另通过 ESLint 与项目继承的专用类型检查                                               |
| `pnpm run format:check`、文档检查、自检、`git diff --check` | 全仓格式退出 0；文档检查 120 tasks / 298 requirements、自检 5 rejection cases 均退出 0；最终证据另作格式和差异核对 |

首轮默认全量执行了 164 文件、1581 项：1565 通过、16 失败。失败包括旧 schema 夹具用新列写旧表、purge 写入竞争、旧包错误码、工具/独立构建超时，以及生产包重建期间找不到入口。这轮失败没有跳过或记为通过。已修本次原因并保留原断言/超时，产品包稳定后重新执行默认全量。早期 schema 开发定向检查发生在最终 build 前，仅作开发反馈，不充当最终集成证据。

## 实际行为覆盖

- 鉴权：无 body 即返回 401；Cookie、无效、过期、停用、撤销 Token 均不能代替有效 Bearer。有效请求超过 10 次，不受插件默认限额。Token 不能访问管理接口、Web 上传或私有图片。
- 接收：未知 Content-Length、UTF-8 文件名、文件前后字段、重复数组与集合匹配/创建、256 KiB 字段边界、单值重复、第二文件、截断、空文件、大小边界与无资产清理。非法参数不创建标签，准备通过后初验失败保留已创建标签。
- 结果：响应与数据库/原图字节/本次 job/版本一致；失败保留原图和前序版本；默认中途缺版本仍 201；关闭压缩只报告真实版本；撤销 Token 不追溯取消已交接任务；重复 POST 新 ID。
- 生命周期：本次 job 与后来重处理区分、终态在 deadline 优先、504 不改状态、回收/删除 409、断连后仍处理、接收记录恢复/过期/清理、存储引用/在途写入、旧库向前迁移。
- HTTP：真实 curl 返回完成 201；真实代理两段 socket 断连后，客户端收不到结果，数据库里的同一 job 仍成功。等待时钟场景采用测试进程受控时钟，保留生产 900000ms 常量，不用缩短产品期限；它不代表真的等待了 15 分钟。
- 资源：真实源 fd 在复制前目标失败时关闭，断言 EBADF 和零资产；真实第二数据库连接复现并覆盖清理事务竞争。详细审计见 [code-review.md](./code-review.md)。

## 对象服务联验

最终命令：`node tests/integration/upload/api-live.ts --config /Volumes/data/project/ariso/.data/upload-v02.json --output test-results/upload-167-live-final`。配置仅从本机读取，不复制凭据；不修改全局代理、Bucket 策略或 CORS。

按执行约定，必需矩阵为 R2 与 SeaweedFS。两服务各 6 项通过：所有者创建/启用专用存储并 probe 清理、无 body 的 401、重复单值 400/明确错误码/零远端对象、private ready/同 job/三个真实版本/原图字节、thumbnail 发布失败保留 original+compressed、专用命名空间清空。每服务 6 个登记对象最终 HEAD absent。独立进程与数据库已关停清除。

报告：[R2](./live/r2.json)、[SeaweedFS](./live/seaweedfs.json)。归档前实际扫描 access key、secret key 和夹具密码，未发现泄漏。AWS 未实测，按当前约定不要求，不计为通过。

## 状态与限制

代码实施、独立代码复审、适用本地检查与真实 HTTP/对象服务验证已完成。最终默认全量仍如实记为 8 项超时失败；同一产品输入的这 8 项单 worker 复验均通过，没有未解决的断言失败。复验中另外 36 项未选择的场景已经由默认全量执行，不计为本次复验通过。没有将定向结果改写成全量一次通过。原生 main 在提交前重新 fetch，仍为相同基线。没有远端检查时不称 CI 通过。尚未合并或关闭 Issue，没有发布、部署或清理分支/worktree。

生产入口已协调 Node 完整请求预算；反向代理和调用方配置见 [部署说明](../../guides/deployment.md#公共同步上传的请求预算)。没有验证用户实际生产代理、连续 30 分钟上传或 15 分钟墙钟等待。受控时钟、短期限真实 Node 请求和代理断连仅证明各自覆盖的行为。双架构容器验证按 Release 流程执行，本轮未运行，也未为日常 PR 创建 Release。

最终默认全量的新增及受影响 suite 已从 Vitest 实际结果核对，详见 checks.json 的 defaultNewAndAffectedSuites。独立评审者也只读复核其真实执行结果，没有重复测试。串行复验覆盖 6 个文件的全部 8 个失败项，退出 0，耗时 186.21 秒；独立无密钥构建原有 240 秒期限内实际 107.19 秒完成。
