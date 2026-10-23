# PR #297 评审修复

日期：2026-10-23。只处理两份评审的问题和已有 CI 失败；未使用本地 Docker/Colima，未合并或部署。

## 修改

- 空白实例配置白名单加入 `access_protection_settings`。迁移默认记录不再被误当成业务数据；已有所有者、业务数据及目录文件的拒绝规则不变。
- 访问防护 PATCH 通过既有 `contentMutations` 准入，顺序为所有者鉴权、暂停判断、解析和写入。GET 仍可读；已准入的写入参与备份排空。
- 普通 S3 与恢复目标共用固定五阶段检测和报告编排。各自继续持有探测记录、命名空间所有权、写入及清理策略，没有把恢复的未知操作清理替换为普通直接删除。`restore-remote.ts` 从 1062 行降为 989 行。
- 三个独立 pending 可选字段收为整体 `put/delete` 判别联合；保留 PUT 的 startedEmpty 事实、未知 DELETE 不重发和凭据修复时保留责任。
- S3 验证脚本在源连接失败时保留已脱敏的阶段结果，不再只显示 passed=false。

## CI 旧轮的准确原因

运行 `39887163342`：checks 通过。Media tools 的 Local 恢复失败为 `RESTORE_TARGET_NOT_EMPTY`，对应默认表白名单缺口；S3 用例则在源存储检测返回 passed=false 时失败，原日志没有具体阶段，不能与白名单合并归因。Production integration 在运行测试时收到 runner shutdown 信号并中断，没有测试失败汇总，不据此修改产品行为或增加重试掩盖失败。

## 本轮实际检查

| 命令/范围                                                                    | 结果                                                                                                                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| activation 默认空实例、访问防护 PATCH 两项矩阵，修复前定向执行               | 2 项失败、1 项通过，证明两个缺口                                                                                                         |
| `vitest --project integration`：activation、mutation-routes、restore-runtime | 3 文件 128 项通过；包含 GET 可读和在途写入等待                                                                                           |
| `vitest --project integration`：restore-remote、storage/probes               | 2 文件 41 项通过；未削弱已存在的迟到 PUT/DELETE、重试及清理断言                                                                          |
| `pnpm run typecheck`、修改文件 ESLint/Prettier、`git diff --check`           | 通过                                                                                                                                     |
| `pnpm run build`                                                             | 默认 Turbopack 与 standalone 原生依赖检查通过；Next.js 16.4.1，显式本地构建版本 `v1.2.1-pr297.1`，revision `3b954396` 对应的完整提交 SHA |
| `vitest --project media-tools`：仅选原 CI 失败的 Local 与 S3 packaged 用例   | 2 项通过，约 21 秒；第三个无关用例由命令过滤，未修改或删除测试                                                                           |

这些是修改直接相关的检查，没有重新执行全量单元、全量集成、浏览器、真实提供方矩阵或本地容器。更新 PR 后的标准远端 CI 单独核对，不能用本表替代其结果。

## 第二轮 CI 的独立问题与修复

运行 `39889395329` 的 checks 通过。Local 恢复已经通过；Media tools 仅 S3 用例失败，新增诊断准确指出 configuration 阶段 `uv_os_homedir returned ENOENT`。媒体容器按 runner UID 运行，UID 不一定存在于镜像 passwd；测试启动器清空继承环境，又未提供 HOME。现在只为备份测试子进程设置已有临时目录为隔离 HOME，不修改宿主 HOME，也不修改产品 S3 检测门槛。

Production integration 的四个失败全部为 standalone 混入 src/tests 等源码与夹具。Next 对构建身份的动态 `readFileSync` 追踪了整个项目；读取现改由 Node 内置模块运行时执行。版本/修订校验及 metadata 显式打包保持不变，没有全局排除、构建后删除文件、切换构建器或弱化包边界断言。

本轮只额外执行：构建身份单元 4/4、两文件定向 lint/格式检查，一次必要的默认 Turbopack 构建，以及四个失败包边界文件的 24/24 项和原 S3 packaged 用例 1/1。新的显式本地构建为 `v1.2.1-pr297.2`，源码 revision `ef097d61` 对应完整提交。四个边界文件为 runtime 下的 health、logging、secret-preflight、standalone；没有重跑其他集成文件。

本轮修复后的标准远端 CI 结果在 PR 描述中更新，避免仅为写入 CI 状态再次触发整套检查。暂不合并或部署。
