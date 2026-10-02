# Issue #162 独立设计还原审计

日期：2026-10-02。工作区：`/Users/dnslin/.codex/worktrees/issue-162-s3-upload/ariso`。审计者未修改业务源码，也未操作实现者正在使用的 Ego 页面；实际读取 Figma 设计信息与截图，并独立查看真实页面截图。

## 当前结论

**功能结论：已实施状态的专项验证通过。** 独立读取首轮有效功能检查与最终清理专项报告；实际查看新pending、accepted清理失败、长重试错误及清理完成截图。真实DELETE在途禁用、单次POST、500后读取pending并轮询至none、原图保留及Escape归焦均有最终报告证据。首轮与三次观察失败/中断保留原状态，没有改记整轮通过。

**设计结论：已实施状态未发现剩余本次视觉偏差。** 实际对照八个Figma节点与真实页面，Footer多20px已修为16px，整页顶部补齐，390×400正文实际wheel读到水绿说明与长错误首尾，Header/Footer保持固定；44px触发/关闭的按下尺寸有实际测量。人工UI验收仍未执行。

待清理状态交接没有用户批准。GET清理查询接口也尚无前端恢复入口。清空结果或刷新后，仍有清理责任只能通过所有者接口查询，不能将接口已实现算作完整清理UI。以上缺口与最终人工验收仍开放，PR应保持草稿。

## 独立读取的依据

实际读取项目 AGENTS.md、`docs/README.md`、[设计交付规范](../../design/handoff.md)、[前端共用验收](../../tasks/execution.md#前端共用验收)、[T-UP-04与DG-UPLOAD](../../tasks/m3-m4-platform.md#t-up-04-s3-直传中转条件交接与最终清理)。使用 using-agent-skills、figma-design-to-code 和 figma-use 技能，分别调用 get_design_context 并实际查看返回截图。

| 用途             | 桌面节点                                                                         | 手机节点                                                                         | 设计画板/卡片宽度   |
| ---------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------- |
| 上传主页面       | [30:97](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-97)       | [101:1014](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1014) | 1440×1080 / 390×844 |
| 通过服务器中转   | [316:4784](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4784) | [316:4793](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4793) | 480 / 358px         |
| 临时文件等待清理 | [317:4335](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4335) | [317:4326](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4326) | 480 / 358px         |
| 临时文件清理失败 | [317:4344](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4344) | [317:4353](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4353) | 480 / 358px         |

六张已读取的主页面、中转和失败原始设计截图保存在[figma](./figma/)；未修改图片或将设计截图作为网页资产。桌面整页导出图由Figma工具缩放，比较使用原1440×1080画板尺寸。

主页面采用 handoff 已批准的公共外壳、手机 Menu/X、上传入口名称、#159桌面1280px组合及输入区、#160关系选择和冻结摘要。未从旧画板恢复旧面包屑或覆盖已批准布局。

## 首轮真实页面对照

首次独立查看两端浅深色中转代表、mixed-active、ready、中转弹窗及390×400短视口截图。首轮Footer间距偏差的原图保存在[桌面](./screenshots/relay-before-gap-1440.png)与[手机](./screenshots/relay-before-gap-390.png)。本节是修正前结论，修后证据与结果见下文。

| 核对项           | 实际结论                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页结构         | 桌面左右两列与手机堆叠沿现有统一实现。当前截图上部标题和首摘要被内部滚动裁掉，尚不能据此完成顶部整页对照。                                                                  |
| 公共区域         | 桌面232px侧栏、品牌、导航、所有者区、上传当前项以及固定底栏继续复用统一实现。手机64px品牌/图标菜单及16px边距保持。                                                          |
| 中转卡尺寸与外观 | 480/358px宽、24px内距、12px圆角、水绿1px边框、浅色surface与深色surface吻合。                                                                                                |
| 字体层级         | 20px medium标题、14px正文、13px说明及对应1.5行高吻合。                                                                                                                      |
| 说明区           | 水绿语义底、12px内距、8px圆角、动态换行吻合。                                                                                                                               |
| 动作区           | 黄底主要按钮与描边次要按钮顺序正确，均全宽48px；Footer额外20px上外距需要修复。                                                                                              |
| 关闭与动态原因   | 按handoff提供右上44px CloseButton；按规格显示服务端真实CORS失效原因。它们是既定规则落地，允许内容自然增高，不列为未经批准的设计偏离。                                       |
| 短视口           | 390×400截图中末按钮可见；说明内容有裁切，需验证正文实际可滚动，不能只以末按钮位置断言代替。                                                                                 |
| 深色             | 沿已批准surface/secondary/foreground语义颜色，主按钮保留深色文字，图片未反色。                                                                                              |
| 清理失败与重试   | 已查看首轮真实失败/重试失败两端浅深色截图，身份、删除原因、引用说明和两按钮顺序吻合；同样存在Footer多20px。等待修后、重试中/禁用及完成证据，不以Figma参照图或代码推测通过。 |

## 功能与未完成范围

功能结论与设计结论分开。首轮三路队列、媒体ready、字节一致性、重复complete及单PUT签名重提已记录在[首轮有效阶段报告](./browser/full-initial/upload-s3.json)，该轮整体仍为failed；最终清理行为由下文专项passed报告补齐。不能仅凭截图判断行为通过。

待清理节点旧文案仍写“等待远端写入结算”，DG-UPLOAD已经明确要求补齐已知Key清理、失败责任和迟到扫描交接并交用户确认。当前没有审批回复，不实施未批准的新状态。生产周期扫描仍由#164承接；存储管理整体区域由#194承接。本次清理查询/重试的前端恢复入口仍缺少交接，不将其转记为已完成或后续优化。

最终人工UI验收未执行。物理触控、软键盘和非零安全区设备实测按现行执行约定不要求，未标记通过。本审计没有以截图数量、无溢出或功能检查通过替代设计对照。

## 复核交接

2026-10-02 实现者已在源码修正Footer上外距、采用HeroUI inside正文滚动、44px触发器和关闭按钮的按下尺寸，并分离cleanupError。清理POST失败后主动读取真实pending状态继续轮询；触发器消失后关闭弹窗仍回到可用控件。审计者已回读相应源码。下文修后复核记录实际读图结果；未完成的自动流程仍不能仅凭源码标记通过。

修后中转、已知失败、顶部整页与短正文已经实际读图。accepted清理失败和重试自动完成在后续最终专项取得证据，见下文；本文件只随实际证据更新。

## 修后视觉复核（2026-10-02）

本次实际查看的修后截图mtime均晚于runner的 `startedAt=2026-10-02T13:21:30.626Z`，已固定在[首轮完整证据](./browser/full-initial/)及其[原始报告](./browser/full-initial/upload-s3.json)。该轮runner整体失败于13:23:43Z，失败为DELETE gate测试观察计数 `0 !== 1`；controller早于计数钩子捕获bound fetch，后续改用真实Network记录复测。本节只记录独立看到的视觉证据，不把失败轮记为功能通过。

实际view：中转代表四张浅深色/1440×1080、390×844；mixed-active两端顶部及768浅色/360深色；ready手机390浅色/430深色；中转Modal的360浅色、768深色及390×400；清理失败Modal的1440浅色、390两主题、430浅色、768深色及390×400；四张中转/失败触发器与CloseButton的pressed截图。

| 项目            | 修后对照结果                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页和公共区域  | 新mixed-active顶部有完整标题、说明和第1次冻结摘要。桌面232px侧栏、正文起点、360px设置列和24px列间隔保持；手机64pxHeader、16px边距和固定底栏保持。长队列使用既有内部滚动，未把超出当前视口的内容伪装成完整长页截图。 |
| 中转卡          | 480/358px宽度、24px内距、12px圆角、20/14/13px文字、16px间隔和48px全宽动作吻合。Footer多20px已修复。真实CORS原因与44px关闭入口按既定规则呈现，卡自然增高。                                                           |
| 已知删除失败卡  | 文件/存储身份、实际删除诊断、水绿引用说明、重试与配置顺序吻合。长key自然换行，Footer间隔16px；不按原型示例的固定两行裁切真实错误。                                                                                  |
| 390×400正文     | 清理卡实际wheel后水绿说明完整可读，正文有scrollTop变化且Header与底部48px动作仍可见；中转卡内容与末按钮完整可达。新增重试错误首尾和pending状态待最终轮。                                                             |
| pressed点击目标 | 中转触发器132×44、关闭44×44；清理触发器146×44、关闭44×44，实际transform为none。截图中的焦点仍可见，没有以正常态尺寸替代按下态。                                                                                     |
| 主题与断点      | 已实际查看360/390/430/768与1440的相关真实图。深色使用批准的surface/secondary/foreground；黄底主动作保留深色文字，照片未反色。                                                                                       |

以上局部可实施状态未发现剩余本次视觉偏差。该时点最终功能仍待复测，后续结果见下文。待清理文案/状态交接、清空或刷新后的完整查询恢复UI及人工验收仍开放；不将局部视觉复核扩写成Issue #162整体验收完成。

## 清理观察失败与同页短视口证据

13:30:18Z轮失败于视口调整后尺寸观察尚未收敛，原始报告保存在[cleanup-viewport-failed](./browser/cleanup-viewport-failed/)。13:39:39Z轮人为中断，保存在[cleanup-interrupted](./browser/cleanup-interrupted/)。两轮均未记为通过。

13:48:32Z轮在长重试错误的短正文wheel观察超时，保存在[cleanup-scroll-failed](./browser/cleanup-scroll-failed/)；[原始报告](./browser/cleanup-scroll-failed/upload-s3.json)仍为failed。该轮实际生成的pending两端浅深色和retry-error手机图已经独立查看，失败卡结构、真实删除原因、禁用按钮与48px动作尺寸吻合。不能把这些有效局部图扩写成整轮功能通过。

实现者在同一真实页面进一步取证：第一个wheel尚在运动时便计算下一段距离，最终tip顶部被裁切；等待真实clamped滚动位置后，不写DOM或style，通过wheel读到完整内容。审计者实际查看[说明完整可读](./browser/cleanup-scroll-failed/short-tip-read-after-motion.png)、[错误首部](./browser/cleanup-scroll-failed/short-alert-start-read-after-motion.png)和[错误尾部](./browser/cleanup-scroll-failed/short-alert-end-read-after-motion.png)。390×400下水绿说明和rolealert首尾均可达，Header、44px关闭和两条48px动作固定。该同页局部结论不改写失败runner状态；最终accepted与自然清理完成由下节新轮单独验证。

## 最终清理专项与独立读图

实际命令 `pnpm run test:browser -- --suite upload-s3 --only cleanup`，macOS arm64 / Node24.18.1 / pnpm11.19.0 / 现有Ego Lite / TaskSpace12、p1。使用独立数据库与HTTP对象夹具；没有下载浏览器，也没有改用户预览数据。`startedAt=2026-10-02T13:56:41.159Z`，`finishedAt=2026-10-02T14:01:46.012Z`。审计者独立读取[runner](./browser/cleanup-final/runner.json)与[业务报告](./browser/cleanup-final/upload-s3.json)：两者passed，命令退出0。该专项覆盖50个布局记录，未重跑已有效的三路/中转矩阵，也未将首轮failed报告改成passed。

审计者实际查看最终在途四张浅深色/1440与390、accepted成功但清理失败四张、对应Modal四张、长重试错误两主题390×400分段图、accepted两主题短tip、360深色与768浅色代表，以及none完成四张。新清理图mtime晚于本轮startedAt；原中转/整页证据使用永久full-initial目录。以下逐项结论来自实际设计与读图，未以截图数量或无溢出替代对照。

| 状态/区域              | 功能结论                                                                                                                                     | 设计对照与实际截图                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页及公共区域         | 沿统一OwnerShell、上传队列和冻结设置实现；本次没有新增公共布局。                                                                             | 服务存活期[桌面顶部](./browser/full-initial/s3-mixed-active-light-1440.png)、[手机顶部](./browser/full-initial/s3-mixed-active-light-390.png)及accepted图维持批准的公共区域、两列/堆叠、尺寸和顺序。没有恢复旧面包屑。                                                                                                                                                                                                                                                                                            |
| 中转说明               | 首轮有效阶段确认固定链路和真实媒体结果；卡显示实际routeReason。                                                                              | 316:4784/4793对照[桌面](./browser/full-initial/s3-relay-representative-light-1440.png)、[手机](./browser/full-initial/s3-relay-representative-dark-390.png)：宽度、24px内距、字体、颜色、16px区域间隔及动作顺序吻合。44px关闭按handoff。                                                                                                                                                                                                                                                                          |
| 已知删除失败与重试在途 | 真实SDK DELETE403；在途关闭、配置和重复提交禁用，Escape不能中断本次重试，Network实际记录恰好1次POST。                                        | 317:4344/4353对照[桌面禁用](./browser/cleanup-final/s3-cleanup-retry-pending-light-1440.png)、[手机禁用](./browser/cleanup-final/s3-cleanup-retry-pending-dark-390.png)：保留真实身份/原因、说明区和48px全宽动作，禁用状态清楚。此为既有失败卡的重试在途，未冒充获批的待清理新页面。                                                                                                                                                                                                                              |
| accepted后清理失败     | 图片保持ready；清理诊断单独保留，不把已完成图片改为上传失败。                                                                                | [桌面成功卡与责任](./browser/cleanup-final/s3-accepted-cleanup-failed-light-1440.png)、[手机](./browser/cleanup-final/s3-accepted-cleanup-failed-dark-390.png)区分成功数量、缩略图和清理提示；[失败Modal](./browser/cleanup-final/s3-cleanup-accepted-modal-dark-390.png)仍显示实际DeleteObject原因。整页与卡片未发现本次偏差。                                                                                                                                                                                   |
| 长错误与390×400        | 正文真实wheel滚动；实际clamped位置收敛后才读取下一段。Header/Footer与Dialog自身滚动位置保持固定。                                            | 两主题说明及rolealert首尾可读：[浅色tip](./browser/cleanup-final/s3-cleanup-retry-error-light-390-short-tip.png)、[错误首部](./browser/cleanup-final/s3-cleanup-retry-error-light-390-short-alert-start.png)、[尾部](./browser/cleanup-final/s3-cleanup-retry-error-light-390-short-alert-end.png)、[深色tip](./browser/cleanup-final/s3-cleanup-retry-error-dark-390-short-tip.png)、[深色错误](./browser/cleanup-final/s3-cleanup-retry-error-dark-390-short-alert-end.png)。Dialog上下16px，最后48px动作可达。 |
| 重试500后自动完成      | 实际读取新pending责任，生产维护将确切对象清理至none，轮询移除清理提示/错误；同一6631字节原图仍可下载且逐字节相同。Escape回到可用“查看详情”。 | [完成桌面](./browser/cleanup-final/s3-cleanup-complete-light-1440.png)、[完成手机](./browser/cleanup-final/s3-cleanup-complete-dark-390.png)及[独立状态记录](./browser/cleanup-final/none-visual.json)显示成功卡保留、清理入口与诊断消失、查看详情焦点可见。完成图的环境限制见下段。                                                                                                                                                                                                                              |
| 点击目标与主题         | 最终pressed清理触发器146×44、关闭至少44×44，transform为none；键盘焦点循环和归焦由真实交互断言通过。                                          | 浅深色使用批准语义颜色，主动作保持黄底深色文字，真实缩略图未反色；已读360/390/430/768/1440相关代表。48px动作保留既有动效，未用普通状态尺寸冒充按下状态。                                                                                                                                                                                                                                                                                                                                                          |

none四张补图来自passed流程结束、独立服务已停止后的同一留存真实页面，仅证明上传卡完成状态与焦点。桌面Owner区实际出现连接失败提示，未隐藏或修改DOM；`none-visual.json`的errors0仅指上传卡。公共区域结论采用服务存活的full-initial与accepted-failed图，不能声称补图整页无错误。没有因此重跑周期或再次改变用户数据。

最终专项通过证明本机生产SDK/浏览器/媒体/清理路径；不代替R2与SeaweedFS真实服务验收。已实施UI状态的独立设计还原复核通过，但待清理准确文案及扫描交接批准、清空/刷新后的完整查询恢复UI、用户人工验收仍未完成。T-UP-04整体保持开放，PR应保持草稿。
