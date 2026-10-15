# 2026-10-15：TIFF 详情预览与大图切换按钮

本轮依据用户明确要求：删除首页“登录后进入你的工作空间。”，删除后台侧栏站点描述，检查截图中的 TIFF 预览失败，并让图库大图提供与相册分享相同形式的前后按钮。本记录补充既有交付，不改写历史验收结论。

## 实现与设计依据

- 首页只删除已初始化站点的登录说明，保留首页站点描述和首次初始化提示。后台桌面侧栏、手机菜单均不再渲染站点描述，清除失用样式；站点设置中的描述和页面 metadata 不变。
- 原因是详情页把 `image/tiff` 原文件当作可显示图片，选中原图后触发浏览器读取错误。详情自动选择已有可显示版本，有压缩版时继续按既有顺序使用压缩版，否则使用已有缩略图。显式选择 TIFF 原图时显示“此格式无法在浏览器中预览。”，保留原文件下载。没有增加转换任务、文件或依赖，也没有修改其他格式的选择规则。
- 大图在已知相邻图片存在时显示上一张/下一张按钮，沿用现有过滤、排序和跨页邻居查询。加载时禁用按钮，首尾不循环，直接链接打开的无列表上下文详情不添加相邻查询。关闭继续恢复原详情和列表状态。
- 用户本次指令取代历史“正常大图只有关闭控件”的要求。位置、56px 点击目标和32px Lucide Chevron 图标参照 `src/components/sharing/viewer.tsx`；颜色沿用图库当前主题，关闭按钮和图片舞台保持原实现。复用 HeroUI Button，没有新增通用控件实现。既有详情设计节点为桌面36:312 / 手机102:3228；本次用户截图及明确按钮要求是本轮调整依据，未修改 Figma。

## 已执行检查

工具链为 Node 24.18.1、pnpm 11.19.0。

| 命令                                                                                                                       | 结果                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                           | 通过，最终使用项目锁定工具链，锁文件未变                                                  |
| `pnpm run build`                                                                                                           | 最终构建退出0；输出既有的其他平台可选依赖追踪警告，实际 standalone 启动由集成和浏览器验证 |
| `pnpm run typecheck`                                                                                                       | 通过                                                                                      |
| `pnpm run lint`                                                                                                            | 通过；后续新增浏览器断言又运行修改文件的 ESLint，结果通过                                 |
| `git diff --name-only -z \| xargs -0 pnpm exec prettier --check`                                                           | 通过                                                                                      |
| `pnpm run test:unit`                                                                                                       | 最终189个文件、2352项通过                                                                 |
| `pnpm exec vitest run --project unit tests/unit/library/detail-preview.test.ts tests/unit/library/viewer-model.test.ts`    | 最终24项通过；新增TIFF两项在修复前失败、修复后通过                                        |
| `pnpm exec vitest run --project integration tests/integration/shell/home.test.ts tests/integration/library/detail.test.ts` | 最终11项通过                                                                              |
| `git diff --check`                                                                                                         | 通过                                                                                      |

构建初次因旧原型仍传入 AdminShell description 类型失败；保留输入类型、删除呈现后，最终构建和类型检查通过。一次修改文件 ESLint 命令误包含不由 ESLint 检查的 CSS，产生 ignored-file 警告；随后仅传入 TS/TSX/MJS 文件的检查通过。

## 浏览器记录

使用同一个 Ego TaskSpace 39，所有服务、数据库、账号及图片属于运行器创建的临时环境。没有修改生产数据。

TIFF、两主题五断点箭头布局、首尾按钮与焦点、跨页连续切换、鼠标/键盘缩放、模拟双指缩放和平移、滑动切图及错误恢复均已在真实 standalone 页面通过。完整运行随后复现了点击箭头后禁用按钮造成焦点离开查看器的问题；在箭头开始切换前聚焦图片舞台，修复后重新构建并执行 `node scripts/verify-browser.mjs --suite viewer --only pending-navigation`，结果通过。等待实际相邻响应期间，两按钮禁用、当前图片保持、连续方向键不重复切换，响应释放后只切换一次；等待中和成功后的焦点均在查看器内。

首轮浏览器部分证据在 `test-results/library-preview-navigation-20261015-final`；焦点返修后的定向完整通过记录在 `test-results/library-preview-navigation-20261015-pending-fixed`。焦点修复后未重跑整个查看器套件，不将前述失败轮记为全量通过。

随后执行 `node scripts/verify-browser.mjs --suite site-branding --only consumers`，通过22个后台入口在390/1440宽度的44次实际消费路由检查，包含手机菜单、桌面展开/折叠侧栏、当前导航、品牌变更后首页及metadata保留描述但不显示登录说明。运行器随后完成重启回读并恢复临时品牌数据。两项定向命令均使用 `EGO_TASK_SPACE=39` 与独立的 `BROWSER_REPORT_DIR`。

已保存[查看器焦点返修前记录](./browser/preview-navigation-20261015/viewer-before-focus-fix.json)、[焦点返修后记录](./browser/preview-navigation-20261015/viewer-pending-fixed.json)、[公共消费路由记录](./browser/preview-navigation-20261015/shell-consumers.json)和[重启回读](./browser/preview-navigation-20261015/shell-restart.json)。独立代码复核未发现尚未解决的问题。

实际截图已人工查看：大图[浅色手机](./browser/preview-navigation-20261015/library-viewer-navigation-buttons-light-390.png)/[深色桌面](./browser/preview-navigation-20261015/library-viewer-navigation-buttons-dark-1440.png)符合分享查看器左右居中箭头的结构，既有关闭控件及完整保比例舞台保留；[TIFF大图](./browser/preview-navigation-20261015/library-viewer-issue185-tiff.png)成功显示既有缩略图。[首页手机](./browser/preview-navigation-20261015/site-branding-home-first-390.png)、[桌面侧栏](./browser/preview-navigation-20261015/site-branding-shell-expanded-1440.png)和[手机菜单](./browser/preview-navigation-20261015/site-branding-shell-menu-390.png)分别确认登录说明、侧栏/菜单描述已删除，品牌、导航及用户区仍按既有布局呈现。图片为真实隔离资产与品牌夹具，不是替代真实页面的静态原型。

初轮在新箭头出现后被旧“仅关闭按钮”的断言阻断，已改为按有无浏览上下文精确断言按钮集合。第二轮双指缩小测试的旧起点落在新增箭头上；现将双指起点移至图片内，保留实际触摸、缩放、平移和切图断言。第三轮为停止已知旧手势脚本而主动中断，不计为通过。失败和中断报告保留在 `test-results/library-preview-navigation-20261015`、`-r2`、`-r3`。

## 交付边界

未发布、未部署，未运行全部集成测试或真实设备触控验收。浏览器响应式和模拟触控不记作物理设备实测。本轮仍需用户人工验收。
