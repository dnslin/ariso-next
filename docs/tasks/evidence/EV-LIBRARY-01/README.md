# EV-LIBRARY-01 查询与查看器接入验证

日期：2026-09-23（Asia/Shanghai）。关联 [Issue #75](https://github.com/dnslin/ariso-next/issues/75)，依据 [任务定义](../../gates.md#ev-library-01-查询与查看器接入验证)、[library §2–4/6](../../../specs/SPEC-library.md)、[设计交接](../../../design/handoff.md)。

## 前置与交付边界

`gh issue view 75 --json number,title,body,comments,state,url` 确认无评论；原生 blocked_by 为已关闭的 #55，blocking 为未完成的 #76。已核对 #55 的 [EV-UI-01 实施与验收证据](../EV-UI-01/README.md)，不是仅以关闭状态认定前置完成。从已更新并与 GitHub API 核对的 `origin/main`（`dff12ca`）建立 `codex/issue-75-library-validation`，因原目录被其他任务使用而采用独立 worktree。

本次交付是可复现的接入实验：

- `tests/experiments/ui/app/library/` 复用 #55 的隔离 Next 应用，以 120 条轻量 HTTP 夹具验证 Query、nuqs 和 YARL。没有新增生产路由、业务模块、生产依赖或迁移。
- `tests/experiments/library/sqlite-*.ts` 使用真实 SQLite、既有 runtime 迁移和十万行合成数据，比较现有索引与仅在临时库建立的候选索引。
- `tests/integration/library/sqlite-query.test.ts` 验证查询与游标行为。`library-browser.mjs` 验证真实 Ego Lite 页面，并接入独立 UI runner 和根 `scripts/verify-browser.mjs`。

该工程前置没有产品 Figma 节点交付。实验中的单列/双列布局、20 条分页和固定三图窗口只用于验证库接入，不是网格/瀑布流、默认加载更多或完整图库的交付，不关闭 DES/RG、LIB-01–20 或 QUALITY-SCALE。冻结 PRD、需求编号和模块边界未改。

## 依赖与接入方式

| 依赖                       | 锁定版本                                   |
| -------------------------- | ------------------------------------------ |
| Next / React / React DOM   | 16.3.5 / 19.3.0 / 19.3.0，与当前根项目一致 |
| TanStack Query             | 5.103.1                                    |
| nuqs                       | 2.10.1                                     |
| Yet Another React Lightbox | 3.32.2                                     |
| HeroUI React / styles      | 3.2.6 / 3.2.6                              |
| Tailwind CSS / postcss     | 4.3.3 / 4.3.3                              |
| lucide-react               | 1.47.0，与当前根项目一致                   |
| better-sqlite3 / SQLite    | 13.0.3 / 3.53.4                            |

新增 nuqs、YARL 和与根项目一致的 Lucide 仅进入隔离 UI 锁文件。官方依据为 [Query 分页](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries)、[nuqs options](https://nuqs.dev/docs/options)、[App Router adapter](https://nuqs.dev/docs/adapters)、[YARL](https://yet-another-react-lightbox.com/documentation)、[Zoom](https://yet-another-react-lightbox.com/plugins/zoom)、[Fullscreen](https://yet-another-react-lightbox.com/plugins/fullscreen) 和 [SQLite 滚动窗口](https://www.sqlite.org/rowvalue.html)。已核对安装包中的 nuqs adapter/parser 声明、YARL Lightbox/Zoom/Fullscreen 声明与全屏能力判断，以及 HeroUI Button、Form、TextField、Input、Label 的现有组合。

搜索输入只更新本地草稿；提交后使用 nuqs 一次写入查询及第一页，`history: push`、`shallow: true`、`scroll: false`。Query key 包含 q/sort/page，排除 layout/image。查询切换不使用旧数据占位，因此加载期间不会出现可操作的旧结果。这里只验证受控实验参数，完整生产 URL 校验和失效引用由后续任务实现。

查看器用 imageId 查找受控 index，故即使重新构造 slides 数组也保留图片身份。插件只有 Zoom 和 Fullscreen，`finite: true`、`preload: 1`；没有 Download、Share 或 Slideshow。HeroUI 提供实验表单和按钮，YARL 承担专用缩放、平移与全屏；图标由 Lucide 覆盖，没有自绘 SVG。布局采用 Tailwind，查看器样式使用库自身 CSS。查看器采用独立的客户端动态导入边界。

固定窗口只含打开图片及前后邻居，最多三张；未实现动态补窗、跨页邻居、直接 image URL、版本切换或权限变化。关闭按原触发 ID 恢复焦点和滚动，来源消失的代码分支回工具栏，但本次浏览器只实测来源仍在的返回路径。示例图为 1600×1200 的棋盘/灰度梯度，避免微小样本无法证明平移：

```sh
magick -size 1600x1200 pattern:checkerboard tests/experiments/ui/public/library-sample.png
magick -size 1600x1200 gradient: tests/experiments/ui/public/library-sample.jpg
```

## 实际验证

环境：macOS 26.6.2 arm64、Apple M4（10 核）、16 GiB 内存；Node 24.18.1、pnpm 11.19.0；现有 Ego Lite / Chromium 152；ImageMagick 7.1.2-31、ExifTool 13.55。未下载浏览器，未使用本机 Docker。

从仓库根目录执行：

```sh
export PATH="$HOME/.nvm/versions/node/v24.18.1/bin:$PATH"
pnpm install --frozen-lockfile
pnpm --dir tests/experiments/ui install --frozen-lockfile
pnpm --dir tests/experiments/ui run typecheck
pnpm --dir tests/experiments/ui run build
pnpm --dir tests/experiments/ui audit --json
pnpm exec vitest run --project integration tests/integration/library/sqlite-query.test.ts
node tests/experiments/library/sqlite-run.ts --report test-results/library/sqlite.json
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run test:integration --maxWorkers=4
EGO_TASK_SPACE=10 EGO_KEEP_SPACE=1 pnpm --dir tests/experiments/ui run test:browser
EGO_TASK_SPACE=10 EGO_KEEP_SPACE=1 pnpm run test:browser
node docs/tasks/check.mjs
node docs/tasks/check.mjs --self-test
git diff --check
```

首次独立复现省略 EGO_TASK_SPACE/EGO_KEEP_SPACE；runner 创建一个空间并在所有测试通过后关闭。连续复跑使用首次输出的空间 ID。本轮始终复用空间 10，全部运行通过后已调用 finish 关闭。

| 检查                   | 结果                                                                            |
| ---------------------- | ------------------------------------------------------------------------------- |
| 根与隔离项目冻结安装   | 通过                                                                            |
| UI typecheck / build   | 通过                                                                            |
| UI 依赖审计            | 0 已报告漏洞，见 [dependency-audit.json](./dependency-audit.json)               |
| SQLite 行为测试        | 9 项通过                                                                        |
| SQLite 十万行实验      | 26 组实际测量完成，见 [sqlite.json](./sqlite.json)                              |
| 根格式、lint、类型     | 通过                                                                            |
| 根单元测试             | 19 文件、312 项通过                                                             |
| 根构建                 | 退出码 0，保留下述既有诊断                                                      |
| 全部集成及真实工具测试 | 38 文件、304 项通过，包含新增 9 项                                              |
| UI 与根浏览器流程      | 独立 UI 与根入口整套回归均通过，见 [runtime-runner.json](./runtime-runner.json) |
| 文档依赖与自测         | 120 任务、298 需求通过；5 项拒绝场景通过                                        |

UI 原始证据：[browser.json](./browser.json)、[browser-runner.json](./browser-runner.json)。代表截图：[浅色手机](./light-390.png)、[深色桌面](./dark-1440.png)、[无系统全屏的短视口](./no-fullscreen.png)。全部十种布局的几何数据保存在浏览器报告中。

浏览器实际覆盖：逐字符输入不改 URL/历史/请求次数，搜索只增加一条历史，前进/后退恢复已应用输入；切布局不增加列表请求并保留选择；同查询翻页及后退恢复选择；重建窗口保持 imageId；放大后方向键平移而不切图；实际桌面系统全屏进入/退出；Esc 关闭恢复 URL/滚动/焦点/选择且不重查列表；无下载、分享、幻灯片；新查询加载期间无旧项操作、503、空结果与恢复，查询变化后不恢复旧选择。没有实际点击排序按钮，因此不将其称为全部筛选排序历史验证。

浅深色分别验证 360/390/430/768/1440 宽度无横向溢出、实验按钮/输入至少 44px。在 390×400 短视口将 `document.fullscreenEnabled` 明确覆盖为 false，验证隐藏无效系统全屏按钮、仍占满视口及能够缩放。这是能力缺失分支测试，不是假称真实移动 Safari 缺全屏实测。真实触屏、物理软键盘、非零安全区与其他浏览器未执行；执行范围沿用[统一约定](../../execution.md#前端共用验收)。

根构建仍打印已有 nft 无法解析 `better-sqlite3/build/Debug/better_sqlite3.node` 的诊断，退出码为 0；实际使用 Release 二进制，不在本 Issue 修改打包器。初轮浏览器验证暴露脚本引用了错误的 YARL DOM 类名，以及能力覆盖回调返回 document 导致序列化失败；均修正后重跑，不删除断言。初次格式检查发现新脚本未格式化，格式化后重跑。

## 十万行测量解读

真实 runtime 迁移提供 media/storage 表。collections 尚无生产表，实验创建明确标名的候选关系表与关系索引。数据固定生成 100000 图片、150000 相册关系和 249996 标签关系；包含热门关系、正常/回收、四种处理状态、私有图片和停用存储、相同时间戳及相同文件大小。并非用户真实密度分布。

13 类场景分别在现有 media 索引和候选 media 索引下运行：四种排序、深 OFFSET、相同窗口游标、单相册、相册固定顺序、多标签任一匹配、失败/停用存储、字面名称子串、复合筛选及回收站。每次测量包含语句 prepare、列表、总数和短事务。SQL、参数、列表与计数的 EXPLAIN QUERY PLAN 全部保存在报告内。行为测试的预期由生成数据独立计算，验证同值边界、四种排序完整遍历、移走边界图片、查询/范围绑定、名称转义、计数和深页，不用改断言达标。

| 测量                  | 现有 media 索引 | 候选 media 索引 |
| --------------------- | --------------: | --------------: |
| 最慢暖查询 p95        |        165.41ms |         36.47ms |
| 第 2000 页 OFFSET p95 |        131.14ms |         12.23ms |
| 同窗口 cursor p95     |         16.79ms |         14.57ms |

每组 25 次暖查询，p95 按最近秩计算。本机样本均低于 500ms 暖查询比较目标；首次新 SQLite 连接也均低于 2s，但操作系统文件缓存已经被造数和先前查询预热，**没有测得 OS 冷缓存 ≤2s 的结论**。磁盘文件系统、容量、数据库大小、CPU、内存和原始样本均在 JSON；存储介质与磁盘吞吐未测。

基线常见扫描及临时排序；候选索引改善普通排序，但深游标仍可能采用 MULTI-INDEX OR 加临时排序，不能宣称始终比 OFFSET 快。名称任意子串计数仍扫描图片表，没有声称前缀索引能优化它。候选索引未写入生产迁移，后续由表所属模块依据完整查询决定。

这只是规模起始证据：没有真实图片/S3、完整版本/任务摘要聚合、并发写入、HTTP 端到端延迟或持续加载大量卡片的浏览器内存。后续 QUALITY-SCALE、生产接口和完整图库仍需各自验收，不以此报告宣称全量性能通过。

## 审计与远端边界

使用 `code-review-and-quality`，两位独立只读代理分别先读 UI/SQLite 测试，再核对实现、类型与证据。当前未发现 Critical / Required 问题；确认生产模块边界、四种混合顺序、计数一致、游标身份、仅指定插件及测试失败传播。报告保留固定窗口、未测排序按钮和冷缓存限制。

远端 `.github/workflows/ci.yml` 只有 workflow_call，images.yml 只接受 release.published。按[当前执行约定](../../execution.md#适用检查)，PR 不运行 Actions，双架构容器留待 Release；没有可单独触发的验证工作流。本任务不创建 Release，不发布镜像，不部署，也不把未运行的远端检查标成通过。已回读实际检查状态。

实施提交 `37419f9` 已推送至 [PR #107](https://github.com/dnslin/ariso-next/pull/107)。本地检查、两份独立审计及证据复核通过后，PR 已转为正式待评审。`gh pr view 107 --json isDraft,headRefOid,statusCheckRollup,mergeStateStatus` 返回非草稿、CLEAN、空检查列表；`gh api repos/dnslin/ariso-next/commits/37419f9/check-runs` 返回 0，`gh run list --branch codex/issue-75-library-validation` 返回空列表。这是未配置 PR Actions 的真实结果，不称为远端检查通过。未合并、未关闭 Issue，分支与 worktree 保留。
