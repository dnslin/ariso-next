# EV-MEDIA-02 全格式与元数据样本验证

关联 [Issue #147](https://github.com/dnslin/ariso-next/issues/147)，依据 [任务定义](../../gates.md#ev-media-02-全格式与元数据双架构样本)、[SPEC-media §6/9–10/13](../../../specs/SPEC-media.md) 和[适用检查](../../execution.md#适用检查)。2026-09-28 读取 Issue 正文、评论（空）和原生依赖：直接前置 #62 已关闭，blocking 为 #150（T-MED-06）。从 `origin/main` 的 `5654692` 创建 `codex/147-media-samples`；原工作区未提交文档全部保留，未混入本 PR。

## 交付范围

24 份已提交的真实图像容器、可重建生成器、独立实验、回归测试和 Release 双架构执行入口。样本的来源、许可、固定摘要、原生标签和独立像素预期见 [manifest](../../../../tests/fixtures/media-formats/manifest.json) 与[样本说明](../../../../tests/fixtures/media-formats/README.md)。自产几何图案以 CC0 提供；完整 ICC 使用原样官方 sRGB2014，见[来源与许可](../../../../tests/fixtures/media-formats/ICC-LICENSE.md)。ExifTool 生成的复杂 JPEG、危险 SVG 与派生文件由实验导出，不依赖私人图片。

本任务没有产品 UI、路由、schema 或业务处理接口变更，不关闭 DES/RG。Figma 对照、界面设计验收和人工 UI 验收不适用。当前生产处理仍为 JPEG/PNG；本实验成功不表示全部格式已开放上传。T-MED-06 #150 必须把已验证的分类、首画面与 SVG 准入方案接入业务流水线，后续元数据和界面任务仍须验证持久化、错误展示和访问边界。

## 实际方案与边界

- 静态 JPEG/PNG/WebP/AVIF/BMP/TIFF、单主图 HEIC/AVIF（带辅助 alpha）、动态 GIF/WebP/APNG/AVIF、多页 TIFF、多图 ICO/HEIF/AVIF、静态 SVG 均有真实编码样本。每次运行核对原生标签、适用的完整图像计数、原摘要和实际 WebP 预览尺寸/像素。固定期望来自生成输入，不在验证时重写期望。静态 GIF 明确记录为仅预览的容器，不能凭单帧归入可压缩类别；业务版本适用性由 #150 接入。
- APNG 同时覆盖默认图就是首帧、默认图是独立蓝色海报而首展示帧为红色。ImageMagick 的 APNG delegate 依赖 FFmpeg，普通 PNG 读取会得到海报。采用直接 `ffmpeg -frames:v 1` 获取首个实际画面，再交给 ImageMagick 生成固定 WebP；不通过展开全序列再丢弃后续帧。动态 AVIF 同样按一个图像轨道的一帧读取，FFprobe 核对 AV1 图片轨道的真实帧数。
- 动态 AVIF 在当前 ExifTool 中报告 `FileType=MP4`，同时具有 `avis` 品牌及 `pict` 图像轨道。报告保留原值，不把 MP4 标签改写为 AVIF，也不据此把图片序列误判为视频或静态图。
- HEIF 编码块可为 64×64、可见裁剪为 64×48。实际预览按解码尺寸验证。alpha 不增加独立主图计数；两主图容器分别核对两张图。本轮实际辅助图样本为 alpha，depth/内嵌 thumbnail 未独立采样，不声称已实测；#150 按业务实现继续扩展。另将受控 `pitm` 主图 ID 改为第二项，HEIC/AVIF 均必须预览第二张纯绿主图。原生 HEIC 旋转和镜像验证四象限，防止二次方向校正。局部 GIF 首帧必须先选首帧再合成完整透明画布。
- 复杂 JPEG 采用规格中的 `-json -a -G1:3:4 -struct -api structformat=jsonq`。真实重复 EXIF APP1 中两个 IFD0 Artist、跨组同名 Artist、`1.10`、30 位序列号、结构化 XMP、GPS、方向与 ICC 原始字节分别断言。原文件全部字节保持不变。错误扩展名仍按实际 PNG/MIME 识别，截断图必须解码失败。
- SVG 先保留真实失败对照：MSVG 即使禁止外部 delegate 和 HTTP/HTTPS/FTP coder，仍会渲染本地图片引用；忽略脚本也不等于拒绝危险输入。候选方案用 `@xmldom/xmldom` 解析 XML、`css-tree` 解析 CSS，再调用 `@resvg/resvg-js`。三个库固定为实验 devDependencies，分别为 0.9.12、3.2.1、2.6.2；已有依赖没有相应 XML/CSS 解析器，原生 MSVG 的正常渐变也未正确渲染，因此新增依赖有实测依据。
- SVG 候选只在准入成功后实际调用渲染器，不改写原图。14 个危险样本覆盖网络/相对/绝对本地图片、外部实体、脚本、事件、动画、CSS import/转义 URL、xml:base 和 foreignObject；3 个合法样本覆盖纯色、内部 use 和内部渐变。分别记录真实渲染调用、像素与 HTTP 请求。单元测试另覆盖命名空间、转义和畸形语法。这是指定样本集的工程验证，不声称通用沙箱或业务接口已完成。

原有 JPEG/PNG 方向、透明 JPEG 背景、缩小不放大及资源故障行为继续由 [EV-MEDIA-01](../EV-MEDIA-01/README.md) 和现有真实工具集成测试覆盖。本轮不重复重构这些业务实现。

## 本地复现与证据

环境：macOS arm64，Node 24.18.1，pnpm 11.19.0，ImageMagick 7.1.2-32（libheif 1.23.5），ExifTool 13.55，FFmpeg 9.0.2。FFmpeg 为本轮根据 APNG 实测缺口安装的本机工具；镜像也补充对应 Debian 包。未安装浏览器或运行本机 Docker。

```sh
export PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH
pnpm install --frozen-lockfile
node tests/experiments/media-formats/run.mjs --output-dir test-results/media-formats-final
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run test:integration --maxWorkers=4
pnpm --dir tests/experiments/ui install --frozen-lockfile
pnpm run test:browser
node docs/tasks/check.mjs
node docs/tasks/check.mjs --self-test
git diff --check
```

运行器任何缺失样本、工具错误、受阻结果或断言失败均返回非零；独立场景继续收集证据。成功/失败报告都保存实际命令、工具版本、原生信息、期望与实际。命令保留真实临时路径，报告 artifact 字段映射为导出后的 `outputs/` 相对路径。运行器清理自己创建的临时工作区；业务数据不参与实验。

实际全格式报告：[local-arm64.json](./local-arm64.json)，对应导出文件在 [outputs](./outputs/)。共 24 个格式样本、29 项矩阵检查通过，报告包含原生 SVG 失败对照和通过的候选准入路径。原生失败被明确保留，不计为生产能力通过。

| 实际命令                                                                                     | 结果                                                                                           |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                             | 通过；新增实验库后再次冻结安装通过                                                             |
| `node tests/experiments/media-formats/run.mjs --output-dir test-results/media-formats-final` | 通过；29 项检查，24 个格式样本                                                                 |
| `pnpm run format:check`                                                                      | **失败**；3 份主分支历史 JSON 格式不合规，见下文                                               |
| `pnpm exec prettier --check --ignore-unknown <本次修改及新增文件>`                           | 通过；文件集由 `git diff --name-only -z` 与 `git ls-files --others --exclude-standard -z` 获取 |
| `pnpm run lint`                                                                              | 通过                                                                                           |
| `pnpm run typecheck`                                                                         | 通过                                                                                           |
| `pnpm run test:unit`                                                                         | 通过；33 文件 / 514 项，含本次 46 项验证器和 SVG 语法回归                                      |
| `pnpm run build`                                                                             | 通过；未提供部署密钥或业务数据库；保留已有 SQLite 可选 Debug 文件追踪提示                      |
| `pnpm run test:integration --maxWorkers=4`                                                   | 通过；62 文件 / 514 项，普通集成和真实工具两组均执行；在构建后运行                             |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                  | 通过；供现有浏览器回归夹具使用                                                                 |
| `pnpm run test:browser`                                                                      | **失败**；手机后台轮询断言超时，见下文                                                         |
| `node docs/tasks/check.mjs`                                                                  | 通过；120 任务 / 298 需求，无缺失 ID 或循环                                                    |
| `node docs/tasks/check.mjs --self-test`                                                      | 通过；5 个拒绝场景                                                                             |
| `git diff --check`                                                                           | 通过                                                                                           |

完整格式检查失败于既有 `docs/verification/m2-85/remove-explanations/preview-switch/{after,before,mobile}.json`。逐份使用 `git show origin/main:<path>` 确认与本地字节相同，并以当前 Prettier 配置检查主分支内容，三份均失败。这不是本次新增问题；按用户“范围外只报告”要求保留原文件，不削弱格式检查或增加忽略。浏览器完整回归也未通过，PR 保留草稿。

浏览器使用已有 Ego Lite / Chromium，TaskSpace 2；临时 DATA_DIR、密钥和端口，绕过本地代理。实际命令带 `EGO_KEEP_SPACE=1`。桌面完整流程、两端身份重启、图库、公共布局、上传轮询、手机 M2 与交互修正均通过。随后 `workspace-continuity-390` 在 `/library` 等待新的 `job.status=succeeded` 轮询 20 秒超时。[运行器报告](./browser-runner.json)、[失败场景](./browser-workspace-390.json)和[现场网络观测](./browser-failure-observation.json)保留原值：唯一读取发生于 `/upload`，真实资产已经 ready、任务已经 succeeded。失败的测试要求成功读取发生于 `/library`，没有控制读取在导航前完成的竞态。该测试及相关业务文件本次未改，未放宽断言、修改范围外代码或通过重跑掩盖失败。后续手机状态检查和最终独立 UI/library 套件未执行，不能计为通过。运行器已清理临时进程和数据，失败浏览器空间按 Ego 规则保留供诊断。

检查输出摘要见 [checks.json](./checks.json)。

## 格式修正与浏览器重试（2026-09-28）

所有者明确授权修正上述三份历史 JSON，并重试浏览器。使用 Node 24.18.1 / pnpm 11.19.0 执行 `pnpm install --frozen-lockfile`、对三份文件执行 `pnpm exec prettier --write`、`pnpm run format:check`，均通过。逐份解析并与修正前 HEAD 内容比较，JSON 值完全一致；独立审计确认只有数组排版及末尾换行变化。上文首次格式失败记录保留，当前格式问题已消除。

原样执行 `BROWSER_REPORT_DIR=test-results/browser-retry pnpm run test:browser`，保留既有 NO_PROXY/no_proxy 并补充 localhost、127.0.0.1、::1、.localhost。重试仍失败，见[重试运行器](./browser-retry-runner.json)与[手机初始化现场](./browser-retry-identity-390.json)。基础页面、错误恢复、桌面身份初始化和重启、M2、交互及跨页连续性通过；本次在手机初始化 `e2e/identity.mjs` 的 `HeroUI retains the group focus ring` 断言失败，比首次轮询超时更早。失败现场仍聚焦 password，输入框外层 box-shadow 为透明的 0px 阴影，未显示要求的 2px 焦点环。本次未到达手机后台轮询场景，不能说原超时已通过重试。后续手机及独立 UI/library 套件未执行。未更改测试断言、超时或业务代码；运行器已清理临时服务和数据，失败浏览器空间保留。

独立复核确认首次超时的代码链路：测试只阻断 XHR onload，saving 状态仍触发每 2 秒后台读取；手机打开菜单期间可在 `/upload` 得到 succeeded，控制器置 ready 后停止轮询。此后测试等待 `/library` 再次读取成功便会超时。这不证明任务丢失，也不证明完整浏览器套件已通过。当前仍保留草稿，待解决浏览器失败。

## 第二次原样浏览器重试（2026-09-28）

按所有者再次重试要求，在相同 Node 24.18.1 / pnpm 11.19.0、现有 Ego TaskSpace 2 执行 `EGO_TASK_SPACE=2 BROWSER_REPORT_DIR=test-results/browser-retry-2 pnpm run test:browser`。保留并补充本地 NO_PROXY/no_proxy；未修改业务、断言或超时时间，使用新的临时数据。命令退出码 1，见[运行器报告](./browser-retry-2-runner.json)与[图库报告](./browser-retry-2-library.json)。

基础页面、错误恢复、桌面身份初始化与重启、桌面 M2/交互/跨页连续性、手机身份初始化与重启通过。本次未重现焦点环失败，但手机图库点击“关闭图片详情”时被 `role="alert"` 层拦截指针，3 秒后超时。失败后读取页面，图片详情仍打开；不将提示层随后消失解释为该测试已通过。手机上传、轮询、M2/交互/跨页连续性及最终独立 UI/library 套件尚未执行，因此首次手机后台轮询超时仍未取得通过结果。运行器清理临时服务和数据，失败浏览器空间保留；PR 继续保持草稿。

## 所有者人工验收与合并决定（2026-09-28）

所有者在本分支独立开发环境中人工测试，未复现手机图库关闭详情被提示层拦截，随后明确批准合并 PR #203、关闭 Issue #147 并清理分支。按此批准执行合并；上述自动化失败与未执行项保留原始结论，不改记通过。此前“保持草稿”的状态记录由本次所有者决定替代。

## 独立审计

独立 agent 按 `code-review-and-quality` 实际阅读规格、实现、夹具、测试与 Release 入口，并独立运行 29 项完整矩阵和 46 项聚焦单元测试，均通过。初审要求修复两项：SVG 准入必须控制真实渲染执行，而非只记录预期布尔值；临时目录删除后 artifact 引用仍须可用。两项均已修复并复审，审计者实际核对 53 个导出引用存在。另补第二项主图 HEIF/AVIF 和覆盖完整性断言。代码审计通过，无未解决 Required；不将这一结论等同全仓适用检查全部通过。

没有产品 UI 变更，设计还原评审与用户人工 UI 验收不适用。本次浏览器检查仅证明既有流程回归，不替代任何后续格式管理界面的设计验收。

## 发布验证

提交分支为 `codex/147-media-samples`，关联 [草稿 PR #203](https://github.com/dnslin/ariso-next/pull/203)。2026-09-28 使用 `gh pr view 203 --json url,isDraft,state,statusCheckRollup,mergeable` 与 `gh pr checks 203` 核对：PR 为 OPEN / draft，检查列表为空，未触发远端检查。这不表示 CI 通过；上述两项本地失败仍保留，未转为正式待评审。

[images.yml](../../../../.github/workflows/images.yml) 在现有 `release.published` 流程中，分别使用 AMD64/ARM64 实际镜像执行同一完整矩阵，保留 `media-formats-{arch}` 报告与导出文件。原有媒体资源实验继续检查安装后的 ImageMagick policy；本矩阵也拒绝 width/height/list-length 固定准入策略。SVG 负面对照所用临时策略只禁用 delegate/网络 coder，不覆盖或取消生产资源限制。

本地通过不代表 Debian 工具版本、另一 CPU 架构或最终镜像通过。这些验证本轮未执行，按既有执行约定在 Release 时补齐；不为本 PR 创建 Release、发布镜像或部署。未合并 PR、未主动关闭 Issue、未删除分支或 worktree。

官方依据：[ImageMagick 格式与 APNG delegate](https://imagemagick.org/formats/)、[libavif 图像序列](https://github.com/AOMediaCodec/libavif/wiki/Sequences)、[ExifTool JSON 与分组参数](https://exiftool.org/exiftool_pod.html)、[xmldom](https://github.com/xmldom/xmldom)、[CSS Tree](https://github.com/csstree/csstree)、[resvg-js](https://github.com/thx/resvg-js)。具体能力以本轮实际版本、类型定义和运行证据为准。
