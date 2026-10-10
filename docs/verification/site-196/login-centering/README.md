# Issue #196 登录卡片居中返修

**后续修订：** 用户随后要求移除登录上方Logo与站点名称，并收紧“忘记密码”的悬停区域。4216已原位更新，当前状态、截图与评审见[最新反馈修订](./feedback/README.md)。本文件以下为提交 `4b2e95ca` 的历史证据，保留品牌的旧版结论不适用于当前登录原型。

2026-10-10（Asia/Shanghai）。用户对第二版答复“需要调整，保留当前原型”，随后在1299×865截图中选中登录卡片，要求“整个框在页面上是差不多居中的”。本轮只修订独立原型登录布局，产品实现尚未开始；整体方案仍需批准。

新版 [4216](http://127.0.0.1:4216/) 默认打开登录，无需账号密码；第一版 [4196](http://127.0.0.1:4196/) 与第二版 [4206](http://127.0.0.1:4206/) 源码和进程均保留。新版在 `design-plans/issue196-brand-review-v3`。右上演示栏仍可切换设置及适用状态，均为内存模拟，不发产品请求。

## 改动与设计对照

先实际读取 `PublicShell`、公共CSS、两版父页面与LoginDemo，以及本项目handoff/execution。实际重新读取Figma登录 `2:11` / `102:3020` 高保真信息和截图；旧稿无品牌区，本轮按用户要求使卡片本身接近页面中心，不能把品牌与表单整组居中当作达标。

旧版品牌加表单作为一组居中，1299×865实测卡片top310/bottom751、中心比视口低98px，见 [before-1299.png](./before-1299.png)。新版仅在登录分支局部覆盖PublicShell正文布局，复用其背景、返回首页和main语义。三行CSS Grid承载品牌、表单和底部余量；上方品牌靠近卡片，下方平衡留白。无需JS测量、窗口监听、负向位移或固定卡片坐标。短视口由自然内容高度承接滚动。

HeroUI表单/按钮、IdentityField、GitHub图标、站点名称和上一版设置/文件操作组件均保持。根产品 `src/` 无修改。独立代码审查见 [code-review.md](./code-review.md)，同视口整页/公共区域及业务布局设计复核见 [design-review.md](./design-review.md)。

## 真实浏览器结果

Node24.18.1、pnpm11.19.0、macOS、现有Ego Lite。复用TaskSpace5/p1；最终页面已交还用户，不另建浏览器或测试空间。截图临时隐藏演示栏后恢复，未隐藏产品区域或错误。

| 视口     | 卡片top / bottom | 与页面中心偏差       | 实际截图                               |
| -------- | ---------------- | -------------------- | -------------------------------------- |
| 1299×865 | 212 / 653        | 0px（此前98px）      | [修改后](./after-1299.png)             |
| 1920×960 | 259.5 / 700.5    | 0px                  | [Figma同视口桌面](./after-desktop.png) |
| 390×844  | 187.5 / 656.5    | 0px                  | [手机](./after-mobile.png)             |
| 360×800  | 172 / 641        | +6.5px，内容所需高度 | [窄屏](./after-360.png)                |
| 430×844  | 187.5 / 656.5    | 0px                  | 几何断言                               |
| 768×1024 | 275.5 / 748.5    | 0px                  | 几何断言                               |

原始读数见 [geometry.json](./geometry.json)，全部横向居中且无横向溢出。不是以几何断言替代视觉对照。

- 390×420输入邮箱/密码后，键盘聚焦GitHub按钮会滚入视口；按钮top188/bottom232、高44px，输入保留。见 [短视口截图](./after-short.png) 和 [读数](./short-viewport.json)。短视口允许滚动，不强制所有内容挤在一屏。
- 密码开关和下一个“忘记密码”Tab可达，实际 `data-focus-visible=true` 并有HeroUI水绿box-shadow焦点环；仅看outline-style为none不能断言缺焦点。GitHub焦点完整可见。
- [深色手机](./after-dark-mobile.png) 与 [缺失素材手机](./after-missing-mobile.png) 均实际检查；主题切换等待运行中动画结束后截图，避免把过渡帧当最终颜色。缺失状态仍保留站点名称和可读错误。
- 临时在DOM中放入长站点名称作360×420布局压力检查：品牌文字高96、bottom212，卡片top236，页面scrollWidth360，无重叠或横溢。随后reload恢复；此检查不冒充服务器数据或持久化测试。

## 执行命令与失败修复

| 实际命令                                                                                     | 结果                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --dir design-plans/issue196-brand-review-v3 add --save-exact @gravity-ui/icons@2.22.0` | 注册复制原型的独立importer，复用既有版本，未新增产品依赖                                                                                                 |
| `pnpm install --frozen-lockfile` 与原型目录冻结安装                                          | 通过                                                                                                                                                     |
| `pnpm exec next build design-plans/issue196-brand-review-v3 --webpack`                       | 最终通过，[输出](./checks/build.txt)，包含原型TypeScript检查                                                                                             |
| `pnpm run lint`                                                                              | 通过，[输出](./checks/lint.txt)；局部class修正后只重跑变更page的 `pnpm exec eslint …/app/page.tsx --max-warnings=0`，通过，[输出](./checks/lint-fix.txt) |
| `pnpm run typecheck`                                                                         | 通过，[输出](./checks/typecheck.txt)；最终原型类型由重建承接                                                                                             |
| `pnpm run format:check`                                                                      | 通过，[输出](./checks/format.txt)                                                                                                                        |
| `git diff --check` / `git diff --name-only -- src`                                           | 通过；产品src及旧原型源码未改                                                                                                                            |

失败证据和处理保留：首次复制原型只有package.json而没有注册独立安装，构建找不到LogoGithub模块，见 [首次构建输出](./checks/build-failed.txt)；按现有原型安装方式补上独立importer后修复。首次浏览器中心断言失败（偏低88px、卡片273px宽），computedStyle确认局部普通Tailwind被未分层公共CSS覆盖；改用项目已有的important utility方式限定登录正文，并显式w-full。随后源码已改而生成CSS仍旧，实际核对生成文件确认构建缓存；将本任务v3的`.next`移动到临时目录后重建，生成important规则，全部相关中心断言才通过。未修改公共CSS、弱化中心断言或改动其他页面。

## 当前完成边界

本次登录布局原型已修改，相关本地检查与真实浏览器核对完成；独立代码/设计结论以上述报告为准，整体原型待用户批准。第二版素材失败/未知流程记录仍是上一轮证据，本次没有机械重跑未变素材流程。产品代码、真实认证/素材持久化、产品全量检查、Figma写入及最终产品人工验收均未完成。没有部署、合并、关闭Issue或清理既有预览。
