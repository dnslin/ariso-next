# 表单校验与异常细节（2026-09-19）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

本批直接补齐桌面、手机各 16 个根画板（00 阅读入口与 15 个状态），仅写入 R5 新分区。依据 SPEC-media §4、§7、§11 和 SPEC-storage §4、§5、§9，不新增校验规则。重处理开关范围由 R2 负责。

- [桌面阅读入口](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-11746)
- [手机阅读入口](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-11532)
- [验证记录](./verification/parallel-forms-exceptions-2026-09-19.json)

## 新分区与状态

桌面分区 `529:12485` 位于 page `0:1`，最终位置 (200, 111904)，尺寸 6600 × 4880。手机分区 `529:12486` 位于 page `97:748`，最终位置 (200, 92144)，尺寸 2200 × 3924。均按四列、从左到右再从上到下排列。旧分区及根画板位置尺寸未修改。

| 编号 | 状态             | 桌面                                                                               | 手机                                                                               |
| ---- | ---------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 00   | 表单校验与异常   | [530:11746](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-11746) | [530:11532](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-11532) |
| 01   | 检查处理参数     | [530:11876](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-11876) | [530:11585](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-11585) |
| 02   | 检查文字水印     | [530:12005](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-12005) | [530:11637](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-11637) |
| 03   | 检查水印外观     | [530:12134](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-12134) | [530:11689](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-11689) |
| 04   | 检查图片水印     | [530:12527](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-12527) | [530:12316](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-12316) |
| 05   | 图片处理设置     | [530:12659](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-12659) | [530:12371](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-12371) |
| 06   | 本地存储配置     | [530:12788](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-12788) | [530:12423](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-12423) |
| 07   | 正在保存配置     | [530:12917](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-12917) | [530:12475](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-12475) |
| 08   | 配置已保存       | [530:13046](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-13046) | [530:13539](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-13539) |
| 09   | 配置没有保存成功 | [530:13173](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-13173) | [530:13589](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-13589) |
| 10   | 正在重试剩余清理 | [530:13297](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-13297) | [530:13636](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-13636) |
| 11   | 剩余清理再次失败 | [530:13418](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-13418) | [530:13680](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-13680) |
| 12   | 测试对象仍未清理 | [530:13724](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-13724) | [530:13966](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-13966) |
| 13   | 预览文件仍未清理 | [530:13845](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-13845) | [530:14010](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14010) |
| 14   | 正在保存处理设置 | [530:14126](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14126) | [530:14384](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14384) |
| 15   | 处理设置已保存   | [530:14255](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14255) | [530:14436](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14436) |

## 已补差异与复用规则

原 14-B 参数错误只有汇总弹窗。本批 01–04 使用现有 Input 实例，在字段下呈现错误、红色边框与原始值。01 同时覆盖质量、最长边和透明 JPEG 背景。02–03 覆盖文字、字体、颜色、描边颜色、相对字号、描边、透明度、位置与边距。04 覆盖图片水印素材和相对宽度，并保持透明度、位置、边距的有效示例。

01 最长边字段可点击进入 05 修正后的固定场景。05→14→15 呈现保存中与保存结果。最长边允许留空或 1–32768 整数，JPEG 背景为 #RRGGBB；透明输入按背景合成，缩放仅缩小不放大。文字为 1–200 Unicode 字符、最多 5 行；其余水印范围全部沿用 SPEC。

06 明确区分有引用本地存储的字段：类型与相对路径采用只读底色，没有编辑动作；名称和启用状态保留可改外观与说明。12 张图片与 1 个清理任务是两种引用，不声称相加就是独立图片总数。06→07→08 为保存路径；09 保留“博客归档 2026”输入并可重试到 07。仅改名称不移动文件。

10–11 的数据连续：6 个对象中 4 个已确认清理，仍有 watermark.webp、candidate.webp 两个对象。11→10→11 展示手动重试后再次失败，自动重试次数为 1/1 且本轮已结束。未知剩余大小显示“待核对”，不把未确认删除的对象算作成功。没有恢复或强制删除入口。

12、13 是探测对象与临时预览清理失败的简洁代表，保留具体路径、权限原因和责任；返回各自已有配置页。它们不继承回收站的图片计数、恢复动作或记录删除语义。实际重试与权限修复由工程实现，不能把固定原型当作已执行清理。

剩余组合按以下规则复用，不扩展全部排列：

- 水印范围的上下边界、负数、不同错误数量，共用 01–04 的字段容器；只变值与准确提示，不清空其他字段。
- 无引用本地路径、S3 Endpoint/Region/Bucket/凭据等存储字段错误共用 01 的就地错误结构，逐字段约束仍以 SPEC-storage 为准；本批没有逐项新增这些画板。
- 本地无引用时类型和路径恢复可编辑；S3 有引用的物理位置字段锁定沿用旧 05B。仅当前模式字段参与应用，不引入另一类配置残留规则。
- 保存失败沿用 09 的“保留输入、说明未保存、允许重试”；保存中沿用 07/14 的 Disabled 按钮，不增加并发协调算法。
- 权限错误与临时网络错误分别使用 12/13 与 11 的原因和下一步；重试只处理剩余对象，不能重置已确认成功结果。其他提供方错误不提前冒充已验证。

组件复用：Input `3:27`、Button/Primary `3:21`、Outline `3:23`、Disabled `3:25`；颜色沿用本地变量。没有修改共享组件或创建同功能组件。

## 验证与边界

回读两端 32 个根画板，检查归属页、最终坐标、四列顺序、分区边界、无重叠、字体、文本水平范围、固定底栏和 84 条有效同端目标。无问题。00 导航及手机较长表单使用独立纵向滚动区，底栏固定。

截图查看桌面/手机参数错误、本地字段锁定、剩余清理失败，以及手机 00 入口；未发现截字和横向溢出。修正过桌面导航选中项，并校正并行工具创建导致的新分区归属互换。最终父页面和坐标已经重新核验。

00 内说明固定场景路径。产品页没有“模拟失败”或“演示成功”按钮。保存结果与重试结果用固定时间跳转，只证明画板连线；不证明真实输入、网络、文件系统、数据库、自动重试预算、键盘或播放器行为。既有播放器曾被登录阻断，本轮不宣称通过。

只创建本 Markdown 和对应 JSON，没有修改应用代码、依赖、SPEC 或其他设计记录。无需 root 接入任何旧入口；统一目录可直接打开本批 00。

实际执行：

- `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node_modules/.bin/prettier --write docs/design/parallel-forms-exceptions-2026-09-19.md docs/design/verification/parallel-forms-exceptions-2026-09-19.json`：通过。
- 同文件 `prettier --check`：通过。
- `python3` JSON 审计：通过；32 个画板、84 条目标、两端 page 与最终坐标符合预期。
- `git diff --check`：通过。

未运行应用单元测试、构建、浏览器输入或真实清理测试；本批仅修改设计与记录。
