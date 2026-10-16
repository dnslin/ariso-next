# Safari 表单宽度修复与双浏览器验证

日期：2026-10-16。分支：`codex/safari-form-sizing`。修复基于 `0a6382ad0ea350d03f524a14a4ca4e4d34f75b52`。

## 修改

只在四处 HeroUI TextField 根节点添加 Tailwind `min-w-0`，允许字段按所在 Grid 的可用宽度收缩：

- `src/components/identity/identity-field.tsx`：共用登录、初始化、找回、重置、修改邮箱及密码字段。
- `src/components/sharing/password-form.tsx`：分享密码字段。
- `src/app/tags/dialog.tsx`：标签新建和重命名字段。
- `src/components/identity/token-create-form.tsx`：上传 Token 名称字段。

没有增加浏览器判断、全局样式、裁切规则、依赖或业务行为。没有改变字号、颜色、间距、按钮顺序和现有弹窗尺寸。

原问题中，最内层 input 已有允许收缩的样式，但 TextField 外层仍将固有宽度传给 Grid。390px 账号弹窗的表单可用宽度为 316px，修复前内容宽 455px；只检查整页是否横向滚动无法发现内部裁切。

## 回归检查

`e2e/browser-geometry.mjs` 新增可见表单的内容边界检查，供已接入 `scripts/verify-browser.mjs` 的账号、Token、标签、密码恢复等既有场景复用。输入框内部文字滚动不会被当作表单布局溢出。

`tests/unit/runtime/browser-geometry.test.ts` 增加“整页和主区正常，但表单内容被裁切时必须拒绝”的回归用例。

先在旧生产构建的真实 Safari 运行新增断言。768px 登录页按预期失败：表单宽 414px、内容宽 455px。重新构建并启动修复版本后，同一断言通过。证据：[修复前](../../../.data/safari-fix/evidence/red-login-768.json)、[修复后](../../../.data/safari-fix/evidence/green-login-768.json)。

## 真实浏览器验证

使用新生产构建和隔离数据，未发布线上：

- Safari 26.6.2，系统 SafariDriver。
- Chrome 154，Ego Chromium。
- 360、390、430、768、840、1440px，实际视口宽度与指定宽度一致。
- 每种宽度覆盖浅色、深色；另测 390×400 的短视口。

两种浏览器各完成 **144 个主要组合**，全部通过，无页面、主区或表单内容溢出，适用控件尺寸通过既有验收断言。

| 受影响页面／弹窗 | 验证内容                                                |
| ---------------- | ------------------------------------------------------- |
| 登录             | 默认、空值错误、所有宽度与主题                          |
| 初始化           | 首步、空值错误、第二步公开地址和时区；未提交初始化      |
| 找回密码         | 实际邮件已配置的输入表单、邮箱错误；未发送邮件          |
| 重置密码         | 有效测试链接的实际表单、密码错误；未提交改密            |
| 分享密码         | 实际密码门页、空密码错误；未解锁                        |
| 修改邮箱、密码   | 两个弹窗、字段错误、密码显隐、关闭后焦点回到入口        |
| 新建标签         | 默认和名称错误，输入与操作均在弹窗边界内                |
| 创建 Token       | 默认、指定时间、日期弹出层、名称/日期错误；未创建 Token |
| 短视口           | 密码弹窗错误状态，保存操作可聚焦并滚动到可见区域        |

两种浏览器各补测 4 个标签重命名和长邮箱输入组合，浅深色分别通过。测试标签仅通过隔离环境的正式 API 创建。长输入保留输入框内部滚动，未撑大表单。证据：[Safari 补测](../../../.data/safari-fix/evidence/safari-extra.json)、[Chrome 补测](../../../.data/safari-fix/evidence/chrome-extra.json)。

主要矩阵：[Safari](../../../.data/safari-fix/safari/results.json)、[Chrome](../../../.data/safari-fix/chrome/results.json)。主题和实际视口均逐次断言。Chrome 最终收集的运行时/资源错误为空。Safari 验证页面渲染、真实控件操作和尺寸，不冒充完整控制台日志审计。

Safari 窄窗口的原生点击指令在本机出现未触发控件的工具行为，复测使用真实 WebDriver 键盘操作和焦点导航打开弹窗、切换单选项。等待弹窗动画结束及关闭后焦点恢复后再取样；未通过修改页面 DOM 来伪造状态。

## 设计对照

遵守 [设计交付规范](../../design/handoff.md) 的公共认证页、外置标签、手机弹窗、主题及操作可达性约定。复用原有 HeroUI TextField / InputGroup / Button / Modal / DatePicker，未新增自定义控件。

本轮修复恢复 Safari 与同尺寸正常 Chrome 页面的一致性，不改变既定 Figma 页面或状态节点，也不重新审核此前已确认的产品设计。已查看实际截图，确认公共背景、标题、说明、输入、错误提示、按钮、图标和操作顺序保持原设计。

沿用设计交接文档登记的主节点（桌面／手机）：初始化 `184:764 / 184:1774`、登录 `2:11 / 102:3020`、找回 `11:23 / 102:3100`、重置 `172:749 / 172:750`、标签 `30:661 / 101:1295`、账号 `34:462 / 102:1713`、上传 API `34:586 / 102:1837`。本轮没有重新读取 Figma 画布，不把兼容性修复验证冒充全量设计验收。

关键修复截图：

- 登录：[Safari](../../../.data/safari-fix/safari/login-390-light-normal.png)、[Chrome](../../../.data/safari-fix/chrome/login-390-light-normal.png)。
- Token：[Safari](../../../.data/safari-fix/safari/token-create-390-light-normal.png)、[Chrome](../../../.data/safari-fix/chrome/token-create-390-light-normal.png)。
- 深色账号：[Safari](../../../.data/safari-fix/safari/account-email-390-dark-normal.png)、[Chrome](../../../.data/safari-fix/chrome/account-email-390-dark-normal.png)。
- 标签错误：[Safari](../../../.data/safari-fix/safari/tag-create-390-light-error.png)、[Chrome](../../../.data/safari-fix/chrome/tag-create-390-light-error.png)。

## 命令与结果

均使用 Node 24.18.1、pnpm 11.19.0。

| 实际执行                                                                                       | 结果                                     |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `pnpm install --frozen-lockfile`                                                               | 通过，锁文件无改动                       |
| `pnpm run build`                                                                               | 退出码 0，生产构建与 standalone 打包完成 |
| `pnpm run typecheck`                                                                           | 通过                                     |
| `pnpm run lint`                                                                                | 通过                                     |
| 修改的六个源码/测试文件 `pnpm exec prettier … --check`                                         | 通过                                     |
| `pnpm run test:unit`                                                                           | 198 个文件、2420 项通过                  |
| 聚焦集成：setup、account、tokens、tag-management                                               | 4 个文件、60 项通过                      |
| `pnpm exec vitest run --project integration tests/integration/identity/password-reset.test.ts` | 1 个文件、17 项通过                      |
| `node .data/safari-fix/safari.mjs`                                                             | 144 个主要组合通过                       |
| `ego-browser nodejs < .data/safari-fix/chrome.mjs`                                             | 144 个主要组合通过，运行时/资源错误为空  |
| `git diff --check`                                                                             | 通过                                     |

全库 `pnpm run format:check` 未通过：56 个既有未跟踪审查材料存在格式问题，位于 `design-plans/`，未批量重排这些材料。修改源码与测试的格式检查单独通过。

构建依赖追踪输出 Better Auth 可选 OpenTelemetry 依赖缺失提示，但构建退出码为 0。已核对该依赖在安装包中为 optional peer，加载实现会使用库自带 no-op。独立服务健康、真实登录和本次页面验证正常；未为消除追踪提示增加依赖。

独立只读评审未发现问题。本轮未运行其他模块的全量浏览器/媒体集成测试，未声称 iPhone/iPad 实机或旧版 Safari 已验证。原审查和本次验证数据保留，生产部署没有改动。
