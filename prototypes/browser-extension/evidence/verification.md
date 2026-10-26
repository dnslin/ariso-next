# 浏览器插件原型验证

- 日期：2026-10-25。
- 范围：独立网页原型和任务文档；正式浏览器扩展、capabilities 接口和真实上传尚未实现。
- 环境：macOS、Node `24.18.1`、pnpm `11.19.0`、仓库既有 Next.js `16.4.1`／React／HeroUI／Tailwind 依赖。
- 基础 revision：`c018b93c482349be70413fa870990fc2ac7321fe`。本轮原型和任务文件尚未提交，仓库还有其他工作的未提交修改；revision 不代表这些新增文件。
- 入口：`http://127.0.0.1:3176/` 与 `http://127.0.0.1:3176/?view=web`。最终使用独立构建后的 `start` 服务供评审。

## 实际命令与结果

以下命令从仓库根目录执行，并在 PATH 首位使用 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。

| 命令                                                                                                                                                                         | 结果                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm --dir prototypes/browser-extension typecheck`                                                                                                                          | 通过；生成原型自身路由类型，再运行 TypeScript                      |
| `pnpm exec eslint prototypes/browser-extension/app prototypes/browser-extension/tests --max-warnings=0`                                                                      | 通过；没有关闭规则或增加忽略来消除错误                             |
| `pnpm --dir prototypes/browser-extension test`                                                                                                                               | 4 项通过：默认版本 URL、显式原图、Markdown 名称转义、HTML 属性转义 |
| `pnpm --dir prototypes/browser-extension build`                                                                                                                              | 通过；webpack 独立生产构建及类型检查完成                           |
| `pnpm --dir prototypes/browser-extension dev`                                                                                                                                | 已实际运行并用于主要交互验证；构建前已停止                         |
| `pnpm --dir prototypes/browser-extension start`                                                                                                                              | 实际启动成功；构建后 `/` 与 `/?view=web` 可操作，HTTP 返回 200     |
| `pnpm exec prettier docs/specs/SPEC-browser-extension.md prototypes/browser-extension/README.md prototypes/browser-extension/app prototypes/browser-extension/tests --write` | 已格式化；最终文档与配置另行执行 check                             |
| `git diff --check -- docs/specs/SPEC-browser-extension.md prototypes/browser-extension tasks/browser-extension`                                                              | 通过；新增文件同时单独做格式与本地链接检查                         |

没有新增依赖，因此未重跑仓库冻结安装；没有运行与本原型无关的整套主应用测试、集成、媒体工具或容器检查。本机没有启动 Docker／Colima。

## 浏览器操作

使用 Codex 应用内 Chromium 浏览器。操作记录见 [browser-checks.json](./browser-checks.json)，最终 **26 项检查通过**。这些是页面交互和布局检查，不是 26 项真实扩展或后端验收。

- 正常多图进入队列，分别经历传输、等待处理和完成；网页右键、来源授权后加入同一队列。
- 通过真实文件选择器加入仓库示例图片，显示真实文件名、文件大小和本机预览，再完成计时演示。
- 空 Token 校验、演示连接保存、取消保留已保存地址、失效 Token 阻止新上传。
- 重复单独显示未新增；版本不可用保留已保存结果，显式选择已有原图后才成为可复制结果。
- 来源拒绝不进入上传队列；上传失败、结果未知、主动停止和私有保存分别展示对应状态。
- 在浏览器中发送带真实 PNG 内容的合成 ClipboardEvent／DragEvent，验证页面粘贴和拖入处理，不把合成事件当成系统输入实测。
- 对复制 API 注入一次拒绝故障，验证完整可选文本回退，随后移除注入；最终页面已经重新加载，没有保留测试覆盖。
- 检查 360／390／430／768／1440 宽度，没有横向溢出；检查 390×600 短视口连接弹窗、深浅主题、44px 点击高度、Esc 关闭及焦点恢复。
- 长文件名保留完整 title 且不撑破 360px 布局；长站点地址在 768px 下不横向溢出。
- 最终构建页面没有控制台警告或错误。初版 Modal 组合导致的 PressResponder 警告已改为现有项目使用的独立 `Modal.Backdrop` 方式。

截图：

| 状态                 | 证据                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------ |
| 最终工作台／浅色桌面 | [1440px](./workspace-light-1440.png)                                                       |
| 多图结果             | [结果区](./upload-results-desktop.png)                                                     |
| 网页右键菜单         | [桌面](./web-context-menu-desktop-1440.png)、[窄窗口](./web-context-menu-narrow.png)       |
| 连接设置             | [桌面](./connection-desktop-1440.png)、[390×600 深色](./connection-short-dark-390x600.png) |
| 深浅窄窗口           | [390px 浅色](./upload-narrow-light-390.png)、[390px 深色](./upload-narrow-dark-390.png)    |
| 重复／来源错误       | [重复](./duplicate-desktop-1440.png)、[来源获取失败](./source-error-desktop-1440.png)      |

桌面／窄窗口与主题的组合均已查看实际画面。设计沿用现有 Ariso 字体、颜色、HeroUI 控件和 Lucide 图标；本轮未建立或修改 Figma，也不把网页原型称为正式产品的 Figma 还原验收。

## 未验证与工具边界

- 原生系统图片剪贴板：工具写入 PNG 并发送粘贴快捷键后，页面未收到图片，未将这次尝试计为通过。页面 ClipboardEvent 处理通过，系统剪贴板端到端仍待正式扩展阶段验收。
- 物理文件拖入：验证了实际文件选择器与合成拖入事件，没有用桌面鼠标拖动文件。
- 系统剪贴板复制回读：页面复制 API 返回成功，但工具回读文本为空，不能据此证明系统剪贴板内容正确。文本输出有 4 项单元测试，复制拒绝时的手动回退已实际操作。
- 未安装真实 Chrome／Edge 扩展，未验证原生右键注册、真实域名权限和扩展后台生命周期；没有携带真实 Token 或连接真实 Ariso。
- 没有验证真实网络上传、S3、重复检测后端或私有资源访问；这些由后续开发任务验证。
- 没有真实手机触控或物理键盘设备验收，没有进行用户可用性测试；具体界面等待用户反馈。

Ego Lite 的截图请求曾超时，后续画面与交互证据来自应用内浏览器。开发服务切换到构建服务时旧页面曾进入连接错误页；新页面连接构建服务成功。以上工具／服务切换情况没有记为产品功能通过，也没有为了检查更新浏览器工具或改动用户的系统设置。
