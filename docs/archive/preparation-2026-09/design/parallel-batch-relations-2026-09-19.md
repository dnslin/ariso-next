# 批量相册与标签补充设计（2026-09-19）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

已完成桌面、手机各46个根画板（1个阅读入口、45个业务状态），限于新分区 R1。依据 [SPEC-library](../../../specs/SPEC-library.md) 第7节与 [SPEC-collections](../../../specs/SPEC-collections.md) 第4节，以及 [图库原流程](./library-flow-2026-09-18.md)。未修改旧分区、共享组件、应用代码或相册固定展示规则。

- [桌面阅读入口](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11557) · [07 · 图库与图片详情](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1014)
- [手机阅读入口](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12024) · [07 · 图库与图片详情](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2268)
- [验证记录](./verification/parallel-batch-relations-2026-09-19.json)

## 主线与固定数据

四张图片按真实样式逐项展示：第1页 forest-light.jpg / IMG-A01、waterfall.jpg / IMG-A02；第2页 mountain-mist.jpg / IMG-B01、city-lines.jpg / IMG-B02。图库范围为“已就绪”，已选清单共4张；不是一次选中全部筛选结果。

四个动作各自从同一4张固定快照开始：添加到相册、从相册移除、添加标签、移除标签。入口 → 选择0/1/2个目标 → 提交4张 → 逐项结果。相册目标包括两个同名“山野之间”，以封面、48/12张、创建日期及短ID 7A12/9B44区分；标签使用旅行与灵感的固定ID。可从任一目标开始选择，并可逐项取消。

双目标结果固定为2张已修改、1张无需修改、1张失败。每张结果显示名称、ID、页码、缩略图与原因。完成和无需修改的3张取消勾选；第2页失败图仍属于当前查询，保留1张。重试仅提交这1张；再次失败仍保留同一张，可返回清单后再次重试。单目标结果为2张已修改、2张无需修改、0失败，4张全部取消选择。

每张图片的多个关系在同一事务保存。任一目标失效时该图整项失败，不保存一半目标关系；其他图片继续。重复添加或本来不存在的移除为无需修改。移除关系不删除图片，也不修改其他关系。

结果未知分支：响应丢失 → 先核对4张实际关系 → 核对失败时保留待核对 → 再次核对后展示已确认的逐项结果；没有自动重新提交。关系操作直接确认保存结果，没有任务“受理即成功”的状态。

失败图已经回收的分支保留错误说明，但取消勾选；回收图使用“已回收”占位，不展示缩略图。返回图库展示剩余3张、已选0张。相册内移除分支默认当前相册7A12，4张成功移出，48→44张、已选0张；后续画板是清空选择摘要，不是44张剩余成员的完整列表。相册内容仍按加入时间倒序，不提供排序控制。

## 节点表

桌面4列、手机4列，编号从左到右、从上到下。34—45为单目标选择的补充状态，由选择器直接进入，不扩展更多样例数据。

| 编号 | 状态                              | 桌面                                                                               | 手机                                                                               |
| ---- | --------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 00   | 批量相册与标签                    | [522:11557](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11557) | [522:12024](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12024) |
| 01   | 已选 4 张图片                     | [522:11666](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11666) | [522:12056](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12056) |
| 02   | 相册与标签操作                    | [522:11802](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11802) | [522:12115](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12115) |
| 03   | 添加到相册（0个目标）             | [522:11905](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11905) | [522:12141](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12141) |
| 04   | 添加到相册（1个目标）             | [522:12937](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12937) | [522:13647](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13647) |
| 05   | 添加到相册（2个目标）             | [522:13055](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13055) | [522:13688](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13688) |
| 06   | 添加到相册 · 1张失败              | [522:13173](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13173) | [522:13729](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13729) |
| 07   | 仍选中 1 张失败图片               | [522:13311](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13311) | [522:13790](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13790) |
| 08   | 重试后仍有 1 张失败               | [522:13419](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13419) | [522:13821](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13821) |
| 09   | 从相册移除（0个目标）             | [522:13529](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13529) | [522:13854](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13854) |
| 10   | 从相册移除（1个目标）             | [523:10778](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-10778) | [523:11478](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-11478) |
| 11   | 从相册移除（2个目标）             | [523:10896](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-10896) | [523:11519](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-11519) |
| 12   | 从相册移除 · 1张失败              | [523:11014](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-11014) | [523:11560](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-11560) |
| 13   | 仍选中 1 张失败图片               | [523:11152](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-11152) | [523:11621](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-11621) |
| 14   | 重试后仍有 1 张失败               | [523:11260](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-11260) | [523:11652](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-11652) |
| 15   | 添加标签（0个目标）               | [523:11370](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-11370) | [523:11685](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-11685) |
| 16   | 添加标签（1个目标）               | [523:11724](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-11724) | [523:12404](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-12404) |
| 17   | 添加标签（2个目标）               | [523:11832](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-11832) | [523:12435](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-12435) |
| 18   | 添加标签 · 1张失败                | [523:11940](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-11940) | [523:12466](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-12466) |
| 19   | 仍选中 1 张失败图片               | [523:12078](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-12078) | [523:12527](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-12527) |
| 20   | 重试后仍有 1 张失败               | [523:12186](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-12186) | [523:12558](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-12558) |
| 21   | 移除标签（0个目标）               | [523:12296](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-12296) | [523:12591](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-12591) |
| 22   | 移除标签（1个目标）               | [523:12698](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-12698) | [523:13407](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-13407) |
| 23   | 移除标签（2个目标）               | [523:12806](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-12806) | [523:13438](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-13438) |
| 24   | 移除标签 · 1张失败                | [523:12914](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-12914) | [523:13469](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-13469) |
| 25   | 仍选中 1 张失败图片               | [523:13052](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-13052) | [523:13530](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-13530) |
| 26   | 重试后仍有 1 张失败               | [523:13160](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-13160) | [523:13561](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-13561) |
| 27   | 操作结果待核对                    | [523:13270](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-13270) | [523:13594](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-13594) |
| 28   | 暂时无法核对结果                  | [523:13654](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-13654) | [523:14425](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-14425) |
| 29   | 失败图片已移出选择                | [523:13793](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-13793) | [523:14487](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-14487) |
| 30   | 山野之间 · 已选4张                | [523:13928](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-13928) | [523:14545](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-14545) |
| 31   | 已移出当前相册                    | [523:14064](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-14064) | [523:14604](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-14604) |
| 32   | 山野之间                          | [523:14201](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-14201) | [523:14664](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-14664) |
| 33   | 图库 · 已选0张                    | [523:14299](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-14299) | [523:14685](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-14685) |
| 34   | 添加到相册（仅第二目标）          | [523:14738](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-14738) | [523:15526](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-15526) |
| 35   | 添加到相册 · 操作完成（第一目标） | [523:14856](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-14856) | [523:15567](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-15567) |
| 36   | 添加到相册 · 操作完成（第二目标） | [523:14994](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-14994) | [523:15628](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-15628) |
| 37   | 从相册移除（仅第二目标）          | [523:15132](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-15132) | [523:15689](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-15689) |
| 38   | 从相册移除 · 操作完成（第一目标） | [523:15250](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-15250) | [523:15730](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-15730) |
| 39   | 从相册移除 · 操作完成（第二目标） | [523:15388](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-15388) | [523:15791](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=523-15791) |
| 40   | 添加标签（仅第二目标）            | [524:11287](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=524-11287) | [524:12138](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=524-12138) |
| 41   | 添加标签 · 操作完成（第一目标）   | [524:11395](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=524-11395) | [524:12169](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=524-12169) |
| 42   | 添加标签 · 操作完成（第二目标）   | [524:11533](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=524-11533) | [524:12230](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=524-12230) |
| 43   | 移除标签（仅第二目标）            | [524:11671](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=524-11671) | [524:12291](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=524-12291) |
| 44   | 移除标签 · 操作完成（第一目标）   | [524:11779](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=524-11779) | [524:12322](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=524-12322) |
| 45   | 移除标签 · 操作完成（第二目标）   | [524:11917](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=524-11917) | [524:12383](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=524-12383) |

## 核验与修正

回读92个根画板：横向无越界、分区内无重叠、字体仅Noto Sans SC/Inter/Caveat、底部操作栏独立于内容滚动区、所有引用目标存在。两端各176条本批交互已接线。逐项验证结果加总、目标勾选数量、4张/1张作用范围及正常图片每项一个缩略图。

截图核对两端混合结果，另抽查手机双目标、单目标结果、重试失败与阅读入口。修复了首批自动布局高度与缩略图裁切：原卡片实例外框虽为64×64，内部照片仍为271×190；已将本批196处缩略图改为同一图片hash的独立缩略矩形，最终截图能辨认森林湖面、瀑布、雪山和城市建筑。未修改源组件。手机混合结果4项及失败说明完整可见；更多内容在独立正文区滚动。

桌面分区 x=200、y=96754、6600×14650；手机 x=200、y=79994、2200×11650。两者均在授权范围内。旧业务菜单不接入4张快照，避免与已有12张选择产生数量冲突。统一文档目录直达本批00入口，旧阅读入口不扩高、不挤压，旧业务入口保持。

## 已执行检查与剩余工程范围

执行本批两文件的项目Prettier格式化和检查，以及 `git diff --check`，结果见验证记录。未运行应用测试、类型检查或构建，因为本批只写Figma及设计文档，没有实现业务代码。

这是固定可点击原型，不代表真实查询、存储事务、任意选择、网络核对或浏览器保存已验证。未声称Figma播放器通过登录后的交互已验证。超过200项分批、更多目标的动态选择、目标在执行中删除、真实请求取消/恢复、键盘焦点与真实浏览器交互仍须工程验收。未新增后台队列，也未恢复相册排序。
