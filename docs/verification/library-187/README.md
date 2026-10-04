# T-LIB-10 / Issue #187 批量复制交付记录

日期：2026-10-04（Asia/Shanghai）。关联 [Issue #187](https://github.com/dnslin/ariso-next/issues/187)；需求 `R-15.8-01`、`R-15.8-02`、`R-13.4-02`。范围及规则沿 [任务卡](../../tasks/m3-m4-experience.md#t-lib-10-跨页批量复制与剪贴板降级)、[library §8](../../specs/SPEC-library.md#8-批量复制与逐版本下载)、[设计交接](../../design/handoff.md)和[执行约定](../../tasks/execution.md)，不维护第二份规则。

## 前置与基线

实际读取 Issue、评论、GitHub 原生 blocked by / blocking。Issue 无评论；#174、#69、#131 均为 closed/completed；blocking 为空。[Issue 快照](./issue.json)及[前置快照](./dependencies.json)保留。本次从最新 `origin/main` 的 `1ca3ae0bb76e819fac0cdbdc240f3d7c6ab5768c` 创建 `codex/issue-187-batch-copy`。原目录无未提交改动，但同时有其他任务使用，因此使用独立 worktree `/Users/dnslin/.codex/worktrees/issue-187-batch-copy/ariso`，保留原工作区。

开始实施前已阅读现有跨页选择、图库/相册共用 LibraryScreen、单图 DetailCopy、delivery 链接/解析、library 查询排序与相关测试。既有已选清单和单图复制是可复用底座；此前没有批量 copy 接口或跨批文本合并，不将其描述为已实现批量能力。

使用 using-agent-skills 选择 incremental-implementation、git-workflow-and-versioning；React 使用 vercel-react-best-practices，设计读取使用 figma-design-to-code，浏览器使用 ego-browser。代码审计与设计还原分别由独立评审者完成，实际结论在下方补充。

## 实际设计来源

实施者与独立评审者分别实际调用 Figma get_design_context（含截图），读取下表十个节点；原尺寸截图保存在 figma/。原型示例名称、数量、图片均由实际数据提供。公共外壳继续复用 OwnerShell/AdminShell；复制模式组合 HeroUI Modal、Select、Dropdown、TextArea、Button、Alert，图标使用已有 Lucide。复制格式 Dropdown 沿设计交接 2026-10-02 已批准规则替代旧三按钮，不修改 Figma。

| 状态             | 桌面 Figma                                  | 手机 Figma                                |
| ---------------- | ------------------------------------------- | ----------------------------------------- |
| 复制入口         | [387:5769](./figma/387-5769.png)，480×497   | [387:5709](./figma/387-5709.png)，358×517 |
| 部分不可复制结果 | [388:6482](./figma/388-6482.png)，1440×1080 | [388:6690](./figma/388-6690.png)，390×844 |
| 手动复制         | [387:5972](./figma/387-5972.png)，480×281   | [387:5928](./figma/387-5928.png)，358×281 |
| 固定版本         | [387:5788](./figma/figma-387-5788.png)      | [387:5728](./figma/figma-387-5728.png)    |
| 全部不可用       | [387:5983](./figma/figma-387-5983.png)      | [387:5939](./figma/figma-387-5939.png)    |

真实页面截图与逐项对照见 [独立设计评审](./design-audit.md)。主状态在 [full-r4](./browser/full-r4/library-copy.json)，最终反馈在 [feedback-r4](./browser/feedback-r4/library-copy.json)；最后空结果行距及公共菜单消费回归另在 browser/preview-final。用户最终人工 UI 验收仍待完成。

## 环境与实际检查

本机 macOS ARM64，Node 24.18.1、pnpm 11.19.0、已有 ImageMagick 7 / ExifTool / Ego Lite。当前命令 PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`，不修改全局环境。浏览器使用唯一 TaskSpace 21，隔离生产 DATA_DIR 与测试账号，不修改用户预览数据。

| 实际命令                                                                                                                                                                                          | 结果                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                                  | [通过](./checks/install.txt)，锁文件不变                                                                                             |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                                                                       | [通过](./checks/ui-install.txt)                                                                                                      |
| `pnpm --dir tests/experiments/ui run typecheck`                                                                                                                                                   | [通过](./checks/ui-typecheck.txt)                                                                                                    |
| `pnpm run build:shell`                                                                                                                                                                            | [通过](./checks/shell-build.txt)                                                                                                     |
| `pnpm --dir tests/experiments/ui run build`                                                                                                                                                       | [通过](./checks/ui-build.txt)                                                                                                        |
| `pnpm run test:unit`                                                                                                                                                                              | [1111/1111 通过](./checks/unit.txt)                                                                                                  |
| `pnpm run lint`                                                                                                                                                                                   | [初次](./checks/lint.txt)及[最终完整检查](./checks/lint-final.txt)通过                                                               |
| `pnpm run typecheck`                                                                                                                                                                              | [初次](./checks/typecheck.txt)及[最终修复后](./checks/typecheck-final.txt)通过                                                       |
| `pnpm run format:check`                                                                                                                                                                           | [初次](./checks/format.txt)及[交付文档收齐后](./checks/format-final.txt)通过                                                         |
| `pnpm run build`                                                                                                                                                                                  | [最终设计构建通过](./checks/build-accepted-design.txt)，无部署密钥/数据库构建；保留Next可选平台依赖和telemetry trace提示，不隐去日志 |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                                        | 首轮[1296通过、23失败、17因suite失败未执行](./checks/integration.txt)；构建重叠与其后复验见下文，不标全量通过                        |
| `pnpm exec vitest run --project integration --maxWorkers=2 tests/integration/library/copy.test.ts tests/integration/library/copy-http.test.ts tests/integration/library/detail.test.ts`           | [20/20通过](./checks/copy-regression.txt)                                                                                            |
| `pnpm exec vitest run --project media-tools --maxWorkers=1 tests/integration/media/preview-http.test.ts tests/integration/media/reprocess-http.test.ts tests/integration/media/watermark.test.ts` | [43通过、1个SVG水印超时](./checks/media-affected.txt)；未改动该测试/实现                                                             |
| `node scripts/verify-browser.mjs --suite library-copy --only representative`                                                                                                                      | [代表r3通过](./checks/browser-representative-r3.txt)，随后修正设计与焦点                                                             |
| `node scripts/verify-browser.mjs --suite library-copy`                                                                                                                                            | [full-r4](./checks/browser-full-r4.txt)已执行15组合与36布局，但整体因测试选择器失败而退出1，不能记单次全套通过                       |
| `node scripts/verify-browser.mjs --suite library-copy --only feedback`                                                                                                                            | [最终feedback-r4通过](./checks/browser-feedback-r4.txt)，剩余反馈、相册与真实401全部执行                                             |
| `node docs/tasks/check.mjs`、`git diff --check`                                                                                                                                                   | [文档检查通过](./checks/docs.txt)，120项任务、298项需求无缺失或循环；最终差异检查通过                                                |

归档日志仅规范换行、行尾空白和末尾空行；保留原始诊断、失败与结果内容。

浏览器命令使用 `EGO_TASK_SPACE=21 EGO_KEEP_SPACE=1` 和各轮 `BROWSER_REPORT_DIR`，已有Ego Lite，不下载浏览器。冻结安装、外壳和UI实验构建已分别完成，因此直接调用同一运行器的本次定向阶段，不重复构建不变的外壳；未执行旧全库浏览器长链。消费本次复制界面的图库与相册已真实检查，复用菜单的回收站另做最小回归。OwnerShell/AdminShell及导航配置未修改。

## 已实现范围

- 新增所有者 `/api/images/copy`，每请求最多200个明确ID，复核当前查询、版本及存储事实。返回完整排序键、服务端转义行、实际版本、不可复制原因和权限/GPS说明。
- 图库及相册共用复制入口。打开时冻结显式清单和查询，按统一模式分批后合并完整顺序。默认链接不带type；固定缺失或不适用版本不回退，即使不适用版本有旧保存记录也拒绝。
- 分批完成后仅一次真实剪贴板写入。全不可用不覆盖剪贴板；拒绝自动写入则保留完整可选文本。HTTP错误保留重试，401沿现有流程清选择、缓存与私有界面。
- 缩略图从页面已加载的像素复用，不为复制增加图片GET、HEAD、签名、存储探测或访问计数。共用delivery文本与media适用性规则，无新增依赖或迁移。

已存版本下载继续沿T-LIB-06既有详情，不增加本次范围外的下载流程。回收站永久删除/清理由T-LIB-11承接，分享管理与访问统计沿既有对应任务，不把公共导航占位称为交付。

## 失败证据与修复

1. 浏览器前两轮在独立测试数据准备阶段违反对象Key唯一键/对象与图片存储复合外键，尚未执行产品流程。保留 [首轮](./browser/representative/runner.json)与 [第二轮](./browser/representative-r2/runner.json)；修复夹具后 [代表r3](./browser/representative-r3/library-copy.json)通过真实201跨页、200+1请求、乱序同值合并、剪贴板及手动复制。
2. 独立设计预审发现返回按钮、Select48px及控件轮廓、关闭底色、手动文本13px、结果说明额外行距。全部在本范围修复；最终逐项结论以 [设计评审](./design-audit.md)为准。
3. 完整矩阵的Escape回焦失败保留 [full](./browser/full/library-copy.json)与 [full-r2](./browser/full-r2/library-copy.json)。修复来源焦点交接和只读复制不暂停选择核对。结果标题、empty/error移除加载提示后的焦点也分别先复现，再按overlay生命周期修复。保留原断言，新增Tab/Shift+Tab不可触及背景；最终[核心矩阵](./browser/full-r4/library-copy.json)与[反馈续验](./browser/feedback-r4/library-copy.json)均取得对应通过证据。full-r4测试选择器未处理停用/虚拟化卡片，整体仍保留failed；修正为真实滚动显露卡片后点击checkbox，后续只重验未完成场景。
4. 首轮 [完整集成](./checks/integration.txt)与本次UI重建重叠，读取正在替换的standalone目录造成缺文件失败；该轮不算完整通过。构建稳定后只重验15个受影响文件：[109项通过，3项失败](./checks/integration-affected.txt)。剩余三文件串行复查：[43项通过，1项失败](./checks/media-affected.txt)，preview/reprocess两文件通过。仅剩未改动的 `media/watermark.test.ts` SVG合成超过既有5000ms超时，仍记失败，不削弱断言、不调超时、不越范围修复。
5. [固定不适用版本失败证据](./checks/server-inapplicable-before.txt)证明旧路径会生成动画图旧compressed版本链接。仅在copy显式版路径拒绝不适用，默认沿delivery规则；[修复后11项通过](./checks/server-inapplicable-after.txt)。最终 [copy接口/HTTP与detail回归20项通过](./checks/copy-regression.txt)。
6. [feedback-r3](./browser/feedback-r3/library-copy.json)最后注入401时真实Cookie仍有效，login守卫再次回到相册；这不能证明真实会话失效。改为仅撤销隔离测试数据库会话，最终[feedback-r4](./browser/feedback-r4/library-copy.json)记录copy实际401、no-store、零Clipboard写入、私有结果/选择消失和稳定登录页。HTTP503仍是明确标注的传输边界注入，不冒充服务宕机。

受影响集成复验实际命令如下；[日志](./checks/integration-affected.txt)保留全部结果。未重复首轮其余123个已通过文件。

```sh
pnpm exec vitest run --project integration --project media-tools --maxWorkers=4 tests/integration/collections/tag-http.test.ts tests/integration/delivery/local-http.test.ts tests/integration/delivery/s3.test.ts tests/integration/identity/m1-gate.test.ts tests/integration/identity/setup.test.ts tests/integration/library/batch-http.test.ts tests/integration/library/copy-http.test.ts tests/integration/library/trash.test.ts tests/integration/media/metadata-http.test.ts tests/integration/media/preview-http.test.ts tests/integration/media/reprocess-http.test.ts tests/integration/media/watermark.test.ts tests/integration/runtime/health.test.ts tests/integration/runtime/logging.test.ts tests/integration/runtime/standalone.test.ts
```

物理设备、跨浏览器及 Release AMD64/ARM64 镜像/容器未执行，按现有执行约定不为本 PR 发布 Release、镜像或部署。未单独动态卸载hook测试，以请求中断单元与代码审查支撑该边界，见审计说明。现有 SVG 水印超时未解决，PR保持草稿，不能声称全部检查通过。

## 交付状态

实现与本次功能场景证据已收齐；[独立代码审计](./code-audit.md)和[独立设计对照](./design-audit.md)分别通过。用户人工UI验收待完成。分支 `codex/issue-187-batch-copy`；提交与PR链接在创建后补充，不把PR创建当作验收完成。

人工验收使用独立生产预览 [issue187-preview.localhost:3197](http://issue187-preview.localhost:3197/library?q=issue177-&pageSize=80&page=3)，测试图及账号与用户数据隔离；本机配置仅存忽略目录 `.data/issue187-preview/`，不提交凭据。Ego Lite任务空间21的p1已登录，实际保留201张跨页选择与复制选项，[预览证据](./browser/preview-final/browser.json)。

[回收站共用菜单回归](./browser/preview-final/trash-consumer.json)在1440/390两端浅深色实际通过，原恢复/选择操作保留，没有扩散复制、重处理或未实现删除入口；临时回收的198已恢复。初次测试误把桌面控件也要求44px，保留[失败](./browser/preview-final/trash-consumer-r1.json)，随后按设计交接“桌面不强制44px”和现有browserGeometry的鼠标目标约定纠正测试，不修改既有产品或放宽手机44px要求。

PR保持草稿；不合并、不主动关闭Issue、不清理分支或worktree。
