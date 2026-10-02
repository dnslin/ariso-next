# Issue #176 独立代码审计

审计日期：2026-10-02。范围：T-COL-03 / R-16.2-01、R-16.3-02。

## 结论与边界

使用 `code-review-and-quality` 和 `vercel-react-best-practices`，按“先测试、后实现”的顺序读取了所有新增源码、测试及浏览器脚本，不能只依赖 `git diff`（本轮新增文件最初均为 untracked）。读取项目 AGENTS、docs/README、execution、handoff、SPEC-collections §3/7/8、T-COL-03 和 DG-TAGS 交接；同时核对现有 collections 模型/规范化/事务、identity 鉴权与来源检查、library 的 tagId 查询、共享 Providers 和 OwnerShell。

初轮提出的搜索输入、未知结果核对、核对分页、未知操作出口、业务失败日志问题已经修复。修复后源码复审 **Critical 0、Required 0**。这只是代码审计结论，最终构建、全量集成及真实浏览器回归由主实施流程完成并记录；本报告不将尚未收齐的运行证据写为通过。设计对照由另一独立评审者负责，用户人工验收仍待执行。

## 范围、正确性与模块职责

- `/tags`、管理 HTTP 和标签服务分别负责界面、identity 组合、collections 规则。未新增依赖、迁移、多租户、兼容层、后台队列或文件读写。
- 名称沿用 `tagNameSchema` 和 `getOrCreateTags`：先拒绝控制字符，再 trim/NFC，按 Unicode 码点限制 1–50；完整大小写折叠后 NFC，保留首次显示形式。创建返回真实 ID；同键重命名不改显示形式、时间或关系；撞另一标签返回 409，不合并。
- 写入口使用短 `immediate` SQLite 事务；唯一键竞争沿用数据库约束。列表默认 40，可选 20/80，创建时间降序和 ID 升序；`instr` 使 `%`/`_` 保持字面意义。一次批量聚合本页成员数量，没有逐行查询关系或文件的 N+1 操作。
- 正常数量排除回收与删除中，包含 private/failed/存储停用。删除沿用外键 CASCADE，清除含回收站的所有关系，媒体资产/任务/对象保持。重复删除允许无变化成功；同名重建的新 ID 不继承关系。
- 所有接口复用 `requireOwner` 的真实 Cookie 会话与写来源检查，Bearer/分享凭据不授予管理权；响应 no-store。400/404/409 与真实数据库 500 分开，错误没有被当作删除成功。
- 进入图库使用 `/library?tagId=<真实ID>`，复用既有查询；返回标签列表保留 URL 搜索/页码。页面继续复用统一 OwnerShell；统一导航退出标签占位，并扩展全部已实现路由的浏览器外壳检查。
- 列表查询通过 TanStack Query 的 signal 取消，卸载清理页面 QueryClient；对话框使用 inFlight 拒绝重复写入，mounted 防止离开页面后的结果操作。未知写入先读当前目标，核对失败仍为 unknown，不自动重复写入；创建核对遍历子串分页直到精确键匹配或结束，删除核对 404 只表示旧 ID 已不存在。
- 未知状态保持“重新加载”核对入口；通过既定右上关闭退出时，以页面提示保留本次输入并明确结果仍待核对，清空旧 action，重读真实列表，不把关闭浮层当作撤销或成功。React 客户端没有运行时导入 server 标签管理模块，类型 import 不产生服务端依赖；HeroUI 子路径导入、已有全局 RouterProvider 和上传资源上下文继续复用。

## 初轮发现、失败证据与修复

1. **Required：搜索输入即时归一化吞掉内部空格。** 初稿 TextField 的 value 直接绑定解析后的 q。逐字符模拟输入 `旅行 生活` 的实际结果为 `旅行生活`；合法带内部空格名称不能连续键入。修复为显示 URL 原始 q，查询仍按现有 parser 规范化。浏览器脚本已加入真实逐字输入回归。
2. **Required：响应丢失没有先读取目标。** 初稿只进入 unknown 并等待用户再点核对，违反 DG-TAGS 的“先核对，再保留未知”。修复后提交 catch 只在连接/不可确认响应时调用 verify，按现有 ID 或规范化名称读回；未自动重发写请求。编辑仍按旧 ID 核对，删除 404 展示旧 ID 已不存在，不能绑定同名新 ID。
3. **Required：只检查前 80 条子串结果会误报精确名称不存在。** 独立 SQLite 夹具创建老 `Go` 与 81 个较新的 `Go-*` 后，真实读取输出为 `{"total":82,"readRows":80,"exactExists":true,"firstPageExactFound":false}`。修复为连续读取分页直到精确匹配或读完；不能把“第一页未命中”当不存在。
4. **Required：关闭未知结果后无法结束旧 action。** 初稿 preserve 的旧 action 会拦截之后所有创建/编辑/删除入口。中途新增“结束本次操作”按钮被独立设计评审判定未经批准，已经移除。最终复用既定右上关闭，通过页面提示保留本次输入与未知结果说明，清旧 action 并读取列表；不执行撤销或自动写入。
5. **Required：可预期业务失败缺少诊断日志。** 已有 400/404/409 响应分支直接返回。先在 `tag-http.test.ts` 增加真实 HTTP 失败的日志断言，在旧 build 上复现失败：`tag-http.test.ts:206` 缺少 `COLLECTION_INVALID_INPUT / POST /api/tags / 400 / Tag management rejected`。随后在同一 response 分支记录 method/path/code/message/status；不引入新审计机制。测试同时断言本模块日志不包含 Cookie 或会话 Token。最终 build 后的集成重跑由主流程记录。

以上修复均在本 Issue 内完成，未把实施偏差转为后续任务。初稿浏览器脚本的按钮名、201 响应、成功关闭方式与实现不一致，已经反馈给浏览器实施者修正；脚本修正必须以真实执行证明，不能仅凭静态阅读宣称通过。

## 审计者实际执行

环境：macOS ARM64；Node `24.18.1`；项目 pnpm `11.19.0`。命令均在 `/Volumes/data/project/ariso-issue-176` 执行，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。

| 命令                                                                                                                      | 结果                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `pnpm exec vitest run --project unit tests/unit/collections/tag-query.test.ts`                                            | 1 个测试通过                                           |
| `pnpm exec vitest run --project integration tests/integration/collections/tag-management.test.ts`                         | 3 个测试通过                                           |
| `pnpm exec vitest run --project integration tests/integration/collections/tag-http.test.ts`（新增失败日志断言、旧 build） | 1 个测试失败；命中上述真实缺日志证据，随后修复         |
| `pnpm exec prettier src/app/api/tags/response.ts tests/integration/collections/tag-http.test.ts --check`                  | 通过                                                   |
| `node --experimental-transform-types --input-type=module`（内存流程与临时 SQLite 夹具）                                   | 复现搜索空格丢失及前80条漏精确键，见下方实际代码与输出 |

独立复现代码（终端 stdin，未创建测试脚本或修改真实数据库）：

```js
import { collectionFixture } from './tests/integration/collections/helpers.ts';
import {
  createTag,
  listTags,
} from './src/server/collections/tag-management.ts';
import { parseTagQuery } from './src/server/collections/tag-query.ts';
import { tags } from './src/server/collections/schema.ts';
const fixture = collectionFixture();
try {
  const tag = fixture.db.transaction((tx) => createTag(tx, { name: 'Go' })).tag;
  fixture.db.$client
    .prepare('UPDATE tags SET created_at=0 WHERE id=?')
    .run(tag.id);
  for (let i = 0; i < 81; i++)
    fixture.db.transaction((tx) => createTag(tx, { name: `Go-${i}` }));
  const result = listTags(
    fixture.db,
    parseTagQuery(new URLSearchParams({ q: 'Go', pageSize: '80' })),
  );
  console.log(
    JSON.stringify({
      total: result.total,
      readRows: result.items.length,
      exactExists: !!fixture.db.$client
        .prepare('SELECT id FROM tags WHERE normalized_key=?')
        .get('go'),
      firstPageExactFound: result.items.some((row) => row.id === tag.id),
    }),
  );
  let text = '';
  for (const char of '旅行 生活')
    text = parseTagQuery(new URLSearchParams({ q: text + char })).q;
  console.log(JSON.stringify({ typed: '旅行 生活', controlledQuery: text }));
} finally {
  fixture.close();
}
```

```json
{"total":82,"readRows":80,"exactExists":true,"firstPageExactFound":false}
{"typed":"旅行 生活","controlledQuery":"旅行生活"}
```

未重复执行主流程的全量安装、lint、typecheck、构建、集成和浏览器。未执行 Release 镜像/容器或物理设备检查，日常 PR 不要求这些验证。未审计或修改 library 原有候选搜索的 Unicode 边界，也未把后置上传批次/批量关系或分享能力列为本次完成。

## 最终补充复审

补充读取 `src/components/identity/return-to.ts`、其完整单元测试、标签最终 dialog/list/screen、浏览器适用选择器以及已锁 HeroUI 3.2.6 的 AlertDialog / Modal 类型和实现。

- 登录目的地沿现有 allowlist 增加已实现 `/tags`，原始搜索、页码、pageSize 和 hash 按已有机制保留；未开放 `/tags/unknown` 或外部 URL。新增测试验证真实查询返回和拒绝边界，没有扩大授权或引入新重定向规则。
- 主流程先添加回归断言，取得 `loginDestination('/tags?q=Go&page=2&pageSize=20')` 实际返回 `/admin` 的失败，再加入 allowlist。独立回读 [失败记录](login-return-before.txt) 和 [修复后记录](login-return-after.txt)：同一文件从 19 通过 / 1 失败变为 20 通过。本轮审计者没有重复执行该测试。
- 删除采用库已有 AlertDialog，其 Dialog 实际输出 `role="alertdialog"`；创建/编辑继续 Modal。两者共享的 Backdrop / Container / Header / Heading / Body / Footer API 已由安装包类型确认。`isDismissable={!pending}`、`isKeyboardDismissDisabled={pending}` 显式保持原来的取消与提交中禁关闭行为，没有依赖 AlertDialog 不同的默认值。浏览器脚本已同时匹配 dialog / alertdialog，通用几何检查不依赖角色名称。
- 表头透明背景、手机链接常规字重、搜索框 14px 常规字重仅调整样式；没有改变名称、关系、点击目标或查询契约。是否满足 Figma 由独立设计评审与真实截图确认，本审计不替其下结论。

补充源码结论仍为 **Critical 0、Required 0**。全量集成正在主流程执行，已有失败须由主流程定位、重跑受影响检查并如实记录；本报告不能把旧场景超时预先排除，也不把“源码没有剩余缺陷”当作适用运行检查已通过。

### 搜索无结果与最终样式复读

最后一轮仅复读源码与浏览器脚本，没有新增运行检查。“清除搜索”只在有效搜索无结果时呈现，复用 HeroUI Button 和现有 `apply({ q: '', page: 1 })`，保留当前 pageSize、清除查询并返回第一页；不写数据库或触碰关系。浏览器回归改为实际点击该按钮，明确断言 URL 不再含 q、加载结束并恢复默认 40 条，未用直接改 URL 代替控件行为。

最终 default/accent/field/surface 语义颜色、14px 输入字号以及移除 HeroUI 表头默认分隔均限于标签界面，没有修改全局主题/全局输入样式或引入新配置。阅读了 globals 的手机 16px 输入规则以确认本次局部字号覆盖的影响边界；设计是否一致仍归独立设计报告。此次复读没有新增 Critical 或 Required。

主流程此前四并发集成失败/中断记录不能记为通过；当前改为串行执行的结果仍待主流程收齐。源码审计结论不替代这些检查。

### 校验反馈与加载失败最后复审

实际复读最终 `dialog.tsx`、`screen.tsx` 和 `e2e/tags.mjs`；本轮未新增运行。客户端仍只通过 `tagNameSchema.safeParse` 判定合法性。失败后按其首个错误区分控制字符、空值和超长，trim/NFC 后的 Unicode 码点长度仅用于反馈文字与计数，没有添加第二套输入校验。fieldError 保存标题和消息，输入改变即清除；标题、字段错误和“修改名称”按钮随真实失败类别呈现，仍保留原输入且不发写请求。

加载失败改为页面失败标题、可读错误提示和 OwnerShell 固定底栏的重新加载按钮。已有 reload 逻辑继续区分非法 URL 查询和正常读取失败；没有把失败显示为空列表或零数量。失败时隐藏正常搜索/创建区域，成功重读后按查询状态恢复。浏览器脚本已增加空值/超长/控制字符对应真实标题、修改按钮与纠正输入后的正常标题断言，最终执行结果仍由主流程收齐。

独立回读 [真实旧构建失败记录](attempts/validation-before/validation-before.json)：空值标题实际为“新建标签”，期望“请输入标签名称”；超长同样错误，两个场景均取得 AssertionError 及对应截图。此记录证明先复现再修复，不能当修复后浏览器通过。

主流程串行集成已完成；独立读取 [integration-serial.txt](integration-serial.txt) 结尾，108 个文件、980 个测试通过。这是主流程运行证据，未由审计者重复执行。四并发失败/中断历史继续保留。最终 UI 构建及全浏览器验证仍在收齐，设计结论继续由独立设计评审负责。最后源码结论维持 **Critical 0、Required 0**。

### 未知结果退出与最终反馈收敛

独立设计评审要求移除 `418:4118 / 418:8310` 未提供的额外“结束本次操作”按钮。最终源码已移除此按钮，右上关闭调用既有完成回调，仅写入明确“结果仍待核对”“关闭不撤销请求，也不表示成功”且包含本次输入名称的页面 notice，再清空 action 并触发 GET 重读。此回调不会重发 POST/PATCH/DELETE。用户可以显式开启新表单，不会被旧 action 困住；编辑/删除核对仍使用原标签 ID，不按同名新记录接续旧请求。

保留输入并不需要保留会拦截下一次操作的旧 action。当前页面 notice 保留文本用于人工核对，关闭行为没有把未知转成成功。已删除不再使用的 preserve 参数和条件，没有引入额外锁或状态管理机制。浏览器回归须对应新的关闭入口检查 notice、新表单与 single-write，本轮审计没有将尚待执行的对应检查记为通过。

字段校验消息收敛为 HeroUI FieldError 中唯一一处水绿提示，取消重复说明；明确失败的主要按钮按创建/编辑/删除分别呈现“重新创建”“重试保存”“重试删除”。这些只调整已识别结果的表达，没有改变合法性、提交或未知核对规则。源码结论维持 **Critical 0、Required 0**，真实截图与对应运行证据仍由主流程及设计评审收齐。

## 最终代码结论与验证限制

最后实际复读确认 notice 使用 `whitespace-pre-wrap` 保留输入中的空白；既有全局 `p { overflow-wrap: anywhere }` 已保证长名称可换行，没有重复增加局部规则或修改全局样式。对话框 onClose 为无参数，旧 preserve 分支已删除。最终浏览器脚本检查未知关闭后的待核对提示、原输入名称、写入一次和重新打开空白新表单；不再查找已经删除的额外按钮。

**最终源码审计：Critical 0、Required 0。** 没有把这一源码结论写成完整浏览器通过。独立读取 [完整浏览器 runner](browser/runner.json) 与主实施记录，完整 `pnpm run test:browser` 实际失败于旧上传页面 1920px 布局断言，其后的未执行场景不计通过。独立对比 `origin/main` 与当前分支：`src/components/upload/screen.tsx` 和 `e2e/interaction-polish.mjs` 无 diff，上传 composition 的 `min-[1200px]:max-w-[1280px]` 在两边完全相同。该范围外问题只报告，不修改上传实现、不削弱旧断言。

最终受影响场景记录已实际回读：[affected-runner](browser-affected/affected-runner.json)、[tags](browser-affected/tags.json) 和 [shell-navigation](browser-affected/shell-navigation.json) 均为 passed，没有 error。标签记录包含 12 项功能检查、114 个视口/主题布局、118 张实际截图；覆盖第二页精确键核对、未知结果关闭提示与新表单、单次写入、同名重建的新 ID、真实搜索清除、分页返回与短视口键盘焦点。导航记录覆盖 `/upload`、`/library`、`/albums`、相册内容、`/trash`、`/tags`、`/admin` 七个消费入口，两端浅深色统一品牌、账号、导航顺序与当前项；共 38 个布局记录、82 张截图。

这些直接运行结果证明本次受影响场景通过，不能替代完整浏览器流程未通过的事实。最后源码复读仅新增 FieldError 的 `leading-normal` 和明确删除失败时的目标名称保留/“返回标签”文案；它们没有改变 schema、状态判断、关系或提交行为，未发现新增代码问题。**最终源码审计仍为 Critical 0、Required 0。** 本轮审计只读源码和已生成记录，没有重复运行检查、操作 Git 或扩大范围；对应结果以主 [实施与验证记录](README.md) 和 [设计评审](design-review.md) 的实际证据为准。用户人工 UI 验收仍未执行，未声明通过。

## 用户人工反馈后的本轮源码审计

用户新增授权手机标签数量/日期横排、搜索和名称图标、成功反馈使用 Toast，以及图片详情私有标签悬停修正。本节结论仅适用于本轮源码，不把前一轮已经通过的浏览器结果当成本轮通过。

审计者独立复读主实施者修改的 tags screen/dialog/list 及对应 `e2e/tags.mjs`，核对安装包 HeroUI 3.2.6 InputGroup、Toast 的类型/实现/样式与既有全局 Providers：

- 搜索和名称继续使用 TextField，组合已有 InputGroup.Prefix/Input；16px Lucide Search/Tag 图标带 aria-hidden，字段原标签、值、自动聚焦、错误关联和禁用来源继续保留。前缀用 12px 左边距、16px 图标、8px 间隔，输入本身无左 padding，没有重写输入事件或增加校验规则。
- 手机数量/日期是分别不拆字的子 span，外层 flex-wrap 横排；常规可用宽度同行，空间不足时允许换行，日期仍按站点时区和原有格式显示。链接、ID、计数来源与操作按钮保持。
- `onComplete` 仅增加内部反馈状态 `success | unknown`。真实写入/无变化删除的确认消息使用既有全局 `toast.success`，并清除旧页面 notice；未知关闭显式传 `unknown`，保持含输入的持久提示而不会发成功 Toast。已经读回但不能证明提交的 checked 状态不发送成功消息，仍保留原核对说明。列表刷新和单次写入控制保持，未新增 ToastProvider、Toast 队列或资源生命周期。
- 浏览器回归源码已改查实际 success Toast，并检查可见的 16px 图标和手机数量/日期同行；未知关闭仍查持久提示、原输入、新表单及单次写入。安装包 InputGroup 内部继续使用 React Aria Input 和 TextField 上下文，没有另做原生输入框或图标点击处理。

图片访问说明 `src/components/library/access-disclosure.tsx` 由本报告审计者实施，因此**不将本人自检冒称独立审计**。主实施者另行实际复读该源码与 HeroUI Button CSS，确认单层 Button 保留 label/Popover、44px 点击区、原可访问名称和说明内容；默认 hover/pressed 背景固定为现有水绿 default，取消位移/缩放和过渡，保留焦点轮廓。独立复读结论没有新增正确性或权限问题。原来的嵌套 Chip 已删除，未新增状态或修改图片权限契约。

审计者仅针对 AccessDisclosure 运行 `pnpm exec prettier src/components/library/access-disclosure.tsx --check` 与 `pnpm exec eslint src/components/library/access-disclosure.tsx --max-warnings=0`，Node 24 下均通过。主流程类型已通过，新的构建/lint及受影响浏览器结果正在收齐。原隔离 Ego 空间已关闭，本轮尚未执行浏览器；访问说明的 hover/点击/键盘，以及本轮标签图标、横排、Toast 与未知提示不能标为实际通过。主流程继续用真实页面检查相关行为。

本轮独立 tags 源码审计 **Critical 0、Required 0**。AccessDisclosure 的主实施者独立复读无新增问题；本轮运行/设计验收仍待证据，不据此宣称已完成用户新增要求。

## 通知键盘焦点与无形变断言的最后复审

独立复读 `Providers` 的最后修改和 HeroUI 3.2.6 Toast.CloseButton 实现/CSS：库默认关闭按钮为 `opacity-0`、`pointer-events-none`，仅在通知 hover 时显示。本次只为已有 44px 关闭按钮添加 `focus-visible:pointer-events-auto focus-visible:opacity-100`，使键盘获得可见焦点时显示并可点击；仍使用库提供的关闭操作和既有可访问名称。没有增加焦点监听、计时器、通知队列、状态或卸载逻辑，ToastProvider 的位置、通知内容、导航和 QueryClient 创建方式没有变化。

此 Providers 是标签成功消息及既有图库复制/下载/移入回收站、回收站恢复、存储复制消息共用的通知渲染入口。修复适用于它们的关闭按钮，不改变这些调用的成功判断、消息、请求或资源生命周期。实际键盘缺陷由主流程复现为 Tab 后 `:focus-visible=true` 但仍透明且不能接收指针，Enter 已能关闭；最后修复后的键盘结果仍以本轮真实浏览器证据为准。[已有 hover 失败记录](manual-revision/attempts/toast-hover-required/green.json) 保留，不能冒称修复后的通过证据。

独立复读 `e2e/ui-refinement.mjs`：`getComputedStyle(...).transform` 的 `none` 与浏览器返回的 `matrix(1, 0, 0, 1, 0, 0)` 均转换成 DOMMatrixReadOnly，再对当前二维变换的六个系数严格断言 `[1, 0, 0, 1, 0, 0]`。平移、缩放、旋转和倾斜仍会失败，未放宽为任意 matrix 或删除断言；保持 idle/hover/keyboard focus 三个状态、单层背景、44px 点击区、可见焦点、Popover 操作和 Escape 返回焦点检查。该 helper 由另一实施者修改，本审计者仅复读；AccessDisclosure 本身由本审计者实施、主实施者另行独立复读的分工保持。

**最后源码复审：Critical 0、Required 0。** 主流程本轮 `pnpm run build`、`pnpm run typecheck`、`pnpm run lint` 已实际执行并报告 exit 0，相关记录位于 [manual-revision](manual-revision/README.md)；审计者没有重复运行检查。恢复后的 Space 5 正在补最后键盘和标签专项证据，此时不将本轮浏览器或人工设计验收标为通过，也不以此前失败运行中生成的 green 文件名判断成功。

### 窄屏通知文字与关闭按钮空间复审

末轮真实页面对照发现 390px 通知的 44px 焦点关闭按钮覆盖文字。独立复读最后一行 `Toast.Content className="min-w-0 pr-8 wrap-anywhere"` 与已安装 Toast CSS：通知本身左右各有 16px padding，关闭按钮绝对定位于右侧 -4px、宽 44px；内容增加右 padding 32px 后，文字右边界距通知右边 48px，超过按钮占用的 40px 并留出间隔。`min-w-0` 允许 flex 内容缩小，`wrap-anywhere` 使长名称按可用宽度自然换行；标题和描述没有截断规则。没有改变通知大小规则、关闭按钮点击区、显示逻辑、通知队列或业务状态。

该修改修复已有公共通知布局的实测问题，影响仍局限于上述 Toast 消费入口。独立源码复审 **Critical 0、Required 0**；修复后的 390px 实际文字/关闭按钮对照等待最后截图证据，不将源码判断写成浏览器或人工验收通过。审计者未修改实现、未重复运行全量验证。

### 最后文字重叠检查与实际短补验

独立实际读取新增 `e2e/toast-layout.mjs`、`e2e/tags.mjs` 的布局调用，以及本轮短验证脚本与 [toast-content.json](manual-revision/toast-content.json)。helper 对真实通知标题的文字节点建立 DOM Range，逐行读取渲染矩形，断言每个片段完整容纳在通知边界，并逐个检测与 44px 关闭按钮矩形是否相交，没有仅根据整块标题宽度或截图数量推断无覆盖。完整标签布局检查中通知可自然过期，未出现时记录 null；短补验明确断言通知存在、包含实际提交名称、至少两行文字，避免这个可过期分支使最后修复验证空通过。未新增业务能力或模拟成功写入。

实际短补验命令 `node work/run-manual-tags-browser.mjs toast-content` 在 Node 24.18.1、保留的独立 Ego Space 5、独立 50953 数据库执行，结果 **passed**。390×844 浅深两主题均通过真实 50 码点标签创建后的通知检查，文本四行完整容纳且不覆盖关闭按钮；关闭按钮为 44×44，键盘 focus-visible 时 opacity 1 / pointer auto，Enter 实际关闭。生成 [浅色截图](manual-revision/toast-content-light-390.png) 与 [深色截图](manual-revision/toast-content-dark-390.png)，测试创建的标签随后由真实 API 删除。记录确认原 57635 预览数据不变。

**最终独立源码审计：Critical 0、Required 0。** 完整标签专项的 12 项功能检查、114 个布局和 118 张截图是在最后 Toast.Content 排版补修之前执行；最后补修后只运行上述两主题短补验，没有再执行完整标签专项或完整 browser 流程。其余先前限制和范围外上传失败保留，最后人工复验仍由用户完成。本审计者只读源码与已生成证据并更新本报告，没有重复执行检查；AccessDisclosure 的独立源码复读仍由主实施者完成。

## PR #226 双角度审查与修复后独立复审

2026-10-02，用户要求两个独立agent分别应用code-review-and-quality和thermo-nuclear-code-quality-review。两者均审查完整 `3eb585f910e21518dd1061094fe556b1884f3fe4...af6b8d830b7915b7c596967f63b683a481bc5d7a` 两提交，读取项目规则、现行规格/交接/执行约定、调用链、安装包类型和相关测试，不重新评审已批准产品选择。此前源码通过结论保留为历史；本轮发现说明前次审计未覆盖以下故障。

| 原发现                                                                       | 原严重度                                 | 修复后结论                                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| 真实写入提交后5xx进入failed，错误宣称关系未改变且不发核对GET                 | 五维审查Required/P2                      | 已解决。仅`<500`进入明确失败；5xx复用unknown/verify，不自动重写    |
| 目标已读回但列表刷新失败覆盖成unknown                                        | 结构审查Required/P2；五维审查Optional/P3 | 已解决。列表保留自己的query错误展示，不将列表error重抛给目标核对   |
| 新增标签脚本1122行，视觉测量/业务混杂，26处重复弹窗selector和5处重复成功等待 | 结构审查Required/P2                      | 已解决。按现有视觉模块模式提取布局，集中小型业务等待，未建通用框架 |

原五维审查在自建临时SQLite实际执行createTag/deleteTag后交付HTML502，确认原失败分支与真实提交不一致；还用Node24.19.0执行3文件24项定向单元/集成，exit0。这是修复前的审查运行，不冒称修复后新运行。结构审查执行源码/差异/AST读取及三文件语法检查，没有运行浏览器或构建。两份原审查均Request changes，Critical0；同一列表发现仅计一项，最终处理三项。

### 修复后独立代码结论

最终复审者没有实施客户端、测试重组或新增故障场景，仅独立复读并输出结论。实际检查安装的TanStack Query QueryObserver：refetch默认不启用throwOnError，失败更新query结果后返回；screen仍用list.error/isError显示错误，401仍由既有effect退出会话。未发现静默吞错或错误归因残留。

独立AST比对确认原71处assert在最终主脚本59+布局12处全部保留；69处除空白一致，2处仅提取相同textContent读取。SQL校验、单次写入、布局矩阵、连续操作顺序与finally清理均保留。最终tags.mjs855行、tags-layout158行、tags-dialog27行；纯重组净减86行，新增reconciliation408行另计。没有改服务端、schema、依赖或公共UI配置。

实际回读[旧包4案失败证据](review-fixes/tag-reconciliation-red.json)、[修复后8案](review-fixes/tag-reconciliation-green.json)、[完整流程内8案](review-fixes/tags-regression/tag-reconciliation-green.json)和[最终完整标签报告](review-fixes/tags-regression/tags.json)。逐案核对真实提交状态、交付状态、SQL关系、图片ID、核对请求及一次写入；502/丢响应确实发生在真实写入后，模拟400则明确在写入前拒绝，`realStatus:null`。完整标签结果passed，14项检查、114布局、126截图。新增8案交替桌面浅色与手机深色，不声称四组合全矩阵。

**最终独立代码复审Approve，Critical0 / Required0。** 复审者执行只读分析、AST对比和`git diff --check`（exit0），没有重复运行浏览器/产品全套，也不从日志片段自行推断主流程构建退出码。适用实际命令、环境与运行结果集中在[审查修复记录](review-fixes/README.md)。独立设计状态复核见[设计报告最新节](design-review.md#pr-226-审查修复后的受影响状态复核2026-10-02)，不以代码Approve替代设计或用户人工验收。历史整站浏览器范围外上传失败、未执行物理设备/发布验证和后置能力均保留。
