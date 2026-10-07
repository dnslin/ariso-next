# 分享设置人工反馈：独立代码评审

2026-10-07，产品实现、最终测试定位与大剪贴板恢复的独立代码审计通过，没有遗留的必须修正项。本轮分享管理代表流程最终实际通过：四项检查、38 组布局、12 组反馈状态，原生剪贴板与主题恢复完成。用户已明确通过本次两项 UI 人工审查，该结论不替代原 #193 的其他验收；最终定向通过也不改写此前默认完整流程的失败。原 #193 全量审计和检查结果继续保留于[统一证据](../README.md)。

## 范围与依据

评审以 `1518911f` 后的本轮反馈修改为范围，审查 `src/app/shares/settings.tsx`、`e2e/sharing-management.mjs` 及验证中真实失败所需的 `e2e/library-copy-helpers.mjs` 小幅修正与直接调用路径。依据是用户明确指定的右上角图标返回按钮、红色“已过期”文字且不加 Halo，项目 `AGENTS.md`、[设计交付规范](../../../design/handoff.md)、[任务执行与验证约定](../../../tasks/execution.md)，以及实际读取的 `code-review-and-quality` 技能。

已核对分享设置路由、`useSettings` 的返回与弹窗焦点恢复、现有主题变量、HeroUI 3.2.6 的 Button/Tooltip/Chip 实现和类型、浏览器场景与默认运行器。未重新评审匿名大图或范围外模块，未操作浏览器，未重复实现者已执行的安装、静态、类型或构建检查。

## 审计结论

| 维度             | 结论                                                                                                                                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 需求与状态       | 返回入口从底栏移到标题行右侧，沿用 Lucide ArrowLeft、HeroUI Button/Tooltip，声明 `size-11` 点击区域、可访问名称与隐藏装饰图标。说明行独占下一行，长相册名仍换行。启用且过期的 Chip 文字和有效期后缀使用已有 `text-danger`；正常/停用标签、Chip 底色和圆点保持原有中性色，未添加光晕或动态效果。 |
| 导航与边界       | 按钮仍调用既有 `returnPage`；普通来源返回 `/shares`，相册来源仍返回对应相册。未保存内容仍先进入既有放弃确认，关闭确认仍使用原来源元素恢复焦点。加载/错误读取、请求处理中和待核对状态逻辑未改变。                                                                                                |
| 简单性与模块职责 | 没有新增状态、请求、依赖、公共外壳修改或兼容逻辑。返回名称只增加一个局部派生字符串，主题色沿用公共变量。新增场景集中于本模块的 `settingsPresentation`，没有把设置参数分发到其他 suite。                                                                                                         |
| 资源与安全       | 未增加事件监听器、定时器、门户管理或资源生命周期。原有所有者路由校验不变。测试只操作运行器独立数据库，保存并恢复自己消费的 `enabled` 与 `expires_at` 两字段；没有克隆分享对象或引入凭证。SQL 值来自固定夹具身份及内部数字/null，不接收外部用户输入。                                            |
| 测试有效性       | 新场景读取实际页面几何、文字、计算样式与原生导航结果；覆盖正常、启用过期、停用过期，390/1440 两宽度与浅深主题。保留未保存布局草稿、取消回焦和相册返回检查；现有 360/390/430/768/1440 响应式场景继续运行。测试不会以截图数量替代设计对照。                                                       |

运行器调用链已从 `package.json` 的 `test:browser` 核对到 `scripts/verify-browser.mjs`、`scripts/browser-plan.mjs` 与实际场景：默认 `full` 包含 `sharing-management`，未设置 phase 时会执行 `settingsPresentation`；`--suite sharing-management --only representative` 执行相同新检查。未修改共享分发逻辑、测试超时、已有断言或默认完整入口。

## 验证与限制

评审者实际执行 `git diff --check -- src/app/shares/settings.tsx e2e/sharing-management.mjs`，退出 0。评审者回读了 `test-results/sharing-193/feedback-settings/` 中首轮 `install.log`、`lint.log`、`typecheck.log`、`build.log`；实现者报告对应命令退出 0，日志包含完整静态入口、路由类型生成和成功构建输出。构建在相同源码的独立副本执行，避免覆盖仍服务原人工预览的 standalone；已有依赖追踪告警原样保留，没有转写为无告警。下述尺寸修正后的受影响检查由实现者执行并在统一证据单独记录，首轮结果不冒充尺寸修正后的复验。

首轮审计时新增浏览器断言未执行，既有 TaskSpace 不存在，等待用户明确允许新建。后续用户明确回复“可以的，就这样，这个 UI 我审查通过了”，实现者在独立 TaskSpace 4 继续测试。评审者只回读离线报告，没有操作浏览器；本次两项 UI 的人工认可与自动验证分别记录，不能从之前 #193 的通过记录推断本轮通过。

## 文案建议复审

原测试中一处断言仍使用 `fixed return action` 描述返回入口。实现者已改为 `header return action`，评审者实际回读确认；失败报告与本轮位置一致，断言逻辑与产品行为未变。没有遗留的必须修正项。

## 图标尺寸复审

独立设计预审发现 HeroUI Button 的通用 SVG 样式会覆盖 Lucide 的 `size` 属性。评审者实际读取安装版本的 `dist/components/button.css`：默认规则为 `size-5`、`sm:size-4`，仅声明 `size={18}` 不能保证 18px。该组件样式由 `dist/index.css` 导入 `components` 层，产品 Tailwind 的 `size-[18px]` 属于后续 `utilities` 层；仅给新返回箭头增加这一类名是直接且局部的修正，不改变公共按钮样式。

新增测试读取实际 SVG 的 `getBoundingClientRect()`，分别断言宽和高为 18，能够捕获同类 CSS 覆盖回归。评审者回读产品与测试的这次小幅差异并再次执行上述 `git diff --check`，退出 0；静态复审通过，没有新复杂度。首次新版浏览器报告实际取得 12 组状态的 44×44 按钮与 18×18 SVG 数据，但整个场景随后因下述测试定位问题失败，不记作该入口通过。

## 布局草稿测试定位复审

评审者实际回读 `test-results/sharing-193/feedback-settings/` 的三个报告：旧构建 `browser-red` 在 `settings-presentation-feedback` 失败，实际 `inHeader=false`、`iconOnly=false`，证明原按钮仍在底栏且回归检查能捕获问题；首次新版 `browser-green` 完成 12 组正常/过期/停用、浅深色与 390/1440 状态数据后失败，原因是全页第一个选中 ToggleButton 为有效期“不过期”，不是图片布局；首次缩小范围后的 `browser-verified` 仍为 failed，CSS 查询返回 null。三个失败均保留，不能按目录名将 green/verified 记为成功。

已修正的必需项：首次 `[role="radiogroup"][aria-label="图片布局"]` 定位不正确。产品 `Choices` 实际传入 `aria-labelledby="layout-label"`，HeroUI 只透传该属性；实际安装的 React Aria `useToggleButtonGroup` 通过 `useToolbar` 保留 `aria-labelledby`，不会把可访问名称转换为 `aria-label` 属性。失败报告的可访问树确实显示“图片布局”单选组，不能据此推断对应 DOM 有 `aria-label`。

实现者实际读回 TaskSpace 4 DOM 后，将定位限定为 `[role="radiogroup"][aria-labelledby="layout-label"]` 内的选中 ToggleButton；评审者回读最终差异，确认仍严格断言文本等于“瀑布流”。未改产品、未增加回退、未弱化断言，也没有跳过草稿或焦点步骤。最终静态复审通过，`git diff --check -- e2e/sharing-management.mjs` 退出 0。

新检查仍在默认 `full` 的 sharing-management 代表流程执行；本次仅定位具体业务组，不修改运行器分发。随后 `browser-complete` 已完成三项业务检查与 38 组布局，但在原生剪贴板恢复收尾失败，具体修正见下节。旧 failed 报告继续保留。

## 大剪贴板恢复与测试日志复审

评审者实际回读 `browser-complete`：虽然 `stage=complete`，`cleanupError` 含 `spawn E2BIG`，`clipboardRestored` 未记录，场景和运行器均 failed。原实现把完整剪贴板数据嵌入 `osascript -e` 参数，真实数据超过进程参数长度限制。原快照随失败进程丢失，旧剪贴板未恢复；实现者已向用户说明。当前私有备份仅保护当前状态，不作为原丢失内容已恢复的证据。

`restoreClipboard` 保留原有多条目、多格式及 Base64 字节转换，只将脚本从 argv 改为标准输入。评审者读取本机 `osascript` 手册，确认无文件名参数时支持标准输入；读取已安装 Node 类型，确认 `promisify(execFile)` 返回 Promise 带 `.child`。新实现直接启动 `osascript -l JavaScript`，用 `stdin.end` 完整传入脚本并关闭输入，再等待同一个子进程 Promise；没有 shell 拼接、临时文件、新依赖、后台进程或吞错回退。原有失败继续向调用者抛出。

新增场景使用 20,000 行合成中文文本，原生字节为 560,000，超过 128 KiB；写入后重新调用 `saveClipboard` 逐条目、类型、字节完全比较，再恢复事先保存的当前内容并再次完全比较，之后才继续 UI 检查。外层既有 `finally` 仍在正常收尾与场景失败时恢复快照，用户接管停止条件仍沿用原边界。此检查位于既有 `representative` 分支，默认未指定 phase 与 `--only representative` 都执行，未改运行器分发。

审计发现初版新增 `assert.deepEqual` 在快照不一致时会把用户私有剪贴板数据写进失败报告。实现者已改为 `isDeepStrictEqual` 比较完整快照，再严格断言结果为 true；评审者回读两处修正，确认没有截断、跳过或弱化比较，失败信息不再包含快照内容。合成数据同样不作为大块失败输出。共用 helper 的全部现有消费者已从引用核对，包括分享设置、批量复制、单图复制和 Token 行为；传输与恢复协议未改变，未重复运行既有消费者检查。

第一次传输修正后的 `browser-clipboard-verified` 实际为 passed，四项检查、38 组布局、12 组反馈状态，`clipboardRestored=true`，运行器 passed 且临时目录已清理。最后的布尔断言修正静态复审通过，`git diff --check -- e2e/library-copy-helpers.mjs e2e/sharing-management.mjs` 退出 0。评审者没有读取私有备份内容，没有重复执行已通过检查或操作浏览器。

## 最终独立结论

评审者实际回读最终 `browser-final/sharing-management.json` 与 `runner.json`：两者均 passed，phase 为 representative、stage 为 complete，四项检查、38 组布局、12 组反馈状态，`errors=[]`，没有场景错误或收尾错误，`clipboardRestored=true`、`themeRestored=true`，运行器临时目录已清理。实际返回按钮均为 44×44，SVG 均为 18×18；状态颜色、无 Halo、键盘返回、相册目的地、未保存确认、草稿与回焦、原生复制及通知期间返回均在这个最终入口完成。实现者记录该命令实际退出 0；评审者只回读产物，未重跑测试。

实现者另在运行器完全退出后，以 Node 24 只读比较当前剪贴板与修复前的私有备份，结果一致，未打印内容；复制操作尚未收尾时的中途只读比较不作为恢复结论。该证据只证明当前快照恢复，原大快照丢失限制仍保留。本轮代码与有效测试覆盖已完成独立审计，前述真实失败均保留；设计对照、人工认可和原 #193 全量完成状态仍由统一证据分别维护。
