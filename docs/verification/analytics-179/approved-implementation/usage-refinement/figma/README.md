# 获批占用页精简：Figma 同步

2026-10-10，用户批准新占用页精简原型并要求实施、同步 Figma。本记录只证明 Figma 可编辑设计和导出复核，不替代本轮真实页面、浏览器或人工验收。

## 范围与依据

实际读取 [原型说明](../../../../../../design-plans/issue179-usage-review/README.md)、原型 app/page.tsx、真实 UsageContent/ScopeDialog 契约、完整 handoff，使用 figma-use、figma-design-to-code、figma-generate-design；三种局部 Chip 使用 figma-generate-library 的组件复用和主题变量约定。

先对原待核对451:17337/17648获取设计上下文及截图，再读已确认451:16780/17096与既有说明452:4005/8758。1017:16852容器没有占用状态，因此就地更新六个适用节点，没有重复新建占用页。保留公共侧栏、品牌、账号、移动页头、面包屑与固定底栏。

已检查 Code Connect（没有映射）、现有按钮/Clock/Check/StatusChip、样式及主题变量。文件无已订阅组件库；文件库搜索 Chip/Pause/success/warning 均无结果。新增仅本任务三种语义 Chip、四个必需颜色变量及一个小号标签文字样式。Check/Pause来自已安装Lucide 1.47.0实际SVG，Clock复用1018:16899；没有导入整页截图或图片填充。字体写入前等待加载 Noto Sans SC、Inter 和 Caveat 的实际字重。

## 当前节点与截图

| 内容                              | 桌面                                                                                                       | 手机                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 已确认，启用与停用均保留组成      | [451:16780](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-16780) · [图](./451-16780.png) | [451:17096](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-17096) · [图](./451-17096.png) |
| 待核对，独立warning且未知卡无组成 | [451:17337](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-17337) · [图](./451-17337.png) | [451:17648](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-17648) · [图](./451-17648.png) |
| 既有占用说明                      | [452:4005](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=452-4005) · [图](./452-4005.png)    | [452:8758](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=452-8758) · [图](./452-8758.png)    |

整页桌面1440×1080、手机390×844；说明弹窗480×328、358×369。[三种 Chip 构建资产](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1034-19241)及[图](./1034-19241.png)用于展示复用组件，不是新增产品页面或状态。七张图片均是Figma导出。

## 实际同步与逐项复核

- 已启用为 success soft 小标签及Check，已停用为 foreground 8%浅灰背景、muted文字及Pause；两者不承载普通说明。待核对独立warning小标签。
- 去掉页面泛描述、每卡互斥/比例规则与停用不清零的常驻文字、页尾清理说明。集中现有占用说明，保留“包含已登记候选、旧对象、上传临时及探测对象”及数据库/日志/宿主机文件排除范围、停用不清零、清理成功减少、外部删改限制。
- 总计为已登记，旁边Clock显示generatedAt；每卡Clock显示confirmedAt。空确认时间、组成仅在confirmed且非零时绘制、与enabled独立，均记录组件注记。
- 原四组GiB设计示例及合计保留：3.2=2+.8+.2+.2，5.4=4+1.2+.1+.1，总计8.6；没有读取真实预览数据。数据行仍为52px、四组互斥，移除旧空白列后标签与数值两端对齐。卡片20px圆角、相同纵向顺序与固定48px底部按钮保留。
- 说明三段逐字对齐实际产品scope-dialog。右上CloseButton仅detach两个本地实例，实际读取HeroUI close-button.css后同步44px目标、12px圆角、bg-default背景和16px SVG；hover bg-default-hover、pressed scale(.93)、减少动态效果与focus-visible沿库默认写注记，未改共享IconButton。正文可滚动、Esc及焦点恢复仍为交付注记，未声称已执行交互。

首次导出发现绑定画笔覆盖透明度、实例未继承软色，以及旧四列表格空列导致数值偏离右侧，已修正。本轮复核先看整页公共区、标题/摘要/卡片/底栏，再看标签颜色图标、四组数值、比例与确认时间，最后看弹窗层级及范围。修正后重新导出受影响的四页和组件资产并逐图查看；随后按实际产品三段文案与HeroUI CloseButton修正两张说明并重导复核。新增、改动、删除ID，最终可编辑层清单、画笔读回及字体见 [manifest](./manifest.json)。其中复用的旧451前缀标题/数据行明确列为移动层，不记作新建。

## 完成与限制

Figma六节点就地同步、七图导出及人工逐图复核完成。中间写入脚本在 /tmp/ariso179-figma-sync，未留在仓库；未改产品代码、提交或推送。

浏览器处于硬停止，本轮未操作。真实页面对照、主题、360px、短视口、键盘/焦点和滚动均仍未验证，不能由这些Figma截图代替。未新增暗色/零占用画板；这些数据边界通过组件注记交接，产品检查单独记录。既有手机公共Header沿原节点保留菜单文字，本次未扩展公共组件改动。独立设计评审见同级后续报告，产品与人工验收见[本轮证据](../README.md)。
