# EV-COLLECTIONS-01 标签 Unicode 与唯一性验证

日期：2026-09-22。关联 [Issue #65](https://github.com/dnslin/ariso-next/issues/65)，依据 [collections §3/11](../../../specs/SPEC-collections.md) 和[任务定义](../../gates.md#ev-collections-01-标签-unicode-与唯一性验证)。开始时 Issue 无评论，原生 blocked by 为空，blocking 为 #66（T-COL-01）。

## 交付范围与状态

本地实验三项验收通过：Unicode 规则符合规格；同名相册保持独立；重复标签和并发竞争不产生第二条。独立审计无必须修复项；双架构 Actions 尚待完成。既有身份页面浏览器回归失败，PR 保持草稿，不把部分回归成功表述为全部通过。

代码仅位于 `tests/experiments/collections/` 和对应测试、固定数据；另将实验接入现有 Docker 验证工作流。未创建 `src/server/collections`、生产迁移或界面，未改冻结 PRD。`R-16.1-01/02`、`R-16.2-01` 和 COL-01/02/03 这里只获得名称与唯一性前置证据，不代表完整业务验收；上传关联、真实图片模型、Web/API 统一输入和产品界面仍由 T-COL-01 及后续任务交付。

分支从 `origin/main` 的 `a30ae21` 建立，工作目录 `/Volumes/data/project/ariso-issue-65`。原目录已有 #61 改动，另有 #62 worktree；本次均未修改。

## 采用方案与依赖核对

- 使用 Node `String.prototype.normalize('NFC')` 和 `unicode-case-folding@1.1.1` 的 `caseFold(input: string): string`。核对现有 TypeScript/Node、Zod 类型及依赖锁文件后确认没有完整大小写折叠能力。新库仅是固定版本的开发依赖，无传递依赖，MIT，安装包展开 29,496 字节。没有手写生产映射表。
- 名称拒绝换行、Unicode Cc 控制字符（包括首尾的换行/制表符），再 trim、NFC、按 Unicode 码点计显示名称长度。标签上限 50，相册上限 100。标签键为完整默认折叠后再次 NFC，键的长度不作为显示名称长度。内部空白不合并，不用 NFKC。
- 独立预期值来自固定 Unicode 17.0.0 官方 `CaseFolding.txt` 的 C/F 条目。核对 1,585 个映射和全部 1,112,064 个有效码点，包括未映射码点保持不变。原始文件及许可证随测试保留，验证离线执行。
- 复用 `openRuntimeDatabase`，沿用 better-sqlite3 13.0.3、WAL、外键和 5 秒 busy timeout。临时标签表用 `normalized_key TEXT NOT NULL UNIQUE`；相册名称无唯一约束。SQLite 默认二进制比较接收应用生成的规范键，不能用只覆盖 ASCII 的 NOCASE 替代 Unicode 折叠。
- 创建在同步 `BEGIN IMMEDIATE` 事务中执行 `INSERT … ON CONFLICT(normalized_key) DO NOTHING`，随后读取胜出记录。重命名在同类短事务中读原键，原键不变即返回原显示形式；否则 UPDATE，由唯一约束拒绝冲突。事务不做异步工作；只处理预期唯一键竞争，真实故障继续抛出。

来源：[Unicode 默认大小写算法](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-3/)、[库源码与 API](https://github.com/avivkeller/unicode-case-folding)、[SQLite UPSERT](https://www.sqlite.org/lang_upsert.html)、[SQLite 事务](https://www.sqlite.org/lang_transaction.html)、[better-sqlite3 transaction API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---function)。后续升级 Unicode 或依赖时需要重新验证，不能从本次结果推断其他版本。

## 验收证据

完整输入、显示名称、规范键、数据库记录和冲突结果见 [macOS 原始报告](./macos.json)。

| 场景             | 实际断言                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 默认完整折叠     | ß/ẞ 与 ss、Σ/ς 与 σ、Cherokee、补充平面 Deseret；全部固定官方 C/F 映射一致                                                      |
| NFC 前后顺序     | 分解/预组 é 同键；折叠生成的 j+caron 再合成为 ǰ；组合标记顺序在折叠前规范化                                                     |
| 保持不同键       | I 与 İ/ı、带/不带重音、全角与 ASCII、① 与 1、一个/两个内部空格、内部 NBSP                                                       |
| 名称输入         | 29 个明确样本；空白/控制/换行拒绝；emoji 50/51、相册 100/101 边界；NFC 后计数；50 个 ß 可生成 100 字符键                        |
| 同名相册         | 两条相同名称记录有不同 ID；第三条不同名相册改为已用相册名，仍保留三个独立 ID                                                    |
| 串行重复/重命名  | 复用首次记录和显示名；同键改名无变化；异键改名保持 ID 与关系；冲突回滚，保留原名和关系                                          |
| 数据库约束       | 绕过 helper 直接重复 INSERT 得 `SQLITE_CONSTRAINT_UNIQUE`；受控触发器的 `SQLITE_CONSTRAINT_TRIGGER` 不被当作重复成功吞掉        |
| 并发创建         | 3 个独立 Node 进程争用 Go/go/GO；各进程真实遇到 `SQLITE_BUSY` 后参与竞争，返回相同 ID/显示形式，数据库仅一条                    |
| 并发重命名       | 两条标签争用同一目标键，一成功、一唯一冲突；失败方原记录和全部图片标签关系不变                                                  |
| 创建与重命名竞争 | 同一目标键最终仅一条；创建先完成时重命名冲突；重命名先完成时创建匹配它。每次实际胜出顺序记录在 JSON，不宣称单次运行遍历所有调度 |

父进程先等待所有连接准备，再持有真实写事务。子进程以零超时探测写锁并断言 SQLITE_BUSY，然后恢复 5 秒超时执行实际操作；父进程收到全部争用证据后释放锁。没有用串行 Promise、内存数据库或模拟返回值代替进程竞争。临时文件与子进程在结束后清理。

## 本地环境与实际命令

Darwin 25.6.0 arm64，Node 24.18.1，pnpm 11.19.0，ICU 78.3 / Unicode 17.0，SQLite 3.53.4。以报告中的实际环境为准。

```sh
export PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH
pnpm install --frozen-lockfile
pnpm exec vitest run --project unit tests/unit/collections/unicode-experiment.test.ts
pnpm exec vitest run --project integration tests/integration/collections/unicode-experiment.test.ts
node tests/experiments/collections/run.ts --report docs/tasks/evidence/EV-COLLECTIONS-01/macos.json
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run build:shell
pnpm run test:integration
pnpm run test:browser
pnpm audit --json
git diff --check
```

固定锁安装、格式、lint、类型、15 文件/243 项单元测试、生产构建、外壳构建、27 文件/205 项集成测试均通过。新增定向单元 12 项、定向集成 1 项、CLI 报告通过。采纳审计建议补强相册改名断言并明确 configuredPackageManager 字段后，定向 13 项、CLI、lint 和类型检查再次通过。实际 pnpm 版本由 `pnpm -v` 确认为 11.19.0。

生产构建输出已有 better-sqlite3 可选 Debug 二进制追踪提示，退出码 0；未隐藏诊断。`pnpm audit --json` 报告已有传递 esbuild 0.18.20 的 1 项 moderate 通告（开发服务器跨站请求），来自 drizzle-kit 链；新增 casefold 库无通告。本次不升级范围外依赖。

## 远端与审计

现有 `images.yml` 新增原生 AMD64/ARM64 实验命令，报告保存为 `collections-verification-{arch}`。其后执行原有完整应用镜像构建与容器检查。PR 事件只构建验证，不满足 release 发布条件，不推送镜像或部署。尚未取得本轮远端结果，保持未完成。

独立子代理按 `code-review-and-quality` 先审测试，再核对 Unicode 规则、唯一约束和真实竞争、错误传播、实验边界及依赖。无必须修复项；两项建议已落实：把不同名相册改成已有名称并检查三条独立记录；将声明的包管理器字段标明 configuredPackageManager。独立审计者也实际运行定向 13 项测试及 `git diff --check`，均通过。

本 Issue 无 collections 产品界面，Figma、手机软键盘/安全区域等不适用；既有浏览器回归结果仅作为回归证据。生产 schema 未变，不运行 `db:generate`。

## 未完成与范围外问题

`pnpm run test:browser` 使用现有 Ego Lite / Chrome 152、TaskSpace 4，退出码 1。首页、资源、健康接口、错误恢复和外壳阶段已完成；桌面 setup 在 `e2e/identity.mjs:204` 失败：聚焦后字段组 outline 宽度期望 `0px`、实际 `2px`。其后的身份流程没有执行。见 [运行器报告](./browser-runner.json) 和 [初始化失败报告](./browser-identity-failure.json)。没有把该项标为通过，也未改身份页面、CSS 或断言。失败 TaskSpace 按 Ego 规则保留；自建服务与临时目录已清理。

该检查及对应生产界面与分支基线相同，本次只新增实验和开发依赖。此范围外问题需所属身份/外壳任务处理；本 PR 保留草稿，待该回归恢复后再转正式评审。生产 collections、上传关系、管理界面、跨浏览器矩阵仍不属于本前置实验。
