# Issue #185：大图查看、同图选版与上下文恢复

2026-10-02，T-LIB-07 / R-15.5-01 / LIBRARY-QUERY。依据 [SPEC-library §6](../../specs/SPEC-library.md#6-大图查看)、[设计交接](../../design/handoff.md)和[执行约定](../../tasks/execution.md)。本记录维护一次证据；PR 链接同一记录，不复制规则。

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

匿名分享查看器由 T-SHR-04 / #193 承接。物理手机、Safari系统全屏、软键盘、刘海安全区未实测；AMD64/ARM64镜像与容器验证仅Release流程执行，本次没有触发Release、发布镜像或部署。PR创建后核对真实远端检查，空列表只记为没有远端检查。
