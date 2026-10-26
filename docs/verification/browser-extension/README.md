# Ariso 浏览器插件首版实施与验收

- 日期：2026-10-25。
- 状态：Chrome 首版代码和试用包已实现。未发布商店、未部署生产，项目全量检查未全绿。
- 依据：[规格](../../specs/SPEC-browser-extension.md)、[开发清单](../../../tasks/browser-extension/todo.md)、[使用说明](../../../integrations/browser-extension/README.md)、用户认可的[简约原型](https://github.com/dnslin/ariso-next/blob/65759f16247f971a5eb0006503c5c0108ba1350c/prototypes/browser-extension/README.md)。
- 环境：Node 24.18.1、pnpm 11.19.0、Chrome for Testing 151.0.7922.34。使用独立临时配置；原生截图出现 GPU 空白后改用同配置的软件渲染模式，没有改变业务逻辑。未使用本机 Docker／Colima。
- 基础 revision：`c018b93c482349be70413fa870990fc2ac7321fe`，工作区包含本轮及并行任务的未提交改动，revision 不代表全部源码。

## 实现与交付

独立包位于 `integrations/browser-extension/`，使用 WXT、React、HeroUI、Tailwind、Lucide 和已有 Uppy。首页约 360px，连接及默认选项进入设置；右键菜单图标按反馈改为内置 Caveat「A」，页眉移除重复图形。正文使用系统字体，没有捆绑约 8MB 的中文字体。

后台新增 Token 认证的 `GET /api/upload/capabilities`，仅返回六个上传字段。复用既有上传及处理，不新增数据库表、会话、公开轮询或服务器抓图。

Chrome ZIP：`integrations/browser-extension/.output/ariso-browser-extension-0.1.0-chrome.zip`，**460,858 字节**，解压约 1.37 MB。11 个文件，含 OFL 字体许可，不含测试、node_modules、环境或临时连接数据。现有线上 Ariso 需包含本轮能力查询接口才能连接；本轮未部署。

## 实际命令与结果

从仓库根目录运行，PATH 使用 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。

| 命令                                                                                                                                                         | 实际结果                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                             | 通过                                                                       |
| `pnpm --dir integrations/picgo install --frozen-lockfile`                                                                                                    | 通过                                                                       |
| `pnpm --dir integrations/browser-extension install --frozen-lockfile`                                                                                        | 通过                                                                       |
| `pnpm run typecheck`                                                                                                                                         | 通过，包含扩展检查                                                         |
| `pnpm run lint`                                                                                                                                              | 最终通过，包含扩展 React／TypeScript／无障碍规则                           |
| `pnpm run test:unit`                                                                                                                                         | 当时 PicGo 12、扩展 38、主项目 2,795 项通过；后续扩展另行完整复验          |
| `pnpm --dir integrations/browser-extension test`                                                                                                             | 最终 50/50 通过                                                            |
| `pnpm --dir integrations/browser-extension typecheck`、`lint`                                                                                                | 最终通过                                                                   |
| `ARISO_BUILD_VERSION=v0.0.0-browser-extension.1 ARISO_BUILD_REVISION="$(git rev-parse HEAD)" pnpm run build`                                                 | 首次受并行任务缺失模块阻塞，文件齐备后重跑通过，Standalone 打包成功        |
| `pnpm exec vitest run --project integration tests/integration/upload/capabilities-http.test.ts tests/integration/upload/capabilities.test.ts --maxWorkers=1` | 两文件 14 项通过，包含 6 项真实 HTTP                                       |
| `pnpm exec vitest run --project integration tests/integration/identity/tokens.test.ts --maxWorkers=1`                                                        | 定向完整复验 14 项通过                                                     |
| `pnpm exec vitest run --project unit tests/unit/scripts/browser-extension-fixture.test.ts`                                                                   | 2 项通过，夹具移除取消的 Edge 样例后已复验                                 |
| `pnpm run openapi:check`                                                                                                                                     | 通过                                                                       |
| `pnpm --dir integrations/browser-extension zip`                                                                                                              | Chrome 生产构建和 ZIP 通过，保留 Vite 大 chunk 建议，未修改阈值            |
| `pnpm run test:integration --maxWorkers=2`                                                                                                                   | 2,226 项通过、7 项失败，见未关闭项                                         |
| `pnpm run format:check`                                                                                                                                      | 发现本轮文件及并行图片编辑报告的格式问题；本轮定向修正，其他报告未擅自改动 |

CI 配置已接入独立包冻结安装、静态检查、类型、测试和 Chrome 构建。本轮未推送，不声明远端 Actions 通过。

## 真实 Chrome 与数据

实际使用 `node scripts/verify-browser-extension.ts --output test-results/browser-extension` 启动隔离服务。原生菜单、文件选择器和键盘操作由 Cua 执行，不以普通网页或合成事件替代以下原生结论。最终审计见 [fixture.json](./fixture.json)、[数据核对](./data-checks.json)。

- 真实 Token 连接成功；API 站点和来源站点分别经过浏览器原生权限提示。
- 网页图片右键进入同一小窗，手动上传成功；来源请求审计未出现 Authorization。
- Chrome 原生菜单“复制图片”后，在小窗使用系统 Cmd+V，产生 178 字节 PNG 并上传成功，不是合成 ClipboardEvent。
- 系统原生文件选择器选择 83 字节 PNG，上传成功且显示 `83 B`。
- 复制 URL，用系统 Cmd+V 粘贴到地址栏，固定 `type=compressed`；匿名打开为 `200 image/webp`。
- 数据库 trigger 将新媒体任务延后约 60 秒。显示处理中后最小化，从扩展动作恢复同窗后队列保留并显示完成；没有公开轮询或后台保活。
- 私有上传成功，界面没有该图片的匿名复制按钮，匿名读取为 401。
- 关闭重开后连接／私有偏好保留，旧文件未自动重发。
- 撤销测试 Token 后，新上传明确认证失败且未创建图片；此前图片保留。
- 最终 5 张 ready 图片，4 公开、1 私有。网页、本地、长等待输入的原图字节一致；原生剪贴板由 Chrome 重编码，字节不同。四组原图统一为 sRGB、16-bit RGBA 后逐像素一致，避免比较不同像素位深的原始缓冲。

截图：[原生右键 A](./chrome-context-menu-a.png)、[原生粘贴](./chrome-native-paste.png)、[等比逻辑尺寸](./chrome-native-paste-logical.png)（保留原图，缩小 50%，未裁剪）、[长处理](./chrome-long-processing.png)、[恢复完成](./chrome-long-ready.png)、[私有结果](./chrome-private.png)、[撤销 Token](./chrome-revoked-token.png)。

设计对照保留 360px 内容、Ariso 配色／字标、按需列表、独立设置和直接错误反馈。系统中文字体和原生窗口边框是实现取舍；本轮未创建或修改 Figma。

## 审查及真实操作中的修复

1. 旧偏好保存可能恢复已移除连接：同键操作按意图顺序处理。
2. 旧来源读取可能隐藏新任务：序号抑制过期结果，取消订阅后不回调。
3. Uppy 把不存在的可选字段发送为 `undefined`：默认只发 visibility／file，显式字段按值发送。
4. 初始 body 焦点收不到 root div 粘贴：改为 document 的用户 paste 事件，去掉旧监听，保留输入区排除并防止重复加入。

以上均先复现失败再修复，最终包含在 50 项扩展测试中。

## 未关闭项与边界

全量集成 7 项失败：

- `health.test.ts`、`secret-preflight.test.ts` 共 5 项：表清单期望缺少并行图片编辑的 `media_edit_requests`、`media_edit_templates`。本轮插件不新增表，未改这些断言。
- `setup-dev.test.ts`：定向复验仍因离线缓存缺少并行图片编辑的 `konva-10.9.0.tgz` 失败，未放宽超时或取消离线检查。
- `tokens.test.ts` 保留资源快照在全量运行失败，后续单场景和完整 14 项复验通过，不改写全量结果。

全局格式检查还有并行图片编辑的两个浏览器 JSON 报告问题，本轮只格式化自身文件。全量检查未全绿，不据此直接合并或发布。

未实测桌面文件物理拖入、系统原生多选、其他浏览器版本／操作系统、真实 R2／SeaweedFS。多文件、拖拽事件、并发和可选字段由 UI／真实 Uppy／本机 HTTP 测试覆盖，没有将单元测试称为物理输入。手机不属于本轮桌面 Chrome 扩展发行目标。

## 清理

测试 Token 已撤销，Ariso／来源服务、数据库、样例和私有连接 JSON 已关闭并删除，Chrome 临时配置已清理。生产图库未访问或写入。

用户不希望使用 Edge 后，停止本次临时 Edge，移除下载包、展开程序、临时配置、本次创建的 EdgeUpdater 及 `com.microsoft.EdgeUpdater.wake` 启动项（bootout 成功）。`/Applications/Microsoft Edge.app` 不存在。此前已有、创建于 2026-08-06 的个人数据目录保留。之后没有再次运行 Edge 或其构建命令。
