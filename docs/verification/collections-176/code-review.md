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
