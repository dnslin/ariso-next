# 存储管理原型补充（2026-09-18）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

本批依据 [storage 规格](../../../specs/SPEC-storage.md) 与 PRD 第 9 节。新增桌面／手机各 42 个业务状态（含 05B 有引用编辑），另各 5 个分组阅读入口。存放于 12-B，原 12 主页面和其他分区位置不变。这里只记录设计覆盖，不能作为服务兼容性或业务完成证明。

## 阅读入口

| 流程          | 桌面                                                                         | 手机                                                                         |
| ------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 01 配置与保存 | [打开](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=347-2199) | [打开](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=347-4814) |
| 02 连接测试   | [打开](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=347-4843) | [打开](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=347-4852) |
| 03 浏览器直传 | [打开](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=347-4914) | [打开](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=347-4905) |
| 04 默认与启停 | [打开](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=347-4951) | [打开](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=347-4960) |
| 05 删除与清理 | [打开](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=347-5018) | [打开](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=347-5009) |

## 具体状态

| 编号 | 状态                         | 桌面                                                                             | 手机                                                                             |
| ---- | ---------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 01   | 配置已保存，等待连接测试     | [344:1913](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=344-1913) | [344:4287](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=344-4287) |
| 02   | 相对路径不正确               | [345:4226](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4226) | [345:4215](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4215) |
| 03   | 目录暂时无法写入             | [345:4237](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4237) | [345:4250](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4250) |
| 04   | 本地存储已创建               | [345:4263](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4263) | [345:4276](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4276) |
| 05   | 配置没有保存成功             | [345:4302](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4302) | [345:4289](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4289) |
| 05B  | 有引用的 S3 配置             | [350:4955](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=350-4955) | [350:4884](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=350-4884) |
| 06   | 正在测试连接                 | [345:4315](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4315) | [345:4410](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4410) |
| 07   | 连接测试通过                 | [345:4468](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4468) | [345:4563](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4563) |
| 08   | 连接失败：测试对象可公开读取 | [345:4621](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4621) | [345:4716](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4716) |
| 09   | 连接失败：写入被拒绝         | [345:4777](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4777) | [345:4764](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4764) |
| 10   | 此 Bucket 暂不支持           | [345:4790](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4790) | [345:4801](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4801) |
| 11   | 尚无法确认 Bucket 支持范围   | [345:4825](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4825) | [345:4812](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=345-4812) |
| 12   | 确认 R2 Bucket 锁定设置      | [346:4351](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4351) | [346:4338](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4338) |
| 13   | 项目素材已启用               | [346:4364](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4364) | [346:4459](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4459) |
| 14   | 这次检测结果已失效           | [346:4507](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4507) | [346:4520](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4520) |
| 15   | 未能确认匿名访问被拒绝       | [346:4546](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4546) | [346:4533](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4533) |
| 16   | 连接测试失败：对象删除失败   | [346:4577](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4577) | [346:4559](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4559) |
| 17   | 浏览器直传设置               | [346:4712](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4712) | [346:4807](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4807) |
| 18   | CORS 配置示例                | [346:4865](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4865) | [346:4876](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4876) |
| 19   | 正在检测浏览器直传           | [346:4905](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4905) | [346:4887](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4887) |
| 20   | 浏览器直传可用               | [346:5048](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5048) | [346:5030](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5030) |
| 21   | 直传检测失败                 | [346:5183](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5183) | [346:5278](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5278) |
| 22   | 请从配置的站点地址检测       | [346:5337](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5337) | [346:5326](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5326) |
| 23   | 直传检测结果已失效           | [346:5348](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5348) | [346:5361](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5361) |
| 24   | 项目素材                     | [346:5374](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5374) | [346:5469](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5469) |
| 25   | 管理项目素材                 | [346:5527](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5527) | [346:5542](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5542) |
| 26   | 默认存储已更新               | [346:5570](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5570) | [346:5557](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5557) |
| 27   | 项目素材 · 默认存储          | [346:5601](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5601) | [346:5583](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5583) |
| 28   | 清空默认存储？               | [346:5739](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5739) | [346:5726](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5726) |
| 29   | 未设置默认存储               | [346:5770](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5770) | [346:5752](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5752) |
| 30   | 停用默认存储“项目素材”？     | [346:5885](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5885) | [346:5898](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5898) |
| 31   | 默认存储已停用               | [346:5911](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5911) | [346:6021](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6021) |
| 32   | 配置已更新，需要重新测试     | [346:6054](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6054) | [346:6067](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6067) |
| 33   | 暂时不能启用此存储           | [346:6080](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6080) | [346:6093](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6093) |
| 34   | 暂时不能删除此存储           | [346:6106](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6106) | [346:6201](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6201) |
| 35   | 检测已结束，仍在收尾清理     | [346:6259](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6259) | [346:6272](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6272) |
| 36   | 测试对象清理失败             | [346:6285](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6285) | [346:6298](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6298) |
| 37   | 本次测试对象已清理           | [346:6311](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6311) | [346:6324](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6324) |
| 38   | 删除空存储配置？             | [346:6350](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6350) | [346:6337](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6337) |
| 39   | 存储配置已删除               | [346:6374](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6374) | [346:6363](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6363) |
| 40   | 还没有存储                   | [346:6403](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6403) | [346:6385](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6385) |
| 41   | 所有存储均已停用             | [346:6498](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6498) | [346:6593](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6593) |

## 本批表达的规则

- 新 S3 先保存为停用，再测试、手动启用。原创建页的测试按钮改为“保存后测试”禁用状态；保存接入新增待测试页，列表的“项目素材”配置接入新详情。本地创建接入成功反馈。
- 本地相对路径错误、目录不可写、创建成功和 S3 保存失败分别展示。路径错误保留具体输入／目录与可诊断错误。
- 有引用的 S3 编辑页单独保留“项目素材”样例。Endpoint、Region、Bucket、Prefix 标只读，Path Style 不可操作；两项密钥分别显示“已设置 · 留空保留”。位置或凭据变化后停用并失效检测，仅改名不会失效。
- 连接报告区分写入、鉴权读取、匿名读取与删除。匿名可读、匿名响应不确定、删除失败均不算通过；不写“Bucket 完全安全”。通过只代表当前测试对象结果，仍要求 Bucket 私有且关闭旁路公共访问。
- 版本控制 Enabled／Suspended 与对象锁暂不支持。缺少读取配置权限不能算通过；R2 整个 Bucket 无锁定规则的所有者确认与自动检查分开说明。原型不证明任何真实服务已兼容。
- 浏览器直传与连接状态分开。直传失败不自动停用存储，后续新 Web 上传可中转，已开始上传不换链路。通用 API 始终中转。
- 直传通过状态要求样本响应、服务器核验及当次对象删除成功。可写窗口仍未结束时，单独保留收尾清理引用，不把“当前对象已删除”当作“所有清理责任结束”。
- 默认可清空、可停用，系统不补选。默认变化只影响新的上传。停用拒绝新内容与上传，但保留记录管理、回收与永久删除；已签发的 S3 读取地址最长剩余 5 分钟可能仍可访问。
- 删除阻塞列出图片／版本、上传会话、处理／删除任务和探测清理。分类可能重叠，不冒充图片总数；不提供强制删除。清理一个探测对象不代表其他引用已解除。
- 删除空存储使用独立“历史项目”样例。确认受管对象清理后删除配置并清空默认；不删除 Bucket、挂载根目录或其他应用文件。

## 演示边界与剩余设计

原型使用固定数据。新建／管理主线以“项目素材”为例；本地创建以“博客归档”为例，空存储删除是独立样例。列表、旧编辑页及返回状态不会随前一个画板的操作实时更新。阅读指引可直接进入失败、失效和全部停用等分支；“查看检测结果”“刷新清理状态”“重试”展示预设结果，不执行网络探测或计时。R2 确认进入共用测试样例，不代表实际能力识别或检测报告已按服务动态生成。

有引用编辑页的保存连线演示“凭据已修改”的结果，不是空字段提交校验；只改名称保留测试的规则已写明，真实输入及组合状态在实施时验证。旧通用保存／测试反馈仍作为历史示例保留，本批状态以 12-B 和本记录为准。

以下未关闭：

- CORS 示例的真实复制、复制失败反馈、从配置 origin 打开的完整入口；正式请求头与 AWS/R2/MinIO 实测对齐后定稿示例，不把当前示例视为完整生产配置。
- 本地有引用字段锁定、类型切换、全部表单字段错误与保存中／并发失败的详细组合；R2 专用完整报告与清理重试再次失败。
- 与上传／图片处理联动的目标被删、签名到期、源对象变化、停用途中中断与恢复；将失败图片、版本及任务清理落实到关联页面。
- 占用的待核对对象、四类组成与读取失败已有[统计专项](./analytics-flow-2026-09-19.md)；真实对象核对、责任去重与未知字节仍按 analytics 工程验收。
- 深色、360／430／768px、键盘焦点与弹层返回、软键盘及真实滚动／触屏验证。

因此 DES-06-STORAGE 仍是“本批核心状态已补，剩余组合和实际交互待验证”，不整体标记完成。下一批继续图片处理与水印，并接续上传／存储异常联动。

## 验证

回读两端共 94 个新增画板／阅读入口，核对可见节点水平越界、状态行列坐标、固定底栏、目标存在与同端跳转、分区内重叠及边界；检查旧分组位置与尺寸未变化。截图抽查保存后、测试通过、删除测试失败、版本不支持、直传通过、清理失败、删除阻塞、编辑页与阅读指引。

手机报告使用纵向文字，桌面报告使用一致列宽。图内编辑输入复用组件属性覆盖，避免只修改文字却仍显示旧组件值。空白模板已移除。

证据见 [存储审计记录](./verification/storage-flow-2026-09-18.json)。执行本批文档的项目 Prettier 格式化与检查、`git diff --check`，并核对 JSON 中状态数量、底栏和位置；未运行播放器、真实服务测试、应用测试或构建。

## 阅读指引对齐修订（2026-09-18）

按用户反馈，两端十张阅读指引的 84 个入口改为固定编号列（36 px）和左对齐标题；每行编号从 x=16 开始，标题从 x=64 开始。画板位置、尺寸及原目标不变。同时统一上传／相册共 60 个普通阅读按钮的左对齐。

节点与前后位置／目标比对见[阅读入口审计](./verification/guide-alignment-2026-09-18.json)。截图复核两端浏览器直传指引；未执行播放器。

## 六项并行补充（2026-09-19）

有引用本地类型／路径只读、保存状态及探测对象再次清理失败见[R5](./parallel-forms-exceptions-2026-09-19.md)。 本文此前剩余清单按原批次保留，当前交付与尚待工程验证的范围以[六项统一目录](./parallel-design-completion-2026-09-19.md)及对应专项为准，不再把上述代表设计记为尚未补图。
