# 图片编辑、模板与批量处理实施记录

> 提交拆分说明（2026-10-26）：本文保留10月25日组合工作区的历史验收。图片编辑现单独基于origin/main拆分提交，未包含智能集合、普通上传判重/回填或浏览器扩展；仅加入编辑母图需要的可空SHA-256字段。当前PR使用独立0031迁移（两张编辑表和摘要字段），不包含原工作区0031–0034迁移链。隔离分支重新验证的结果见[PR提交验证](./pr-verification-20261026.md)，不能把下文原工作区计数当作独立PR结果。

- 日期：2026-10-25。
- 状态：正式实现与本轮验收已完成；未发布、未部署、未合并或推送。
- 授权：用户认可[交互原型](../../../prototypes/image-editor/README.md)，要求正式实现、测试及浏览器验证，默认另存新图。
- 计划：[实施方案与API合同](../../../tasks/image-editor/plan.md)、[已完成任务](../../../tasks/image-editor/todo.md)。保留工作区先前智能集合、浏览器扩展等未提交改动，不把这些改动归为本功能。
- 环境：macOS arm64、Node24.18.1、pnpm11.19.0，原生ImageMagick/ExifTool；没有使用本机Docker/Colima。
- 本地构建身份：`v0.0.0-image-editor.1` / `c018b93c482349be70413fa870990fc2ac7321fe`。代码来自含未提交修改的工作区，不能把HEAD当成全部源码身份；该版本不是发布版本。

## 已实现的行为

1. JPEG、PNG、静态WebP全尺寸编辑：多个矩形马赛克/不透明纯色、拖动/缩放/精确输入、撤销重做、文字或Logo、相对大小/位置/透明度/旋转/平铺及HeroUI调色盘。
2. 默认另存独立图片，继承存储、可见性、相册、标签，保留源图与旧链接。覆盖保留ID、显示名、创建时间和关系，全部原图/派生/已有尺寸成功后一次切换，更新指纹与元数据、撤销原临时分享；失败保留旧内容。
3. 持久模板增删改查，以素材ID保存Logo。批量逐图预览/微调；含打码逐张确认；仅重试失败项，停止尚未提交项，已受理任务继续。
4. 请求ID与冻结意图持久保存，响应丢失核对同一请求，不自动新建副本。失败重试回到同一任务和结果ID，已有安全编辑母图直接复用。
5. 服务器最终预览先按正式母图编码，再生成原图或实际站点水印版本，最后缩为PNG。另存读当前站点设置，覆盖读历史配方；没有跳过JPEG质量95编码的预览捷径。
6. 瞬时预览复用原媒体队列并发槽位；关闭/取消等待真实处理结算。模板、排队编辑及必要输入纳入备份；未生成母图且仍可重试的失败请求保留必要Logo，已不需要的raw源/Logo释放。
7. 详情更多菜单、图库批量操作、图库模板入口及上传完成项进入正式编辑器。图库保持挂载，返回保留筛选、选择、加载记录、滚动和焦点；直达路由为`/library/edit`。

## 实际执行与结果

| 命令/检查                                                                                                                             | 结果                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`、`pnpm --dir integrations/picgo install --frozen-lockfile`                                           | 通过                                                                                           |
| `pnpm run db:generate`                                                                                                                | 生成0034，两张新增表及索引；未改动已有业务数据                                                 |
| `pnpm run typecheck`                                                                                                                  | 通过，含PicGo/浏览器扩展及前后端类型                                                           |
| `pnpm run lint`                                                                                                                       | 通过，未关闭规则或降低warning门槛                                                              |
| `pnpm run test:unit --maxWorkers=2`                                                                                                   | 退出0；根Vitest257文件、2809项通过，脚本还执行独立集成包测试                                   |
| `pnpm run test:integration --maxWorkers=2`                                                                                            | 最终退出0；220文件、2268项通过                                                                 |
| `pnpm exec vitest run --project media-tools tests/integration/media/edit-render.test.ts tests/integration/media/edit-preview.test.ts` | 最后删除未使用的母图转码参数后，22项原生渲染/预览回归通过；新增WebP透明PNG预览在真实服务层验证 |
| `pnpm run build`                                                                                                                      | 通过；原生SQLite/SVG绑定验证成功，最终包不含项目src，保留依赖自身源码                          |
| strict standalone、health、secret-preflight、server-start定向复核                                                                     | 34项通过；未放宽源码、密钥、迁移、关停或禁用类型擦除断言                                       |
| `pnpm run openapi:check`                                                                                                              | 通过，既有上传契约保持当前                                                                     |
| 两提供方真实S3脚本                                                                                                                    | R2和SeaweedFS各7组通过，各18个自有对象精确清理并确认不存在                                     |
| `EGO_TASK_SPACE=2 node scripts/verify-browser.mjs --suite image-editor`                                                               | 退出0；15组行为、48组布局通过，非预期浏览器错误为空                                            |

`pnpm run format:check` 全仓库格式检查与 `git diff --check` 均通过；88个相对文档/源码链接检查无缺失。浏览器验证空间已关闭，临时应用和数据已清理。

后期UI修正仅涉及触控尺寸、Logo缓存释放和短屏布局；服务器数据流没有因此改变。全量集成及真实S3结果保留其实际范围，最后的原生渲染/预览与浏览器回归覆盖对应最新修改。不将重复运行相加为唯一测试总数。

### 原始命令日志

本轮日志在本机`/tmp/ariso-editor-{typecheck-final,lint-final,unit-final,integration-final,build-final,openapi,browser}.log`。失败轮次没有改写为通过；浏览器运行器当前报告随最后一次执行更新，必要历史另存。

## 真实服务与浏览器证据

- 最终包装产物：[R2](./s3/run-jmQr7b/r2/report.json)、[SeaweedFS](./s3/run-jmQr7b/seaweedfs/report.json)。初轮[对应R2](./s3/run-YMyk1Z/r2/report.json)和[SeaweedFS](./s3/run-YMyk1Z/seaweedfs/report.json)也保留。
- 云服务验证包括同源source流/Logo像素、模板CRUD、双版本预览不入图库、默认另存/幂等/源图保留、实际1600×1000掩码像素/SHA、历史配方覆盖及三尺寸原URL、元数据及复制独立性。
- [最终浏览器报告](./browser/image-editor.json)、[运行器与清理](./browser/runner.json)。源图片通过正式上传与实际媒体工作线程生成，不用数据库媒体种子或伪造任务状态代替功能。
- 丢响应场景只丢掉一次已实际接受的POST响应；停止场景短暂持有真实接受响应；真实部分失败临时rename一份本夹具Local原图，再恢复并重试同一job/result ID。只精确允许该URL在故障窗口中的预期资源错误，其余浏览器错误必须为空。
- 夹具原图已恢复，5个复制结果及原上传/集合夹具已清理，临时应用与目录已移除；S3只删除自有exact keys，没有修改bucket规则或生产对象。

## 前端视觉与交互对照

依据为已批准的独立原型和当前[设计交付规范](../../design/handoff.md)。本功能没有新Figma节点，不声称同步了Figma；正式页面仍可由用户继续人工审阅。

- 复用正式OwnerShell、导航、账号、主题和字体。保留原型的中央画布、右侧参数、明确保存方式、默认另存、相同比例与水印操作；移除原型演示条和假进度，接入真实数据/任务。
- HeroUI3复用Button、表单、Modal、Dropdown、Slider、NumberField、Switch、Checkbox、ColorPicker/Area/Slider/Field/SwatchPicker、ProgressBar、Alert和Toast；图标来自Lucide。
- 画布使用Konva，因为通用控件库不提供局部图片编辑。静态布局、棋盘背景及响应式使用Tailwind；动态画布尺寸由实际图片和容器计算，没有另建UI框架。
- 覆盖1440桌面、360/390/430手机、768平板，浅深色、键盘、焦点、错误、队列及短视口。缩放与九宫格触控区均满足44px；调色盘Esc关闭真实回焦。
- 人工看图发现自动“按钮可达”检查没有覆盖短屏正文被挤没的问题，补最小编辑高度及真实正文高度断言。390×480最终单图正文225px，批量正文160px，横向无溢出，保存可滚动到达；普通高度保持原型结构。
- Logo更换或Canvas卸载释放对应缓存；2项额外小回归验证下次可重取、其他图像引用仍有效。

截图：

- [桌面编辑器](./browser/image-editor-single-edit-light-1440x1000.png)
- [手机深色](./browser/image-editor-single-edit-dark-390x844.png)
- [短屏单图](./browser/image-editor-single-edit-light-390x480.png)
- [短屏批量](./browser/image-editor-batch-reviewed-light-390x480.png)
- [实际部分失败](./browser/image-editor-real-partial-failure.png)

## 评审发现及修正

- 安全母图已存在时，不再备份已清理的raw源/自定义Logo；未渲染的可重试失败请求保留必要Logo，避免清理使重试不可恢复。
- 手动重试不能重新认领正在清理/已退休的源；已接受任务的immutable读取仍受保护。安全母图准备好后允许源删除，不多持有不需要的对象。
- JPEG最终预览包含真实母图编码；删除未被正式流程使用的PNG强制母图选项，防止重新引入预览/保存差异。
- 反转备份写入门进行测试变异，相关单元按预期失败；恢复代码后通过。新表加入精确生产表清单，没有删原表断言。
- 开发重编译失败为跨卷pnpm离线缓存缺新依赖；补齐相同版本缓存后，保持offline、原超时和原断言通过。
- 新预览关停有真实文件系统异步步骤，测试改为有界latch并加强数据库最后仅关闭一次断言，不假设一轮setImmediate。
- 当前Turbopack hook追踪夹带一份源码；最终组装只移除包根项目src，不修改NFT/API、不排除依赖src，严格产物及真实source接口已验证。
- 浏览器Esc焦点恢复等待真实完成；40px缩放与34px九宫格修为44px。第3轮测试空间不再存在，得到用户明确授权后重建，最终使用空间2；没有把工具失败当成产品通过。

## 未验证及交付边界

没有发布、部署、合并或推送。没有跨架构容器、Safari/Firefox或物理手机测试；用户已取消的物理设备门槛不改写为通过。远端为小型PNG，JPEG/PNG/WebP及SVG Logo在本机原生验证，不外推云端其他格式、大文件或容量性能。动画、多页、SVG底图等继续原有上传/交付，首版编辑不静默扁平化它们。
