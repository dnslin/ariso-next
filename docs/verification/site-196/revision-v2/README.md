# Issue #196 原型第二版返修

2026-10-10（Asia/Shanghai）。当前为**独立原型送审**，不是产品交付。新版 [4206](http://127.0.0.1:4206/) 与旧版 [4196](http://127.0.0.1:4196/) 都保持运行，均无需账号密码；刷新只重置内存示例。用户已对第一版答复“需要调整，保留当前原型”，本版已再次提交批准，尚未获得批准。

## 用户反馈与本版方案

| 用户反馈                   | 实际处理                                                                       | 边界                                                            |
| -------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| “使用 GitHub 登录”加图标   | 使用正式 `@gravity-ui/icons/LogoGithub` 16px 图标，图文居中                    | 保留按钮名称，图标为装饰；原型不发起OAuth                       |
| “图片，自在收纳。”没有必要 | 登录品牌区只保留Logo和站点名称                                                 | 不删除站点描述数据；后台、首页、分享的描述职责不变              |
| 品牌设置粗糙、空白过多     | 最大960px，一个HeroUI Card内两行资源；左预览、中信息、右操作，手机操作另起一行 | 去除列表重复的固定返回栏，预览继续固定取消/上传栏；新布局待批准 |

旧版源码与服务未覆盖。第二版源码在 `design-plans/issue196-brand-review-v2`，复用实际 `AdminShell`、`PublicShell`、`IdentityField` 与主题/Toast Provider。业务使用 HeroUI Card、Chip、Button、Skeleton、Form、AlertDialog；布局使用 Tailwind。演示控制栏用原有details/select，只用于切换模拟场景，不进入产品。

实际读取 `using-agent-skills`、`frontend-ui-engineering`、`vercel-react-best-practices` 和Figma技能；独立设计评审用 `improve-ui` 做只读问题与修订计划，由实施者执行，不混淆其只读角色。计划见 [revision-plan.md](../../../../design-plans/issue196-brand-review/revision-plan.md)。独立代码评审使用 `code-review-and-quality`。

已检查项目Lucide实际导出，没有Github图标。根据 handoff 允许的两种图标来源，读取Gravity官方文档及实际LogoGithub类型后，仅在第二版原型包增加 `@gravity-ui/icons@2.22.0`，采用深导入；根产品依赖未变。HeroUI Card/Chip组合及Skeleton实现均核对v3官方资料与安装类型，未引入另一套UI库。

## 设计依据与真实页面

本轮实际读取Figma文件 `74sT9Hrf8G4czcWeTkET5b` 的品牌主页 `468:11915 / 468:12216`、预览 `468:12278 / 468:12606`、登录 `2:11 / 102:3020` 信息和截图。品牌桌面1440×1080、手机390×844，登录桌面1920×960。本版保留公共外壳、颜色、字体、控件基础；单面板两行、登录品牌区和异常流程是明确列出的新提案，未声称旧Figma逐像素还原，Figma尚未写入。

独立评审按整页/公共区域在先、业务/控件在后的顺序实际对照，详见 [design-review.md](./design-review.md)。主要截图：

| 状态             | 桌面                                  | 手机/补充                                                                        |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| 品牌设置浅色     | [1440×1080](./settings-desktop.png)   | [390×844](./settings-mobile.png)、[360×800](./settings-360.png)                  |
| 登录浅色         | [1920×960](./login-figma-desktop.png) | [390×844](./login-mobile.png)                                                    |
| 深色             | —                                     | [设置](./settings-dark-mobile.png)、[登录](./login-dark-mobile.png)，390×844     |
| 素材缺失         | —                                     | [登录390×844](./login-missing-mobile.png)                                        |
| 短视口           | —                                     | [预览390×420](./preview-short.png)、[上传失败390×420](./upload-failed-short.png) |
| 删除核对仍有引用 | —                                     | [390×844](./delete-retained-mobile.png)                                          |

截图临时隐藏原型演示控制栏，未隐藏业务内容或错误；截图完成恢复控制栏。1299×865额外截图保留，不冒充Figma基准。

## 实际执行

环境：macOS、Node24.18.1、pnpm11.19.0、现有Ego Lite。独立原型不读取产品数据库、不创建账号、不调用产品API，文件选择只做浏览器Blob预览。

| 命令                                                                                         | 结果与证据                                                                                     |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm --dir design-plans/issue196-brand-review-v2 add --save-exact @gravity-ui/icons@2.22.0` | 完成；只增加原型importer与图标依赖                                                             |
| `pnpm install --frozen-lockfile`                                                             | 通过                                                                                           |
| `pnpm --dir design-plans/issue196-brand-review-v2 install --frozen-lockfile`                 | 通过                                                                                           |
| `pnpm exec next build design-plans/issue196-brand-review-v2 --webpack`                       | 通过；首轮后仅因手机分隔点和加载状态文字修正重跑受影响原型构建，[最终输出](./checks/build.txt) |
| `pnpm run lint`                                                                              | 通过，[输出](./checks/lint.txt)                                                                |
| `pnpm run typecheck`                                                                         | 通过，[输出](./checks/typecheck.txt)；独立原型自身类型检查由其Next构建执行                     |
| `pnpm run format:check`                                                                      | 通过，[输出](./checks/format.txt)                                                              |

首次第二版构建存在原型旧CSS构建缓存，先确认实际样式来源，再将本任务原型生成的`.next`移到临时目录后重建；未修改公共CSS，不以截图隐藏控制栏掩盖样式缓存。最终浏览器访问最终构建。

使用同一Ego TaskSpace5/p1实际执行下列观察与断言，未下载浏览器：

- 设置页1440×1080、768×1024、390×844、360×800、390×420无横向溢出；正常业务按钮至少44px；补430×844无溢出。浅深两端实际截图对照另由设计评审承接。
- 真实可访问树含未忽略的 `status` 与“正在读取品牌设置…”文字；读取失败后“重新读取”回正常素材列表。
- 两端登录没有站点描述，GitHub按钮包含正式图标；素材缺失显示可读错误，不静默回默认Logo。
- 通过Favicon行打开真实文件选择器，选择 `public/runtime.svg`，预览明确为Favicon；短视口提交后仅Favicon自定义，Logo仍内置。
- Logo上传失败保留文件名与预览；随后演示未知结果，取消和重复上传禁用；核对失败再核对后明确选择保留文件，继续上传成功。未自动重发写入。
- 删除确认Esc关闭，焦点回到“移除 Logo”；删除未知Esc不能关闭；核对仍有引用后必须明确使用服务器素材或再次移除，采用服务器素材保留Favicon。
- 删除被拒绝后取消，原素材仍保留。成功通知先实际关闭再进行下一对话框，未绕过点击命中检查。
- 390×420预览上传/取消固定操作区位于top356、bottom400、height44，键盘聚焦可达；实际上传、取消均可操作。Favicon按钮Tab到演示summary有清楚描边；未声称完成全键盘路径覆盖。

两次检查脚本错误保留诊断结论：可视snapshot不显示sr-only文本，首次加载断言因此失败，改用真实AX树核对同一必须存在的文字；一次使用不受支持的无名称 `loc=role:alertdialog` 导致脚本停止，查看当前实际对话框后用已观察的 `[role="alertdialog"]` 等待继续。均没有削弱产品断言或把脚本错误记作功能通过。

## 评审与完成边界

独立 [code-review.md](./code-review.md) 已通过，无遗留必改项；首轮发现的加载骨架屏缺少可读文字已修复并复审。独立 [design-review.md](./design-review.md) 三项返修通过，可交用户审阅。功能检查和设计结论分别记录。

第二版交互原型已完成、原型本地检查已执行、代表性原型浏览器检查已执行；**原型批准待用户决定**。产品代码未开始，产品全量单元/集成/构建/默认浏览器矩阵、真实品牌持久化与跨页联动、Figma写入、最终UI人工验收均未执行。AX树检查不等于读屏实测。原型账号不存在且无需登录，不编造产品验收凭证。

对应产品设计批准前继续保留Draft PR #277。两版预览、分支和worktree保留，Ego页面已交还用户审阅；没有合并、关闭Issue、发布、部署或清理。
