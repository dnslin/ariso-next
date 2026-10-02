# Issue #185：大图查看、同图选版与上下文恢复

2026-10-02，T-LIB-07 / R-15.5-01 / LIBRARY-QUERY。依据 [SPEC-library §6](../../specs/SPEC-library.md#6-大图查看)、[设计交接](../../design/handoff.md)和[执行约定](../../tasks/execution.md)。本记录维护一次证据；PR 链接同一记录，不复制规则。

分支 `codex/issue-185-image-viewer`，关联[草稿PR #229](https://github.com/dnslin/ariso-next/pull/229)。本次人工反馈已改为图片占满视口、图标入口和单一关闭入口，已取得最终构建、分段浏览器复验和独立审计证据。两项范围外检查失败及返修后的最终人工验收仍未完成。未合并、未关闭Issue，保留分支和worktree。

## YARL 标准查看器与连续浏览返修（2026-10-02—03）

所有者确认继续使用 YARL，并要求在同一大图界面连续浏览图库和相册图片。本次移除 Inline 和外层 HeroUI Modal，使用 YARL 标准 Lightbox 的门户、背景滚动锁定、焦点、Esc、键盘和手势；Zoom 继续处理缩放和平移。正常界面保持全视口图片与单一44px关闭图标，没有恢复旧页眉、版本栏或工具栏。图库使用打开时规范化筛选和排序，相册使用既定加入顺序；业务衔接仍通过现有 neighbors 与 delivery，保持当前/前后各一张、有界预载和读取失败保留当前图。错误 AlertDialog 与 Lightbox 在 React 树保持同级，沿用迁移前的事件隔离边界。

实施者已重新实际读取 Figma `390:6943` / `390:6996` context 与截图；正常栏位由上述用户批准反馈覆盖。错误 `391:6787` / `391:6800` 继续适用，详情 `36:312` / `102:3228` 与公共外壳未改。YARL 仍为既有3.32.2；直接声明 HeroUI 已安装的 peer `react-aria@3.52.1`，复用其 FocusScope，不下载新组件包，不自写焦点循环。没有新接口、临时版本或冻结 PRD 修改。

浏览器沿现有生产专项测试执行，使用一次性 DATA_DIR，未修改用户预览数据。原 Ego 空间11已经不存在；新返修空间13为本轮唯一验证空间，不占用其他任务空间。图库新增真实19→20→21→22→23→24→23→24、完整筛选/排序和来源恢复断言；相册复用四张已有样本验证8→7→6→5→6、固定顺序及首尾不循环。

桌面1440×1080、手机390×844的浅深色入口与正常态代表检查已退出0，八图在[代表状态](./browser/yarl-native-representative/)。独立设计评审已实际逐图核对，未发现代表还原偏差。首轮[完整专项](./browser/yarl-native-final/library-viewer.json)保留失败：已完成图库19→24→23→24、四版本、动画和桌面缩放后，旧测试使用 `viewer-stage .yarl__container` 读取原 Inline 嵌套结构，标准门户下得到 null。修正测试为实际查看器中的图片容器，保留 `touchAction=none` 断言；没有调整生产手势、超时或弱化断言。修正后[行为专项](./browser/yarl-native-behavior/library-viewer.json)退出0，13条检查/29图；随后最终预览真实发现Tab问题，未将这些中间成功记录当作最终验收。历史记录只证明当时实现。

最终预览中第二次Tab落到BODY，随后Esc无法关闭，实际[修前证据](./browser/yarl-native-preview-final/focus-before-fix.json)保留；首轮预览脚本只记录Tab而未断言，因此其 `status=passed` 不能证明焦点约束。读取 YARL 标准门户与已安装 React Aria 的类型、实现及官方[FocusScope文档](https://react-aria.adobe.com/FocusScope)后，在YARL Portal/NoScroll内通过原生模块扩展包住Controller，使用 `FocusScope contain`。不添加autoFocus或restoreFocus，挂载聚焦与关闭归焦仍由已有YARL/详情处理；同级AlertDialog仍由其既有焦点范围处理。

修后[最终完整专项](./browser/yarl-native-focus-final/library-viewer.json)和[运行器](./browser/yarl-native-focus-final/runner.json)真实退出0：16条检查、53张截图、27项布局测量，包含360/390/430/768/1440浅深色、390/1440×400短视口、图库19→24→23→24与相册8→7→6→5→6。直达单图与跨页连续来源各三次Tab/三次Shift+Tab逐次实际焦点均在关闭BUTTON；随后真实Esc返回原详情入口。错误层ArrowLeft/Right不变当前src/id/version、不新增背景邻图请求；返回当前操作有效，再次真实失败后第一Esc仅关闭错误层、当前图片像素与查看器焦点保留，第二Esc返回详情。真实双指捏合、平移、来回滑动、缺尺寸、加载/空/错误、当前失效、迟到响应、解码失败、已删除来源、真实ready上传及255字短视口均通过；触控为Chromium仿真，非物理设备证据。

本轮实际环境为 macOS arm64、Node v24.18.1、pnpm 11.19.0、已有Ego Lite空间13，使用生产standalone构建和独立DATA_DIR。本轮命令与结果：

| 实际命令                                                                                                                                                                                                                                 | 结果与原始输出                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm add --offline --save-exact react-aria@3.52.1`                                                                                                                                                                                      | 退出0；只显式声明既有peer，无下载，[输出](./checks/yarl-native-focus-dependency.txt)。                                 |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                         | 退出0，[最终锁文件安装](./checks/yarl-native-focus-install.txt)。                                                      |
| `pnpm run format:check`                                                                                                                                                                                                                  | 最终退出0，[输出](./checks/yarl-native-focus-final-format.txt)。首轮格式失败保留并已修正。                             |
| `pnpm run lint` / `pnpm run typecheck`                                                                                                                                                                                                   | 退出0，[最终lint](./checks/yarl-native-focus-final-lint.txt)、[类型](./checks/yarl-native-focus-typecheck.txt)。       |
| `pnpm run test:unit`                                                                                                                                                                                                                     | 71文件/869测试通过，[输出](./checks/yarl-native-unit.txt)。                                                            |
| `pnpm exec vitest run --project integration --project media-tools tests/integration/library tests/integration/collections tests/integration/delivery/formats.test.ts tests/integration/runtime/ui-browser-runner.test.ts --maxWorkers=4` | 22文件/148测试通过，执行于构建之后，[输出](./checks/yarl-native-integration.txt)。                                     |
| `pnpm run build`                                                                                                                                                                                                                         | 最终退出0，[输出](./checks/yarl-native-focus-build.txt)；保留既有resvg其他平台可选原生模块追踪警告，不标为无警告构建。 |
| `EGO_TASK_SPACE=13 BROWSER_REPORT_DIR=docs/verification/library-185/browser/yarl-native-focus-final node scripts/verify-browser.mjs --suite viewer`                                                                                      | 最终完整专项退出0，[输出](./checks/yarl-native-focus-browser.txt)。                                                    |
| `node docs/tasks/check.mjs`                                                                                                                                                                                                              | 120任务/298需求，无缺ID或循环，[最终输出](./checks/yarl-native-focus-final-docs.txt)。                                 |

仅增加本次缺失的真实行为断言，保留失败证据；没有弱化断言、跳过测试或更改测试超时。全量集成水印日志requestId断言与统一浏览器旧Chip断言仍为此前实际失败，未在本轮重复运行、未改范围外路径。日常PR远端实际检查仍为空，不记CI通过；镜像/容器仅随Release流程验证，本次未发布或部署。真实打开期间会话过期及物理设备未实测；匿名查看器仍由#193承接。用户人工验收仍需执行。

保留给用户的同地址预览已更新至最终构建，数据保持不变。[最终预览报告](./browser/yarl-native-focus-preview-final/report.json)及[执行输出](./checks/yarl-native-focus-preview.txt)退出0：桌面1440×1080/手机390×844浅深色实际入口与正常态共八图，图标入口44px并与同页既有版本图标尺寸一致；满视口图片、单一关闭、实际命中及四端Esc回焦均通过。真实六次正反Tab保持关闭BUTTON，随后Esc关闭；真实邻图失败的第一次Esc保留当前src与查看器焦点，第二次Esc回详情。可查看[桌浅](./browser/yarl-native-focus-preview-final/ready-light-1440.png)、[手浅](./browser/yarl-native-focus-preview-final/ready-light-390.png)、[桌深](./browser/yarl-native-focus-preview-final/ready-dark-1440.png)、[手深](./browser/yarl-native-focus-preview-final/ready-dark-390.png)；入口同目录 `entry-*`。最终对照Figma节点与逐项视觉结论由[独立设计评审](./design-review.md)统一记录。

独立[代码审计](./code-audit.md)最终Critical 0、未解决Required 0，已实际读取源码、依赖锁文件、修前BODY/Esc失败及最终严格焦点报告。独立[设计评审](./design-review.md)实际读取对应Figma并查看最终八张预览与各适用业务状态截图，分别给出功能通过、视觉无本次未解决偏差的结论。两者不代替用户人工验收，PR继续草稿，未合并或关闭Issue。首轮[格式检查](./checks/yarl-native-focus-format-initial.txt)因五份新增证据/审计记录格式失败，保留结果；仅格式化本次改动文件和新证据，不改变报告值。

## 人工反馈后的简化查看器（2026-10-02）

所有者明确要求入口“用图标去展示”，大图“整个页面都是图片”，“只需要……一个关闭按钮……或者通过 Esc 去关闭”。按本次明确指令实施，已同步[设计交接](../../design/handoff.md#管理大图人工反馈调整2026-10-02)、SPEC §6 和原任务卡，冻结 PRD 未修改。

- 共用详情标题旁以44px HeroUI 图标按钮和Lucide Expand打开大图，保留可读名称“查看大图”和 Tooltip；实际SVG桌面16×16、手机20×20，与既有版本图标沿同一HeroUI ghost响应式样式。图库、相册和上传结果继续共用同一入口。
- 正常大图舞台覆盖整个真实视口，不再保留文件名、版本栏、版本资料、提示语、底栏或系统Fullscreen按钮。仅右上44px HeroUI CloseButton，保留安全区和清楚焦点。
- 图片按真实比例完整显示，至少一轴占满可用视口；不裁切、不拉伸。缩放、平移、键盘左右和滑动切图沿成熟YARL；同图四版本在既有详情选择，大图继承明确选择，关闭恢复原详情选择/滚动/焦点。
- 必要错误说明与恢复操作仅在实际失败时出现。取消、迟到响应、失效内容、跨页查询和三张预载边界保留。

旧Figma正常390:6943 / 390:6996、放大391:6682 / 391:6735的页眉/版本/资料/底栏按以上明确指令移除，旧系统全屏位置待批准项不再适用。详情36:312 / 102:3228的查看入口改图标，其他已批准公共区域不变；错误391:6787 / 391:6800继续适用。实施者重新实际读取正常节点的设计信息和截图；独立设计评审重新实际读取详情与错误节点，并检查本轮真实截图。此设计调整依据本轮明确反馈，返修页面仍需再次人工验收。

代表核对见[手机结果](./browser/ui-feedback-representative/mobile-report.json)、[桌面截图](./browser/ui-feedback-representative/ready-light-1440.png)、[手机截图](./browser/ui-feedback-representative/ready-light-390.png)及[图标入口桌面](./browser/ui-feedback-representative/entry-light-1440.png)/[手机](./browser/ui-feedback-representative/entry-light-390.png)。实测舞台分别0/0/1440×1080、0/0/390×844，正常控件只有关闭SVG，入口44×44，关闭可命中，Esc关闭后回焦。手机4:3图片实际绘制390×292.5，上下留白来自完整保比例。独立代表评审未发现本轮偏差。连续主题/视口代表检查两次等待失败保留[首轮](./checks/ui-feedback-representative-initial.txt)与[阶段记录](./checks/ui-feedback-representative.txt)；聚焦手机重新实际通过，未把前两轮记录记作全量通过。

代码审计发现两个相关边界：版本尺寸均空时成功解码仍不能缩放；版本单边尺寸空时混用原图尺寸会导致纵向平移范围错误。先在独立预览数据实际复现，见[双空失败](./checks/ui-feedback-missing-dimensions-before-fix.txt)及[单边空失败](./checks/ui-feedback-partial-dimensions-before-fix.txt)，均有真实接口和图片解码结果。初次夹具只改objects、版本表仍有尺寸，记录在[夹具核对](./checks/ui-feedback-dimensions-setup-initial.txt)，不作为缺尺寸失败证据。修复只在展示层取得成功解码的整对天然尺寸，解码尺寸记录最多三条，写入时按相邻窗口剪除，随查看器卸载释放；不混拼原图尺寸，不修改持久化资料或接口。

完整浏览器首轮发现静态预览的 `aria-description` 未被现有 HeroUI Dialog 输出，见[失败记录](./browser/ui-feedback-preview-label-initial/library-viewer.json)；现已用实际可访问名称“大图查看（静态预览）”声明。正常画面不因此增加可见说明。

随后实际复现新增入口 Tooltip 在桌面缩至手机时保留旧定位：页面宽390px，提示仍在left1071.95px，导致scrollWidth1100px、visualViewport缩小。见[缩屏失败页与截图](./browser/ui-feedback-tooltip-resize-before-fix/library-viewer.json)。读取已安装 ReactAria `useOverlayPosition`，确认其打开期间遇到 visualViewport scale 改变会冻结位置；只为本次新增 Tooltip 使用现有受控开关，在窗口变化时关闭提示，保留入口焦点，卸载时释放监听。既有版本入口未改。

下一轮已通过上述修复和两类尺寸边界，停在双指测试的放大前置，见[真实失败记录](./browser/ui-feedback-pinch-precondition-initial/library-viewer.json)。390×844下实际scale1.92028，完整横图高度仍小于视口，不能据此断言纵向平移。调整真实双指移动距离以形成可平移区域，保留“两个绘制轴均超过视口”和双轴平移断言；未增加超时或修改生产手势算法。

随后实际双指scale3.74454、横移60px/纵移30px、捏回1倍及来回滑动均通过，见[行为及加载前置失败记录](./browser/ui-feedback-loading-precondition-initial/library-viewer.json)。该轮加载断言失败的原因是先在详情读取水印后再以同URL打开大图，浏览器直接复用已解码图像；不能把没有实际加载的前置记作加载通过。加载验证改用未读取过的独立图像和真实延迟网络。

最终预览脚本先后将SVG统一要求为20px/16px，分别在桌面/手机实测失败，见[桌面测量](./browser/ui-feedback-icon-measure-initial/report.json)与[手机测量](./browser/ui-feedback-mobile-icon-measure-initial/report.json)。读取现有HeroUI Button CSS，确认 `size-5 sm:size-4`，实际为手机20px、桌面16px；旁边既有版本按钮相同。最终检查直接对照两枚真实图标的宽高并记录，44px点击目标不变，不为测量假设修改公共设计。

最终构建的独立预览检查已退出0，见[实际记录](./browser/ui-feedback-preview-final/report.json)及[命令输出](./checks/ui-feedback-preview.txt)。入口与正常态的1440×1080、390×844浅深色共八张最终截图及逐项设计对照在[独立设计评审](./design-review.md#用户人工反馈后的独立复核)。图标实测桌面16px、手机20px，与相邻版本图标一致；44px命中、满视口舞台、最大完整保比例、正常唯一关闭及真实Esc回焦均已检查。

本轮浏览器按已有定向入口分段完成，未机械重复已通过场景，也未改写失败整轮的状态：

- 五宽度360/390/430/768/1440浅深色、390/1440×400短视口、四版本继承/默认外链独立、GIF/APNG实际多帧、SVG/HEIC静态预览与显式错误、禁用及Tooltip缩屏的成功断言在[最后一次完整尝试](./browser/ui-feedback-loading-precondition-initial/library-viewer.json)。该命令整体退出1，停在上述已修正的加载前置，不称完整命令通过。
- `--only behavior` 实际退出0，13条检查、29张截图，见[业务结果](./browser/ui-feedback-final/library-viewer.json)、[运行器](./browser/ui-feedback-final/runner.json)和[输出](./checks/ui-feedback-browser.txt)。覆盖跨页/首尾/三张预载、关闭详情/列表上下文恢复、鼠标与键盘/双指缩放平移、两类缺尺寸、真实加载/空/错误/失效、decode失败、迟到响应、真实删除、相册与真实ready上传、255字名称360×400。
- 代码审计另要求加载成功后实际确认Skeleton消失。补原10秒时限的DOM隐藏断言，并按现有模式增加 `--only recovery`，只复验既有恢复函数。该命令实际退出0，3条检查、17张截图，见[最终恢复结果](./browser/ui-feedback-loading-final/library-viewer.json)、[运行器](./browser/ui-feedback-loading-final/runner.json)和[输出](./checks/ui-feedback-loading-final.txt)。独立新图的实际200响应保持原内容，详情naturalWidth0时打开大图确有骨架；释放后WebP正文16180字节、实际transfer16480、自然解码及 `skeletonHidden: true`，没有伪造成功响应。

| 适用状态 / 对照依据                             | 本轮最终实际页面                                                                                                                                                                                                                                                                                                                           | 结论                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 正常与入口 / 用户明确调整，详情36:312、102:3228 | [桌浅入口](./browser/ui-feedback-preview-final/entry-light-1440.png)、[手深入口](./browser/ui-feedback-preview-final/entry-dark-390.png)、[桌浅大图](./browser/ui-feedback-preview-final/ready-light-1440.png)、[手深大图](./browser/ui-feedback-preview-final/ready-dark-390.png)                                                         | 整页及公共区一致；图标风格相同，舞台覆盖视口，只有关闭。其余主题组合见同目录和设计评审。      |
| 邻图失败 / 391:6787、391:6800，两端浅深         | [桌浅](./browser/ui-feedback-final/library-viewer-adjacent-error-light-1440.png)、[手深](./browser/ui-feedback-final/library-viewer-adjacent-error-dark-390.png)                                                                                                                                                                           | 保留当前像素，480/358px错误对话框及原字体/间距/操作；没有恢复旧正常栏位。其他两端主题同目录。 |
| 真实加载 / 390×844                              | [响应暂停](./browser/ui-feedback-loading-final/library-viewer-real-delivery-loading-390.png)                                                                                                                                                                                                                                               | 满视口Skeleton与关闭；原内容释放后真实解码且遮罩消失。                                        |
| 缺内容、无版本与失效 / 两端浅深及实际状态       | [内容错桌浅](./browser/ui-feedback-final/library-viewer-delivery-error-light-1440.png)、[无版本手深](./browser/ui-feedback-final/library-viewer-no-readable-version-dark-390.png)、[停用](./browser/ui-feedback-final/library-viewer-current-storage-disabled.png)、[删除](./browser/ui-feedback-final/library-viewer-current-deleted.png) | 仅真实失败出现必要原因与恢复操作，当前内容移除，无隐式换版；其余主题及回收/删除中状态同目录。 |
| 放大与短视口 / 用户明确调整                     | [双指/平移](./browser/ui-feedback-final/library-viewer-touch-pinch-pan.png)、[360×400长名](./browser/ui-feedback-final/library-viewer-long-name-360-short.png)                                                                                                                                                                             | 图片按整个视口裁切，关闭可达；长名不占用大图空间，Esc可返回。                                 |
| 全部已实现消费者 / 共用LibraryDetail            | [相册1440浅](./browser/ui-feedback-final/library-viewer-album-consumer-1440.png)、[上传390浅](./browser/ui-feedback-final/library-viewer-upload-consumer-390.png)                                                                                                                                                                          | 与图库同一查看器；相册真实独立顺序，上传明确缩略图且无伪造邻居上下文。                        |

环境沿本记录：macOS ARM64、Node24.18.1、pnpm11.19.0、现有真实媒体工具、Ego Chromium152，同一TaskSpace11，独立DATA_DIR。没有新增依赖或下载浏览器。

| 本轮实际命令                                                                                                                                                          | 结果 / 证据                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                      | 退出0，[安装](./checks/ui-feedback-install.txt)                                                                    |
| `pnpm run test:unit`                                                                                                                                                  | 71文件、869项通过，[单测](./checks/ui-feedback-unit.txt)；后续仅展示层及实际浏览器测试修正，模型未改               |
| `pnpm run build`                                                                                                                                                      | 最终生产源码退出0，[构建](./checks/ui-feedback-build.txt)；其他平台可选原生包nft警告保留                           |
| `pnpm run typecheck` / `pnpm run lint`                                                                                                                                | 退出0，[类型](./checks/ui-feedback-typecheck.txt)、[静态检查](./checks/ui-feedback-lint.txt)                       |
| `pnpm run format:check` / `node docs/tasks/check.mjs` / `git diff --check`                                                                                            | 均退出0；文档检查120任务/298需求，见[格式](./checks/ui-feedback-format.txt)、[文档](./checks/ui-feedback-docs.txt) |
| `EGO_TASK_SPACE=11 BROWSER_REPORT_DIR=docs/verification/library-185/browser/ui-feedback-final node scripts/verify-browser.mjs --suite viewer --only behavior`         | 退出0，13条行为检查，29张实际截图                                                                                  |
| `EGO_TASK_SPACE=11 BROWSER_REPORT_DIR=docs/verification/library-185/browser/ui-feedback-loading-final node scripts/verify-browser.mjs --suite viewer --only recovery` | 退出0，3条恢复检查，17张实际截图，包含新增Skeleton隐藏断言                                                         |
| `ego-browser nodejs < /private/tmp/ariso-185-feedback-final-preview.mjs`                                                                                              | 最终构建四种主题/视口入口与正常态、Esc回焦退出0；[八图与实测](./browser/ui-feedback-preview-final/report.json)     |

独立[代码审计](./code-audit.md)和[设计评审](./design-review.md)分别记录本轮结论。自动功能检查和设计复核不替代用户人工验收。统一集成水印日志requestId断言及统一浏览器旧Chip断言仍按历史记录保留失败，未改范围外路径，未再重复这两项已知失败检查；日常远端PR没有实际检查，不记CI通过。真实会话过期、物理设备及Release镜像/容器仍未执行，匿名查看器由#193承接。

[独立本地验收服务](http://ariso-185-62014.localhost:62014/library)已更新最终构建，沿原独立数据 `/private/tmp/ariso-185-preview-F6s53v/data`。已实际执行 `ego-browser nodejs < /private/tmp/ariso-185-final-handoff.mjs`，退出0；[交回记录](./browser/ui-feedback-preview-final/handoff.json)及[输出](./checks/ui-feedback-handoff.txt)确认同一空间p1保留图库来源查询、1440×1080浅色大图并已交回用户。再次人工检查图标入口及图片/关闭体验。没有收到本轮最终人工通过，PR继续草稿；本地预览不是部署。

## 首次交付的历史证据

以下记录描述人工反馈前的实现、设计比较与检查结果；正常栏位和系统Fullscreen的结论已由上面的明确调整替代。保留原始通过/失败记录，不把历史结果冒充返修后的验收。

## 范围与前置

[Issue #185](https://github.com/dnslin/ariso-next/issues/185) 没有评论。通过 `gh api` 读取原生 blocked_by：#173、#171、#75、#131 均 CLOSED；blocking 为尚未实施的匿名查看器 #193。原始回读见 [Issue](./github.json)、[前置](./prerequisites.json)、[消费关系](./consumers.json)。本次无前置阻塞，不实施匿名分享。

从 `origin/main` 的 `e188562` 创建 `codex/issue-185-image-viewer`。原目录正在供其他任务使用，保持原工作区，使用独立 worktree：`/Volumes/data/project/ariso/test-results/worktrees/issue-185`。初始 `/private/tmp` 路径触发既有日志单测的文字断言，移动并 `git worktree repair` 后全量单测通过；未改该测试或日志行为。

共用 `LibraryDetail` 提供资料区48px“查看大图”入口，供图库、相册内容和上传结果消费。查看器按需加载 YARL 3.32.2，复用已选实验方案的 Inline、Zoom、Fullscreen，沿用 HeroUI Modal / Tabs / Button / Tooltip / AlertDialog 与现有语义主题、Lucide 图标。公共 OwnerShell、品牌、账号、导航和面包屑没有本次修改。

- 静态图自动 compressed → 可显示 original → thumbnail；动画优先 original；SVG、preview_only 等沿已有 thumbnail 并标明静态预览。显式选版不因缺失、网络或解码错误回退。
- 使用现有 neighbors API 和打开时的规范化查询。当前与前后各一张构成有界窗口，按需跨页、首尾不循环，不改底层列表页码、布局、选择或 URL。直达详情和上传结果无列表上下文，仅看当前。
- 缩放、平移、键盘、触摸和支持时的系统全屏交由成熟插件。非支持环境隐藏系统全屏按钮，保留满视口查看器。下载继续留详情，没有分享、下载或幻灯片按钮。
- 当前移入回收、开始删除、清理失败、永久删除或存储停用时移除可读内容并说明原因；已知邻居可继续浏览。邻居读取/解码失败保留当前图并明确返回/关闭；取消和迟到响应不替换当前身份。
- 关闭查看器返回原详情，恢复详情正文滚动与入口焦点；再关闭详情恢复原列表位置与来源卡片。来源已移除时回工具栏搜索控件。

查阅了已安装 YARL 插件类型和实现，以及官方 [文档](https://yet-another-react-lightbox.com/documentation)、[Zoom](https://yet-another-react-lightbox.com/plugins/zoom)、[Fullscreen](https://yet-another-react-lightbox.com/plugins/fullscreen)、[自定义模块](https://yet-another-react-lightbox.com/advanced)。没有新后端接口、schema、临时版本生成、兼容层或图片优化代理。

## 设计与状态证据

实施者和独立设计评审者均实际读取 Figma context 与截图。文件为 `74sT9Hrf8G4czcWeTkET5b`。桌面1440×1080、手机390×844；其他宽度按现行响应式规则验证。浅深色沿既有主题，不自建配色。

| 范围         | Figma 节点                                                                                                                                                          | 实际证据与结论                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 正常查看器   | [390:6943](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6943) / [390:6996](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6996) | [首轮桌浅](./browser/representative/library-viewer-ready-light-1440.png)、[手浅](./browser/representative/library-viewer-ready-light-390.png)、[桌深](./browser/representative/library-viewer-ready-dark-1440.png)、[手深](./browser/representative/library-viewer-ready-dark-390.png)。舞台桌面220/152/1000×750、手机16/226/358×268.5符合原稿。首轮发现底栏按钮未铺满、默认字重偏重，已修正，最终复核另记。 |
| 详情入口     | [36:312](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=36-312) / [102:3228](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3228)     | [桌浅](./browser/representative/library-viewer-entry-light-1440.png)、[手浅](./browser/representative/library-viewer-entry-light-390.png)、[桌深](./browser/representative/library-viewer-entry-dark-1440.png)、[手深](./browser/representative/library-viewer-entry-dark-390.png)。恢复原资料区第一列48px文字按钮；保留#171已批准的标题旁版本入口。                                                         |
| 放大         | [391:6682](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6682) / [391:6735](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6735) | 中间按钮按原稿显示“还原”，回到1倍；实际鼠标/键盘/双指/双轴平移结果待完整浏览器记录。                                                                                                                                                                                                                                                                                                                         |
| 邻图读取失败 | [391:6787](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6787) / [391:6800](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6800) | 复用480px/手机屏宽减32px、24px内边距、16px间隔和48px按钮，保留真实诊断原因。最终截图与逐项验收待补。                                                                                                                                                                                                                                                                                                         |

原始截图保存在 [figma](./figma/)，详细独立对照见 [设计评审](./design-review.md)。加载、版本不可用、状态失效和短视口沿上述容器/主题组合，不宣称有单独新画板。系统全屏44px图标位于“关闭”左侧，这是原稿未指定的位置；已向用户提供实际手机截图请求明确批准，尚未获批。最终整体界面仍须用户人工验收，PR 保持草稿。

最终对照入口如下。首轮及中间失败证据继续保留，不倒改历史结论。

| 状态 / 视口主题                        | 最终实际证据                                                                                                                                                                                                                                                                                                                                                                | 对照结果                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正常 / 1440×1080、390×844浅深          | [桌浅](./browser/final-scope/library-viewer-ready-light-1440.png)、[手浅](./browser/final-scope/library-viewer-ready-light-390.png)、[桌深](./browser/final-scope/library-viewer-ready-dark-1440.png)、[手深](./browser/final-scope/library-viewer-ready-dark-390.png)                                                                                                      | 舞台位置/比例、四版本、三列48px底栏、字重与行高已按主节点修正；独立逐项结论见设计记录。                                                                 |
| 详情入口 / 两端浅深                    | [桌浅](./browser/final-representative/library-viewer-entry-light-1440.png)、[手浅](./browser/final-representative/library-viewer-entry-light-390.png)、[桌深](./browser/final-representative/library-viewer-entry-dark-1440.png)、[手深](./browser/final-representative/library-viewer-entry-dark-390.png)                                                                  | 资料区48px文字入口及公共外壳沿原实现；不把标题版本入口恢复成旧位置。                                                                                    |
| 放大 / 1440×1080、390×844              | [桌面](./browser/design-final/library-viewer-zoom-1440.png)、[手机双指平移](./browser/final-scope/library-viewer-touch-pinch-pan.png)                                                                                                                                                                                                                                       | 中间操作“还原”，放大裁切为直角、还原12px；实际键盘/鼠标/双指/双轴结果均有证据。                                                                         |
| 邻图错误 / 两端浅深                    | [桌浅](./browser/design-final/library-viewer-adjacent-error-light-1440.png)、[手浅](./browser/design-final/library-viewer-adjacent-error-light-390.png)、[桌深](./browser/design-final/library-viewer-adjacent-error-dark-1440.png)、[手深](./browser/design-final/library-viewer-adjacent-error-dark-390.png)                                                              | 480/358px宽、p24、gap16；修正默认额外margin和投影。20/30标题、14/21正文、13/19.5说明。真实错误原因追加12px行，卡片356px高；不删诊断信息凑静态样例高度。 |
| 加载 / 手机浅色                        | [实际delivery等待](./browser/final-scope/library-viewer-real-delivery-loading-390.png)                                                                                                                                                                                                                                                                                      | 同尺寸Skeleton保留舞台，等待没有冒充成功。                                                                                                              |
| 内容错误、无可读版本 / 两端浅深        | [内容错误桌浅](./browser/final-scope/library-viewer-delivery-error-light-1440.png)、[手深](./browser/final-scope/library-viewer-delivery-error-dark-390.png)、[无版本桌深](./browser/final-scope/library-viewer-no-readable-version-dark-1440.png)、[手浅](./browser/final-scope/library-viewer-no-readable-version-light-390.png)                                          | 当前版本原因、禁用及重试明确；没有隐式换版。其余两端主题在同目录，完整断言在JSON报告。                                                                  |
| 来源失效 / 实际持久化状态              | [停用](./browser/final-scope/library-viewer-current-storage-disabled.png)、[回收](./browser/final-scope/library-viewer-current-trashed.png)、[删除中](./browser/final-scope/library-viewer-current-deleting.png)、[删除后](./browser/final-scope/library-viewer-current-deleted.png)、[回工具栏焦点](./browser/final-scope/library-viewer-deleted-source-toolbar-focus.png) | 下一次真实状态读取移除内容，原因保留；已知邻居仍可导航，消失来源不留失效卡片。                                                                          |
| 短视口、长名称 / 390/1440×400、360×400 | [手机短](./browser/final-scope/library-viewer-short-390.png)、[桌面短](./browser/final-scope/library-viewer-short-1440.png)、[255字名称](./browser/final-scope/library-viewer-long-name-360-short.png)                                                                                                                                                                      | 名称不撑开固定页眉；版本/底栏和关闭可达，详情正文及原列表滚动恢复。                                                                                     |
| 实际消费者 / 相册1440、上传390浅色     | [相册](./browser/design-final/library-viewer-album-consumer-1440.png)、[上传](./browser/design-final/library-viewer-upload-consumer-390.png)                                                                                                                                                                                                                                | 共用查看器；相册按加入顺序，上传明确版本与无邻居上下文。真实上传格式大小写已覆盖WebP，截图等弹层入场结束后采集。                                        |

“成功”对应正常内容读取、导航、还原和返回；查看器没有保存表单或额外成功Toast。空/禁用对应无可读版本及首尾；没有图片列表时本身没有大图入口。360/390/430/768/1440两主题的正常布局均在最终专项记录，物理设备未执行按现有共用约定处理。

## 实际验证

环境：macOS ARM64，Node 24.18.1、pnpm 11.19.0、现有 ImageMagick 7 / ExifTool、Ego Lite。浏览器使用同一 TaskSpace 11，独立临时数据库、真实图片和临时存储，未修改用户预览数据。网络命令只在当前进程设置本机代理；本地服务绕过 localhost、127.0.0.1、::1、.localhost。

| 实际命令                                                                                                                                                         | 结果 / 原始输出                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                 | 通过，[install.txt](./checks/install.txt)                                                                                                                                                           |
| `CI=true pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                              | 通过，[ui-install.txt](./checks/ui-install.txt)，供项目统一浏览器入口使用                                                                                                                           |
| `pnpm run test:unit`                                                                                                                                             | 71文件 / 869项通过，[unit.txt](./checks/unit.txt)；含25项新增默认选版、不可用、邻居查询、严格解码和取消测试                                                                                         |
| `pnpm run build`                                                                                                                                                 | 通过，[build.txt](./checks/build.txt)；nft 对其他平台未安装的可选原生包报追踪警告，当前平台构建成功                                                                                                 |
| `EGO_TASK_SPACE=11 BROWSER_REPORT_DIR=docs/verification/library-185/browser/representative node scripts/verify-browser.mjs --suite viewer --only representative` | 首轮8张真实代表截图及几何检查通过，[runner](./browser/representative/runner.json)、[业务报告](./browser/representative/library-viewer.json)。独立评审发现的设计问题已修正，此首轮不作为最终设计通过 |

最终 `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck` 均退出0，见[格式](./checks/format-check.txt)、[lint](./checks/lint.txt)、[类型](./checks/typecheck.txt)。UI实验 `pnpm --dir tests/experiments/ui run typecheck` 退出0，见[实验类型](./checks/ui-typecheck.txt)，其build已由统一入口实际完成。`node docs/tasks/check.mjs` 已通过120任务、298需求的结构检查，见[文档检查](./checks/docs.txt)；`git diff --check` 退出0。

稳定构建后的 `pnpm run test:integration --maxWorkers=4` 执行116文件、1067项，1061通过、6失败，见[全量集成](./checks/integration.txt)。原断言和时限不变，仅重跑四个失败文件：

```text
pnpm exec vitest run --project integration --project media-tools tests/integration/analytics/count.test.ts tests/integration/media/metadata.test.ts tests/integration/media/svg.test.ts tests/integration/media/watermark-http.test.ts --maxWorkers=1
```

结果39项中的38项通过，见[失败文件重跑](./checks/integration-failed-recheck.txt)。5个5000ms超时在单worker重跑通过；水印资源限制的日志 `requestId` 断言仍失败，定位 [watermark-http.test.ts:230](../../../tests/integration/media/watermark-http.test.ts#L230)。422响应、真实资源限制原因、数据库诊断和资产清理断言已执行到该处。本次未修改该测试、媒体服务、CLI或Docker代码；没有另外在main运行，不声称已证明基线原因。范围外问题只报告，PR保留草稿。另一个 HTTP 相关聚焦重跑的5项通过，见[HTTP重跑](./checks/integration-http-recheck.txt)。

初轮集成环境运行已中断并保留[输出](./checks/integration-initial-environment.txt)，不是通过。初始worktree路径误触发的单测失败保留[输出](./checks/unit-initial-path.txt)。未弱化断言、增加超时、删除或跳过失败测试；已销毁的临时初始化码在日志中遮盖，诊断路径和原因保留。

`EGO_TASK_SPACE=11 BROWSER_REPORT_DIR=test-results/browser-final pnpm run test:browser` 已实际执行，外壳及UI实验构建成功；运行时首页、公共外壳、1440px初始化/重启和M2桌面记录通过。统一入口在既有 [interaction-polish-1440](./browser/unified/interaction-polish-1440.json) 失败：`e2e/interaction-polish.mjs:90` 要求权限触发器内仍有 `[data-slot="chip"]`，与设计交接中#176已批准的单层胶囊不一致。该脚本及 `access-disclosure.tsx` 相对origin/main无本次差异，未修改它们或恢复旧设计。见[统一运行器](./browser/unified/runner.json)及[命令输出](./checks/browser-unified.txt)。入口失败后的后续全量场景没有执行，不标通过；本次完整大图专项另外取得证据，不能将其代替统一入口通过。

`EGO_TASK_SPACE=11 BROWSER_REPORT_DIR=docs/verification/library-185/browser/final-scope node scripts/verify-browser.mjs --suite viewer` 已退出0，完整专项14项检查通过，留存49张真实截图。见[运行器](./browser/final-scope/runner.json)、[业务断言与几何](./browser/final-scope/library-viewer.json)、[命令输出](./checks/browser-final-scope.txt)。包含真实四版本/GIF与APNG多帧/SVG与HEIC预览、19→20→24跨页、3张窗口、未改底层URL/选择/布局/滚动、真实删除/失效/读取及解码失败、迟到响应、缩放/平移/Fullscreen与降级、相册及真实ready上传、255字名称。

最后两处纯视觉修正后，在最终构建的独立验收服务执行 `ego-browser nodejs < /private/tmp/ariso-185-design-recheck.mjs`，只复验邻图错误和两个真实消费者，退出0；[结果](./browser/design-final/recheck.json)及[输出](./checks/browser-design-recheck.txt)保留六张稳定截图和实际字体/投影/间距/视口。上传新增断言实际得到“缩略图 · WebP · 0.3 KiB · 静态预览”。另实际点击放大/还原补[桌面放大几何](./browser/design-final/desktop-zoom.json)与截图，stage220/152/1000×750、直角、图宽2000。未机械重跑已经通过的完整专项。

## 审计与剩余边界

独立代码审计使用 code-review-and-quality，最终结论通过：Critical 0、未解决Required 0，见[审计记录](./code-audit.md)。本次十项发现已修正，包含严格解码、初开焦点、双轴触摸、原生全屏错误层、清理失败原因、删除来源剪除、读取中重复方向键、切图按钮禁用后的焦点及长名称。最终专项已取得完整实际回归；中间[业务状态记录](./browser/behavior-remaining/library-viewer.json)在消费者测试错误处失败，历史结论仍保留。

[相册及真实上传消费者](./browser/consumers-initial/library-viewer.json)已通过；相册使用固定加入顺序8→7和真实album-only邻居，上传队列由真实接受/处理完成后进入详情，明确缩略图且不请求邻居。该轮255字长名称在360×400把版本/底栏挤出视口，已留[失败截图](./browser/consumers-initial/library-viewer-long-name-360-short.png)。查看器名称改为单行省略，DOM及title保留全文，详情完整换行不变；实际复核在最终记录中维护。

独立设计评审实际读取节点和真实截图，首轮未通过的底栏、字重、行高、放大裁切、错误间距/投影、WebP及长名称均已本次修正并独立复核。最终专项功能通过，逐项设计偏差已修复，见[设计记录](./design-review.md)。系统全屏位置尚需明确批准，最终整体界面等待用户人工验收，整体设计不记通过。自动检查和截图数量均不替代设计批准。

已准备[独立本地验收环境](http://ariso-185-62014.localhost:62014/library)，Ego Lite同一空间的p1已登录，并从列表打开大图，保留当前查询上下文。数据位于 `/private/tmp/ariso-185-preview-F6s53v/data`，仅含本次独立样本和真实验收上传，未使用用户预览数据库；本地服务不是部署。请在Ego窗口核对整体界面与关闭左侧的44px全屏入口。尚未收到人工批准，不将此环境已打开记为验收通过。

匿名分享查看器由 T-SHR-04 / #193 承接。查看器打开期间的真实会话过期只完成源码边界和接口错误单测，未单独取得浏览器场景，不冒充实测。物理手机、Safari系统全屏、软键盘、刘海安全区未实测；AMD64/ARM64镜像与容器验证仅Release流程执行，本次没有触发Release、发布镜像或部署。

创建PR后已运行 `gh pr view 229 --repo dnslin/ariso-next --json number,url,state,isDraft,baseRefName,headRefName,statusCheckRollup` 和 `gh pr checks 229 --repo dnslin/ariso-next`。PR为OPEN / Draft，目标main、源分支正确，statusCheckRollup为空；checks返回“no checks reported”，退出1表示没有可列出的检查。见[PR回读](./pr.json)、[检查输出](./checks/pr-checks.txt)。按实际仓库策略没有远端PR检查，不记CI通过，也不等待或新增工作流。
