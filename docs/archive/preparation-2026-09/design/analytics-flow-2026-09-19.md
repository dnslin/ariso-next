# 工作台与访问统计原型（2026-09-19）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

本批新增桌面／手机各 25 个业务状态和 5 个阅读入口，并原位同步原工作台与统计的 7／30／90 天页面及两个说明弹窗。依据 [SPEC-analytics](../../../specs/SPEC-analytics.md)。这些是固定数据原型，未实现或测试真实计数、对象用量及报表接口。

- 桌面 05-B：[05 · 工作台与访问统计](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1012)。
- 手机 05-B：[05 · 工作台与访问统计](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2266)。
- [76 个根画板与入口检查](./verification/analytics-flow-2026-09-19.json)。

## 阅读顺序与节点

依次按工作台与周期、空态与读取、延迟与历史、用量与异常、数值与口径五组排列。编号从左到右、从上到下，入口编号和标题分别对齐。原有分区和本批修订的原画板位置、尺寸保持不变。

| 编号 | 状态                    | 桌面                                                                               | 手机                                                                               |
| ---- | ----------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1    | 工作台 · 最近 7 天      | [451:3748](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-3748)   | [451:8551](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-8551)   |
| 2    | 工作台 · 最近 30 天     | [451:10186](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-10186) | [451:10665](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-10665) |
| 3    | 工作台 · 最近 90 天     | [451:10990](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-10990) | [451:11469](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-11469) |
| 4    | 访问统计 · 最近 7 天    | [446:8063](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=446-8063)   | [446:8030](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=446-8030)   |
| 5    | 访问统计 · 最近 30 天   | [451:8876](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-8876)   | [451:9240](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-9240)   |
| 6    | 访问统计 · 最近 90 天   | [451:9531](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-9531)   | [451:9895](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-9895)   |
| 7    | 首次读取统计            | [451:12898](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-12898) | [451:13086](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-13086) |
| 8    | 还没有图片与访问        | [451:11794](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-11794) | [451:12107](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-12107) |
| 9    | 所选周期没有访问        | [451:12347](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-12347) | [451:12659](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-12659) |
| 10   | 统计暂时无法读取        | [451:13199](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-13199) | [451:13387](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-13387) |
| 11   | 正在切换至 30 天        | [451:13500](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-13500) | [451:13689](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-13689) |
| 12   | 刷新失败 · 保留上次数据 | [451:13803](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-13803) | [451:14165](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-14165) |
| 13   | 统计更新延迟            | [451:14454](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-14454) | [451:14818](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-14818) |
| 14   | 统计数据不完整          | [451:15109](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-15109) | [451:15473](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-15473) |
| 15   | 范围内含旧时区数据      | [451:15764](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-15764) | [451:16128](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-16128) |
| 16   | 热门图片 · 历史状态     | [451:16419](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-16419) | [451:16637](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-16637) |
| 17   | 当前存储占用            | [451:16780](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-16780) | [451:17096](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-17096) |
| 18   | 部分对象待核对          | [451:17337](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-17337) | [451:17648](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-17648) |
| 19   | 空间用量暂不可用        | [451:17884](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-17884) | [451:18075](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-18075) |
| 20   | 当前处理异常            | [451:18191](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-18191) | [451:18417](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-18417) |
| 21   | 每日访问明细 · 7 天     | [451:18568](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-18568) | [451:18835](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-18835) |
| 22   | 每日访问明细 · 30 天    | [451:19027](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-19027) | [451:19524](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-19524) |
| 23   | 每日访问明细 · 90 天    | [451:19946](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-19946) | [451:21043](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-21043) |
| 24   | 访问统计如何计算        | [452:3994](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=452-3994)   | [452:8747](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=452-8747)   |
| 25   | 存储占用如何计算        | [452:4005](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=452-4005)   | [452:8758](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=452-8758)   |

原工作台 19:38／101:793，30 天 23:71／102:3289，90 天 23:277／102:3504；原统计 30:1225／102:1038，30 天 44:436／102:4426，90 天 44:627／102:4613 原位同步新内容。旧统计说明 23:57／102:3267 和处理失败说明 23:63／102:3277 接入完整说明及异常页，保持根节点以延续已有导航。

## 口径与具体表现

- 主图片数量样例为正常图库 90 张，旁列回收站 10 张；相册 24 个，包含空相册。初次失败、重新处理失败分别表达，重处理失败仍可使用上一次成功版本。
- 默认 7 天，趋势、热门和版本访问量一起切换至 30／90 天，均含今天。今日 326、累计 48,620 与当前占用不随周期改变。页面注明 Asia/Shanghai、2026/09/19 14:20 和今日未结束。
- 7／30／90 天合计分别为 2,146／9,480／28,440。三版本合计、逐日明细与对应趋势合计一致；提供 7、30、90 行文本表格，图表不只依赖颜色或鼠标悬停。合成样例只用于检查布局和口径，不是项目真实访问记录。
- 每个正常周期样例展示 5 张有访问的热门图片，不补零访问项凑满 10 张。正常和私有图片带缩略图；已删除、回收、停用存储使用无图片内容占位。已删除只保留通用名称和短 ID，不保留旧名或文件入口；回收行进入既有回收站列表。
- 真实空库、当前范围无访问、首次加载、首次读取失败、切周期加载、刷新失败保留旧数据、写入积压与已发生漏计分别有画板。失败不显示为零；刷新失败标旧数据与原更新时间。已恢复更新不表示能补回历史漏计。
- 旧时区提示明确日期按原时区归档，不追溯重算；口径说明注明 365 天每日明细与长期累计、异常退出可能损失尚未保存的少量访问。仅表达规则，不作为服务端验证结果。
- 当前占用总计 8.6 GiB：正常原图 6.0、正常派生 2.0、回收站 0.3、处理中／待清理 0.3。各存储分别展示四类组成，本地 3.2 GiB，停用的 S3 仍为 5.4 GiB。
- 待核对样例为 S3 另有 3 个未知对象；已知占用不等于完整总量，不为该存储画完整比例。读取空间失败与访问计数故障区分。永久删除受理后仍占空间，成功清理后才减少。
- 内容区滚动、底部操作独立固定。桌面周期与底部按钮采用固定宽度，手机按钮按可用宽度排列。

## 固定样例与剩余范围

7／30／90 天之间的正常报表与每日表格已连通，所有图表数字来自同一组合成样例。空库／无访问／延迟／漏计等画板是独立评审场景；切换周期或返回主页面不会动态延续该场景。旧时区画板只演示提示，不包含跨时区真实事件。不能用这些数字验收统计实现。

正常热门图的具体详情、当前处理异常的逐张详情／重试、回收行的指定记录定位尚未连通；异常页提供明确“前往图库”入口，不虚构新的错误筛选参数。单图统计与 LIBRARY 的真实数据组合、长名称完整阅读、排行榜同数值排序、全量 10 张及特殊格式仍需联调和设计收口。

折线给出日期范围与纵轴范围，逐日文本表可读所有样例值。点选图表提示、焦点读数、键盘导航和触摸手势未运行验证。10 秒刷新、隐藏页暂停／恢复、迟到响应忽略、URL days、登录失效与缓存清理仍是工程验收项，不把静态跳转当作请求竞态已经解决。

统计批写、SIGTERM／SIGKILL、失败重试、缓冲漏计、日界线／夏令时／365 天清理、对象责任去重与外部文件变更均未验证。深色及 360／430／768 等尺寸也未完成。DES-06-ANALYTICS 保持待用户查看与交互验收，不整体关闭。

下一批继续站点基础设置剩余状态，再进行全量原型回归与缺口收口，随后完善全栈实施任务及真实依赖门槛。

## 本轮检查

回读桌面／手机各 38 个根画板与入口，共 76 个：每端 25 个新状态、5 个阅读入口、6 个原主页面和 2 个原说明弹窗。检查横向边界、字体、固定底栏、有效跳转、编号对齐、画板及分区重叠和原位置尺寸保持。统计字体沿用 Noto Sans SC／Inter，品牌沿用 Caveat。

从 Figma 节点回读三版本数字与 7／30／90 行每日数据，检查合计一致、日期范围含今日、关键指标不随周期改变，以及已删除／回收／停用排行无图片填充。截图抽查桌面统计、手机空态／历史排行、空间待核对、逐日表格及阅读指引，修正行列宽、按钮宽度和提示文案。

执行项目 Prettier 格式化／检查、Python JSON 审计及 git diff --check；实际结果见本轮命令输出。未运行播放器、真实计数／存储、应用测试或构建，没有修改应用代码、安装依赖、创建 Issue 或提交。

## 六项并行补充（2026-09-19）

图表与统计页面深色／360px代表见[R6](./parallel-theme-widths-2026-09-19.md)。 本文此前剩余清单按原批次保留，当前交付与尚待工程验证的范围以[六项统一目录](./parallel-design-completion-2026-09-19.md)及对应专项为准，不再把上述代表设计记为尚未补图。
