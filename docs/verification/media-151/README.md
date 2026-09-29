# T-MED-13 不可变水印素材与快照引用生命周期

关联 [Issue #151](https://github.com/dnslin/ariso-next/issues/151)，范围与需求沿用[任务卡](../../tasks/m3-m4-platform.md#t-med-13-不可变水印素材与快照引用生命周期)、[SPEC-media §4.3/5/12](../../specs/SPEC-media.md)和[执行约定](../../tasks/execution.md)。

2026-09-29 回读 Issue、评论和原生 blocked_by/blocking：无评论；#150、#51、#53 均为 CLOSED，交付记录分别见 [media-150](../media-150/README.md)、[media-51](../media-51/README.md)、[identity-53](../identity-53/README.md)。下游 #152、#160 仍为 OPEN。原工作区有其他活动任务，更新远端后从 `origin/main` 的 `00979f5` 创建独立 worktree `/Users/dnslin/.codex/worktrees/watermark-assets/ariso` 与分支 `codex/151-watermark-assets`，未覆盖原目录。

## 实施与剩余边界

- 上传只接受真实静态 PNG/WebP/SVG，最大 5 MiB；拒绝 APNG、动画 WebP、SVG 动画/脚本/外部资源、损坏及不支持内容。复用 ExifTool、ImageMagick、resvg 与 XML/CSS policy；无新增依赖。原始字节不变，每次上传分配新 ID 和目录。
- 迁移 `0011` 新增素材表及预览引用表，为设置增加可空素材 ID。写前持久登记路径；校验成功后的临时素材一小时到期。设置采用与解除到期在同一事务内完成，失败回滚。
- 快照保存素材 ID、相对路径与实际属性；设置替换不改旧快照。当前设置、预览、queued/running 内容任务和活动上传会话会保留引用。自动重试沿原任务快照；succeeded/failed/cancelled 内容任务保留历史属性但不阻止清理。
- upload 提供活动会话引用查询，由启动组合入口注入，media 不读取 upload 的表。现有交接事务自然完成 upload→media 引用接棒。
- 清理先在事务内确认无引用并标记 pending，然后删除确切素材所属目录。失败记录路径与错误；每分钟及启动时恢复重试。日常维护不触碰 writing；启动恢复才结算中断写入。停止等待当前请求与工具结束。
- 复用共享媒体资源预算，检查写入空间、解码缓存及低水位，取消时保留真正的资源错误。SVG runner 使用专用输入失败退出码，文件读写或模块加载故障不误记为用户文件无效。

本任务**没有 UI**，未修改 Figma、公共布局或前端组件；桌面/手机/主题/焦点和设计人工验收不适用。T-MED-08 承接水印渲染及设置 HTTP；T-MED-09 承接真实处理预览并接入预览引用释放；T-MED-12 承接选择与状态界面；T-UP-03 承接完整批次联验。提供引用接口不代表这些后续能力已经实现。

## 实际验证

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

未运行 `pnpm run test:browser`：本次无 UI，且生产构建尚未通过。真实 HTTP 测试已提供，但没有可用运行包，不能标记通过。未执行设备、容器、AMD64/ARM64、Release 或部署；发布验证沿现有 Release 流程，不为本 PR 发布。

## 代码审计与失败修复

独立 agent 实际读取 `code-review-and-quality`，按测试、实现及调用链审计，结论 **Critical 0、未解决 Required 0**。确认需求覆盖、事务采用、清理竞态、引用接棒、终态历史、模块职责、资源生命周期及测试有效性；无 UI，设计结论为不适用。

审计指出解码缺少现有磁盘预算，已复用 `createMediaResources`。随后通过回归测试复现“预算取消后持久错误是工具取消而非真实原因”，见 [失败证据](./resource-red.txt)，修复后同一断言通过。5 MiB 用例最终使用合法 PNG 私有 ancillary chunk 和 `Buffer.equals` 验证完整字节相等；未增加测试超时或削弱断言。旧版本存储迁移测试原先调用最新媒体初始化函数，新增列后失败；改为固定旧 schema 夹具，保留原有对象、引用、外键和升级断言，28 项复测通过。

独立审计实际运行：

```sh
pnpm exec vitest run --project unit tests/unit/media/settings.test.ts tests/unit/media/watermark-validation.test.ts --project media-tools tests/integration/media/watermark-assets.test.ts tests/integration/media/watermark-validation.test.ts --maxWorkers=1
git diff --check
```

## 尚未解除的基线阻塞

`origin/main` 本轮修改前已无法构建：`src/cli/verify-media.ts` 把 `resolveUploadStorage` 的通用配置传给仅支持本地的读写函数。最小修复是改用已有 `resolveLocalUploadStorage`。全量类型检查还发现 `tests/integration/media/{formats,format-recovery,svg}.test.ts` 的同类错误，以及 `tests/integration/analytics/usage.test.ts` 的旧格式夹具缺少 coder/extension。

全量集成另发现 `tests/experiments/analytics-scale/fixture.ts:48` 使用无列名的七值 INSERT，而 `storage_configs` 已有 22 列。已核对 `origin/main` 中同样存在该语句，本次没有修改 storage schema。该基线夹具亦未修复。

项目规则要求范围外问题未经批准不修改；本轮已提出具体修复请求，当前尚未收到授权。这些文件未改动。PR 保持草稿，任务不标完成；需先获准修复或由基线修复合入，然后重新构建并完成真实 HTTP 与全量集成验证。不能将本次模块测试通过等同于完整交付通过。
