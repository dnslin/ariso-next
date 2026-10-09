# T-SITE-03 独立代码审计

2026-10-09，独立 agent 按实际读取的 `code-review-and-quality` 审阅 Issue [#195](https://github.com/dnslin/ariso-next/issues/195)、AGENTS、[site §6/7](../../specs/SPEC-site.md) 和[执行约定](../../tasks/execution.md)。范围为品牌服务、所有者 HTTP 写入、匿名读取、启动/停止、运行时 metadata、真实工具与 HTTP 测试、默认浏览器调用链；未修改产品或测试源码。

## 发现与处理

- **P2 / 必修，已修复并独立复审**：初版 `src/server/site/branding.ts:246` 的 `read` 在检查当前引用后异步读取文件。读取与成功替换/删除交错时，旧文件正常被移除，但旧请求被误报为 `SITE_ASSET_MISSING / 500`。独立临时副本以 `readFile` gate 固定“查到旧引用 → 替换并删旧文件 → 执行读取”的次序，预期失效 URL 返回 null，实际抛出 500。原始失败见[复现日志](./checks/review-read-race-before.log)。最终实现仅在 ENOENT 后重读当前引用：已失效返回 null；真正仍被引用的缺文件保留 500、路径与 cause。没有引入锁或磁盘重试。原独立 gate 用例与真正缺文件用例复审 **2/2 通过**，见[修复后日志](./checks/review-read-race-after.log)。产品回归另覆盖 replace/remove 两种交错。
- **覆盖补充，已落实**：生产 HTTP 尺寸测试初版覆盖 5 MiB 与 +1；最终已补入两个用途的 -1 上传、匿名读取和实际字节长度断言，保留原精确上限、+1 拒绝与旧引用/字节不变验证。实际 HTTP 执行结果由主报告记录，不将实验当作生产服务完成证据。

## 需求与结构核对

- 使用现有内容识别、完整栅格解码、XML/CSS 静态策略、SVG 子进程渲染和流式 multipart 写入，没有新增依赖。允许用途与格式分别判断，ICO 的多尺寸不会误当作动画。
- 替换按“新文件 → 短 SQLite 引用事务 → 旧文件清理”；文件 I/O 在同步事务外。并发提交时读取事务中的当前旧引用，避免根据上传开始时的快照删除错误文件。提交前失败、取消或进程退出保留旧引用，候选由 finally 或下次启动清理。
- 清理范围限定为 site 自有 UUID 文件/工作目录；其他模块文件保留。提交后的删除失败保留原错误和路径，启动重试，符合规格。
- `ready` 的目录/枚举故障保持 rejected；启动记录原错误，操作等待该 promise，不伪装就绪。`close` 取消并等待 ready/活动操作后才关闭数据库。未发现需要增加锁、独立状态机或重复验证的原因。
- 写入复用真实 Cookie 所有者检查和来源保护，认证先于 multipart。匿名读取只按当前两个引用查找，不遍历或暴露任意路径。SVG 返回确认 MIME、attachment、nosniff 和 sandbox CSP，不内联注入。
- 品牌保存不调用图库入库或访问计数。名称/描述继续由既有 PATCH 更新；全局 metadata 在 `await connection()` 后访问运行时数据库。现有无部署数据库/密钥构建测试仍进入默认集成入口。
- `pnpm run test:integration` 同时选择 integration/media-tools；新增两文件从普通组排除、由真实工具组执行一次。`pnpm run test:browser` 默认 full 中真实 branding 阶段位于实验后；独立入口拒绝无关 only/storage/preview 参数。真实浏览器证据与人工 UI 验收由主报告分别记录。
- 稳定版浏览器夹具使用独立生产 app/data 与随机凭证；finally 等待服务进程组退出，再保存已去掉初始化码和密码的服务器日志，最后移除临时根。共享 runner 同时遮盖这些临时凭证，且启动清理名单包括新增报告、截图、下载及服务器日志，没有沿用用户预览数据。

## 测试有效性实验

在独立临时副本复制 src、相关测试、迁移、夹具和脚本，保留 package.json；只软链既有 node_modules。使用 Node **24.18.1** 直接运行 Vitest，没有在副本中运行 pnpm 或安装依赖，也没有变异共享工作区。

实际命令：`PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH /Users/dnslin/.nvm/versions/node/v24.18.1/bin/node node_modules/vitest/vitest.mjs run --project media-tools tests/integration/site/branding.test.ts -t '按内容识别 logo 的 source.png'`。

反转 `!allowed.includes(facts.format)` 后，合法 PNG 测试 **1/1 失败**，报“不支持的 logo 格式: PNG”；恢复原条件后相同用例 **1/1 通过**。证据：[变异失败](./checks/review-mutation.log)、[恢复通过](./checks/review-restored.log)。日志中的其余 skipped 是该定向实验的名称过滤，不是修改默认检查或删除断言。

复审将最终 `branding.ts` 复制到同一个独立副本，保留原先失败的独立 gate 测试，直接 Node/Vitest 运行 `-t 'review: replacement|当前引用缺失'`，两项通过。没有重跑已通过且输入未变的全部测试。

未重复实现者已完成的全量单元、类型和构建检查。全量集成、真实 Ego 与修复后定向证据由主报告记录；本报告不预先声明这些检查通过。

## 当前结论

独立代码审计通过，没有未解决必修项。唯一 P2 已取得修复前失败及修复后独立定向通过证据。该结论不替代全量检查：主流程仍需如实保留默认集成已出现的启动测试失败、定向未复现和后续浏览器结果，不能记为全量一次通过。无产品布局、管理控件或 Figma 修改，设计审计不适用；T-SITE-04 页面联动与人工 UI 验收不在本次范围。

## 默认浏览器 M2 重启失败的只读关联排查

`m2-1440-after` 在 `e2e/m2.mjs:145` 等待恢复图片达到 ready，30 秒后超时。读取 `m2-1440.json` 与 `m2-1440-after.log`，并通过 runner PID **56413** 的子进程 **86766** 打开文件和 cwd，确定本次隔离数据为 `/private/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-browser-8FQBHf/identity-1440/ariso.db`。只以 SQLite `mode=ro` 查询该库，没有操作 Ego、改测试数据或重跑浏览器。

目标图片 `542a17bd-53cd-4cf1-b158-73c23433f68f` 的 job `adf8fd2a-20ce-4469-bcb2-a9114d17b299` 已是 **failed**，不是尚在等待中的 running：

| 字段                     | 实际值                                                              |
| ------------------------ | ------------------------------------------------------------------- |
| step                     | `identify`                                                          |
| error                    | `identify: MEDIA_TOOL_TIMEOUT: Cannot inspect media tool processes` |
| recovery_count           | `1`                                                                 |
| retry_count              | `0`                                                                 |
| started_at / finished_at | `1791543588793` / `1791543590184`                                   |
| image.processing_status  | `failed`                                                            |
| 已保存版本               | 仅 original，object `c32c5dd8-fd0f-4498-bdde-61c7b88fa2ed`          |

`recovery_count=1` 证明重启已恢复并启动同一持久化任务。错误来自既有 `src/server/media/tools.ts:12` 的进程枚举；该函数调用 `ps`，保留原失败为 `Cannot inspect media tool processes`（第 28 行）。`src/server/media/errors.ts:45` 将 cause 中的超时归为 `MEDIA_TOOL_TIMEOUT`。上述文件和媒体恢复/处理流程本次没有修改。

同库 site 的 `logo_key` 与 `favicon_key` 均为 null，没有品牌上传、解析或旧文件清理输入。新增品牌启动工作只处理独立的 `assets/branding`，没有调用媒体进程枚举，也没有更改媒体任务或恢复配置。当前证据将此失败定位到既有媒体工具进程检测，未发现与 #195 品牌改动的因果路径。系统资源压力可能影响超时，但本次排查没有证实其具体原因，不将推测当作结论。此阶段仍记为失败，不能由品牌定向通过代替；完整服务器日志与默认流程最终状态由主报告归档。

## 其他默认浏览器失败与根 metadata 的只读关联排查

读取本次 `storage-cors.log/json`、`processing.log/json`、`oauth-1440-before.log/json` 及 OAuth 失败截图后，未找到三项失败与新增根 `generateMetadata` 的具体因果路径。相关交互只更新客户端状态或发 API 请求，没有调用 `router.refresh`；根 metadata 不由这些 API 读取重新执行。没有操作 Ego、修改产品/数据或重跑流程，也没有进行修改前后的 A/B 对照，因此不将静态分析写成“已证实范围外”。三项失败均保留。

- **storage-cors**：`e2e/storage-cors-layout.mjs:304` 在 Escape 后等待弹窗隐藏，随即于第 308 行检查焦点。`src/components/storage/cors-screen.tsx:46` 关闭时采用 `setDialog(null)` 后单次 `requestAnimationFrame` 恢复 opener 焦点。实际 activeElement 文本包含整个 body，只证明检查时焦点落在 body，不能据其中的 next-themes 脚本文本判定主题脚本或 metadata 为原因。焦点恢复与组件提交的时序尚未复现确认。
- **processing**：settings 阶段在 `e2e/processing-settings.mjs:577` 点击素材读取重试按钮时报告 element is not connected。`assetReadRecovery` 记录 `released=false`、`activation=null`，11 次真实 GET 200 均被该场景故意丢弃，尚未发生可信重试激活。按钮由既有 `src/components/processing/watermark-asset.tsx:160` 提供，并根据查询请求状态禁用；本次没有修改该组件或素材查询。缺少事件/组件提交对照，不能断定断开原因。
- **OAuth**：阶段标签为 closed-configuration-unknown，关闭 unknown 后的浅/深截图已经生成，失败截图显示主页面“已核对当前配置”。证据更符合后续 `e2e/oauth-settings.mjs:125` 重新核对成功后、第 133 行等待“登录配置”焦点的超时。既有 `src/components/identity/use-github-account-view.ts:90` 在 refetch 成功、setState 后用单次 `requestAnimationFrame` 聚焦按钮。报告没有给出具体超时等待函数的源码行，故该定位保留为依据场景顺序和截图作出的推断，未将焦点时序猜测写成已证实根因。

后续仅只读检查下列本次默认流程报告和必要源码，未操作 Ego、修改产品或重跑。没有做 A/B 对照；所有失败仍保留，不以“源码未修改”单独证明无关。

| 场景               | 实际失败与已确认路径                                                                                                                                                                                                                                                | 与本次改动的关联结论                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| upload-input       | `e2e/upload-input.mjs:194` 断言目录选择不能收到 cancel，实际原生事件为 `cancel`、files=0。输入 type=file、multiple、webkitdirectory 均真实存在。场景第 187 行通过 CDP 设置目录；产品 `input-controls.tsx:120` 仅在 change 后取文件。                                | 当前证据是浏览器目录枚举取消，没有进入产品上传或品牌文件路径；未证实取消的根因，也未建立 root metadata 因果。目录能力保持未验证。                                                     |
| upload-relations   | 在 390×400 重新打开 tags 快速创建之前，最后步骤为 keyboard selector 定位；最终 expanded=false、overlay/create 均不存在。`upload-relation-choices.mjs:57` 等待控件可见且 activeElement 为触发器，之后才按 Enter。日志仅给 waitForFunction 超时，没有具体等待源码行。 | 证据将失败限制在键盘焦点/弹层开启阶段，尚未确认具体丢失点。相关 `upload/relations.tsx` 为已有受控 Popover；没有该交互触发 metadata 重读的路径，但未做对照，不能声称排除间接时序影响。 |
| upload-usage       | `e2e/upload-usage.mjs:287` 在 Escape 隐藏 Tips 后读 aria-label，实际 null，期望“上传注意事项”。对应 `upload-usage/usage-tips.tsx` 使用现有响应式 Tooltip/Popover。                                                                                                  | 实际是关闭后的焦点返回断言失败。没有进入品牌 API；根 metadata 不执行客户端聚焦操作，具体焦点时序未复现确认。                                                                          |
| sharing-management | album-entry-and-create-current-record 阶段，`e2e/sharing-management.mjs:1327` 等待裸 `/albums/issue191-new`，实际已到 `/albums/issue191-new?page=1`。                                                                                                               | 已找到既有 `use-library-query.ts:144-150` 按 pages 偏好补 page=1 的 URL 规范化，与精确 URL 等待不一致。metadata 不写查询参数。没有做 A/B，仍保留原失败。                              |
| album-cover        | owner session and fixtures 阶段期望裸 `/library`，实际 `/library?page=1`，尚未进入封面验证。                                                                                                                                                                        | 与上项相同的既有分页初始化路径；没有证据指向品牌引用或 metadata。封面后续检查保持未执行。                                                                                             |
| site-general       | recovery 阶段期望裸 `/library`，实际 `/library?page=1`。此前真实地址更新、独立 upload PATCH、held/lost 响应与显式 read-back 已记录通过。                                                                                                                            | 本次失败不是新增 logoUrl/faviconUrl 的精确响应键断言，也没有新增字段消费异常证据；实际为既有分页初始化与精确 URL 等待差异。后续未执行能力不记为通过。                                 |
