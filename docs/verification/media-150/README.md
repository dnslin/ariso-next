# T-MED-06 全格式分类与派生处理

关联 [Issue #150](https://github.com/dnslin/ariso-next/issues/150)，依据 [任务定义](../../tasks/m3-m4-platform.md#t-med-06-全格式分类与派生处理)、[SPEC-media §6/10/13](../../specs/SPEC-media.md) 和[执行约定](../../tasks/execution.md)。

2026-09-29 使用 `gh issue view 150 --json number,title,body,state,comments,url` 及 GitHub 原生 `dependencies/blocked_by`、`dependencies/blocking` 核对：评论为空，#63、#64、#147 均 CLOSED。下游 #151、#161、#170、#172 保持 OPEN。从已 fetch 的 `origin/main`（`279a84f`）创建独立 worktree 与 `codex/media-formats-150`，保留原目录未提交文档。

## 实施结果与边界

- 上传初验使用 ExifTool 的真实签名，拒绝 PDF、视频、文档和未知字节；不按上传名称/MIME 判断。后台任务执行完整分类，先持久化分类和版本计划，再生成派生图。损坏或危险 SVG 的原图已经持久保存，处理失败保留原图及诊断。
- 静态 JPEG/PNG/WebP/AVIF/BMP/单页 TIFF/单主图 HEIC 可按快照输出 JPEG、WebP、AVIF；JPEG 按快照背景合成透明区域。GIF（包括静态）、SVG、ICO、多主图容器仅预览；APNG、动态 WebP/AVIF/GIF 按动画处理。固定 WebP 缩略图最长边 640、质量 80，不放大，方向校正后清除附加信息。
- APNG（含独立海报）与动态 AVIF 使用 FFmpeg 只输出第一个展示画面；GIF 先选首帧再合成画布；其他容器按 ImageMagick/libheif 主图顺序读 `[0]`。可靠页数通过容器元数据及 ping 获取，不把 `[0]` 读取误认为单图。辅助 alpha/depth/thumbnail 不增加独立主图页数。
- SVG 复用前置实验的 XML/CSS 解析规则和 resvg。策略与 renderer 作为独立 Node 子进程运行，沿用超时、取消和重启清理；不执行脚本或读取图片指定的网络/本地资源。内部引用、渐变、可信系统字体保留。现有三个实验依赖提升为生产依赖，无新库选型。
- 版本接口分别提供 saved、not_applicable、disabled、not_generated、failed；已存版本优先，不因当前开关关闭而隐藏。JPEG/AVIF 候选恢复核对真实编码，完整候选原对象认领，错编码对象清理后重建。
- 最终运行包包含 SVG runner、当前架构 native 依赖、格式夹具和真实持久流水线验证入口。没有把 src 或 tests 目录带入最终包；Release 沿用现有 AMD64/ARM64 流程，不创建 Release、不发布或部署。

本任务无产品 UI 变更。Figma、桌面/手机节点和设计还原验收不适用。现有上传页面仍为 JPEG/PNG 输入，完整格式选择由 **T-UP-07** 承接；版本状态展示由 **T-LIB-06/T-LIB-07** 接入，特殊格式公开访问由 **T-DEL-02** 联验。水印、完整元数据重读和重处理分别由原任务承接，不把本次接口交付描述为这些能力完成。后续 UI 仍需用户人工验收。

## 真实样本与输出

[样本清单](../../../tests/fixtures/media-formats/manifest.json) 保留来源、许可、固定 SHA256 与独立像素期望。复用前置 24 个样本，新增 HEIC depth 和 thumbnail 两个真实辅助图样本；生成方式及原生 `heif-info` 验证见[夹具说明](../../../tests/fixtures/media-formats/README.md)。

[格式持久化报告](./formats-local-arm64.json) 的 26 项全部通过；[运行包完整验证报告](./image-local-arm64.json) 同时记录真实编码、字体和工具版本。[实际输出](./outputs/) 保留预览、编码样本和字体渲染。像素期望来自夹具生成输入，不由本次输出反推。

修改前运行新持久化矩阵，24 项中 22 项失败，仅 JPEG/PNG 通过，失败是旧的格式准入限制或 SVG 尺寸识别；实现后全矩阵通过。原先“JPEG 输出不支持”的测试更新为真实 JPEG 背景/编码断言，水印不支持断言保留。上传断线测试改为拦截新的签名初验函数，未调整行为断言或超时。

## 实际验证

环境：macOS arm64，Node 24.18.1，pnpm 11.19.0，ImageMagick 7.1.2-32，ExifTool 13.55，FFmpeg 9.0.2；Ego Lite 使用现有 Chromium 与本任务 TaskSpace 3。所有数据为临时独立数据；没有访问用户预览数据库。保持原 NO_PROXY/no_proxy，补充 localhost、127.0.0.1、::1、.localhost。

| 命令                                                                                                   | 实际结果                                                                                    |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                       | 通过，依赖提升后再次冻结安装通过                                                            |
| `pnpm run format:check`                                                                                | 通过                                                                                        |
| `pnpm run lint`                                                                                        | 通过                                                                                        |
| `pnpm run typecheck`                                                                                   | 通过                                                                                        |
| `pnpm run test:unit`                                                                                   | 34 文件 / 525 项通过                                                                        |
| `pnpm run build`                                                                                       | 通过，无部署密钥/业务数据库；运行包源码目录检查通过                                         |
| `pnpm run test:integration --maxWorkers=4`                                                             | 首轮 78 文件 / 648 项：646 通过、2 失败；两项已定向复验通过（2 文件 / 14 项），原始失败保留 |
| `pnpm run test:integration --maxWorkers=2`                                                             | 最终完整运行通过：78 文件 / 650 项，272.57 秒                                               |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                            | 通过                                                                                        |
| `EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-150 pnpm run test:browser`  | 运行中                                                                                      |
| `node scripts/verify-image.mjs --output-dir ../../../test-results/image-150`（cwd `.next/standalone`） | 通过；26 格式、6 编码和中英文字体验证                                                       |
| `node tests/experiments/media-formats/run.mjs --output-dir test-results/media-formats-150-probe`       | 31 项通过，26 个格式样本                                                                    |
| `node docs/tasks/check.mjs`                                                                            | 120 任务 / 298 需求通过                                                                     |
| `node docs/tasks/check.mjs --self-test`                                                                | 5 个拒绝场景通过                                                                            |
| `git diff --check`                                                                                     | 通过                                                                                        |

运行包字体验证在本机显式设置 `ARISO_VERIFY_CHINESE_FONT='/System/Library/Fonts/STHeiti Medium.ttc'` 与 `ARISO_VERIFY_LATIN_FONT='/System/Library/Fonts/Supplemental/Arial.ttf'`；Linux 发布流程仍使用原 Noto 字体路径。macOS 本地结果不冒充 Linux 容器或另一 CPU 架构通过。

定向检查还运行了 `pnpm exec vitest run --project media-tools` 下的 formats、file-formats、format-recovery、svg 和 upload/formats 测试；分别覆盖分类/像素、真实恢复、SVG 危险输入和完整上传交接。最后追加真实 H.264 MP4 和文本伪装拒绝样本，file-formats 定向检查 32/32 通过。早期 local-http 定向检查在构建前失败，原因是运行包尚不存在；最终集成检查在构建后运行，不把早期失败记作通过。

打包追踪保留 resvg 非当前平台 optional binary 分支与 SQLite Debug 文件提示。实际当前平台 native 文件已包含，运行包矩阵通过；未过滤或隐藏这些诊断。

## 独立审计

独立 agent 使用 `code-review-and-quality` 实际读取需求、调用路径、格式分类、SVG、进程生命周期、发布恢复、测试与镜像入口。初审无 Required 实现缺陷；要求关注的新编码恢复与上传闭环已补真实测试。上传阶段分类测试的错误预期已修正为 null，最终分类断言保留。最终复审通过：无 Required/Critical 缺陷。审计者实际比对运行包 SVG runner 与源码、确认无 src/tests 目录，并读取 26 项全通过报告；`git diff --cached --check` 通过。检查结果与代码结论分别记录，不用审计通过替代运行验证。

## PR 与发布范围

适用本地检查与独立代码审计均已通过，PR 待创建。GitHub 检查实际状态待创建 PR 后回读；空列表不视为 CI 通过。AMD64/ARM64 真实镜像与受限挂载仅在 Release 阶段验证，本次未执行。

官方方案依据：[ImageMagick 格式](https://imagemagick.org/formats/)、[FFmpeg 按输出限制帧数](https://ffmpeg.org/ffmpeg.html)、[前置完整实验](../../tasks/evidence/EV-MEDIA-02/README.md)。

## 首轮全量集成失败定位

`pnpm run test:integration --maxWorkers=4` 首轮退出 1，646/648 通过。`analytics/count.test.ts` 的排除所有者/私有/thumbnail/HEAD/304 场景超过默认 5 秒；该文件本次未改，原断言与超时保留。`runtime/build.test.ts` 从 `git ls-files --cached --others` 复制输入时仍列出已删除但尚未暂存的旧实验 SVG policy，导致 ENOENT；暂存迁移后重跑，无需保留旧文件或修改测试。定向复验退出 0，2 文件 / 14 项通过，耗时 169.39 秒。命令为 `pnpm exec vitest run --project integration tests/integration/analytics/count.test.ts tests/integration/runtime/build.test.ts --maxWorkers=1`。同机存在其他工作区的集成测试，未停止或修改其进程；不据此直接断言超时原因。最后按最终暂存内容以 `--maxWorkers=2` 再跑完整集成，78 文件 / 650 项全部通过；没有修改断言或超时。

## 完整浏览器回归

完整运行退出 0，见 [browser-runner.json](./browser-runner.json)。现有 Ego Lite TaskSpace 3 同时覆盖 1440/390 初始化与重启、真实上传/复制/下载/匿名访问/回收恢复、处理失败、访问计数和队列恢复；手机图库、上传、后台轮询及两端交互修正、跨页连续性均通过，随后独立 UI/library 套件也通过。公共布局回归含 360/390/430/768/1440、浅深色、短视口、键盘与焦点。临时数据和服务已由运行器清理，成功后结束本任务浏览器空间。

本次没有改动 UI，不用这些回归截图冒充新界面设计验收；后续调用方的 Figma 和人工验收仍须单独完成。完整本地产物在 worktree 的 `test-results/browser-150/`，此处只归档运行器结论，避免复制无界面变更的数百张历史页面截图。
