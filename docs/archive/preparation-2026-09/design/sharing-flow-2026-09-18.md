# 分享管理与匿名访问原型（2026-09-18）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

本批新增桌面／手机各 50 个业务状态和 7 个阅读入口，其中管理 25 个状态、匿名访问 25 个状态。依据 [SPEC-sharing](../../../specs/SPEC-sharing.md)；原型用于评审，未实现服务端授权或真实图片请求。

- 分享管理续篇：桌面 [10 · 分享管理与访客浏览](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2271)；手机 [10 · 分享管理与访客浏览](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2279)。
- 匿名分享：桌面 [10 · 分享管理与访客浏览](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2271)；手机 [10 · 分享管理与访客浏览](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2279)。
- [120 个画板与入口检查](./verification/sharing-flow-2026-09-18.json)。

## 阅读顺序与节点

管理区依次为创建与基本设置、密码与有效期、启停与链接、展示设置；匿名区依次为访客验证与状态、相册浏览与异常、精简大图。每组先放阅读入口，再按编号从左到右、从上到下排列。原分区和原分享根画板的位置、尺寸保持不变。

| 编号 | 状态                 | 桌面                                                                             | 手机                                                                             |
| ---- | -------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1    | 还没有分享链接       | [431:3511](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3511) | [431:8331](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8331) |
| 2    | 创建并启用分享       | [431:3701](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3701) | [431:8363](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8363) |
| 3    | 分享已创建并启用     | [431:3721](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3721) | [431:8383](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8383) |
| 4    | 此相册已有分享       | [431:3740](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3740) | [431:8402](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8402) |
| 5    | 分享设置             | [431:3753](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3753) | [431:8415](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8415) |
| 6    | 设置已保存           | [431:3978](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3978) | [431:8482](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8482) |
| 7    | 设置未能保存         | [431:3989](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3989) | [431:8493](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8493) |
| 8    | 设置或替换密码       | [431:4000](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4000) | [431:8504](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8504) |
| 9    | 密码已更新           | [431:4017](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4017) | [431:8521](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8521) |
| 10   | 移除分享密码？       | [431:4030](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4030) | [431:8534](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8534) |
| 11   | 密码已移除           | [431:4043](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4043) | [431:8547](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8547) |
| 12   | 修改有效期           | [431:4056](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4056) | [431:8560](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8560) |
| 13   | 有效期已过去         | [431:4073](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4073) | [431:8577](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8577) |
| 14   | 重新启用过期分享     | [431:4090](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4090) | [431:8594](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8594) |
| 15   | 已恢复原地址访问     | [431:4103](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4103) | [431:8607](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8607) |
| 16   | 关闭此分享？         | [431:4114](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4114) | [431:8618](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8618) |
| 17   | 分享已关闭           | [431:4127](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4127) | [431:8631](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8631) |
| 18   | 分享已重新开启       | [431:4140](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4140) | [431:8644](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8644) |
| 19   | 重新生成分享链接？   | [431:4153](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4153) | [431:8657](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8657) |
| 20   | 新链接已生成         | [431:4166](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4166) | [431:8670](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8670) |
| 21   | 操作结果待核对       | [431:4183](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4183) | [431:8687](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8687) |
| 22   | 分享链接已复制       | [431:4194](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4194) | [431:8698](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8698) |
| 23   | 浏览器未允许自动复制 | [431:4205](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4205) | [431:8709](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8709) |
| 24   | 修改展示方式         | [431:4220](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4220) | [431:8724](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8724) |
| 25   | 展示设置已保存       | [431:4240](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-4240) | [431:8744](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8744) |
| 26   | 访问受密码保护       | [432:3573](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3573) | [432:7913](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7913) |
| 27   | 密码不正确           | [432:3597](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3597) | [432:7937](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7937) |
| 28   | 尝试次数较多         | [432:3621](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3621) | [432:7961](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7961) |
| 29   | 请重新验证密码       | [432:3642](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3642) | [432:7982](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7982) |
| 30   | 分享已关闭           | [432:3666](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3666) | [432:8006](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-8006) |
| 31   | 分享已过期           | [432:3685](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3685) | [432:8025](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-8025) |
| 32   | 链接无法使用         | [432:3704](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3704) | [432:8044](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-8044) |
| 33   | 暂时无法访问         | [432:3723](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3723) | [432:8063](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-8063) |
| 34   | 网格 · 隐藏名称      | [433:3610](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-3610) | [433:8265](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8265) |
| 35   | 网格 · 显示名称      | [433:3722](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-3722) | [433:8387](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8387) |
| 36   | 瀑布流 · 显示名称    | [433:3874](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-3874) | [433:8549](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8549) |
| 37   | 无公开图片           | [433:4020](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-4020) | [433:8693](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8693) |
| 38   | 异常图片与封面占位   | [433:4042](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-4042) | [433:8715](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8715) |
| 39   | 加载更多失败         | [434:3629](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-3629) | [434:8376](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8376) |
| 40   | 列表已变化 · 刷新    | [434:3741](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-3741) | [434:8498](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8498) |
| 41   | 已加载全部 48 张     | [434:3765](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-3765) | [434:8522](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8522) |
| 42   | 成员移除后列表       | [434:3893](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-3893) | [434:8662](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8662) |
| 43   | 大图 · 第一张        | [434:4003](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-4003) | [434:8782](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8782) |
| 44   | 大图 · 第二张        | [434:4029](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-4029) | [434:8808](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8808) |
| 45   | 大图 · 第三张        | [434:4055](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-4055) | [434:8834](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8834) |
| 46   | 大图 · 放大          | [434:4079](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-4079) | [434:8858](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8858) |
| 47   | 大图 · 全屏          | [434:4104](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-4104) | [434:8883](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8883) |
| 48   | 大图 · 倒数第二张    | [434:4126](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-4126) | [434:8905](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8905) |
| 49   | 大图 · 最后一张      | [434:4150](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-4150) | [434:8929](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8929) |
| 50   | 图片加载失败         | [432:3744](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3744) | [432:8084](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-8084) |

原主列表 [30:849](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-849) / [101:1463](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1463) 汇总 8 项，默认每页 40 条、共 1 页，分页固定在底部。原第 2 页 [62:728](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=62-728) / [102:5469](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-5469) 原位改成列表加载失败，避免保留每页 5 条的旧冲突。原设置弹窗 [37:322](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=37-322) / [102:3743](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3743) 保留原位，通过“更多分享设置”接入新页面，密码不回显，时间注明 Asia/Shanghai。

## 本批规则与表现

- 每册唯一分享；首次创建默认无密码、不过期、网格、隐藏名称。重复创建进入已有分享，不覆盖设置。
- 密码保留、替换与移除有独立表达；留空不表示删除。期限可修改或设为不过期，过去的期限有错误提示。过期后延期恢复原地址，只有重生成才更换地址。
- 关闭、改密码和重生成提示原授权失效；重生成结果未知先核对当前记录，不再次自动生成。关闭分享或加密码不撤销公开图片独立外链。
- 未验证与关闭／过期／不存在页只呈现品牌和通用提示，不出现相册名称、描述、封面、数量或图片。非后台页面复用两个柔光与返回首页入口；全屏样例收起品牌和首页按钮，保留退出全屏。
- 解锁后显示公开集合的封面与图片；网格、瀑布流及名称显示由所有者设置。隐藏名称的卡片没有残留名称文本；访客界面不展示文件大小、拍摄信息、标签、存储和版本字段。
- 首批 40 张、总计 48 张，加载更多后 48 张；另有加载失败、游标失效后刷新和成员移除样例。无公开图片时有空态，不补入私有成员。
- 处理中、处理失败、存储停用和文件加载失败保留位置；封面异常也保留占位，不换成下一张。已有可读旧版本的重新处理失败仍遵循 delivery 规则，静态样例不模拟处理。
- 大图提供前后切换、放大／还原、关闭和全屏样例，首尾不循环。不增加后台版本选择、信息、下载或幻灯片。底部操作独立固定，不随图片高度移动。

## 固定样例与剩余设计

这些页面使用固定数据，不能实际输入、保存、复制或核验密码。创建默认样例与已设置密码／期限的设置页是独立评审状态；保存、移除密码、延期、启停和重生成后的返回页面尚不动态延续配置。新旧地址均为 example 演示域名，不是可用分享链接。展示选项与日期控件的实际选择、输入校验、提交中和并发配置变化仍待交互闭合。

大图连通第一／第二／第三张及倒数第二／最后一张的边界样例；其他卡片与中间图片前后切换未连通，避免跳到不对应的图片。[分享返回回归](./context-address-regression-2026-09-19.md)已补显示名称的大图和网格／瀑布流各自的48张加载结果；打开大图保留底层来源相册，内部切换替换大图，关闭不再固定跳回隐藏名称网格。播放器停在登录页，实际返回、滚动位置和焦点恢复仍未验证。放大、平移和全屏为状态展示，不能视作手势或浏览器能力已经验证。

匿名密码空值／超长／提交中、期限与站点时区变化、5 秒刷新、最多 80 个可见 ID、后台标签页恢复、授权撤销与请求竞态，均需工程联调。24 小时固定授权、Cookie、HTML／RSC／接口裁剪、HTTP 状态和缓存没有通过静态画板验收。SVG／动画展示、深色、多尺寸、键盘和软键盘也仍需补充验证。

DES-03 和 DES-06-SHARING 保持待用户查看与交互验收，不整体标完成。下一批继续工作台与访问统计的剩余状态。

## 本轮检查

回读桌面／手机各 60 个根画板与入口，共 120 个；各含 50 个新状态、7 个阅读入口、3 个原位修订画板。检查横向边界、固定底栏、跳转目标、阅读入口编号与标题对齐；新画板及分区无重叠，原分区和原根画板坐标尺寸不变。柔光与放大图片在裁剪容器外的部分属于有意裁剪，不计作横向错位。

对两端各 25 个匿名画板检查两个柔光、门禁页无相册内容、隐藏名称无残留及技术字段不外露；这里只检查 Figma 节点内容，不能替代应用隐私验收。截图抽查密码页、网格、瀑布流、异常卡片、大图、放大及设置页，修正全屏按钮被标题挤出的问题。

执行项目 Prettier 格式化／检查、Python JSON 审计与 git diff --check；结果以本轮命令输出为准。未运行 Figma 播放器、真实网络／授权、应用测试或构建，没有修改应用代码、安装依赖、创建 Issue 或提交。

## 六项并行补充（2026-09-19）

布局／名称展示保存后设置页与匿名结果一致的代表见[R4](./parallel-continuous-settings-2026-09-19.md)，匿名页深色／360px代表见[R6](./parallel-theme-widths-2026-09-19.md)。 本文此前剩余清单按原批次保留，当前交付与尚待工程验证的范围以[六项统一目录](./parallel-design-completion-2026-09-19.md)及对应专项为准，不再把上述代表设计记为尚未补图。
