# PR #226 双角度审查后修复

2026-10-02；Issue #176 / T-COL-03。两个独立 agent 按 code-review-and-quality 与 thermo-nuclear-code-quality-review 审查 `3eb585f...af6b8d8` 的完整两次提交，发现以下三项。本轮已修复、真实浏览器验证及独立复审通过；用户再次人工 UI 验收仍待完成，PR 保持草稿。统一遵守现有 [handoff](../../../design/handoff.md) 与 [execution](../../../tasks/execution.md)。

## 发现与最终行为

1. **提交后 5xx 被误报为确定失败（Required / P2）。** 仅 `<500` 的已识别 HTTP 错误进入原明确失败分支。5xx 沿既有 unknown → 读取核对流程，提示“未收到可确认的操作结果”，不自动重复写入、不声称关系未改变。创建/编辑读回只说明当前资料，不能据此认定本次请求提交；删除按原 ID 读回404后确认当前不存在。核对读取失败继续保留未知。
2. **列表刷新推翻已取得的目标核对（结构审查 Required / P2；五维审查 Optional / P3）。** 列表 refetch 不再将结果 error 重新抛给弹窗。目标核对保留 checked，列表自己的 query 仍展示真实错误，401仍沿原会话处理；没有隐藏失败或新增状态机。
3. **标签浏览器脚本职责混杂和重复等待（Required / P2）。** 布局测量拆到 `tags-layout.mjs`（158行），弹窗定位/读取/成功等待集中到 `tags-dialog.mjs`（27行）。主脚本1122→855行；其中纯重组至851行，原有代码合计净减86行，新增核对场景接入另加4行。独立 AST 对比确认原71处 assert保留（主脚本59、布局12），其中69处除空白一致，另2处只提取相同 textContent读取。SQL、单次写入、场景顺序与 finally清理保留。新增实际行为验证在 `tag-reconciliation.mjs`（408行），不把新增覆盖计入“净减86行”。

没有新依赖、schema、服务端、公共组件或样式变更。原 `reject` 夹具写入前模拟500，只证明一种未写入故障，不能代表普遍确定失败。本轮改为模拟400明确拒绝，并取得真实提交后HTML502的独立失败与通过证据，没有靠改 fixture 掩盖缺陷。

## 真实故障与浏览器结果

环境：macOS ARM64、Node24.18.1、pnpm11.19.0、已安装 Ego Lite；复用已授权的独立 TaskSpace5 / p1，临时服务 `http://ariso-tags-manual-50953.localhost:50953`。没有下载浏览器。原57635预览不参与故障注入或重置。

| 实际命令                                                      | 结果与证据                                                                                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                              | exit0，[安装](install.txt)，锁文件未变化                                                                                                                  |
| `pnpm run build`                                              | exit0，[构建](build.txt)；既有 resvg可选跨平台依赖追踪诊断仍存在，standalone产物生成                                                                      |
| `pnpm run typecheck`                                          | exit0，[类型](typecheck.txt)                                                                                                                              |
| `pnpm run lint`                                               | exit0，[静态检查](lint.txt)                                                                                                                               |
| `pnpm run format:check`                                       | exit0，[格式](format.txt)，收齐本轮证据后执行                                                                                                             |
| `node docs/tasks/check.mjs`                                   | exit0，[文档](doc-check.txt)，120任务 / 298需求，无缺失ID或循环                                                                                           |
| `node work/run-tag-reconciliation.mjs red`                    | 4案复现旧缺陷；[原始请求、SQL和预期断言失败](tag-reconciliation-red.json)，`reproduced`不是产品检查通过                                                   |
| `node work/refresh-tags-server.mjs work/tags-manual-revision` | 用新构建更新独立测试服务，保持该临时数据库与登录配置                                                                                                      |
| `node work/run-tag-reconciliation.mjs green`                  | 8案通过，[专项报告](tag-reconciliation-green.json)                                                                                                        |
| `node work/run-manual-tags-regression.mjs`                    | 重组后的完整标签专项通过：[14项检查、114个布局、126张截图](tags-regression/tags.json)，包含[流程内新增8案](tags-regression/tag-reconciliation-green.json) |
| `node work/restore-review-preview.mjs`                        | 独立50953预览恢复9项代表夹具，Space5 / p1保留桌面浅色标签页                                                                                               |
| `node work/refresh-tags-server.mjs`                           | 原57635预览只更新程序；同一数据库与密钥配置，刷新前后7标签、454关系、173图片一致，保留用户继续删除的结果                                                  |

浏览器汇总、实际环境、命令与原预览比较见 [browser.json](browser.json)。`work/`驱动含本机测试配置，不提交；新增场景通过现有 `e2e/tags.mjs` 接入仓库浏览器流程，没有另设跳过分支。

旧包4案：创建/改名/删除真实写入完成后交付HTML502，均误报失败且核对GET为0；改名丢响应后目标GET200、列表GET503，已核对结果被覆盖成unknown。red报告保存预期断言失败、请求序列和SQL，未覆盖为通过。

最终8案：前三案真实提交后HTML502并成功核对；接下来同样三操作核对GET503仍显示unknown；第七案目标GET200与列表GET503各自保留结果；第八案模拟400明确拒绝，输入/原标签/关系保留，没有真实写入或核对GET。502/丢响应注入先 await 真实服务端写入，再改变响应交付；400则在真实写入前模拟，报告 `realStatus:null`。逐案检查只写一次、原ID、正常/回收关系与173图片ID不变。

新增8案交替执行1440×1080浅色与390×844深色，不声称每案四组合全覆盖。原完整标签专项继续执行两端浅深色、360/390/430/768及桌面宽度、短视口、键盘焦点与适用加载/空/错误/成功/禁用状态，原断言保留。

## 独立审计与设计复核

[代码审计最新节](../code-review.md#pr-226-双角度审查与修复后独立复审)记录两份原审查发现及修复后独立复读：Critical0 / Required0，代码结论Approve。最终审计者没有实施客户端或测试重组，实际读取源码、安装包QueryObserver行为、原始red/green/完整专项和AST断言对比，没有把先前24项定向测试冒充修复后的新运行。

[设计复核最新节](../design-review.md#pr-226-审查修复后的受影响状态复核2026-10-02)由未实施产品UI的另一agent完成，重新实际读取7个Figma节点context和截图，并查看最终8张真实页面截图。节点418:4118 / 418:8310（未知）、418:4018 / 418:8210（既有结果结构）、420:3764（删除成功）、418:8221（改名失败）、418:3507（列表失败）。按相同视口先看整页和公共区域，再核对弹窗、提示与操作，受影响状态通过，没有新增未解决设计偏差。同键节点不冒称checked专用画板；成功Toast沿现行用户批准交接。该agent参与测试脚本重组，不将本节冒称其自身代码的独立审查。

## 验证边界与保留状态

最后执行的格式与文档结果见 [格式记录](format.txt)、[文档记录](doc-check.txt)，本轮仅整理证据时不重复应用构建。既有首轮771单元 / 980串行集成保持历史结论；本轮无后端变化，没有机械重跑全量单元/集成。首次完整 `pnpm run test:browser` 的范围外上传1920px布局失败仍见[主记录](../README.md)，此次标签专项通过不将整站失败改为通过，也不将后续未运行场景计通过。

用户再次人工验收仍待完成，可刷新 [保留的预览](http://ariso-tags-57635.localhost:57635/tags)。物理设备、AMD64/ARM64镜像与容器没有本轮实测，遵守现有Release边界。上传批次标签归T-UP-03，批量关系归#177；不标跨任务全量完成，不合并、不关闭Issue、不发布、不部署、不删除分支或worktree。
