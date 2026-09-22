# T-MED-03 本地首图处理与持久任务

对应 [Issue #63](https://github.com/dnslin/ariso-next/issues/63) 和 [PR #105](https://github.com/dnslin/ariso-next/pull/105)。范围及需求编号沿用 [T-MED-03](../../tasks/m1-m2.md#t-med-03-本地首图处理与持久任务)，业务规则见 [media §5–7](../../specs/SPEC-media.md)。记录日期：2026-09-22。

当前状态：前置双架构验收、业务实现、独立代码审计和最终本地检查已完成。完整集成 34 文件、251 项通过，真实图片工具与 Ego 浏览器回归通过。业务提交的远端 CI/双架构验证仍待完成，PR 保持草稿；不能用前置提交的绿灯代表本次业务通过。

## 前置、授权与分支

已读取 Issue 正文、评论及原生 blocked by / blocking：直接前置 #51、#62，后置 #64。#51 已交付。#62 虽经所有者授权合并关闭，历史双架构实验仍被镜像 width/height=32KP 阻塞。所有者在本任务明确同意将镜像修复纳入范围；前置通过后才开始业务实施。

工作区干净，无其他活动任务占用。分支 `codex/issue-63-media-processing` 从 `origin/main` 的 `9f24d4250efd8ce8465a8a8f99d905a6e9e5fa96` 创建。未修改冻结 PRD、Figma、既有需求编号或 #62 实验断言。

前置提交 [`72078d0`](https://github.com/dnslin/ariso-next/commit/72078d0982d434817b0722bdd0a5aef844446bca) 仅删除镜像 ImageMagick 的 width/height/list-length resource 条目，保留其他资源、路径及编码器策略。[CI](https://github.com/dnslin/ariso-next/actions/runs/35701518691) 和 [Docker 双架构验证](https://github.com/dnslin/ariso-next/actions/runs/35701518860) 均成功；release-checks/publish 均跳过，没有发布镜像。

| 前置实测                                     | AMD64 | ARM64 |
| -------------------------------------------- | ----- | ----- |
| 安装策略无固定 width/height/list-length 准入 | 通过  | 通过  |
| 32769×1 PNG 实际缩为 640×1 WebP              | 通过  | 通过  |
| JPEG/PNG 方向、透明度、元数据清理、原图字节  | 通过  | 通过  |
| 真实子进程退出、取消、停止后强杀与回收       | 通过  | 通过  |
| 并发 1–4 按需缓存、真实低空间耗尽与清理      | 通过  | 通过  |
| 既有存储、静态图片、字体及容器生命周期检查   | 通过  | 通过  |

原始媒体报告：[AMD64](./prerequisite-amd64.json)、[ARM64](./prerequisite-arm64.json)。两端均为 Linux、UID 1000、Node 24.21.0、ImageMagick 7.1.1-43 Q16、ExifTool 13.25。完整样本及其他工作流证据在该运行的 artifacts 中。首个手动运行 [35701430895](https://github.com/dnslin/ariso-next/actions/runs/35701430895) 的 ARM64 成功，AMD64 在既有 setup-dev 验证遇到 `@swc/helpers` 环境错误；保留该失败，没有削弱测试，后续 PR 事件运行通过。

## 本次交付与覆盖

- `formats.ts` 经 ExifTool stdin 读取真实容器类型、原生尺寸、APNG 标记和 MPF 图像数量，不信扩展名、传入 MIME 或同名 EXIF 尺寸。当前仅处理静态 JPEG/PNG，单帧 APNG 和 MPO 也明确拒绝。
- `process.ts` 复用 storage 读写流与 execa，执行方向校正、sRGB、按快照等比缩小、清理源附加信息和 WebP 编码。默认压缩质量 82；缩略图固定最长边 640、质量 80、不放大。透明 WebP 保留 alpha，原图不改写。
- 每步 I/O 前登记最终及 partial 对象；工具成功结束后才登记 stored 并发布可访问版本。实际编码与尺寸从派生字节读取。每次发布和最终 ready 都复核任务、永久删除状态及存储启用；失败保留原图和已发布版本，未完成候选保留清理责任及可诊断错误。
- `queue.ts` 在 SQLite immediate 短事务领取 queued 任务，禁止同图 running 任务交错，事务外执行处理。默认串行、空闲 250ms 轮询，停止可取消并等待当前任务；数据库关闭后停止。Web 启动全局单例复用同一消费者，导入、prestart 和 Next 构建不启动消费。
- 迁移 `0005_sharp_paper_doll.sql` 只增加任务 started_at/finished_at 可空时间列。启动从已有绝对 DATA_DIR 解析存储和临时目录，避免 Next 将运行时目录追踪为项目文件。

| Issue 验收或边界                           | 实际验证                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 原图不变；类型来自实际字节                 | JPEG/PNG 输入伪装名称与 MIME，原图全字节对照；实际派生 WebP 及字节数                                        |
| 缩略 WebP 640/80、比例正确且不放大         | 64×48 小图、1200×800 旋转/镜像样本、32769×1 超宽样本；实际尺寸和解码像素                                    |
| 方向、附加信息与透明度                     | JPEG 方向 6/2、PNG 方向 6；EXIF/XMP/IPTC/ICC 清理；透明像素 alpha 保留                                      |
| 全部目标保存才 ready；部分失败保留完成版本 | 缩略发布故障保留 original/compressed；失败候选 cleanup_pending；截断原图及写入失败不发布半成品              |
| 快照与同步事务边界                         | 排队后改设置仍使用原质量和最长边；处理期间另一真实 SQLite 连接可写入                                        |
| 停用、删除与取消阻止迟到发布               | 写入中修改状态；压缩发布后停用不开始缩略；取消保留原图及错误                                                |
| 可信容器识别                               | JPEG/PNG 原生 16×12 不被 EXIF 999×777 覆盖；合法单帧 APNG 拒绝；两图 MPO 从 stdin 识别并准确提取第二张 JPEG |
| 条件领取与启动单例                         | 两连接不重复领取、排队跨连接持久化、同图不交错、ready 保持；模块重载复用消费者；stop 等待结算且不领下一任务 |

工具样本为仓库既有 JPEG/PNG 及测试自行生成的纯色图、有效 APNG/MPF 容器，无外部图片授权依赖。这些只验证当前首图范围，不构成 EV-MEDIA-02 全格式样本库。

## 本地环境、命令与结果

macOS arm64、Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-31 Q16-HDRI、ExifTool 13.55。Docker 仅在 GitHub Actions 运行。命令使用：

```sh
export PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH
```

| 实际执行命令或检查                                                                                                                      | 结果                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                        | 通过                                                                          |
| `pnpm run db:generate`                                                                                                                  | 生成两个时间列迁移，已检查 SQL                                                |
| `pnpm run format:check`                                                                                                                 | 最终通过                                                                      |
| `pnpm run lint`                                                                                                                         | 最终通过                                                                      |
| `pnpm run typecheck`                                                                                                                    | 最终通过                                                                      |
| `pnpm run test:unit`                                                                                                                    | 279 项通过                                                                    |
| `pnpm run build`                                                                                                                        | 修复文件追踪后通过，standalone 与 nft 清单不含项目 src/tests                  |
| `pnpm exec vitest run --project integration tests/integration/media/queue.test.ts tests/integration/runtime/server-start.test.ts`       | 2 文件、16 项通过：队列 9 项、启动 7 项                                       |
| 真实 `process.test.ts` 与 `formats-tools.test.ts`                                                                                       | 22 项通过：处理 18 项、格式 4 项；现统一归入 media-tools project              |
| `pnpm exec vitest run --project integration tests/integration/identity/auth.test.ts`                                                    | 首次整套中的超时单独复测，17 项通过                                           |
| `pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/media-63/integration-final.xml` | 最终 34 文件、251 项通过，83.30 秒；[原始 XML](./local-integration-final.xml) |
| `EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/media-63/browser-final pnpm run test:browser`                                         | [运行器](./browser-runner.json) passed；主页及 1440/390 初始化、重启通过      |
| `git diff --check`                                                                                                                      | 通过                                                                          |

首次完整集成为 246 项通过、5 项失败，[原始 XML](./local-integration-first.xml) 保留全部结果。其中 4 项因新增 media 调用使 Next standalone 错误追踪项目 `src/tests`；启动路径由 `join` 改为 `resolve`，利用已有 DATA_DIR 绝对路径契约消除误追踪，没有排除应打包依赖或削弱产物断言。另 1 项为身份测试 5 秒超时，单独复测通过。最终完整复测以 `--maxWorkers=4` 控制本地并行资源竞争，未修改超时、断言或跳过测试。

Ego 使用既有 Ego Lite、Chrome 152、TaskSpace 7，完成后已结束该空间，没有下载 Playwright/Chromium。[主页/运行基线](./browser-browser.json)、[桌面初始化](./browser-identity-1440-setup.json)、[桌面重启](./browser-identity-1440-restart.json)、[手机初始化](./browser-identity-390-setup.json)、[手机重启](./browser-identity-390-restart.json) 保留原始检查。当前不新增页面，浏览器结果验证 Web 启动与既有界面回归，不冒充上传或媒体设置/详情 UI 验收。

## 验证入口与远端待完成项

普通 `integration` project 不要求本机图片工具；`media-tools` project 包含两个实际工具测试，缺工具时失败、不跳过。`pnpm run test:integration` 同时运行两组。通用 CI 执行普通 integration；Docker 工作流在两个实际生产镜像内执行 media-tools，使用临时目录、关闭网络并导出 `media-process-amd64/arm64` XML。测试依赖从工作区挂载，不进入生产镜像。

业务提交 `fa20fd4` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/35704396275) 已通过。[首轮双架构运行](https://github.com/dnslin/ariso-next/actions/runs/35704396667) 在新增工具组各有 21 项通过、1 项失败：旧版 ImageMagick 生成的测试底图在 IDAT 后附带文本，ExifTool 对单帧 APNG 样本发出警告。18 项处理测试全部通过；该失败阻止后续容器步骤，不能标整套通过。

已在测试底图生成时增加 `-strip`，保留动画控制块、帧数、尺寸、警告和 MPF 提取等全部断言。该改动不修改业务逻辑；独立审计通过。`pnpm exec vitest run --project media-tools --reporter=default --reporter=junit --outputFile=test-results/media-63/media-tools-fixture-fix.xml` 本地复测 22 项通过。首轮 [AMD64](./remote-first-amd64.xml)、[ARM64](./remote-first-arm64.xml) XML 保留失败。修复后的双架构及完整容器结果待补充，通过前保持草稿。

## 审计及边界

已使用 `code-review-and-quality` 独立审查需求覆盖、模块边界、对象责任、发布复核、流和子进程生命周期、错误诊断及测试真实性，当前没有必须修复的代码审计项。审计不替代尚未完成的远端业务验证。

本次不实现上传入口、完整元数据、其他格式、非 WebP 压缩、水印、设置/详情界面、ready 图重处理发布、重启恢复、自动重试、动态并发 1–4、持续空间监测或失败对象自动清理。这些沿用后续任务边界；当前不支持的任务参数明确失败，不静默改格式。候选 cleanup_pending 保留可恢复责任，不等于文件已清除。

未合并 PR、未主动关闭 Issue、未发布镜像或部署，未删除分支或 worktree。
