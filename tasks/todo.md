# 备份与恢复任务拆分

- 状态：本地与 S3 备份、下载、空白实例恢复代码已实现。本地阶段的 HTTP、浏览器与 ARM64 记录保留；S3 小样本提供方、浏览器与最终专项复核已完成，见 [S3 实施记录](../docs/verification/backup-implementation/s3.md)。AMD64及用户人工验收尚未完成。勾选只代表该项标明的已验证范围，不能外推为全部方案完成。
- 依据：[技术方案](./plan.md)、[产品规格](../docs/specs/SPEC-backup.md)、已获用户认可的交互原型。
- 用户先授权本地闭环，随后授权继续实现 S3，均暂不发布部署。本地[实施记录](../docs/verification/backup-implementation/README.md)与先行[实验记录](../docs/verification/backup-experiments/README.md)保留历史范围；本轮真实验证使用小样本，不执行大文件或容量压测。
- [x] 已确认原型的关键状态同步至 Figma：60 张可编辑画板、128 个主要流程连接；范围和验收边界见[Figma 记录](../docs/verification/backup-figma/README.md)。E 组已接入真实 API；当前正式页面的浏览器与设计对照另行验收。

## 验证约定

表中引用当前实现及测试入口。S3 项代码已接入，未勾选的验收条件仍待跨架构、人工或规模验收收齐；测试文件存在不等于本轮运行通过，实际命令和结果以实施记录为准：

- U：`pnpm exec vitest run --project unit <表中测试文件>`。
- I：`pnpm exec vitest run --project integration <表中测试文件>`。
- E：执行该行注明的独立 Node 实验入口并记录环境。新增 backup 实验没有接入历史 Vitest experiments 项目，不能用 `pnpm run test:experiments` 冒充已运行本轮实验。
- UI：`pnpm run test:browser`，新场景接入现有运行器；先完成构建再运行。
- 每个产品交付检查点实际运行 `pnpm run lint`、`pnpm run typecheck`、`pnpm run test:unit`、`pnpm run build`、`pnpm run test:integration`。依赖安装与格式按项目验证指南执行。
- 默认每项最多约 5 个实现/测试文件。文件列是具体切分边界；新增其他独立责任前继续拆任务，不把整组路由或整个模块暗中塞进一项。

## A. 先验证格式和启用方式

### A01 — 归档与加密隔离实验

- [x] 验证 ZIP64＋age 流式往返，并与官方 age 工具互通；覆盖中文名、>4 GiB、>65,535 条目、错误密码、篡改与截断。
- [x] 测量 Node 24 下工作线程 KDF、十万条目中央目录的峰值内存及独立 HTTP 探针响应；验证取消真的结束线程和流。
- 文件：[format 实验目录](../tests/experiments/backup/format/README.md)，主入口 `run.mjs`，另有 worker、归档辅助、CLI 驱动和独立测量入口。
- 验证：`node tests/experiments/backup/format/run.mjs --all`，15 项通过；`fresh-memory.mjs` 独立进程测量和 `--compare` 两轮 writer 对照通过。
- 边界：十万对象约 1.1 GiB RSS，不承诺小内存容器。该规模实验未验证真实 Ariso 响应或容器容量；小规模正式 HTTP 和打包另有实施记录，不降低加密参数。

### A02 — 恢复启用断点实验

- [x] 在文件/目录同步、移动 storage/assets、移走旧 DB/WAL、发布新 DB、完成记录前后终止进程，证明实验模型下次启动可重复继续；不会先重建目标占位目录。
- [x] 实验模型中半成品不会启动清理；completed 之后重启不会再次覆盖数据库；模型 CLI 改密不会在启用重试中丢失。
- [x] 真实 HTTP 分片接收覆盖顺序、重复/乱序、短块回退、重置竞态和累计传输超过单请求期限。
- 文件：[activation 实验目录](../tests/experiments/backup/activation/README.md)，`run.mjs`、`model.mjs`、`fixture.mjs`、`worker.mjs`、`chunks.mjs` 与报告。
- 验证：`node tests/experiments/backup/activation/run.mjs` 36 项通过，含 27 个真实 SIGKILL 检查点；`chunks.mjs` 5 项通过。使用临时 SQLite/WAL 和进程，不连接现有站点；物理断电、正式启动/CLI 接入和真实 31 分钟传输未验证。
- 依赖：无，可与 A01 并行。

### A03 — 可信的运行版本信息

- [x] 构建阶段写入版本和提交修订；不从开发 package 版本或临时目录推断正式版本。
- 文件：`scripts/build-metadata.mjs`、`package.json`、`src/server/runtime/build-info.ts`、`tests/unit/runtime/build-info.test.ts`。
- 验证：U `tests/unit/runtime/build-info.test.ts`；无发布信息时应用照常启动，但不冒充正式版本备份。
- 依赖：无。

### A04 — 发布与 standalone 传递版本

- [x] 发布工作流与 Docker 构建参数接入显式版本/revision，standalone 包含相同元数据，真实本地包已读取并使用。
- [ ] AMD64/ARM64 容器均验证相同身份和实际备份恢复；本轮尚未发布镜像。
- 文件：`Dockerfile`、`.github/workflows/images.yml`、`scripts/package-standalone.mjs`、`scripts/verify-release-image.mjs`、`tests/unit/runtime/verify-release-image.test.ts`。
- 验证：U 对应文件；按部署指南运行隔离发布形态验证，不实际发布镜像。
- 依赖：A03。

### A05 — 锁定通过实验的依赖

- [x] 只引入 A01 验证通过的 age/ZIP 读取库及必要类型，锁定解析结果，不升级无关依赖。
- [x] 冻结安装与锁定版本实验通过；age-encryption 为 BSD-3-Clause，yauzl 及其类型为 MIT。
- [x] 真实 worker 已从 standalone 运行完整本地备份、解密和恢复。
- [ ] 最终包纯净性与容器验证结果收齐，不能以 worker 可运行替代。
- 文件：`package.json`、`pnpm-lock.yaml`。
- 验证：安装和实验见记录；实际 worker 和 HTTP 运行结果见实施记录；根项目构建不能代替独立运行。
- 依赖：A01。

### A06 — 正式格式编解码

- [x] 采用通过 A01 的库和固定 profile；单流大文件、头部资源上限、CRC/大小、终块及 `.part` 完成规则成立。
- 文件：`src/server/backup/format.ts`、`archive.ts`、`decrypt.ts`、`tests/integration/backup/archive.test.ts`。
- 验证：I `tests/integration/backup/archive.test.ts`；A01 用例对正式模块重跑，并在目标容器按对象/版本数与浏览并发核定内存预算，不能仅凭库实验或 scrypt 工作区验收容量。
- 依赖：A01、A05、A03。

### A07 — 任务记录与工作线程

- [x] 任务元数据原子保存，启动后中断任务可见，旧记录不重新冻结站点；密码和凭据不落任务记录。
- [x] 单个 worker 承担重计算，退出可等待，standalone 真正包含 worker 及依赖。
- 文件：`src/server/backup/jobs.ts`、`worker.ts`、`src/cli/backup-worker.ts`、`scripts/package-standalone.mjs`、`tests/integration/backup/worker.test.ts`。
- 验证：I `tests/integration/backup/worker.test.ts`，含进程退出和独立打包运行。
- 依赖：A06、A04。

### 检查点 C1

- [x] 格式、资源与启用实验报告可复查；候选版本已锁定，正式编解码有实际回归用例。
- [x] 正式业务入口在暂停保护与完整流程接通后开放；当前包含 Local/S3，缺少构建身份时仍明确拒绝。

## B. 内容暂停基础与后台调度

| 任务               | 范围与验收                                                                   | 文件边界                                                                                    | 定向验证                                                                                                      | 依赖     |
| ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| [x] B01 修改准入   | 同步关闭入口、活动计数 finally 释放，读取不受影响；没有通用 HTTP 方法封禁    | `runtime/content-mutations.ts`、`backup/errors.ts`、`startup/server-start.ts`、对应单元测试 | U `tests/unit/backup/content-mutations.test.ts`                                                               | 无       |
| [x] B02 媒体暂停   | 停领取持久任务与持久清理，preview 继续；resume 不运行启动恢复                | `media/queue.ts`、`tests/integration/media/queue.test.ts`、新预览测试                       | I `tests/integration/backup/read-during-backup.test.ts`                                                       | B01      |
| [x] B03 上传结算   | 公开上传从创建 receipt 到派生结果全程登记；上传维护可暂停，不修改 900 秒契约 | `upload/public-http.ts`、`upload/runtime.ts`、两份集成测试                                  | I `tests/integration/backup/public-upload-drain.test.ts`、`tests/integration/backup/background-pause.test.ts` | B01、B02 |
| [x] B04 存储暂停   | 扫描及探测停止下一批，当前批次可完成；取消准备不取消正常清理                 | `storage/maintenance.ts`、`storage/probe-runtime.ts`、两份集成测试                          | I `tests/integration/backup/background-pause.test.ts`                                                         | B01      |
| [x] B05 素材稳定点 | 水印清理可暂停，branding ready/active 可等待；素材读取继续                   | `media/watermark-runtime.ts`、`site/branding.ts`、两份集成测试                              | I `tests/integration/backup/branding-idle.test.ts`                                                            | B01      |
| [x] B06 错误透传   | 共有 HTTP helper 保留 409 暂停错误，正常鉴权和领域错误不变                   | `collections/http.ts`、`sharing/http.ts`、`media/cleanup-http.ts`、回归测试                 | I `tests/integration/backup/mutation-routes.test.ts`                                                          | B01      |
| [x] B07 认证边界   | 登录/续期/已绑定 OAuth 可用；实际改密和迟到 GitHub 新绑定被暂停              | `identity/auth.ts`、`identity/account.ts`、两份身份测试                                     | I `tests/integration/backup/identity-mutation-routes.test.ts`                                                 | B01、B06 |

以上文件均位于 `src/server/`，测试路径按表中列出。已有相应测试可在原文件中增加场景，不为了凑文件数复制测试。

### B08 — 写入口接入批次

每行是独立任务，不是一个几十文件的大任务。每批最多 3 个 route 文件、1 个现有 response helper 和 1 个真实 handler 测试。下列路径省略 `src/app` 和末尾 `/route.ts`；同一 route 内只登记列出的修改方法，读取方法保留。每行依赖 B01、B06；涉及身份另依赖 B07。

共同验收：关闭准入后在业务副作用前返回 `409 SITE_BACKUP_IN_PROGRESS`；再次开放后原行为恢复；鉴权失败仍优先返回原认证错误。测试必须真正调用 handler，不能只验证一张路由分类表。

| 任务    | 路由及方法                                                                                                                    | 验证                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [x] W01 | `/api/account/email` PATCH；`/api/account/password` POST；`/api/account/github` DELETE                                        | I `tests/integration/backup/identity-mutation-routes.test.ts` |
| [x] W02 | `/api/account/github/link` POST；`/api/upload-tokens` POST；`/api/upload-tokens/[id]` PATCH/DELETE                            | I `tests/integration/backup/identity-mutation-routes.test.ts` |
| [x] W03 | `/api/albums` POST；`/api/albums/[id]` PATCH/DELETE；`/api/albums/[id]/cover` PUT                                             | I `tests/integration/backup/mutation-routes.test.ts`          |
| [x] W04 | `/api/tags` POST；`/api/tags/[id]` PATCH/DELETE                                                                               | I `tests/integration/backup/mutation-routes.test.ts`          |
| [x] W05 | `/api/albums/[id]/share` POST/PATCH；其 `/rotate` POST；`/api/images/[id]/share` POST/DELETE                                  | I `tests/integration/backup/mutation-routes.test.ts`          |
| [x] W06 | `/api/images/[id]` PATCH/DELETE；其 `/trash` POST、`/restore` POST                                                            | I `tests/integration/backup/mutation-routes.test.ts`          |
| [x] W07 | `/api/images/[id]/collections` PATCH；其 `/metadata/read` POST、`/reprocess` POST                                             | I `tests/integration/backup/mutation-routes.test.ts`          |
| [x] W08 | `/api/images/[id]/replace` POST；其 `/sizes` POST、`/cleanup/retry` POST                                                      | I `tests/integration/backup/mutation-routes.test.ts`          |
| [x] W09 | `/api/images/batch` POST；`/api/media/watermark-assets` POST；`/api/settings/site/branding/[kind]` PUT/DELETE                 | I `tests/integration/backup/mutation-routes.test.ts`          |
| [x] W10 | `/api/settings/github` PATCH；`/api/settings/smtp` PATCH；`/api/settings/smtp/test` POST                                      | I `tests/integration/backup/identity-mutation-routes.test.ts` |
| [x] W11 | `/api/settings/site` PATCH；`/api/settings/media` PATCH；`/api/settings/upload` PATCH                                         | I `tests/integration/backup/mutation-routes.test.ts`          |
| [x] W12 | `/api/settings/storage` PATCH；`/api/storages` POST；`/api/storages/[id]` PATCH/DELETE                                        | I `tests/integration/backup/mutation-routes.test.ts`          |
| [x] W13 | `/api/storages/[id]/cors-tests` POST；其 `/[probeId]/complete` POST；`/api/storages/[id]/probes/[probeId]/retry-cleanup` POST | I `tests/integration/backup/mutation-routes.test.ts`          |
| [x] W14 | `/api/storages/[id]/scan` POST；`/api/storages/[id]/test` POST                                                                | I `tests/integration/backup/mutation-routes.test.ts`          |
| [x] W15 | `/api/uploads/submissions` POST；`/api/uploads/sessions/[id]/begin` POST；其 `/content` POST                                  | I `tests/integration/backup/mutation-routes.test.ts`          |
| [x] W16 | `/api/uploads/sessions/[id]/complete` POST；其 `/resubmit` POST；`/api/uploads/sessions/[id]` DELETE                          | I `tests/integration/backup/mutation-routes.test.ts`          |
| [x] W17 | `/api/uploads/cleanup` POST                                                                                                   | I `tests/integration/backup/mutation-routes.test.ts`          |

W 批次可按模块分工，但对同一 helper 的更改由 B06/B07 的负责人协调。POST selection/copy/status/archives、临时 preview、分享 unlock 和登录的允许回归集中在 C2 验证。公开 `/api/upload` 由 B03 负责，setup 由恢复授权任务负责，不重复登记。

### B09 — 两阶段准备协调

- [x] 准备按“关新入口 → 等前台和依赖结果 → 停后台新任务 → 等当前批次”执行；期限到时只失败备份，原业务继续。
- [x] 复制结束/失败/取消后恢复调度；关停先结束备份，不把旧任务记录当作永久暂停条件。
- 文件：`src/server/backup/quiescence.ts`、`runtime.ts`、`startup/server-start.ts`、两份暂停/关停集成测试。
- 验证：U `tests/unit/backup/quiescence.test.ts`，I `tests/integration/backup/runtime.test.ts`。
- 依赖：B02–B07、W01–W17、A07。

### 检查点 C2

已完成真实 handler 暂停/鉴权矩阵、后台暂停和已准入上传结算；浏览例外、真实媒体及全量结果分别记录，不用矩阵代替真实页面验收。

- [ ] 暂停矩阵中每个修改入口拒绝、每个浏览例外可用；真实 TIFF 预览和分享解锁可用。
- [ ] PicGo 已交接但任务 queued 的情况不相互等待；准备超时不改坏原上传结果。
- [ ] 完整产品检查通过。Local/S3 入口均要求显式构建身份，S3 小样本专项检查已完成，跨架构与容量未执行；未发布部署。

## C. 备份完整闭环

| 任务                       | 验收                                                                              | 文件边界                                                                                                     | 验证                                             | 依赖     |
| -------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | -------- |
| [x] C01 副本归整           | 只改副本；保留 queued/failed、回收和删除语义，移除临时/认证状态，无旧绝对临时路径 | `backup/snapshot.ts`、`normalize.ts`、两个测试                                                               | I `tests/integration/backup/snapshot.test.ts`    | A06、B09 |
| [x] C02 必需对象与维护读取 | 包含已保存版本、持久候选与素材；停用存储可维护读取，原配置不变；缺必需文件失败    | `backup/manifest.ts`、`backup/source.ts`、`storage/local.ts`、`storage/s3.ts`                                | I `tests/integration/backup/s3-backup.test.ts`   | C01      |
| [x] C03 创建和状态 API     | 一次任务 ID、单活动任务、密码仅内存；未知提交结果通过查询确认                     | `backup/http.ts`、`api/backups/route.ts`、`api/backups/[id]/route.ts`、`api/backups/activity/route.ts`、测试 | I `tests/integration/backup/backup-http.test.ts` | C02、A06 |
| [x] C04 下载取消删除       | 只有 ready 可下载；取消等待流退出；删除不影响旧站图片/其他备份，不中断正在下载    | `api/backups/[id]/file/route.ts`、其 `cancel/route.ts`、`[id]/route.ts`、两个测试                            | I `tests/integration/backup/runtime.test.ts`     | C03      |

服务文件位于 `src/server/`，接口文件位于 `src/app/`。C01–C04 的本地隔离库与真实 HTTP 闭环已完成。C02 已实现本地/S3 对象、停用存储、素材和任务依赖读取；小样本真实提供方和独立清理检查已通过，见本轮 S3 记录。

### 检查点 C3

- [x] 使用当前真实上传路径创建夹具，生成加密文件；错误密码/截断失败，正常包可由解码模块读回全部必需字节。
- [x] 备份期间旧站仍可浏览；下载时已恢复修改，旧备份没有被自动删除。

## D. 恢复准备与启用

| 任务                   | 验收                                                                                                  | 文件边界                                                                                              | 验证                                                     | 依赖          |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| [x] D01 初始化占用     | 普通 setup 与恢复互斥；重启换码后重新授权可查询任务；业务残留实例拒绝恢复                             | `identity/setup.ts`、`api/setup/route.ts`、`backup/http.ts`、两个测试                                 | I `tests/integration/backup/initialization.test.ts`      | A07           |
| [x] D02 创建与上传     | 分块前鉴权；顺序偏移、重复块、短块截回和重置正确；总传输可超过单请求期限，保留现有 HTTP 限制          | `api/setup/restore/route.ts`、`[id]/route.ts`、`[id]/file/route.ts`、`backup/restore-upload.ts`、测试 | I `tests/integration/backup/restore-upload.test.ts`      | D01           |
| [x] D03 解密与摘要     | 完整 age 认证后才读摘要；版本不匹配、非法 ZIP/路径、缺对象时不进入复制                                | `backup/restore.ts`、`api/setup/restore/[id]/decryption/route.ts`、两个测试                           | I `tests/integration/backup/restore-local.test.ts`       | D02、A06、A04 |
| [x] D04 账号和站点转换 | 重新加密既有配置，保留密码/Token/分享，清会话/验证；公开地址与新 CORS 状态一致                        | `backup/restore-config.ts`、`restore.ts`、`api/setup/restore/[id]/site/route.ts`、两个测试            | I `tests/integration/backup/restore-config.test.ts`      | D03           |
| [x] D05 纯本地恢复     | 暂存本地文件和最终独立 DB，只有全部必需内容检查完才 ready；失败可重试                                 | `backup/restore.ts`、`restore-runtime.ts`、`api/setup/restore/[id]/execution/route.ts`、两个测试      | I `tests/integration/backup/restore-local.test.ts`       | D04、C02      |
| [x] D06 新 S3 目标     | 每个原存储绑定新位置，当前 revision 测试通过才可执行；保存新凭据时不回显；原停用意图成立              | `backup/restore-remote.ts`、`targets/[storageId]/route.ts`、其 `test/route.ts`、测试                  | I `tests/integration/backup/restore-target-http.test.ts` | D04           |
| [x] D07 S3 复制        | 所有对象来自备份，原站断网仍可恢复；同任务重写不重复建图，其他前缀不受影响                            | `backup/restore-remote.ts`、`backup/restore.ts`、`restore-runtime.ts`、测试                           | I `tests/integration/backup/restore-mixed.test.ts`       | D05、D06      |
| [x] D08 重试与放弃     | 中断阶段可识别、重复开始不并发；换目标需新任务，遗留位置和清理失败可见                                | `backup/restore-runtime.ts`、`jobs.ts`、`api/setup/restore/[id]/cancel/route.ts`、两个测试            | I `tests/integration/backup/restore-runtime.test.ts`     | D07           |
| [x] D09 启用发布       | 先于业务目录初始化和正式开库；文件/目录同步先于 ready/completed；重放不重做首次空白检查，不带入旧 WAL | `backup/activate.ts`、`startup/preflight.ts`、两个故障注入测试                                        | I `tests/integration/backup/activation.test.ts`          | A02、D08      |
| [x] D10 CLI 启用冲突   | CLI 在真正启用未完成时拒绝改密，completed后可用；普通备份期间仍保留紧急CLI例外                        | `cli/reset-password.ts`、`identity/reset-password.ts`、对应CLI集成测试                                | I `tests/integration/backup/cli-activation.test.ts`      | D09           |

D06–D08 已完成小样本提供方与取消后未确认变更的故障复核；具体命令及未覆盖范围见 S3 记录。取消遗留仅允许原坐标修正凭据后继续清理，不允许换位置解除旧责任。D09/D10 的本地已验证结论继续保留，不自动扩展为 S3 验收结果。

目标配置按技术方案的接口拆分，不能在不同 S3 保存请求里重复承载站点地址。任务失败详情须保留哪一步、哪个目标和下一步，不把一切包装为“恢复失败”。

### 检查点 C4

- [x] 纯本地在独立新目录中完整恢复；源站停止且整个源 DATA_DIR 删除后仍成立。
- [x] 混合 Local/S3 从备份恢复；真实提供方测试删除原 DATA_DIR 与原 S3 文件，协议夹具使用不可访问的原 endpoint，均通过。
- [x] 在各启用断点终止并重启，无半成品后台扫描、无旧 WAL 混用、无已启用数据再次覆盖。
- [x] 保存密码、上传 Token、分享及图片关系的断言通过，旧会话与一次性凭据按方案清理。

## E. 接入已认可原型

E01–E05 已接入正式数据，E04 已包含多 S3 目标、测试纠错、同坐标凭据修复与清理状态。本地范围已完成真实浏览器、六视口浅深色、键盘和代表性设计对照；S3 的真实页面自动化验收已通过，E04 按该范围勾选；用户人工验收仍单独保留。用户人工验收仍是独立检查点。当前界面及脚本检查见 [S3 界面记录](../docs/verification/backup-implementation/s3-ui.md)，真实结果由 [S3 实施记录](../docs/verification/backup-implementation/s3.md) 汇总。

| 任务                       | 可见结果与验收                                                               | 文件边界                                                                                           | 验证                | 依赖     |
| -------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------- | -------- |
| [x] E01 备份入口与真实列表 | 复用公共外壳/设置分类，展示真实空态、历史、错误；没有模拟数据                | 新设置 page、`backup/backup-history.tsx`、`settings-categories.tsx`、`owner-shell.tsx`、浏览器用例 | UI `e2e/backup.mjs` | C04、D10 |
| [x] E02 创建与进度         | 原型密码/确认/进度接真实 API，刷新可读回任务，未知结果不重复创建             | `backup/backup-confirmation.tsx`、`backup-progress.tsx`、`use-backups.ts`、设置 page、浏览器用例   | UI `e2e/backup.mjs` | E01      |
| [x] E03 恢复授权与导入     | 空实例选择恢复，初始化码保护上传和摘要；重启换码、刷新重新授权表达清楚       | 新恢复 page、`backup/restore-source.tsx`、`use-restore.ts`、原 setup page、浏览器用例              | UI `e2e/backup.mjs` | D10      |
| [x] E04 目标配置与恢复结果 | 原型多存储表单、测试纠错、进度、失败重试和等待重启接真实状态；不能网页假重启 | `backup/restore-review.tsx`、`restore-outcome.tsx`、`use-restore.ts`、恢复 page、浏览器用例        | UI `e2e/backup.mjs` | E03      |
| [x] E05 暂停状态跨页反馈   | 上传/删除等入口说明暂停，图库、分享和临时预览可用；退出暂停后恢复操作        | `backup/use-backup-activity.ts`、`shell/owner-shell.tsx`、上传入口、图库修改入口、浏览器用例       | UI `e2e/backup.mjs` | E02、E04 |

E05 若还需修改多个独立菜单/配置保存控件，按每批最多 3 个消费文件＋1 个共用 hook＋1 份场景测试继续细分；后端保护已由 B/W 完成，不以按钮禁用代替后端鉴权或暂停。

前端按 [handoff](../docs/design/handoff.md) 交付桌面/手机、浅深色、短视口、键盘焦点、加载/空/错误/未知/成功状态和设计对照。原型中的“演示导览”、固定密码、模拟按钮和示例文件不得进入正式界面。真实接口接通后退出原型占位。

### 检查点 C5

- [ ] 用户从真实页面完成本地创建、下载、在新实例导入、地址确认、重启及登录；原型批准不替代该次真实验收。
- [x] S3 界面完成新目标配置与真实恢复自动化验收，覆盖六视口浅深色、错误纠正、修改失效及键盘；用户人工验收不由此代替。
- [x] 本地阶段已与批准原型/对应Figma逐项对照，修正发现的差异，并保留真实重新授权、失败与清理细节；见[浏览器记录](../docs/verification/backup-implementation/browser/README.md)。

## F. 最终验证与交付

### F01 — 提供方与规模

- [x] Cloudflare R2 和 SeaweedFS 小样本实际验证混合/停用存储、对象信息和其他前缀保护；本地真实 SDK/HTTP 夹具另测部分失败、重试与迟到变更，不冒充真实提供方故障注入。
- [ ] 正式服务十万级条目、>4 GiB 和密码工作线程的内存/磁盘/浏览延迟测量；本轮按用户要求不执行大文件与容量压测，不标为通过。A01 历史格式实验结论保持独立。
- 文件：`scripts/verify-backup-s3.ts`、`scripts/browser-backup-s3.mjs`、`tests/integration/backup/production-s3.test.ts`、`docs/verification/backup-implementation/s3.md`。
- 验证：实际运行对应脚本；无可用环境记未验证，不换成 mock 或宣称其他提供商已通过。
- 依赖：C5。

### F02 — 发布形态与操作指南

- [x] standalone 和 ARM64 隔离容器实际包含 worker、库和版本元数据；完成备份、重启启用和原账号登录，覆盖轮次见容器记录。
- [ ] AMD64 同等容器验证，未以ARM64结果替代。
- [x] 更新部署/升级指南，说明私有备份保管、同版本恢复、密码丢失、空间、重启失败查看日志和任务遗留清理。
- 文件：`scripts/verify-release-image.mjs`、`docs/guides/deployment.md`、`upgrading.md`、`docs/verification/backup-implementation/README.md`、必要的发布验证用例。
- 验证：按现行发布验证入口执行；实际发布/部署仍需另行授权。
- 依赖：A04 及本地 C5；S3 发布验证另依赖 F01。

### 最终检查点

- [ ] 全部适用产品检查、真实服务矩阵和前端设计对照通过，失败与未验证项没有被抹去。
- [ ] 用户确认真实业务验收后，才进入明确授权的提交、推送、合并、发布或部署阶段。

## 并行与顺序

- A01、A02、A03 可并行；A05 → A06 → A07 依赖格式实验，不能先假设流式/内存能力成立。
- B02–B05 和不同 W 模块可分工；同一启动文件、HTTP helper 和 auth adapter 的修改顺序由该边界负责人协调，不锁整个仓库。
- D06 可与 D05 并行，D07 必须等二者完成；启用必须等全部准备数据完成。
- 已确认接口后 E02 与 E03 可并行；最终组合、目录切换、发布元数据及完整验收必须顺序收敛。
- 所有检查点都保持现有应用可运行；只在隔离环境开发和验证，未完成的功能不切换到生产。
