# 图片编辑正式实施计划

- 日期：2026-10-25。
- 授权：用户认可交互原型并明确要求正式实现图片编辑、模板、批量，默认另存新图，完成测试和浏览器验证；不发布部署。
- 依据：[方案](../../docs/design/image-editor-proposal-20261025.md)、[原型](../../prototypes/image-editor/README.md)。既有 `tasks/plan.md`（备份）与浏览器扩展计划保留。

## 边界与方案

- JPEG/PNG/静态WebP，完整像素局部马赛克/纯色、文字或Logo水印、透明度、旋转、平铺与调色盘。另存继承存储、可见性、相册和标签，新增独立ID；覆盖复用现有替换发布和尺寸重建。
- `media_edit_requests` 为现有 process/replace 任务保存源对象、配方和客户端请求ID；不新增第二套队列或任务kind。处理前渲染新原图，再进入原有媒体流水线。当前源对象标识用于防止旧画布覆盖新内容。
- `media_edit_templates` 保存名称和业务配方；素材用正式水印素材ID。模板及活动编辑任务参与素材引用和备份；活动编辑读取源对象时，现有清理等待其结算。
- 服务端复用 ImageMagick；前端使用 Konva/react-konva 和 HeroUI。编辑器只按需加载。正式服务器生成最终预览与文件，浏览器不上传截图代替全尺寸结果。
- 真实队列逐张提交，默认另存；含打码须逐张检查。冻结每项请求ID与配方，网络结果未知先查询原请求，不直接新建副本。仅重试失败项，停止尚未开始项，受理项由服务器继续处理。
- 图库工作区保持挂载，返回保留查询、选择、滚动与焦点。另有直达路由供上传完成项进入。
- 保留工作区其他未提交改动。迁移由主代理统一生成。不使用本机Docker/Colima，不发布、不部署。

## 共享接口合同

共享类型：`src/shared/image-editing.ts`，配方结构沿原型，图片水印以 `assetId: string | null` 代替 `assetSrc`。图片预览URL单独传给画布，不存入配方。区域坐标与水印中心坐标均为0..1；字号按短边比例、Logo宽度按图宽比例；强度按短边千分比；先打码再水印。

- `GET /api/images/{imageId}/edit` → `{imageId,name,format,mime,width,height,sourceObjectId,sourceUrl,unavailableReason}`。源URL为同源所有者读取。浏览器以实际解码后的自然尺寸展示纠正方向的底图。
- `GET /api/images/{imageId}/edit/source?objectId=...` → 原始图片字节，不跳转S3。只允许当前原图对象。
- `POST /api/images/{imageId}/edit`，JSON `{requestId,sourceObjectId,mode:'copy'|'overwrite',recipe}` → 202和编辑状态。省略mode默认copy。
- `GET /api/media/edits/{requestId}` → `{requestId,jobId,sourceImageId,resultImageId,mode,status,step,error,finishedAt}`；不存在404，供不明提交核对。
- `POST /api/media/edits/{requestId}/retry` → 同一结果图片/任务重试，不重复新建副本。已在执行/成功时返回其现状。
- `POST /api/images/{imageId}/edit/preview`，JSON `{sourceObjectId,recipe,mode?,target?}`（mode默认copy，target默认original，也可watermark）→ 服务器实际合成后的PNG临时响应，不写图库。上下文的`watermarkPreview.copy/overwrite`说明各保存方式是否有对应水印版本。
- `GET/POST /api/media/edit-templates`；`PATCH/DELETE /api/media/edit-templates/{id}`。列表和单条使用 `{id,name,recipe,createdAt,updatedAt}`，列表为 `{templates:[...]}`。
- Logo继续使用 `/api/media/watermark-assets` 上传，素材读URL沿现有接口，不允许配方带任意远程URL或文件路径。

## 分工与验证

主代理统一共享合同、表和迁移、HTTP/模板、运行时组合、集成收口及真实浏览器。媒体代理实现提交/重试/前置渲染及活动源清理边界；渲染代理实现ImageMagick和共享参数测试；前端代理实现真实编辑工作区并接入入口。具体代码边界通过代理消息确认。

每个切片写外部可观察测试。先定向单元/集成，再根类型、静态、构建和适用集成；最终真实正式页面联调桌面/手机、浅深色、权限、失败、结果不明、素材、模板、批量与覆盖。已有证据可复用，不重跑无关实验。

## 2026-10-26 独立PR提交边界

从origin/main建立图片编辑独立分支。仅包含编辑/模板/批量、所需SHA-256字段和关联验证，不包含当前原工作区的智能集合、普通上传判重/回填或浏览器扩展。重新生成0031迁移，仅创建两张编辑表并添加可空摘要列；不引入其它功能的迁移。原工作区保持不变。

## PR #301 评审修复计划（2026-10-26）

用户要求先规划并修复两份独立评审的问题。基于已评审的`8f9fce05`增量修复，原报告保留原结论；不合并、发布或部署。

1. **统一工作区离开保护。** 复用`useSiteNavigation`，允许显式退出与链接/历史遍历共享确认。未提交配方的判断由workspace/provider持有，不依赖当前是否显示Editor。保护单图、批量、模板及结果中的尚未提交项；已冻结且提交过的任务继续按原请求恢复。删除Editor局部beforeunload与分散的离开状态。先补后退/侧栏/刷新/取消与放弃的回归，再实现，浏览器确认配方和焦点保留。
2. **删除即时预览编码层。** `renderEditedImage`直接返回绘制后的Canvas，调用方按Canvas/原始Image的明确宽高传给Konva；保留源图与Logo缓存和释放。先补结果仍为同像素画布、无导出编码的测试，再修改。正式服务端预览与保存流程不变。
3. **复用原图准入。** `readEditSource`直接消费现有`requireEditSource`的领域对象并核对sourceObjectId，不再经UI Context丢弃对象、转换错误并重复查询。HTTP状态可保持既有公开错误合同，内部保留领域错误上下文。以现有源读取/预览测试及补充边界测试验收。

三个修改边界分别为工作区/共享导航、raster/Canvas、服务端source准入。独立切片可并行，类型、构建、浏览器和提交由主代理统一收口。没有数据库或依赖变更。

验证：先执行新增测试的失败轮与修复后的定向检查，再执行类型、静态、单元、生产构建及受影响集成；复用此前无关检查，浏览器补实际离开确认并重跑图片编辑专项。最终更新PR问题状态、命令结果与两位评审的复核结论。上一轮CI分享测试失败先核对调用链和日志，不直接修改无关模块。

## logging CI收口（2026-10-26）

用户授权修复阻断CI的日志测试，全部通过且无遗留后合并，不发布部署。先复现Next提前Ready日志与处理器实际就绪之间的差异；沿用现有真实HTTP就绪合同，保留15秒启动预算、三个2秒请求及全部原断言。新增真实router延迟回归，定向及相邻启动测试通过后独立复核、推送完整CI；仅在最新提交全绿且评审无遗留时合并。根因、失败先行与实际命令见[本轮记录](../../docs/verification/image-editor/logging-ci-20261026.md)。
