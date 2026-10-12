# 存储详情和引用清理更紧凑

状态：2026-10-11 用户批准实施，产品修改及定向运行检查已完成，等待人工验收。具体通过项和未验证项见 [本轮实施记录](../../docs/verification/m2-85/ui-refinement/20261011/README.md)。

Written against: `67d413652db8bfa055697e6bfe2d4894568bf5c1`。

## Evidence chain

- Surface：`/settings/storage`、`/settings/storage/[id]`、引用与清理视图。
- Problem：用户截图 4、5、6 指出返回按钮长且使用字符箭头，路径重复，规则说明占据多行和整个表格第三列。
- Design evidence：本轮用户要求简短“返回”与真实图标；设计交付规范允许 Tips，要求保留真实阻塞和操作后果。
- Owner：`src/components/storage/storage-editor.tsx:641`、`storage-form.tsx:332`、`storage-reference-view.tsx:54`；清理子视图位于 `storage-maintenance-view.tsx`。
- Scope and affected surfaces：本地/S3/添加/已有引用的存储详情、引用状态和清理状态；返回目的地及未保存确认均由原调用链维护。
- Uncertainty：本地/S3、锁定字段、返回与引用跳转、帮助及字段错误已做定向检查；有效保存、连接测试、扫描和删除未在本轮浏览器专项重跑。

## Design decision

以“标题、短状态、具体字段、操作”组织页面。将操作规则收进现有帮助，使用图标辅助扫读，完整路径保留一处可查看和复制的展示。

## Reuse

- StorageTip、HeroUI Button / Link / Chip / Accordion、现有字段与状态组件。
- Lucide ArrowLeft、HardDrive、Cloud、Folder、Link2、ListChecks、Trash2；保留文字标签。
- Exemplar：现有存储字段前缀图标和 `src/components/storage/storage-tip.tsx`。

## Changes

1. 返回入口统一为 ArrowLeft 加“返回”，放在标题同排的右侧，不使用 `‹`、`<`、`←` 文本模拟图标。链接/回调仍回到原本目标；保留未保存确认和原状态恢复。
2. 删除“管理本地目录、启用状态与默认存储”等标题复述；实际“被 N 张图片引用”、只读原因、待核对状态保留为短状态。
3. 相对路径保留现有字段。完整实际目录只显示一处，支持复制和长路径展开/换行。不要重复插入根目录到说明段落中。相对路径规则及其他硬盘挂载说明收进该字段旁的 StorageTip。
4. 存储列表按类型用 HardDrive / Cloud；详情主操作补合适图标。返回、引用、维护、删除继续有短文字，不用一排难以理解的裸图标。
5. 引用视图固定标题“引用与清理”，显示真实“无引用”或“仍有引用”状态。用紧凑的“图标 + 类别 + 实际数量”列表替代当前三列表格的常规说明列。
6. 将“包含正常、失败、处理中及回收站”“分类可能重叠”等规则集中进一个引用说明入口。零引用时移除常驻水绿说明条；不能将“无引用”改成“可以安全删除”。
7. 有实际阻塞时直接显示对应非零类别和处理入口。活动写入、失败清理、未知删除结果保持直接可见。删除配置前的检查和必要后果在原确认流程中保留。

## Scope

- Inherit：本轮存储详情、引用与清理视图的各业务状态。
- Verify：本地/S3、未保存、锁定字段、启停、失败、待核对、零引用和有引用。
- Exclude：真实存储身份、凭据处理、连接测试、删除判定、孤儿扫描算法和后端协议。

## Validation

- Product：返回仍有正确目标；已保存值、未保存值和未知结果不混淆；零引用不误报可删除。
- Interface：桌面/手机浅深色，长路径/长名称、短视口和帮助关闭后焦点回归。
- System：优先复用当前存储组件，不引入跨模块新帮助体系。
- Repository：已更新与文案呈现相关的断言并保留删除/核对行为验证；定向存储单测、静态、类型、构建与受影响浏览器场景的实际命令和结果在本轮证据中另记。

## Stop conditions

- 精简需要删除诊断路径、隐藏当前阻塞、改变删除资格或清理行为时，重新评审。

## Design documentation

- 设计交付规范已记录批准的返回和存储信息层级；数据规则无变化。Figma 正常态补充及代表结构对照见 [方案总览](README.md#产品实施与-figma)，不宣称全部历史状态逐图通过。
