# #158 独立设计还原评审

状态：**独立设计还原评审通过；用户人工 UI 验收待完成。** 本文只记录实际读取和对照过的材料，不把浏览器脚本通过、截图数量或无横向溢出当成设计通过。

## 评审方法与范围

评审者未参与本轮 React 页面实现。已读取 `using-agent-skills`、`figma-use`、`figma-design-to-code`，遵守[设计交接](../../design/handoff.md)与[执行约定](../../tasks/execution.md)。通过 Figma 工具独立读取以下 16 个节点的设计上下文及返回截图，再读取真实 Ego Lite 页面截图；不是依据实现者总结判断。先比对整页和公共区域，再比对业务卡片、弹窗与控件。

Figma 文件为 `74sT9Hrf8G4czcWeTkET5b`。桌面参照 1440×1080，手机参照 390×844；补充 360、430、768 宽度及 480 高度短视口。深色按现有设计交接的主题 token 复核。评审者未操作浏览器；截图由独立浏览器 agent 在唯一 TaskSpace 1 操作真实页面取得。

| 状态       | 桌面 / 手机 Figma 节点                                                                                                                                              | 对照结果                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 直传设置   | [346:4712](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4712) / [346:4807](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4807) | 已看代表图和 production-fixture-3 的两端浅深图；结构一致。                                                              |
| 检测中     | [346:4905](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4905) / [346:4887](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4887) | 已看 production-fixture-7 两端浅深图；三行状态及内容顺序一致。                                                          |
| 成功       | [346:5048](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5048) / [346:5030](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5030) | 已看 production-fixture-2 五宽度浅深图及真实 R2 成功图；四行明细、公共壳和底部操作符合当前语义。                        |
| 失败       | [346:5183](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5183) / [346:5278](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5278) | 已看 production-fixture-7 两端浅深图；未将网络错误唯一归因于 CORS，清理状态独立呈现。                                   |
| CORS 示例  | [346:4865](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4865) / [346:4876](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4876) | 发现按钮宽度、手机字号偏差并在本轮修复；已复看 production-fixture-3 两端浅深、production-fixture-4 稳定桌面图。         |
| 来源不一致 | [346:5337](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5337) / [346:5326](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5326) | 已看 production-fixture-3 两端浅深图；内容分组及获批按钮位置一致。                                                      |
| 结果失效   | [346:5348](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5348) / [346:5361](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5361) | 已看 production-fixture-7 两端浅深图；发现禁用重测的前置原因仅在遮罩后；production-fixture-9 已在弹窗说明区补齐并复核。 |
| 清理状态   | [346:6259](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6259) / [346:6272](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6272) | 已看 production-fixture-7 清理失败/完成两态的两端浅深图；已知对象、错误、重试和释放引用边界明确。                       |

## 整页、公共区域与业务布局

- 桌面复用 232px 侧栏，主内容左侧 32px 留白，返回入口、30px 标题、摘要、提示条、明细卡片依次排列。手机复用 64px 顶栏、16px 内容边距及 28px 标题。品牌、账号、菜单和不可用导航来自同一个 OwnerShell，没有复制页面专属侧栏。
- 明细卡片保持 16px 圆角、桌面三列和手机纵向行布局。提示条使用现有次色背景；浅深色的页面、卡片、边框、正文和主按钮使用统一主题。桌面与手机底部操作均为 48px 高；固定底栏按当前交接铺满主区域。
- 对话框桌面 480px、手机 358px，24px 内边距、16px 纵向间距、20px 标题、13px 提示块；返回按钮填满内容区。44px 右上 CloseButton 遵循当前交接。布局没有用 HeroUI 默认尺寸替代明确设计尺寸。
- 生产截图中的错误读取、已删除、不存在及本地存储拒绝页，均给出真实错误和重载入口，不残留旧通过结果。长名称自然换行，保留滚动能力和固定底栏。已检查 production-fixture-4 的相关桌面/手机代表图；这些操作异常没有对应的独立 Figma 业务成功稿，不将它们称为逐像素一致。

## 已批准或由现行规格明确的差异

以下边界沿用[主记录](./README.md#设计读取与批准边界)，没有自行扩大 #158：

1. 用户已批准示例 JSON/来源说明下方、原返回按钮上方新增 48px 描边复制/打开配置地址按钮。弹窗因此自然增高；复制失败保留完整可选文本和错误提示。
2. 用户已批准 `/settings/storage/:id` 承载本 Issue 的 CORS 页面。管理入口显示尚未开放，不借机交付 #198 的列表或编辑页面。公共 OwnerShell 的现有不可用导航和真实账号文案沿用共享实现。
3. 旧稿只列 PUT，本次按正式签名请求实际检测 PUT、GET、HEAD。旧稿的“等待签名窗口再释放”和“新 Web 上传可直传”不符合现行 SPEC：现在已知对象删除后释放引用，#164 承接迟到对象扫描，#162 承接上传链路。因此成功文案明确“检测不会改变当前上传方式”，不恢复旧协议或虚报下游能力。

## 本轮发现与修复证据

| 发现                                                                          | 失败证据                                                                                                                          | 修复及复核                                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 弹窗操作只占 132.09375px 并右对齐，手机内容区实际 308px；违反两端按钮全宽设计 | production-fixture-2 的 `example-design-red.json`、`cors-example-light-390.png`、`cors-example-light-1440.png`                    | Modal.Footer 显式单列全宽。production-fixture-3 浅深两端截图已复核；浏览器量测要求按钮等于 footer 宽度 ±1px。                                                                              |
| 只读 JSON 在手机被全局编辑输入规则覆盖为 16px，设计要求 13px                  | 同一 `example-design-red.json` 与手机截图；桌面原为 13px                                                                          | 仅覆盖本只读 JSON 的字号，未改全局输入规则。production-fixture-3 手机浅深截图及 computed fontSize=13px 已复核。                                                                            |
| 弹窗正文继承组件 muted 色                                                     | production-fixture-2 示例深色图                                                                                                   | 本弹窗正文显式前景色；production-fixture-3 示例与来源弹窗两端浅深已复核。                                                                                                                  |
| 键盘 Enter 复制成功后焦点落到 BODY                                            | production-fixture-2 `copy-focus-red.json` 与失败截图                                                                             | 实现者修正复制 pending 行为；浏览器 agent 在新生产构建中重新执行真实剪贴板路径。评审者已读报告，不以截图代替焦点断言。                                                                     |
| 第一版静态证据截到 Modal 入场动画，短视口截图被连续成功 Toast 遮住标题        | production-fixture-3 示例桌面及短视口图                                                                                           | 桌面静态图已在 production-fixture-4 重拍；production-fixture-7 的 1440×480、390×480 普通来源弹窗已无 Toast 遮挡，标题、正文和按钮均可见。                                                  |
| 长来源地址在 390×480 弹窗中正文与复制按钮重叠                                 | production-fixture-7 `cors-long-origin-example-short-390.png`                                                                     | 已改为正文独立滚动、标题与操作区不收缩。已独立读 production-fixture-9 的滚动前/后两图：正文可视区底部 311px、footer 顶部 327px，重叠消失，关闭与操作按钮保持可见；真实滚轮与布局断言通过。 |
| 清理重试键盘操作成功后焦点落到 BODY                                           | 独立生产验证 `cleanup-focus-red/result.json`、`cleanup-focus.png`；重试按钮获得焦点，Enter 成功后正文已变为清理完成但焦点离开弹窗 | 实现者修复后，production-fixture-9 `cors-cleanup-keyboard-focus.png` 已显示清理成功后焦点留在“刷新清理状态”；该轮最终报告 passed，已独立读取 cleanupFocus 字段并与焦点截图核对。           |
| 失效弹窗要求重测，但禁用时没有在弹窗内说明连接测试前置                        | production-fixture-7 `cors-invalidated-dialog-light-1440.png`、`cors-invalidated-dialog-light-390.png`                            | 已在既有说明区条件性展示连接测试前置原因；production-fixture-9 桌面及手机浅深图已独立复核，禁用原因完整可见。                                                                              |

以上问题均按本轮问题处理，没有归为“后续优化”。截图和报告最终由主记录统一归档到 `ui/browser/`、`ui/regressions/`，不重复维护另一套检查结果。

## 真实截图索引

以下最终静态证据固定取自通过的 production-fixture-9，已归档为 `ui/browser/` 下的报告及 81 张同名截图，不用后续完整套件截图覆盖。归档后，评审者再次实际读取桌面浅色设置页、手机深色设置页、手机浅色示例弹窗、桌面深色失效弹窗及 390×480 长来源滚动后截图。公共区域、业务布局、按钮宽度、禁用说明和独立正文滚动均与已验收版本一致，未发现新增偏差。其他未改变布局沿用前述逐项对照结论。真实云服务生产证据另存 `ui/live/`；完整浏览器套件结果由主记录单独说明，不由本组静态证据推定通过。

| 状态       | 1440×1080 浅 / 深                                                                                                                      | 390×844 浅 / 深                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 设置       | [浅](./ui/browser/cors-local-http-fixture-overview-light-1440.png) / [深](./ui/browser/cors-local-http-fixture-overview-dark-1440.png) | [浅](./ui/browser/cors-local-http-fixture-overview-light-390.png) / [深](./ui/browser/cors-local-http-fixture-overview-dark-390.png) |
| 检测中     | [浅](./ui/browser/cors-running-light-1440.png) / [深](./ui/browser/cors-running-dark-1440.png)                                         | [浅](./ui/browser/cors-running-light-390.png) / [深](./ui/browser/cors-running-dark-390.png)                                         |
| 成功       | [浅](./ui/browser/cors-passed-light-1440.png) / [深](./ui/browser/cors-passed-dark-1440.png)                                           | [浅](./ui/browser/cors-passed-light-390.png) / [深](./ui/browser/cors-passed-dark-390.png)                                           |
| 失败       | [浅](./ui/browser/cors-failed-light-1440.png) / [深](./ui/browser/cors-failed-dark-1440.png)                                           | [浅](./ui/browser/cors-failed-light-390.png) / [深](./ui/browser/cors-failed-dark-390.png)                                           |
| 示例       | [浅](./ui/browser/cors-example-light-1440.png) / [深](./ui/browser/cors-example-dark-1440.png)                                         | [浅](./ui/browser/cors-example-light-390.png) / [深](./ui/browser/cors-example-dark-390.png)                                         |
| 来源不一致 | [浅](./ui/browser/cors-origin-mismatch-light-1440.png) / [深](./ui/browser/cors-origin-mismatch-dark-1440.png)                         | [浅](./ui/browser/cors-origin-mismatch-light-390.png) / [深](./ui/browser/cors-origin-mismatch-dark-390.png)                         |
| 失效弹窗   | [浅](./ui/browser/cors-invalidated-dialog-light-1440.png) / [深](./ui/browser/cors-invalidated-dialog-dark-1440.png)                   | [浅](./ui/browser/cors-invalidated-dialog-light-390.png) / [深](./ui/browser/cors-invalidated-dialog-dark-390.png)                   |
| 待清理     | [浅](./ui/browser/cors-cleanup-pending-light-1440.png) / [深](./ui/browser/cors-cleanup-pending-dark-1440.png)                         | [浅](./ui/browser/cors-cleanup-pending-light-390.png) / [深](./ui/browser/cors-cleanup-pending-dark-390.png)                         |
| 已清理     | [浅](./ui/browser/cors-cleanup-complete-light-1440.png) / [深](./ui/browser/cors-cleanup-complete-dark-1440.png)                       | [浅](./ui/browser/cors-cleanup-complete-light-390.png) / [深](./ui/browser/cors-cleanup-complete-dark-390.png)                       |

短视口：[普通桌面 1440×480](./ui/browser/cors-example-short-1440.png)、[普通手机 390×480](./ui/browser/cors-example-short-390.png)、[长来源滚动前](./ui/browser/cors-long-origin-example-short-390.png) / [滚动后](./ui/browser/cors-long-origin-example-short-scrolled-390.png)。操作证据：[复制被拒绝](./ui/browser/cors-copy-denied-390.png)、[清理成功后的键盘焦点](./ui/browser/cors-cleanup-keyboard-focus.png)。完整视口、主题、点击目标与行为断言参见[浏览器报告](./ui/focused/storage-cors.json)。

## 当前结论与限制

**功能结论：** 已独立读取 production-fixture-9 的最终 passed 报告，确认当前浏览器生产传输、完整剪贴板内容、复制拒绝处理、键盘焦点、来源失效、连接前置禁用、清理重试和过期接管的实际行为。live-ui-production 的真实 R2 / SeaweedFS 报告均 passed，且已查看两服务生产成功页的桌面/手机浅深代表图。此结论只覆盖这些实际运行，不替代仓库其他检查；完整浏览器套件由主记录单独记录。

**设计结论：** 已对照部分的本轮按钮宽度、手机 JSON 字号及正文色偏差已修复。production-fixture-7 已补齐检测中、失败、结果失效、清理及普通短视口的实际截图。长来源地址短视口重叠与失效弹窗禁用原因均在 production-fixture-9 修复复核。清理重试后的新截图显示焦点明确位于弹窗内。按本次设计稿、现行规格和已批准差异，未发现仍未解决的设计偏差，独立设计还原评审通过。

用户要求的人工 UI 验收仍待用户完成。当前使用现有 Ego Lite，不包含物理设备或其他浏览器引擎实测。早期开发模式真实云服务图含 Next 开发指示器，未用作最终静态结论。现已独立检查 live-ui-production 的 R2 桌面浅色/手机深色、SeaweedFS 手机浅色/桌面深色生产图，开发覆盖层已不存在，成功结构与设计一致。
