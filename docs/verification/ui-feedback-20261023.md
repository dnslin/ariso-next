# 首页文案与备份确认按钮返修

2026-10-23，按用户提供的两张截图处理两项反馈：移除首页“开源 · 极简 · 图片托管”，修正开始备份确认框底部按钮错位。

## 修改与对照

- 首页删除指定段落及其唯一使用的 `.home-caption` 样式。站点名称、站点描述和登录入口继续使用现有内容来源。
- 确认框继续复用 HeroUI 3.2.6 的 AlertDialog、Button 和既有两列布局。核对安装包类型与样式后，为两个 Button 使用已有 `fullWidth` 属性，覆盖默认的内容宽度；不新增依赖、组件或布局抽象。
- 备份参考为 [B03 桌面浅色 1282:47859](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47859)，其余主题和尺寸见[原型索引](./backup-figma/README.md)。本轮以用户红框反馈修正两列按钮的实际宽度；未修改 Figma。
- 实际页面结构和尺寸检查确认：指定首页文字不存在；确认框取消在左、开始备份在右；按钮等宽、同排、48px 高、间隔 12px，两端贴齐操作区。

| 视口      | 操作区宽度 | 单按钮宽度 | 两个按钮左侧相对位置 |
| --------- | ---------- | ---------- | -------------------- |
| 1440×1080 | 430px      | 209px      | 0 / 221px            |
| 390×844   | 308px      | 148px      | 0 / 160px            |
| 360×780   | 278px      | 133px      | 0 / 145px            |
| 430×932   | 348px      | 168px      | 0 / 180px            |
| 768×1024  | 430px      | 209px      | 0 / 221px            |
| 390×560   | 308px      | 148px      | 0 / 160px            |

上述每种视口均检查浅深色。首页和开始备份确认框共 24 种页面组合通过本轮定向检查。确认框 Tab 到开始备份、Shift+Tab 返回取消、Escape 关闭均通过。首页只检查本次移除内容和溢出，不把原有登录链接 32×24px 的点击区当作本轮修复；该触控目标偏小的问题未扩大修改范围。

## 实际执行

环境：macOS ARM64、Node 24.18.1、pnpm 11.19.0。构建版本 `v0.0.0-ui.1`，revision `37d75d5a500938cbfb3cfc77b81d348c359f1c71`，包含本轮未提交源码；revision 不代表这些未提交改动。未使用本机 Docker/Colima。

| 命令或检查                                                                                                                         | 实际结果                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                   | 通过                                                                |
| `pnpm --dir integrations/picgo install --frozen-lockfile`                                                                          | 通过                                                                |
| `pnpm run lint`                                                                                                                    | 通过；最终修改文件另执行 ESLint，无警告                             |
| `pnpm run typecheck`                                                                                                               | 通过                                                                |
| `pnpm run test:unit`                                                                                                               | 主项目 246 个文件、2731 项通过；PicGo 11 项通过                     |
| `pnpm exec vitest run --project unit tests/unit/backup`                                                                            | 修复后 11 个文件、54 项通过                                         |
| `ARISO_BUILD_VERSION=v0.0.0-ui.1 ARISO_BUILD_REVISION=$(git rev-parse HEAD) pnpm run build`                                        | 通过，完成 standalone 打包与原生模块验证                            |
| `pnpm run test:integration`                                                                                                        | 2173 项通过；`identity/setup-dev.test.ts` 1 项在 120 秒超时         |
| `pnpm exec vitest run --project integration tests/integration/identity/setup-dev.test.ts`                                          | 单独重跑 1 项通过，57.17 秒；没有调整超时或断言，未重复整套集成测试 |
| `pnpm exec prettier src/app/page.tsx src/app/globals.css src/components/backup/backup-confirmation.tsx e2e/backup-run.mjs --check` | 通过；本记录另做格式检查                                            |
| `git diff --check`                                                                                                                 | 通过                                                                |

浏览器测试复用本轮 Ego 空间 2。正式回归入口是 `EGO_TASK_SPACE=2 BROWSER_REPORT_DIR=test-results/home-backup-ui node scripts/verify-browser.mjs --suite backup`。初始旧构建缺少备份身份，按项目约定重新构建后，修复前断言确认首页仍有被要求删除的文字。

初次修复后的正式浏览器入口因 `Page.captureScreenshot` 超时中断；同一空间的空白页、独立新标签、页面的 `Page.bringToFront` 和截图底层调用同样失败。当时未将整套浏览器回归标为通过；后续恢复与重跑结果见下节。

为完成本次布局检查，另用同一空间和真实 standalone 临时实例执行 `node test-results/home-backup-ui/focused-check.mjs`。该检查经真实初始化与登录打开正式页面，验证上述 24 种组合和键盘操作。本地结果位于 `test-results/home-backup-ui/focused-check.json`，脚本、报告及日志位于忽略的任务结果目录，不作为可从新克隆重现的已提交证据。正式回归中的页面断言保留在 `e2e/backup-run.mjs`，截图服务可用后可经原入口重跑。

## 截图超时续查与真实页面验收

用户要求继续排查后，恢复使用原 Ego 空间 2。发现 Ego Lite 进程由 `--startup-ego-browser-service` 启动。执行 `open -a '/Applications/ego lite.app'` 正常打开已有应用后，同一空间的空白页截图在 40ms 内完成；此前的页面级前台调用未能恢复截图。没有重启或升级浏览器、清理用户配置，也没有调整截图超时或跳过截图。

已验证的结论是：正常激活浏览器应用可恢复此次截图故障，问题不依赖 Ariso 页面内容。浏览器内部为什么在此前状态不返回截图，尚无足够证据；不把运行状态相关性写成已证实的内部缺陷。

随后执行以下正式入口，返回退出码 0，`runner.json` 与备份流程报告均为 `passed`：

```sh
EGO_TASK_SPACE=2 EGO_PAGE_LABEL=p1 \
BROWSER_REPORT_DIR=test-results/home-backup-ui-screenshots \
node scripts/verify-browser.mjs --suite backup
```

该入口完成真实创建、下载、源测试数据删除、恢复和启用后重新登录，共生成 156 张流程截图。此次只对本任务涉及的首页与开始备份确认框作视觉验收，不将其余流程截图计为逐图设计验收。

另执行 `node test-results/home-backup-ui-screenshots/configured-home-round2.mjs`，在另一个独立临时实例通过正式设置接口写入用户截图中的站点描述“这必然是一个精彩的未来”，补充 12 张真实首页截图。每张同时断言该描述保留、指定短句移除和页面无横向溢出。该脚本没有改生产数据或产品源码。

### 对照结果

- 整页与公共区域：先查看六种视口、浅深色的整页汇总图，核对首页品牌、点阵、右上黄光、左下水绿、站点描述与登录入口，以及备份页的公共外壳与弹窗位置。未发现本轮新增的裁切、溢出或公共区域错位。
- 首页：品牌、下划线、站点描述与登录入口保留；登录下方指定短句已经消失。补充截图保留了用户原截图的描述文字，未将空描述夹具误当成“描述也应删除”。
- 确认框：查看全部 12 张确认框的原比例局部，并复核桌面浅色、手机浅色和 360px 深色原始整图。两个按钮等宽、同排，分别对齐操作区左右边缘；文案和按钮在 390×560 短视口完整可见。
- 本任务涉及的 24 种页面、视口、主题组合截图验收通过。原有 32×24px 首页登录点击区仍是本轮范围外问题，不将该项写成符合 44px 目标。

24 张原始截图、3 张用于查看的汇总图和[结果摘要](./ui-feedback-20261023/report.json)已保存在本记录旁。原始截图未裁剪或重绘；汇总图只用于对照，不替代原图。确认框原比例对照见[局部汇总](./ui-feedback-20261023/qa-confirm-native-crops.png)。

| 视口      | 首页浅色                                                           | 首页深色                                                          | 确认框浅色                                                               | 确认框深色                                                              |
| --------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1440×1080 | [原图](./ui-feedback-20261023/configured-home-1440x1080-light.png) | [原图](./ui-feedback-20261023/configured-home-1440x1080-dark.png) | [原图](./ui-feedback-20261023/backup-confirm-backup-1440x1080-light.png) | [原图](./ui-feedback-20261023/backup-confirm-backup-1440x1080-dark.png) |
| 390×844   | [原图](./ui-feedback-20261023/configured-home-390x844-light.png)   | [原图](./ui-feedback-20261023/configured-home-390x844-dark.png)   | [原图](./ui-feedback-20261023/backup-confirm-backup-390x844-light.png)   | [原图](./ui-feedback-20261023/backup-confirm-backup-390x844-dark.png)   |
| 360×780   | [原图](./ui-feedback-20261023/configured-home-360x780-light.png)   | [原图](./ui-feedback-20261023/configured-home-360x780-dark.png)   | [原图](./ui-feedback-20261023/backup-confirm-backup-360x780-light.png)   | [原图](./ui-feedback-20261023/backup-confirm-backup-360x780-dark.png)   |
| 430×932   | [原图](./ui-feedback-20261023/configured-home-430x932-light.png)   | [原图](./ui-feedback-20261023/configured-home-430x932-dark.png)   | [原图](./ui-feedback-20261023/backup-confirm-backup-430x932-light.png)   | [原图](./ui-feedback-20261023/backup-confirm-backup-430x932-dark.png)   |
| 768×1024  | [原图](./ui-feedback-20261023/configured-home-768x1024-light.png)  | [原图](./ui-feedback-20261023/configured-home-768x1024-dark.png)  | [原图](./ui-feedback-20261023/backup-confirm-backup-768x1024-light.png)  | [原图](./ui-feedback-20261023/backup-confirm-backup-768x1024-dark.png)  |
| 390×560   | [原图](./ui-feedback-20261023/configured-home-390x560-light.png)   | [原图](./ui-feedback-20261023/configured-home-390x560-dark.png)   | [原图](./ui-feedback-20261023/backup-confirm-backup-390x560-light.png)   | [原图](./ui-feedback-20261023/backup-confirm-backup-390x560-dark.png)   |

## 交付边界

- 本次续查未改产品代码；复用上轮构建、类型、单元和集成证据，没有重复执行与截图问题无关的整套检查。新增证据执行格式、文件链接和截图尺寸检查。
- 未重复验收备份错误、忙碌、取消及删除分支，也未重跑整站浏览器业务流程；本任务的首页和开始备份确认框截图缺口已补齐。
- 截图验收结束时，浏览器实例与自建测试数据已关闭清理；测试空间已结束，非测试创建的标签保留。当时未推送、合并或部署；后续提交和 CI 结果以 PR 为准。
