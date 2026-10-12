# PR #279 三项回归修复

2026-10-12，用户授权修复审查发现的三个 P2，补充回归测试，验证后提交并更新现有 PR。修复基线为 `670f3e2496e586ae24ef713dc8502110bfe09c77`，沿用 `codex/ui-review-refinement`。不包含合并、Issue 关闭、发布或现有预览清理。

## 修复内容

1. 上传控制器在提交确认后，将服务端返回的实际 `storageId` 写入重试设置。未显式改选存储时，首次请求仍由服务端解析默认值；确认后的失败重试不再重新解析默认存储。响应丢失仍先用原请求核对，不盲目重传。
2. “加载更多”模式添加或移除相册后，复用现有 `/api/images/status` 按最多 80 个 ID 读回实际状态并同步已加载列表。全选、框选、清空重选不再用旧 `hasAlbums` 覆盖核对结果。不猜测移除后是否仍属于其他相册，不重置游标或已加载窗口。
3. 相册详情已成功读取后遇到普通刷新失败，保留内容和选图状态，直接显示错误与“重试加载”。重试中保留诊断并禁用重复点击，成功后清除错误。404 显示不存在状态并撤下旧相册操作；401 继续清理会话并返回登录。

产品只修改 `upload/controller.ts`、`library/use-library-query.ts` 和 `albums/screen.tsx`。没有 schema、依赖、写入接口或全局 UI 配置变更。

## 回归测试

先增加复现用例并实际运行失败，再修改产品代码：

| 范围                                                      | 修复前                                | 修复后覆盖                                                                                                    |
| --------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `tests/unit/upload/controller.test.ts`                    | 原 39 项通过，新增 2 项失败           | 已确认传输失败；响应丢失后通过 refresh 确认；两条路径在默认存储 A 改 B 后仍重试到 A                           |
| `tests/unit/library/query-hook.test.ts`                   | 最初 4 个核心回归全部失败             | 添加后全选、框选、清空重选；移除后仍有其他关系或无关系；failed/unknown 读回；401/503 错误传播；游标与总数保留 |
| `tests/unit/collections/album-shortcut-lifecycle.test.ts` | 缓存 500 与 404 两项失败              | 缓存刷新错误、重试期间保留内容、成功更新数量、404 撤下旧编辑弹窗、401 会话处理；原有部分加入失败场景保留      |
| `tests/unit/runtime/browser-plan.test.ts`                 | 新 `regressions` 阶段未注册，1 项失败 | 新阶段接入现有 `collection-shortcuts`，默认完整套件也包含它                                                   |

新增 `e2e/collection-review-regressions.mjs`，使用隔离运行器和真实本地 API，不访问 3001 的用户数据：

- 真实提交确认使用 A，通过既有取消 API 将一次接收明确置为传输失败，再把默认改为 B；显式重试完成的真实图片仍写入 A。
- “加载更多”中真实批量加入相册，直接全选、清空重选，检查移除入口持续存在，不重新加载列表。
- 仅对相册详情读取注入 500，经既有上传变更事件触发后台刷新，检查图库节点保留、错误可见、重试恢复。桌面/手机与浅深色各保留截图。
- 成功路径清理本测试创建的图片、相册与备用存储，并恢复默认存储。运行器负责隔离服务与临时数据库生命周期。

## 实际检查

环境：macOS ARM64，Node 24.18.1、pnpm 11.19.0，PATH 包含 `/usr/sbin:/sbin`。

| 实际命令                                                                                                                                                                                                                                                      | 结果                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                              | 通过，锁文件未变                                                                                                                       |
| `pnpm run build`                                                                                                                                                                                                                                              | 通过，包含 runtime 和 standalone 打包；保留原可选平台 resvg/OpenTelemetry 依赖追踪警告                                                 |
| `pnpm run lint` / `pnpm run typecheck`                                                                                                                                                                                                                        | 通过                                                                                                                                   |
| `pnpm run test:unit`                                                                                                                                                                                                                                          | 179 文件、2247 项通过，92.37 秒                                                                                                        |
| `pnpm exec vitest run --project unit tests/unit/upload`                                                                                                                                                                                                       | 19 文件、173 项通过                                                                                                                    |
| `pnpm exec vitest run --project unit tests/unit/collections`                                                                                                                                                                                                  | 12 文件、90 项通过                                                                                                                     |
| `pnpm exec vitest run --project unit tests/unit/library/query-hook.test.ts tests/unit/library/selection.test.ts tests/unit/library/selection-actions.test.ts tests/unit/library/batch-controller.test.ts tests/unit/library/selection-reconciliation.test.ts` | 5 文件、78 项通过                                                                                                                      |
| `pnpm run test:integration --maxWorkers=1`                                                                                                                                                                                                                    | 190 文件、1896 项通过；1 文件、1 项失败，共 191 文件/1897 项，994.48 秒；为已记录的上传 API 截断 multipart `fetch failed / ECONNRESET` |
| `EGO_TASK_SPACE=10 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/pr279-review-fixes/browser-cleanup node scripts/verify-browser.mjs --suite collection-shortcuts --only regressions`                                                                       | 通过，3 项真实流程及 4 个错误状态截图                                                                                                  |
| `EGO_TASK_SPACE=10 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/pr279-review-fixes/browser-complete-retry node scripts/verify-browser.mjs --suite collection-shortcuts`                                                                                   | 复跑完整通过，18 项流程、212 个布局组合，另有 4 个刷新错误状态截图                                                                     |
| `pnpm run format:check`                                                                                                                                                                                                                                       | 仍仅两份未修改的历史 JSON 失败，见下文；修改文件另做定向检查                                                                           |

## 运行修正与边界

归档包括[运行器结果](review-fixes/browser/runner.json)、[完整快捷流程结果](review-fixes/browser/collection-shortcuts.json)，以及[第一次记录器失败](review-fixes/browser/first-recorder-failure.json)、[第二次刷新触发选择失败](review-fixes/browser/second-refresh-trigger-failure.json)、[第一次扩大选图检查失败](review-fixes/browser/first-expanded-picker-failure.json)。失败记录不覆盖，不将此前分段通过拼接为一次完整通过。

浏览器首次定向运行的请求记录器没有覆盖上传控制器初始化时绑定的 `fetch`。改用运行器既有代理后，真实提交和存储 ID 断言通过。第二次运行将工具栏显式重置列表后的图库节点变化误归到详情刷新；改为通过既有后台刷新事件验证节点连续性，未删除或放宽节点相等断言。最终定向运行通过。

第一次扩大 `collection-shortcuts` 检查在选图的后续提交处被上一次成功 Toast 遮住，鼠标无法命中。测试现在在已经验证成功结果后，通过真实关闭按钮关闭通知，再进入下一次选图。不修改通知或选图产品行为，不改超时，不删除业务断言。第一次失败记录与后续结果分开保留。

全仓格式检查仍失败于两份历史文件，均不属于本轮改动：

- `docs/verification/site-196/implementation/merge-theme/browser/site196-merge-site-general/site-general.json`
- `docs/verification/site-196/implementation/merge-theme/browser/site196-merge-theme/theme.json`

全量集成唯一失败仍是 `tests/integration/upload/api.test.ts` 的截断 multipart 用例，错误为 `TypeError: fetch failed`，原因为 `read ECONNRESET`。它与 PR 创建时已记录的失败一致；本轮未改该用例或上传服务端。其余 190 文件、1896 项通过。没有跳过、弱化断言或顺手修复无关后端问题，PR 继续保留草稿，不将全量集成称为通过。

修改文件的定向 Prettier、`git diff --check`、文档依赖检查（120 任务/298 需求）及 5 项拒绝样本自测通过。最终浏览器脚本增量的 ESLint 和语法检查通过。三项回归与对应真实流程已通过，完整 PR 的格式和集成限制单独保留。

本轮不运行发布容器、双架构镜像或默认全量浏览器。完整 PR 的最终人工验收与历史限制仍按[交付汇总](delivery-20261012.md)记录，不把本轮三个问题通过等同于整个后台已验收。

## 设计对照

沿用已批准的相册桌面 `38:378`、手机 `102:4002` 及 [v2/v3 交付规则](../../../../design/handoff.md)。没有新增正常态布局、公共外壳、图标或操作位置；真实错误复用页面原有 HeroUI Alert/Button。此次为状态遗漏修复，不重画 Figma，不新增原型。

截图先检查公共外壳、标题/返回、左侧查询与右侧操作组，再检查错误文字、重试点击区、固定底栏及手机换行。390/1440、浅深色均无横向溢出，重试高度至少 44px，原图库节点保留。截图中的名称、彩色图片与数量属于隔离测试数据。

| 状态     | 实际截图与结论                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| 桌面浅色 | [1440px](review-fixes/browser/review279-album-error-light-1440.png)：公共侧栏、工具栏和固定底栏保留；错误与重试直接可见 |
| 桌面深色 | [1440px](review-fixes/browser/review279-album-error-dark-1440.png)：沿用原语义色，错误与内容层级分明                    |
| 手机浅色 | [390px](review-fixes/browser/review279-album-error-light-390.png)：原搜索与操作自然换行，错误和重试可达，无横向溢出     |
| 手机深色 | [390px](review-fixes/browser/review279-album-error-dark-390.png)：标题/返回与底栏保持一致，错误正文可读                 |

独立只读复审检查了三处产品修改、对应单元测试、浏览器阶段和调用链，未发现高置信阻断问题。没有改动用户预览、账号或数据。
