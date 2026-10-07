# 分享设置人工反馈（2026-10-07）

用户在 Issue #193 人工预览中明确要求：将“返回分享管理”改为右上角图标按钮；“已过期”改为淡红色字体，不加 Halo。本轮按这个明确方向调整既有分享设置，不改变分享接口、保存协议、匿名查看器或公共外壳。原 #193 功能与全量检查的证据继续见[统一记录](../README.md)。

## 实际修改与依据

`src/app/shares/settings.tsx` 将返回入口从固定底栏移到标题同排右侧，复用 HeroUI Button/Tooltip、44px 点击区、8px 圆角及18px Lucide ArrowLeft。保留可访问名称、“从相册进入”的返回目的地，以及既有未保存确认和焦点恢复；简介独占下一行。地址标签和有效期摘要只对“已过期”字符使用现有 `text-danger`，日期、分隔符、圆点和标签背景保持原有样式。没有新增状态、依赖或全局样式。

实际读取了设置路由、`useSettings`、OwnerShell、主题变量及 HeroUI 3.2.6 的类型与组件样式。独立设计预审发现 HeroUI 默认按钮样式会覆盖 SVG 属性尺寸；已为该返回箭头局部指定 `size-[18px]`，没有修改通用按钮。原“预览分享”按钮的占位状态沿用，本轮不将其记为可用功能。

修改前缺陷依据为用户提供的真实人工预览截图：返回入口仍在底栏，过期文字为中性色。随后在保留的旧构建上实际执行新增断言，[失败报告](./browser-red.json)取得 `inHeader=false`、`iconOnly=false`，证明检查能捕获原问题；新版结果与失败历史分开记录于下文。

Figma 主节点仍为桌面 [431:3753](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3753) 和手机 [431:8415](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8415)，过期节点为 [776:23915](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=776-23915) 和 [776:30713](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=776-30713)。当前设置状态族已实际写入并回读，历史“修改前”画板保留。节点索引、尺寸修正与六张最终 Figma 截图见[同步记录](./figma-sync.md)。Figma 截图不替代产品截图。

## 实际环境、命令与结果

macOS arm64，Node 24.18.1、pnpm 11.19.0、Next 16.3.5、HeroUI 3.2.6。源代码仍在隔离 worktree `codex/issue-193-public-viewer`。为保留仍服务人工预览的旧 standalone，生产构建在本轮源码独立副本执行；没有覆盖旧预览的构建目录或数据库，没有发布、部署或镜像验证。

首轮副本为 `/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-feedback-build-dArkjr`。修正图标尺寸后，最终副本为 `/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-feedback-build-Zta2LS`。副本使用实际 tracked 构建输入及当前 e2e，不复制原人工预览数据或凭证。仅尺寸修正后重跑受影响检查，没有机械重跑既有匿名查看器测试。归档构建日志只去掉终端进度行末的回车和空格，告警内容保留；原始输出保留于私有本地 `test-results/sharing-193/feedback-settings/`。

| 实际命令                                                                                    | 结果                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --offline --frozen-lockfile`（两次构建副本）                                  | 均退出0；复用现有依赖，没有锁文件变更。[首轮](./logs/install.log)、[最终](./logs/install-final.log)。                                                                            |
| `pnpm run lint`（worktree）                                                                 | 完整入口退出0。[日志](./logs/lint.log)。                                                                                                                                         |
| `pnpm exec eslint src/app/shares/settings.tsx e2e/sharing-management.mjs --max-warnings=0`  | 尺寸/断言文案修正后定向退出0。[最终日志](./logs/lint-final.log)。                                                                                                                |
| `pnpm run typecheck`（worktree）                                                            | 首轮与尺寸修正后的完整入口均退出0。[首轮](./logs/typecheck.log)、[最终](./logs/typecheck-final.log)。                                                                            |
| `pnpm run build`（对应独立副本）                                                            | 首轮与最终均退出0，优化构建、类型、静态页及 standalone 打包完成；保留既有跨平台可选依赖 NFT 追踪告警，不能记作无告警。[首轮](./logs/build.log)、[最终](./logs/build-final.log)。 |
| `node --check e2e/sharing-management.mjs`、`git diff --check`                               | 本轮实际执行，退出0。                                                                                                                                                            |
| `pnpm exec eslint e2e/library-copy-helpers.mjs e2e/sharing-management.mjs --max-warnings=0` | 剪贴板及断言复审修正后退出0。[最终日志](./logs/clipboard-fix-lint-final.log)。                                                                                                   |
| `node --check e2e/library-copy-helpers.mjs`、`node --check e2e/sharing-management.mjs`      | 最终测试脚本语法检查均退出0。                                                                                                                                                    |

收齐本轮代码与审查记录后，完整 `pnpm run format:check` 退出0（[日志](./logs/format.log)）。随后仅补实际结果文案，并定向核对修改文档格式。`node docs/tasks/check.mjs` 退出0：120任务、298需求，无缺失编号或循环（[日志](./logs/docs.log)）。

收齐人工验收、最终报告及复审后，完整 `pnpm run format:check` 再次退出0（[最终验收日志](./logs/format-accepted.log)）；`node docs/tasks/check.mjs` 仍为120任务、298需求、退出0（[最终日志](./logs/docs-accepted.log)），`git diff --check` 通过。此后只补这条实际结果并核对修改文档格式。

本轮没有接口、模型、数据库或服务器行为变化；既有单元、集成和全量浏览器结果保持原记录，不记为针对新控件重新执行。随后仅修改浏览器测试定位及剪贴板助手，执行受影响的语法、静态和真实行为检查，没有重复构建相同产品输入。

## 浏览器与默认入口

`e2e/sharing-management.mjs` 新增实际页面检查：390/1440、浅深色主题下的正常/过期/停用过期状态；标题右上44px返回按钮和实际18px SVG；过期字符颜色及无 Halo、圆点与非过期标签保持中性；键盘返回、相册来源目的地、未保存布局确认、取消后草稿及来源焦点。原360/390/430/768/1440布局、密码、短视口弹窗与复制后返回检查继续复用，旧文字按钮定位已改为可访问名称。

已核对调用链：`pnpm run test:browser` → `scripts/verify-browser.mjs` 默认 `full` → `browser-plan` 的 `sharing-management` → 未限定 phase 的代表状态 → `settingsPresentation`。定向 `--suite sharing-management --only representative` 执行同一新检查。没有改共享参数或默认分发，也没有跳过或削弱断言。

最初读取既有 Ego TaskSpace 2，实际返回 `Error: task space not found: 2`。按已读取的 [ego-browser SKILL.md](/Users/dnslin/.agents/skills/ego-browser/SKILL.md:73)“Never use a new TaskSpace to recover…” 停止并请求明确允许新建。用户随后回复“可以的，就这样，这个UI我审查通过了”，允许此前问题中的浏览器继续，并明确通过本轮 UI。随后只使用获准的新 TaskSpace 4，所有检查复用 p1、独立测试数据库与端口，没有操作人工预览数据或使用其他浏览器。

实际命令为 `EGO_TASK_SPACE=4 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=… node scripts/verify-browser.mjs --suite sharing-management --only representative`。旧构建在 worktree 执行，新构建在最终生产副本执行。失败与修正记录如下，未按输出目录名称推断通过：

| 报告                                                            | 实际结果与处理                                                                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [旧构建失败](./browser-red.json)                                | 返回入口仍在底栏，新增位置断言失败；取得修改前证据。                                                                                         |
| [首次新版失败](./browser-before-layout-scope.json)              | 12组控件/颜色测量完成后，草稿断言误取全页有效期“不过期”；应限定图片布局组。                                                                  |
| [首次定位修正失败](./browser-before-aria-scope.json)            | 误用 `aria-label` 定位，实际 DOM 使用 `aria-labelledby="layout-label"`；读取真实 DOM 后修正，严格的“瀑布流”断言保留。                        |
| [剪贴板收尾失败](./browser-before-clipboard-fix.json)           | UI流程到达 complete、3项检查及无页面错误，但 `restoreClipboard` 将大段数据放入进程参数，引发 `spawn E2BIG`；整体 failed。                    |
| [首次剪贴板修复通过](./browser-before-private-assertion.json)   | 标准输入传输后，整体通过、剪贴板/主题恢复。独立评审指出精确断言在失败时可能打印私有快照，随后改成完整数据比较后的布尔断言。                  |
| [最终实际报告](./browser.json)、[运行器](./browser-runner.json) | 最终命令退出0；4项检查、38组既有布局及12组新增状态通过，`errors=[]`，剪贴板/主题恢复，临时夹具删除。35张最终截图位于[截图目录](./browser/)。 |

共用 `restoreClipboard` 仍使用 Node `execFile` 启动原有 osascript，仅把完整脚本从标准输入传入并关闭输入，再等待同一子进程结束。实际读取本机 osascript 手册及安装的 Node 类型，不新增依赖、回退或超时。默认代表流程新增560,000字节原生剪贴板写入/读回完整一致断言，并在页面检查前恢复保存内容；合成数据和原快照均以 `isDeepStrictEqual` 完整比较，失败报告只输出布尔值。另一次 Node24 原生诊断实际完成640,000字节往返并恢复当前内容。最终运行器退出后，Node24只读比对确认当前剪贴板仍与修复前私有备份一致；中途提前在复制检查运行中执行的一次只读比对失败，未操作剪贴板，未记作最终结果。

收尾失败时的大段原剪贴板快照只在已退出的测试进程内，未留下可找回的备份，已如实告知用户，无法恢复。后续成功只证明修复后的当前剪贴板恢复，不声称找回此前内容。私有备份不提交、不写入报告。测试完成后 TaskSpace 4 实际执行一次 `finish({keep: []})` 并等待完成；只关闭本次测试空间，人工预览服务继续保留。

## 独立审查与完成状态

[代码审计](./code-review.md)及尺寸、测试定位、剪贴板传输与私有日志复审通过，无遗留的必须修正项。[独立设计评审](./design-review.md)实际读取更新后的4个 Figma 节点、6张设计截图和17张新版真实代表截图，先核对整页/公共区域，再核对业务及控件，本轮两个局部调整通过。发现的图标尺寸差异已修正，没有以截图数量替代对照，也没有机械重复实现者的检查。

已有浅色语义红在既有底色上的设计侧近似对比度为3.91:1/4.37:1；评审记录了可读性限制及实际来源，没有擅改公共颜色或记作AA通过。最终实际文本计算色与现有 danger 一致；用户已明确接受本轮现状。既有简介行高导致产品标题区72px/Figma76px，真实URL按实际长度换行，均记录在设计评审，没有扩展本轮修改。

| 阶段                       | 本轮实际状态                                 |
| -------------------------- | -------------------------------------------- |
| 代码实现                   | 完成，范围仅上述两项反馈                     |
| 本地适用静态/类型/生产构建 | 通过，具体命令见上表                         |
| Figma 同步                 | 已写入、回读、查看最终截图                   |
| 独立代码审查               | 通过，本轮修正已复审                         |
| 新版浏览器功能验证         | 本轮受影响代表流程通过，未冒充默认全量通过   |
| 新版真实页面独立设计对照   | 本轮两项调整通过，差异与来源见评审           |
| 最终人工验收               | 用户明确通过本轮两项UI；原#193其他未验项保留 |

## 人工验收与保留的预览

最终构建的独立人工预览为 [分享设置](http://sharing-63991.localhost:63991/shares/6e51be58-3e4b-45a2-8e7b-e9511dbcc1b4)，登录页为 [登录](http://sharing-63991.localhost:63991/login)。账号及密码只在私有本地记录与用户对话中提供，不写代码、PR或本记录。新旧预览的健康请求已实际返回200，未声称浏览器验收完成。原 `sharing-49477.localhost:49477` 继续可用，首轮新构建预览 `sharing-63045.localhost:63045` 也保留；最终页面以63991为准，直到用户明确要求停止或清理。

2026-10-07 用户明确回复“可以的，就这样，这个UI我审查通过了”，本轮右上返回图标及淡红过期文字人工验收通过。对应桌面/手机、浅深色、正常/过期/停用状态、未保存布局取消及来源焦点、分享管理/相册返回、密码展开、短视口与实际复制后返回已由本轮真实浏览器独立验证。Tooltip展开没有专门断言，保持未验证。既有匿名大图的其他人工范围和两个独立浏览器上下文仍按统一记录保留，不能由本轮 UI 通过代替。

本轮产品代码与首轮证据提交 `76d7a37a` 已推送，本记录补齐后续真实浏览器、独立复审与人工验收。PR沿用[草稿 #256](https://github.com/dnslin/ariso-next/pull/256)、分支 `codex/issue-193-public-viewer`；当前补充提交前实际回读为 `f6be5919`、OPEN、draft、MERGEABLE/CLEAN，检查列表为空。此前产品代码推送后的[原始状态快照](./pr-source-state.json)保留。`gh pr checks 256` 实际退出1并返回 `no checks reported`，不能记为CI通过，也不等待未触发的工作流。

本轮刷新远端，`origin/main@031b1e77` 包含 #146 身份恢复并发合入，本次设置、状态逻辑、浏览器管理场景及公共外壳没有该区间的修改交集；未整合或覆盖并发工作。原 #193 完整集成/默认浏览器失败与两个独立浏览器上下文未验证仍按统一记录保留。没有合并、关闭Issue、发布、部署或清理授权范围以外的资源。

后续同日用户明确取消两个独立浏览器会话要求，原3项集成超时也已原样复验通过。当前失败调查和浏览器接管停止边界以[统一更新](../README.md#失败原因追查与要求调整2026-10-07)为准；上文保留本轮设置验收时的历史记录，不再把已取消项作为交付门槛。
