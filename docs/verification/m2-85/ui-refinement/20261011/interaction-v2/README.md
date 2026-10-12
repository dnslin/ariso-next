# 图库、相册与回收站交互第二版实施

用户以“可以，就按照这个原型去实施，Figma 那边也同步修改”批准 [61511 原型](../../../../../../design-plans/main-ui-review-20261011/interaction-review-v2/README.md)。本轮在已有脏工作区上继续实现，没有回退此前的总览、统计、存储等修改。分支为 `codex/ui-review-refinement`，基线为 `67d413652db8bfa055697e6bfe2d4894568bf5c1`。没有提交、推送、创建 PR、合并或发布。

## 实施范围

- 公开/私有分别使用绿色/紫色徽标，保留地球/锁和中文状态。卡片元信息底部与列表末行增加实际布局空间。
- 管理选择直接打开缩略图清单。全选当前范围、取消当前范围、清空全部使用图标组，保留跨页选择与每页20项的已选清单。
- 图库、相册图片和回收站复用 HeroUI ButtonGroup、Tooltip 与 Lucide。快捷动作不在更多菜单重复，右键按状态裁剪。
- 相册标题右侧返回，添加图片放在独立操作栏。编辑、封面、分享和更多改为44px图标组。相册卡片支持右键、Shift+F10与触屏省略号。
- 相册上传携带 `albumId`、`returnTo` 进入完整上传页。删除快捷上传弹窗及图库上传按钮，保留侧栏上传入口、同一 Uppy 队列、入口独立草稿和冻结提交。
- 标签使用桌面420px、手机全宽抽屉，保留分页搜索、多选与行内创建。不展示标签 UUID。重名沿用 trim、NFC 与 Unicode 完整大小写折叠。
- 分享未创建时直接展示隐藏图片名称、密码与到期时间表单。底栏“创建并启用分享”通过已有 POST 一次提交，不增加后续 PATCH。创建成功回到设置标题焦点，取消不创建。
- 移入回收站与恢复完整成功只显示 Toast。部分失败、未知和未提交项保留可处理结果。永久删除仍确认并展示真实清理进度；删除中和清理失败项不能恢复。

没有新增产品依赖、数据库迁移或新写入接口。已有 `/api/images/selection` 的轻量结果补充实际 `deletionStatus`，让跨页恢复与当前页使用同一状态判定，不另起接口。

## 独立审查

独立只读审查发现的三个 P2 均按当前设计修正，并补充回归覆盖：

1. 标签创建和核对都失败时，未知结果禁止关闭抽屉，但核对按钮保持可用。已知失败仍可关闭。
2. 首次分享创建成功卸载提交按钮后，焦点回到设置标题。
3. 回收站恢复确认与原列表并存，只在需要处理结果时切换主内容，避免确认阶段丢失列表位置。

同时删除旧的回收成功 Modal 分支。完整成功沿用控制器统一反馈判断，不保留过时成功弹窗路径。

最终真实标签检查还发现一项回焦竞态：成功关闭抽屉后，选中项核对暂时禁用来源按钮，原来的单次回焦会丢到BODY。现在只观察该按钮的`disabled`属性，启用后回焦并断开；新操作和卸载清理等待。新增5项回归，不放宽忙碌禁用，也不加入固定延时。

## 验证

环境为 macOS ARM64、Node24.18.1、pnpm11.19.0，使用本机 ImageMagick 与 ExifTool。浏览器统一复用 Ego TaskSpace7；真实写入场景使用独立临时数据，不删除用户在3001预览中的图片。

原型检查、单测、真实浏览器与最终人工验收是不同证据，不互相替代。已执行：

| 命令                                                                                                                                                                                                                                     | 实际结果                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                         | 通过，锁文件未变                                                                                                                          |
| `pnpm run test:unit`                                                                                                                                                                                                                     | 最终版本176文件、2204测试通过                                                                                                             |
| `pnpm exec vitest run --project unit tests/unit/sharing tests/unit/collections tests/unit/library/batch-tag-drawer.test.ts tests/unit/library/batch-targets.test.ts`                                                                     | 收尾21文件、164测试通过                                                                                                                   |
| `pnpm run typecheck` / `pnpm run lint` / `pnpm run build`                                                                                                                                                                                | 最终产品版本均通过；构建保留已有可选resvg平台包/OpenTelemetry依赖追踪警告                                                                 |
| `pnpm exec vitest run --project integration tests/integration/library/selection.test.ts tests/integration/library/selection-http.test.ts tests/integration/library/batch.test.ts tests/integration/library/trash.test.ts --maxWorkers=1` | 4文件、30测试通过                                                                                                                         |
| `pnpm run test:integration --maxWorkers=1`                                                                                                                                                                                               | 189文件通过、2文件失败；1881测试通过、16失败。启动与媒体HTTP测试恰逢生产构建目录被重建，报缺少drizzle、entrypoint.sh或storage/settings.js |
| `pnpm exec vitest run --project integration tests/integration/runtime/startup.test.ts --maxWorkers=1`                                                                                                                                    | 构建完成后独立重跑13测试通过                                                                                                              |
| `pnpm exec vitest run --project media-tools tests/integration/media/metadata-http.test.ts --maxWorkers=1`                                                                                                                                | 构建完成后独立重跑6测试通过，含前述3项失败                                                                                                |
| `pnpm run format:check`                                                                                                                                                                                                                  | 仅2份已有site-196历史JSON未通过；本轮不修改无关历史证据                                                                                   |
| `node docs/tasks/check.mjs` / `--self-test`                                                                                                                                                                                              | 120任务、298需求通过；5项拒绝夹具通过                                                                                                     |
| `git diff --check`                                                                                                                                                                                                                       | 通过                                                                                                                                      |

全量集成原始失败和后续重跑分别保留，不能把分次结果描述为单次全绿。日志见 [checks](checks/)。没有把定向浏览器检查描述为默认全量浏览器套件通过。

真实浏览器统一通过 `EGO_TASK_SPACE=7 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=... node scripts/verify-browser.mjs` 运行：

- `--suite collection-shortcuts` 已通过。覆盖真实原生上传、入口独立草稿、冻结提交、相册上下文、失败重试、自动成员更新、相册右键/键盘/触屏入口、跨页图库选图、按状态裁剪菜单，以及真实回收/恢复Toast。确认阶段保留回收列表的回归断言通过。
- `--suite library-batch --only tag-states` 最终版本通过，7项流程、38个布局。覆盖真实逐项SQL失败与重试、丢失响应与只读核对、目标加载/错误/空、多选搜索分页、规范化重名、真实快建和关系写入/移除。顶部/底栏计数分别验证，最终回焦修正后直接成功、失败重试和未知结果核对均回到来源按钮。
- `--suite sharing-management --only behavior` 最终版本通过，9项流程、36个布局。首次隐藏名称与底栏提交通过真实单次POST验证；进入、编辑、返回取消不创建；保留重复创建不覆盖、密码校验、到期选择、复制与焦点恢复。
- `--suite trash --only approved-progress` 通过，1项真实流程、12个布局。浏览器持有实际删除请求并逐步解除活动写入，真实工作器依次清理对象，核对等待、删除中和最终完成，而非将接受请求视为完成。

相册、上传和选图检查覆盖320/360/390/430/768/1440px、浅深色和390/1440短视口。标签覆盖360/390/430/768/1440px及360/390×600短视口。没有水平溢出、裁切按钮或低于44px的主要命中区。完整矩阵见各浏览器JSON，截图数量不替代设计对照。

浏览器初次启动因PATH缺少Ego入口失败，补齐PATH后重跑。测试拦截安装时机、菜单等待方式和过时成功弹窗预期均已修正；最终通过记录与历史失败截图分开解读。标签检查还暴露HeroUI Dialog过滤`aria-busy`，现将真实忙碌状态放在Drawer正文并保留禁用与核对断言，没有放宽产品校验。计数分区后，旧测试仍要求同一行计数，现分别验证顶部图片数和底栏标签数。

## Figma 与设计对照

同步在既有 [Figma 文件](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1116-34665)内完成。节点账本见 [figma-nodes.json](figma-nodes.json)，同步范围和导出见 [figma-sync.md](figma-sync.md)。本轮覆盖图库、相册、完整上传、标签抽屉、分享与回收站改变的界面和状态，不重绘无关历史页面。

对照使用同尺寸实际页面截图，先检查公共区域，再检查本轮业务控件。桌面1440×900，手机390×844。以下图片均已实际打开查看；3001截图使用用户已有图片和相册，只改变本地勾选、搜索和主题，未提交上传、分享或删除。

| 界面/状态                 | Figma节点               | 实际截图                                                                                                                                                                                                                                | 对照结论与差异处理                                                                                                                                                                                      |
| ------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 图库浅色桌面              | 1117:35539              | [图库](browser/comparison/library-desktop-light.png) / [已选快捷组](browser/comparison/library-actions-desktop-light.png)                                                                                                               | 232px侧栏、32px正文边距、品牌、当前项和底栏沿用正式公共外壳；无图库上传入口，绿/紫徽标均有图标与文字。保留正式筛选条件、刷新和加载模式，不复制静态样例的“全部”占位筛选。                                |
| 选择管理浅色桌面          | 1118:57516              | [已选清单](browser/comparison/selection-desktop-light.png)                                                                                                                                                                              | 单一入口、缩略图、三项选择图标组、逐项取消一致。弹层由HeroUI按实际触发位置自动定位；真实存储名、当前/其他页数量和分页不使用示例硬编码。                                                                 |
| 相册浅色桌面/深色手机     | 1117:37147 / 1117:38497 | [桌面](browser/comparison/album-desktop-light.png) / [手机](browser/comparison/album-mobile-dark.png) / [末行](browser/comparison/album-bottom-mobile-dark.png)                                                                         | 返回与标题同排，添加位于独立操作栏，编辑/封面/分享/更多为图标组。详情短UUID已去掉。照片底部16px与末行留白已补齐；保留真实封面摘要、相册筛选和处理状态。                                                 |
| 相册添加/卡片菜单         | 1118:59628 / 1118:55194 | [添加菜单](browser/comparison/album-add-desktop-light.png) / [触屏菜单](browser/comparison/album-context-mobile-light.png)                                                                                                              | 添加仅提供完整上传和图库选图；相册卡片菜单提供打开、编辑、分享与删除，桌面右键/键盘已由真实浏览器流程验证。                                                                                             |
| 完整相册上传浅色桌面/手机 | 1118:35415 / 1118:36225 | [桌面](browser/comparison/upload-desktop-light.png) / [手机](browser/comparison/upload-mobile-light.png)                                                                                                                                | 已离开小弹窗，当前相册真实预选，返回地址明确。保留正式上传页的文件夹、拖放/粘贴、多相册、标签和存储配置；不把原型简化设置复制成第二套上传器。                                                           |
| 标签重名浅色手机/深色桌面 | 1118:62672 / 1118:62128 | [手机](browser/comparison/tag-duplicate-mobile-light.png) / [桌面](browser/comparison/tag-duplicate-desktop-dark.png)                                                                                                                   | 全宽/420px抽屉、顶部图片数、搜索、底部行内新建、字段错误和底栏标签数一致，无可见UUID。保留正式“选择现有标签”按钮，重名后不必重新搜索；计数和应用按钮已按批准稿分区缩短。                                |
| 分享首次创建浅色手机/桌面 | 1118:37585 / 1118:36819 | [手机](browser/comparison/share-mobile-light.png) / [桌面](browser/comparison/share-desktop-light.png)                                                                                                                                  | 直接表单、隐藏名称开关、密码和固定底栏创建动作一致。原型简化日期输入替换为现有截止方式/日历，站点时区与DST规则不变，并同步8个Figma状态；开关选中色也已对齐正式accent角色。实际进入后GET仍为share:null。 |
| 回收与永久清理            | 1118:72590 / 1118:76120 | [真实提交](browser/trash/trash-approved-progress-submitting-light-390.png) / [等待写入](browser/trash/trash-approved-progress-waiting-for-writes-light-390.png) / [清理中](browser/trash/trash-approved-progress-running-light-390.png) | 完整回收/恢复用Toast，失败保留处理入口。永久清理继续使用现有真实结果页，而非把静态样例进度当作完成；工作器和逐项状态验证见trash报告。                                                                   |

Figma新增80个可编辑状态并原位更新10个主画板。没有用全页截图代替设计层。静态示例与实际图片、名称、文件大小、数量不同不修改真实数据；现有完整业务控件和公共主题入口继续复用，不为像素对照删除成熟功能。未测试Figma Player跳转，以上不构成“全部画板像素级完全相同”的声明。

## 交付边界

正式预览为 [3001图库](http://127.0.0.1:3001/library)。保留原预览数据和账号，不把凭据写入版本化文档。61511批准原型继续保留。

没有执行发布容器或物理手机验证，没有声称全部历史业务和远端服务已回归。最终正式页面人工验收仍由用户完成。
