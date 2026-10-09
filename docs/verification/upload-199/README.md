# T-UP-06 / Issue #199 实施记录

日期：2026-10-09（Asia/Shanghai）。关联 [Issue #199](https://github.com/dnslin/ariso-next/issues/199)，依据 [任务卡](../../tasks/m3-m4-platform.md#t-up-06-openapicurl-示例与上传用法页)、[SPEC-upload §10](../../specs/SPEC-upload.md#10-通用上传-api)、[设计交接](../../design/handoff.md)及[执行约定](../../tasks/execution.md)。保留 R-8.4-08、R-23.4-01、A-26.3-08 与 upload/identity 模块职责，没有改写冻结 PRD。

本次先完成不依赖新增 UI 审批的公开规范、共享 curl 生成器及真实行为验证。上传用法 UI 原型已提供，新增交互等待所有者批准；尚未接入产品页面，也未同步 Figma。Issue 整体未完成，PR 必须保持草稿。

## 范围、前置与工作区

实际通过 gh 读取 Issue 正文、评论和原生 blocked_by/blocking。#199 OPEN，无评论；直接前置 #167/T-UP-05、#57/T-UI-01、#130/DG-API 均 CLOSED，没有 blocking 消费项。前置关闭不能代替本次验收；读取实际公共上传接收/等待、身份、站点与上传设置 HTTP、数据库 schema、测试夹具和质量命令后实施。

原工作区 `/Volumes/data/project/ariso` 为干净 main，已有其他任务 worktree。更新远端，从 `origin/main` 的 `2ba0a60e71b5fff773229b62f2c6380fe3435f9b` 创建管理型隔离 worktree `/Users/dnslin/.codex/worktrees/issue-199-upload-usage/ariso`，分支 `codex/issue-199-upload-usage`；原目录及其他任务保持原状。

## 实际实现

- `src/server/upload/openapi.ts` 使用已安装 Zod 4.6.2 的 `toJSONSchema(target: openapi-3.0)`，复用 runtime 的输入、结果与错误 schema。官方 override 只处理 OAS3.0 不支持的 contentEncoding 和 nullable enum；没有新依赖或通用转换器。OpenAPI3.0.4 只列 `POST /api/upload`；重复同名 multipart 数组、Bearer 权限、13个实际 HTTP 状态、可空 imageId/actualVersion、真实版本、private 链接权限与重发风险均有说明。
- `GET /api/openapi.json` 不需要凭据，每次读取当前 site.publicUrl，不发布管理/存储配置或秘密，使用 no-store。未初始化明确返回409/SITE_NOT_INITIALIZED。静态生成文件采用相对 server `/` 并明确未绑定站点，不将50MiB初始默认冒充当前站点上限。
- `scripts/generate-upload-openapi.ts` 用现有 Prettier 可重复生成和核对 `tests/unit/upload/openapi.generated.json`。`openapi:generate` 与 `openapi:check` 已接项目命令；默认 `test:unit` 的生成测试执行 `--check`，不依赖人工记得另跑。
- `src/shared/upload-usage.ts` 生成最小、完整、未授权、非法参数命令，地址来自调用方传入的当前站点，Token 是 `${ARISO_UPLOAD_TOKEN}` 占位值。完整示例使用重复 albumId/tag，并对本机路径及ID做 shell 单引号处理。未加入公开轮询、幂等键或 PicGo 配置。

验证调用链：`test:unit` → vitest unit 项目 → 默认 `tests/unit/**/*.test.ts` → OpenAPI及curl测试；`test:integration` → integration + media-tools → `openapi-http.test.ts` 与 `usage.test.ts`。真实工具测试只在 media-tools 包含，integration 明确排除同文件。没有修改共用浏览器运行器；新增产品 UI 的默认 full 场景接入仍待实施。

## 真实 curl 与存储证据

Local 默认集成和 R2/SeaweedFS 手动入口共用 `usage-examples.ts`，执行共享生成器的实际命令；仅将认证占位行换为 curl `--config -`，真实 Token 经 stdin，避免进入命令参数和共享日志。使用独立进程、数据库、账号和当前任务自有命名空间，不修改用户预览数据或 Bucket/CORS 策略。

每个服务验证：缺认证401与非法可见性400不建资产/任务/标签或暂存文件；最小示例采用当前默认存储与public/private可见性；完整示例在默认存储已清空时使用显式storageId，重复相册ID去重，重复tag匹配/创建。成功逐项核对201、同一真实job、三个已保存版本、对象大小和原图字节，private链接拒绝上传Bearer。R2、SeaweedFS各7/7检查通过，各9个对象删除后再次确认自有命名空间为空。

报告：[R2](./live/r2.json)、[SeaweedFS](./live/seaweedfs.json)。归档前扫描本机配置中的access key、secret、password/token，证据没有凭据。AWS按当前执行约定不要求、未实测，不计为通过。

## UI 原型与设计边界

可查看原型：[http://127.0.0.1:3199](http://127.0.0.1:3199)。源文件：[index.html](./prototype/index.html)。无需账号，只有示例数据和演示状态，不执行上传；复制按钮反馈是原型模拟，不当成真实剪贴板通过证据。

实际读取 Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的设计信息和截图：主页面 [桌面248:2137](./figma/248-2137.png)/[手机248:4061](./figma/248-4061.png)，参数展开 [259:1405](./figma/259-1405.png)/[259:3304](./figma/259-3304.png)，结果展开 [259:1518](./figma/259-1518.png)/[259:3340](./figma/259-3340.png)，复制失败语义 [249:1465](./figma/249-1465.png)/[249:3588](./figma/249-3588.png)。Figma中的Token一次明文关闭语义没有搬到用法页。

| 对照项                 | 原型证据与结论                                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页与公共区域         | [桌面1440×1080浅色](./prototype/desktop.png)、[手机390×844浅色](./prototype/mobile.png)。保持桌面232px侧栏、正文左264px、840px业务宽度，手机16px边距与原有层级。字体、导航图标及菜单为原型占位，产品必须复用现行OwnerShell，不复制HTML公共区域。顶部原型标记、底部演示按钮只用于审阅。 |
| 示例与复制             | 拟新增最小/完整直接切换、复制命令；选中状态补aria-pressed。保留命令内容容器；普通替换/限制说明是简洁文字。成功仅中性反馈；[手机复制失败](./prototype/mobile-copy-failure.png)展示完整可选文本，没有结果页。                                                                            |
| 参数、结果与风险       | 保留两个独立折叠区，超时/断线先核对及重发重复风险在区外常驻；当前上限与规范默认值分开。未将固定示例结果当成真实上传结果。                                                                                                                                                              |
| 读取失败、长地址、主题 | 原型提供演示开关，尚未取得全部对应截图与设计对照；360/430/768、短视口、键盘与焦点、44px、真实复制失败、返回Token上下文、生产组合均未验证。                                                                                                                                             |

审批来源是用户本次“新增或改变既定交互先原型获批”指令，以及任务卡 DG-API 对 T-UP-06 的具体表达缺口。最小/完整切换、复制触发器、用法专属复制失败、完整响应与配置读取失败组合尚待批准；不把原型审查当成批准。没有Figma写入、产品UI或人工验收完成声明。

### 表格原型调整（所有者反馈，2026-10-09）

按所有者“参数和响应那里用表格组件”反馈，将参数改为名称/必填/省略时/说明表，响应改为字段/类型与出现条件/含义表，另列13种HTTP状态。字段内容对照当前public-contract和HTTP错误映射；400限定重复单值字段，504将继续处理限定为等待任务结果超时。当前HeroUI3.2.6已提供Table、Table.ScrollContainer、Table.Content等，实际读取已安装类型及存储列表消费实现；后续产品复用该组件，无新依赖。当前HTML仅表达待批准布局，没有冒充HeroUI产品实现。

本次实际使用同一Ego TaskSpace8复核360/390/430/768/1440：页面宽度均等于视口，表格在自身容器内滚动。手机固定第一列，说明列按剩余空间换行；桌面业务宽度保持840px。滚动容器可聚焦，实际ArrowRight改变scrollLeft；End没有横向移动，不当成通过。表头与行标题分别使用scope=col/row。未复跑输入未变的后端检查；定向Prettier与git diff检查通过。

证据：[桌面展开](./prototype/tables-desktop.png)、[桌面完整展开](./prototype/tables-desktop-full.png)、[手机参数](./prototype/tables-mobile.png)、[手机横向阅读](./prototype/tables-mobile-scrolled.png)、[手机响应](./prototype/response-table-mobile.png)、[手机HTTP状态](./prototype/http-table-mobile.png)、[手机响应深色](./prototype/response-table-mobile-dark.png)。首张横向滚动截图出现纯白，已等待渲染后替换有效截图；不保留为通过证据。独立设计复审通过本次表格原型，用户整体原型批准、生产UI和Figma同步仍未完成。

### 图标与Tips调整（所有者明确指令，2026-10-09）

复制命令改为44×44图标按钮，保留aria-label/title“复制命令”；删除“用Token从脚本上传图片。”副标题。原常驻的超时、断线核对与重复上传说明改为标题旁Info图标Tips，内容保持完整。此最新指令覆盖任务卡/DG-API原常驻表达，已更新该消费任务；没有笼统删除公共规范。原型两图标节点来自已安装lucide-react1.47.0的Copy/Info（ISC），不自行绘制。实际读取HeroUI3.2.6 Tooltip/Popover类型，后续生产组件按设备交互复用。

同一Ego TaskSpace8实际验证：桌面hover打开、移开关闭，键盘聚焦打开、Escape关闭且焦点留在触发器；手机点击打开、再次点击关闭、外部点击关闭。360/390/430/768提示左右边界均在视口内，页面无横向溢出；1440桌面正文840px。图标复制模拟反馈保持滚动0与最小示例选择，不代替真实剪贴板检查。独立评审提出悬停从图标移向正文的空隙问题，实际复现gapClosesTooltip=true；加入200ms离开延迟后，移入正文保持可见、离开正文关闭通过。初次尝试点击被Tips覆盖的完整示例按钮遭浏览器拒绝，不记为外部点击通过；改点实际外部标题后验证关闭。手机深色实际截图见下，产品短视口/真实剪贴板等验收仍待实施。

证据：[桌面图标](./prototype/icons-desktop.png)、[手机图标](./prototype/icons-mobile.png)、[桌面Tips](./prototype/tips-desktop.png)、[手机Tips](./prototype/tips-mobile.png)、[手机深色Tips](./prototype/tips-mobile-dark.png)。本次仅改原型及相关任务记录，未修改产品UI/后端契约；定向格式、任务定义及diff检查结果随本次记录收齐，输入未变的后端检查不重复执行。整体原型批准与Figma同步仍待取得。

## 环境与实际检查

macOS26.6.2 / Darwin arm64；Node24.18.1、pnpm11.19.0。所有项目检查PATH前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`，使用现有ImageMagick7/ExifTool/OpenSSL与系统Python。应用技能为using-agent-skills、incremental-implementation、git-workflow-and-versioning、frontend-ui-engineering、vercel-react-best-practices、figma-use、figma-design-to-code及ego-browser；独立质量审查使用code-review-and-quality，curl测试实施者使用test-driven-development。没有新增重复执行/设计规则。

| 实际命令                                                                                                 | 结果                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                         | 通过，623包复用缓存，锁文件未变。                                                                                                                                |
| `pnpm exec vitest run --project unit tests/unit/upload/usage.test.ts`                                    | 4/4通过。后端先取得模块缺失的失败证据，新增OpenAPI定向6/6通过。                                                                                                  |
| `pnpm run test:unit`                                                                                     | 默认全量143文件、1836/1836通过，包含生成一致性。                                                                                                                 |
| `pnpm run build`                                                                                         | 退出0，Next构建与standalone打包完成；打包追踪输出其他平台可选原生包与可选telemetry依赖无法解析警告，保留原始日志，不当成无警告构建。未设置部署密钥或用户数据库。 |
| `pnpm run lint`                                                                                          | 通过。                                                                                                                                                           |
| `pnpm run typecheck`                                                                                     | 首轮新增测试夹具env缺NODE_ENV导致类型失败；补全env及S3 HEAD可选size类型后复跑通过，未弱化大小断言。                                                              |
| `pnpm run format:check`                                                                                  | 通过；新增证据补齐后执行定向格式检查，结果见下。                                                                                                                 |
| `pnpm run test:integration --maxWorkers=4`                                                               | 默认两组全量186文件、1765/1765通过，退出0，289.69秒。包含公开规范真实HTTP与Local真实curl。                                                                       |
| `node tests/integration/upload/usage-live.ts --config /Volumes/data/project/ariso/.data/upload-v02.json` | 退出0，R2/SeaweedFS各7/7通过，报告见上。                                                                                                                         |
| `ego-browser nodejs`                                                                                     | 唯一TaskSpace8展示原型、操作完整示例/模拟复制失败并截图；这是原型操作，不是生产`test:browser`或真实复制验证。                                                    |
| `pnpm exec prettier docs/verification/upload-199 docs/tasks/m3-m4-platform.md --check`                   | 新增证据与任务卡定向格式检查通过。                                                                                                                               |
| `node docs/tasks/check.mjs`                                                                              | 120任务、298需求，缺失ID与循环均0。                                                                                                                              |
| `node docs/tasks/check.mjs --self-test`                                                                  | 5项拒绝场景通过。                                                                                                                                                |
| `git diff --check`                                                                                       | 通过。                                                                                                                                                           |

`test:browser`产品UI场景、Figma写入、生产设计对照与人工UI验收待批准后实施。Release镜像、容器、发布与部署未执行，按日常任务边界不创建Release。原始本地日志位于worktree的`test-results/issue199-*.log`。

## 独立评审与完成状态

独立[质量审查](./review.md)覆盖实际后端契约、curl共享生成器与真实行为测试代码，结论Approve，Required/Critical均0。审查者在临时副本反转认证条件和nullable enum条件，分别取得2项和1项失败证据；还原副本后通过，没有污染产品文件或重复全仓检查。

独立[原型设计评审](./design-review.md)实际读取上述Figma和原型截图，发现并修正桌面业务宽度与选中语义。此结论只判断原型是否可审阅，不代表生产设计还原或人工批准。

| 完成维度                                        | 当前状态                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 公开规范、共享curl、真实行为测试代码            | 已完成                                                                                                                          |
| 产品用法页与Token入口                           | 待原型批准后实施                                                                                                                |
| 本地检查                                        | 上述应用与文档检查通过                                                                                                          |
| 真实S3 curl                                     | R2/SeaweedFS完成                                                                                                                |
| 后端独立审查                                    | 完成，无必须项                                                                                                                  |
| 浏览器功能、生产设计审查、Figma同步、人工UI验收 | 未完成                                                                                                                          |
| PR                                              | [PR #269](https://github.com/dnslin/ariso-next/pull/269) 已创建OPEN草稿；不合并、不关闭Issue、不发布、不清理分支/worktree或预览 |

实际通过 `gh pr view 269 --json state,isDraft,headRefName,headRefOid,statusCheckRollup` 和 `gh pr checks 269`、`gh run list --branch codex/issue-199-upload-usage` 核对：PR OPEN、isDraft=true、分支正确，statusCheckRollup为空，未报告checks且该分支没有工作流运行。不计为远端CI通过，不等待不存在的工作流。最后再次读取原型URL返回HTTP200，预览保持可用。
