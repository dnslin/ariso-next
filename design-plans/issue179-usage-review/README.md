# 当前存储占用：减少提示、区分状态

基线：9cdec16dd5cd8db467af1de166cd71d7829a9fff，2026-10-10人工反馈。独立原型 http://127.0.0.1:4182/ ，仅使用示例数据，不读取或修改4180的独立人工预览。旧4181原型保留。

## 设计依据与来源

- 页面：`/analytics?days=7&view=usage`，含工作台进入同一占用视图。
- 用户截图明确指出描述、逐卡说明过多，要求启用/停用使用不同色标签。
- 已实际读取Figma文件74sT9Hrf8G4czcWeTkET5b节点451:17337/17648的design context与截图：原稿含页面描述、启停纯文本、每卡比例说明及“停用不会清零”，并在底部再次说明清理。冗余主要来自旧设计表达与产品沿用，不是公共规则要求常驻这些文字。
- 运行路径：AnalyticsScreen根据view组合UsageContent；UsageContent读取真实AnalyticsUsage，AnalyticsCard和OwnerShell提供卡片与公共外壳，AnalyticsScopeDialog已提供占用说明。
- 适用规范：docs/design/handoff.md，docs/tasks/execution.md；新增设计批准仍需与最终产品人工验收区分。

| 问题                               | 证据                                                                | 推荐修正                                                                                                   | 范围     | 置信度 |
| ---------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- | ------ |
| 启停状态混入标题，用户要求颜色区分 | 用户截图、Figma卡标题、usage-content.tsx标题拼接实际组合            | HeroUI Chip soft/sm：启用success、停用default并用现有foreground/muted呈现中性色；保留文字与Check/Pause图标 | 本占用卡 | 高     |
| 同一规则反复常驻                   | 用户截图与Figma、UsageContent逐卡/末尾规则、ScopeDialog已有相同口径 | 删除页面描述和逐卡/页尾规则，集中进既有占用说明，不新建提示入口                                            | 本占用页 | 高     |
| 待核对与纯文字摘要难快速区分       | 用户反馈、UsageContent的unknown摘要与confirmed组成条件              | warning Chip单独呈现待核对数量与总量待确认；保留已登记字节、真实确认时间                                   | 本占用页 | 高     |

优先改启停Chip，属于用户明确要求的直接修正。精简说明与布局在同一局部原型呈现，用户随后明确“进行实施”，本局部方案已批准；组成条仍按数据完整性显示，与启停无关。

## 复用与具体实施方案

1. `src/components/analytics/usage-content.tsx`：存储名称和启停Chip同排，窄屏自然换行；启停状态与待核对状态分别消费真实enabled、unconfirmedObjects/confirmationStatus，不将停用视为故障。四类字节与非零已确认组成沿现有逻辑。确认时间保留，无时间时保留“尚未确认”事实。
2. `src/components/analytics/presentation.tsx`：仅将AnalyticsCard的title类型放宽为ReactNode以组合标题与Chip，不改变其他消费路由的渲染、样式或行为。
3. `src/components/analytics/screen.tsx`：仅占用视图去掉重复描述，保留其他视图描述、请求/错误/刷新/会话及导航行为。
4. `src/components/analytics/scope-dialog.tsx`：沿既有占用说明入口集中保留四类互斥、未知总量不绘完整比例、对象记录范围、停用不清零、清理成功后减少及外部删改限制；不新增弹窗或交互路径。

原型直接使用现有AdminShell、HeroUI Card/Chip/Button/Modal/CloseButton、Lucide图标与项目主题/字体/字节格式。启用不使用大面积绿色块；停用中性标签不暗示错误；待核对警示色仅表示实际待确认状态。桌面1440与手机390/360沿同一纵向顺序、卡片20px圆角、52px数据行和固定48px底部操作；普通标签不作为交互目标。

## 验证边界与结果

- 已实读HeroUI3.2.6官方Chip文档和本地类型，使用已有依赖，无新增依赖。
- 独立代码评审：Approve，无必修项。示例139856+13290=153146 B，待核对1；未知卡不绘完整比例，停用卡保留占用与已确认组成。
- `pnpm exec tsc --noEmit --project design-plans/issue179-review-v2/tsconfig.json`：最初原型位置退出0；随后移到独立原型应用以保留4181原服务。
- `pnpm exec next build design-plans/issue179-usage-review --webpack`：退出0，包含实际TypeScript检查；输出静态根路由。未运行生产构建/单元/集成，生产输入未变。
- 原型服务4182根路由实际HTTP200，返回页面含HeroUI三种状态标签、已确认组成条及现有说明入口，已精简常驻规则；该HTTP与HTML检查不证明客户端键盘/主题/布局行为。
- 浏览器：用户已明确允许恢复；Ego takeOverTaskSpace(2)仍返回任务已结束/浏览器暂停的硬停止，因此停止，不重试、不换空间或浏览器。桌面/手机/主题、键盘焦点、短视口及真实hover仍未验证，不能由编译或HTTP可用替代。下一次用户明确“继续浏览器检查”后，应按返回指示claimTaskSpace(2)，沿同一任务空间继续。
- 后续状态：用户明确“进行实施”后，产品已按本方案调整；最新实施、检查、Figma与未验证项统一见[实施记录](../../docs/verification/analytics-179/approved-implementation/usage-refinement/README.md)。此前原型检查保留当时输入，不作为产品或浏览器通过证据。

获批实施对应真实行为测试与原有默认analytics验证调用链：启停Chip可读、待核对独立、停用不清零、未知不画完整比例、说明收纳后必要口径可访问；按受影响范围执行项目检查、真实浏览器与独立设计复核。Figma同步对应桌面/手机占用及相关状态节点，回读截图后记录差异。

停止条件：接口需改、计数/对象责任变化、其他页面需重设或批准方案改变时先说明，不扩大到存储管理或统计其他视图。设计批准后在docs/design/handoff.md和docs/verification/analytics-179现有证据记录获批局部决策，不改冻结PRD，不另建通用规则。
