# 图库与相册快捷工作流

状态：用户于 2026-10-11 批准原型并授权正式实施及 Figma 同步。已接入真实业务并同步可编辑 Figma；本地专项与最后回归分别记录，不以原型检查代替产品验证。等待用户人工验收。

## 范围

- 图库“上传”不跳页；相册单一“添加图片”菜单可上传或从图库选择。
- 快捷上传复用既有 UploadProvider、UploadController、Uppy 与现有上传接口。按入口保留草稿，已开始设置固定，未知先核对；明确失败保留快捷文件以显式重试，成功/取消/清除释放。
- 相册选图复用图片查询、真实成员查询和批量加入接口；已有成员禁选，搜索/分页保留选择，失败或未知不伪报成功。
- 选中后工具栏“操作”提供完整批量命令，右键保留常用项；依据真实可见性和相册关系裁剪，混合状态只修改需变化项。
- 正常图库查询及选择回读增加真实 `hasAlbums`，复用现有关系索引，不新增表或迁移。

不更改上传传输协议、相册排序/封面规则、存储模型或权限边界。不创建 PR，不合并、不发布，也不清理既有任务资源。

## 组件

复用 HeroUI Modal、AlertDialog、Dropdown、Select/ListBox、Button、CloseButton、Checkbox、Tooltip、ProgressBar、TextField/InputGroup、Pagination、Toast 及既有缩略图、详情和批量目标组件。图标来自 Lucide。选图业务组件 `AlbumImageChoice` 只呈现缩略图、名称和选择状态，不带入图库的可见性、大小及处理信息。不新增 UI 库；框选继续复用 `@air/react-drag-to-select`。

`UploadProvider` 仍是唯一上传生命周期所有者。收起窗口不销毁控制器；普通上传页和快捷入口共用现有提交、传输、取消及回读能力。明确失败保留快捷上传文件供显式重试，成功、取消、移除和清除时释放文件与预览地址。会话失效统一清理。

## 验证

实际使用 Node 24.18.1、pnpm 11.19.0，命令统一设置 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。浏览器复用 Ego TaskSpace 5，仅在隔离数据中执行批量写入，不使用用户 3001 预览做破坏性检查。

| 实际命令                                                                                                                                         | 结果                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                 | 通过；无新依赖。pnpm 自动移除的两个旧原型 importer 最后恢复，不交付无关锁文件变更       |
| `pnpm run build`                                                                                                                                 | 通过；保留可选 resvg 平台包与 OpenTelemetry 依赖追踪警告                                |
| `pnpm run test:unit --maxWorkers=4`                                                                                                              | 168 文件、2125 项通过；之后的外观和无障碍修正另行定向检查                               |
| `./node_modules/.bin/vitest run --project unit tests/unit/upload tests/unit/collections tests/unit/library --maxWorkers=4`                       | 最终版本 68 文件、733 项通过，7.19 秒                                                   |
| `pnpm run lint` / `pnpm run typecheck`                                                                                                           | 通过                                                                                    |
| `pnpm exec vitest run --project integration --project media-tools tests/integration/library tests/integration/upload/api.test.ts --maxWorkers=4` | 17 文件、154 项通过，29.28 秒；覆盖真实关系/可见性投影、HTTP 回读和上传接口             |
| `pnpm run test:integration`                                                                                                                      | 未全绿：191 文件中 185 通过、6 失败；1897 项中 1891 通过、6 失败，299.17 秒，处理见下文 |
| `pnpm run format:check`                                                                                                                          | 仅两份未修改的历史 JSON 未通过；新增及修改文件独立检查                                  |
| `node docs/tasks/check.mjs`                                                                                                                      | 120 任务、298 需求通过                                                                  |

全量集成检查中的 `library/selection-http.test.ts` 尚未断言新增 `visibility` / `hasAlbums` 字段，已补充真实期望，并随上表 154 项定向检查通过。其余五项是 `identity/setup-dev.test.ts`、`runtime/build.test.ts`、`runtime/logging.test.ts`、`runtime/secret-preflight.test.ts`、`runtime/prestart.test.ts` 的构建或启动超时，未修改，未归为已确认的历史失败。定向通过不代替全量通过。日志为 `/tmp/ariso-shortcuts-integration-final.log` 和 `/tmp/ariso-shortcuts-integration-focused.log`。

较早一次集成检查与重建 `.next` 重叠，出现 standalone 入口缺失及上传连接中断；原日志保留，不用于判定最终产物。后续全量检查使用已完成构建，仍有上述超时。没有删除测试、放宽校验或修改无关模块使其变绿。

全仓格式检查未通过的历史文件是 `docs/verification/site-196/implementation/merge-theme/browser/site196-merge-site-general/site-general.json` 及同级 `site196-merge-theme/theme.json`，均未修改。

### 浏览器专项

最早完整专项使用 `EGO_TASK_SPACE=5 BROWSER_REPORT_DIR=.data/main-ui-review-20261011/shortcuts-browser-final pnpm run test:browser -- --suite collection-shortcuts`，通过。最终版本实际执行 `EGO_TASK_SPACE=5 BROWSER_REPORT_DIR=.data/main-ui-review-20261011/shortcuts-browser-r12 node scripts/verify-browser.mjs --suite collection-shortcuts`，再次通过，共 180 个布局，并覆盖新增边界场景。公共外壳和实验 UI 前置构建通过。这是实际产品检查，不是原型检查。最终报告为 [工作流](shortcuts-browser/collection-shortcuts.json)、[条件菜单](shortcuts-browser/library-shortcuts.json)、[相册选图](shortcuts-browser/album-image-picker.json) 与 [运行器](shortcuts-browser/runner.json)。

- 快捷上传 80 个布局：待上传、默认存储不可用、设置展开、真实完成、失败保留文件。
- 真实上传图片选图 16 个布局：三个实际上传缩略图完整加载，当前相册成员禁选，已选数量靠左、底部操作可达。
- 菜单及目标选择 36 个布局：选中后才出现操作；公开、私有、混合、无相册关系裁剪；混合公开只发送私有 ID；图库显式选择移出目标，相册只移出当前关系；仍匹配图片保持选择。
- 相册选图 48 个布局：已有成员实际查询禁选；42 项跨搜索、跨页保留选择；失败保留输入；真实提交后丢响应只回读，不重复加入；刷新实际数量和自动封面；成员读取失败不能当成全部未加入；明确拒绝及部分成功后详情读取失败分别增加 16 个错误布局。
- 覆盖 320 / 360 / 390 / 430 / 768 / 1440px、浅深色；390 / 1440 另测 480px 短视口。断言弹窗范围、底栏可达、44px 操作目标、按钮文字和横向溢出。

两个本地文件真实上传为两个不同图片 ID，管理缩略图实际加载。上传开始后收起窗口并切换图库/相册，传输与轮询继续；后来修改草稿可见性不改变该批次真实可见性。删除真实默认存储后禁用开始，不自动换到其他存储；恢复后草稿仍在。相册上传明确拒绝后使用保留字节重试，成功自动加入当前相册并刷新封面、数量。

特殊故障在浏览器请求边界注入：受理后延迟响应、422 拒绝、成员读取失败、实际加入后的响应丢失、部分成功后的详情回读 500。成功、关系、数量、封面和可见性均回读真实接口或隔离数据库，不把模拟响应当成实际持久化。

最后只读复核发现并修正两项相册状态问题。第一项是返回相册列表后，后台上传完成未更新列表；现在对带真实相册关系的完成事件刷新列表，当前详情仍只匹配目标相册。[真实列表截图](shortcuts-browser/album-background-upload-list-refreshed.png)验证数量 0→1、封面实际加载且地址与接口一致。第二项是部分加入成功后详情回读失败卸载选图窗口；现在保留已有详情及窗口，首次无缓存失败仍显示错误页。[失败保留截图](shortcuts-browser/album-image-picker-partial-refresh-failed.png)验证仅一张真实加入、另一张保留选择，显式重试后真实数量为 5。四项新增单元行为检查与最终浏览器场景均通过。

检查发现并修正了结果详情按钮触控宽度不足、批量目标复选框缺少边框，以及 HeroUI Modal.Dialog 过滤 `aria-busy` 的状态缺口。短窗口首次读取早于视觉视口更新，改为等待实际最大高度生效；隐藏文件输入改为等待存在；故障代理提前在控制器捕获 fetch 前安装。原失败保留，不放松尺寸、状态或成员断言。

最终版本还统一了新增入口、搜索和底部主按钮的 48px 高度，去掉普通空相册和上传选图区的冗余解释；选图计数通过实际位置断言确认靠左。

视觉复核还发现提交错误位于长选图列表尾部。现在错误区位于图片滚动区之外、固定底栏上方，限制高度并允许错误明细滚动，不挤走底部操作。新增单元检查确认结构位置，浏览器另验浅深色和短视口的可见范围，最终 32 个错误布局均通过。[短窗口明确拒绝](shortcuts-browser/album-image-picker-rejected-light-390-480.png)及[手机部分失败](shortcuts-browser/album-image-picker-failure-dark-390-844.png)已逐张查看，错误与底部操作均可见。

旧批量回归发现短视口菜单的实际滚动层在外层 Popover，键盘菜单自身却不滚动。修正为外层有界 flex 容器、Menu 为可收缩滚动区，沿用 React Aria 键盘滚动，不增加滚动脚本。后一次检查实际菜单已经可见，但读取早于键盘滚动完成；测试现在等待原有的完整可见条件，不放宽位置断言。

回归还确认未知标签结果核对成功后的回焦被随后的选择核对禁用打断。正式实现复用现有 HeroUI/React Aria Button 的 `isPending` 能力：核对和写入期间禁用操作，但保持入口可聚焦；真正不可操作及未知未核对仍使用 `isDisabled`。相关菜单命令同时禁用。无新增焦点轮询、延迟常量或公共焦点抽象。原失败记录保留在 `.data/main-ui-review-20261011/library-batch-review-*`。

最终实际执行 `EGO_TASK_SPACE=5 BROWSER_REPORT_DIR=.data/main-ui-review-20261011/library-batch-review-r12 node scripts/verify-browser.mjs --suite library-batch --only review-fixes`，通过 9 组业务场景、54 个布局。这是原有批量行为的定向回归，不是全量默认浏览器套件。[报告](shortcuts-batch/library-batch.json)和[运行器](shortcuts-batch/runner.json)已经归档。覆盖真实 200+1 分批、旧缓存页可见性、60 张已加载窗口保留 58 张并沿原游标继续、标签跨页选择/创建/添加/移除、实际逐图 SQL 失败后显式重试、丢响应后仅回读、公开/私有只发送需变化 ID、刷新 GET 等待及失败的真实反馈。短窗口键盘菜单完整可见、Escape/Space、核对后回焦、原页码和仍匹配选择均通过。

测试为虚拟列表恢复实际滚动位置，等待目标卡片挂载后仍使用真实悬停和选择，不以直接调用选择状态替代用户操作，不修改已加载窗口、缓存和游标断言。代表截图：[短窗口标签](shortcuts-batch/library-batch-tag-short-dark-390.png)、[旧页最新状态](shortcuts-batch/library-batch-cache-old-page-current-visibility-light-1440.png)、[保留已加载窗口](shortcuts-batch/library-batch-cache-loaded-window-after-trash-light-1440.png)、[原游标继续](shortcuts-batch/library-batch-cache-continued-original-cursor-light-1440.png)、[手机成功反馈](shortcuts-batch/library-batch-public-success-toast-light-390.png)、[保留实际失败](shortcuts-batch/library-batch-private-retained-failures-dark-1440.png)。

新增场景的较早尝试因侧栏相册/页面返回链接定位歧义，以及保留第二页后重复填写相同搜索词没有触发翻页而中断。测试改为定位具名侧栏入口、显式返回第一页，不修改产品的页码保留行为，不放松成员或失败断言。原失败记录保留在 `.data/main-ui-review-20261011/shortcuts-browser-r11*`。

## Figma 对照

[快捷流程区域 1095:19618](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b/Ariso?node-id=1095-19618) 包含 19 组、76 张可编辑桌面/手机浅深色画板。原图库 `30:285` / `98:748`、原相册 `38:378` / `102:4002` 的主入口也已修改。完整节点及回读见 [Figma 同步记录](../../../../../design-plans/main-ui-review-20261011/figma-shortcuts.md)。

同视口为桌面 1440×900、手机 390×844，每项分别查看浅深色，不以无溢出替代视觉对照。

| 内容     | 节点，依次桌面浅/深、手机浅/深                            | 逐项结论                                                                                                   |
| -------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 图库入口 | `1099:20415` / `1099:20603` / `1099:20791` / `1099:20871` | 标题行右侧单一 CloudUpload 上传入口。原查询、排序、布局、刷新及分页保留，不以快捷入口替换既有能力          |
| 上传窗口 | `1102:24671` / `1102:24960` / `1102:25249` / `1102:25430` | 桌面 640px、手机左右 16px；摘要、选图区、文件行、取消/上传层级一致。修正关闭底色、图标、底栏间距和冗余提示 |
| 相册选图 | `1102:33704` / `1102:33925` / `1102:34146` / `1102:34259` | 桌面 800px、手机双列；搜索、缩略图/名称/勾选、已有标识和底部操作一致。移除完整图库元信息，已选数量恢复左侧 |
| 状态变化 | 同步记录的 05–19 组                                       | 按需设置、不可用就近报错、失败保留、已有禁选、成功留在相册和条件菜单，均对应上述真实运行检查               |

图片、名称、默认本地/私有及数量是 Figma 样例，产品读取真实配置。弹窗高度随文件、结果、分页数量变化，只在确有多页时显示分页。缺少缩略图时保留准确占位，不静默回退原图。主题按钮按当前模式显示 Monitor / Sun / Moon，不固定为设计样例中的 Sun。

以下 12 组均已打开原尺寸图逐项对照。上传的文件数和选图的成员状态不同，因而不要求动态高度、示例内容相等。入口按钮位置、弹窗宽度、左右留白、搜索/缩略图结构、底部计数和主次操作已核对。

| 对照         | Figma                                             | 真实产品                                                             |
| ------------ | ------------------------------------------------- | -------------------------------------------------------------------- |
| 图库桌面浅色 | [画板](shortcuts-figma/library-desktop-light.png) | [截图](shortcuts-browser/library-shortcut-page-light-1440.png)       |
| 图库桌面深色 | [画板](shortcuts-figma/library-desktop-dark.png)  | [截图](shortcuts-browser/library-shortcut-page-dark-1440.png)        |
| 图库手机浅色 | [画板](shortcuts-figma/library-mobile-light.png)  | [截图](shortcuts-browser/library-shortcut-page-light-390.png)        |
| 图库手机深色 | [画板](shortcuts-figma/library-mobile-dark.png)   | [截图](shortcuts-browser/library-shortcut-page-dark-390.png)         |
| 上传桌面浅色 | [画板](shortcuts-figma/upload-desktop-light.png)  | [截图](shortcuts-browser/quick-upload-queued-light-1440-900.png)     |
| 上传桌面深色 | [画板](shortcuts-figma/upload-desktop-dark.png)   | [截图](shortcuts-browser/quick-upload-queued-dark-1440-900.png)      |
| 上传手机浅色 | [画板](shortcuts-figma/upload-mobile-light.png)   | [截图](shortcuts-browser/quick-upload-queued-light-390-844.png)      |
| 上传手机深色 | [画板](shortcuts-figma/upload-mobile-dark.png)    | [截图](shortcuts-browser/quick-upload-queued-dark-390-844.png)       |
| 选图桌面浅色 | [画板](shortcuts-figma/picker-desktop-light.png)  | [截图](shortcuts-browser/album-image-picker-real-light-1440-900.png) |
| 选图桌面深色 | [画板](shortcuts-figma/picker-desktop-dark.png)   | [截图](shortcuts-browser/album-image-picker-real-dark-1440-900.png)  |
| 选图手机浅色 | [画板](shortcuts-figma/picker-mobile-light.png)   | [截图](shortcuts-browser/album-image-picker-real-light-390-844.png)  |
| 选图手机深色 | [画板](shortcuts-figma/picker-mobile-dark.png)    | [截图](shortcuts-browser/album-image-picker-real-dark-390-844.png)   |

Figma 快捷流程的背景沿用简化查询展示，不是删除产品现有筛选、排序、布局和固定分页的授权。本轮对照重点为批准的新增入口、弹窗、选图和条件菜单，不声称全历史页面逐像素还原。

结构回读无弹窗越界、无可见文本溢出；文字、变量、实例及图标可编辑，没有压平界面。Figma API 不支持嵌套画板作为 NAVIGATE 目标，未声称播放器连线完成；可操作演示保留批准的 61510 本地原型。

失败反馈改为固定底栏上方后，第 13 组四张失败状态已同步；其余 72 张画板结构及 12 张正常 PNG 保持不变。最终失败稿：[桌面浅色](shortcuts-figma/picker-error-desktop-light.png)、[桌面深色](shortcuts-figma/picker-error-desktop-dark.png)、[手机浅色](shortcuts-figma/picker-error-mobile-light.png)、[手机深色](shortcuts-figma/picker-error-mobile-dark.png)。

## 预览与边界

真实产品：[http://127.0.0.1:3001/library](http://127.0.0.1:3001/library)。保留既有账号与数据，密码不写入版本化记录。原 3000 预览和 61510 原型均保留。

最终正式预览进程为 71385，健康接口实际返回 200。Ego TaskSpace 5 在正式 3001 页面核对既有 5 张图片、实际默认存储及可见性、打开并收起快捷上传、焦点返回“上传”，未新增或删除正式预览图片。保留正式图库页供用户继续验收，任务空间已完成；已提交在 Codex 内打开同一地址的请求，工具返回 `queued`，不将其视为已经显示。实际截图保留在忽略目录 `.data/main-ui-review-20261011/preview-shortcuts-r12.png`，不将既有预览内容加入版本化图片。

未执行完整默认浏览器套件；S3 协议、无关存储维护、发布容器及远端 CI 未在本轮重验。物理设备不是当前项目门槛，也未称实测。用户人工验收、提交、PR、合并、发布和资源清理尚未完成或未获授权。
