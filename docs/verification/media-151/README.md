# T-MED-13 不可变水印素材与快照引用生命周期

关联 [Issue #151](https://github.com/dnslin/ariso-next/issues/151)，范围与需求沿用[任务卡](../../tasks/m3-m4-platform.md#t-med-13-不可变水印素材与快照引用生命周期)、[SPEC-media §4.3/5/12](../../specs/SPEC-media.md)和[执行约定](../../tasks/execution.md)。

2026-09-29 回读 Issue、评论和原生 blocked_by/blocking：无评论；#150、#51、#53 均为 CLOSED，交付记录分别见 [media-150](../media-150/README.md)、[media-51](../media-51/README.md)、[identity-53](../identity-53/README.md)。下游 #152、#160 仍为 OPEN。原工作区有其他活动任务，更新远端后从 `origin/main` 的 `00979f5` 创建独立 worktree `/Users/dnslin/.codex/worktrees/watermark-assets/ariso` 与分支 `codex/151-watermark-assets`，未覆盖原目录。

## 最终结论

2026-09-30 双角度评审问题修复后，本地适用检查全部通过：单元 560 项、完整集成 89 文件 / 738 项，无失败或跳过；冻结安装、类型、生产构建、lint、格式和文档检查通过。独立行为与结构复审均无未解决 Required 或 Optional；本任务无 UI，设计验收不适用。以下保留各轮失败证据，最终结果见本轮双角度评审修复记录。

## 实施与剩余边界

- 上传只接受真实静态 PNG/WebP/SVG，最大 5 MiB；拒绝 APNG、动画 WebP、SVG 动画/脚本/外部资源、损坏及不支持内容。复用 ExifTool、ImageMagick、resvg 与 XML/CSS policy；无新增依赖。原始字节不变，每次上传分配新 ID 和目录。
- 迁移 `0011` 新增素材表及预览引用表，为设置增加可空素材 ID。写前持久登记路径；校验成功后的临时素材一小时到期。设置采用与解除到期在同一事务内完成，失败回滚。
- 快照保存素材 ID、相对路径与实际属性；设置替换不改旧快照。当前设置、预览、queued/running 内容任务和活动上传会话会保留引用。自动重试沿原任务快照；succeeded/failed/cancelled 内容任务保留历史属性但不阻止清理。
- upload 提供活动会话引用查询，由启动组合入口注入，media 不读取 upload 的表。现有交接事务自然完成 upload→media 引用接棒。
- 清理先在事务内确认无引用并标记 pending，然后删除确切素材所属目录。失败记录路径与错误；每分钟及启动时恢复重试。日常维护不触碰 writing；启动恢复才结算中断写入。停止等待当前请求与工具结束。
- 复用共享媒体资源预算，检查写入空间、解码缓存及低水位，取消时保留真正的资源错误。SVG runner 使用专用输入失败退出码，文件读写或模块加载故障不误记为用户文件无效。

本任务**没有 UI**，未修改 Figma、公共布局或前端组件；桌面/手机/主题/焦点和设计人工验收不适用。T-MED-08 承接水印渲染及设置 HTTP；T-MED-09 承接真实处理预览并接入预览引用释放；T-MED-12 承接选择与状态界面；T-UP-03 承接完整批次联验。提供引用接口不代表这些后续能力已经实现。

## 首轮验证记录（授权修复前）

环境：macOS 26.6.2 arm64；Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-32、ExifTool 13.55。命令前设置 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。全部数据使用临时目录和独立 SQLite，没有修改用户预览数据。

| 实际命令                                                                                                                                                                                                            | 当前结果                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                    | 通过，锁文件未变化                                                                                                  |
| `pnpm run db:generate`                                                                                                                                                                                              | 生成 0011；SQL 仅新增两表和设置引用列，已审查                                                                       |
| `pnpm run test:unit`                                                                                                                                                                                                | 37 文件、541 项通过                                                                                                 |
| `pnpm exec vitest run --project media-tools tests/integration/media/watermark-assets.test.ts --maxWorkers=1`                                                                                                        | 14 项通过，见 [生命周期结果](./lifecycle.txt)                                                                       |
| `pnpm exec vitest run --project integration tests/integration/storage/settings.test.ts tests/integration/media/defaults.test.ts --maxWorkers=2`                                                                     | 28 项通过，见 [迁移与设置结果](./migration.txt)                                                                     |
| 独立审计相关集（下节完整命令）                                                                                                                                                                                      | 4 文件、74 项通过                                                                                                   |
| `pnpm exec vitest run --project media-tools tests/integration/media/watermark-assets.test.ts tests/integration/media/watermark-validation.test.ts tests/integration/media/watermark-runtime.test.ts --maxWorkers=2` | 3 文件、42 项通过，含真实格式、生命周期和 runtime 接收/停止/启动恢复；见 [最终聚焦结果](./focused.txt)              |
| `pnpm run lint`                                                                                                                                                                                                     | 通过                                                                                                                |
| `pnpm run format:check`                                                                                                                                                                                             | 首次发现本次三个文件格式，修正后全量通过                                                                            |
| `pnpm run typecheck`                                                                                                                                                                                                | 基线已有 15 项类型错误，见 [类型结果](./typecheck.txt)；本次修改无新增类型错误                                      |
| `pnpm run build`                                                                                                                                                                                                    | 修改前和修改后均因基线 CLI 两项类型错误失败，见 [原始基线结果](./baseline-build.txt) 与 [最终构建结果](./build.txt) |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                                                          | 614 通过 / 76 失败 / 41 因初始化失败未执行；见下方失败归因及 [完整结果](./integration.txt)                          |
| `node docs/tasks/check.mjs` / `git diff --check`                                                                                                                                                                    | 通过：120 tasks / 298 requirements，无缺失编号或循环；差异无空白错误                                                |

全量集成运行时包含旧迁移夹具的一项失败，随后已修复并通过 28 项聚焦复测；全量未重跑。其他失败来自构建类型错误及缺少生产运行包，以及基线已有的 analytics scale 夹具。41 项 skipped 来自失败的 beforeAll 初始化钩子，没有新增跳过测试。

单元、格式、lint 和文档检查原始输出见 [unit](./unit.txt)、[format](./format.txt)、[lint](./lint.txt)、[docs](./docs.txt)。

首轮未运行 `pnpm run test:browser`：本次无 UI，当时生产构建尚未通过。首轮真实 HTTP 测试因缺少运行包受阻；授权修复后的结果以下方复测为准。未执行设备、容器、AMD64/ARM64、Release 或部署；发布验证沿现有 Release 流程，不为本 PR 发布。

## 代码审计与失败修复

独立 agent 实际读取 `code-review-and-quality`，按测试、实现及调用链审计，结论 **Critical 0、未解决 Required 0**。确认需求覆盖、事务采用、清理竞态、引用接棒、终态历史、模块职责、资源生命周期及测试有效性；无 UI，设计结论为不适用。

审计指出解码缺少现有磁盘预算，已复用 `createMediaResources`。随后通过回归测试复现“预算取消后持久错误是工具取消而非真实原因”，见 [失败证据](./resource-red.txt)，修复后同一断言通过。5 MiB 用例最终使用合法 PNG 私有 ancillary chunk 和 `Buffer.equals` 验证完整字节相等；未增加测试超时或削弱断言。旧版本存储迁移测试原先调用最新媒体初始化函数，新增列后失败；改为固定旧 schema 夹具，保留原有对象、引用、外键和升级断言，28 项复测通过。

独立审计实际运行：

```sh
pnpm exec vitest run --project unit tests/unit/media/settings.test.ts tests/unit/media/watermark-validation.test.ts --project media-tools tests/integration/media/watermark-assets.test.ts tests/integration/media/watermark-validation.test.ts --maxWorkers=1
git diff --check
```

## 2026-09-29 授权修复与复测

`origin/main` 本轮修改前已无法构建：`src/cli/verify-media.ts` 把 `resolveUploadStorage` 的通用配置传给仅支持本地的读写函数。最小修复是改用已有 `resolveLocalUploadStorage`。全量类型检查还发现 `tests/integration/media/{formats,format-recovery,svg}.test.ts` 的同类错误，以及 `tests/integration/analytics/usage.test.ts` 的旧格式夹具缺少 coder/extension。

全量集成另发现 `tests/experiments/analytics-scale/fixture.ts:48` 使用无列名的七值 INSERT，而 `storage_configs` 已有 22 列。已核对 `origin/main` 中同样存在该语句，本次没有修改 storage schema。本轮已为该 INSERT 显式指定列名，保留原测试数据及断言。

首轮按项目范围规则保留草稿；所有者随后明确回复“批准修复”。本轮仅将 CLI 与三个本地媒体测试改用既有 `resolveLocalUploadStorage`，为 analytics usage 夹具按真实接受接口补齐 coder/extension，并修正上述 scale INSERT。独立审计 Critical 0 / Required 0；类型检查和生产构建已通过。授权后结果见下方复测记录。

### 真实运行包揭示的夹具修复

构建恢复后，第一轮全量集成为 712 通过 / 25 失败，无跳过，见 [复测失败证据](./integration-recheck.txt)。其中 19 项是本次 schema 和运行时变化需要更新的测试夹具：初始化默认对象缺少 `watermarkAssetId: null`；health 的完整表及空表列表缺两张水印表；secret-preflight 与 startup 的手写迁移集合缺少必要 schema。另一个辅助进程直接关闭数据库，未等待后台任务，现改为 `await runtime.stop()`，子进程日志级别设为 error，保留错误及完整初始化码断言，仅抑制正常停止信息。独立审计逐次复核，Required 0；未削弱完整对象、表集合、迁移、回滚或重启断言。

其他 5 项仅在同时有多个 worktree 运行测试时超时；原代码和超时值未修改。串行聚焦重跑 25 项（开发模式重新编译、访问统计、初始化进程生命周期）通过，见 [串行复测](./isolated-recheck.txt)。运行时夹具 21 项通过，见 [启动夹具复测](./runtime-fixtures-after.txt)。初始化真实重启的 1 项亦复测通过。最终全量降低至单 worker，以减少本机资源争用。

### 最终实际命令与结果

| 实际命令                                                                                                                                                                                              | 结果                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm run typecheck`                                                                                                                                                                                  | 通过，[日志](./typecheck-final.txt)                                                                          |
| `pnpm run build`                                                                                                                                                                                      | 通过，[日志](./build-final.txt)；现有打包器报告 resvg 可选平台依赖追踪警告，退出码 0，本机真实运行包测试通过 |
| `pnpm run lint`                                                                                                                                                                                       | 通过，[日志](./lint-final.txt)                                                                               |
| `pnpm run format:check`                                                                                                                                                                               | 通过，[日志](./format-final.txt)；最终文档随后单独格式检查通过                                               |
| `pnpm run test:unit`                                                                                                                                                                                  | 37 文件、541 项通过，[日志](./unit-final.txt)                                                                |
| `pnpm run test:integration --maxWorkers=1`                                                                                                                                                            | 89 文件、737 项全部通过，650.63 秒，无失败或跳过，[日志](./integration-final.txt)                            |
| `pnpm exec vitest run --project integration tests/integration/analytics/usage.test.ts tests/integration/analytics/scale.test.ts --maxWorkers=2`                                                       | 4 项通过，[日志](./baseline-fixtures-final.txt)                                                              |
| `pnpm exec vitest run --project integration tests/integration/identity/m1-gate.test.ts --maxWorkers=1`                                                                                                | 1 项通过                                                                                                     |
| `pnpm exec vitest run --project integration tests/integration/runtime/health.test.ts tests/integration/runtime/secret-preflight.test.ts tests/integration/runtime/startup.test.ts --maxWorkers=1`     | 21 项通过                                                                                                    |
| `pnpm exec vitest run --project integration tests/integration/identity/setup-lifecycle.test.ts tests/integration/analytics/count.test.ts tests/integration/identity/setup-dev.test.ts --maxWorkers=1` | 25 项通过                                                                                                    |
| `node docs/tasks/check.mjs` / `git diff --check`                                                                                                                                                      | 通过；120 tasks / 298 requirements，无缺失编号或循环                                                         |

完整集成覆盖新水印 HTTP 7 项、不可变资产及引用 14 项、真实格式验证 22 项、接收/停止/恢复 6 项，也覆盖隔离无密钥构建、打包 CLI 媒体验证和初始化真实重启。独立审计另复核全部追加修复，仍为 Critical 0 / Required 0。

`pnpm run test:browser` 未运行：本任务只改后端模块、HTTP 和测试夹具，无界面或公共 UI 变化，业务真实 HTTP 已覆盖。设备、容器、AMD64/ARM64 镜像检查按既有 Release 流程执行，本轮未运行，不记通过。下游未实现能力仍按本文的任务归属承接。

## 2026-09-30 双角度评审修复

所有者要求按 `code-review-and-quality` 和 `thermo-nuclear-code-quality-review` 分别独立评审，并授权修复。行为评审确认两个 P2 Required：ImageMagick 自身拒绝缓存分配被误报为无效图片；HTTP 格式/资源与磁盘错误没有遵守 SPEC-media §12.2 的 422/507 约定。结构评审没有额外优化项，本轮没有扩展重构。

修复只涉及两个生产文件：现有 `analyzeMediaError` 识别明确的 `cache resources exhausted`；水印路由复用该分析器归一原生/工具错误，并返回资源/格式 422、磁盘 507。保留原始错误消息、日志 requestId、no-store，以及身份与请求形状已有状态。验证器不再把工具资源失败包装成“图片无效”，持久记录继续保存真实诊断。

测试先取得 [错误分类 3 项失败](./review-errors-red.txt) 和 [HTTP 状态 8 项失败](./review-http-red.txt)。新增真实 HTTP 用例使用合法 16000×16000 RGBA PNG，文件 1,044,047 字节，生产 512 MiB 缓存预算未改变；返回资源限制，数据库留下 cleanup_pending 和原始诊断，没有 ready 资产。夹具使用 Node 原生 zlib 流式生成，只复用一行像素，没有新增依赖；[真实工具失败输出](./review-cache-tool.txt) 和 [CRC/完整解压验证](./review-fixture.txt) 证明文件有效。

结构复审还发现本轮归一化可能用内层 cause 覆盖明确的外层 `MEDIA_WATERMARK_INVALID`。真实 HTTP 和新增单元均复现，见 [HTTP 回归失败](./review-http-cause-red.txt)、[单元回归失败](./review-cause-red.txt)。已改为保留明确的外层 `MEDIA_*` 码，再对原生/工具失败归一分类；没有降低或删除原断言。

复审：行为 agent 独立重跑 46 项针对性单元，Critical 0 / Required 0 / Optional 0；结构 agent 复核上述回归修复、职责和复杂度，Required 0 / Optional 0。共享错误分析器的 steps、recovery、process 调用方已核查：资源失败沿已有规则保留恢复候选，不新增自动重试条件。本轮没有 UI，设计验收不适用。

环境沿用上轮 macOS arm64、Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-32、ExifTool 13.55。完整集成使用单 worker，所有 HTTP 服务与数据都在临时目录，不修改用户数据。实际命令与结果：

| 命令                                                                                                                                                                        | 结果                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                            | 通过，锁文件无变化；[日志](./review-install.txt)                                    |
| `pnpm run format:check`                                                                                                                                                     | 通过；[日志](./review-format.txt)                                                   |
| `pnpm run lint`                                                                                                                                                             | 通过；[日志](./review-lint.txt)                                                     |
| `pnpm run typecheck`                                                                                                                                                        | 通过；[日志](./review-typecheck.txt)                                                |
| `pnpm run test:unit`                                                                                                                                                        | 38 文件 / 560 项通过；[日志](./review-unit.txt)                                     |
| `pnpm exec vitest run --project unit tests/unit/media/errors.test.ts tests/unit/media/watermark-validation.test.ts tests/unit/media/watermark-route.test.ts --maxWorkers=1` | 3 文件 / 46 项通过；[日志](./review-focused.txt)                                    |
| `pnpm run build`                                                                                                                                                            | 通过，退出码 0；保留既有 resvg 可选平台依赖追踪警告；[日志](./review-build.txt)     |
| `pnpm run test:integration --maxWorkers=1`                                                                                                                                  | 89 文件 / 738 项全部通过，580.43 秒，无失败或跳过；[日志](./review-integration.txt) |
| `node docs/tasks/check.mjs` / `git diff --check`                                                                                                                            | 通过，120 tasks / 298 requirements；[文档日志](./review-docs.txt)                   |

最终完整集成覆盖重建后的 8 项真实水印 HTTP 用例，资源耗尽和原无效图片响应均通过。磁盘不足 507 通过 HTTP handler 边界注入原生 ENOSPC、工具磁盘失败和领域错误验证，没有填满实际磁盘。真实 HTTP 已使用生产缓存上限触发资源耗尽。没有 schema 变化，不重复生成迁移；浏览器/人工设计验收不适用。物理设备、容器、AMD64/ARM64 镜像和部署未执行，仍按 Release 流程取得证据。

## PR 与远端检查

[PR #212](https://github.com/dnslin/ariso-next/pull/212)，分支 `codex/151-watermark-assets`。首轮因基线失败创建草稿；授权修复后转为待评审。本轮发现两项 P2 时暂时恢复草稿，修复及全量验证完成后再次满足正式待评审条件。

实际使用 `gh pr view 212 --repo dnslin/ariso-next --json isDraft,mergeStateStatus,baseRefOid,statusCheckRollup` 和 `gh pr checks 212 --repo dnslin/ariso-next` 核对：当前 main 基线为 `00979f5`，无合并冲突，检查列表为空。仓库没有远端 PR 检查，不能记作 CI 通过。未合并、关闭 Issue、发布、部署或删除分支/worktree。
