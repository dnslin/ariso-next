# 2026-10-02 人工验收返修

承接 Issue #176 / PR #226，规则仍以 [handoff](../../../design/handoff.md) 与 [execution](../../../tasks/execution.md) 为准，不修改 Figma 或冻结 PRD。

## 用户反馈与修改范围

用户提供四张真实页面截图：[手机信息与搜索](user-feedback/mobile-meta-search.png)、[名称输入](user-feedback/edit-name-icon.png)、[删除成功](user-feedback/delete-success-notice.png)、[访问说明](user-feedback/access-disclosure-hover.png)。它们保留了返修前表现及用户标注。

- 手机标签名称独占一行，数量与短创建日期在下一行横向并列；窄于容纳实际长值的空间允许自然换行，不裁切名称或缩小按钮。
- 搜索和创建/改名输入用已有 HeroUI InputGroup.Prefix，补 Lucide Search / Tag；视觉 16px、左 12px、文字从左 36px 开始，维持 48px 字段高度、14px Regular。独立重新读取原 Figma 六节点后确认只有空白预留，没有绘制图标；本次按用户反馈补图标，不把原稿说成已有图标。
- 明确创建/重命名/删除完成后使用已有 HeroUI Toast / ToastProvider，不新增 Sonner 或另一个通知入口。未知结果关闭后仍显示带本次输入的持久提示，不把未知当成功或自动重发。明确错误和必要说明仍在原上下文显示。
- 用户图四明确涉及图片详情 AccessDisclosure，因此本轮扩展到这个既有公共组件：移除 ghost Button 嵌 Chip 的双胶囊，单层水绿按钮取消 hover/pressed 形变；保持 44px 点击区、访问说明内容、点击/键盘打开与 Escape 返回焦点。图库权限、图片版本、业务操作不变。

已读取相关调用、类型、样式及现有 e2e；核对 [HeroUI InputGroup](https://heroui.com/en/docs/react/components/input-group)、[Toast](https://heroui.com/en/docs/react/components/toast)、Button / Popover 官方说明和已锁 3.2.6 安装包类型。没有新增依赖、迁移或服务端变更。

## 实际验证与当前限制

环境仍为 macOS ARM64、Node 24.18.1、pnpm 11.19.0。

| 命令                             | 结果                                                                 |
| -------------------------------- | -------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | 通过，[记录](install.txt)；锁文件未变化                              |
| `pnpm run typecheck`             | 通过，[记录](typecheck.txt)                                          |
| `pnpm run build`                 | 通过，[记录](build.txt)；原 resvg 跨平台可选依赖追踪诊断不变，exit 0 |
| `pnpm run lint`                  | 通过，[记录](lint.txt)                                               |

本轮浏览器回归在 `e2e/tags.mjs` 保留 SQL/ID/单次写入断言，成功结果改为读取真实 HeroUI success toast，并验证无成功长驻 notice；未知 notice 保持。补充搜索/名称可见图标及手机元信息同一行检查。`e2e/ui-refinement.mjs` 继续验证访问说明点击、键盘、Escape 和返回焦点，并补单层无形变检查。完整更新后标签专项已实际通过，见下方记录。

原 Ego Space 4 已被关闭，不在实际可恢复列表。按 ego-browser 技能，不能用新空间绕过失效空间；用户已明确回复允许新建独立测试空间，实际仅新建 Space 5 并持续复用；空间与测试环境见下方实际记录。另一个临时数据库只读备份当前预览后用于测试，不重置用户正在操作的 57635 预览数据。

独立代码审计与设计还原复核承接 [code-review.md](../code-review.md) 和 [design-review.md](../design-review.md) 的本轮结论；设计评审实际读取 Figma 与本轮截图，最后通知排版补验已取得真实证据，最终结论见该记录。本次 UI 须用户复验，PR 保持草稿。首轮完整 browser 的范围外上传失败和未执行后续场景仍如实保留，不再为此机械重复全量流程。

本轮另取得真实 Toast 键盘失败：关闭按钮 `:focus-visible=true`，但 `opacity=0`，Enter 可关闭却无法看见焦点，[失败记录](access.json)及[截图](green-toast-keyboard-light-1440.png)。只在既有 Toast.CloseButton 补 `focus-visible:pointer-events-auto focus-visible:opacity-100`，不改变通知队列、位置、时长或其他 Provider 内容；最终构建、类型和 lint 已重新执行并通过。[final.json](final.json) 的四组两端浅深色实测已确认可见焦点、44px点击区和 Enter 关闭。独立设计评审随后发现手机关闭按钮覆盖文字（[浅色](final-toast-keyboard-light-390.png)、[深色](final-toast-keyboard-dark-390.png)）；这份功能 passed 不表示视觉通过。最后仅给 Toast.Content 补 `min-w-0 pr-8 wrap-anywhere`，给关闭按钮留出空间并允许长名称自然换行；构建、类型与 lint 已重新通过，[toast-content.json](toast-content.json) 的 390px 浅深色最终补验已通过；50 字符真实标签名称逐行换行，文字不与关闭目标重叠，焦点可见且 Enter 可关闭。

## 本轮浏览器实际记录

| 实际命令                                              | 结果与范围                                                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node work/run-manual-tags-browser.mjs red`           | 成功复现用户反馈，[red.json](red.json)；不是修复后通过                                                                                                                              |
| `node work/run-manual-tags-browser.mjs green`         | 整体失败，[green.json](green.json)；标签两端浅深色增改删与图标/横排已完成，Access 断言将等价单位矩阵误判成形变。改为严格比较六个矩阵系数，未放宽对平移、缩放、旋转的限制            |
| `node work/run-manual-tags-browser.mjs access`        | Access 两端浅深色、相册内容消费通过；末尾 Toast 键盘发现真实透明焦点失败，[access.json](access.json)，未将整体记通过                                                                |
| `node work/run-manual-tags-regression.mjs`            | 完整执行更新后的 `e2e/tags.mjs`，通过：12 项检查、114 个布局、118 张截图，[tags.json](tags-regression/tags.json)                                                                    |
| `node work/run-manual-tags-browser.mjs final`         | 功能通过，四组通知键盘、两组改名输入、纯鼠标私有悬停，[final.json](final.json)；独立视觉复核发现手机通知遮字，保留该历史                                                            |
| `node work/run-manual-tags-browser.mjs toast-content` | 最终手机浅深色通过；真实50字符名称、逐行DOM文字范围不重叠、可见焦点和Enter关闭，[报告](toast-content.json)、[浅色](toast-content-light-390.png)、[深色](toast-content-dark-390.png) |

上述 `work/` 仅为本地驱动与临时配置，不提交密码、数据库或密钥；受维护的浏览器检查在 `e2e/tags.mjs`、`e2e/ui-refinement.mjs`。驱动使用已有 Ego Lite / TaskSpace 5，访问独立 `http://ariso-tags-manual-50953.localhost:50953`，未下载浏览器。测试初始化、响应丢失和错误注入仅用于该临时数据库。此前测试定位中的输入内部高度、Toast alertdialog选择器、hover显现关闭按钮等错误尝试保留在 [attempts](attempts)，不算产品通过或最终失败。

本轮没有服务端、依赖、schema 或上传流程改动，未机械重复首轮已通过的 771 单元与 980 集成。首次全浏览器在旧上传页失败的事实仍保留在上层记录。本轮不声称完整浏览器流程或发布容器验证通过。

完整标签专项在关闭焦点修复后运行，最后文字排版修正仅执行上述两组手机补验，没有重复完整专项。新 `e2e/toast-layout.mjs` 按实际文本逐行 Range 矩形检查表面内显示及关闭目标不重叠，接入标签布局检查，最后短验证调用同一函数并验证实际存在的通知；正常消退后的页面不要求保留已过期通知。定向 `pnpm exec eslint e2e/tags.mjs e2e/toast-layout.mjs --max-warnings=0` 已通过。

原人工预览 `http://ariso-tags-57635.localhost:57635` 只刷新程序，保持相同数据库和运行密钥。刷新前后直接比较标签、关联、图片 SQL 内容完全一致：8 个标签、458 个关联、173 张图片；用户已删除的 Go 未恢复。独立测试预览位于50953；Space 5 最终保留 p1供复验。没有操作用户正在使用的应用内浏览器。

独立代码审计最终 Critical 0 / Required 0；独立设计评审实际回读 Figma 与最终页面，四项用户反馈及本轮通知焦点/遮挡修复均通过，没有剩余本次必修。用户再次人工验收仍待完成，PR #226 保持草稿。

最终执行 `pnpm run format:check` 和 `node docs/tasks/check.mjs` 的结果分别见 [格式记录](format.txt) 与 [文档记录](doc-check.txt)。
