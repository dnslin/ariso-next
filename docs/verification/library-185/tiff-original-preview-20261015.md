# 2026-10-15：TIFF 原图在线预览

本轮接续[文案与大图导航交付](./preview-navigation-20261015.md)。所有者要求不超过50 MB的TIFF可在线预览，超过时提示下载，并确认限制只针对TIFF原图，已有压缩图和缩略图继续查看。按现有文件大小显示约定使用50 MiB（52,428,800 bytes），等于限制允许预览。

## 实现与设计依据

- 浏览器不能直接显示TIFF时，所有者专用 `GET /api/images/{id}/preview` 读取原文件，复用现有 ImageMagick、媒体队列和资源预算，生成首页面原尺寸PNG临时呈现。没有新增依赖、数据库字段、保存版本或修改原文件。原文件下载仍返回TIFF附件。
- 临时呈现按原图对象ID复用，30分钟到期后重新生成。同一图片的并发请求共用任务，单个HTTP请求取消等待不取消其他请求共用的转换。生成失败保留可诊断错误和显式重试。
- 大于限制的原图在读取原文件前返回HTTP413，详情及大图显示“TIFF 原图超过 50 MiB，请下载后查看。”，不显示无意义的重试按钮。压缩图和缩略图没有新增大小限制。回收站不增加临时转换。
- 界面沿用现有详情版本页签、HeroUI按钮及YARL图片舞台，未新增布局或视觉组件。既有设计节点桌面36:312、手机102:3228，本次用户明确要求作为TIFF状态调整依据；不改Figma。公共外壳没有本轮变化，相关文案和导航验证见上一轮记录。
- 方案研究对照 [Nextcloud 预览配置](https://docs.nextcloud.com/server/latest/admin_manual/configuration_server/config_sample_php_parameters.html)，采用已有服务端图片工具生成临时呈现的做法；同时核对已有依赖和ImageMagick能力，没有另加浏览器TIFF解码器。

## 已执行检查

环境：macOS arm64、Node24.18.1、pnpm11.19.0、本机ImageMagick与ExifTool。使用隔离数据库和临时资产，没有操作生产数据。

| 实际命令                                                                                                                                                    | 结果                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                            | 通过，锁文件不变                                                                                                                               |
| `pnpm run lint`                                                                                                                                             | 通过；后端清理修复后重新执行完整检查，通过                                                                                                     |
| `git diff --cached --name-only -z \| xargs -0 pnpm exec prettier --check --ignore-unknown`                                                                  | 通过                                                                                                                                           |
| `git diff --cached --check`                                                                                                                                 | 通过                                                                                                                                           |
| `node docs/tasks/check.mjs`                                                                                                                                 | 120任务、298需求检查通过                                                                                                                       |
| `pnpm run build`                                                                                                                                            | 通过；既有其他平台可选原生依赖追踪警告保留                                                                                                     |
| `pnpm run typecheck`                                                                                                                                        | 通过                                                                                                                                           |
| `pnpm run test:unit`                                                                                                                                        | 190文件、2359项通过                                                                                                                            |
| `pnpm exec vitest run --project unit tests/unit/library/detail-preview.test.ts tests/unit/library/viewer-model.test.ts`                                     | 28项通过，覆盖临界大小、超限原图、已有缩略图及显式选版                                                                                         |
| `pnpm exec vitest run --project integration tests/integration/library/detail.test.ts`                                                                       | 11项通过，包含50MiB、超过1字节和回收状态的预览/下载契约                                                                                        |
| `EGO_TASK_SPACE=40 BROWSER_REPORT_DIR=test-results/tiff-original-preview-20261015-final node scripts/verify-browser.mjs --suite viewer --only tiff-preview` | 通过；[运行器](./browser/tiff-original-preview-20261015/runner.json)、[业务报告](./browser/tiff-original-preview-20261015/library-viewer.json) |

## 缓存到期竞态修复与复核

独立审查发现旧缓存清理与固定ID重建可能并行，较慢的旧清理可能删除新任务刚写入的文件。先通过暂停维护清理并同时发起新请求确定性复现，旧实现目录删除2次而不是1次；随后在实际 `cleanupPreview` 边界按同一运行时和预览ID共享清理Promise。新接收等待清理结束后才写源文件，无新增数据库字段或全局锁。

[失败复现](./checks/tiff-original-preview-20261015/cleanup-red.txt)、[修复后52项预览/队列回归](./checks/tiff-original-preview-20261015/cleanup-green.txt)及[实际命令索引](./checks/tiff-original-preview-20261015/cleanup-summary.json)保留。独立只读复审确认该P2已解决，未发现新的P2或更高问题。

最终重新构建并执行 `pnpm exec vitest run --project media-tools --project unit --project integration tests/integration/media/preview.test.ts tests/integration/media/preview-http.test.ts tests/integration/media/queue.test.ts tests/integration/library/detail.test.ts tests/unit/media/preview-route.test.ts tests/unit/media/tiff-preview-route.test.ts`，6文件116项通过；见[最终相关检查](./checks/tiff-original-preview-20261015/related-final.txt)。最终 `pnpm run typecheck` 亦通过；缓存竞态修复后的同一浏览器专项再次通过，运行器与截图已保存为最终轮。[类型](./checks/tiff-original-preview-20261015/typecheck.txt)、[构建](./checks/tiff-original-preview-20261015/build.txt)和[完整单元](./checks/tiff-original-preview-20261015/unit.txt)保留。完整单元运行发生在新增媒体竞态回归之前，后者由上述最终真实媒体检查覆盖。

## 真实页面与设计对照

浅色、深色均覆盖360/390/430/768/1440宽度。实际TIFF原文件为1200×900，已有缩略图为64×48；详情及大图均断言PNG解码得到1200×900，不把缩略图放大冒充原尺寸呈现。关闭大图恢复详情焦点，切换缩略图仍解码64×48。

已人工查看[浅色手机详情](./browser/tiff-original-preview-20261015/library-viewer-tiff-detail-light-390.png)、[深色桌面详情](./browser/tiff-original-preview-20261015/library-viewer-tiff-detail-dark-1440.png)、[原图大图](./browser/tiff-original-preview-20261015/library-viewer-tiff-viewer-light-1440.png)及[超限提示](./browser/tiff-original-preview-20261015/library-viewer-tiff-original-download-required.png)。详情区域顺序、页签、固定操作栏、关闭控件和图片保比例舞台均沿用既有结构；超限说明使用现有占位状态，不改变公共布局。

浏览器将有效TIFF尾部填充到50MiB+1并同步隔离夹具大小，证明原图接口返回413、详情和大图不加载图片/重试、缩略图仍显示、原图附件下载仍返回原大小。测试结束恢复文件和数据，运行器确认临时目录已删除。

## 交付边界

未发布或部署。仅运行相关集成，未重跑全部集成或历史实验。真实浏览器验证使用本机standalone，未运行物理设备触控或生产环境人工验收。本机缺少Docker，未运行生产Debian镜像中的 `scripts/verify-media-tools.sh`；本机真实媒体工具结果不冒充镜像验证。

## 所有者人工验收（2026-10-15）

所有者在本地预览 `http://127.0.0.1:3135/library` 验收后明确确认：“验收通过，TIFF 预览和大图上一张、下一张按钮都没问题，创建 PR。”本次确认对应代码提交 `82da09ab`，预览使用独立数据，通过正式上传流程准备普通TIFF、恰好50MiB、50MiB+1及不同照片的连续浏览样本。

人工验收已通过的范围为TIFF预览和大图上一张、下一张按钮。该确认不替代生产镜像或部署验证。预览保持运行，等待后续明确清理指令。
