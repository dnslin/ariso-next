# 首页居中登录入口 · 2026-10-23

用户选定[居中主按钮原型](./approved-prototype.png)，并明确授权实施和同步 Figma。本轮只改变首页入口的视觉样式；站点品牌、描述、初始化与登录目标继续来自现有数据和逻辑。

## 实施

- `src/app/page.tsx`：沿用 HeroUI Link 的导航语义，复用 `buttonVariants`；入口至少 112×44px、全圆角，标语下方 32px。浅色为深靛蓝按钮，深色反向使用 foreground/background，保持清晰对比。
- 尺寸、间距和颜色只使用 Tailwind 与现有主题变量。手机公共 `.link` 最小宽度是未分层 CSS，因此本入口采用 `min-w-28!` 明确覆盖；不修改公共规则。
- `e2e/site-branding-consumers.mjs`：在原有品牌消费场景中检查真实入口的尺寸、居中、间距、圆角、可见性和无横向溢出；覆盖自定义 Logo 和空描述。
- 不新增客户端状态、依赖或认证请求。未初始化入口仍显示“开始初始化”，前往 `/setup`。

## Figma 同步

- [桌面首页 2:10](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=2-10)：复用现有 Button/Primary 实例 `3:45`，点击前往登录画板 `2:11`。
- [手机首页 102:3000](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3000)：复用现有按钮实例 `102:3013`，点击前往 `102:3020`。
- 将旧双按钮、角落登录和旧底部说明替换为单一登录入口；保留现有背景、字标和手绘下划线。使用自动布局和已有 foreground/background 变量，深浅模式共用同一画板。
- [节点与变量记录](./figma.json)。两张首页各有 3 个可编辑文本、2 个组件实例；未导入完整页面位图。

## 实际检查

环境：Node 24.18.1、pnpm 11.19.0；包管理器通过任务临时启动器固定版本，没有更改项目工具配置。

| 实际命令或检查                                                                                                                                | 结果                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`、`pnpm --dir integrations/picgo install --frozen-lockfile`                                                   | 通过                                                           |
| `pnpm run lint`                                                                                                                               | 通过                                                           |
| `pnpm run typecheck`                                                                                                                          | 通过                                                           |
| `pnpm run test:unit`                                                                                                                          | 通过，主项目 246 个文件、2731 项；独立 PicGo 测试也通过        |
| `pnpm run build`                                                                                                                              | 通过，包含 Standalone 打包和原生模块检查                       |
| `pnpm exec vitest run --project integration tests/integration/shell/home.test.ts`                                                             | 通过，3 项                                                     |
| `EGO_TASK_SPACE=3 BROWSER_REPORT_DIR=test-results/home-login-20261023 node scripts/verify-browser.mjs --suite site-branding --only consumers` | 通过，包含品牌消费、首页新增布局断言和重启检查                 |
| `ego-browser nodejs`：真实生产页面尺寸、主题与键盘操作                                                                                        | 通过，7 种视口 × 深浅主题，详见 [browser.json](./browser.json) |
| Prettier 与 `git diff --check`                                                                                                                | 通过                                                           |

首次构建因本机嵌套命令调用了错误 pnpm 版本而中断；固定版本后通过。首次浏览器布局检查发现手机入口只有 76px 宽；修正样式后，原断言保持不变并通过。键盘焦点使用 HeroUI 的双层 box-shadow，已核实可见焦点环和 Enter 前往真实 `/login`，而非仅检查 outline 属性。

## 页面与设计对照

| 项目               | Figma                       | 实际页面                          | 结论                                                           |
| ------------------ | --------------------------- | --------------------------------- | -------------------------------------------------------------- |
| 桌面 1920×960 浅色 | [设计](./figma-desktop.png) | [页面](./home-1920x960-light.png) | 字标、标语、入口居中、112×44 尺寸和 32px 间距一致              |
| 手机 390×844 浅色  | [设计](./figma-mobile.png)  | [页面](./home-390x844-light.png)  | 字标、标语和入口位置一致；保留产品原有低对比度点阵             |
| 手机深色           | 已绑定原有 Dark 模式变量    | [页面](./home-390x844-dark.png)   | 按钮使用浅色 foreground 底及深色 background 字，尺寸与间距不变 |
| 键盘               | 复用公共焦点规范            | [焦点](./home-keyboard-focus.png) | Tab 可达，有可见焦点环，Enter 正确导航                         |

另覆盖 1440×1080、768×1024、430×932、360×780、390×560；全部无横向或纵向溢出，入口可见。自定义 Logo、空描述及重启结果见[品牌检查摘要](./branding-summary.json)。Figma 手机原有点阵分布与产品不同，本轮没有调整公共背景母版；这不影响新增入口的布局对照。

本轮未执行全量集成、容器、发布或线上部署；未新增真实设备验收要求。截图对照与浏览器通过不代替用户最终人工验收。
