# T-MED-08 文字与图片水印编码和处理设置

关联 [Issue #152](https://github.com/dnslin/ariso-next/issues/152)。范围与需求沿用[任务卡](../../tasks/m3-m4-platform.md#t-med-08-文字与图片水印编码和处理设置)、[SPEC-media §4/5/6.2](../../specs/SPEC-media.md)和[执行约定](../../tasks/execution.md)。

2026-09-30 已通过 gh 读取 Issue、全部评论及原生 blocked_by/blocking。无评论；唯一直接前置 #151 已 CLOSED，其代码及[交付记录](../media-151/README.md)已在基线。下游 #153、#188 仍 OPEN。原工作区有其他活跃任务，更新远端后从 `origin/main` 的 `117c66a` 创建独立 worktree `/Volumes/data/project/ariso-issue-152` 与分支 `codex/issue-152-watermark`，未修改用户预览数据。

## 最终结论

本地适用检查全部通过：630 项单元、879 项完整集成，无失败或跳过；冻结安装、迁移复查、格式、lint、类型、生产构建、运行包图片验证与 Ego Lite 浏览器全套通过。独立审计 Critical 0、未解决 Required 0。本任务无 UI，设计还原验收不适用。

## 实际交付

- `GET/PATCH /api/settings/media` 仅接受所有者 Cookie 会话；写入检查当前站点 Origin。PATCH 仅允许已定义字段，在同步事务内合并当前设置、校验整份结果及采用素材。关闭默认版本所需开关而未同时换成有效默认时，422 定位字段，全部修改回滚；拒绝上传 Token、匿名、错误 Origin 和未知字段。
- 迁移 `0014` 为设置增加文字、字体、字号、颜色、描边、透明度、位置、边距和图片宽度。保持另一模式已填参数，只有当前模式生效；全部渲染参数进入新快照，保存设置不改已有排队任务、上传快照或历史记录。
- 文字支持中文/拉丁固定字体、相对字号、颜色/描边、多行、透明度和九宫格；放不下返回 `MEDIA_WATERMARK_TOO_LARGE`，保留原图与先前成功版本。按 [ImageMagick 官方字面转义规则](https://usage.imagemagick.org/text/#escape)处理 `%`、前导 `@` 和反斜线，使用 execa 参数数组。
- 图片复用 #151 不可变 PNG/WebP/SVG 素材，按相对宽度和可用高度等比缩放，原始透明度乘以设置透明度。SVG 用已有 resvg 子进程按目标宽度栅格化，复用任务预算、取消和工作目录清理。
- 静态图按开关生成压缩/水印；压缩开启只读当前 jobId 的新压缩结果，关闭则按原图方向、色彩、最长边和 JPEG 背景处理画布。最终采用共同格式/质量编码并清除附加信息。动图和仅预览格式仍只生成缩略图。
- 真实输出测试发现质量 100 的 `WEBP (lossless)` 未被既有格式名称分支接受，补充 stream/file 两条路径的识别与回归。独立审计发现高瘦素材取整可能超出 1px，已改为宽高双约束并验证 300×199 画布上的 16×159 素材精确像素。
- 无新增依赖。现有 Release 验证脚本新增调用实际水印编码函数的两种字体输出检查；没有创建 Release、构建发布镜像或部署。

## 验证环境与结果

环境：macOS 26.6.2 arm64；Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-32、ExifTool 13.55。命令使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。SQLite、图片、素材及浏览器服务均使用独立临时数据。本地字体固定为 STHeiti Medium / Arial；Linux 镜像仍固定 Noto Sans CJK / Noto Sans。本机结果不代表 Linux 或双架构发布检查通过。

| 实际命令                                                                                                                                                                                                                                                           | 结果与证据                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                   | 通过，锁文件未变；[安装](./install.txt)                                                                                                                                                                                                                                       |
| `pnpm run db:generate`                                                                                                                                                                                                                                             | 生成 0014；SQL 已审查，仅增加设置列，保留原数据；迁移测试覆盖默认值和重复执行                                                                                                                                                                                                 |
| `pnpm exec vitest run --project media-tools tests/integration/media/watermark.test.ts --maxWorkers=1`                                                                                                                                                              | 29/29 通过；[结果](./watermark.txt)。四组合最初 2 成功/2 失败，见[实现前证据](./watermark-red.txt)                                                                                                                                                                            |
| `pnpm run test:integration --maxWorkers=2`                                                                                                                                                                                                                         | 最终96文件/879项通过，无失败或跳过；[完整集成](./integration.txt)。先完成最终build再运行                                                                                                                                                                                      |
| `pnpm run test:unit`                                                                                                                                                                                                                                               | 43 文件/630 项通过；[最终单元](./unit.txt)                                                                                                                                                                                                                                    |
| `pnpm run typecheck`                                                                                                                                                                                                                                               | 通过；[类型检查](./typecheck.txt)                                                                                                                                                                                                                                             |
| `pnpm run test:browser`                                                                                                                                                                                                                                            | 全套通过，Ego Lite 152、独立 TaskSpace 3；[主运行器](./browser-runner.json)、[UI 夹具运行器](./browser-ui-runner.json)。桌面1440与手机390的实际上传、图库/相册、回收/恢复、登录重启、交互与工作区状态保留均通过；本任务无新界面                                               |
| `pnpm run format:check`                                                                                                                                                                                                                                            | 全量通过；[格式检查](./format.txt)                                                                                                                                                                                                                                            |
| `pnpm run lint`                                                                                                                                                                                                                                                    | 通过；[最终静态检查](./lint.txt)                                                                                                                                                                                                                                              |
| `pnpm run build`                                                                                                                                                                                                                                                   | 最终构建通过；[构建](./build.txt)。保留已有跨平台 resvg 可选包追踪警告；当前平台运行包检查通过                                                                                                                                                                                |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`                                                                                                                                                                                               | 120 tasks / 298 requirements；5 个拒绝用例通过；[文档检查](./docs.txt)                                                                                                                                                                                                        |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`、`pnpm --dir tests/experiments/ui run typecheck`                                                                                                                                                       | 通过；[UI 夹具安装](./ui-install.txt)、[类型](./ui-typecheck.txt)                                                                                                                                                                                                             |
| `ARISO_VERIFY_CHINESE_FONT='/System/Library/Fonts/STHeiti Medium.ttc' ARISO_VERIFY_LATIN_FONT='/System/Library/Fonts/Supplemental/Arial.ttf' node scripts/verify-image.mjs --output-dir /Volumes/data/project/ariso-issue-152/docs/verification/media-152/outputs` | 在独立打包目录副本加最新脚本执行通过；[运行日志](./image.txt)、[完整报告](./outputs/report.json)、[格式报告](./outputs/formats/report.json)、[中文水印](./outputs/chinese-watermark.webp)、[拉丁水印](./outputs/latin-watermark.webp)。仅省略可重建的 canvas/overlay 中间文件 |
| lossless WebP 回归首次运行                                                                                                                                                                                                                                         | 新增测试真实失败，其余4例通过；[失败证据](./lossless-red.txt)，保留质量100断言后修复                                                                                                                                                                                          |

29 项实际流水线测试覆盖九宫格精确像素、素材原始 alpha 与设置透明度叠乘、宽高和边距、PNG/WebP/SVG 素材、JPEG/WebP/AVIF 实际编码、双色描边多行文字、字面文本逐像素对照、中文字形区别于缺字方框、方向、JPEG 背景、源附加信息清除、原图与素材字节不变、文字放不下保留成功版本、GIF 不适用，以及新压缩结果的解码再编码像素对照。完整单元 43 文件/630 项通过。首轮完整集成 96 文件/879 项中877项通过、2项失败、无跳过；[首轮结果](./integration-first.txt)。其中 M1 初始化完整默认值断言需补10字段，已修正；回收站测试在 beforeEach 的 acceptOriginal 插入时出现 SQLite database is locked，未修改其业务或测试逻辑。两文件聚焦复测4项全通过，见[复测](./regression-recheck.txt)。最终构建后重新执行完整集成，96文件/879项全部通过；浏览器全套也已通过。

首轮构建暴露新测试的 HeadersInit 类型与旧迁移夹具缺少新快照字段；均按实际新契约修复，未削弱断言，见[首轮构建](./build-first.txt)。字色/描边测试使用 1px 描边让填充与描边同时可观察，保留两色各超100像素的原断言；SVG 素材准入在 beforeEach、正式合成在测试体分别执行，未扩大默认超时。测试未跳过。

## 独立审计与设计结论

独立 agent 实际读取 `using-agent-skills` 与 `code-review-and-quality`，先读测试，再核对需求、API 事务/权限、当前任务压缩来源、工具取消与回收、素材引用、模块边界和测试有效性。首轮 Required 为图片宽度向上取整导致超出高度；修复及像素回归已复核。Release 验证脚本也已完成复审，最终代码审计通过：Critical 0、未解决 Required 0，无需额外抽象或依赖。审计者实际运行单元 2 文件/52 项及设置 HTTP、默认值、迁移 3 文件/24 项，通过；并独立运行真实水印/格式测试、读取最终 29 项水印全通过日志。

本 Issue 明确无 UI，没有修改页面、公共组件、布局或 Figma。设计还原评审、桌面/手机节点与本次界面人工验收不适用；浏览器结果只作为已有功能回归，不能代替后续 UI 设计验收。

## 承接与未执行范围

T-MED-12 承接设置表单、九宫格及输出界面并由用户人工验收；T-MED-09 承接临时预览和取消/到期；T-MED-10 承接重处理范围及候选版本原子发布。本任务没有用模拟页面关闭这些能力。当前处理流水线沿用已有本地存储边界，没有扩展对象存储执行。

本次未执行 AMD64/ARM64 镜像、Linux 容器、物理设备、Release、镜像发布或部署，按现有执行约定在实际 Release 阶段取得相应证据。未合并 PR、主动关闭 Issue 或删除分支/worktree。

## PR 交付

已提交并推送分支 `codex/issue-152-watermark`，创建正式待评审 [PR #216](https://github.com/dnslin/ariso-next/pull/216)，关联 #152。`gh pr view 216 --json url,state,isDraft,mergeable,headRefName,headRefOid,statusCheckRollup` 确认 OPEN、非草稿、MERGEABLE；`statusCheckRollup` 为空，`gh pr checks 216` 返回没有检查。本仓库本次未触发远端检查，不能记为 CI 通过，交付依据为上述本地适用检查与独立审计。

推送时系统钥匙串凭据助手没有返回；仅在当前命令改用已有 `gh auth git-credential` 和用户提供的本机代理后推送成功，未修改全局配置。保留分支与独立 worktree，未合并或关闭 Issue。
