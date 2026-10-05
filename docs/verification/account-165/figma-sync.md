# Issue 165 Figma 同步记录

2026-10-05。文件 `74sT9Hrf8G4czcWeTkET5b`。本记录只报告设计写入与导出，独立设计评审和真实产品验证见[统一证据](README.md)。人工验收未由本次同步代替。

用户在查看 `design-plans/issue165-review/index.html` 后明确表示“没错，可以进行实施了”。按该批准方案同步标题、字段和操作图标，并同步成功保留原页与结果未知时的核对流程。未改变 GitHub 登录模块的未来需求；本 Issue 的账号页面显示“尚未开放”。

## 已完成的写入

- 先读取 using-agent-skills、figma-use、figma-design-to-code、figma-generate-design 及其 gotchas、Plugin API 索引，再读取原节点设计信息、截图、层级和组件属性。写入使用真实 Figma Plugin API；原表单的 Input 和 Button 实例仍保留。
- 图标来自项目现有 `lucide-react@1.47.0`，使用获批原型 `icons.js` 中实际渲染的 SVG，通过 `createNodeFromSvg` 导入可编辑矢量。未手绘业务图标，也未用整页图片代替设计。
- 主页面增加 Settings、UserRound、Mail、KeyRound、LogIn 以及设置分类图标。对话框使用 40px 水绿标题图标容器、22px 图标、16px 输入前缀、20px Eye 和 44px 显示密码/关闭点击区域。已有 48px 表单按钮补充 Check；核对重试使用 RefreshCw，提交态使用真实 HeroUI Spinner。
- 成功节点保留原 ID，转为原账号页面右下方中性通知。桌面 1440×1080，通知宽 420px、右/下 28px；手机 390×844，通知宽 358px、左右 16px、下 24px。表单宽度保留桌面 520px、手机 358px。
- 原结果未知节点 `196:877`、`196:1993` 保留 ID，明确对应密码。新增邮箱正在核对、核对失败和已读取当前邮箱状态；没有将读取邮箱成功误画为修改成功。
- 深色节点使用原 Ariso 变量集合 `VariableCollectionId:2:2` 的 Dark `264:0`，浅色使用 Light `2:0`。图标、标题、文本、主按钮、边框和导航当前项绑定相应现有变量；保留黄底深色主按钮文字与图标。
- 新的反馈和主题状态放在空白区域的 SECTION `701:7325`（桌面）及 `701:14732`（手机），避免扩大的密码成功节点覆盖原 GitHub 未来状态。已有 GitHub 未来状态节点未修改。原密码成功节点只调整画布所属 section，ID 保留。

## 提交状态来源修正

独立设计评审确认旧 `202:2305/2328` 来源将标题改成“正在修改邮箱/密码”，且保存按钮沿用 outline 禁用实例与 RefreshCw。这不符合当前已批准表单的提交状态。实际读取 `src/components/identity/account-editor.tsx`、`identity-field.tsx` 和现有 HeroUI 3.2.6 的 Spinner、Button、Label、InputGroup、disabled 样式后，只修正这 8 个状态，原节点 ID、字段内容和主次布局保留：

- 邮箱：`202:2305`、`202:2215`、`702:15683`、`702:14881`；标题保留“修改登录邮箱”。
- 密码：`202:2328`、`202:2238`、`702:15727`、`702:14925`；标题保留“修改密码”。
- 保存仍使用原黄色主要按钮来源 `3:21`，实例 ID 保留，48px 高、禁用 opacity 0.5，文字为“正在保存…”。取消保留 background 与 outline，禁用 opacity 0.5。
- 标题图标、说明和辅助说明正常显示。字段标签、输入、前缀及关闭均按库禁用样式表示；密码显示按钮处于禁用 InputGroup 与禁用 Button 内，合成视觉 opacity 0.25。该静态表示不能代替真实浏览器中不可编辑、不可关闭的行为测试。
- Spinner 使用现有 `@heroui/react/spinner` 的实际 SSR SVG，`size="sm"` 为 16px，源资源见[HeroUI Spinner](figma/heroui-spinner-sm.svg)，没有手绘替代。产品由实现者将 busy Spinner 设为 `color="current"`，避免默认 accent 在黄底上不可辨；Figma 同样采用当前主按钮文字色 `#272343`。导入时实测 Figma 将 gradient stop 绑定颜色变量会把 stop alpha 重置为 1，因此保留真实 SVG 的当前颜色和两段透明度 `1→0.55`、`0→0.55`；该颜色与现有两主题 primary-foreground 一致。
- [原生写入与最后截图结果](figma-submitting-write.json)记录标题、主要按钮 source/instance、替换图标和矢量 ID、禁用透明度、真实渐变修正，以及 8 次按顺序导出的自然尺寸。8 张最后 PNG 均实际查看，当前 56 / 56 截图仍对应最终节点。Spinner 静态截图只核对一帧视觉，不代表已验证旋转或 reduced motion。

同一 busy 分支的 4 个邮箱核对状态 `697:14612`、`697:14587`、`702:16145`、`702:15157` 也完成当前代码来源核对与最小同步。写入前一次读取全部文字、标题、控制、实例来源和禁用状态，同时确认 `use-account-editor.ts` 在进入 checking 时清空 feedback；来源差异已一起处理：

- 标题继续是“暂时无法确认修改结果”，CircleAlert 标题图标与标题说明组保留。说明按真实代码为 13px“连接中断不代表修改未发生。正在核对当前邮箱…”。
- 旧独立正文“正在核对当前邮箱…”与标题旁说明重复，且当前代码 checking Body 没有额外段落，故移除。保留原标题→正文位置→两按钮的有效间距：代码空 Body 两侧各 18px，静态节点去除重复段落后对应 36px。
- 黄底主要按钮保留原实例与来源，文字“正在核对…”及真实 SSR Spinner/current 16px，禁用 opacity 0.5。返回账号与安全与关闭也禁用 opacity 0.5。原图标位置沿用了较长 retry 文案，已按当前标签宽度恢复标准 8px 图文间距。
- [核对状态原生写入与最后导出结果](figma-checking-write.json)包含全部四节点修改前后文字/控制、实际节点 ID、图标渐变与透明度。四个节点按顺序各一次导出成功并逐张实际查看；桌面 520×253，手机 358×273。没有再改产品代码或交互流程，当前 56 / 56 PNG 仍对应最终状态。

## 实际状态契约

邮箱成功通知是“登录邮箱已更新”，说明下次登录使用新邮箱、未使用的重置链接已撤销。密码成功通知是“密码已更新”，说明当前设备保持登录、其他设备退出。通知出现时仍显示原账号页面。

邮箱结果未知首先显示正在读取当前邮箱。读取失败时显示“重新核对邮箱”，不会重新提交修改。读取成功后显示“已核对当前邮箱”和实际读取的当前邮箱，并说明“当前邮箱已核对，仍无法确认这次修改的其他结果。”；仅提供“返回账号与安全”，没有成功通知。设计中的示例邮箱不代表生产账号。

密码结果未知提供“前往登录核对”和“返回账号与安全”。说明使用新密码核对，失败再尝试原密码；前往登录会退出当前设备，不会自动再次提交修改。

## 节点与真实导出

下表每个 ID 链接到实际 Figma 节点，PNG 为该节点的真实截图。完整页面尺寸为桌面 1440×1080、手机 390×844；表单 PNG 按原浮层节点自然尺寸导出，不能据此声称已验证页面上的浮层定位、短视口或键盘行为。

| 状态                   | 桌面浅色                                                                                                              | 手机浅色                                                                                                              | 桌面深色                                                                                                              | 手机深色                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 账号与安全             | [34:462](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=34-462) · [PNG](figma/after-34-462.png)          | [102:1713](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1713) · [PNG](figma/after-102-1713.png)    | [702:15198](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15198) · [PNG](figma/after-702-15198.png) | [702:14582](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-14582) · [PNG](figma/after-702-14582.png) |
| 邮箱更新后原页         | [197:2126](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=197-2126) · [PNG](figma/after-197-2126.png)    | [197:2059](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=197-2059) · [PNG](figma/after-197-2059.png)    | [702:15341](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15341) · [PNG](figma/after-702-15341.png) | [702:14632](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-14632) · [PNG](figma/after-702-14632.png) |
| 修改登录邮箱           | [196:871](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-871) · [PNG](figma/after-196-871.png)       | [196:1987](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-1987) · [PNG](figma/after-196-1987.png)    | [702:15484](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15484) · [PNG](figma/after-702-15484.png) | [702:14682](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-14682) · [PNG](figma/after-702-14682.png) |
| 邮箱表单错误           | [196:872](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-872) · [PNG](figma/after-196-872.png)       | [196:1988](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-1988) · [PNG](figma/after-196-1988.png)    | [702:15525](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15525) · [PNG](figma/after-702-15525.png) | [702:14723](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-14723) · [PNG](figma/after-702-14723.png) |
| 修改密码               | [196:874](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-874) · [PNG](figma/after-196-874.png)       | [196:1990](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-1990) · [PNG](figma/after-196-1990.png)    | [702:15566](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15566) · [PNG](figma/after-702-15566.png) | [702:14764](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-14764) · [PNG](figma/after-702-14764.png) |
| 密码表单错误           | [196:875](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-875) · [PNG](figma/after-196-875.png)       | [196:1991](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-1991) · [PNG](figma/after-196-1991.png)    | [702:15624](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15624) · [PNG](figma/after-702-15624.png) | [702:14822](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-14822) · [PNG](figma/after-702-14822.png) |
| 正在修改邮箱           | [202:2305](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=202-2305) · [PNG](figma/after-202-2305.png)    | [202:2215](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=202-2215) · [PNG](figma/after-202-2215.png)    | [702:15683](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15683) · [PNG](figma/after-702-15683.png) | [702:14881](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-14881) · [PNG](figma/after-702-14881.png) |
| 正在修改密码           | [202:2328](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=202-2328) · [PNG](figma/after-202-2328.png)    | [202:2238](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=202-2238) · [PNG](figma/after-202-2238.png)    | [702:15727](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15727) · [PNG](figma/after-702-15727.png) | [702:14925](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-14925) · [PNG](figma/after-702-14925.png) |
| 邮箱成功：原页 + Toast | [196:873](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-873) · [PNG](figma/after-196-873.png)       | [196:1989](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-1989) · [PNG](figma/after-196-1989.png)    | [702:15788](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15788) · [PNG](figma/after-702-15788.png) | [702:14986](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-14986) · [PNG](figma/after-702-14986.png) |
| 密码成功：原页 + Toast | [196:876](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-876) · [PNG](figma/after-196-876.png)       | [196:1992](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-1992) · [PNG](figma/after-196-1992.png)    | [702:15942](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15942) · [PNG](figma/after-702-15942.png) | [702:15047](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15047) · [PNG](figma/after-702-15047.png) |
| 密码结果未知：登录核对 | [196:877](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-877) · [PNG](figma/after-196-877.png)       | [196:1993](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-1993) · [PNG](figma/after-196-1993.png)    | [702:16096](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-16096) · [PNG](figma/after-702-16096.png) | [702:15108](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15108) · [PNG](figma/after-702-15108.png) |
| 邮箱结果未知：读取失败 | [694:7547](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=694-7547) · [PNG](figma/after-694-7547.png)    | [694:15348](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=694-15348) · [PNG](figma/after-694-15348.png) | [702:16120](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-16120) · [PNG](figma/after-702-16120.png) | [702:15132](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15132) · [PNG](figma/after-702-15132.png) |
| 邮箱结果未知：正在核对 | [697:14612](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=697-14612) · [PNG](figma/after-697-14612.png) | [697:14587](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=697-14587) · [PNG](figma/after-697-14587.png) | [702:16145](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-16145) · [PNG](figma/after-702-16145.png) | [702:15157](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15157) · [PNG](figma/after-702-15157.png) |
| 邮箱当前值已核对       | [698:14618](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=698-14618) · [PNG](figma/after-698-14618.png) | [698:14591](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=698-14591) · [PNG](figma/after-698-14591.png) | [702:16170](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-16170) · [PNG](figma/after-702-16170.png) | [702:15182](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=702-15182) · [PNG](figma/after-702-15182.png) |

此前 `697:14587` 手机浅色“正在核对”在 surface 返修后重导出遇到“Education plan MCP tool call limit”。本轮已有实际截图成功的新依据，按顺序一次导出剩余 7 个成功节点，再对该节点一次核对当前能力；8 次均成功，PNG 已刷新并逐张实际查看。此前限额保留为历史记录，当前没有因该限额而未导出的状态。

独立设计评审发现成功 Toast 沿用了旧 CircleCheck，获批原型与产品均为 Check。实际原生写入已将全部 8 个成功节点改为 `icons.js` 的真实 Lucide Check，保持 20px 尺寸、foreground 变量及其他布局；[原生写入返回与截图结果](figma-toast-check-write.json)保留修改前后图标 ID、通知 ID、矢量 ID、变量绑定及本轮实际截图结果。`196:873` 代表截图和后续 7 个成功状态截图均已刷新并实际确认是 Check。产品代码未修改。

历史 `figma/34-462.png`、`figma/102-1713.png` 保留作为此前节点来源。最终同步截图使用 `after-*.png`，不覆盖历史来源截图。

## 对照与差异处理

| 检查项               | 发现与处理                                                                                                                                                     | 最终依据                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 标题、字段、按钮图标 | 按批准原型补齐真实 Lucide SVG，并绑定主题变量                                                                                                                  | 两主题主页面、邮箱/密码表单及上述 PNG                                                             |
| 标题说明换行         | 初次 Auto Layout 自动宽度使说明撑出浮层；改固定浮层内宽，文字自动高度                                                                                          | 桌面与手机表单、unknown/verified PNG                                                              |
| 手机成功通知         | 初次自动宽度撑过右侧；改固定 358px，长说明换行                                                                                                                 | `196:1989`、`196:1992` 与对应深色节点                                                             |
| 成功流程             | 原独立成功弹窗改为原页中性 Toast；原 ID 保留                                                                                                                   | 四个成功节点与 PNG                                                                                |
| unknown 邮箱         | 原单个未知状态没有真实读取阶段；增加 checking / failed / verified，verified 不推断其他副作用                                                                   | 六个浅色及对应深色邮箱核对节点                                                                    |
| 深色导航/主操作      | 旧 SVG 字面颜色和浅色导航高亮不适用深色；绑定 foreground、navigation-current、primary-foreground                                                               | 深色桌面主页面和表单 PNG                                                                          |
| 深色卡片/弹窗        | 独立评审指出旧来源绑定 background。实际读取节点及 handoff.md「视觉基础」后，将本次 56 个状态的账号卡片/弹窗绑定 surface；输入、页背景和取消按钮继续 background | 写入返回全部目标绑定 `VariableID:264:1391`；56 个当前节点截图已导出，历史限额项本轮恢复并实际查看 |
| 编辑性与字体         | 实际遍历新增深色节点确认无整页/控件 IMAGE 填充；标题与正文 Noto Sans SC，品牌 Caveat；原有实例与本次矢量可编辑                                                 | Plugin API 返回的字体与 imageFilledNodes 检查                                                     |

本次没有重画原 Figma 公共外壳。桌面节点仍含早期“工作空间 / 站点设置”面包屑，手机仍有早期文字“菜单”。产品公共外壳按 `docs/design/handoff.md` 的共享 OwnerShell 实施；上述旧公共元素不能作为本次产品必须复刻的依据。设计评审应先按现行公共组件检查整页，再按同步业务节点检查账号区域。

## 完成状态与限制

- Figma 写入完成：28 个浅色状态节点（含保留与新增）及对应 28 个深色节点，保留既有业务节点 ID。
- 当前节点与最后 PNG 一致：56 / 56。全部成功通知的最后截图已刷新为 Check 并逐张实际查看；手机浅色 checking 的 surface 返修后截图亦已导出并查看。当前没有未刷新的 Figma 状态截图。
- 同步者已实际查看两端主页面、两类表单、错误/处理中、成功通知和 unknown/verified 的真实截图；深色卡片、输入及主按钮的最后返修亦通过代表状态视觉核对。截图数量不替代独立设计评审。
- 真实产品浏览器验证、独立代码/设计评审、人工验收均由统一证据分别记录。本次同步未操作浏览器、未改产品代码、未提交凭证、未做 Git 提交。
