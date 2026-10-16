# 第三版界面减负实施

日期：2026-10-11。状态：产品实施、定向浏览器验证及本轮 Figma 同步完成。用户已批准 `61512` 原型；没有提交、推送、创建 PR、合并或发布。真实预览为 `http://127.0.0.1:3001`，原数据和账号不变。

批准范围见[规划及25项文案对照](https://github.com/dnslin/ariso-next/blob/edb097b1fd7396e2797aac2d04e826ab986062e2/design-plans/main-ui-review-20261011/clarity-review-v3/PLAN.md)，共用规则见[交接规范](../../../../../design/handoff.md#界面减负第三版2026-10-11用户批准)。不改上传、查询、鉴权、存储生命周期或公开分享契约。

## 实施

- 普通分享启停直切，成功后 Toast，失败直显，丢失响应只读核对。过期启用、清密码、轮换和放弃修改仍确认。
- 标签编辑正常说明改 Tips，行末重命名/删除图标组；错误、冲突和删除后果保留。品牌配置行替换/移除图标组，分享列表单设置图标。
- 侧栏“分享 / 存储”，单一设置分区短“保存 / 预览”；基本设置仍为“保存站点 / 保存限制”。同级三个标题统一图标。
- 回收站局部中性 hover，无缩放；选中描边和键盘焦点独立，不改全局颜色。
- 统计保留最近成功结果与图表节点，明确请求/展示周期；失败重试目标不变，401清空，乱序不能覆盖。

组件继续复用 HeroUI 的 Button、ButtonGroup、Table、Switch、Modal、Tooltip/Popover 和 Toast，图标来自 Lucide。图标操作沿用已有 `ActionIconButton`，Tips 沿用 `StorageTip`；没有新增通用组件框架、依赖或手绘图标。统计继续采用已有专用图表，仅调整查询状态与占位尺寸。

## 验证

环境：macOS ARM64，Node24.18.1、pnpm11.19.0，本机 ImageMagick / ExifTool，Ego TaskSpace8。浏览器业务写入使用运行器隔离数据。3001人工预览保留原数据和账号。

以下均为本轮实际执行。原始运行日志和全部截图位于 `.data/clarity-review-v3/`；本记录不复用此前两版的通过结论。

| 命令                                                                                                                                                                                                                                      | 结果                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                          | 通过，锁文件未变                                                                                     |
| `pnpm run lint` / `pnpm run typecheck`                                                                                                                                                                                                    | 最终修改后复跑通过                                                                                   |
| `pnpm run test:unit`                                                                                                                                                                                                                      | 最终复跑 179 文件、2236 项通过，79.25 秒                                                             |
| `pnpm run build`                                                                                                                                                                                                                          | 最终复跑通过；可选平台 resvg 与 OpenTelemetry 依赖追踪警告保留                                       |
| `pnpm run build:shell` / `pnpm --dir tests/experiments/ui run build`                                                                                                                                                                      | 通过                                                                                                 |
| `pnpm run test:integration --maxWorkers=1`                                                                                                                                                                                                | 188 文件、1891 项通过，3 文件、6 项失败，1091.03 秒；不记为全量通过                                  |
| `pnpm exec vitest run --project integration --project media-tools tests/integration/analytics/report-scale-runner.test.ts tests/integration/upload/settings-persistence-http.test.ts tests/integration/upload/api.test.ts --maxWorkers=1` | PATH 补回 `/usr/sbin:/sbin` 且构建稳定后复跑：2 文件、19 项通过，1 文件、1 项失败，38.70 秒          |
| `pnpm run format:check`                                                                                                                                                                                                                   | 仅两份未修改的历史 `site-196/implementation/merge-theme/browser/*/*.json` 格式失败；没有改写历史证据 |
| `node docs/tasks/check.mjs` / `--self-test` / `git diff --check`                                                                                                                                                                          | 120 任务、298 需求及 5 个拒绝样本通过，无空白错误                                                    |

首轮集成的四项统计规模报告失败是精简 PATH 未包含 `diskutil`；一项上传设置重启失败发生于本轮重新构建清理 `.next` 期间。补回系统 PATH 并在构建稳定后，两文件五项失败均未复现。上传 API 的截断 multipart 用例仍出现 `fetch failed / ECONNRESET`，涉及未修改的后端上传链路；本轮不修改测试超时、断言或后端来消除此失败。

## 浏览器验证

执行命令：`EGO_TASK_SPACE=8 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=.data/clarity-review-v3/<run> node scripts/verify-browser.mjs --suite <suite> [--only <phase>]`。报告与代表截图已归档至 [browser](https://github.com/dnslin/ariso-next/tree/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/clarity-v3/browser)，首次失败报告仍保留原失败状态。

| 范围                                                                  | 最终证据                                                                                                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 分享 `--suite sharing-management --only behavior` / `--only recovery` | 分别 10 / 11 项检查通过，各 44 个布局；普通启停无弹窗、请求中、直接错误、未知结果只读核对和必要确认均覆盖                          |
| 标签 `--suite tags`                                                   | 14 项检查、114 个布局通过；图标组、Tips 键盘开关及回焦、重名、失败输入保留、删除确认和分页均覆盖                                   |
| 回收站 `--suite trash --only representative`                          | 20 个布局通过；浅深色局部 5% hover、几何不变、独立焦点和选中状态均覆盖                                                             |
| 基本设置 `--suite site-general`，随后 `--only consumers`              | 首轮核心 12 项通过，消费者因分享手机标题原点差 1.5px 失败；修正后 consumers 通过。公共外壳包含 15 路由的 45 个视口及 15 个折叠状态 |
| 统计 `--suite analytics`，随后 `--only consumers`                     | 首轮核心 13 项通过；修正消费者焦点定位和图表占位高度后，consumers 2 项、30 个布局通过，保留精确返回滚动断言                        |
| 品牌 `--suite site-branding`                                          | 完整 18 项检查、120 个布局通过，包含服务重启后的保存状态                                                                           |

统计动态图表的占位原为 180px，桌面实际图表为 252px。返回时异步增加的 72px 会改变已恢复的滚动位置。本轮改为手机 220px、桌面 252px，并新增尺寸单测；没有放宽滚动断言。

首次分享完整浏览器运行停在原生剪贴板恢复等值检查，尚未进入产品场景；没有删除该断言或清空用户剪贴板。随后独立 behavior/recovery 通过。标签 Tips 的 Enter 打开、Esc 关闭及回焦通过后，跨 desktop/mobile 仿真仍打开的 Tooltip 导致 scale/定位冻结；后续表单流程改为真实 Tab 回输入框、确认提示关闭再切仿真，并保留原失败报告。[补充检查](https://github.com/dnslin/ariso-next/blob/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/clarity-v3/browser/tips-resize.json)验证了同一仿真模式内桌面调整宽度、手机横竖屏调整时浮层打开仍不溢出。该检查不作为物理手机旋转已通过的证据。

## 设计对照

[真实页面截图](https://github.com/dnslin/ariso-next/blob/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/clarity-v3/browser/manual/report.json)覆盖标签、分享列表、分享设置、基本设置、访问统计和回收站，共 6 页 × 2 主题 × 2 视口（1440×900、390×844）24 张；均等待字体及页面内容就绪，无横向溢出。人工复核了标签手机编辑、分享请求中与失败、统计失败保留旧结果、回收站 hover 和选中。示例数据不同的页面不作逐像素相等声明。

Figma 在[既有文件的 v3 补充区](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1132-40444)同步，准确范围见[节点及截图索引](figma/README.md)。原主节点按批准内容局部修改，保留原表格、分页及独立保存；桌面/手机分享列表的设置图标及 Tips 补项已提交。新增可编辑状态帧用于表达图标组、提示与保留旧结果，不作整页或 Figma Player 运行验收。

最后对照了分享和基本设置的同尺寸正常代表图。分享卡片顺序、位置、禁用预览，以及设置五分类、同级图标、行末 Tips 和两个独立保存均核对；Figma 的示例地址与产品真实地址不同。其余静态示意明确标注，不能替代运行页面的真实状态截图。

Ego TaskSpace8 已结束检查并保留 `p1` 的真实 3001 预览供用户验收。用户最终人工验收、物理手机、全量默认浏览器套件及发布镜像未执行；本轮不以定向检查替代这些结果。

## 搜索工具栏返修

2026-10-12 按用户截图反馈，收窄图库、相册详情和回收站搜索，并在空间足够时将按钮排列在同一行。窄屏保留自然换行，未改查询或选择行为。[局部实施、验证与 Figma 记录](toolbar-20261012/README.md)。
