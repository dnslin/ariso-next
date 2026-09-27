# 页面切换与界面反馈代码审计

独立审计者：`code_audit`。遵守 `code-review-and-quality`、AGENTS、设计交接和执行约定。本记录仅覆盖本轮变更，不沿用上轮通过状态。

## 当前结论

共享 UploadProvider 与 RouterProvider 的静态审计暂未发现阻断项。新版导航与精确结果 401 专项两端已通过，所有本轮代码审计发现已修复；最终完整浏览器运行器已通过，见本目录 browser/full/runner.json。完整回归、独立设计评审、用户人工验收均不得由此静态结论替代。

## 真实失败证据

在独立旧构建 `ariso-workspace-61041.localhost:61041`，用实际文件选择器选择 sample.jpg，设置私有，再原生点击侧栏「图库」「上传图片」。文档标记已消失，队列为 0，可见性重置公开。记录 `test-results/m2-85/workspace-continuity/navigation-red.json`，截图 `red-queued.png` 与 `red-return-empty.png`。

本次原生点击没有报告 beforeunload 对话框，浏览器直接完成导航。记录如实保留此现象，不声称出现或接受过确认弹窗。

## 已读实现与资源边界

- HeroUI RouterProvider 对接 Next router.push；不替换为手写锚点 click 拦截。
- UploadProvider 位于根 Providers，仅首次进入上传页才启动设置读取及控制器。页面内部仍只管理自己的弹窗／选择界面，文件、Blob、传输、快照设置和轮询随浏览器文档存活。
- owner 页面切换不 destroy 控制器；登录、setup、已确认退出和会话失效调用统一 reset。reset 同步 destroy，停止传输、释放 Blob、abort 状态请求，清空设置和 query；不删除服务端已接收的图片或任务。
- beforeunload 在事件发生时读取当前 snapshot。未传输项在硬刷新时仍提醒；reset 后立即看到空 snapshot，不会因 React effect 尚未清理而阻碍退出。
- 轮询 timer、QueryClient 和 controller effect 都有清理路径；不引入 localStorage 队列持久化，也不伪造硬刷新后的 File 对象。
- library／trash 的列表 401 与常规 session 核对同样清理队列；详情与上传结果 hook 的 401 均已读到统一 reset；后者遗漏已修复并完成精准专项（见下）。

## 独立测试边界

新增 `e2e/workspace-continuity.mjs` 由本审计者编写，交由 `scope_review` 独立只读评审。脚本使用原生链接点击、History API、实际 File/Blob、真实 XHR／fetch 及隔离数据库；只延后真实 XHR load 回调，不伪造接口返回或调用控制器。分别检查队列标识／设置／Blob 仍可读取、后台轮询、单次提交身份、硬刷新、退出和真实会话过期清理。

已实际执行新脚本和 runner 修改的 prettier、ESLint、`node --check`，均退出 0。新浏览器脚本已在独立 `ariso-workspace-62383.localhost:62383` 实际运行，1440×1000、390×844 两端均 passed。

## 新构建专项结果与最终差异

实际报告 `test-results/m2-85/workspace-continuity/workspace-continuity-{1440,390}.json`，每端包含四项行为：

- 原生侧栏点击与 back／forward 保持同一 document、队列 ID、私有设置和仍可读的 Blob 字节。
- 上传进入 saving 后切换图库，释放真实 XHR 回调；后台真实 GET 在 `/library` 取得 succeeded。回到上传仍为同队列／image ID，数据库只有一个对应 submission，未重复提交。
- 硬刷新 beforeunload 的 defaultPrevented 真实为 true，刷新后新文档不保留未传输队列。
- 真正退出和仅使当前真实 session 过期均在导航前调用 Blob revoke，重新登录后队列为空。

每端保存 queued-before-navigation、queued-after-history、background-completed 三张截图。初次网络观测未覆盖控制器初始化时绑定的 fetch，测试改为新文档初始化真实 fetch 委托后重跑通过；没有伪造响应，也未放宽后台 GET 断言。

最终 UI 差异已静态核对：直接删除仍调用原 TrashAction 并保留确认、未知结果核对和权限判断；旧更多菜单已删除，无兼容路径。原图说明放在 tab collection 外的独立 44px 入口，预留列不改变四版本键盘语义。手机下载改直接操作，不改下载访问检查。状态 Chip 使用明确「上传状态／图片状态」标签。独立设计还原仍由设计评审确认。

## 已发现的 401 清理遗漏

`src/components/upload/result.tsx` 的 useUploadResult 401 分支仍只有 client.clear 和 location.replace，遗漏 resetUpload。在已成功行旁追加未提交文件时，该结果请求若返回 401，会保留活动队列到硬跳转，可能触发未传输警告，并缺少已规定的显式资源清理。主实现者已在跳转前添加相同 reset，静态复审通过。新增精确浏览器用例已两端实际通过：真实完成行旁保留 queued 行，原生往返使结果查询重新订阅；仅延后真实结果 GET 派发，随后过期实际 session 并放行服务器 401，同时保持独立 get-session 响应，防止 session-controls 代为清理。验证显式 Blob revoke 且 beforeunload 不阻止跳转。两端专项的 session 失效检查走 session-controls，因此不冒充覆盖此遗漏路径。

旧 8 个 E2E 适配已独立只读审计：copy 发起真实 GET 取代被删除的正常刷新入口，保持竞态响应延迟和禁用复制检查；删除直接触发／确认可访问名称、三按钮布局、原图说明几何与键盘恢复检查有效。未发现弱化断言。新 workspace 脚本也已由 scope_review 独立审核，无未解决测试有效性发现。

原图说明首轮浏览器截图还发现定位参照错误：Tabs.ListContainer 是属性注入组件，relative 未形成预期 DOM 参照。实现者已把 relative 放到真实 Tabs.Root，静态复审确认参照存在；实际几何须由原图说明浏览器断言及设计审查复验。

## 结果 401 修复的独立 GREEN

在新构建 `ariso-workspace-51493.localhost:51493`，重新执行完整导航专项，1440×1000 与 390×844 均为 passed，每端 5 项行为。新增结果 401 用例两端均记录目标 `/api/images/{id}` 的真实 HTTP 401、3 个被保持的真实 get-session 响应以及 `beforeUnload: [false]`，queued Blob 显式释放并在重新登录后为空队列。这一用例覆盖 useUploadResult 自身出口，而不是依赖 session-controls。

归档：[桌面报告](./browser/continuity/workspace-continuity-1440.json)、[手机报告](./browser/continuity/workspace-continuity-390.json)。同目录包含两端队列往返、后台完成和 result-401-cleared 实际截图。只运行独立测试服务，未触碰用户手工预览数据。

本轮独立代码审计无剩余阻断发现。完整仓库回归及最终文案构建仍由主 agent 跟进；本报告不将专项通过记作全量通过。

## 全量检查发现的按钮高度修正

第一轮完整浏览器在 ready 详情的 48px 按钮断言捕获真实差异：删除触发按钮实际 44px，而复制／下载为 48px。实现者将共用 TrashAction 的触发、取消和确认按钮从 min-h-12 改成显式 h-12，避免既有全局 min-height 覆盖最低高度后退回组件默认高度。已只读复核，这一最小修正保留按钮权限、pending／unknown 状态和焦点流程；48px 断言及容差没有降低。

本次静态复审无新增阻断。修复后的专项及完整 runner 仍由主 agent 执行；第一轮失败证据保留在本轮 attempts，不计为通过。

原图说明 Popover 的焦点恢复检查改为关闭后有界等待同一可访问名称（最多 3 秒），再保留原来的精确 activeElement 断言。独立复审确认没有改目标、加入跳过或固定 sleep；只等待异步焦点恢复完成。主实现者已通过再次真实 Enter／Escape 确认实际恢复，完整 focused 重跑仍待结果。

第二轮完整运行中图库套件已通过，上传复用的公共检查仍引用管理员说明移动到标题前的旧 Tab 顺序。新测试按最终 DOM 顺序验证「仅管理员可见」→ Tab →「刷新回收站」→ Shift+Tab →「仅管理员可见」，两个落点都保留 `focus-visible` 要求。已独立只读复核，此处是适配已批准的控件位置，并新增反向验证，没有去掉键盘可见焦点要求。四视口专项与完整 runner 仍待主执行者最终结果。

旧上传布局测试的缩略图阈值已从 768 调整为 1280，与本轮批准的 `size-14 xl:size-16` 一致：小于 1280px 时宽高精确为 56px，其余精确为 64px，没有扩大容差或只检查非零。两条离开上传的报告文本明确为 hard document navigation，实际 `page.goto` 操作与丢弃队列断言保持不变，避免与新增原生页面导航保留队列的行为混淆。已只读复审通过；此段尚未开始运行，最终结果仍待完整 runner。

## 最终完整运行

主 agent 已执行完整 `pnpm run test:browser`，最终 runner 状态 passed（2026-09-27 16:17，Asia/Shanghai）。图库、上传、公共侧栏、轮询、桌面／手机核心冒烟、交互和导航连续性均通过；独立代码审计无剩余阻断项，用户人工验收仍待。
