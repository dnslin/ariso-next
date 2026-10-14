# Favicon 优化与水印零宽描边修复

本次 PR 仅交付两个已获用户批准的媒体处理变更，无产品页面布局改动。

## 最终行为

- Favicon 上传 PNG、ICO、静态 SVG 后生成 48×48 PNG，等比缩放、透明居中，不裁剪、拉伸或减少颜色；保留解释颜色所需的 ICC 配置、Gamma 和 sRGB 标记，去除其他元数据并采用无损压缩。ICO 选择合适帧，SVG 直接渲染到目标透明画布。生成、元数据清理或数据库提交失败保留原图标，Logo 仍保存原文件。
- 文字水印描边宽度为0时显式关闭描边，大于0时继续采用指定颜色和宽度。字号、透明度、质量和其他设置不变。
- 既有 Favicon 不迁移，重新上传时生成优化文件；既有图片重新处理后应用水印修复。

不包含统计布局、侧栏描述、本地原型、额外默认值调整或依赖变更。

## 真实输出证据

| 样例             | 输入字节数 | 最终PNG字节数 | 尺寸  |
| ---------------- | ---------: | ------------: | ----- |
| 复杂照片 Favicon |    625,365 |         4,850 | 48×48 |
| 简单标识 Favicon |        373 |           484 | 48×48 |

见 [Favicon 记录](outputs/favicon-report.json)、[照片输出](outputs/favicon-complex-photo.png)与[标识输出](outputs/favicon-simple-symbol.png)。简单SVG源本来很小，转换PNG后略大；目标是实际加载的小尺寸图标，不要求任何输入都必须缩小字节数。

水印的 [修复前输出](outputs/text-current.webp)与[产品修复后输出](outputs/text-fixed.webp)采用同一张640×480照片、3%字号、50%透明度、WebP质量82，仅关闭零宽描边。[实际记录](outputs/fixed-report.json)确认产品输出与用户批准候选的像素差为0。

![同参数真实输出对比](outputs/zero-stroke-comparison.png)

## 本地验证

环境：macOS ARM64、Node24.18.1、pnpm11.19.0、ImageMagick7.1.2-33、ExifTool。构建仅有已有的可选resvg跨平台模块追踪诊断，退出码0；本机真实SVG渲染测试通过。

| 实际命令                                                                                                                                                                                                                                  | 结果                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                          | 通过                                              |
| `pnpm run build`                                                                                                                                                                                                                          | 通过                                              |
| `pnpm run typecheck`                                                                                                                                                                                                                      | 通过                                              |
| `pnpm run lint`、`pnpm run format:check`                                                                                                                                                                                                  | Favicon阶段全局检查通过，水印最终改动定向检查通过 |
| `pnpm exec vitest run --project media-tools tests/integration/site/branding.test.ts tests/integration/site/branding-http.test.ts tests/integration/media/svg.test.ts tests/integration/media/watermark.test.ts`                           | Favicon阶段94/94通过                              |
| `pnpm exec vitest run --project media-tools tests/integration/media/watermark.test.ts -t 'renders zero-width'`（修复前）                                                                                                                  | 新增中文、拉丁字体用例均按预期失败                |
| `pnpm exec vitest run --project media-tools tests/integration/media/watermark.test.ts`（修复后）                                                                                                                                          | 32/32通过                                         |
| `pnpm exec vitest run --project media-tools tests/integration/media/preview.test.ts tests/integration/media/reprocess.test.ts`                                                                                                            | 55/55通过                                         |
| `pnpm exec vitest run --project unit tests/unit/media/processing.test.ts tests/unit/media/watermark.test.ts tests/unit/site/branding-controls.test.ts tests/unit/site/branding-editor.test.ts tests/unit/site/branding-resources.test.ts` | 21/21通过                                         |
| `pnpm exec vitest run --project unit tests/unit/media/svg-policy.test.ts`                                                                                                                                                                 | 52/52通过                                         |
| `git diff --check`                                                                                                                                                                                                                        | 通过                                              |

回归覆盖真实PNG尺寸/透明边距/元数据、ICO选帧、小SVG像素锐度、生成与提交失败保留旧文件，以及零宽描边像素、非零描边、文字转义和图片水印。零宽描边修复保留了参考图片的逐像素与尺寸断言。评审中将ICO选帧条件临时从 `>=48` 改为 `>48`，原生48帧用例按预期失败，恢复后通过。

本机无Docker，未执行Linux生产镜像媒体测试；由PR的Media tools作业验证，结果以实际CI为准。不同像素密度下标签栏的人工视觉验收尚未完成。无Figma同步、数据库迁移、发布或部署。

## PR #284 两项 P2 修复

针对 `82f66d45` 的独立评审复现了两个问题。本轮先补回归再修复：

- Display P3 PNG 的 ICC 被直接删除，颜色归一到 sRGB 后由 `(138,59,199)` 错变成 `(128,64,192)`。Favicon 生成后改用现有 ExifTool 的 `-all= --ICC_Profile:all -overwrite_original` 清理其他元数据并保留 ICC，不重新编码像素。测试比较完整的颜色归一像素、无关标签清理和几 KB 的输出大小；ICC 夹具只有 480 字节，来源与 CC0 许可在夹具 README 中记录。
- 横向和纵向 1:100 静态 SVG 的短边在栅格化时取整为零，被误报为损坏。现在用 Resvg 规范化的 SVG 在 48×48 透明画布内等比渲染，保留原来的 viewBox；使用规范化 XML 中的精确尺寸，避免尺寸 getter 对小数取整。测试覆盖整数、小数细长 SVG 的可见颜色、透明居中、数据库引用与文件生命周期，以及 1:1000000 的固定目标画布。

新增 Display P3、两个整数细长 SVG 用例在修复前全部失败；两个小数尺寸用例也先复现空白输出再通过修复。元数据清理失败通过实际工具错误注入验证，旧引用与字节保留，候选文件清理。

两个 Agent 复审 `892545c6` 时进一步复现：无 ICC、Gamma=1 的线性 PNG 清理后失去 Gamma，归一到 sRGB 的正确像素约 `(188,137,225)` 变成 `(128,64,192)`。新增真实上传回归先失败后通过。清理时保留 ICC 组，并在同一次 ExifTool 操作中用 `-tagsfromfile @ -PNG:Gamma -PNG:SRGBRendering` 拷回生成文件自身的两个颜色标签；单标签不能靠组删除的排除选项保留。标准 sRGB 原色的冗余 cHRM 被编码器省略，不据此推断颜色变化。

Linux CI 在该回归的输入有效性断言处失败（尚未执行上传前后颜色比较）：编码器选项不能保证在两平台都写出 Gamma 块。最终夹具显式转换为线性 RGB，再由 ExifTool 明确写入 Gamma=1 并删除 sRGB 标记，同时检查输入标签，并比较完整的原始/归一像素来确认样例需要颜色转换。保留了上传前后完整像素相等断言。该调整只涉及测试构造，不改变产品实现；本地品牌文件测试再次48/48通过。

本轮实际验证（同一 macOS ARM64 环境）：

| 实际命令                                                                                                                                                                                                                | 结果                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                        | 通过                                                  |
| `pnpm run build`、`pnpm run typecheck`、`pnpm run lint`                                                                                                                                                                 | 通过；构建的跨平台可选原生模块追踪诊断仍存在，退出码0 |
| `pnpm exec vitest run --project media-tools tests/integration/site/branding.test.ts -t 'Display P3\|细长 SVG'`（修复前）                                                                                                | 3项新增用例按预期失败                                 |
| `pnpm exec vitest run --project media-tools tests/integration/site/branding.test.ts -t '细长 SVG'`（精确尺寸修复前/后）                                                                                                 | 两个小数用例先失败，修复后4/4通过                     |
| `pnpm exec vitest run --project media-tools tests/integration/site/branding.test.ts tests/integration/site/branding-http.test.ts tests/integration/media/svg.test.ts tests/integration/media/watermark.test.ts`（最终） | 104/104通过                                           |
| `pnpm exec vitest run --project unit tests/unit/media/svg-policy.test.ts tests/unit/media/processing.test.ts tests/unit/media/watermark.test.ts tests/unit/site/branding-resources.test.ts`                             | 56/56通过                                             |
| `node docs/tasks/check.mjs`                                                                                                                                                                                             | 120任务、298需求通过                                  |

最终提交的格式检查、Linux CI 和两个 Agent 复审结果以 PR 描述中的最新核验为准。无浏览器人工视觉验收、发布或部署。
