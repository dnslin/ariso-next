# PR #225 修复后独立代码质量复审

最终代码审查结论：**Approve**。Critical / Required / Optional / Nit 均无未关闭发现。公共接口迁移、冗余字段删除、关系查找优化、测试结构整理与真实读取失败恢复均通过独立源码核对；浏览器新发现的搜索框点击区域缺陷已修复，并由真实桌面/手机上下边缘点击证据关闭。代码批准不等于人工 UI 最终验收或全量浏览器通过。

## 范围

- 日期：2026-10-02。
- 工作树：`/Users/dnslin/.codex/worktrees/issue-160-upload-queue/ariso`。
- 上轮完整 PR 为 `3eb585f910e21518dd1061094fe556b1884f3fe4...4551c66823f18760c21c678a9b3e33e9dfc5096f`。本轮基于已合入 main `d120460` 的 merge commit `e6c4e78` 加未提交修复复审；同时核对相对新 main 的生产代码差异与上轮已追踪的调用链。
- 遵循已读取的 AGENTS.md、code-review-and-quality、vercel-react-best-practices，以及 T-UP-03、SPEC-upload、collections/media/identity 契约和设计交付/执行约定。
- 先审测试，再检查实现、类型与调用方。未把实现者总结或上轮报告当作修复完成的证据。
- 本轮只读项目，不提交/推送/发布评论，不运行 build、全量测试或浏览器，不修改用户预览。唯一写入为本报告。

## 分类

- **Critical：无。**
- **Required：无未关闭项。** 本轮临时 [P2] 搜索框44px命中区域问题已关闭，修复与实际验证见下文。
- **Optional：无新增。**
- **Nit：无。**

## 修复核对

### 公共 collections HTTP 处理

`src/server/collections/http.ts:17` 接替旧 albums/response，并由相册列表/创建、单册读取/更新/删除、封面以及新标签创建路由共同调用。没有保留旧 wrapper 或重复的标签错误映射。

- `:25` 在执行 operation 前等待 requireOwner。原 Cookie 所有者与写入 Origin 校验的边界保留，路由没有绕过它。
- `:23` 的 no-store 同时用于成功、400、404、401/403 和500响应。
- `:28` 保留 CollectionError 的 code/message，并将 COLLECTION_TARGET_NOT_FOUND 映射404，输入类错误400。JSON 解析通过 `collectionBody` 变为原有中文输入错误。
- `:47` 保留原始 err、method/path，并根据 resource 选择模块/日志/用户错误文案。tags 使用 `getServerRuntime().config.logLevel`，不再固定 info。没有把实际数据库故障当作成功或400。
- album-http.test 新增断言确认400/404/500的 no-store、JSON错误中文、500用户文案。原真实 owner/origin、读写、缺失目标和故障日志断言仍保留。
- settings-http.test 新增 tags 500响应精确断言以及真实结构化日志模块、级别、方法和路径核对。tags-route.test:19 用debug/fatal两个配置值检查 logger 工厂传参及完整原始错误对象。这是日志配置接线测试，不把 mock logger 描述为实际日志过滤行为验证。

未发现公共处理器迁移改变现有相册授权、状态码或可诊断性。

### 删除 UploadItem 冗余字段

移除 `UploadItem.groupIndex/batchSize/albumIds/tagIds` 及每次结果应用时的复制。全树搜索确认显示数据使用 frozenSubmission，调度仍使用 `Entry.groupIndex`（controller.ts:37、:278、:358），接口结果中的分组/关系类型没有被误删。

queue.test 改为核对发送的 POST metadata、用户可见冻结摘要和实际发送顺序。`:320` 断言第一/二组最后一个文件尚未结算时，下一组第一个 transport 没有开始。冻结45项20/20/5、关系参数不受外部数组修改影响、共享摘要以及并发峰值3都保留。此修改减少对冗余内部表示的依赖，没有通过删除行为断言来让测试通过。

### 关系列表计算

relations.tsx:38 使用 ID Map；仅相册遍历名称检测同名。display仍优先取当前 choices 的名称，并对已选但从 choices 消失的记录保留原名称和“已不存在”。同名相册仍显示完整ID。matchingIds Set 只替换成员判断，过滤外的既有选项继续保留，过滤内的勾选结果仍由 keys 决定。没有改变搜索、多选或失效目标的产品语义。

这项修复直接去掉渲染路径中的 findIndex×filter 与每个display的线性find，不增加依赖、缓存失效机制或通用框架。

### 关系读取失败恢复测试

`e2e/upload-relation-choices.mjs:395` 的 verifyReadRecovery 从已选真实 album/tag IDs 开始，在运行器自己的临时数据库中改名 upload_settings 表，使真实 GET /upload/settings 返回500。`:438` 精确断言本次读取状态序列为 `[500]`，同时检查错误提示、两类选择均保留；`:444` 起恢复表并点击真实“重试读取列表”；`:475` 断言 `[500,200]`、选中项的 aria-selected、错误消失及两类IDs仍相同。finally 在异常路径还原表。`:681` 实际调用此场景，未遗漏接线。

此用例确实补到了旧报告校正后确认的缺口。它既不是用已有初次设置失败代替弹层刷新失败，也不是把成功响应挂起当作失败。运行器用 mkdtemp 建立独立数据库，测试不会改用户预览数据库。本审查未自行执行该浏览器场景。已独立回读本轮 accepted 报告，实际 responses 为 GET 500、GET 200，并记录两类非空选中 IDs；整个关系专项49组布局、12项行为检查通过。

### 新发现的搜索点击区域修复（已关闭）

主审首轮统一浏览器执行中，submissions专项通过62组布局，但relations在搜索相册204×36px输入框处失败。因此该轮不能记为上传浏览器整体通过。

随后独立读取 relations.tsx 的实际修复：SearchField.Group新增onClick，仅当 `event.target === event.currentTarget` 时聚焦组内input。HeroUI安装包的SearchFieldGroup确实把DOM属性传给React Aria Group。该条件扩展组留白的鼠标点击，不覆盖输入编辑或清空按钮事件，不改变键盘Tab行为和像素尺寸。

`e2e/upload-relation-layouts.mjs`新增物理命中验证：先将焦点移到“新建”按钮，确认当前焦点不是input；最终版本对原生input已达到44px的手机布局，实点input上下内沿并验证inputHit；对较小的桌面input，按Group与input之间上下留白的中点计算坐标，断言坐标在input外、在视口内且elementFromPoint命中Group。两条路径均执行原生mouse.click后断言activeElement就是input。记录保留input原始尺寸与Group尺寸，只有小于44px且经过实际留白命中验证的搜索框使用Group尺寸，其余输入、按钮、导航和底栏尺寸断言继续保留。这不是用较大父容器替换尺寸来隐藏失败。

最终 accepted 报告的18条 searchHitAreas同时包含group与input两条路径，所有上下沿实际点击均 inputFocused=true。`relations.tsx:119` 的修复和本轮运行证据一致，关闭临时Required问题。

### 浏览器测试结构与入口

旧 verification 目录的一次性启动器被删除。scripts/verify-browser.mjs 保留同一个生产启动、退出、redact与报告流程，增加 `--suite upload` / `upload-regression` 选择和可指定页签；full 默认路径仍包含原先全部阶段与新上传专项。专项跳过无关外壳/全站阶段的行为是显式 suite 选择，不冒充 full 通过。新增 `--only relations/submissions` 仅允许用于 upload，仍执行已有阶段，报告显式记录 only，不伪称未执行阶段通过。

原关系大脚本按 choices、creation、submissions、layouts 拆分；入口顺序调用三个业务验证函数。核对保留的关键断言包括真实同名相册ID、过滤隐藏选择、键盘Escape、快建数据库故障及未知结果不重复POST、真实submission关系持久化、旧名称冻结、删除目标后不绑定同名新记录。布局读取复用 browser-geometry，关系专有44px/标签底栏尺寸断言留在局部。未发现拆分中删除关键业务断言。

## 完整 PR 的五轴结论

- **正确性：** 原完整PR的限制快照、45项拆批、跨提交三槽、固定关系事务交接、取消/accepted边界与同imageId重新处理路径没有被这轮修复改变。现有源码和改动测试相互吻合。
- **可读性：** 共用错误处理、删除无消费者字段及拆分专项测试减少重复与单文件负担。
- **架构：** 集合 HTTP 规则放回服务端所属模块；原 AlbumDialog、collections schema/helper、identity、media reprocess和上传调度继续复用，没有新增依赖或兼容层。
- **安全性：** owner/Origin前置与no-store保留；真实数据库错误仍记录内部上下文；前端名称按文本输出，固定关系ID不按同名重绑定。
- **性能：** 本轮关系 Map/Set 去掉明显重复扫描；没有新增传输或后台轮询通道。

## 本轮独立执行

环境为 Node 24.18.1、pnpm 11.19.0，PATH前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。

实际命令：

`pnpm exec vitest run --project unit tests/unit/collections/tags-route.test.ts tests/unit/upload/queue.test.ts tests/unit/upload/controller.test.ts tests/unit/upload/settings-route.test.ts tests/unit/upload/page-settings-route.test.ts`

结果：**5个文件、46项通过**，退出码0。其他执行仅为 git diff/status/log、rg、文件内容与行号读取。

未自行执行安装、format、lint、typecheck、build、集成或浏览器全量。主审统一执行日志的回读结果见下文，不沿用旧 approved 日志宣称本轮全部通过。

### 已回读的统一检查首轮日志

这些命令由主审执行，本次独立审查直接读取文件内容并区分其结果：

- `/tmp/ariso-225-fixes-unit.txt`：63文件、782项通过。
- `/tmp/ariso-225-fixes-typecheck.txt`：类型生成完成，主审确认完整命令退出0。
- `/tmp/ariso-225-fixes-lint.txt`、`/tmp/ariso-225-fixes-format.txt`：主审确认退出0；格式日志明确All matched files use Prettier code style。
- `/tmp/ariso-225-fixes-build.txt`：编译成功，主审确认构建退出0；日志仍含其他平台resvg可选原生包 tracing 诊断，不描述为无诊断构建。
- `/tmp/ariso-225-fixes-integration.txt`：全量113文件/1057项中112文件/1056项通过，唯一失败是runtime/build.test从git ls-files拷贝未暂存的已删除旧runner时报ENOENT。主审将删除与新增源码暂存，未修改测试或断言；随后 `/tmp/ariso-225-fixes-build-regression.txt` 的独立构建测试1文件1项通过。首轮整体退出1的事实保留，不写作全量重跑通过。
- `/tmp/ariso-225-fixes-browser-upload.txt`：submissions通过，relations在搜索input尺寸处失败；整体未通过。

搜索点击修复后的 `/tmp/ariso-225-fixes-final-build.txt` 与 `/tmp/ariso-225-fixes-final-typecheck.txt` 已回读，主审确认退出0。构建仍有上述可选包 tracing 诊断。中间轮 `/tmp/ariso-225-fixes-browser-relations-final.txt` 在 albums-empty 390 light 后 waitForFunction 超时，该失败事实保留。布局夹具随后改为先关闭弹层，再变更主题/视口并重开，仍恢复查询与执行完整断言。最终 `/tmp/ariso-225-fixes-browser-relations-accepted.txt`、`test-results/browser-upload-relations-accepted/runner.json` 与 `upload-relations.json` 均确认passed，49组布局、12项行为检查，真实500→200恢复与18条搜索命中记录均已回读。`test-results/browser-upload-fixed/upload-submissions.json` 单独确认62布局、4项行为通过；其所在整轮后来relations失败，不能记为整轮通过。旧上传/轮询专项 `test-results/browser-upload-regression-fixed/runner.json` 已回读：status passed、upload/uploadPolling passed、temporaryDirectoryRemoved true；upload.json为130组布局与15项行为，upload-polling.json为4项行为。主审确认 `/tmp/ariso-225-fixes-browser-regression.txt` 退出0。最后针对9个浏览器脚本的静态检查 `/tmp/ariso-225-fixes-browser-static.txt` 已回读，主审确认退出0。本轮API集成运行时的服务代码与公共HTTP修复一致；搜索点击修复仅影响客户端事件，不能将旧build的浏览器结果冒充修复后证据。

## 验收边界

代码审查已完成，暂无待修复发现。人工 UI 验收仍未完成，不将方案批准等同最终页面批准。合入新main后的本轮专项结果已与日志核对；本次没有重跑全量浏览器；上传提交、关系、旧上传/轮询专项均分别有本轮通过证据。另有设计评审正在核对1440深色某状态截图的黄色按钮文字可见性，其DOM/稳定截图结论尚未提供，故本代码审查不据此宣布设计通过，也不将尚未复现的视觉疑点列为代码缺陷。此次审查不扩展为 #224 全部功能重审，也不代替后续S3上传、发布镜像或双架构验证。
