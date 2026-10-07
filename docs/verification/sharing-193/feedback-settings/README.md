# 分享设置人工反馈（2026-10-07）

用户在 Issue #193 人工预览中明确要求：将“返回分享管理”改为右上角图标按钮；“已过期”改为淡红色字体，不加 Halo。本轮按这个明确方向调整既有分享设置，不改变分享接口、保存协议、匿名查看器或公共外壳。原 #193 功能与全量检查的证据继续见[统一记录](../README.md)。

## 实际修改与依据

`src/app/shares/settings.tsx` 将返回入口从固定底栏移到标题同排右侧，复用 HeroUI Button/Tooltip、44px 点击区、8px 圆角及18px Lucide ArrowLeft。保留可访问名称、“从相册进入”的返回目的地，以及既有未保存确认和焦点恢复；简介独占下一行。地址标签和有效期摘要只对“已过期”字符使用现有 `text-danger`，日期、分隔符、圆点和标签背景保持原有样式。没有新增状态、依赖或全局样式。

实际读取了设置路由、`useSettings`、OwnerShell、主题变量及 HeroUI 3.2.6 的类型与组件样式。独立设计预审发现 HeroUI 默认按钮样式会覆盖 SVG 属性尺寸；已为该返回箭头局部指定 `size-[18px]`，没有修改通用按钮。原“预览分享”按钮的占位状态沿用，本轮不将其记为可用功能。

修改前缺陷依据为用户提供的真实人工预览截图：返回入口仍在底栏，过期文字为中性色。本轮新增自动断言的失败/通过证据尚未取得，不能将这张旧截图当作新版验证。

Figma 主节点仍为桌面 [431:3753](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3753) 和手机 [431:8415](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8415)，过期节点为 [776:23915](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=776-23915) 和 [776:30713](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=776-30713)。当前设置状态族已实际写入并回读，历史“修改前”画板保留。节点索引、尺寸修正与六张最终 Figma 截图见[同步记录](./figma-sync.md)。Figma 截图不替代产品截图。

## 实际环境、命令与结果

macOS arm64，Node 24.18.1、pnpm 11.19.0、Next 16.3.5、HeroUI 3.2.6。源代码仍在隔离 worktree `codex/issue-193-public-viewer`。为保留仍服务人工预览的旧 standalone，生产构建在本轮源码独立副本执行；没有覆盖旧预览的构建目录或数据库，没有发布、部署或镜像验证。

首轮副本为 `/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-feedback-build-dArkjr`。修正图标尺寸后，最终副本为 `/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-feedback-build-Zta2LS`。副本使用实际 tracked 构建输入及当前 e2e，不复制原人工预览数据或凭证。仅尺寸修正后重跑受影响检查，没有机械重跑既有匿名查看器测试。归档构建日志只去掉终端进度行末的回车和空格，告警内容保留；原始输出保留于私有本地 `test-results/sharing-193/feedback-settings/`。

| 实际命令                                                                                   | 结果                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --offline --frozen-lockfile`（两次构建副本）                                 | 均退出0；复用现有依赖，没有锁文件变更。[首轮](./logs/install.log)、[最终](./logs/install-final.log)。                                                                            |
| `pnpm run lint`（worktree）                                                                | 完整入口退出0。[日志](./logs/lint.log)。                                                                                                                                         |
| `pnpm exec eslint src/app/shares/settings.tsx e2e/sharing-management.mjs --max-warnings=0` | 尺寸/断言文案修正后定向退出0。[最终日志](./logs/lint-final.log)。                                                                                                                |
| `pnpm run typecheck`（worktree）                                                           | 首轮与尺寸修正后的完整入口均退出0。[首轮](./logs/typecheck.log)、[最终](./logs/typecheck-final.log)。                                                                            |
| `pnpm run build`（对应独立副本）                                                           | 首轮与最终均退出0，优化构建、类型、静态页及 standalone 打包完成；保留既有跨平台可选依赖 NFT 追踪告警，不能记作无告警。[首轮](./logs/build.log)、[最终](./logs/build-final.log)。 |
| `node --check e2e/sharing-management.mjs`、`git diff --check`                              | 本轮实际执行，退出0。                                                                                                                                                            |

收齐本轮代码与审查记录后，完整 `pnpm run format:check` 退出0（[日志](./logs/format.log)）。随后仅补实际结果文案，并定向核对修改文档格式。`node docs/tasks/check.mjs` 退出0：120任务、298需求，无缺失编号或循环（[日志](./logs/docs.log)）。

本轮没有接口、模型、数据库或服务器行为变化；既有单元、集成和全量浏览器结果保持原记录，不记为针对新控件重新执行。

## 浏览器与默认入口

`e2e/sharing-management.mjs` 新增实际页面检查：390/1440、浅深色主题下的正常/过期/停用过期状态；标题右上44px返回按钮和实际18px SVG；过期字符颜色及无 Halo、圆点与非过期标签保持中性；键盘返回、相册来源目的地、未保存布局确认、取消后草稿及来源焦点。原360/390/430/768/1440布局、密码、短视口弹窗与复制后返回检查继续复用，旧文字按钮定位已改为可访问名称。

已核对调用链：`pnpm run test:browser` → `scripts/verify-browser.mjs` 默认 `full` → `browser-plan` 的 `sharing-management` → 未限定 phase 的代表状态 → `settingsPresentation`。定向 `--suite sharing-management --only representative` 执行同一新检查。没有改共享参数或默认分发，也没有跳过或削弱断言。

本轮尝试读取既有 Ego TaskSpace 2，实际返回 `Error: task space not found: 2`。按已读取的 [ego-browser SKILL.md](/Users/dnslin/.agents/skills/ego-browser/SKILL.md:73)“Never use a new TaskSpace to recover…” 停止浏览器操作，已请求用户明确允许新建空间。未自行创建替代空间，也未使用其他浏览器绕过。上述新增检查全部保持未执行；新版真实截图、功能与设计对照均未取得。

## 独立审查与完成状态

[代码审计](./code-review.md)及尺寸修正复审静态通过，无必须修正项。[设计预审](./design-review.md)实际读取更新后的 Figma 节点、截图和代码，发现的图标尺寸差异已修正。真实页面设计对照尚未完成，不能记为完整设计评审通过。

已有浅色语义红在既有底色上的设计侧近似对比度为3.91:1/4.37:1；设计预审已记录其可读性限制及来源，没有擅改公共颜色。静态计算不等同于新版实际计算颜色验证；用户对淡红色的最终接受仍待实际页面验收。

| 阶段                       | 本轮实际状态                    |
| -------------------------- | ------------------------------- |
| 代码实现                   | 完成，范围仅上述两项反馈        |
| 本地适用静态/类型/生产构建 | 通过，具体命令见上表            |
| Figma 同步                 | 已写入、回读、查看最终截图      |
| 独立代码审查               | 静态通过，尺寸修正已复审        |
| 新版浏览器功能验证         | 未完成，待明确允许新建 Ego 空间 |
| 新版真实页面独立设计对照   | 未完成，不以 Figma/代码代替     |
| 最终人工验收               | 未完成，PR继续保持草稿          |

## 人工预览与待验收操作

最终构建的独立人工预览为 [分享设置](http://sharing-63991.localhost:63991/shares/6e51be58-3e4b-45a2-8e7b-e9511dbcc1b4)，登录页为 [登录](http://sharing-63991.localhost:63991/login)。账号及密码只在私有本地记录与用户对话中提供，不写代码、PR或本记录。新旧预览的健康请求已实际返回200，未声称浏览器验收完成。原 `sharing-49477.localhost:49477` 继续可用，首轮新构建预览 `sharing-63045.localhost:63045` 也保留；最终页面以63991为准，直到用户明确要求停止或清理。

需要实际验收：桌面/手机的右上返回箭头、浅深色“已过期”标签与日期后缀、没有 Halo；选择未保存的展示格式后返回并取消确认，检查草稿和焦点；分别从分享管理与相册进入，检查返回目的地。正常及停用状态应保留原文字颜色。本轮主/过期设计节点见上文，响应式中间宽度、短视口、实际键盘/焦点及真实页面设计对照仍待验证。

本轮代码与证据提交 `76d7a37a` 已推送。PR沿用[草稿 #256](https://github.com/dnslin/ariso-next/pull/256)、分支 `codex/issue-193-public-viewer`；推送后实际回读为 OPEN、draft、MERGEABLE/CLEAN，检查列表为空（[原始状态快照](./pr-source-state.json)）。`gh pr checks 256` 实际退出1并返回 `no checks reported`，不能记为CI通过，也不等待未触发的工作流。

本轮刷新远端，`origin/main@031b1e77` 包含 #146 身份恢复并发合入，本次设置、状态逻辑、浏览器管理场景及公共外壳没有该区间的修改交集；未整合或覆盖并发工作。原 #193 完整集成/默认浏览器失败与两个独立浏览器上下文未验证仍按统一记录保留。没有合并、关闭Issue、发布、部署或清理授权范围以外的资源。
