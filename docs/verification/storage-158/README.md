# T-STO-05 真实浏览器 CORS 检测与 origin 失效

关联 [Issue #158](https://github.com/dnslin/ariso-next/issues/158)。2026-09-30 从 `origin/main` 的 `117c66a` 创建独立 worktree `/Users/dnslin/.codex/worktrees/issue-158-storage-cors/ariso`，分支 `codex/issue-158-storage-cors`。原工作区另有任务使用，本次没有修改它。本记录遵守[任务执行约定](../../tasks/execution.md)与[设计交接](../../design/handoff.md)，不改写冻结 PRD。

**当前为部分实施，必须保留草稿。** 后端、持久探测和真实浏览器协议已实现；生产页面尚未接入。复制及配置地址入口的位置、编辑页尚未实现时的临时组合仍等待用户批准。没有实际页面设计验收或用户人工验收，不能关闭 T-STO-05 或把本记录描述为完整功能交付。

## 前置与实现边界

通过 `gh issue view 158 --repo dnslin/ariso-next --json number,title,body,state,comments,url` 和 `gh api repos/dnslin/ariso-next/issues/158/dependencies/{blocked_by,blocking}` 实际读取：Issue OPEN、无评论；四个直接前置 #157、#57、#142、#137 均 CLOSED。直接下游 #162、#164、#194 仍 OPEN。完整存储管理页面由 #198 承接，当前公共导航 `/storage` 尚不可用；没有用虚构页面或假接口补齐。

- 新增读取/创建 `GET/POST /api/storages/:id/cors-tests` 和 `POST /api/storages/:id/cors-tests/:probeId/complete`。所有者鉴权、来源限制、配置 revision 和通过的连接报告均沿用真实服务边界。
- 示例来自当前站点 origin，使用正式上传/读取提供方的 PUT、GET、HEAD 签名和必需 `content-type`。不自动修改 Bucket 配置。
- 创建签名前持久登记随机确切 Key。只有三次浏览器请求可读成功、服务端字节核验和删除均成功才记录 passed。响应错误、opaque、缺失方法、内容不同或清理失败均不能通过。
- `invalidateS3Cors(tx)` 供 #194 的站点设置事务组合使用。origin/revision 不符和 A→B→A 的旧回包均不能恢复通过；该函数已经过事务集成测试，但尚无后续设置页面消费入口。
- 未完成探测由到期维护或重启恢复接管；删除失败保留确切 Key、错误和引用，复用已有手动重试入口。已知对象清理成功释放引用；迟到对象扫描由 #164 承接，本次没有宣称扫描已实现。
- 迁移 `0014_silent_shiva.sql` 新增配置 CORS 报告及 probe 的 origin、invalidated、expires_at。没有新依赖；复用 AWS SDK、Drizzle、现有探测维护实例和 React Query。
- `src/components/storage/` 提供待接入的浏览器传输、数据 hook、报告和对话框。没有对应产品路由；复制、打开配置地址、清理按钮组合及完整状态交互仍未完成。

## 浏览器与真实服务证据

环境为 macOS arm64、Node 24.18.1、pnpm 11.19.0，使用现有 Ego Lite、唯一 TaskSpace 1。真实服务轮次使用 Next.js 开发服务和独立初始化数据库 `.data/issue-158-preview/data`，站点 origin `http://127.0.0.1:47070`；云端对象均在独立随机存储命名空间，不修改用户预览数据和 Bucket 策略。完整浏览器门禁使用另一个临时生产 Standalone 和空数据库。

[完整命令与环境](./browser-service/checks.json)、[R2/SeaweedFS 浏览器报告](./browser-service/live-origin/storage-cors.json)、[最终对象检查](./browser-service/live-origin/live.json)记录两服务的实际可读 PUT/GET/HEAD、服务器核验与删除、刷新后持久结果，以及确切 Key HEAD 404、前缀对象列表为空。错误 Origin 在创建 probe 前被拒绝。R2 全 Bucket 无锁确认沿用同一目标的已有所有者证据，未要求新增管理权限。

[本地 HTTP 故障夹具报告](./browser-service/fixture/storage-cors.json)覆盖缺少 CORS、删除失败与重试、页面退出后控制持久到期时间并由真实服务维护清理。夹具不验证 AWS 签名，也没有修改云端策略制造失败。真实浏览器脚本调用应用 API 并执行自己的 fetch 流程，**没有点击生产 React 页面或执行其 hook**；不能代替 UI 功能与设计验收。

## 设计读取与尚未批准的组合

实施前使用 Figma 技能实际读取设计信息和截图，文件 `74sT9Hrf8G4czcWeTkET5b`。以下节点均读取过，不是只读链接或文字交接：

| 状态     | 桌面 / 手机节点     | 当前结果                                                                                                                     |
| -------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 主页面   | 346:4712 / 346:4807 | [桌面设计原图](./figma/346-4712.png) 1440×1080、[手机设计原图](./figma/346-4807.png) 390×844；浅色。尚无同视口实际页面截图。 |
| 示例     | 346:4865 / 346:4876 | JSON、返回可复用；新增复制操作位置等待批准。                                                                                 |
| 来源错误 | 346:5337 / 346:5326 | 当前/配置来源可复用；打开配置来源入口位置等待批准。                                                                          |
| 失效     | 346:5348 / 346:5361 | 尚未接入页面。                                                                                                               |
| 检测中   | 346:4905 / 346:4887 | 尚未接入页面。                                                                                                               |
| 成功     | 346:5048 / 346:5030 | 旧等待签名窗口文字按现行 SPEC §7/9.4 调整，不能恢复旧协议。                                                                  |
| 失败     | 346:5183 / 346:5278 | 尚未接入页面。                                                                                                               |
| 清理     | 346:6259 / 346:6272 | 以已知对象清理责任表达状态；完整操作尚未接入。                                                                               |

公共区域必须复用现有 OwnerShell、AdminShell 和 SessionControls。没有改公共导航，也没有增加独立复制的侧栏。通用控件已核对 HeroUI 3.2.6 类型及官方文档，待接入模块使用 Button、Modal、TextArea、Card、Alert。

[T-STO-05 的设计核对结论](../../tasks/m3-m4-platform.md#dg-storage-对-t-sto-05-的核对结论2026-09-30)明确要求“具体新增操作位置需用户确认，不由实现者自行设计”。本次已提出两个具体方案，尚未收到批准：

1. 在示例 JSON/来源说明下方、原返回按钮上方增加 48px 描边按钮；复制失败时在按钮前保留错误与完整可选文本。影响示例及来源错误四个节点的操作区域高度。
2. 在 #198 编辑页不存在期间，以 `/settings/storage/:id` 直接承载已设计的 CORS 页面；管理与返回入口显示尚未开放，公共存储导航仍不可用。该临时组合影响整页入口与退出行为，因此没有自行上线。

**设计结论：未验收。** 无实际产品页面截图，未执行本次页面的浅深色、360/390/430/768/桌面、短视口、键盘焦点、点击区及加载/错误/成功/禁用验收，也没有安排评审者在不存在的页面上给出通过结论。源设计截图不是实现截图。批准方案并完成真实页面后，仍需独立设计评审及用户人工验收。

## 代码审计与检查

[独立代码审计](./code-review.md)认为已实现范围无未解决的阻断问题。审计发现的 P2（清理重试成功后仍显示历史删除失败）已有先失败后通过的渲染回归；独立复审 45 项通过。审计没有把 API 浏览器证据当作 UI 验收。

本地命令均在独立 worktree 根目录运行，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。环境：macOS 26.6.2（25G83）arm64、Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-32、ExifTool 13.55。

| 实际命令                                                             | 结果                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                     | Node 24 下通过，锁文件未变更。初次误用默认 Node 26，随后已在指定 Node 24 下重跑。                                                           |
| `pnpm run db:generate`                                               | 生成并审查四条 ALTER；最终复查无额外 schema 差异。[输出](./local/db-generate-final.txt)。                                                   |
| `pnpm run format:check`                                              | 初次发现迁移快照/journal 和测试格式问题，修正后完整检查通过。                                                                               |
| `pnpm run lint`、`pnpm run typecheck`                                | 最终均通过。                                                                                                                                |
| `pnpm run test:unit --maxWorkers=2`                                  | 45 文件、621 项通过。[输出](./local/unit.txt)。                                                                                             |
| `pnpm run build`                                                     | 最终退出 0。包含已有原生可选依赖追踪诊断，未当成零告警；[构建摘要](./local/build-final-summary.txt)。                                       |
| `pnpm run test:integration --maxWorkers=2`                           | 首轮 837 通过、26 失败；[失败摘要](./local/integration-first-summary.txt)。修复及重跑见下文。                                               |
| `pnpm run test:integration --maxWorkers=1`                           | 最终构建后完整复跑退出 0，95 文件、863 项通过。[输出](./local/integration-final.txt)。                                                      |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`          | 通过；未下载浏览器。                                                                                                                        |
| `EGO_TASK_SPACE=1 EGO_KEEP_SPACE=1 pnpm run test:browser`            | 首轮登录 429 失败；修复后完整重跑退出 0。[最终运行器](./local/browser-final.json)、[CORS 专项](./local/cors-final.json)。首轮报告继续保留。 |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test` | 120 任务 / 298 需求检查通过，5 项拒绝自测通过。                                                                                             |
| `git diff --check`                                                   | 通过。                                                                                                                                      |

浏览器命令保留原 `NO_PROXY/no_proxy` 并补充 `localhost,127.0.0.1,::1,.localhost`。完整本地日志在 worktree 的 `test-results/issue-158/`，浏览器报告在 `test-results/browser/`；提交日志对一次性初始化码脱敏，摘要保留诊断类型、原路径与结果。

首轮集成的 26 项失败中，25 项来自旧迁移测试的列预期和三份启动夹具遗漏当前 CORS 迁移。现已使用真实 SQL、断言新列默认值及完整迁移顺序，并保留历史数据、回滚和密钥失败断言。迁移聚焦 13 项、启动聚焦 26 项通过；后者经独立 agent 再跑确认。剩余统计用例因原有 5000ms 时限失败，独立聚焦 13 项通过；没有修改该模块或增加超时，降低并行度后的完整复跑 863 项全部通过。

浏览器首轮新增场景紧随真实身份限流测试，直接登录得到 429。已按既有测试方式读取服务端 `x-retry-after/retry-after`，等待完整期限再试；最多六次，最终仍要求 HTTP 200，不清限流数据。[首轮运行器](./local/browser-first.json)与[具体失败](./local/cors-first.json)保留。独立审计通过；完整复跑实际等待 7 秒后成功，新增 CORS 专项与全部既有浏览器流程均通过。此轮没有修改云端协议，R2/SeaweedFS 记录来自前面的真实服务轮次，没有伪称在登录修复后再次执行云请求。

P2 显示问题的[失败证据](./local/cleanup-render-red.txt)和[修复后证据](./local/cleanup-render-green.txt)保留；新断言先因缺少“已删除”失败，修复后通过。不能把单个聚焦测试通过写成完整检查通过。

AWS S3 按现行约定不要求实测，本次未验证。物理设备不在当前要求内；其他浏览器引擎未验证。AMD64/ARM64 镜像与容器留给 Release 流程，本次未创建 Release、发布镜像或部署。PR 保持草稿，不合并、不主动关闭 Issue，不删除分支或 worktree。
