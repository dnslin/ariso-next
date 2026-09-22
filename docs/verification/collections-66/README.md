# T-COL-01 相册标签模型与上传关联事务

日期：2026-09-23。关联 [Issue #66](https://github.com/dnslin/ariso-next/issues/66)，任务定义见 [T-COL-01](../../tasks/m3-m4-experience.md#t-col-01-相册标签模型与上传关联事务)。本轮交付内部同步数据库能力，保留 R-16.1-01/02、R-16.2-01、R-7.3-01/02、R-8.4-02 的原有模块归属；不代表整个 COLLECTIONS-BASE 或上传产品流程已完成。

## 前置与范围

通过 `gh issue view` 和原生 `dependencies/blocked_by` / `dependencies/blocking` 读取正文、评论和关系。#66 无评论；直接前置 #50、#65 均为 completed，已分别核对[媒体持久契约证据](../media-50/README.md)和[Unicode/SQLite 实验证据](../../tasks/evidence/EV-COLLECTIONS-01/README.md)。后置为 #67、#73、#76、#83。

从已核对的最新 `origin/main`（`dff12ca29a17da3a1a47289ac4aa78e17dd5c38a`）建立 `codex/issue-66-collections`，工作目录 `/Volumes/data/project/ariso-issue-66`。原目录虽然干净，但有其他活跃任务，因此使用独立 worktree。首次 Git 直连超时；使用系统已有代理 `http://127.0.0.1:7897` 完成 fetch，再确认基线相同。

## 实施与调用契约

- 新增 `albums`、`tags`、`album_images`、`image_tags`，仅引用真实 `media_images`。相册允许同名；标签规范键唯一；成员复合主键；删除关系由 CASCADE 清理，最终图片删除通过 SET NULL 清除首选封面 ID。迁移 `0007_safe_tarantula.sql` 仅新增这四表及四个索引，不改已有表。
- `createAlbum`、`getOrCreateTags` 共用 Zod 校验：名称先拒绝控制/换行，再 trim + NFC，按 Unicode 码点计数；标签完整大小写折叠后再次 NFC。`unicode-case-folding@1.1.1` 从已有开发依赖移到运行依赖，未升级版本或增加传递依赖。数据库冲突只匹配 normalized_key，不覆盖首次显示形式或时间。
- `prepareUploadSelection(tx, { albumIds?, tagIds?, tagNames? })` 验证所有已有 ID，匹配/创建名称标签，返回去重且固定的 ID 数组。调用者使用同步 `db.transaction(callback, { behavior: 'immediate' })` 并让错误退出事务。准备成功后，取消/失败不删除空相册或标签；准备事务自身失败则整体回滚。
- 在同一个接收事务中先 `acceptOriginal(tx, input)`，再 `attachAcceptedImage(tx, imageId, selection)`，最后完成调用者交接记录。任何固定目标已删除，抛 `COLLECTION_TARGET_REMOVED`；不按名称重绑或补建。函数不执行文件 I/O 或异步工作，不独立提交。调用者必须让错误退出事务，才能一起撤销媒体资产、对象、版本、任务和关系。
- `addMemberships` / `removeMemberships` 接收明确的图片 ID，每图一个短写事务。返回逐图及逐目标 added/existing/removed/absent 结果；已回收、删除中或不存在图片返回业务错误。批量中的真实数据库异常返回 COLLECTION_DATABASE_ERROR 并保留原始 cause，其他图片继续；同步准备和接收函数则让数据库异常向调用者传播。private、failed、pending、processing 和停用存储不妨碍元数据管理。
- 重复加入不改变 `joined_at`；明确移出再加入保存新时间；每个相册独立计时。移出清空该图首选封面引用。`readAlbumMembers` 要求显式 normal/public 范围，在计数和分页前排除不合格状态，按 `joined_at DESC, image_id ASC` 排序，默认 40、支持 20/40/80。它返回内部图片记录，不授予文件访问权限；调用者使用同一只读事务取得一致的数量与本页。
- `deleteAlbum` / `deleteTag` 仅删除组织记录和关系，不触碰媒体对象或文件；删除不存在记录是无变化成功。`countAlbums` 统计现存行数，包含空相册。

方案核对依据：[Drizzle 冲突目标与插入](https://orm.drizzle.team/docs/insert)、[SQLite IMMEDIATE 事务](https://www.sqlite.org/lang_transaction.html)、[已验证 Unicode 库](https://github.com/avivkeller/unicode-case-folding)，并读取已安装版本类型定义。沿用现有 runtime 连接的 WAL、外键及 5 秒 busy timeout。

## 验收证据

| 场景           | 本轮真实验证                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 名称与 Unicode | 生产校验覆盖空白、控制字符、码点边界、NFC、完整折叠、全角/内部空白不同键；真实表复用首次显示形式                                                                |
| 并发创建       | 三个独立 Node24 进程各确认父进程持有的 SQLITE_BUSY，再竞争生产 prepareUploadSelection；仅一个 ID、首个成功事务的显示名保留                                      |
| 关联操作       | 同名多相册、重复加入时间不变、移出再加入更新时间、其他相册不受影响、逐图业务失败、任一目标缺失整图无写入、数据库触发器失败回滚                                  |
| 生命周期与查询 | private/failed/处理中/停用可管理；回收不能改关系；恢复保留原时间；隐藏关系随目标删除；重建同名目标不继承；固定次序、同值 ID 消歧、过滤后计数与分页              |
| 上传事务       | 真实 acceptOriginal 与 attachAcceptedImage 共用事务；删除相册或标签后同名重建仍失败；资产/对象/版本/任务/关系全部回滚，先前成功图片保留；后置调用者失败同样回滚 |
| 原文件责任     | 实际 PNG 写入生产 storage；接收失败后原字节和测试责任表仍在。测试责任表明确为测试调用者，不能代表尚未交付的 upload HTTP/session                                 |
| 迁移与运行     | 新表外键和唯一约束实际拒绝非法数据；生产空目录启动白名单新增四表，并断言其启动为空                                                                              |

## 实际环境与检查

Darwin 25.6.0 arm64，Node 24.18.1，pnpm 11.19.0，ICU 78.3 / Unicode 17.0，ImageMagick 7.1.2-31，ExifTool 13.55。执行前设置 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。

| 实际命令                                                                                                                                                                                                            | 结果                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                    | 通过，依赖移动后再次冻结安装通过                                                                           |
| `pnpm run db:generate`                                                                                                                                                                                              | 生成 0007，SQL/快照/日志已审查                                                                             |
| `pnpm run format:check`                                                                                                                                                                                             | 通过，含最终文档                                                                                           |
| `pnpm run lint` / `pnpm run typecheck`                                                                                                                                                                              | 通过，审计修复后重跑                                                                                       |
| `pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/collections-66/unit.xml`                                                                                                          | 20 文件、341 项通过，见 [XML](./unit.xml)                                                                  |
| `pnpm run build`                                                                                                                                                                                                    | 通过，审计修复后重跑，见 [构建日志](./build-final.txt)                                                     |
| `pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/collections-66/integration.xml`                                                                             | 40 文件、307 项通过，普通集成与真实媒体工具两组均执行，见 [XML](./integration.xml)                         |
| `pnpm exec vitest run --project unit tests/unit/collections --project integration tests/integration/collections --reporter=default --reporter=junit --outputFile=test-results/collections-66/collections-final.xml` | 审计修复后 6 文件、55 项通过，见 [XML](./collections-final.xml)；新增中间故障测试未包含在此前 307 项统计内 |
| `node docs/tasks/check.mjs` / `node docs/tasks/check.mjs --self-test`                                                                                                                                               | 120 任务、298 需求，无缺失/环；5 个拒绝样本通过                                                            |
| `git diff --check`                                                                                                                                                                                                  | 通过                                                                                                       |

本轮首次类型检查发现测试 fixture 的默认 UUID 参数被推断为模板类型；显式标注 string 后类型检查通过。构建保留已有 better-sqlite3 可选 Debug 二进制追踪诊断，退出码 0；生产启动集成真实运行 Release 二进制。没有跳过失败断言。

## 独立审计

按 `code-review-and-quality` 先审测试、再审正确性/简洁性/架构/安全/性能。发现一个 P2：批量 SQL 错误直接抛出，使已提交的前序结果丢失、后续图片停止。修复为逐图显式错误并保留原始 cause，其他图片继续执行。单张 prepare/attach 保持传播错误，以确保上传外层事务回滚。

增加三图中间 SQL 触发器失败及移除阶段失败回滚测试。[修复前实际失败](./audit-red.txt)为 2 failed / 6 passed；[修复后](./audit-green.txt)8/8 通过。独立复核重跑 model/upload 12 项全部通过，无剩余必须修复项。

## 浏览器回归

使用 `ego-browser` 技能和现有 Ego Lite / Chrome 152，TaskSpace 12。实际命令：

```sh
BROWSER_REPORT_DIR=test-results/collections-66/browser pnpm run test:browser
EGO_TASK_SPACE=12 BROWSER_REPORT_DIR=test-results/collections-66/browser-retry pnpm run test:browser
```

首次运行的首页、健康接口、资源、错误恢复、外壳和桌面初始化通过；桌面重启阶段在 `e2e/identity-session.mjs:265` 的登录限流计时断言失败。见[首次运行器](./browser-first-runner.json)和[失败阶段报告](./browser-first-identity-1440-restart.json)。该脚本和身份实现未在本任务修改。完整集成负载结束后使用同一空间和原断言重跑，退出码 0：首页、外壳、桌面/手机 setup 与 restart 全部通过，包含实际限流等待、会话续期/过期和退出失败恢复。见[最终运行器](./browser-retry/runner.json)、[桌面重启](./browser-retry/identity-1440-restart.json)、[手机重启](./browser-retry/identity-390-restart.json)。运行器清理临时目录，最后阶段按既有脚本关闭 TaskSpace。不把首次失败改写为通过；未修改身份模块或放宽断言，首次计时失败的根因未单独定位。

## 保留边界

管理界面、搜索列表、重命名、封面选择、邻居/完整筛选分别由 T-COL-02/03/04 和 library/sharing 后续任务实现。真实上传交接由 T-UP-01/T-UP-03/T-UP-05 联验；本轮不关闭这些验收。十万图片规模与深分页基准留给 T-LIB-03/T-QA-04。本 Issue 没有界面，Figma、主题、触控、软键盘和安全区没有新增验收对象。

当前工作流只有 release.published 和 workflow_call，无 PR/push 或 workflow_dispatch 入口。按[任务执行约定](../../tasks/execution.md#适用检查)，日常功能 PR 不要求发布期双架构结果；本轮不触发镜像发布或部署，AMD64/ARM64 和真实容器结果保持未执行。本地适用检查与独立审计已通过，PR 创建后回读远端状态。实现提交为 `3b5e0a4`；证据提交仅补文档。
