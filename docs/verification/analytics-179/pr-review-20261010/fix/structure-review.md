# 唯一 P2 修复：结构与可维护性独立复审

日期：2026-10-10。沿用 `thermo-nuclear-code-quality-review` 及项目 AGENTS、设计交接与执行约定。复审输入为评审归档提交 `5846b1324c9e5f2b1737c593543fc4b5e79944ec` 之后的工作区产品/测试增量：

- `src/app/library/library-screen.tsx`：既有 `filtered` 条件增加 `query.filters.failure`。
- `e2e/analytics-consumers.mjs`：导入既有 SQL quote，增加两类异常零匹配的真实页面回归及有限夹具状态恢复。

原固定 head `87bba340c856624b9e017e061305d1ebd35d2c32` 的 Request changes 结论保留在[首次结构评审](../structure-review.md)，不倒改历史。

## 静态复审

**Approve。原 Required / P2 已闭合，未发现本次修复新增的必修项。** 本评审只读源码与实际报告，不操作浏览器、不执行或重复测试、不修改产品代码。

1. 最小修复闭合新字段与既有空结果模型。`library-screen.tsx:245–258` 直接纳入 failure，复用原“没有找到匹配图片 / 清除筛选”分支与 `query.resetQuery`；没有新增 UI 方案、状态、兼容层或通用筛选抽象。其他非筛选空库、相册及分页分支保持原条件。
2. 新测试首先读取真实普通图库确认 `normal.total>0`，再分别读取两个 failure API 确认 `total=0/items=[]`。页面标题、说明与清除按钮从 DOM 读取，未覆盖成功响应、注入空数组或写死 API 数量。键盘 Enter 清除后等待 URL 删除 failure、真实普通图片 ID 恢复及空态消失，验证操作后果，不只验证条件源码或文案存在。
3. 夹具使用现有两个独立失败 ID，暂回收操作只改 `trashed_at`。已核对 `analytics-fixture.mjs` 的 seed：index 9/10 初始均为 NULL，只有 index 1 原始为回收；因此 finally 恢复 NULL 是确定的原状态，不需克隆图片与关联对象。改动使用既有 quote，不再实现 SQL 转义。
4. 数据修改是单条同步 SQLite UPDATE，后续浏览器/API 等待包含在 try/finally 中；失败时恢复仍是离线 SQL。主入口已有 fixture.dispose 和运行器临时目录清理作为外围资源边界；不接触人工预览数据库。无需额外事务跨越浏览器操作或新增锁/快照框架。
5. 场景加入已有 consumers 函数末尾。默认 full → analytics 无 phase → consumers 与定向 `--suite analytics --only consumers` 都执行，未修改共用分发，也未删弱旧断言。已有正常匹配、返回来源、焦点与异常切换流程仍在之前执行。
6. consumers 文件由 188 行增至 259 行，图库页面由 679 行增至 680 行；均未跨 1000。约 70 行增量承担真实数据前置、两类回归、视口证据和资源恢复，未复制产品业务。未发现能删去整层复杂度的必要重构，继续复用当前线性观察步骤比引入新运行模式更直接。

## 失败证据核验

实际读取 `test-results/analytics-179-empty-red/runner.json` 和 `analytics.json`：

- Node v24.18.1，analytics only=consumers，临时 origin 为 `http://ariso-63932.localhost:63932`。
- 运行止于 `consumerStep=failure-empty:initial`。断言期望匹配空态及“清除筛选”，实际为“图库还没有图片 / 上传第一张图片，开始整理你的图库。”，按钮数组为空。
- `fixtureRestored=true`、`temporaryDirectoryRemoved=true`；没有 cleanupError。

此失败精确命中原 P2，可证明新增断言能识别旧行为。它不是网络失败、无图片空库或被跳过的测试。后续 GREEN 已实际读回，详见下节；本评审未自行运行上述命令。

## 成功证据与最终结论

实际读取 `test-results/analytics-179-empty-green/runner.json` 与 `analytics.json`：2026-10-10 07:11:36.598Z 至 07:12:23.403Z，Node v24.18.1、analytics only=consumers、同一 TaskSpace 2/p1、独立临时 origin `http://ariso-64408.localhost:64408`。两个报告均 passed，30 个布局，browserErrors=[]，fixtureRestored=true，temporaryDirectoryRemoved=true，无 cleanupError。

两类回归记录均明确 `filteredTotal=0`、`normalTotal=9`；标题为“没有找到匹配图片”、说明为“请修改或清除筛选条件。”、按钮为“清除筛选”，键盘清除后 `cleared=true`。既有 consumers 的来源/焦点/滚动与有匹配异常流程也先于新回归执行通过。新增五宽度×浅深色及390/1440×400布局在本次实际 consumers 入口中执行；本评审读取报告，未重新进行视觉验收或浏览器操作。

因此原问题已取得先失败后成功的实际行为证据，本次单行产品修复与相关测试结构可批准。此结论限定所审修复输入；不扩大为历史默认全量浏览器、完整集成、发布镜像或容器检查重新全绿，也不倒改首次评审的 Request changes。
