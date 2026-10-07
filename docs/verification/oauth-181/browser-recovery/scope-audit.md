# 浏览器恢复后的失败范围审计

2026-10-07，只读独立审计。审计基线为 `8aa335d118cab7d21f8823d984e03cefd82b9859`，对照已获取的 `origin/main` `031b1e7799d55bb05d50c581578412854a27332d`。用户已确认 UI 人工验收，并授权父 agent 恢复浏览器；初次核对时父 agent 正在 TaskSpace 6 运行默认流程。本评审者没有控制浏览器、重跑检查、修改产品或测试，也没有读取私有凭证文件。

本记录只判断已产生报告的失败来源与修改范围。默认流程当时仍在运行，不由已产生的子报告推定整体完成或通过。

## Token 桌面：范围外路径上的失败

实际读取 `test-results/issue181-browser-resumed/tokens-1440.json`，该次子报告结束时间为 `2026-10-07T10:56:25.566Z`，状态 `failed`，场景 `once-only-key`。错误在 `e2e/tokens-behavior.mjs:194`：

| 值                 | 期望     | 实际     |
| ------------------ | -------- | -------- |
| selectionStart     | 40       | 40       |
| selectionEnd       | 50       | 50       |
| selectionDirection | backward | backward |
| input.scrollLeft   | 100      | 0        |

这次失败只显示输入框内部横向滚动丢失，不能写成选区内容丢失、复制值错误或整个页面滚动改变。报告已有浅色、深色两张复制成功截图及两条对应布局记录；顺序执行的真实 Clipboard 写入次数、系统剪贴板完整值、页面上的完整值与来源页面/外层滚动断言均先于失败断言，已执行至该检查点。拒绝权限、手动复制及后续生命周期未到达；`clipboard`、`business` 完成条目为空，最终浏览器错误收集也未到达，不能把整个 Token suite 记为通过。

实际调用链为：`tokens.mjs` → `verifyTokensCreates` → `clipboardRound` → `ui.copyEvidence` → `screenshot` → 截图之后的几何读取 → 最终选区/横向滚动比较。

`clipboardRound` 在循环开始前只取一次 40–50 backward / scrollLeft=100 基准。每轮又包含关闭旧通知、切换主题、鼠标或键盘聚焦复制操作。`copyEvidence` 在每次复制前取独立状态，并在截图遮蔽前比较复制后的真实状态。`screenshot` 本身会临时改写 `input.value` 为圆点，设置选区和横向位置，截图后再次写回值、设置选区和横向位置。最后的报错同时包含这些操作之后的结果，没有逐步状态证据将责任限定到产品复制、通知聚焦、主题切换或值遮蔽后的原生浏览器滚动。因此准确结论是该完整链结束后的横向滚动不一致，不能直接声称 `TokenSecret.copy()` 已被证明有缺陷，也不能反过来声称一定只是截图工具问题。

实际对比 `origin/main`：`token-secret.tsx`、`token-use-create.ts`、`token-create-dialog.tsx`、`tokens-page.tsx`、`tokens-behavior.mjs`、`tokens-page.mjs` 和通用 `browser-geometry.mjs` 没有差异。Token API Key 插件配置与上述复制链没有在本 Issue 改变。本次共享分类修正只删除 `.settings-desktop` 内的 Tabs Indicator 及其背景规则，并给 Tab 选中态直接设置背景；相关选择器不作用于 Token 弹窗输入，没有改变 Token 选区捕获、复制、恢复或证据遮蔽代码。

**范围结论：现有 Token/证据链上的范围外失败，没有证据表明由 Issue #181 的共享分类修正引起。** 没有运行 main 的对照浏览器流程，因此“main 也在本环境复现”保持未验证，不把源代码一致冒充运行结果。建议向 Token 对应任务报告该失败及上述定位边界；本次不修改 Token 产品、遮蔽辅助函数或断言，不以跳过/放宽断言把默认流程改成通过。

## OAuth 桌面 before：本次测试缺少核对终态屏障

实际读取 `test-results/issue181-browser-resumed/oauth-1440-before.json`，该次子报告结束时间为 `2026-10-07T10:56:44.057Z`，状态 `failed`，场景 `configuration`，错误为等待 `[data-testid="oauth-page"]` 超过 10 秒。原生回调复制及权限拒绝后完整手动文本的检查已记录；保存、重启、绑定、登录的完整生命周期尚未完成，`realGithubOAuth` 保持 `unverified`。

实际查看最终 `oauth-1440-before-failure-1440.png`：配置弹窗仍保留 `browser-oauth-error` 旧草稿、HTTP 500 错误与 `oauth-verified-summary`，没有显示一次成功关闭后新建的空密钥编辑器。不能只因错误字符串没有打印 `state:'hidden'` 就认定错误一定发生在重新打开；`ui.open` 和 `ui.close` 都等待同一个选择器，报告没有给出足够细的调用位置。

代码提供了确定的测试时序缺口：

- `use-github-settings-editor.ts:155–160` 对 HTTP 500 先设置错误反馈，再异步 GET 核对实际配置；`readCurrentSettings` 在 92–100 行经历 checking → verified。
- 同一提交在 133 行置 `inFlight=true`，到 163 行才清除；`close` 的 88–89 行明确禁止在该操作尚未结束时关闭。配置弹窗的 Escape/关闭禁用也沿用这个忙碌状态。
- `oauth-settings.mjs:298–313` 只等 HTTP 500 文字，就断言草稿、采集截图并调用 Escape 关闭，没有等待该真实 GET 核对到终态。最后图片仍为同一旧草稿的 verified 弹窗，与过早关闭请求被禁止的时序相符。

**Required，本次测试应修正：** 在注入真实 SQLite 500 的场景中等待 `[data-testid="oauth-page"][data-state="verified"]`，核对实际读回的公开 saved/effective 快照、草稿保留与不能盲目再次提交，随后再执行关闭、焦点恢复和重新打开。等待核对终态是加强场景契约，不应取消产品在 saving/checking 中禁止关闭的规则，也不应把 HTTP 500 改成可直接重写的普通编辑状态。原有输入保留、实际持久数据与请求次数断言继续保留。

目前未取得每个键盘事件的相位采样，不能把“过早 Escape”说成唯一已运行证明的根因；也没有独立证据证明 Ego 的 hidden 等待存在缺陷。应先补确定缺失的终态屏障，再由父 agent 重跑受影响的 OAuth 场景确认。未完成复验前，当前失败结果继续保留，不提前宣布产品已修复或 OAuth 浏览器已完成。

## 图库大图：范围外的像素一致性失败

随后实际读取 `test-results/issue181-browser-resumed/library-viewer.json`：状态 `failed`，阶段 `refresh:failed-preview-replacement`，定位 `e2e/library-viewer-refresh.mjs:290`。场景先对原本不可读的压缩预览执行真实重处理，等待成功任务对应的详情刷新及当前图片自然解码，再将当前 `<img>` 与独立 GET Blob 后解码的 `new Image` 分别缩到 32×32 Canvas，严格比较完整 RGBA 数组。报告可见多处 1 级色通道差异，例如 10/11、2/1 和 226 附近的值；未保存独立字节/解码路径逐步证据，不能只凭这些差异认定旧像素、错误发布或一定是色彩/缩放误差。

实际对比 `origin/main`，图库 viewer 组件、library/media/delivery 服务、`library-viewer-refresh` 场景与相关夹具均没有差异；Issue #181 的 `.settings-desktop` 分类选择器不作用于大图或 Canvas。本次没有修改压缩、图片解码、预览刷新或像素比较逻辑。**范围结论：现有图库大图路径上的范围外失败，没有本次改动引入的证据。** 没有运行 main 对照，根因仍未证明；当前失败完整保留，不改产品、不跳过或放宽严格像素断言。对应刷新阶段后续的轮询归属、过期会话检查未到达，不把此前已记录的其他大图行为替代该 suite 全量通过。

## 相册封面：范围外的会话观察前置条件失败

实际读取 `test-results/issue181-browser-resumed/album-cover.json`：状态 `failed`，阶段为 `picker session expiry preserves filtered return destination`，错误为 `page.waitForFunction` 超过 10 秒。最后 URL 仍是 `/albums/issue180-main?q=issue180-041&visibility=public&pageSize=20`。实际查看 `album-cover-failure.png`，封面选择工作区及候选、分页已绘制；它没有显示登录页。报告没有记录会话计数器，`failureState.text` 又截取到页面前置脚本，不能据此判断每个谓词实际值。

该阶段先加载带筛选的相册内容，再安装 `/api/auth/get-session` 的 fetch 观察器，打开 picker，并等待观察器在打开后记录一次已完成的非空会话响应。只有这些等待通过，才会执行真实 `DELETE FROM session`、触发 focus 核对、等待登录页和比较完整 `returnTo`。错误日志没有展开具体等待调用；`picker()` 也会等待 DOM 中不存在 `library-loading`，截图没有保存隐藏主内容的 DOM 状态，因此不能将最后显示的阶段名直接当成“过期重定向丢失筛选”已得到证明。

源码提供了可确定的旧测试假设缺口：当前 `AlbumsScreen` → `AlbumCoverPicker.renderWorkspace` → `LibraryScreen` 复用同一个 `OwnerShell`，打开 picker 只切换 workspace。`LibraryScreen` 的 `returnTo` 和 `expireSession` 依赖不因该操作改变。`useOwnerSession` 在初次挂载、60 秒定时器或 focus/visibility 事件发起检查；测试观察器安装在内容已经加载之后，在正会话等待前没有显式触发新 focus。因此新 GET 的前置谓词没有一个确定的触发动作。场景中“隐藏内容和活动 picker 各有 OwnerShell”的注释也与现有单一 Shell 结构不符。后续处理宜记录实际 counters 与加载状态，并通过真实 focus 驱动正会话观察后再删除会话；这里没有执行这些操作或修改测试。

实际对比 `origin/main`：`src/app/albums`、`LibraryScreen`、`OwnerShell`、`session-controls` 及 `album-cover.mjs` 均没有差异。本次分类样式没有作用于封面 picker 或会话检查。**范围结论：现有相册封面验证路径上的范围外失败，没有本次改动引入的证据。** 尚未证明运行根因或 main 的同环境复现，不修改产品、测试或断言。该次会话过期及后续匿名上传入口检查保持未完成；之前记录的封面行为与布局不能替代该 suite 全量通过。

## 匿名分享密码页：范围外的短视口滚动状态失败

实际读取 `test-results/issue181-browser-resumed/sharing-public.json`：状态 `failed`，阶段 `gate-and-representatives`，失败定位 `sharing-public-layouts.mjs:377`，断言为 `The short password page actually scrolls`。报告记录 390×420 浅色状态，最终 `scroll=0`，主按钮 `top=438`、`bottom=486`，视口高度 420；实际 `sharing-public-password-scroll-failure-light-390x420.png` 也停在密码输入框，主按钮位于视口外。因此不是“内容高度没有溢出，不需要滚动”，不能据此移除正滚动要求。

本次按实际调用链审查：`/s/[token]` → `PublicShell(layout="share")` → `ShareScreen` → `ShareGate` → `SharePasswordForm`。该表单直接使用 HeroUI 的 Form/TextField/InputGroup/Button，访问说明使用图库的 `DetailTip`。它不消费本次变更的 `LoginForm`、`IdentityField`、账号设置或 OAuth 编辑器。分享壳虽然与登录共用 `PublicShell`，但 share 的实际 `public-content--share`/block/padding 类与登录的 `public-content--login` 独立；RootLayout、Providers、PublicShell、公共 public 样式、DetailTip 和表单链没有本次差异。`globals.css` 唯一差异删除 `.settings-desktop .tabs__indicator` 背景，不匹配这条无 settings 祖先的匿名分享路径。已安装 HeroUI、React、Next 和 Tailwind 版本未在本 Issue 改变。

测试在发送真实 wheel 后先用 `waitForFunction` 要求 `scroll>0` 且主按钮完整进入视口，再调用 `waitForSharingScrollStable`。后者仅观察 scrollingElement/main/share-scroll 的坐标至连续 4 帧稳定，不主动修改滚动；最终重新读取的结果却为 scroll=0、按钮仍在视口外。准确证据是稳定步骤之后状态不再满足先前谓词，不足以确定是焦点/布局恢复、浏览器事件时序、等待语义或产品行为导致。没有逐帧坐标、焦点和实际滚动高度证据，不能声称产品完全不能滚动或给出唯一根因。

实际对比 `origin/main`，分享页面/组件、公共 Shell/Providers/RootLayout、DetailTip、`sharing-public-layouts`、`sharing-public-feedback` 和共用几何辅助函数无差异。**范围结论：现有匿名分享验证路径上的范围外失败，没有本次改动引入的证据。** 没有执行 main 同环境对照；不修改或放宽断言。后续完整密码验证、公开访问代表状态等未在这次子报告完成，前面的 gate 与访问说明检查不能替代该 suite 全量通过。

## 后续状态

初次范围记录形成时默认流程仍在推进。随后实际读取 `issue181-browser-resumed/runner.json`：默认 full 已于 `2026-10-07T11:21:49.873Z` 终结，共 68 阶段，55 passed / 7 failed / 6 blocked，整体 failed。两端 OAuth before 失败阻塞了各自 after/enable-restart/enabled，其他失败保留原报告，不能把定向结果改写成默认全量通过。

OAuth 自有测试的核对终态屏障已由父 agent 在源码修正，并保留默认两端 RED；首轮定向流程又暴露导航前应用主题的启动页依赖，已据实际调用链修正。增量评审及复验状态见 [浏览器恢复代码复审](code-review.md)。Token 横向滚动、图库大图像素一致性、相册封面会话观察前置条件与匿名分享短视口滚动失败仍按范围外问题报告。[Issue #181 统一记录](../README.md) 汇总最终交付状态。真实 GitHub 授权及登录不能由夹具绑定、部分浏览器检查或用户 UI 人工验收代替。
