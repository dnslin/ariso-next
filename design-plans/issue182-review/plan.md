# Issue #182 SMTP 局部交互原型

原型地址：`http://127.0.0.1:3182/design-plans/issue182-review/index.html`。

仅演示交互，不读取持久配置、不保存设置、不发送邮件。桌面 1440×1080 与手机 390×844 使用独立视口，支持浅深色。真实产品验收、发送验证与独立设计评审仍由任务统一证据记录。

## 设计来源与推荐变化

实际读取 Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的设计上下文与截图：主表单 `34:710/99:786`，保存成功 `218:3194`，保存失败 `218:3200/218:3223`，清除确认 `219:2515/219:2541`，SMTP 接受 `219:2451`，连接失败 `219:2457/219:2437`，发送未知 `219:2485/219:2507`，保存中 `218:3189`。

- 主表单业务布局继续沿两端来源；公共区域沿当前项目外壳与分类，不复现旧“工作空间”面包屑和未交付的基本设置分类。
- 保存与清除已确认成功留在原页，用中性 Toast；测试已接受使用“SMTP 已接受测试邮件”，说明接受不保证最终送达。
- 清除确认按 `docs/design/handoff.md` 当前短对话框规则提供右上关闭、左取消与右确认。清除仅处理已保存凭据，不提交其他编辑。
- 未保存编辑测试前明确选择“测试已保存配置”；取消保留输入。
- 保存与清除响应未知时保留输入并先只读核对。核对失败保持待核对状态；公开字段一致仅表达当前配置符合输入；不一致允许保留输入继续编辑或从当前配置重新编辑。
- 密码替换响应未知不能由 `hasPassword` 证明替换。公开配置核对后仍明确密码变更无法确认，由用户从当前配置重新编辑、重新输入密码，再主动保存。没有新增秘密标记、密码哈希或接口契约。
- 清除后可凭当前用户名为空且 `hasPassword=false` 说明当前凭据已经清空。发送结果未知保留对话框、先检查邮箱说明和用户主动重新测试入口，不自动发送。

2026-10-08，所有者明确回复“OK 就按照这个去实施”，批准反馈版整版原型。随后实施产品页面并同步 Figma；实际结果以 Issue #182 统一记录为准。

## 实际构成与离线检查

读取 using-agent-skills、frontend-ui-engineering、vercel-react-best-practices、figma-use 和 figma-design-to-code。控件使用项目现有 HeroUI 3.2.6 的 Button、Input、TextField、Select、Modal、Popover 和 Toast；图标来自 Lucide，字体使用项目本地 Caveat 与 Noto Sans SC。布局使用已安装 Tailwind 和当前公共外壳样式。

以 Node 24.18.1 与项目现有依赖生成浏览器资源。构建成功；`node --check out/issue182-review/surface.js` 通过；原型页面与本地字体请求 HTTP 200。未自行启动浏览器，真实视口检查由主 agent 使用已有 Ego Lite 任务空间完成。静态生成不能替代运行与设计验收。

原型源保留为 `prototype.tsx.txt`，生成的 CSS/JS 位于现有忽略目录 `out/issue182-review`。这些资源不是产品模块，不改变默认测试入口；本地预览服务仍从工作树根目录提供原型。

手机浏览器初检发现次要按钮文字呈金色。实际来源为 HeroUI 3.2.6 的 `button--secondary` 使用 `--accent-soft-foreground`。已在本原型全部次要按钮显式使用 `text-foreground`，沿当前浅色深靛蓝与深色亮文字，不修改公共主题；修正后真实页面复核由主 agent 执行。

真实浏览器初检又发现业务对话框动态标题沿用了初始分支。已沿项目 `copy-dialog.tsx` 的现有受控模式，将业务对话框直接由 `Modal.Backdrop` 的 `isOpen/onOpenChange` 控制，并使用 `CloseButton` 显式关闭，避免 `DialogTrigger` 子节点集合缓存初始内容。修正后的清除、未保存测试和发送未知分别需要主 agent 复核。

主 agent 继续定位到同源的无关消息也会触发原型重置。原型控制消息改为明确的 `type: smtp-prototype`；页面仅处理该类型且含字符串状态的消息。没有增加其他消息机制。原子页演示不再被其他同源消息清空；主 agent 保持预览服务并完成真实复核。

## 2026-10-08 最新反馈原型

按用户箭头反馈，将清除用户名与密码的短按钮、独立说明入口从表单底部移到业务卡片头部。桌面标题和保存摘要在左，清除/说明在右；手机标题摘要保持原层级，操作另起一行右对齐，点击目标至少44px。旧底部入口和占位完全移除；待核对时清除禁用，无凭据时隐藏。公共外壳未改。

卡片Mail20；字段外标签采用Server/Hash/ShieldCheck/UserRound/Badge/Mail/KeyRound16；清除Eraser16、测试Send16、保存Save16。所有新增图标来自Lucide并设aria-hidden，字段文字标签保留。原型与资源URL加 `v=feedback1`；保留现有原型的确认、通知、只读核对与测试已保存配置语义。所有者随后明确批准整版原型；本轮新布局与交互已进入产品实施和 Figma 同步。

实际重新生成命令：`/Users/dnslin/.nvm/versions/node/v24.18.1/bin/node /tmp/issue182-build-prototype.mjs`。生成器使用主仓库已有HeroUI/Tailwind/esbuild依赖，输入本目录 `prototype.tsx.txt` 与公共样式，输出 `out/issue182-review/surface.js`、`surface.css`。真实浏览器复核仍由主agent在既有Ego空间执行。
