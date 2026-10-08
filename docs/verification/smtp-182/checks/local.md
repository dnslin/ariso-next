# 本地适用检查

2026-10-08，Node **24.18.1** / pnpm **11.19.0**，管理型工作区 `issue-182-smtp/ariso`。所有下列 pnpm/Node 命令在该运行时执行。主构建未提供部署密钥或数据库。

| 命令                                                                      | 实际结果和边界                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                          | [通过](./install.txt)。Nodemailer 10.0.15 由既有开发依赖转为生产依赖，没有新增库。                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pnpm run db:generate`                                                    | 通过，SQL 审查仅新增 SMTP 配置表；见[后端定向记录](./backend-directed.md)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `pnpm run format:check`                                                   | [首次失败](./format.txt)，仅两份 Drizzle 生成 JSON 未格式化；[定向修正](./format-fix.txt)后[两份复查通过](./format-retry.txt)。后续改动文件单独格式化/核对。                                                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm run lint`                                                           | [通过](./lint.txt)；之后变更的 UI、路由及测试执行[受影响检查](./final-affected-lint.txt)、[运行时夹具检查](./runtime-fixture-lint.txt)、[返回路径检查](./return-lint.txt)，全部通过。                                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm run typecheck`                                                      | [通过](./typecheck.txt)；之后新增测试与 UI 改动执行[主 TS 定向检查](./type-affected.txt)。运行时源码未在原检查之后变更。                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm run test:unit`                                                      | [首次](./unit.txt) 125 文件、1695 项通过；另一个 verify-image 文件因先运行测试、尚无 dist 构建产物而加载失败。构建后只重跑该[受影响文件](./unit-build-retry.txt)，5 项通过。新返回路径回归另取得[失败证据](./return-before.txt)，修后[24 项通过](./return-after.txt)，其中新增 1 项。合并这些实际运行，126 文件/1701 项取得通过结果；没有再次机械执行全量。                                                                                                                                                                                                |
| `pnpm run build`                                                          | [初次通过](./build.txt)，页面布局/标签和返回路径修正后分别重建，最新[返回路径构建](./build-return-retry.txt)通过。Next tracing 输出既有跨平台可选依赖/源码地图警告，命令实际 exit 0；运行时由真实 standalone 集成和浏览器另行验证。                                                                                                                                                                                                                                                                                                                        |
| `pnpm run test:integration --maxWorkers=4`                                | [首次失败](./integration.txt)：170 文件/1691 项通过，8 文件/34 项失败。24 项来自旧手写迁移夹具遗漏 SMTP 新表；只补真实迁移、表清单与检查点，原断言保留。[4 个运行时文件](./integration-runtime-retry.txt)29/30通过，最后检查点补16后[该1项通过](./integration-startup-migration-retry.txt)。另10项失败来自主 agent 并行重建覆盖测试正在读取的 standalone 产物（入口/模块缺失、健康请求500）；稳定产物后只重跑[4个HTTP文件](./integration-http-retry.txt)，26项通过。综合178文件/1725项已取得通过结果，但不是一次最新全量无失败运行；保留全部首轮失败证据。 |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile` / `typecheck` | [冻结安装](./ui-install.txt)、[类型检查](./ui-typecheck.txt)通过；默认浏览器命令实际执行 nested UI build。                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `node docs/tasks/check.mjs` / `--self-test`                               | [任务定义](./tasks.txt)与[拒绝行为自检](./tasks-self-test.txt)通过。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

浏览器入口和真实功能/视觉结果单独记录，不用以上静态或集成检查替代。原检查输入未改变的文件不重跑；后续失败及新修改只复查受影响范围。

## main 并发迁移协调后的受影响检查

main 合入统计 #263 后，真实 `pnpm run db:generate` 将 SMTP 顺延为0027；SQL 与原 SMTP 0026 逐字节一致。保留 main 的26及 analytics 索引。独立双parent复审见代码审计。

- `pnpm run build`：exit0，见[合并后构建](./build-concurrency.txt)。仍有既有 Next 跨平台可选依赖追踪诊断，不记作构建失败或已消除诊断。当前默认浏览器复制产物与构建目录分离，因此此次构建不覆盖运行中的服务。
- `pnpm exec vitest run --project integration tests/integration/runtime/health.test.ts tests/integration/runtime/prestart.test.ts tests/integration/runtime/secret-preflight.test.ts tests/integration/runtime/startup.test.ts tests/integration/identity/smtp-production.test.ts`：5文件45项通过，见[合并后集成](./integration-concurrency.txt)。健康与 SMTP 场景使用全量真实迁移；三份精简 runtime 夹具不消费统计报表，只改SMTP路径，不为未消费模块补索引。
- Node24.18.1 `node --input-type=module` 一次性隔离升级检查：先复制真实 drizzle 并将临时 journal 截到main26，以既有 migrator 建库；确认已有统计索引、没有SMTP表；再复制最终完整迁移，通过真实 `dist/cli/prestart.js` 启动两次。两次均exit0，28条迁移、SMTP表和统计索引均保留，见[实际升级](./migration-upgrade.txt)。临时目录在检查结束时清理，人工预览数据未动。

`pnpm run typecheck` 与 `node docs/tasks/check.mjs` 在合并后再次核对，通过；见[类型](./type-concurrency.txt)、[任务文档](./tasks-concurrency.txt)。这次重跑是因为合并后的输入改变，不重复检查未变的 UI 行为。

首次全量记录仍是合并前输入，不把上述受影响复验写成重新运行全量。

交付证据文件的定向格式检查与本地引用检查已通过，见[格式](./delivery-format-check.txt)、[引用](./delivery-links.txt)。`git diff --check origin/main`通过；main已有的两个统计日志末尾空行未在本任务改写。

交付日志仅规范终端行尾空白和末尾空行，保留全部命令结果、错误与失败断言；不把日志展示空白作为原检查通过依据。纳入暂存区后已重新核对差异。

## 浏览器恢复后的受影响检查

所有者明确恢复原空间3后，先保留真实失败再修正SMTP Tips、滚动、短弹窗和公共通知关闭状态；各次辅助脚本更正与失败报告见[浏览器记录](../browser/README.md)。新构建前的定向eslint/Prettier检查分别保存在本目录`tip-*`、`scroll-modal-*`、`dialog-*`与`notice-stack-*`日志，实际全部通过。

main随后合入基本设置PR #262（7e88af4a），本分支merge0b05e3ee保留公共general/email路径、五类设置与默认site-general/smtp两项场景。它未新增迁移。双方运行器参数仍按所属suite分发。

- `pnpm exec eslint src/components/shell/providers.tsx src/components/shell/owner-shell.tsx src/components/shell/settings-categories.tsx scripts/browser-plan.mjs scripts/verify-browser.mjs e2e/shell-navigation.mjs e2e/smtp.mjs e2e/smtp-page.mjs tests/unit/runtime/browser-plan.test.ts --max-warnings=0`：[通过](./general-sync-lint.txt)。
- `pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-runner.test.ts`：[2文件265项通过](./general-sync-unit.txt)，覆盖合并后的full、suite/only组合与真实运行器入口。
- `pnpm run build`：Tips修正、滚动/标题行修正、关闭位置修正分别有受影响构建；最终[main与通知修正构建](./build-general-toast.txt)exit0，仍保留既有Next可选依赖tracing诊断。先前通过不改写为无警告。
- `pnpm run typecheck`：[最新合并类型检查](./type-general-sync.txt)通过；`node docs/tasks/check.mjs`：[120任务/298需求](./tasks-general-sync.txt)通过。
- SMTP生命周期只读会话限流等待辅助修改执行`pnpm exec eslint e2e/smtp-lifecycle.mjs e2e/smtp.mjs --max-warnings=0`和`pnpm exec prettier e2e/smtp-lifecycle.mjs e2e/smtp.mjs --check`：[静态](./session-limit-lint.txt)与[格式](./session-limit-format.txt)通过，没有再构建未变化的产品产物。

此次仅复验新增修改、合并输入或实际失败部分，没有将定向结果称作一次默认全量通过。安装、迁移、生产后端单元/集成输入未变化，沿用此前实际结果；浏览器恢复、公共消费路由与独立设计结论仍在各自记录维护。

设计实际复核发现Header默认flex-col与新增items-center使标题横向居中，改为明确flex-row/justify-start/text-left；[局部静态](./dialog-align-lint.txt)、[格式](./dialog-align-format.txt)及[最终构建](./build-dialog-align.txt)通过。这不是规则要求居中，真实来源为HeroUI已安装modal.css和组合样式。浏览器新增浅深状态捕获执行[四个辅助文件eslint](./theme-states-lint.txt)和[Prettier](./theme-states-format.txt)通过。该新增覆盖与标题修正是最后完整SMTP专项的重跑依据，后续未变化部分未再机械运行。

最新SMTP完整专项、shell-navigation与非SMTP通知消费者均exit0；命令、报告、截图和默认全量限制统一在[浏览器记录](../browser/README.md)，不在本表重复维护状态数量。

## 最终证据整理

仅证据文本新增，产品与浏览器输入未改变，不重复已通过的应用检查。Node24.18.1 / pnpm11.19.0下，31个本轮变更Markdown/JSON执行 `pnpm exec prettier --write <变更文件>` 与 `--check <变更文件>`，均exit0，见[格式写入](./final-doc-format-write.txt)、[格式核对](./final-doc-format-check.txt)。一次性本地引用脚本检查相关Markdown引用，无缺失文件，见[引用结果](./final-links.txt)。最终真实专项、历史失败和公共消费JSON与原实际输出内容一致，格式化不改检查结果；私有凭证扫描无匹配。

最终 `git diff --cached --check` 首次指出5份新增构建终端日志的进度行尾空格；仅归一终端回车与行尾空格，保留全部诊断及结果后复查通过。没有变更产品或测试断言。
