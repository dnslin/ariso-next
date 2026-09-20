# 回收站、恢复与永久删除原型（2026-09-18）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

本批新增桌面／手机各 29 个业务状态和 5 个阅读入口，原位修订主列表、搜索无结果及恢复／删除弹窗。依据 [SPEC-library §9](../../../specs/SPEC-library.md)、[SPEC-media §11](../../../specs/SPEC-media.md)、collections 的恢复关系和 delivery 的既有地址有效期规则。

- 桌面 11-B：[11 · 回收站](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2272)
- 手机 11-B：[11 · 回收站](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2280)
- [节点与检查记录](./verification/trash-flow-2026-09-18.json)

## 阅读顺序

按记录与访问、恢复、永久删除与清理、停用存储与结果核对、跨页批量五组排列。每组先放阅读指引，再按编号从左到右、从上到下阅读。其他分组及全部原有回收站根画板保持原坐标和尺寸。

| 编号 | 状态                       | 桌面                                                                             | 手机                                                                             |
| ---- | -------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1    | 回收记录                   | [405:6888](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-6888) | [405:6735](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-6735) |
| 2    | 回收记录操作               | [406:3299](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=406-3299) | [406:7174](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=406-7174) |
| 3    | 回收站为空                 | [405:7078](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7078) | [405:6767](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-6767) |
| 4    | 回收后的访问边界           | [405:8791](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8791) | [405:8956](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8956) |
| 5    | 恢复这张图片？             | [405:7266](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7266) | [405:6797](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-6797) |
| 6    | 图片已恢复                 | [405:7279](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7279) | [405:6810](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-6810) |
| 7    | 已恢复，部分关系已失效     | [405:7292](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7292) | [405:6823](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-6823) |
| 8    | 记录已恢复，存储仍停用     | [405:7305](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7305) | [405:6836](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-6836) |
| 9    | 恢复采用最新处理结果       | [405:7318](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7318) | [405:6849](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-6849) |
| 10   | 当前记录无法恢复           | [405:7331](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7331) | [405:6862](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-6862) |
| 11   | 恢复失败                   | [405:7344](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7344) | [405:6875](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-6875) |
| 12   | 永久删除这张图片？         | [405:7357](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7357) | [405:7839](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7839) |
| 13   | 已加入删除队列             | [405:7370](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7370) | [405:7852](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7852) |
| 14   | 等待当前处理结束           | [405:7383](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7383) | [405:7865](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7865) |
| 15   | 正在清理文件               | [405:7396](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7396) | [405:7878](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7878) |
| 16   | 连接中断，正在重试         | [405:7586](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7586) | [405:7910](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7910) |
| 17   | 部分文件清理失败           | [405:7599](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7599) | [405:7923](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7923) |
| 18   | 正在重试剩余清理           | [405:7789](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7789) | [405:7955](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7955) |
| 19   | 永久删除完成               | [405:7802](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7802) | [405:7968](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7968) |
| 20   | 存储停用，仍可永久删除     | [405:7813](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7813) | [405:7979](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7979) |
| 21   | 永久删除停用存储中的图片？ | [406:3314](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=406-3314) | [406:7189](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=406-7189) |
| 22   | 删除任务已受理             | [406:3327](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=406-3327) | [406:7202](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=406-7202) |
| 23   | 操作结果待核对             | [405:7826](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7826) | [405:7992](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7992) |
| 24   | 已选 12 张图片             | [405:8005](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8005) | [405:8802](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8802) |
| 25   | 恢复已选 12 张？           | [405:8195](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8195) | [405:8834](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8834) |
| 26   | 恢复完成，部分未恢复       | [405:8208](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8208) | [405:8847](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8847) |
| 27   | 永久删除已选 12 张？       | [405:8398](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8398) | [405:8879](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8879) |
| 28   | 删除请求已处理             | [405:8411](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8411) | [405:8892](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8892) |
| 29   | 批量清理进度               | [405:8601](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8601) | [405:8924](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8924) |

主列表沿用 [30:1037](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-1037) / [102:852](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-852)。原“第 2 页”改为搜索无结果 [62:905](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=62-905) / [102:5621](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-5621)，主列表统一显示 8 条记录、每页 40 条、共 1 页，删除旧每页 5 条的冲突样例。

## 本批呈现

- 原列表真实缩略图全部移除，使用通用记录标记，展示名称、原文件大小、原存储、可见性、处理状态与回收时间。详情只读，不提供内容预览、下载、复制外链或重处理。
- 恢复保留 ID、原可见性、幸存关系及原加入时间；不重建已删相册或标签，不关联同名新目标。回收期间处理完成的图片采用实际最新结果。
- 存储停用可以恢复记录，内容仍不可读取；也可以永久删除，无需先启用存储。实际权限或网络错误按清理失败反馈。
- 任务受理、排队、等待当前写入结束、清理中与全部完成分开。永久删除一旦受理就不可恢复，关闭页面不终止任务。
- 临时失败仅自动重试一次；权限不足直接失败。手动重试只处理剩余对象，保留已确认清理结果。剩余对象大小未知显示“待核对”。
- 只有所有文件及活动写入责任清空后才移除记录。清理失败保留引用，不允许恢复，也不能因此删除存储配置。
- 批量确认显示当前页／其他页数量。区分已受理、已在删除中、受理失败和执行后失败；符合当前查询的失败项继续保留选择。没有“清空所有筛选结果”入口。
- 已签发 S3 地址可能在剩余最多 5 分钟内有效；已开始的传输和访客保存的内容无法撤回，不承诺立即撤回所有内容。
- 主列表分页及状态页操作栏独立固定，正文在上方滚动。阅读按钮采用固定编号列和左对齐标题。

## 固定样例边界与剩余范围

这些是设计状态与固定跳转，不是可操作的数据系统。主列表展示 8 条记录；“选择记录”进入独立的跨页 12 张样例，不表示从这 8 条中产生 12 张选择。第一条记录进入详情，其余行未逐项接入不同详情；输入框跳到固定的 summer 无结果页，不支持真实输入。清理页的刷新展示后续示例，不会查询或执行删除。

恢复后“前往图库”返回已有图库入口，尚未把每一恢复分支后的具体图片、关系、封面和列表状态做成连续数据演示。删除完成后返回的主列表也是独立固定样例，不能作为已删除记录消失的运行验证。批量结果暂用汇总和代表明细，未覆盖逐项展开、跨 200 个 ID 分批、选择变化及迟到响应的全部组合。

仍需补：完整筛选／排序／逐项选择控件、独立加载失败、每种提供方错误的恢复路径、深色和更多尺寸。键盘、播放器、真实存储故障、任务重启和有限重试预算必须在开发阶段验证。DES-06-TRASH 保持待查看和交互验收，不整体标完成。

## 本轮验证

回读桌面 40、手机 39 个新增及既有画板／入口，共 79 个。检查无 IMAGE 填充、无横向溢出、无失效目标，底栏与画板底部对齐；所有旧分区、回收站根画板的坐标和尺寸保持不变，新分组与画板无重叠。抽查桌面／手机主列表、手机清理失败、永久删除确认及阅读指引截图；修正搜索框对齐和旧弹窗换行。

文档运行项目现有 Prettier 格式化／检查、Python JSON 检查和 `git diff --check`。没有运行应用测试、构建、播放器或真实文件清理。没有修改应用代码、安装依赖、创建 Issue 或提交。

## 六项并行补充（2026-09-19）

清理剩余对象与再次重试失败见[R5](./parallel-forms-exceptions-2026-09-19.md)。永久删除记录不恢复，已清理对象不重复删除，剩余责任和引用保留。 本文此前剩余清单按原批次保留，当前交付与尚待工程验证的范围以[六项统一目录](./parallel-design-completion-2026-09-19.md)及对应专项为准，不再把上述代表设计记为尚未补图。
