# 上传手机端与批量复制返修提案

状态：用户于2026-10-04明确批准按本方案实施，并授权同步Figma。原型是本轮批准依据；当前实施、验证与再次人工验收状态统一见 [Issue #187记录](../../docs/verification/library-187/README.md#人工反馈后的获批返修2026-10-04)。
Written against: 26e0fde1fe7c83aaae6fa97b296440161b242208

## Design language

- Audited surface: `/upload` 空输入区；`/library` 和 `/albums/{albumId}` 批量复制；`/trash` 已选操作入口。
- Design sources: 用户2026-10-04本轮三张截图和明确反馈；`docs/design/handoff.md`；`docs/specs/SPEC-library.md` §8；`src/app/globals.css`。
- Documented decisions: 现有黄主色、白/深色界面、中文字体、公共外壳、44px触屏目标、48px主动作。原复制状态节点388:6482/6690与原选择387:5769/5709有结果工作区和绿色说明；handoff的10月2日条款规定格式Dropdown。用户本轮要求撤销这些批量流程的呈现方式。
- Governing owners and consumers: `src/components/upload/screen.tsx`；CopyDialog、CopyResult、useLibraryCopy、LibraryScreen；LibrarySelectionMenu由图库/相册/回收站消费。
- Explicit exceptions: 手机输入区本轮请求重新编排，桌面已批准布局保留；图库/相册批量复制新交互待本提案审批。上传结果/单图详情的格式Dropdown不在未经批准的修改范围。

## Findings

| #   | Problem                                    | Evidence                                                                          | Proposed change                                      | Scope               | Confidence |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------- | ---------- |
| 1   | 复制成功占用整页，并迫使用户返回           | 用户第2张图；LibraryScreen在copy.contentVisible时换成CopyResult，固定底栏替换操作 | 全成功关闭原弹窗，在原列表用中性Toast显示真实数量    | 图库/相册批量复制   | 高         |
| 2   | 常驻绿色说明和二次下拉使简单动作变复杂     | 用户第3张图；CopyDialog以bg-default展示说明，格式Button打开Dropdown再选择         | 删除常驻说明框，格式直接选择，配一个复制主按钮       | 图库/相册批量复制   | 高         |
| 3   | 手机文件夹按钮夹在说明行，图片按钮另起一行 | 用户第1张图；upload/screen.tsx的1200px以下分支把chooseDirectory放在说明中         | 两个48px按钮并排等宽，说明另起一行；缩减空输入区高度 | 上传手机/平板空状态 | 高         |

## Improve first

优先删除复制成功工作区，让复制留在原任务上下文。它直接消除额外返回操作。

## Design decision

### 复制流程

1. 图库/相册的「已选N张 → 复制链接」以及已接入的图片右键入口，打开同一紧凑弹窗。
2. 顶部仅显示标题和实际选中数量/页来源。复制版本继续使用现有Select。
3. 输出格式使用现有HeroUI ToggleButtonGroup/RadioGroup能满足时的单选控件，URL、Markdown、HTML始终可见；以获批surface.html为准，内按钮等宽44px高、组52px高。主动作48px高。优先核对已安装依赖类型，不自制重复控件。
4. 底部「取消」「复制」；不再用一个下拉动作隐藏三种格式。默认URL，用户更改格式后点击复制。
5. 全部成功：仅在实际Clipboard成功后关闭弹窗，保留原列表、滚动位置和选择，中性白/深色Toast显示“已复制N条链接”，不新增路由或整个结果工作区。
6. 部分成功：保留同一弹窗，在紧凑区域说明实际成功数量和失败条目，只列失败名称/原因；不跳整页、不展示成功缩略图和成功表格。关闭返回原列表；修改版本可重试。
7. 全部不可用：同一弹窗展示原因和“剪贴板未改变”，不给成功提示。HTTP错误保留当前设置、错误原因和重试主动作，与全部不可用区分。
8. Clipboard拒绝：同一弹窗切换为完整可选文本。标题“手动复制”，说明一句“请选中文本后复制”。不提前说“已复制”。
9. 删除“默认链接跟随站点设置，当前预览...”及“复制不会改成公开...”常驻绿色块和重复说明。默认选项文字自身显示“默认（跟随站点）”。有真实私有/未就绪访问限制时使用按需简短文字，不做装饰横幅；没有限制不展示。公开原图的真实GPS/拍摄信息事实同样按需短句呈现，不删除后端事实或改变访问权限。
10. 原型保留品牌黄色，只用于所选格式和复制主动作；成功Toast白色/深色底，不用绿色背景。

### 上传手机空状态

- 复用同一输入控制器；两个实际文件选择动作不变。
- 输入区图标32px、标题20px、间距16px、内距24px；两个按钮等宽并排、48px高、12px间隔。
- 说明在按钮下单独一行：“支持多选 · 单文件最大50.0MiB”。最大值仍来自真实设置，原型仅用当前预览值。
- 外部页面标题、设置、固定开始上传底栏沿原实现；不重排桌面已批准的输入区。

### 入口核对与提案

- 图库/相册：LibraryScreen确实向LibrarySelectionMenu传copy动作与contextMenu；选中后可由已选按钮或已接入的右键菜单进入。
- 回收站：只传scope=trash、restore，未接contextMenu；因此当前“共用菜单”仅指工具栏已选下拉，不能声称已有右键。此前测试也只验证已选下拉，未验证不存在的右键。
- 建议本轮批准后给回收站图片卡片接入同一右键入口，仍只提供恢复、查看记录及选择管理，不提供复制外链或新删除能力。先用Ego复现用户指出的入口，再补实现和消费回归。
- 相册Ego反馈阶段确实在隔离测试相册选择3张、点击已选入口、复制URL，并逐字核对原生剪贴板与joined_at顺序，报告见docs/verification/library-187/browser/feedback-r4/library-copy.json。该通过记录不能证明用户现在的页面右键入口正常。下一轮应单独复核用户预览的工具栏/右键/手机勾选入口，记录失败再修复，不让用户承担找入口的责任。

## Reuse

- 颜色和中文字体沿src/app/globals.css：#fffffe、#272343、#ffd807、#bae8e8、#41445b；深色沿现有变量。
- 公共OwnerShell、HeroUI Modal/Select/ToggleButtonGroup或RadioGroup/Button/TextArea/Toast；现有Toast成功例子src/components/library/use-library-batch.ts和detail-copy.tsx。
- copy接口、200批大小、排序、权限判断、固定版本不回退、错误和401清理保持契约。
- 原型模拟反馈，不连接API或改写真实剪贴板；它不代表功能修复完成。

## Changes

1. CopyDialog、useLibraryCopy、LibraryScreen：以原弹窗承载配置/局部失败/手动文本；删掉仅服务于整页复制结果的CopyResult/CopyResultFooter及预览捕获路径，确认无其他消费后移除。
2. UploadScreen：只改1200px以下空输入区按钮编排和空间。
3. TrashScreen及既有卡片事件：补右键需审阅同意后实施，复用已有ContextMenu传递；不新增平行菜单。
4. e2e/library-copy.mjs/helpers：改成功反馈断言和返回焦点；保留真实剪贴板、200+1、排序、全失败和真实401断言。上传/回收站仅补受影响入口场景。

## Scope

- Inherit: 图库/相册批量复制；手机/平板上传空输入区。
- Verify: 图库与相册工具栏/右键；回收站对应菜单；所有更改组件的消费路由；保留单图复制未被误改。
- Exclude: 上传后端、集合契约、其他批量操作结果、全局主题重做、无关绿色区域、发布/合并。

## Validation

- 先在Ego实际复现相册入口及回收站右键现状，记录证据。
- 先390/1440两端代表状态及浅深色，人工对照本次获批原型；随后360/430/768及短视口、焦点、触屏44px。
- 状态：全成功关闭后Toast与位置/选择保留；部分失败；全部失败剪贴板未覆盖；传输错误重试；原生Clipboard拒绝的完整文本；生成中禁用；真实401清理。
- Node24/pnpm；冻结安装、format:check、lint、typecheck、unit、受影响集成及build；直接运行已接入本次场景的Ego运行器，不重复不受影响矩阵。
- 独立代码审计、设计对照后更新原library-187证据；现有SVG水印超时单独保留，不冒充通过。

## Stop conditions

- 方案已获批准；最终实际页面仍须用户人工验收。
- 如果相册问题需要扩大数据/访问契约，先说明；不伪造接口。
- 保留Ego21与独立预览。用户重新接管时停止浏览器操作，恢复同一空间须取得本次接管后的明确继续指示。

## Design documentation

审阅批准后，在docs/design/handoff.md维护一次当前约定：撤销本批量复制流程的整页成功工作区、常驻水绿说明和格式Dropdown。删除或限定冲突条款，不改写冻结PRD或历史Figma/验收记录。task卡保留需求编号并指向新的批准记录；原历史技术/设计通过记录补记本轮人工未通过与修正结论。
