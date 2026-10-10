# 默认全量浏览器流程：已知失败分析

2026-10-09。本记录分析本轮默认全量流程中已完成离线核对的范围外失败。全量于本地时间 21:03:56 结束，退出码 1，运行器结果为 failed。未为处理下列范围外失败修改产品代码或测试断言，也未另行操作浏览器。

## 最终阶段统计

以 `test-results/identity-184/browser-full/runner.json` 的 `stages` 为唯一阶段统计依据：共 77 个运行器阶段，含应用启动、重启及浏览器场景；57 个通过、17 个失败、3 个因依赖阻塞未执行，实际执行 74 个。这里不是断言数量或截图数量。

17 个失败中，#184 自身的迟到重置响应改写地址和双 SMTP CA 冲突各占 1 个阶段；修复与重新验证分别由[主记录](./README.md)及[SMTP CA 记录](./smtp-ca-verification.md)维护，不归入下述范围外失败。其余 15 个失败阶段均在下文逐项记录。`library-viewer.json` 是 `library` 阶段的嵌套错误，只计一处；不能以两个 JSON 重复计数。

3 个未执行阶段均依赖失败的 1440px OAuth before：`oauth-1440-after`、`oauth-1440-enable-restart`、`oauth-1440-enabled`。390px Token、OAuth before/after/enabled，以及末尾 sharing-public、sharing-viewer、sharing-experiment 均实际通过。先前已有失败不因这些后续阶段通过而消失。

根目录 JSON 数量不能作为阶段总数：包含嵌套子报告和额外诊断记录；启动与重启等阶段则仅在运行器记录中统计。原始 full 结果保持失败，后续定向复查也不改写本轮记录。

## 共同依据与范围

本次起点为 `4db067f288a0c9859fe791eea57ac2f36365cef9`。以下相关文件分别与该起点、当前 `origin/main` 比较，均无差异：

- `e2e/tokens.mjs`、`e2e/tokens-reads.mjs`、`e2e/tokens-transport.mjs`。
- `e2e/oauth-settings.mjs`。
- `src/components/identity/use-github-account-view.ts`、`src/components/identity/github-account.tsx`、`src/components/identity/session-controls.tsx`。
- `scripts/browser-identity-management.mjs`。

`src/server/identity/auth.ts` 本次有密码恢复改动，但原生限流配置仍为 `rateLimit: { enabled: true, storage: 'memory' }`。新增认证钩子只在密码恢复路径执行；现有会话核对、登录配置与上传 Token 场景未改动限流规则。

实际默认调用链先执行 1440px 身份管理，再进入 390px 业务场景列表。新增 `password-reset` 场景属于后者。因此，下述两项 1440px 失败发生时，新的密码恢复场景尚未执行。图片处理和存储管理位于 390px 业务列表中该场景之前，出现下述失败时也尚未执行密码恢复场景。新增 SMTP fixture 在运行器启动时只生成临时证书、启动本地监听器，没有向生产应用发出申请、重置、登录或会话请求。

以下证据均为本地忽略文件。只记录文件名和文字摘要，不复制日志正文、图片或任何密码、Cookie、Token、初始化码。后续公开证据不能直接收录可能带有一次展示明文的通用失败快照。

## 上传 Token：真实会话核对收到 HTTP 429

- 报告：`test-results/identity-184/browser-full/tokens-1440.json`，失败阶段为 `session-expiry`。
- 本地截图：`test-results/identity-184/browser-full/tokens-1440-failure.png`。
- 本地日志：`test-results/identity-184/browser-full/tokens-1440.log`、`tokens-1440-failure-state.log`。后一个语义快照含测试 Token 明文，仅保留在本地忽略目录，不复制到提交或公开报告。

`e2e/tokens-reads.mjs:86–96` 先将隔离数据库中的真实会话设为过期，再触发窗口焦点事件。检查随后等待进入 `/login`，或等待上传 Token 页面进入 `data-state="session"`。这个等待在 10 秒后超时。

失败截图与语义快照显示，实际页面仍在 `/settings/api`，一次展示的 Token 弹窗仍然打开。侧栏明确显示“会话核对失败（HTTP 429），请检查连接后重试。”。这不是已确认退出后的界面，也不是单纯缺少成功文案。

现有 `session-controls.tsx:36–54` 在会话核对收到非成功响应时显示错误；只有成功读到空会话时才清理上传状态并进入失效路径。因此，本次观察到的 HTTP 429 会阻止该场景等待的会话失效处理。当前证据没有记录这次响应的重试窗口，也没有证明限流请求数量的具体来源，不能把原因进一步归结为某一个页面动作或固定等待时长。

归属：既有上传 Token / 会话核对场景遭遇真实限流，本次未修改其产品实现、脚本或原生限流配置。没有发现由 #184 密码恢复场景直接触发的证据。该场景仍为失败，不能记为会话失效清理通过；限流来源及可恢复性仍待独立验证。

## OAuth：核对成功后焦点未回到登录配置

- 报告：`test-results/identity-184/browser-full/oauth-1440-before.json`，失败阶段为 `closed-configuration-unknown`。
- 本地截图：`test-results/identity-184/browser-full/oauth-1440-before-failure-1440.png`。
- 同阶段内部截图：`oauth-1440-before-configuration-unknown-closed-light-1440.png`、`oauth-1440-before-configuration-unknown-closed-dark-1440.png`，均位于同一本地忽略目录。
- 本地日志：`test-results/identity-184/browser-full/oauth-1440-before.log`、`oauth-1440-before-failure-state.log`。

该场景先完成真实保存，再丢失响应并让核对读取失败，验证关闭编辑器后仍保留未知结果。两个 `configuration-unknown-closed` 截图已经生成，说明这部分检查已经执行。解除故障注入后，脚本再次点击主页面的核对配置操作。

失败时的真实截图显示，编辑器已关闭，主页面展示“已核对当前配置，无法确认这次密钥修改结果。”，并已恢复可用的“登录配置”按钮。依据现有组件，显示该按钮需要配置读取就绪；该按钮未设置禁用属性。因此，失败定位到 `e2e/oauth-settings.mjs:133–136` 的焦点断言：`document.activeElement` 没有回到 `account-github-config`。此前等待读取就绪及按钮可用的检查已满足。

现有 `use-github-account-view.ts:90–100` 在异步读取完成后更新状态，再通过一次 `requestAnimationFrame` 查询并聚焦新显示的按钮。源码存在聚焦回调与按钮实际提交到页面之间的时序风险。离线证据能确认焦点恢复失败，尚不能确认该时序就是唯一根因。

归属：既有 OAuth 配置核对后的实际焦点恢复风险。该断言验证的是需要保留的用户行为，不能归类为陈旧断言或删去断言。本次相关组件与脚本均未修改；失败发生在密码恢复场景执行之前。该焦点检查仍为失败，保存与读取成功不能替代焦点验收。

## 图片处理：素材重试点击时目标脱离页面

- 报告：`test-results/identity-184/browser-full/processing.json`，失败阶段为 `settings`。
- 本地截图：`test-results/identity-184/browser-full/processing-asset-read-failure.png`、`processing-failure.png`。
- 同阶段内部截图：`processing-asset-read-error-dark-390.png`、`processing-asset-read-error-controls-dark-390.png`，均位于同一本地忽略目录。
- 本地日志：`test-results/identity-184/browser-full/processing.log`、`processing-failure-state.log`。

`e2e/processing-settings.mjs:563–577` 在真实已保存水印素材的读取响应被故障夹具丢失后，先确认保留素材 ID 和重试入口，再记录错误状态与控件截图，最后点击 `processing-asset-retry`。本次该点击在 3 秒后返回 `ElementResolutionError`，具体信息为目标元素已不再连接到页面。

真实 390px 深色截图显示图片处理表单仍在，素材区域显示“素材信息读取失败，当前 ID 已保留。”，并有“重新读取素材信息”操作。报告的 `assetReadRecovery` 记录显示，故障解除标记仍为 false，可信操作记录仍为空；11 次真实素材元数据 GET 均返回 200，随后仍被夹具丢失。也就是说，服务端素材读取本身成功，但脚本期待的可信点击没有触发故障解除，未取得重试成功证据。

现有素材组件的重试按钮会在查询进行中禁用，查询错误区域也会随读取状态更新。报告足以定位点击未完成，尚不足以确定具体是哪次重新渲染、查询触发或浏览器元素处理使目标脱离页面，不能把某一种时序推断写成已验证根因。

归属：既有图片处理素材重试场景的元素连接/点击时序失败。相关 `e2e/processing.mjs`、`e2e/processing-settings.mjs`、`src/components/processing/` 和 `src/server/media/watermark-assets.ts` 对起点及当前 `origin/main` 均无差异；该阶段在密码恢复场景之前执行。本次保留失败，不改变点击方式或断言来将其记作通过。

## 存储管理：等待错误提示超时，但真实拒绝结果已显示

- 报告：`test-results/identity-184/browser-full/storage-admin.json`。
- 本地截图：`test-results/identity-184/browser-full/storage-admin-local-path-failure.png`。
- 本地日志：`test-results/identity-184/browser-full/storage-admin.log`、`storage-admin-failure-state.log`。

`e2e/storage-local-validation.mjs:36–38` 对隔离本地存储填写根目录外的相对路径并点击保存，随后等待 `[role="alert"]`。本次等待在 10 秒后超时。

失败截图已经显示“请检查存储配置字段”，相对路径字段显示红色错误与“请输入存储根目录内的相对路径”，用户输入仍保留。报告的 `localPathDiagnostic` 同时记录真实 PATCH 返回 400、错误根节点具有 `role="alert"`，数据库保存路径仍为修改前值。因此，本次没有观察到越界路径被保存，也不能归结为产品未显示错误提示。

当前可确认的是，浏览器等待结果与失败后实际截图、DOM 诊断不一致。现有记录没有完整的错误节点出现时间或等待内部状态，尚不能区分迟到的页面提交、节点更新与浏览器等待观察问题。不得将失败等待删除，也不得把失败后的状态证据替代整段浏览器场景通过。

归属：既有存储管理非法路径验证场景的等待/观察问题，具体根因尚未确定。`e2e/storage-admin.mjs`、`e2e/storage-local-validation.mjs`、`src/components/storage/` 和 `src/server/storage/validation.ts` 对起点及当前 `origin/main` 均无差异；该阶段在密码恢复场景之前执行。

## 图库大图：显式 HEIC 原图场景的浏览器执行上下文失效

- 报告：`test-results/identity-184/browser-full/library-viewer.json`、`library.json`。这是嵌套大图场景的同一错误向上层传播，不能计作两个独立失败。
- 本地截图：`test-results/identity-184/browser-full/library-viewer-failure.png`。
- 本地日志：`test-results/identity-184/browser-full/library.log`、`library-failure-state.log`。

`e2e/library.mjs:515` 等待 `verifyLibraryViewer`。子报告的最后阶段为 `versions:issue185-heic:explicit-original`。`e2e/library-viewer-versions.mjs:210–215` 先切到缩略图再显式选择原图，设置阶段标记后点击“查看大图”，等待当前大图中的原图占位。该区间返回浏览器协议错误 `Cannot find context with specified id`。错误不是某个产品断言返回 false，现有调用栈也不足以进一步定位到点击还是后续等待。

两个失败后捕获的页面状态存在差异，必须分别保留：运行器的 `library-failure-state.log` 显示 HEIC 原图详情，正文为“当前版本读取失败。”并提供重试预览；稍后的子报告 `failurePage` 和失败截图却显示带 `issue173-` 搜索条件的空图库，没有详情或大图。文件时间也显示，子报告和图片完成于运行器失败状态日志之后。因此，较晚截图不能冒充异常发生瞬间，也不能据此断言 HEIC 显式原图功能已出现新的产品回归。页面变化与浏览器执行上下文失效之间的具体原因尚未确定。

归属：既有图库/大图显式原图场景的浏览器执行上下文失败，仍为未通过。`e2e/library.mjs`、`e2e/library-viewer.mjs`、`e2e/library-viewer-versions.mjs` 及 `src/components/library/` 对起点和当前 `origin/main` 均无差异。该图库阶段位于密码恢复场景之前；没有发现由 #184 恢复流程直接触发的证据。未修改测试、产品或浏览器恢复方式。

## 图库批量操作：跨页选择回收记录时浏览器执行上下文失效

- 报告：`test-results/identity-184/browser-full/library-batch.json`，`activeCheck` 为 `trash-restore-preserves-surviving-data`。
- 本地截图：`test-results/identity-184/browser-full/library-batch-failure.png`。
- 本地日志：`test-results/identity-184/browser-full/library-batch.log`、`library-batch-failure-state.log`。本次主日志为空，定位依据为 JSON、失败状态快照和调用链。

场景此前已完成批量移入回收站、真实数据库状态和文件保留检查，并生成 `trash-success` 代表状态截图。随后，`e2e/library-batch-lifecycle.mjs:114–140` 在真实回收站跨六页选择 201 条记录：每页勾选后等待累计选择数量，再进入下一页；全部选择完成后才打开恢复操作。本次返回浏览器协议错误 `Cannot find context with specified id`，没有业务断言失败的具体调用栈。

失败状态日志显示回收站共有 201 条记录，当前第 2/6 页，累计已选择 40 张，列表从 `issue177-040.png` 开始。因此可以确认已进入跨页选择区间，尚未取得全部 201 条选择完成、恢复操作或后续数据保留断言通过的证据。现有记录不能进一步定位到第二页等待、勾选或累计数量检查中的某一行。

稍后的失败截图却显示带 `issue186-` 搜索条件的图库，已不是上述回收站。状态日志完成于 20:00:42.731，截图完成于 20:00:44.068，报告完成于 20:00:44.134。这种捕获时序差异与前述大图上下文失败相似，但不足以证明相同根因；较晚截图不能作为异常瞬间的回收站状态。当前没有证明批量恢复业务本身出错，也没有取得该场景通过证据。

归属：既有图库批量生命周期场景的浏览器执行上下文失败。`e2e/library-batch.mjs`、`e2e/library-batch-lifecycle.mjs`、`e2e/library-batch-helpers.mjs`、`src/components/library/` 和 `src/components/trash/` 对起点及当前 `origin/main` 均无差异。默认计划中该场景位于密码恢复场景之前；本次没有修改这些实现或测试，仍保留原始失败结果。

## 图库批量重处理：已完成真实任务，等待列表故障夹具未触发

- 报告：`test-results/identity-184/browser-full/library-reprocess.json`。
- 本地截图：`test-results/identity-184/browser-full/library-reprocess-failure.png`。
- 本地日志：`test-results/identity-184/browser-full/library-reprocess.log`、`library-reprocess-failure-state.log`。

在真实损坏原图、恢复原始字节并重试成功等先前检查之后，`e2e/library-batch-reprocess.mjs:750–769` 创建新任务并暂缓 worker，启用 `terminal-refresh` 夹具，解除 worker 暂缓，然后等待 `window.__reprocessRefreshRelease`。该标记只会在真实终态进度核对后，下一次 `/api/images` 列表请求被夹具暂扣时设置。本次等待在 30 秒后超时，后续列表刷新失败及显式重试检查未执行。

报告记录实际 apply 和 check 均返回 200，任务先为 queued、随后为 succeeded。失败数据库诊断也显示同一个实际 worker 任务 succeeded。真实手机截图和失败状态日志展示“重新处理完成”、完成 1 张、已更新压缩图/缩略图/水印图，没有列表刷新错误。列表流量记录却为空。因此，本次失败是所等待的列表故障夹具没有触发，不能写成 worker 执行失败，也不能将任务成功代替列表刷新错误恢复通过。

当前 URL 为 `/library?q=issue186-&pageSize=20`，没有 `page` 参数。现有 `use-library-query.ts` 依该参数区分分页和无限加载；终态刷新在分页模式读取 `/api/images`，无限加载模式通过 `POST /api/images/status` 读取当前图片状态。夹具只暂扣前者。场景确实会写入分页偏好，但记录中的实际 URL 与该预期不同；现有证据没有捕获 `/api/images/status` 请求，尚不足以确定偏好初始化、导航还是其他时序导致此差异。应保留该加载模式与夹具等待目标不一致的线索，不能直接将推断写成唯一根因或删去等待。

归属：既有图库批量重处理终态列表故障验证未完成。`e2e/library-batch-reprocess.mjs`、`e2e/library-batch-reprocess-helpers.mjs`、`e2e/library-batch-reprocess-fixture.mjs`、`src/components/library/`、`src/app/library/` 和 `src/app/albums/` 对起点及当前 `origin/main` 均无差异。默认计划中该场景在密码恢复之前；本次未修改其产品或测试。

## 图库复制消费路由：选择实际图片后上传队列未出现

- 报告：`test-results/identity-184/browser-full/library-copy.json`，失败阶段为 `upload-layout-consumer`。
- 本地截图：`test-results/identity-184/browser-full/library-copy-failure.png`。
- 本地日志：`test-results/identity-184/browser-full/library-copy.log`、`library-copy-failure-state.log`。

此阶段已经执行上传空选择区的全部主题/视口布局检查。`e2e/library-copy-consumers.mjs:232–239` 随后打开原生“选择图片”文件选择器，调用 `setFiles` 选择独立的 `sample.png`，等待实际队列中的 `[data-testid="upload-item"]`。本次该等待在 10 秒后超时；后续单行文件名检查和文件夹选择检查尚未执行。

失败截图、报告页面快照和状态日志一致显示空上传选择区及本次上传设置，没有图片队列、`sample.png` 行或输入失败说明。焦点在 `upload-title`。现有 `src/components/upload/item.tsx` 仍使用所等待的 `upload-item` 标记，因此不能将失败归为已废弃的选择器。

现有图片输入在原生 change 后复制文件列表、清空输入，再交由扫描与上传控制器接收。此次记录没有输入 change、实际选择文件列表或扫描报告，尚不能区分浏览器文件派发、接收生命周期和扫描过程中的具体原因。不能把文件选择器调用返回当作队列已接收，也不能通过删除该等待使其通过。

归属：既有图库复制任务的上传公共消费路由验证失败。`e2e/library-copy.mjs`、`e2e/library-copy-consumers.mjs`、`src/components/upload/` 和 `src/app/upload/` 对起点及当前 `origin/main` 均无差异。默认计划中该场景位于密码恢复之前；本次未修改这些产品路径或测试。

## 相册封面：登录返回地址的精确等待与分页初始化不一致

- 报告：`test-results/identity-184/browser-full/album-cover.json`，失败阶段为 `owner session and fixtures`，尚无封面检查通过记录。
- 本地截图：`test-results/identity-184/browser-full/album-cover-failure.png`。
- 本地日志：`test-results/identity-184/browser-full/album-cover.log`、`album-cover-failure-state.log`。

`e2e/album-cover.mjs:389–397` 进入图库，遇到登录页后调用共用真实登录辅助函数。`e2e/library-login.mjs:44` 精确等待登录原返回地址 `/library`，本次在 10 秒后超时；实际地址为 `/library?page=1`。失败截图及状态记录显示已登录 Owner 的真实图库，40 项分页记录与分页控件均在，而非仍停留在登录页。

现有 `use-library-query.ts:145–153` 在没有 `page` 参数且保存偏好为分页时，会通过历史记录替换将地址规范化为 `page=1`。因此，共用登录等待不允许这次合法规范化，使封面场景在准备阶段退出。场景尚未执行偏好设置和创建独立封面 fixture，也没有取得自动封面、手工封面或错误恢复检查的证据。该失败应记录为前置等待不匹配，不能写成相册封面业务失败或封面场景通过。

归属：既有图库登录辅助函数精确地址等待与分页初始化的断言不匹配。`e2e/album-cover.mjs`、`e2e/library-login.mjs`、`src/app/library/` 和 `src/components/albums/` 对起点及当前 `origin/main` 均无差异。本次 `login-form.tsx` 只新增忘记密码链接，未修改登录成功后的 `returnTo` 跳转。该阶段仍在密码恢复场景之前。未修改等待或产品来消除本次失败。

## 上传输入：浏览器原生文件夹枚举返回取消

- 报告：`test-results/identity-184/browser-full/upload-input.json`。
- 本地日志：`test-results/identity-184/browser-full/upload-input.log`、`upload-input-failure-state.log`。
- 本场景没有生成失败截图；不以其他上传场景的截图代替。

`e2e/upload-input.mjs:179–198` 确认生产文件夹 input 后，调用浏览器协议 `DOM.setFileInputFiles` 选择独立嵌套目录，并在真实 input 上观察 change/cancel 事件。本次实际捕获 `cancel`，文件数为 0、相对路径数为 0。因此脚本按原有明确断言失败：浏览器取消原生目录枚举，文件夹选择仍未验证。

报告确认该 input 为文件类型、支持 multiple、`webkitdirectory` 属性与特性均为 true，浏览器空间归属仍为 agent。此前真实普通多选的同名文件独立排队检查已通过。失败状态快照显示空上传页；本次没有取得文件夹递归扫描、目录内同名文件、后续拖拽或其他输入状态的通过证据。

归属：既有上传输入场景的浏览器原生目录选择取消。具体为何取消尚未确定，不能归结为产品未提供文件夹能力，也不能用合成文件列表绕过实际取消后宣称原生枚举通过。`e2e/upload-input.mjs`、`src/components/upload/` 和 `src/app/upload/` 对起点及当前 `origin/main` 均无差异。默认计划中该场景位于密码恢复之前；本次未修改输入实现、浏览器操作或断言。

## 上传关系选择：短视口键盘打开标签选择器未完成

- 报告：`test-results/identity-184/browser-full/upload-relations.json`。
- 本地截图：`test-results/identity-184/browser-full/relations-failure.png`。
- 本地日志：`test-results/identity-184/browser-full/upload-relations.log`、`upload-relations-failure-state.log`。

报告最后一步为在 390×400 短视口中，通过键盘打开标签选择器，以继续快捷创建标签。`e2e/upload-relation-choices.mjs:28–85` 聚焦实际选择器，确认几何范围及焦点后按 Enter，再等待实际选择浮层稳定。本次函数等待在 10 秒后超时。最后一步记录中的按钮在视口内，范围为顶部 171.5、底部 215.5；失败后的诊断则为 `aria-expanded=false`，没有浮层或新建按钮。

真实深色截图显示标签选择器仍闭合，之前选择的相册和标签仍在；没有快捷创建标签弹窗。报告已经记录两个快捷创建取消保持选择、不创建记录等先前检查，但没有记录本次打开完成。调用栈没有具体函数行号，尚不能进一步区分 Enter 前的焦点就绪等待与打开后的稳定等待，也不能确认焦点、滚动或浮层关闭中的唯一根因。

归属：既有上传关系选择/快捷创建在手机短视口的键盘交互等待失败。该断言对应实际可用性要求，不能仅当作陈旧等待删除。`e2e/upload-relations.mjs`、`e2e/upload-relation-choices.mjs`、`e2e/upload-relation-creation.mjs`、`e2e/upload-relation-layouts.mjs` 和 `src/components/upload/relations.tsx` 对起点及当前 `origin/main` 均无差异。默认计划中该场景位于密码恢复之前；本次未修改这些实现或断言。

## 分享管理：返回相册后精确地址等待与分页初始化不一致

- 报告：`test-results/identity-184/browser-full/sharing-management.json`，失败阶段为 `album-entry-and-create-current-record`。
- 本地截图：`test-results/identity-184/browser-full/sharing-management-failure.png`。
- 本地日志：`test-results/identity-184/browser-full/sharing-management.log`、`sharing-management-failure-state.log`。

场景已经完成相册入口、实际并发创建后的设置读取与返回操作可点击性检查。报告的 `returnDuringNotice.unobstructed` 为 true，真实成功通知仍在时的截图也已经生成。`e2e/sharing-management.mjs:1326–1327` 随后实际点击返回相册，并精确等待 `/albums/issue191-new`。本次 10 秒后超时，实际地址为 `/albums/issue191-new?page=1`。

真实失败截图和状态快照显示对应相册详情、相册操作和空图片列表，底部为分页控件。因此，返回操作已到正确相册，等待未允许共用图库查询按照分页偏好追加 `page=1`。该问题与相册封面准备阶段的精确地址等待不匹配属于同类证据，但保留独立场景结果；后续分享恢复/失效等检查不能由先前成功记录代替。

归属：既有分享管理返回相册的精确地址等待与公共分页初始化不一致。`e2e/sharing-management.mjs`、`src/app/shares/`、`src/components/sharing/` 和 `src/app/library/` 对起点及当前 `origin/main` 均无差异。默认计划中该场景位于密码恢复之前；本次未修改其产品或测试。

## 上传 API 用法：手机说明关闭后焦点未满足恢复断言

- 报告：`test-results/identity-184/browser-full/upload-usage.json`。
- 本地截图：`test-results/identity-184/browser-full/upload-usage-failure.png`。
- 同阶段内部截图：`upload-usage-tips-light-360.png`，位于同一本地忽略目录。
- 本地日志：`test-results/identity-184/browser-full/upload-usage.log`、`upload-usage-failure-state.log`。

`e2e/upload-usage.mjs:278–292` 在真实说明浮层关闭后，通过 Tab、Shift+Tab 和手机 Enter 再次打开，按 Escape 关闭，再检查焦点回到“上传注意事项”按钮。本次浮层隐藏的等待已经满足，随后 `document.activeElement` 的 `aria-label` 为 null，未满足所需名称，因此断言失败。

最后生成的正常说明截图为 360px 浅色状态。失败截图及状态日志显示上传 API 用法页面、说明按钮仍在，但说明浮层已经关闭。按钮外观看似存在轮廓不能代替实际焦点断言；本次没有保存失败瞬间 activeElement 的具体节点，不能断定焦点落到何处或唯一时序原因。

归属：既有上传用法手机说明交互的实际焦点恢复风险。该断言对应需要保留的键盘行为，不能当作陈旧断言删除。`e2e/upload-usage.mjs`、`src/components/upload-usage/` 和 `src/app/settings/api/usage/` 对起点及当前 `origin/main` 均无差异。默认计划中该场景位于密码恢复之前；本次未修改这些路径或重跑验证。

## 站点通用设置：重新登录后的共用精确地址等待失败

- 报告：`test-results/identity-184/browser-full/site-general.json`，阶段为 `recovery`。
- 本地日志：`test-results/identity-184/browser-full/site-general.log`、`site-general-failure-state.log`。
- 本场景没有生成失败截图；先前其他状态截图不能代替该失败瞬间。

`e2e/site-general-recovery.mjs:386–409` 在真实退出、站点保存收到 401 后，检查同页保留禁用草稿及数据库原值，再进入图库重新登录。共用 `e2e/library-login.mjs:44` 精确等待 `/library`，本次 10 秒后超时；实际地址为 `/library?page=1`。失败状态日志显示已登录的分页图库。

该失败与相册封面使用同一个登录辅助函数，实际页面已完成登录并经过合法分页地址初始化。此前失效保存行为已经取得真实 401 与草稿保留检查证据，但重新登录后的返回设置/数据库再核对及后续消费路由阶段尚未完成。报告确认原站点配置和剪贴板已恢复，不能据此将整段恢复流程记为通过。

归属：既有共用图库登录精确地址等待与分页初始化不匹配。`e2e/site-general.mjs`、`e2e/site-general-recovery.mjs`、`e2e/site-general-helpers.mjs`、`e2e/library-login.mjs`、`src/app/library/` 和 `src/components/site/` 对起点及当前 `origin/main` 均无差异。该阶段位于密码恢复之前，本次未修改其产品或测试。

## 账号设置 390px：重启后的背景会话核对收到限流结果

- 报告：`test-results/identity-184/browser-full/account-390.json`，阶段为 `password-390`。
- 本地截图：`test-results/identity-184/browser-full/account-390-failure.png`。
- 本地日志：`test-results/identity-184/browser-full/account-390.log`、`account-390-failure-state.log`。

`e2e/account-password.mjs:256–264` 在真实密码提交响应丢失后，先完成明确退出失败与当前会话保留检查，再暂扣第二次真实退出响应，同时放行已启动的背景会话请求。退出响应为 200，但背景请求正文为原生“Too many requests. Please try again later.”，未满足预期空会话，因此断言失败。真实手机截图仍显示修改未知核对弹窗和“尚未确认会话已退出，请重试。”；不能把成功退出响应替代背景会话读取或整个恢复流程通过。

此项发生在密码恢复之后，归属不能仅凭文件无差异判断。具体时序及运行链已经核对：密码恢复报告完成于 20:39:02.655，账号失败完成于 20:51:18.007，相隔约 735 秒。`scripts/browser-identity-management.mjs` 在 OAuth enabled 阶段（20:49:26 完成）后，先执行 `account-runtime-390` 重启同一隔离应用进程，再执行依赖该重启通过的账号场景。`restartProduction` 会先停止旧进程再启动新进程，因此已执行的账号场景不沿用密码恢复阶段的内存限流计数。

实际安装的 Better Auth 1.7.5 以 IP 与端点路径组合分桶；本项目启用 memory 存储，未覆盖原生窗口/数量。`get-session` 使用默认 10 秒/100 次，密码恢复申请使用独立路径的 60 秒/3 次特殊规则。两路径不同桶，且账号前已经重启。因此，没有证据支持早前恢复请求的计数直接导致本次背景会话限流。当前报告没有保存全部背景请求数量及该响应重试窗口，具体限流来源仍未确定。

归属：既有账号恢复场景在独立重启后的背景会话读取遇到真实限流。`e2e/account.mjs`、`e2e/account-password.mjs`、`e2e/account-transport.mjs`、`src/components/identity/session-controls.tsx` 和 `scripts/browser-identity-management.mjs` 对起点及当前 `origin/main` 均无差异；本次认证改动也未修改原生限流规则。该失败保留为未通过，未重跑或改变断言。

## 最终 SMTP 定向复查：未保存输入确认框等待超时

此项来自最终定向 SMTP `all`，不是原始默认 full 的新增阶段，不改变上文 77 阶段统计。

- 报告：`test-results/identity-184/browser-smtp-final/smtp.json`、`runner.json`；结果均为 failed，场景阶段为 `save-and-secrets`。
- 本地真实失败截图：`test-results/identity-184/browser-smtp-final/smtp-failure.png`。
- 本地日志：同目录 `smtp.log`、`smtp-failure-state.log`。不公开截图或日志正文。

执行已越过 `e2e/smtp.mjs:357–371` 的原失败位置：真实测试请求返回诊断 `authentication`，失败结果可见且已关闭。随后恢复正确密码的 PATCH 响应已被 transport 观察到；最终 JSON 未保留该局部 transport 的状态码，不声称这次恢复后已经成功收件。原双 CA 缺陷的修复及真实组合信任链证据见[SMTP CA 记录](./smtp-ca-verification.md)。

新失败定位于 `e2e/smtp.mjs:384–386`。脚本填写未保存的发件人名称，以 `page.focus` 加 Enter 激活测试操作，再等待 `smtp-dialog-test-confirm`，10 秒后超时。失败截图与语义快照显示邮件设置表单仍在、未保存名称可见，没有确认弹窗；截图中保存按钮不可用，标题有焦点轮廓。最近的 `smtp-dirty-test-dark-1440.png` 是先前代表状态循环的截图，该循环已经通过；它不是失败时刻的页面。

实际调用链有两个尚未区分的状态边界：`readySave` 等待页面 idle，transport 的 `settled('PATCH')` 只确认真实响应已被观察，不等待后续 React 提交或焦点回调；保存完成会重建草稿，并通过 `requestAnimationFrame` 恢复焦点。测试操作又依据当前草稿与保存值是否不同，决定打开确认框还是直接发送。现有失败报告没有记录该次按键时的活动元素、React 草稿、保存值或紧邻请求，因此不能确定哪一个边界导致确认框未出现，也不能仅凭输入 DOM 文本断言内部草稿已更新。报告的四条 GET/PATCH 200 是早期直接 API 记录，不是这次失败动作的完整网络记录。

尚未执行：1440px 确认后真实 TLS 收件、清除凭据、STARTTLS、无认证中继，以及整个 390px 交互循环和后继恢复/失效/离页流程。`checks` 仅有已通过的代表状态两项，不能把原认证断言通过写成 `save-and-secrets` 或 SMTP `all` 通过。

归属：既有 SMTP 草稿确认/焦点与浏览器等待流程的未解决问题。`e2e/smtp.mjs`、`smtp-page.mjs`、`smtp-transport.mjs` 和 `src/components/identity/` 下 SMTP page、fields、draft、dialog、use-smtp-page 文件，对起点及当前 `origin/main` 均无差异。本次 CA helper 仅改变证书 subject，最终定向 SMTP 运行器只启动既有 SMTP fixture，且实际认证阶段已通过；没有发现本次密码恢复 UI 或组合 CA 造成这个确认框失败的证据。具体根因保持未确定，未改动产品、测试断言或重复运行不变输入。

## 本次离线核对

实际读取了上述 JSON、文本日志、真实失败截图及调用链源文件。执行了相关路径的 `git diff --name-only 4db067f2 -- ...`、`git diff --name-only origin/main -- ...`，输出均为空；检查了认证文件相对起点的差异和未变的限流配置；通过 `git check-ignore` 确认列出的失败截图及语义日志属于忽略文件。

本报告仅补充离线分析，没有重跑这些范围外场景，也没有改变其原始结果。最终统计已与运行器阶段核对；本次范围内的修复与定向复查由主记录分别维护，不能将后续通过写成本轮 full 通过。
