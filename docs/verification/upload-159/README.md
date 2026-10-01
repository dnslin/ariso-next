# Issue #159：上传文件输入

任务：T-UP-07；需求编号与职责沿用 [任务卡](../../tasks/m3-m4-platform.md#t-up-07-目录拖拽粘贴与独立文件身份) 和 [upload §3](../../specs/SPEC-upload.md#3-设置限制与文件输入)。日期：2026-10-01。

## 范围与前置

通过 `gh issue view 159 --repo dnslin/ariso-next --json number,title,body,comments,state,url` 读取 Issue 和评论（无评论），并通过 GitHub 原生 `dependencies/blocked_by`、`dependencies/blocking` 读取关系：#81 / #72 / #141 均 closed；下游 #160 open。本次从最新 `origin/main` 的 `ba66361` 创建 `codex/issue-159-upload-input`，原工作区无未提交改动，未覆盖其他任务。

本次扩展现有 UploadController/Uppy 输入：普通多选、文件及递归目录拖入、`webkitdirectory` 选择、图片剪贴板、分段扫描与停止、分类汇总。同名和重复选择每次独立 UUID；输入只加入队列，不自动上传、不保留目录、不创建相册。原生拖入的数据在事件返回前捕获；目录分批读取，每20项让出事件循环，取消及页面卸载后晚回调不继续入队。

名称规则由浏览器与服务端共用，按最后路径片段归一化；隐藏名保留，无名或浏览器通用 `image.png` 截图生成 `粘贴图片-<时间>-<序号>.png`。候选支持 JPEG、PNG、WebP、AVIF、BMP、TIFF、HEIC/HEIF、GIF、ICO、SVG。无后缀/隐藏名且没有格式信息时保留候选，服务器始终按真实字节判定。SVG、HEIC、TIFF 等不生成本地 Blob 预览，显示占位，SVG 不内联执行。

复用 OwnerShell、UploadProvider、UploadSettingsFields、UploadQueueItem、LibraryDetail，以及 HeroUI Button/Card/Modal。扫描属于原生输入业务能力，HeroUI没有对应文件系统读取器；弹窗仍复用 HeroUI，并使用 Tailwind 按设计组合。没有新增依赖、修改公共外壳或冻结 PRD。完整集合选择/快建、上传限制配置和结果操作仍由 #160 等原任务承接，S3 链路属于 #162。

## 设计依据与对照

已用 `figma-design-to-code` 实际读取设计信息与截图；[完整读取上下文](./figma/context.json) 和下表 Figma PNG 均为本次读取，不是实际网页截图。

| 状态     | 桌面 / 手机节点     | 设计截图                                                   |
| -------- | ------------------- | ---------------------------------------------------------- |
| 主页面   | 30:97 / 101:1014    | [桌面](./figma/30-97.png)、[手机](./figma/101-1014.png)    |
| 扫描中   | 316:4259 / 316:4268 | [桌面](./figma/316-4259.png)、[手机](./figma/316-4268.png) |
| 停止     | 316:4277 / 316:4284 | [桌面](./figma/316-4277.png)、[手机](./figma/316-4284.png) |
| 汇总     | 316:4300 / 316:4291 | [桌面](./figma/316-4300.png)、[手机](./figma/316-4291.png) |
| 满额     | 316:4309 / 316:4318 | [桌面](./figma/316-4309.png)、[手机](./figma/316-4318.png) |
| 能力缺失 | 316:4327 / 316:4336 | [桌面](./figma/316-4327.png)、[手机](./figma/316-4336.png) |

整页采用现行 [handoff](../../design/handoff.md#后台界面精简2026-09-27用户批准) 的公共外壳、正文与固定底栏。桌面1440×1080、手机390×844；状态设计卡分别480px/358px宽，24px内距、16px段间距、20px标题、14px正文、13px水绿说明，48px按钮与8px圆角。原型计数和相册示例不作真实数据。

原说明行中的“选择文件夹”接入真实动作，手机保留同一入口。独立设计初审指出 ghost 入口缺少可识别底色/边框，已改用 outline 短按钮、44px目标；这项在本次修正，不归为后续优化。最终真实页面已由独立评审者逐项对照；六项设计问题在本次修复并复验关闭，已审范围通过。人工 UI 验收仍待用户执行，PR 保持草稿。

## 实际验证

环境：Darwin arm64；Node 24.18.1、pnpm 11.19.0，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`；HeroUI 3.2.6、Uppy 5.2.0。使用本机 ImageMagick 7、ExifTool 与现有 Ego Lite；没有下载浏览器。浏览器使用独立生产实例和临时 SQLite/存储、独立 `.localhost` origin，未修改用户预览数据。系统剪贴板全部原生表示备份后恢复，不在报告保存内容。

| 实际命令                                                                                                                                                | 最终结果                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                        | 通过，锁文件未变                                                                                                                                                      |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                             | 通过，锁文件未变                                                                                                                                                      |
| `pnpm run format:check`                                                                                                                                 | 通过；最终证据修订后复验                                                                                                                                              |
| `pnpm run lint`                                                                                                                                         | 通过，零警告                                                                                                                                                          |
| `pnpm run typecheck`                                                                                                                                    | 通过                                                                                                                                                                  |
| `pnpm --dir tests/experiments/ui run typecheck`                                                                                                         | 通过                                                                                                                                                                  |
| `pnpm --dir tests/experiments/ui run build`                                                                                                             | 通过（完整浏览器命令实际执行）                                                                                                                                        |
| `pnpm run test:unit`                                                                                                                                    | 57文件、748项通过                                                                                                                                                     |
| `pnpm run build`                                                                                                                                        | 最终视觉修复后通过                                                                                                                                                    |
| `pnpm run test:integration --maxWorkers=1`                                                                                                              | 99文件、917项通过；[原始记录](./reports/integration.txt)                                                                                                              |
| `EGO_TASK_SPACE=6 pnpm run test:browser`                                                                                                                | 失败：身份登录限流断言；[运行器](./reports/full-browser-runner.json)、[失败记录](./reports/full-browser-failure.txt)                                                  |
| `EGO_TASK_SPACE=6 node docs/verification/upload-159/run-browser.mjs native-chooser`                                                                     | 失败：浏览器原生目录枚举返回cancel/零文件；[报告](./reports/native-chooser.json)                                                                                      |
| `EGO_TASK_SPACE=6 node docs/verification/upload-159/run-browser.mjs directory-drag-diagnostic`                                                          | **部分验证**：真实目录拖入诊断11场景、58布局通过；[场景报告](./reports/directory-drag-diagnostic.json)、[运行器明确标为partial](./reports/directory-drag-runner.json) |
| `TARGET_SOURCE=/Volumes/data/project/ariso/e2e/upload.mjs TARGET_OUTPUT=test-results/upload-159-regression node /tmp/ariso-159-target-browser.mjs`      | 隔离生产实例既有上传回归15场景、130布局通过；[报告](./reports/upload-regression.json)；不替代完整套件                                                                 |
| `TARGET_SOURCE=/Volumes/data/project/ariso/e2e/upload-polling.mjs TARGET_OUTPUT=test-results/upload-159-polling node /tmp/ariso-159-target-browser.mjs` | 4项轮询竞争、过期读取、取消及未知状态恢复通过；[报告](./reports/upload-polling.json)                                                                                  |
| `node docs/tasks/check.mjs`                                                                                                                             | 120任务、298需求通过                                                                                                                                                  |
| `node docs/tasks/check.mjs --self-test`                                                                                                                 | 5个拒绝场景通过                                                                                                                                                       |
| `git diff --check`                                                                                                                                      | 通过                                                                                                                                                                  |

首次构建因新单元 mock 类型推导失败，已修复显式类型并取得构建通过；最初集成在产物未稳定时启动，启动入口缺失导致33失败/28跳过，不计为通过，最终构建后重跑完整两组。4 worker一轮10失败（超时及日志断言），未调整超时或断言；1 worker完整复跑917项通过。最终视觉样式修复后的构建和真实浏览器又已执行。首次浏览器在现有错误收集器自测收到重复事件失败，未进入业务验收；使用原先创建的 Space6 重跑后在 `e2e/identity-session.mjs:287` 的实际重试窗口断言失败，未进入上传。这段实现与断言不在本次修改范围，没有擅自改动。没有删除断言、跳过检查或改超时掩盖失败。

真实浏览器新增场景接入 `scripts/verify-browser.mjs`：文件夹选择、原生CDP拖入实际目录、图片ClipboardItem与原生粘贴、重复ID、无自动请求、格式占位、混合拒绝、读取失败、停止/Escape/迟到回调、500名额含真实ready结果、清空与普通入口降级。目录权限与延迟读取为明确的浏览器边界故障注入，不冒充操作系统真实权限证据。GC观察原始输入File和实际队列预览File，HEIC/SVG无本地预览，其包装File不声称直接GC实测。

响应式覆盖360/390/430/768/1440、浅深色、减少动态效果、键盘焦点、至少44px点击区与390×400短视口；状态包括空、扫描加载、停止、汇总成功/错误、队列满禁用及能力缺失。真实手机触控、软键盘和非零安全区按现行执行约定不要求，未标记通过。AMD64/ARM64镜像、Linux容器及最终发布未运行，遵守Release验证范围，不创建Release或部署。

## 独立审计与交付

独立代码审计使用 `code-review-and-quality`，初审无Critical或生产代码Required；一项Required指出释放测试只跟踪原始File，现已补充对队列File的WeakRef跟踪。独立审计另运行上传输入/controller/queue单元3文件57项通过。[最终独立代码审计](./code-review.md)已完成：无Critical或未解决的生产Required；释放修复取得诊断实测，另独立运行4文件65项单元、语法和差异检查通过。

独立设计评审实际重新读取全部12个Figma节点，必须检查本轮真实页面截图，功能与设计分别给结论。[最终独立设计评审](./design-review.md)已完成：实际对照整页、公共区域及全部相关状态，六项Required均修复复验关闭，已审范围通过。用户人工验收尚未进行；不合并PR、不主动关闭Issue、不发布、不部署、不删除分支或worktree。

## 真实页面证据与剩余限制

本轮实际网页截图归档于 [browser](./browser/)，58组布局与两张短视口滚动图；归档JSON将相同几何的重复控件按计数汇总，完整逐控件原始结果仍在本地test-results，不改变任何测试断言；Figma截图在 [figma](./figma/)，两者没有混用。[独立设计记录](./design-review.md#最终逐项对照)逐项列出节点、相同视口截图、公共区与业务细节结论。主页面、队列与汇总覆盖360/390/430/768/1440浅深色；其余状态覆盖390/1440浅深色。短视口390×400验证说明自然高度174.5px、滚动高度397px/可视366px，并实际滚到底部检查全宽48px的两枚按钮。

原生目录选择的失败已在独立原生 `input[webkitdirectory]` 重现：直接CDP、Ego高层setInputFiles及拦截选择器均收到cancel/零文件。原应用输入尚未进入扫描，不能因此断言应用目录读取错误，也不能标记选择器通过。正式新增用例保留cancel失败断言，没有伪造FileList或派发change掩盖问题。另一个明确标为诊断的隔离实例以真实目录拖入取得剩余行为与状态证据，目录拖入不能替代目录选择器的缺失证据。

诊断实际执行图片原生粘贴和文本URL不导入、同名独立身份、错误分类、读取错误、停止/Escape与迟到回调、501文件限额含真实ready结果、清空不删持久图片，以及输入/实际队列预览File/Blob URL释放。Escape前等浮层真正获得焦点，修复的是测试按键过早的时序；没有放宽取消断言。权限与延迟读取仍是明确的边界故障注入。

因此本次实现与独立审计已有可评审结果，但**完整浏览器、原生目录选择证据和用户人工UI验收未完成**，不得称全部验收通过或转为正式待评审。#160完整批次与集合、#162 S3按原边界承接；本次缺失的选择器证据仍属于#159，不转嫁为后续优化。

## 提交与PR

分支：`codex/issue-159-upload-input`；实现提交：`d0f0fda`；[PR #221](https://github.com/dnslin/ariso-next/pull/221) 已创建并通过 `Refs #159` 关联 Issue。

实际执行 `gh pr view 221 --repo dnslin/ariso-next --json number,url,isDraft,state,headRefName,baseRefName,statusCheckRollup,mergeStateStatus`，回读为OPEN、draft=true，head为本分支、base=main、statusCheckRollup=[]。当前没有远端检查，不记为CI通过，也不等待不存在的工作流。`gh issue view 159 --repo dnslin/ariso-next --json number,state,url` 回读仍OPEN。

推送首次阻塞于macOS凭据助手，取消等待后仅在当前命令使用已有 `gh auth git-credential` 及用户提供的本机代理成功推送，未修改全局凭据或代理配置。PR保持草稿；不合并、不关闭Issue、不发布、不部署、不删除分支或worktree。独立测试实例与临时数据已清理；截图、报告和原工作区保留。

## 2026-10-01 重新复测与人工验收

按用户要求重新使用现有 Ego Lite，同一 Space11，Node24.18.1 / pnpm11.19.0 / Darwin arm64。复测与人工预览各使用独立生产实例、账号和数据目录，不读写用户原预览数据。

首轮完整复测 `EGO_TASK_SPACE=11 BROWSER_REPORT_DIR=test-results/browser-159-retest pnpm run test:browser`：此前登录实际重试窗口场景在桌面和手机均通过，随后 M2 桌面用例因旧 `input[type=file]` 同时匹配普通与目录入口而失败。已将 `e2e/m2.mjs` 与 `e2e/m2-core.mjs` 的入口精确为 `input[aria-label="选择图片文件"]`；保留全部断言、数据、超时和重启流程。独立代码审计确认这项测试适配通过，两个文件的语法与差异检查通过。完整复跑结果记录在下文，不用历史结果代替。

适配后完整复跑 `EGO_TASK_SPACE=11 BROWSER_REPORT_DIR=test-results/browser-159-retest-fixed pnpm run test:browser`：1440/390身份初始化与重启、桌面M2、交互、队列连续性以及存储CORS通过；随后图库用例达到运行器原有300000ms超时，整体失败，尚未执行后续上传套件。末次图库截图为剪贴板拒绝反馈；终止后实际Ego页面仍显示“中文下载样本.png”的压缩图详情。本记录不据此断言超时根因，不放宽超时，也不修改范围外图库实现。[首轮失败](./reports/retest-selector-runner.json)与[适配后运行器](./reports/retest-full-runner.json)、[超时记录](./reports/retest-full-failure.txt)已归档。

专项复测 `EGO_TASK_SPACE=11 node docs/verification/upload-159/run-browser.mjs native-chooser`：原生目录枚举仍返回 `cancel`、0文件，选择器失败断言保留；[真实结果](./reports/retest-native.json)与[运行器](./reports/retest-native-runner.json)已归档。人工选择器验收仍待进行。

专项诊断 `EGO_TASK_SPACE=11 node docs/verification/upload-159/run-browser.mjs directory-drag-diagnostic`：真实拖入目录的11场景、58组布局以及短视口复测通过。覆盖普通多选、目录/文件拖入、真实图片粘贴、混合拒绝、读取失败、停止/Escape/迟到回调、500名额含真实ready结果、清空及释放。运行器仍明确标为 **partial**，不替代失败的原生目录选择或完整套件。[专项结果](./reports/retest-directory-drag.json)、[诊断运行器](./reports/retest-directory-drag-runner.json)和[本轮真实截图](./browser-retest/)已归档；截图数量不替代设计与人工验收。权限/延迟仍为明确的边界故障注入，剪贴板已恢复，测试实例及临时数据已清理。

既有上传回归 `EGO_TASK_SPACE=11 TARGET_SOURCE=/Volumes/data/project/ariso/e2e/upload.mjs TARGET_OUTPUT=test-results/upload-159-regression-retest node /tmp/ariso-159-retest-target.mjs`：15场景、130组布局通过，[结果摘要](./reports/retest-upload-regression.json)与[运行器](./reports/retest-upload-regression-runner.json)已归档。原始逐控件报告及130组截图保留在本地 `test-results/upload-159-regression-retest`，不改变测试断言。临时实例已清理。此专项通过不替代完整浏览器失败。

轮询专项 `EGO_TASK_SPACE=11 TARGET_SOURCE=/Volumes/data/project/ariso/e2e/upload-polling.mjs TARGET_OUTPUT=test-results/upload-159-polling-retest node /tmp/ariso-159-retest-target.mjs`：4场景通过，[结果](./reports/retest-upload-polling.json)与[运行器](./reports/retest-upload-polling-runner.json)已归档。临时实例及测试数据已清理；人工预览另有独立实例，保留运行供用户验收。

本轮仅适配两份旧测试的普通文件入口。`pnpm run lint`、`pnpm run format:check`、两份脚本 `node --check`、`node docs/tasks/check.mjs` 与 `git diff --check` 已通过；证据最终修订后再次执行格式与文档检查。上传业务和设计没有变动，沿用上文已完成的独立代码与设计审计，并补充上述独立测试适配审计。完整浏览器超时、目录原生选择器及人工UI验收仍未通过，PR继续保持草稿，远端检查仍为空。

### 人工验收清单

先验原生文件夹选择，再验日常操作与设计。人工素材放在本地 `test-results/upload-159-manual/`，不会提交到仓库；`nested` 含两个子目录下的同名图片、空目录和文本，`mixed` 含正常、空、非图片和超过50MiB的文件，`capacity-501` 含501张小图片。容量场景开始前刷新页面清空当前队列。

| 人工操作                                                                   | 预期结果                                                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 点击“选择文件夹”，在系统选择器选择 `nested`                                | 两张同名图片分别入队；空目录不产生项目，文本归为不支持；没有目录层级或自动上传。此项用于补齐原生选择器证据。  |
| 从系统拖入文件/目录；再次选择同一文件；复制真实截图后按⌘V                  | 拖入与递归扫描可用，重复文件是独立项目；截图生成可用名称。文本或URL粘贴不加入队列。                           |
| 选择 `mixed`；扫描大目录时点击停止或按Escape                               | 正常图片保留；空文件、大小、格式分别汇总。停止后保留已加入项、不再追加，随后还能重新输入。                    |
| 刷新后选择 `capacity-501`，再实际上传一张图片                              | 仅500项入队并显示满额说明；点击开始上传才上传。完成结果仍占名额；清空已完成只清队列记录，图库图片仍存在。     |
| 对照本记录Figma和网页截图，检查桌面/手机与浅深色；缩短窗口并使用Tab/Escape | 整页、公共区域、输入区及扫描/停止/汇总/满额弹窗符合设计；窄屏与短视口可滚动到操作，焦点可见，关闭后回到入口。 |

人工预览已在Ego的“Issue 159 复测与人工验收”Space11打开并登录上传页，已调用 `handOff()` 将控制交给用户。服务使用本地独立的 `test-results/upload-159-preview/data`，留在运行状态；同目录保存预览截图和临时账号访问文件，不提交账号信息。当前地址为 `http://ariso-preview-62213.localhost:62213/upload`。另已请求在Codex面板打开，工具返回queued，等待当前任务被显示时打开。

这些操作待用户亲自执行，不因自动化或独立设计审计通过而标记人工验收完成。
