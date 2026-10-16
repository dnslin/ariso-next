# 搜索工具栏局部返修

2026-10-12 用户直接反馈：图库、相册详情和回收站的搜索框太长，操作按钮应在空间足够时与搜索框同行。随后用户用箭头截图明确：相册操作图标组与“添加图片”也应移至搜索行右端。本轮按最新澄清实施，不改查询、选择、批量操作或底栏行为。没有提交、推送或发布。

## 实施范围

- 图库和相册详情共用 `LibraryToolbar`，改为横向自然换行；搜索小于 640px 时占满一行，640px 起固定 280px。
- 相册标题、返回和图片数量保留原位置。原独立相册操作行移入共用工具栏右侧，空间足够时与搜索同行，不足时整体自然换行并靠右。
- 回收站沿用已有横向自然换行，只将搜索改为相同宽度规则。选择按钮紧随搜索框。
- 保留已有输入高度、控件顺序、图标、主题和分页。本轮没有新增组件或依赖。
- 3001 预览已按新构建重启，原数据和账号保留。只重启经过 PID、工作目录及监听端口核对的本任务预览。

## 验证

环境：macOS ARM64，Node24.18.1、pnpm11.19.0，Ego TaskSpace9。澄清前完整快捷操作场景使用运行器隔离数据；澄清后的最终布局检查使用 3001 实际预览，只读页面、切换选择和打开菜单，不作图片或相册业务写入。

| 实际命令                                                                                                                                                                                                                         | 结果                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                 | 通过，锁文件未变                                                                                 |
| `pnpm run lint` / `pnpm run typecheck`                                                                                                                                                                                           | 最新相册操作位置修改后复跑通过                                                                   |
| `pnpm run test:unit`                                                                                                                                                                                                             | 搜索收窄阶段 179 文件、2236 项通过，73.80 秒；不冒充澄清后全量复跑                               |
| `pnpm exec vitest run --project unit tests/unit/collections/album-shortcut-lifecycle.test.ts tests/unit/collections/page-refinement.test.ts tests/unit/collections/album-card.test.ts tests/unit/library/selection-menu.test.ts` | 最新相册位置修改后 4 文件、20 项通过，1.42 秒；新增标题与操作分离断言，原上传参数断言保留        |
| `pnpm run build`                                                                                                                                                                                                                 | 最新相册位置修改后复跑 exit 0；依赖追踪和 source map 解析警告保留，不作为失败隐藏                |
| `pnpm run format:check`                                                                                                                                                                                                          | 两份未修改的历史 `site-196/implementation/merge-theme/browser/*/*.json` 格式失败，未改写历史证据 |
| `node docs/tasks/check.mjs` / `--self-test`                                                                                                                                                                                      | 120 任务、298 需求及 5 个拒绝样本通过                                                            |
| `git diff --check`                                                                                                                                                                                                               | 通过                                                                                             |

新增 `e2e/search-toolbar-layout.mjs`，由既有图库快捷操作和回收站代表场景调用。检查三页普通/已选状态、浅深色、360/390/430/640/768/1024/1130/1280/1440px 宽度。验证搜索宽度、控件边界和空间足够时的中心线对齐；本轮不以截图数量替代人工对照。

### 浏览器结果

- 澄清前执行 `EGO_TASK_SPACE=9 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=.data/toolbar-20261012/browser-collections node scripts/verify-browser.mjs --suite collection-shortcuts --only menus`，完整快捷操作阶段与菜单阶段分别 5 项检查通过。该历史结果不冒充最新相册位置通过。
- 首轮 `--suite trash --only representative` 在已选状态等待浅色主题时超时。此前视觉场景手动设定了根主题，不能只依赖系统配色仿真来覆盖它。修正布局辅助脚本，使仿真配色和根主题明确一致；没有删除布局断言或修改产品主题行为。[原失败报告和截图](https://github.com/dnslin/ariso-next/blob/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/clarity-v3/toolbar-20261012/browser/history/trash-query-batch.json)保留。该代表套件没有完整重跑。
- 最新构建启动后执行 `ego-browser nodejs -e "$(cat .data/toolbar-20261012/verify-final.mjs)"`，[实际驱动脚本](https://github.com/dnslin/ariso-next/blob/975f63eeb3e9b19a0ace827ba3fe646565d5b2e2/docs/verification/m2-85/ui-refinement/20261011/clarity-v3/toolbar-20261012/browser/verify-final.mjs)使用相同布局辅助函数检查三个真实页面。最终 [report.json](https://github.com/dnslin/ariso-next/blob/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/clarity-v3/toolbar-20261012/browser/report.json) 为 `passed`，共 108 个布局、4 项行为检查。另验证相册返回与标题同排，添加菜单仍为“上传新图片 / 从图库选择”，每页选择及取消选择成功。
- 产品代码、单测和本轮浏览器模块的定向 `pnpm exec prettier ... --check` 通过。全仓格式检查的历史两份失败仍单独保留。

### 设计对照

人工查看三个页面的桌面、手机和已选代表图。相册以最新用户箭头截图为位置依据：搜索及查询控件靠左，相册图标组与添加图片在同一行右端；标题与返回保留。1440px 正常态和 1130px 已选态均可同排；390px 自然分为搜索、查询控件、右对齐相册操作三行。搜索、按钮和固定底栏未重叠。

最终真实截图见[相册桌面](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/clarity-v3/toolbar-20261012/browser/album-toolbar-idle-light-1440.png)、[相册手机](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/clarity-v3/toolbar-20261012/browser/album-toolbar-idle-light-390.png)、[相册已选1130px](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/clarity-v3/toolbar-20261012/browser/album-toolbar-selected-dark-1130.png)。图库和回收站继续保持本轮 280px 搜索与同行按钮规则。只对照本次改变的宽度、位置和自然换行，不把既有示例内容、输入高度或按钮尺寸差异扩展为整页重做，也不声明逐像素相等。

本轮没有复跑后端全量集成、默认全量浏览器套件或发布镜像。此前上传 API 截断 multipart 的 `ECONNRESET` 不因本轮样式变更而声明解决。

## Figma

[局部同步记录及节点截图](figma/README.md)覆盖原图库、相册详情、回收站主节点，以及当前 v3 回收站正常态。桌面搜索为 280px，原 12px 间距不变，首按钮从 x292 开始；390px 手机保留 358px 全宽及自然换行。没有新增状态帧或重画整页。

按用户最新澄清，相册原主节点还将既有图标组与添加图片移入搜索工具栏右端。桌面组合316px、手机组合324px，均贴工具栏右边缘；差异来自保留的既有响应式控件尺寸。旧相册搜索局部图不作为最终相册位置证据，最终以本目录 Figma 记录的后续合并截图为准。

Figma 静态画板仅表达桌面和手机两端，不声明拥有产品响应式断点行为或完成 Player 验收。

最终 Ego TaskSpace9 结束检查并保留 `p1` 的 3001 实际相册页面供用户验收。浏览器仿真不等于物理手机验证，用户最终人工验收仍待完成。
