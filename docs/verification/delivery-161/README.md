# T-DEL-02 S3 内容访问、特殊格式和附件联验

关联 [Issue #161](https://github.com/dnslin/ariso-next/issues/161)。范围与需求沿用[任务卡](../../tasks/m3-m4-platform.md#t-del-02-s3-内容访问特殊格式和附件联验)、[SPEC-delivery](../../specs/SPEC-delivery.md)及[执行约定](../../tasks/execution.md)。实现、核心验证与独立代码审计已完成。获批的宽屏旧断言修正已通过；筛选误选已获授权修正并定向验证通过；原生目录枚举取消仍未解决，PR保留草稿。

2026-10-02 通过 gh 读取 Issue、评论和原生 blocked by / blocking。评论为空，直接前置 #69、#83、#155、#150、#153、#70 全部 CLOSED；实现及交付记录已核对。下游 #162、#164、#169、#193 仍 OPEN。从最新 origin/main `3eb585f` 创建分支 `codex/delivery-s3-161` 与独立 worktree `/Volumes/data/project/ariso-delivery-161`。原目录和真实预览数据未修改。当前必需真实服务按 execution 为 R2 与 SeaweedFS；AWS 实测已取消，不记为通过。

已推送分支并创建 [草稿 PR #224](https://github.com/dnslin/ariso-next/pull/224)。实际 `gh pr view 224 --repo dnslin/ariso-next --json number,url,state,isDraft,mergeable,headRefName,statusCheckRollup` 返回 OPEN、isDraft=true、MERGEABLE、statusCheckRollup=[]。没有远端检查，不将空列表记作CI通过，也不等待不存在的工作流。未合并、关闭Issue、发布或部署；分支与worktree保留。

## 实施行为

- `/i/{id}` 和所有者回收管理预览复用同一权限、状态、版本选择，支持已发布 S3 对象。GET 一次302到 GET 专用300秒签名，按实际版本覆盖类型、附件名称与缓存；HEAD 单独签名，无正文，不携带GET响应覆盖参数，不计数。普通GET不预查远端对象、不代理文件流量。
- 签名后重新读取真实所有者会话，再检查可见性、处理/回收/删除状态、存储及当前版本。对象、默认选版、显示名称或存储修订发生变化时最多重选一次；连续变化返回 IMAGE_CHANGED。拒绝结果不释放签名地址、不计数。所有 Ariso 成功、跳转、错误及HEAD保持 no-store/nosniff。
- SVG 远端GET强制 `application/octet-stream` 附件，保留原字节和 `.svg`；Ariso302带nosniff。不承诺远端继承任意响应头。中文/点段附件名复用现有 content-disposition 3.0.0；未新增依赖。
- 入口继续消费真实 analytics 内存聚合，最终确定匿名public/ready且非thumbnail的GET后计一次，退出时真实刷库。远端重复访问不增加Ariso计数；签发成功不代表远端完整下载。签名失败、HEAD、所有者、私有、缩略图、管理预览与拒绝不计；统计异常记录日志，已获准响应继续返回。
- S3客户端每次签名后在finally销毁。沿用storage错误上下文；远端操作失败/超时分别为502/504，不把诊断故障当匿名或缺文件。

## 验证边界

本次没有新增产品页面、组件、主题或Figma改动。Figma节点、设计还原评审及本次UI人工验收不适用；内容协议浏览器截图只证明嵌入/附件行为。后续详情、上传、分享界面仍按各任务做设计与人工验收。

全格式原文件联验复用26个现有真实样本。实际本地identify/process生成分类和派生图后，检查完整原文件摘要、帧/页数、MIME、扩展、GET/HEAD及默认不适用/适用缺版规则。实际本地重处理在候选文件落盘但尚未发布时检查所有旧链接，验证写入失败与发布事务失败均保持旧版，成功后同ID切换，关闭开关不隐藏已存版。

S3四版本协议种子仅代表已保存实际对象，不能作为远端图片处理证据。S3版本引用切换验证delivery读取当前已发布对象；生产S3直传、中转与处理由 T-UP-04 / #162，远端删除清理由 T-MED-14 / #163、完整引用与孤儿扫描由 T-STO-06 / #164承接。本任务不开放假上传或假重处理接口。

## 实际检查

环境：macOS26.6.2 arm64；主线程Node24.19.0，真实服务与独立审计Node24.18.1；pnpm11.19.0、ImageMagick7.1.2-32、ExifTool13.55、现有Ego Lite。所有测试使用独立临时数据库、测试账户、随机对象命名空间；不使用真实预览数据。不下载浏览器。

| 实际命令                                                                                                                                                                                       | 结果                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                               | 退出0，锁文件未变                                                              |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`、`pnpm --dir tests/experiments/ui run typecheck`                                                                                   | 退出0                                                                          |
| `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`                                                                                                                                 | 退出0；最终证据文档纳入格式复验                                                |
| `pnpm run test:unit`                                                                                                                                                                           | 退出0，61文件/769项                                                            |
| `pnpm run build`                                                                                                                                                                               | 退出0；本机standalone实际启动                                                  |
| `pnpm exec vitest run --project integration tests/integration/delivery/s3-races.test.ts tests/integration/delivery/local.test.ts tests/integration/delivery/local-http.test.ts --maxWorkers=1` | 退出0，3文件/58项                                                              |
| `pnpm exec vitest run --project media-tools tests/integration/delivery/formats.test.ts tests/integration/delivery/reprocess.test.ts --maxWorkers=1`                                            | 退出0，2文件/32项                                                              |
| `pnpm exec vitest run --project integration tests/integration/delivery/s3-fixture-cancel.test.ts tests/integration/delivery/s3.test.ts --maxWorkers=1`                                         | 退出0，2文件/5项                                                               |
| `pnpm run test:integration --maxWorkers=1`                                                                                                                                                     | 退出1，108文件/1029项通过，2文件各1项失败；随后复验这2文件全通过，保留首轮失败 |
| `pnpm exec vitest run --project integration tests/integration/identity/auth.test.ts tests/integration/identity/setup.test.ts --maxWorkers=1`                                                   | 退出0，2文件/46项全部通过；未修改源码、超时或断言                              |
| `EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-161 pnpm run test:browser`                                                                                          | 首轮退出1：上传宽屏旧断言失败，获批修正后已复验通过                            |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`                                                                                                                           | 120任务/298需求无环；5个拒绝夹具通过                                           |
| `git diff --check`                                                                                                                                                                             | 通过                                                                           |

构建保留既有SQLite Debug及非本机resvg可选二进制追踪诊断。本轮无schema变更，不运行迁移生成。AMD64/ARM64容器与镜像验证按Release流程执行，本PR未创建Release、发布镜像或部署。物理设备未测，不计通过。

### 真实S3及内容协议浏览器

实际分别运行：

```sh
EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 node scripts/verify-delivery-s3.ts --config /Volumes/data/project/ariso/.data/upload-v02.json --service r2 --output docs/verification/delivery-161/live --wait-for-expiry --browser
EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 node scripts/verify-delivery-s3.ts --config /Volumes/data/project/ariso/.data/upload-v02.json --service seaweedfs --output docs/verification/delivery-161/live --wait-for-expiry --browser
```

配置只从本机读取，不提交凭据或签名地址。访问本地服务时保留既有NO_PROXY/no_proxy并补localhost、127.0.0.1、::1、.localhost。

| 服务      | 实际报告                                             | 浏览器证据                                                                                                                                                                                                    | 结果                                             |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| R2        | [report.json](live/run-PcQdHs/r2/report.json)        | [browser.json](live/run-PcQdHs/r2/delivery-s3/browser.json)、[外站截图](live/run-PcQdHs/r2/delivery-s3/external-embed.png)、[真实SVG下载](live/run-PcQdHs/r2/delivery-s3/旅行.final.svg)                      | 退出0，8/8项通过；36对象精确删除并HEAD确认不存在 |
| SeaweedFS | [report.json](live/run-pLznvu/seaweedfs/report.json) | [browser.json](live/run-pLznvu/seaweedfs/delivery-s3/browser.json)、[外站截图](live/run-pLznvu/seaweedfs/delivery-s3/external-embed.png)、[真实SVG下载](live/run-pLznvu/seaweedfs/delivery-s3/旅行.final.svg) | 退出0，8/8项通过；36对象精确删除并HEAD确认不存在 |

两服务逐项检查GET/HEAD方法与300秒签名、最终缓存/类型/附件名称/字节摘要、四版匿名与所有者、26格式原文件、真实聚合刷库和已发布引用原子切换。权限/回收/存储撤销后新Ariso访问拒绝，旧签名在有效期内仍200；真实等待300秒后GET/HEAD均403。两服务相同内容协议浏览器场景实际检查SVG文件下载、所有者Cookie和外站匿名公共图片加载/私有图片拒绝。外站截图为现有TaskSpace浅色视口（截图像素尺寸1908×806），页面内公共64px图片可见、私有图片不可加载；没有产品布局或设计对照结论。

### 失败、修复与重试

- 实现前，新增权限竞态19项均失败，原因是原入口无条件拒绝S3。实施后19项全过。开发中类型检查指出新测试事务类型与headers union不正确，修正后构建和类型通过。
- 真实首轮R2因补充HEAD验收主动中断；SeaweedFS因种子deferred事务升级出现SQLITE_BUSY。已按项目既有immediate事务模式修复，并重新执行完整两服务。首轮失败与全部预登记Key清理见[R2](attempts/live-first/r2/report.json)、[SeaweedFS](attempts/live-first/seaweedfs/report.json)。
- 无配置反例实际运行 `node scripts/verify-delivery-s3.ts --output test-results/delivery-s3-missing-config`，退出1；[R2](attempts/missing-config/r2/report.json)、[SeaweedFS](attempts/missing-config/seaweedfs/report.json)均incomplete，未发远端请求。
- 全量集成首轮auth超时5000ms、setup请求连接拒绝（ECONNREFUSED）；在同机另有任务并行的环境运行，不能仅据此断言根因。完整两失败文件随后46项全部通过。首轮与复验摘要见[集成记录](checks/integration.json)。未修改身份实现、超时或断言。
- 整套浏览器首轮已通过runtime、错误恢复、桌面初始化/重启和M2持久化。之后1920×1080上传组合宽度断言要求填满正文，与[用户已批准1280px最大宽度](../../design/handoff.md#上传输入区桌面样式返修2026-10-01用户批准)冲突。用户2026-10-02明确批准仅修正此旧断言；实际改为 `Math.min(available, 1280)`，仍要求误差不超过1px，360px设置区、24px间距、溢出及手机检查全部保留。没有改产品UI。[首次运行器](attempts/browser-first/runner.json)、[首次失败](attempts/browser-first/interaction-polish-1440.json)。
- 修正后重跑完整命令，桌面宽屏、连续性、两端身份及图库/分页/反馈/选择均通过；在既有筛选场景失败。[完整运行器](attempts/browser-approved/runner.json)、[宽屏通过](attempts/browser-approved/interaction-polish-1440.json)、[1920×1080实际截图](attempts/browser-approved/interaction-1920-queue-three.png)。实测组合1280px、队列896px。
- 筛选失败是 `e2e/library-query-filters.mjs` 只读取第一个 `role=alert`，误读独立的会话HTTP429提示。实际受控筛选错误已经显示在第二条提示中，导致原等待超时。[失败及实际页面状态](attempts/browser-approved/library-filters.json)、[截图](attempts/browser-approved/library-query-failure.png)。文件及对应产品代码与origin/main相同。独立审计确认只遍历全部提示并要求受控错误存在仍验证相同预期；当时尚未获该范围外修改授权，未实施；后续明确授权后的修复与实际通过记录见下文。429是真实状态，没有修改限流、隐藏提示或声称已经解决。
- 为避免重复已通过场景，使用同一现有运行器派生临时驱动，仅建立新390账户前置并执行尚未运行的检查。实际断言、失败退出、超时和清理均保留。驱动选择差异归档为[rest.diff](checks/browser-rest.diff)和[tail.diff](checks/browser-tail.diff)，临时文件执行后移除。临时rest移除原运行器的未执行library成功标记；继承结果仅引用前一轮，不冒充本轮重新执行。
- rest补跑中2400张规模、公共导航、相册、封面、上传主流程及轮询通过；上传输入场景在原生目录枚举返回cancel/零文件时明确失败。[运行器](checks/browser-rest/runner.json)、[目录取消](checks/browser-rest/upload-input.json)。这是[#159已记录的相同原生选择器限制](../upload-159/README.md)，不修改断言、不用模拟数据替代实际目录枚举，也不将其归为本次已经修复的能力。
- tail仅补齐随后仍未执行场景，手机M2持久化、交互、工作区连续性、新增S3和隔离UI均通过。[运行器](checks/browser-tail/runner.json)、[手机交互](checks/browser-tail/interaction-polish-390.json)、[390×844队列截图](checks/browser-tail/interaction-390-queue-three.png)、[新增S3浏览器](checks/browser-tail/delivery-s3/browser.json)、[390×844外站嵌入](checks/browser-tail/delivery-s3/external-embed.png)、[隔离UI](checks/browser-tail/ui/runner.json)。运行器明确标记补跑范围及filters/upload-input仍未通过，不能替代完整套件通过。

### 获批修正后的实际命令

| 命令                                                                                                                                        | 结果                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm exec eslint e2e/interaction-polish.mjs --max-warnings=0`、`pnpm exec prettier e2e/interaction-polish.mjs --check`、`git diff --check` | 退出0                                                                   |
| `EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-161-approved pnpm run test:browser`                              | 退出1；宽屏修正通过，既有filters误选提示失败                            |
| `EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-161-rest node work/verify-browser-rest.mjs`                      | 退出1；规模/导航/相册/封面/上传/轮询通过，原生目录枚举取消              |
| `EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-161-tail node work/verify-browser-tail.mjs`                      | 退出0；仅剩余手机持久化/交互/连续性、S3、隔离UI通过；仍标明两个失败场景 |

生产模块未再改动，沿用本轮已执行的安装、单元、集成、类型和构建证据，没有机械重跑无变化的检查。新增记录执行格式与文档检查。已通过的既有界面大型报告归档结果摘要，并在摘要中链接完整原始记录；失败、宽屏实测及本次S3证据不压缩。此前自动化验证实例、数据库及测试素材已清理；本轮目录人工预览仍保留，见末节。原项目、分支和worktree保留。Ego空间3因整体检查仍有错误保留供继续验证，没有创建新的空间。

## 独立审计

独立agent使用code-review-and-quality审读最终生产变更、测试、真实报告和浏览器截图，结论Approve，未发现遗留Required。审计提出两项必修：真实服务脚本取消未完整传播到启动/PUT；HEAD缺少实际长度、类型、ETag及普通格式MIME/扩展断言。均已在本轮修复，独立复验关闭。审计实际另跑 `pnpm exec vitest run --project integration tests/integration/delivery/s3-races.test.ts`（19/19）与 `pnpm exec vitest run --project integration tests/integration/delivery/s3-fixture-cancel.test.ts`（1/1），均通过。

获批宽屏修正由独立agent复核：仍精确比较1280px/可用宽度，未弱化任何其他断言。临时补跑的选择、前置及报告边界也经独立审读，不将未执行或失败场景标为本次通过。

本次无产品UI变更，设计还原审计与本次UI人工验收不适用。代码审计和核心S3浏览器通过不代表完整套件通过；筛选修正现已通过独立审计及实际复验，当前草稿剩余阻断是原生目录选择证据。

## 用户授权后的筛选修正与目录排查（2026-10-02）

用户明确要求修正这两项问题。`e2e/library-query-filters.mjs` 改为遍历全部真实 `role=alert` 提示并匹配完整受控错误，保留原超时、真实重新读取按钮、服务端选项、请求次数和焦点断言。没有修改限流或产品界面。初次定向Prettier检查报告换行格式问题，规范化后再次检查通过。完整格式检查首次还指出临时预览驱动的格式问题；将该中间脚本移到项目外work后，完整格式检查退出0。

实际 Node24.19.0 / pnpm11.19.0 / macOS arm64、同一 Ego Space3 执行：

```sh
pnpm exec eslint e2e/library-query-filters.mjs --max-warnings=0
pnpm exec prettier e2e/library-query-filters.mjs --check
node --check work/verify-browser-filters.mjs
EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-161-filter-fix node work/verify-browser-filters.mjs
```

均退出0。临时驱动沿用现有运行器，只建立独立390账户、重启前置并完整执行filters，未重复已通过范围。[驱动差异](checks/browser-filter-fix.diff)、[运行器](checks/browser-filter-fix/runner.json)、[13项实际筛选结果](checks/browser-filter-fix/library-filters.json)、[真实错误提示](checks/browser-filter-fix/library-query-filters-options-failure.png)已归档。真实重试、焦点恢复、会话过期及重新登录均通过；本轮登录仍观察到HTTP429并按实际重试窗口处理，不宣称已经修复限流原因。旧整套失败保留，不将定向结果写成完整浏览器通过。独立code-review-and-quality复核修改、驱动与实际报告，Approve，无Required。

目录[只读源码诊断](checks/chooser-diagnosis.md)确认高层setInputFiles、拦截chooser和直接CDP共用DOM.setFileInputFiles，webkitdirectory进入浏览器目录枚举。历史独立原生input同样cancel，应用扫描未启动；没有证据支持改产品handler，也不能确定Ego内部取消的具体原因。保留原生失败断言，不以拖入目录或假FileList替代选择器。

已准备同一Space3的独立生产上传页面、专用测试账号及独立数据目录，真实素材包含两个子目录中的同名PNG、空目录和文本。输入监听器在捕获阶段记录真实change/cancel及相对路径，等待用户完成系统选择后再读取队列与汇总。[当前预览记录](checks/directory-preview/preview.json)、[1440×900浅色待选择截图](checks/directory-preview/awaiting-selection.png)。当前明确为awaiting-native-selection，尚未通过；服务仅为这次人工操作保留，完成后停止并清理独立数据。原项目和用户预览未修改。系统文件夹选择必须由用户操作，遵守ego-browser技能原生提示交接规则。
