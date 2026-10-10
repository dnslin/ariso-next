# PR #277 独立正确性与五轴审查

结论：**Approve**。本次未发现达到高确信、应阻止合并的 PR 引入缺陷。未提交或推送代码，也未评论 PR。

## 固定范围与依据

- PR：https://github.com/dnslin/ariso-next/pull/277
- base：`9ab5be055e9790d1b243935e259d5af87cccd610`
- head：`01cd853d189d02baa868901a82d9d7e223455ea0`
- 工作区：`/Users/dnslin/.codex/worktrees/issue-196-brand-settings/ariso`。开始时 HEAD 符合以上 SHA，工作树干净。origin/main 后续推进不纳入本次归因。
- 已实际阅读 code-review-and-quality、vercel-react-best-practices 技能，以及 AGENTS.md、docs/README.md、docs/design/handoff.md、docs/tasks/execution.md；按先测试后源码执行。
- 以 SPEC-site §6/7、Issue #196 与最终批准行为为依据。2026-10-11 用户明确人工验收通过；旧证据中“待人工”的文字属于历史状态，不据此阻断。
- 阅读新增单元与浏览器断言，并交叉检查 BrandingPage→useBranding→branding-api→既有 site HTTP/owner/branding service、离开保护与会话控制、SiteLogo/home/share/OwnerShell、22 个后台消费者及元信息、登录卡片/GitHub图标/忘记密码、浏览器调度与重启配置、依赖与类型。

## Findings（按严重程度）

无高确信可行动缺陷。未将已有实现或历史全量失败自动归因于本 PR，未为风格偏好提出阻断项。

## 五轴结论

| 轴             | 结论与证据                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正确性         | 通过。PUT/DELETE只处理当前kind，保留File与另一素材/文本。明确失败保留引用；网络/500保持unknown并禁止自动写回，GET仅确认当前引用，删除读回null才完成。401、后台会话失效和卸载均中止在途请求并挡住迟到缓存/反馈。新服务器快照同步公开字段且不丢File。成功取消/采用服务器/卸载释放Blob；离开由既有导航确认承接。                               |
| 可读性与简单性 | 通过。编辑状态、网络读写、素材行、预览和删除对话框职责清楚，文件尺寸可审。没有为此另建通用状态框架或重做服务。                                                                                                                                                                                                                              |
| 架构           | 通过。复用#195版本URL、素材存储与权限边界，站点文本保存和素材保存分离；公共Logo在所属site组件维护，后台入口只传公开logoUrl，未复制导航清单。                                                                                                                                                                                                |
| 安全           | 通过。本PR无新增管理服务授权路径；页面与既有API分别检查所有者，写入沿当前站点origin验证。预览仅使用img+Blob，不插入SVG/HTML，服务按内容解析格式及5MiB边界。站点名称描述为React文本，公开消费者没有序列化配置密钥。新增图标包是设计规范允许的MIT库，直接导入LogoGithub，锁文件固定2.22.0；未执行全依赖漏洞扫描，不能据此声称无任何上游漏洞。 |
| 性能           | 通过。单个本地预览URL按操作释放，禁止重复提交；只读缓存按需失效。服务端公开字段读取沿请求阶段，未在模块顶层新增数据库I/O；图标使用直接模块导入，没有引入整包图标渲染或额外公共请求瀑布。                                                                                                                                                    |

## 本审查实际执行

环境：Node 24.18.1；原工作区锁定pnpm 11.19.0。

1. `pnpm exec vitest run --project unit tests/unit/site/branding-editor.test.ts tests/unit/site/brand-consumers.test.ts tests/unit/identity/return-to.test.ts tests/unit/upload/usage-page.test.ts tests/unit/runtime/browser-business-cli.test.ts tests/unit/runtime/browser-plan.test.ts`（原工作区，PATH使用Node24）——exit0，**6文件、210测试通过**。
2. 技能要求的独立变异：复制use-branding.ts、branding-api.ts、api.ts及原branding-editor测试到系统临时目录，链接现有node_modules。先备份use-branding.ts；基线13/13通过。只反转本PR删除核对条件 `brandAsset(value, operation.kind).url === null` 为 `!== null`——**10通过、3失败，exit1**。两条“删除未知读回”断言与一条reconcile通知断言失败，证明删除完成/保留引用的核心行为有有效回归保护。
3. 从副本备份精确恢复，并逐字节比较恢复副本与原工作区源码，结果相同。使用 `node node_modules/vitest/vitest.mjs run --root /var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/issue196-review-mutation-omc34yrl --project unit tests/unit/site/branding-editor.test.ts`——exit0，**13/13通过**。共享产品源码从未修改。
4. `git status --short` 在本审查源码读取与变异恢复后为空。主线程随后更新人工验收文档不属于本审查产品修改。

输出捕获归档（当时未重定向，现从工具输出转录；不冒称原始重定向日志）：

- [selected-unit.log](./checks/review-2026-10-11/selected-unit.log)
- [mutation-baseline.log](./checks/review-2026-10-11/mutation-baseline.log)
- [mutation-failed.log](./checks/review-2026-10-11/mutation-failed.log)（失败概要与定位，完整堆栈见本次工具记录）
- [mutation-restored.log](./checks/review-2026-10-11/mutation-restored.log)

## 原交付验证核对（非本审查重跑）

直接读取原始JSON/日志并与场景代码交叉核对：default-final.json为18checks/118layouts、44个后台路由组合；default-final-restart.json为1check且originalSiteRestored=true；default-final-runner.json为passed且temporaryDirectoryRemoved=true。报告4条资源错误均是脚本明确移走同一当前Logo文件产生的预期错误，不是无条件忽略任意error。浏览器脚本核对真实文件提交、独立保存、未知写入不重放、SVG不执行、Blob释放、会话过期与重新登录、两次品牌更新和真实重启。

全量浏览器原始full-runner.json仍是59passed/20failed/2blocked。完整集成日志仍是190/191文件、1895/1896断言通过，唯一失败upload/api畸形multipart ECONNRESET，相关源代码/测试不在本PR修改范围。定向通过不能抹去以上失败。构建日志有编译/类型/页面生成成功及Next可选平台依赖解析诊断；构建成功为原交付记录，并非本审查执行。未重跑构建、全量集成或浏览器，没有操作用户预览数据/进程。远端CI、发布镜像、Linux与另一CPU架构不在本审查验证范围。

## 审查实验环境副作用与恢复

第一次临时副本package.json只有`{"type":"module"}`，在该目录运行pnpm exec导致其自动选择全局pnpm12.4.2，输出`Packages: -845`，影响了链接的共享依赖目录。这是审查实验失误，不能写成完全无环境副作用。该次13测试仍通过；之后补副本packageManager=pnpm@11.19.0，完成反转实验，恢复后的验证改为Node直接运行。未改共享源码、断言、锁文件，也未进入任何用户预览目录。

已立即向主线程披露。主线程报告原工作区以Node24.18.1/pnpm11.19.0执行`pnpm install --frozen-lockfile`恢复exit0（660 packages reused、downloaded0，7.9s），日志`/tmp/issue196-review-restore-install.log`；git status仍干净，独立预览PID35505仍存活且health200。预览检查与依赖恢复由主线程完成，本审查未自行操作预览。后续不再运行副本pnpm或重复相关测试。
