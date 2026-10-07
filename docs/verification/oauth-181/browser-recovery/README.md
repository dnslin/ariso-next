# OAuth 浏览器恢复与真实 GitHub 验证

2026-10-07，用户完成 GitHub Confirm access 后，按已授权范围接管同一 Ego TaskSpace 6 / p1。实施、验证和完成条件沿用[任务执行约定](../../../tasks/execution.md)；本记录只补实际结果，不另建规则。先前停止、失败和未验证记录保留为各自日期的历史。

环境为 macOS arm64、Node 24.18.1、pnpm 11.19.0、HeroUI 3.2.6、现有 Ego Lite。默认与定向运行器各自创建独立生产运行时、数据库及主机名；真实 GitHub 使用本任务的独立 `localhost:3183` 数据。人工验收预览 `127.0.0.1:3182` 的数据保留，没有因验证改写。

## 实际结果

| 层次               | 结果与证据                                                                                                                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 默认浏览器入口     | **失败**：68 阶段，55 passed、7 failed、6 blocked，见 [默认记录](default-browser.json)。没有把定向通过改记为默认全量通过。                                                                                                                                                          |
| OAuth 定向生命周期 | before、两次真实同数据重启、after、enabled 全部通过，见 [生命周期](oauth-lifecycle.json)。覆盖保存/生效区别、加密持久化、保留/替换/清除密钥、真实拒绝写入、单次提交、丢失响应后的 GET 核对、关闭后待核对状态、解绑及本地密码保留。UI fixture 的 seeded 关系不代表真实 GitHub 授权。 |
| 三个公共消费页面   | `/settings/processing`、`/settings/account`、`/settings/api` 的 1440/390 浅深分类顺序、图标、选中项、无文字遮挡及手机分类菜单通过，见 [消费者](settings-consumers.json) 与 [真实截图](consumers/)。                                                                                 |
| 真实 GitHub        | 已实际完成未绑定拒绝、同邮箱拒绝隐式绑定、`requestSignUp` 不注册、不同邮箱主动绑定、稳定 provider ID 再登录、令牌字段清空、新回调授权、停用/启用重启、第二个真实 Secret 轮换与重启后登录、最终解绑的会话/密码保留及解绑后 GitHub 拒绝，见 [真实 OAuth](real-oauth.json)。           |
| 手机补充状态       | 实际 Clipboard 成功与拒绝后的完整手动选区、旧通知退出、独立 loading/error、配置与解绑 unknown 两主题、长邮箱全宽度换行、滚动查看两份完整快照通过，见 [真实 UI](real-ui/manifest.json)。                                                                                             |
| 本地检查           | 最新类型、完整 lint、构建通过；默认单元 122 文件、1636 项通过。完整集成的历史失败与对应复验保留在[统一记录](../README.md#已执行检查)，本轮客户端焦点变化不机械重跑不受影响的后端集成。                                                                                              |
| 独立评审           | 功能复审与范围归属见 [代码评审](code-review.md)、[范围审计](scope-audit.md)；真实 Figma 与页面对照见 [设计评审](design-review.md)。两种结论分别记录。                                                                                                                               |
| 人工验收           | 用户已明确确认获批设置行与图标的 UI 验收通过。该确认不替代浏览器、独立设计审查或真实 OAuth 功能验证。                                                                                                                                                                               |

## 失败证据与本次修正

默认 OAuth 500 场景只等待错误文字就按 Escape，实际 GET 仍在核对。当前场景等真正的 verified 终态，继续要求输入草稿保留、Save 缺席及实际 saved/effective GET 值，真实 SQLite 触发器仍在 finally 删除。定向入口另将主题切换移到产品导航之后，消除对上一实验页显式深色偏好的依赖。默认入口、suite/only 分发和共用运行器没有改变。

真实关闭复现证明，核对终态禁用原输入后，首个 Escape 前 activeElement 为 BODY，事件未到达弹窗；见 [首键失败](close-focus-red.json)。恢复后的主页面按钮也已被卸载并重新创建。配置和解绑模块现分别在核对终态聚焦当前启用动作，关闭时查询并聚焦当前来源按钮，保持 preventScroll。没有添加全局焦点管理器、兼容路径或自动重试写入。

随后实采发现未知配置按钮的显式 ID 没有更新。实际库链为 HeroUI Button → React Aria Button → `useId(defaultId)` 的初始状态：同一位置的 Save 切成 reload 时保留原生成 ID。当前恢复动作使用随 DOM 更新的稳定 `data-testid`；字段仍使用既有显式关联 ID。E2E 要求按键前焦点在弹窗内、一次 Escape 后真正卸载、当前来源焦点与原滚动；没有强行聚焦来掩盖失败。

复制成功后再拒绝权限时，原手机截图中的成功通知覆盖取消按钮约 14px。复制组件现在只保存并关闭自己前一条通知的 ID，再执行下一次 Clipboard 请求；没有关闭其他通知或改变全局位置。最终手机真实图中完整手动选区、保存与取消均可达，独立设计者已复核。

新增模型测试调用实际 hook 和请求分支，验证两个核对终态、当前来源按钮、preventScroll、只发送一次写入以及只关闭自己的复制通知。模型测试不证明 React DOM 提交时序，实际焦点、键盘与通知布局由上述浏览器断言补证。

默认其余失败涉及 Token 输入内部滚动、图库 Canvas 对比、相册封面等待与公开分享短视口。审计已读真实调用链并与 origin/main 比较；没有足够证据证明具体根因，未改范围外模块，也未放宽断言或跳过检查。详情及影响见[范围审计](scope-audit.md)。

## 实际执行入口

下列命令均从当前工作区执行，使用 Node 24.18.1 与锁定 pnpm 11.19.0。浏览器复用空间 6，保留现有 NO_PROXY/no_proxy 并补本地地址。原始输出位于 ignored `test-results`；初始化码和私有凭证不提交。

| 命令                                                                                                                              | 本轮结果                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm run test:browser`                                                                                                           | failed，`issue181-browser-resumed`，55/7/6 分开保留                                                                |
| `node scripts/verify-browser.mjs --suite oauth`                                                                                   | 最新 `issue181-oauth-final-focus` 五阶段通过，包含成功解绑读回后的最终绑定入口焦点；历史失败目录保留为 RED，不改写 |
| `node scripts/verify-browser.mjs --suite tokens --only consumers`                                                                 | passed，`issue181-settings-consumers`，14 项代表布局，browserErrors=[]                                             |
| `pnpm exec vitest run tests/unit/identity/github-navigation-restore.test.ts`                                                      | 15/15 passed，`issue181-unlink-focus-unit.log`                                                                     |
| `pnpm run test:unit --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/issue181-browser-fixes-unit.xml` | 122 文件、1636/1636 passed，75.86 秒                                                                               |
| `pnpm run lint`                                                                                                                   | passed，`issue181-browser-fixes-lint.log`；最后 E2E 焦点断言另执行文件 ESLint 通过                                 |
| `pnpm run typecheck`                                                                                                              | passed，`issue181-browser-fixes-typecheck.log`                                                                     |
| `pnpm run build`                                                                                                                  | passed，`issue181-unlink-focus-build.log`；既有 resvg 文件追踪警告保留                                             |

最后实际执行 `pnpm run format:check` 通过，日志 `issue181-browser-fixes-format.log`；`node docs/tasks/check.mjs` 通过，120 任务、298 需求，日志 `issue181-browser-fixes-docs.log`。交付前实际核对人工预览健康接口、原型账号页及独立真实运行时健康接口均 HTTP 200。

验证链已由独立评审实际核对：默认 `test:browser` → `verify-browser.mjs` → 两端 `runIdentityManagement` → `runOAuthManagement` → 相同 before/after/enabled 场景。after/enabled 使用同一数据目录的真实进程重启。消费者检查留在 Token 的既有所属场景中，定向调用不替代默认入口。

## 设计与预览

Figma 文件 `74sT9Hrf8G4czcWeTkET5b`，主节点 `34:462 / 102:1713`，状态及弹窗映射见 [设计评审](design-review.md)。独立评审者先核对完整公共区域，再核对业务设置行、控件、主题与状态；实际读取 Figma 信息及截图，实际查看产品图片。

获批产品保持 HeroUI 和公共来源。Figma 精度漏项按实际来源同步：Tabs 的 8px 业务间距、18/28 标题、20px 值行高、密码圆点 3px 字距、手机已选图标与自然 90×44 操作，以及待重启 Accordion 默认左右 16px 内距。同步范围与实际导出见 [Figma 精度记录](figma-adjustment/README.md)，没有通过更改已获批产品来迁就旧画板。

正式预览继续保持 `http://127.0.0.1:3182/settings/account`，可查看两组设置行、配置浮层、回调复制、密钥清除确认、浅深主题、手机分类和本地邮箱密码。独立账号及密码只在 ignored 文件和给用户的私有回复中提供。分支与 worktree 保留，PR #255 保持草稿；没有合并、关闭 Issue、发布、部署或清理。真实手机触控、物理软键盘和非零安全区按项目执行约定不属于本地必需实测，未运行发布镜像检查。
