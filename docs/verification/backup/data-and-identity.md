# 本地备份数据、启用与身份暂停验证

日期：2026-10-22。工作树 `codex/backup-restore-prototype`。本记录对应正式实现的数据/启用及身份写入边界，不代表整个备份产品、浏览器流程或发布形态已经验收。

## 已实现

- 从 SQLite backup API 创建一致副本，只归整副本。保留所有者、密码哈希、上传 Token、图片/相册/标签/分享关系及 queued/failed 持久任务；清除旧会话、一次性验证、分享 grant、上传临时状态、预览、探测与扫描历史。
- 数据库决定必需对象清单。包含停用本地存储、回收站、持久候选和任务保存的水印路径。永久删除记录保留删除语义，不要求已经清理的文件重新出现。第一阶段拒绝任何 S3 配置，缺必需文件或大小不符使完整备份失败。
- 校验应用版本/修订、数据库迁移版本、摘要、关系、必需条目及大小后，将认证后的 ZIP 内容写到任务的 ready 目录。逐项 CRC/长度由格式层验证；GitHub、SMTP 及存储加密字段转换到新实例密钥。保留相对本地划分，并重建没有对象的本地配置目录。
- ready 目录内容同步完成后才交给协调器发布 ready。启动启用发生在普通业务目录初始化和正式开库前；旧 DB/WAL/SHM 一并移出，目录和完成记录重放补同步。completed 后只补同步并正常启动，绝不重新覆盖数据库。
- CLI 改密在打开数据库前及实际写事务前检查 activating。检查函数与既有 CLI 密码恢复放在同一身份模块，仅读取任务状态，不引入启动、迁移或 SMTP 依赖。普通备份不因备份状态阻断紧急 CLI 改密；ready 的空实例仍按原有“未初始化”处理，completed 后恢复正常改密。

## 身份暂停边界

账号邮箱/密码、GitHub 绑定/解绑、上传 Token 管理及 GitHub/SMTP 设置写入均先检查所有者 Cookie 和 Origin，再登记内容修改。暂停时返回 `409 SITE_BACKUP_IN_PROGRESS`，不读取业务请求体或启动库写入。GET 读取继续。

实际邮件密码重置是匿名凭据接口。Better Auth 1.7.5 会先消费验证 Token，再计算新密码。因此仅在 `POST /api/auth/reset-password` 外包住整个库 handler：暂停时优先返回 409，不消费 Token；已经准入的请求完整结束后，备份准备才可继续。此接口的暂停优先与管理 Cookie/Origin 接口的鉴权优先分别记录。登录、续期、申请找回邮件和 GET 重置链接继续使用原有认证流程。

GitHub 只在 account/github 的实际新增处登记。晚到的新绑定被暂停时沿用账号页错误回跳，错误值为 `site_backup_in_progress`；恢复后重新发起授权。已有绑定的登录和账号更新继续。对应前端提示由界面实现记录负责，本记录不替代浏览器验收。

## 实际检查

使用 Node 24.18.1 与 pnpm 11.19.0。以下测试全部使用独立临时目录/数据库，无生产站点数据。

| 命令/范围                                                                                                                                                                                                                                                                 | 结果                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `pnpm exec vitest run --project integration tests/integration/backup/snapshot.test.ts tests/integration/backup/restore-local.test.ts tests/integration/backup/activation.test.ts tests/integration/backup/cli-activation.test.ts tests/integration/storage/local.test.ts` | 5 个文件、52 项通过                        |
| `pnpm exec vitest run --project integration tests/integration/backup/restore-local.test.ts`                                                                                                                                                                               | 补充空本地配置目录后，2 项重跑通过         |
| `pnpm exec vitest run --project integration tests/integration/backup/activation.test.ts tests/integration/backup/cli-activation.test.ts`                                                                                                                                  | CLI 状态读取保持轻依赖后，29 项重跑通过    |
| `pnpm exec vitest run --project integration tests/integration/identity/oauth.test.ts tests/integration/identity/password-reset.test.ts tests/integration/identity/login-race.test.ts tests/integration/backup/identity-mutation-routes.test.ts`                           | 4 个文件、67 项通过                        |
| 本记录范围内源文件、路由和测试的 ESLint `--max-warnings=0`                                                                                                                                                                                                                | 通过                                       |
| 本记录范围内源文件、路由和测试的 Prettier `--check`                                                                                                                                                                                                                       | 通过                                       |
| `pnpm exec tsc --noEmit --project tsconfig.json`                                                                                                                                                                                                                          | 身份集成后通过；根任务仍须完成最终全量检查 |

归档恢复测试在生成文件后关闭并删除原 DATA_DIR，验证只凭归档恢复字节、关系和配置。测试使用确定的二进制内容检查数据保持，不代替真实媒体处理器或浏览器上传验收。

启用的最新 28 项包含 24 个真实 SIGKILL 检查点，覆盖状态临时写入/同步/改名、storage/assets 移动、真实 SQLite 旧 WAL/SHM 移出、新 DB 发布和完成记录。另验证非空目录保护、completed 后新密码及编辑不被覆盖。CLI 使用实际 PTY 启动源码入口，证明在正式 DB 文件缺失时仍先报告 activating；实际密码哈希途中出现 activating 也会阻止写入。

身份新增用例包含 10 个实际 handler 的暂停与认证优先矩阵（20 项），以及真实库和 SQLite 的 OAuth/密码恢复场景。OAuth 只替换提供商 HTTP，邮件请求沿用本地测试夹具；没有连接真实 GitHub 或外部收件箱。

最后另运行 `pnpm exec tsc --noEmit --project tsconfig.runtime.json`，通过；CLI 轻依赖调整后的源文件定向 ESLint 和 `git diff --check` 通过。

## 先失败后实现与修正

数据快照、恢复、启用测试先因正式模块缺失失败，再实现对应模块。水印测试另暴露了只看当前素材表会遗漏已保存任务路径的问题，改为从任务快照推导实际依赖后通过。

身份 handler 矩阵首轮 10 失败、10 通过；接入 gate 后 20 项通过。4 个新增认证场景首轮 3 失败、1 通过，接入整个重置请求和 GitHub 实际新增边界后通过。

完整子进程验证曾分别被新增 Error 类的 TypeScript 参数属性阻断。已按项目惯例改为显式字段赋值；没有增加 transform flags、放宽断言或改超时。最终真实 Node 24 子进程回归通过。

独立复核补充发现：空白新实例的真实后台扫描会自动产生 `storage_scans` 行。原空白检查把该运维记录当成业务数据而拒绝恢复。已先用真实 `startStorageMaintenance.scan()` 重现失败，再仅将 `storage_scans` 加入允许范围；图、用户、关系和非空文件检查保持不变。`pnpm exec vitest run --project integration tests/integration/backup/activation.test.ts` 最后完整重跑 28 项通过，覆盖 API 空白判断与最终启用。

## 尚未验证

本记录不包含根任务的真实 Web 备份/下载/新实例恢复闭环、最终 standalone/容器打包、S3、物理断电、实际 GitHub 服务或外部邮件送达。SIGKILL 不等于物理断电。最终产品交付仍以根任务的组合测试、浏览器和发布形态记录为准；本轮不发布部署。
