# T-STO-03 多本地/S3 配置与默认选择

关联 [Issue #156](https://github.com/dnslin/ariso-next/issues/156)，范围以[任务卡](../../tasks/m3-m4-platform.md#t-sto-03-多本地s3-配置与默认选择提供方)和 [storage §3–6](../../specs/SPEC-storage.md#3-数据模型与状态)为准。需求编号 R-9.1-01、R-9.1-02、R-9.2-01、R-9.3-01、R-24.2-02、R-24.2-03 保留；本任务不代表整个需求或存储管理模块完成。

## 前置与实际范围

2026-09-29 使用 `gh issue view 156 --json number,title,body,comments,state,url` 及 GitHub `issues/156/dependencies/blocked_by`、`blocking` 回读：无评论，直接前置 #155、#53 均 closed；直接后置 #157、#194 仍 open。同时核对已合入 main 的 S3 模块、所有者鉴权及各自实施记录。从最新 `origin/main`（`279a84f`）创建独立 worktree 与分支 `codex/storage-settings-156`。原目录 `/Volumes/data/project/ariso` 的未提交文档整理和预览数据未修改。

本轮只交付后端持久行为与所有者 API，没有页面、公共布局或设计变更。Figma 节点、逐项设计还原和 UI 人工验收不适用；浏览器仅回归已有产品流程。完整管理界面由 T-STO-07 承接，仍须按用户要求人工验收。

## 实现与调用契约

- `storage_configs` 增加 S3 字段、加密凭据、配置 revision、连接及 CORS 结果所属 revision。输入使用现有 Zod，local/s3 严格互斥；本地路径复用现有根内文件系统检查，S3 Prefix 去除首尾斜线并为现有图片 Key 保留字节空间。
- `settings.ts` 提供 `createStorage`、`readStorage`、`listStorages`、`updateStorage`、`readStorageSettings`、`setDefaultStorage`、`verifyStorageSecrets`。写入使用已经解析的输入及显式 `{storageRoot, secretCrypto}`；不读取环境凭据、不联系对象服务。
- 两项秘密使用现有 AES-256-GCM 加密。省略保留；真实字符串替换；`null` 只清除该项。空字符串及脱敏占位值拒绝。读取仅提供 `hasAccessKey` / `hasSecretKey`，不返回明文或密文。相同秘密不增加 revision；实际替换或清除增加 revision、清除旧检测归属并停用。改名、默认选择和启停不增加 revision。
- 新 S3 强制保存为停用。启用要求完整凭据且连接检测通过、revision 与当前配置一致。客户端不能写 passed 或 revision；本轮没有真实探测入口，T-STO-04 交付后才能正常完成 S3 启用。测试直接种入历史结果只验证状态规则，不冒充连接验证。
- 默认可清空；之后停用默认时保留指针，不选择其他存储。初始化标记保存在 settings 单行，重启不补建默认。通用 `resolveUploadStorage` 仍为分配提供方；既有本地业务通过 `resolveLocalUploadStorage` 明确拒绝尚未接入的 S3。对应已有测试夹具只作必要类型适配。
- 同根本地配置仍各自使用 `ariso/<storageId>/`。既有图片和后续派生对象继续使用已保存的 storageId，默认变化不重定向。
- 迁移 `0010_giant_moondragon.sql` 用临时列复制、删除旧列和重命名使 local_path 可空，再增加 S3 列。保留原父表，不关闭或延迟外键；已有默认、图片、对象、上传记录在真实 0009→0010 升级测试中保留。自动生成的重建 SQL 不能直接应用：它引用旧表不存在的新列，且父表删除影响已有外键。修改后的 SQL 与生成快照保持同一最终结构。

HTTP 路由复用所有者 Cookie 和写入 origin 校验，均设置 `Cache-Control: no-store`：

| 入口                              | 本轮行为                                              |
| --------------------------------- | ----------------------------------------------------- |
| `GET/POST /api/storages`          | 脱敏列表、创建 local/S3                               |
| `GET/PATCH /api/storages/:id`     | 脱敏详情；仅名称、启停、Access Key、Secret Key 可修改 |
| `GET/PATCH /api/settings/storage` | 读取、设置或清空 defaultStorageId                     |

位置与类型字段不在 PATCH 输入中，DELETE 不提供。完整引用汇总、位置修改失效、配置删除及孤儿扫描由 T-STO-06 承接，不以零引用占位开放入口。S3 上传、派生处理及公开访问分别由既定后续调用方任务接入。R2/SeaweedFS 真实探测与 CORS 不在本次无网络配置保存任务中，不能将本地通过写成远端服务通过。

prestart 与 Web 初始化都显式解密全部已有秘密，包括停用配置。失败保留 storageId 和字段上下文，提示恢复原密钥或备份；不清空字段。HTTP 校验失败不记录输入，持久化错误只记录底层诊断，避免 Drizzle 绑定参数带出秘密。

## 验证与审计

环境：macOS ARM64，Node v24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-32、ExifTool 13.55。Node 24 通过命令 PATH 指定，网络代理未改全局配置；本地服务 NO_PROXY/no_proxy 在保留既有值后补充 localhost、127.0.0.1、::1、.localhost。数据库、进程和浏览器数据均使用独立临时目录。

新增提供方测试覆盖真实 SQLite 密文、秘密操作、revision、默认重启、同目录同 Key 字节隔离、图片归属和有引用升级；新增生产 HTTP 测试覆盖真实 Cookie 权限、错误 origin、字段校验、秘密不回显、数据库失败与重试、独立 prestart 错密钥退出及正确密钥恢复。

先执行基线构建，再运行新 HTTP 测试，3 项因路由 404 失败，确认本轮能力尚不存在。实现后首轮聚焦两个文件 25 项通过。首次格式检查指出两份新生成的迁移元数据未格式化，已按项目 Prettier 修复；没有更改其数据内容。

独立 agent 使用 `code-review-and-quality` 完成全部生产代码与后续修复审计，结论为通过，无待修复必改问题。审计者独立执行配置单元与提供方集成 **26/26**，并检查差异。审计建议补充尚未接入 S3 的上传边界测试；已补实际 HTTP 的显式/默认选择，确认 409 / STORAGE_TYPE_UNSUPPORTED 且上传会话和提交表无新增，HTTP **5/5** 通过。

首轮完整集成 **9 文件失败 / 66 文件通过，28 项失败 / 558 项通过**。失败暴露旧夹具缺少新迁移、无列名七列 INSERT，以及新 HTTP 入口使用 join 导致 Next 将源码与测试文件收入 standalone。先通过既有失败断言重现，再更新三个启动夹具的实际迁移与精确历史记录、实验 INSERT 的明确列名，并按现有 server-start 模式使用 resolve 构造绝对运行路径。未删除测试或放宽断言。修复后重新构建，隔离产物、日志检查 **12/12**，启动和秘密恢复 **17/17**，prestart 与图库 SQLite **18 项**通过。后者首次聚焦命令中的 logging 因与产物重建重叠而未执行，随后独立 12/12 已补齐，不能把首次整条命令标通过。

首轮还出现开发重编译 120 秒超时和进程检查未按预期退出。同期浏览器在桌面 M2 上传等待超时；服务日志明确记录 `ps` 超过现有 1000ms，导致媒体任务失败。保留[浏览器失败报告](./browser-first/runner.json)、[页面等待失败](./browser-first/m2-failure.json)及[不含进程清单的诊断](./browser-first/process-timeout.json)。未修改产品时限或媒体逻辑；后续按单进程集成、再浏览器的顺序重跑，结果单独记录，首次失败不改写为通过。

最终单进程集成 **75 文件 / 596 项全部通过，620.59 秒**，包括普通集成和真实图片工具组。此前开发重编译与进程检查超时未复现；没有把这次通过表述为已修复系统负载问题。单元 **35 文件 / 529 项通过**；冻结安装、迁移生成、格式、lint、类型、无部署环境构建、文档依赖及 5 项自测均通过。构建仍有既有 better-sqlite3 可选 Debug 绑定路径追踪警告，构建退出 0 且隔离产物测试通过。浏览器第二轮曾未通过，后续完整重试通过，详情如下。实际命令汇总见 [local-checks.json](./local-checks.json)，本机原始日志位于 `/tmp/ariso-156-*.log`。

发布边界遵守[执行约定](../../tasks/execution.md#适用检查)：本次不创建 Release、发布镜像或部署；AMD64/ARM64 镜像和容器验证留在 Release 流程，未标通过。不会主动合并 PR、关闭 Issue、删除分支或 worktree。

## 历史验证阻塞与草稿状态

第二轮浏览器按顺序独立运行，使用同一 Ego Lite TaskSpace 2 和新的临时数据。桌面 M2、交互、工作区连续性，以及手机身份、图库、上传和轮询检查通过。手机 `m2-390-before` 在原有 300000ms 脚本时限被中止，未生成该阶段完成报告。服务日志确认手机公开和私有 JPG 均已上传并完成派生；公开 JPG 恢复后的原图字节也已读取。无法从当前日志确定具体挂起的浏览器操作，不能认定为本次代码缺陷，也不能认定与本次改动无关。未放宽时限、跳过断言或修改媒体/UI 逻辑。

保留[第二轮总报告](./browser-final/runner.json)、[停点上下文](./browser-final/timeout-context.json)及同目录已完成子报告。手机剩余 M2、重启、交互、工作区连续性与末尾 UI fixture 检查未完成；截图和成功子场景不替代整套通过。因适用浏览器检查未通过，PR 保留草稿，任务尚未达到正式待评审条件。

独立审计者再次只读核对第二轮报告、空阶段日志和运行器，确认当前证据不足以归因；代码审计结论不变，但建议保留草稿，不将浏览器验收标完成。证据整理后重跑 `pnpm run format:check`、`node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test` 和 `git diff --check`，全部通过。

已推送分支 `codex/storage-settings-156` 并创建[草稿 PR #207](https://github.com/dnslin/ariso-next/pull/207)。使用 `gh pr view 207 --json url,state,isDraft,headRefName,statusCheckRollup` 确认 OPEN、isDraft=true、检查列表为空；`gh pr checks 207` 返回 no checks reported，`gh run list --branch codex/storage-settings-156 --json databaseId,status,conclusion,name,url` 返回空数组。当前没有远端检查或工作流运行，不记为 CI 通过，也不等待不存在的检查。

## 用户要求重试：测试空间缺失

再次执行 `EGO_TASK_SPACE=2 BROWSER_REPORT_DIR=test-results/storage-156-browser-retry3 pnpm run test:browser`，外壳与 UI 夹具构建完成，但浏览器启动即返回 `task space not found: 2`，退出 1，尚未进入业务验证。`ego-browser nodejs` 中调用 `listTaskSpaces()` 返回空列表。保留[第三次报告](./browser-retry3/runner.json)与[Ego 错误](./browser-retry3/ego.log)。按 ego-browser 技能要求，未自行新建空间恢复，已请求用户允许新建测试空间；PR 保持草稿，历史验证结论不变。

## 最终浏览器重试通过

用户明确允许新建测试空间后，创建 Ego Lite 空间（新分配 ID 仍为 2）。在同一未修改的生产代码与测试脚本上执行 `EGO_TASK_SPACE=2 BROWSER_REPORT_DIR=test-results/storage-156-browser-retry4 pnpm run test:browser`，**退出 0，完整通过**。运行时间为 2026-09-29 02:26:23–02:41:01 UTC，Node 24.18.1 / macOS ARM64。所有测试使用独立临时数据，结束后运行器删除临时目录并关闭测试空间。

[最终总报告](./browser-passed/runner.json)及同目录子报告包含：桌面/手机身份初始化与重启、M2、交互、工作区连续性，图库、公共页面、上传与轮询；[UI 夹具报告](./browser-passed/ui/browser.json)验证浅深色、360/390/430/768/1440 宽度、键盘与焦点、短视口及适用状态。全部原始截图仍保存在本 worktree 的 `test-results/storage-156-browser-retry4/`。本 Issue 没有 UI 改动，本次为既有页面功能回归，不冒充新增设计验收。

此前手机 M2 超时本轮未复现，没有放宽时限、跳过断言或修改产品代码，不能将重试通过表述为已定位或修复间歇超时根因。历史失败报告继续保留。本次适用浏览器验证阻塞已解除，结合此前通过的本地检查和独立代码审计，PR 可转正式待评审。发布容器与双架构检查仍按 Release 流程执行，未标通过。
