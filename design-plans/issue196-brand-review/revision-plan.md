# Issue #196 第二版原型修订执行计划

Written against: `7cba32692c0083254b3c585357b53eb4dbd73467`。2026-10-10。执行者为主线程；本计划编写者只读产品源码，没有操作浏览器或修改产品实现。

## 设计语言与本轮选择

本轮使用 `improve-ui` 及其 `references/plan-template.md`，按用户已经选定的三项返修形成可执行计划。项目依据仍为 `docs/design/handoff.md`、`docs/tasks/execution.md` 和 `docs/tasks/m3-m4-experience.md` 的 DG-SITE 对 T-SITE-04 结论，不新增一套交付规则。

用户明确反馈：**GitHub 按钮补图标；登录品牌区删除描述；品牌设置布局粗糙、空白太多，可以使用 HeroUI 和本地设计技能。** 本计划据此推荐业务区限宽与单面板紧凑排列，并制作第二版可查看原型。第二版整体设计及此前的缺口交互仍需要用户查看批准，不能记作产品实施或最终人工验收。

实际重新读取 Figma `74sT9Hrf8G4czcWeTkET5b` 的高保真信息和截图：

| 表面              | Figma 节点                | 观察与本轮关系                                                                                                                              |
| ----------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 品牌设置桌面/手机 | `468:11915` / `468:12216` | 1440×1080 / 390×844；旧稿桌面为两张纵向、横跨内容区的卡片，手机为纵向卡片。本轮单面板两行紧凑布局与业务区限宽是用户明确改写。               |
| 品牌预览桌面/手机 | `468:12278` / `468:12606` | 原有“所选文件/展示预览”层级、Logo 与 Favicon 分工保留；本轮仅跟随紧凑业务区收口。                                                           |
| 登录桌面/手机     | `2:11` / `102:3020`       | 1920×960 / 390×844；旧稿无登录品牌区，GitHub 按钮为纯文字。新增图标是用户指定修订；删除品牌描述是对第一版新增品牌区的修订，不能称旧稿还原。 |

图像核对以第一版记录中的 `settings-desktop.png`、`settings-mobile.png`、`login-desktop.png`、`login-mobile.png` 为已观察基线，均位于 `docs/verification/site-196/prototype/`。第二版尚未渲染，其效果不能由计划替代。

| 问题                                             | 证据                                                                  | 已选择的修订                                 | 范围               | 信心                     |
| ------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------- | ------------------ | ------------------------ |
| GitHub 登录缺少可识别品牌图标                    | 用户明确反馈；第一版截图及 `app/login-demo.tsx` 中按钮只有文字        | 文本前补正式 GitHub 标识                     | 登录按钮           | 高                       |
| 登录品牌区描述增加冗余信息                       | 用户明确反馈；`app/page.tsx` 登录分支输出站点描述                     | 只删除登录品牌区描述节点                     | 登录品牌区         | 高                       |
| 品牌卡片横跨桌面业务区，内容集中在左侧，留白过大 | 用户明确反馈；第一版桌面截图；业务 section 无限宽，两个 Card 纵向铺满 | 业务区限宽，单素材面板包含两行，手机动作下行 | 设置与对应预览状态 | 高；第二版观感待截图复核 |

Improve first：先处理用户选定的三项。公共外壳和已展示的错误/待核对行为保持，避免把视觉返修扩大为业务重构。

## 共用执行边界

- 保留第一版目录及 `127.0.0.1:4196` 进程。执行者复制为 `design-plans/issue196-brand-review-v2/`，第二版用 `127.0.0.1:4206`，不能热替换第一版给用户正在看的内容。
- 只修改第二版原型；`src/` 本轮保持只读。产品登录组件最终采用同一方向，要等第二版批准后再实施。
- 复用 `src/components/shell/admin-shell.tsx`、`public-shell.tsx`、`src/components/identity/identity-field.tsx` 与现有主题 Provider。保持桌面侧栏宽度、品牌/账号区、导航图标、内容起点、手机页眉、公共背景与返回首页。列表页移除重复的固定返回栏，保留页内返回；预览页沿用公共固定footer承载取消/上传。此处是局部操作去重，不改共享footer实现。
- 新布局限宽只作用于业务 section，左对齐现有内容起点。不要改全局 shell、页面左右边距，或把业务卡片居中造成第二套对齐线。
- 继续使用 HeroUI `Card`、`Button`、`Form`、`Modal` 与 Toast。品牌卡片以 `Card.Header/Title/Content/Footer` 表达结构，均已有安装类型支持，不造平行卡片基础组件。
- 保持 Logo/Favicon 独立上传与移除；站点文本独立；File/Blob 本地预览生命周期；失败后文件保留；未知结果先核对；取消与 Escape 边界。演示控件不得覆盖业务按钮。

## 选择一：GitHub 登录按钮补正式标识

### Evidence chain

- Surface：第一版登录桌面/手机的“使用 GitHub 登录”。
- Problem：按钮只有文字，用户明确要求补品牌图标。
- Design evidence：旧 Figma 登录节点为纯文字；因此本轮是用户优先指令。`handoff.md` 图标来源限制继续适用。
- Owner：第二版 `design-plans/issue196-brand-review-v2/app/login-demo.tsx`。
- Scope and affected surfaces：第二版登录按钮；已授权产品实施后再对应 `src/components/identity/login-form.tsx`。
- Uncertainty：当前已安装 `lucide-react@1.47.0` 的类型没有 Github/GithubIcon 导出。主线程已为第二版独立原型安装 `@gravity-ui/icons@2.22.0`，并查证 `LogoGithub` 的 SVGProps 类型；根依赖声明不变，根锁文件新增该原型 importer。

### Design decision

补一个 16px GitHub 标识，置于文字前，图文间距 8px，图文作为整体水平居中。保留“使用 GitHub 登录”可访问名称，图标设 `aria-hidden`。不要用 GitBranch 等普通开发图标替代品牌标识，不手绘 SVG。

### Reuse

- 继续用 HeroUI outline Button、现有 8px 按钮圆角及前景色。
- 官方 Gravity UI 图标库已实际查证含 `LogoGithub`，属于 handoff 允许来源；依据为 [官方 metadata](https://github.com/gravity-ui/icons/blob/main/metadata.json) 的 `logo-github/componentName: LogoGithub` 及 [React 导入说明](https://github.com/gravity-ui/icons#usage)。
- 主线程已完成安装版本及导出类型核对，使用 `LogoGithub` 单图标导入。只增加原型图标依赖，不引入 Gravity UIKit 或整套替代组件库。审阅者没有安装依赖。
- Exemplar：`src/components/identity/login-form.tsx` 的 GitHub Button 外形与忙碌 Spinner 分支；原型保留模拟点击。

### Changes

1. `design-plans/issue196-brand-review-v2/app/login-demo.tsx`
   - Change：按钮文字前加入 `LogoGithub`，尺寸16px，gap2，装饰性图标。
   - Preserve：桌面36px/手机44px高度、按钮全宽、文案、键盘行为、演示通知。
   - Verify：浅/深色图标清楚，图文整体居中，没有挤压、额外文字或重复图标。
2. `design-plans/issue196-brand-review-v2/package.json` 与根 `pnpm-lock.yaml` 由执行者处理。
   - Change：第二版原型已有独立 `@gravity-ui/icons@2.22.0` 依赖，锁文件记录其 importer。
   - Preserve：现有 React/HeroUI/Tailwind 版本。
   - Verify：使用真实类型导出，不靠任意类型断言绕过；产品源码不变。

### Scope

- Inherit：第二版登录各品牌状态，包括自定义、内置与素材缺失。
- Verify：输入焦点、按钮可访问名称、短视口底部可达性。
- Exclude：OAuth 请求、认证错误、GitHub 配置、注册/找回密码重排。

### Validation

- Product：原型点击仍只给演示反馈，不产生认证或服务器写入。
- Interface：1920×960与390×844分别实看；同一视口浅/深色、Tab焦点及按钮图文中心。
- System：单个成熟图标导入；无手绘、GitBranch替代或公共按钮样式改动。
- Repository：`pnpm exec eslint design-plans/issue196-brand-review-v2 --max-warnings=0`、`pnpm exec next build design-plans/issue196-brand-review-v2 --webpack` → 均通过；新增依赖后按 execution 运行冻结安装并记录。不要为图标再运行无关产品集成场景。

### Stop conditions

- 获允许的图标库版本实际没有该导出或与项目 React 类型不兼容时，停止图标落地并报告具体类型证据；不得擅自换来源或手绘。

### Design documentation

- 用户批准且验证后，在原有 `docs/verification/site-196/prototype/` 记录第二版同视口截图及用户改写来源；产品实施后同步适用 Figma 登录节点并复核截图。

## 选择二：登录品牌区只保留标识与站点名称

### Evidence chain

- Surface：第一版 `app/page.tsx` 的 `view === 'login'` 分支。
- Problem：品牌标识与站点名称下还显示站点描述，用户要求删除。
- Design evidence：最新明确用户指令；第一版品牌区由 DG-SITE 登录品牌缺口提案新增，Figma旧稿没有该区。
- Owner：第二版 `design-plans/issue196-brand-review-v2/app/page.tsx` 的登录品牌区。
- Scope and affected surfaces：只影响登录品牌区的可见描述。
- Uncertainty：无产品契约歧义。

### Design decision

只删除登录品牌区的描述 `<p>`，保留 Logo 与站点名称的纵向关系。移除节点后让容器自然收紧，不保留空白占位，不删除或清空描述数据。

### Reuse

- `PublicShell`、现有品牌 `Mark`、名称24px层级、`wrap-anywhere`。
- Exemplar：第一版登录品牌区与 `src/components/shell/public-shell.tsx`。

### Changes

1. `design-plans/issue196-brand-review-v2/app/page.tsx` 登录分支
   - Change：删除 `{description}` 对应可见段落。
   - Preserve：站点描述状态、后台品牌区描述、展示预览内描述与站点信息独立提交边界；登录卡片自身“轻装简从 · 欢迎回来”不属于品牌描述，本轮保留。
   - Verify：内置/自定义/缺失Logo及长站点名称下均不显示品牌描述，也无空行；表单间距不拉大以补回已删空间。

### Scope

- Inherit：第二版所有登录品牌状态。
- Verify：长名称换行、Logo缺失占位、手机短视口。
- Exclude：首页、分享、后台侧栏、保存数据、登录表单标题与欢迎语。

### Validation

- Product：切换站点文本仍可在后台/预览看到描述，登录只不渲染。
- Interface：1920×960与390×844同视口对照，核对名称至卡片间距、返回首页、短视口可滚动。
- System：无 `PublicShell` 或描述数据契约改动。
- Repository：随第二版统一执行上述 eslint/build；不重复运行输入未变且已通过的检查。

### Stop conditions

- 如果执行者发现删除描述必须改动公共 shell 或清空数据，停止该扩大并回到登录局部渲染。

### Design documentation

- 原有证据入口记录“用户删除第一版登录品牌描述”，不能写成 Figma旧稿原样还原。

## 选择三：品牌业务区采用一个紧凑 HeroUI 素材面板

### Evidence chain

- Surface：第一版设置业务 section、Logo/Favicon 两卡及上传预览。
- Problem：当前 section 无 max-width，两张卡纵向铺满桌面内容区；缩略图、状态和按钮集中于左侧，表面空横跨整页，用户认为粗糙。
- Design evidence：第一版实际桌面截图与 `app/page.tsx`；旧稿原本纵向全宽，因此本轮改为用户明确授权的布局修订，不由公共规范导致。
- Owner：第二版 `design-plans/issue196-brand-review-v2/app/page.tsx` 的业务 section/Card 组合。
- Scope and affected surfaces：品牌设置和对应预览/读取/错误/待核对状态；公共外壳保持。
- Uncertainty：第二版紧凑布局的实际观感、状态长度与移动端适配，须真实截图复核。

### Design decision

主线程执行方案为业务区左对齐并限宽 **960px**（Tailwind `max-w-240 w-full`）。这是本轮推荐值，不冒称旧设计既有规范。使用**一张 HeroUI 素材面板、两条资源行**，而非两个大卡并排，也不新增展示功能。局部布局由执行者细化，整体仍是用户待审提案。

每行采用相同的结构：

1. 左侧预览容器桌面96px、手机80px。Logo/Favicon继续保留各自真实表现比例，不把Favicon拉伸成Logo。容器用于统一对齐；资源缺失继续显示可识别占位和必要说明。
2. 中间为资源名称、用途、格式/大小与内置或自定义状态。用HeroUI Chip表达简短状态，普通说明保持中性简洁。长文字可自然换行，不引入新的展示页面或冗余解释。
3. 桌面右侧是短文案的选择/替换及适用移除操作，不把选择按钮拉到280px或整行宽。手机把操作放到该资源行的下一行，保留44–48px触达区域，不因紧凑缩小点击目标。
4. 两行通过一致间距或细分隔线分开；使用 `Card.Header/Title/Content` 等现有组合与HeroUI Button/Chip，不创建新的公共卡片基础层。

面板继续20px圆角、手机16px/桌面20–24px内边距，间距使用现有Tailwind尺度。自然高度，无填充空白的装饰区，无大面积绿色静态说明块。列表页只保留一个必要返回入口，移除重复固定返回栏；预览页继续使用公共固定footer保留取消与上传。

预览沿同一960px业务区收口，保留“所选文件/展示预览”既有层级，不新增展示功能。失败/未知/核对失败状态使用紧凑HeroUI表面或已有简短错误文案，不重新铺满主区域，不把“未确认”改为成功。状态多时页面自然滚动，不用增加固定高度填补留白。

### Reuse

- HeroUI `Card.Header` / `Card.Title` / `Card.Content` / `Card.Footer` 与 Chip；已实际读取安装的 `node_modules/@heroui/react/dist/components/card/card.d.ts`，支持这些组合及className，无需新增布局库。
- `Button`、现有 `Mark`、`RemovalDemo`、共享主题变量 `bg-surface/border-border/text-muted/text-danger`。
- Exemplar：`src/components/sharing/gate.tsx` 已有 Card 头部/内容组合；只参考组合职责，不照搬该业务宽度。

### Changes

1. `design-plans/issue196-brand-review-v2/app/page.tsx`
   - Change：给业务section限宽；采用单HeroUI面板及两条素材行，桌面96px/手机80px预览容器、信息居中段、桌面右侧短操作/手机动作下行；用Chip呈现内置等简短状态。
   - Preserve：页面标题、公共对齐线和导航、预览页脚、Logo/Favicon真实比例区分、格式与大小契约、独立上传/删除状态。
   - Verify：1440×1080不再出现1144px空横铺卡片；390×844无水平溢出且状态与操作完整可达。
2. 同文件预览、读取和异常分支
   - Change：继承同一业务限宽，保留既有文件/展示预览层级；长文件名和待核对操作可自然换行；设置页不再显示重复固定返回栏，预览上传栏保留。
   - Preserve：所选File仍保留；提交后结果未知先核对；检查失败后可重核；真实文件预览资源释放；不能因重排重新发送上传/删除。
   - Verify：普通、读取中、读取失败、素材缺失、上传预览、失败保留、未知、核对失败、读回为空/不同资源等已有状态均采用同一布局逻辑。
3. 第二版 `style.css`
   - Change：优先沿现有 `@source` 与Tailwind类；如果复制后source路径变化，准确更新本原型扫描路径。
   - Preserve：不修改 `src/app/globals.css`、AdminShell/PublicShell公共规则；不引入共享卡片外形覆盖。
   - Verify：编译产物与源码一致，演示面板闭合时不覆盖任一业务操作。

### Scope

- Inherit：第二版品牌设置、所选文件预览和相关异常状态。
- Verify：1440×1080、390×844、320px窄屏、短视口，浅/深色，Tab与焦点，48px操作目标，长名称/文件名，菜单/弹窗不被演示控件遮挡。
- Exclude：公共侧栏、品牌区、账号区、页眉、面包屑、共享footer实现重排；基本设置/首页/分享页面重排；产品API、存储服务或状态机重写；已有公共Toast遮挡问题扩大修复。

### Validation

- Product：选择真实本地文件→预览→取消/模拟保存；独立变更Logo与Favicon；失败保留所选文件；未知先核对；删除未知不可用Escape取消等既有边界不变。使用独立演示数据，不接产品持久化接口。
- Interface：由主线程在授权浏览器空间操作。保持第一版可用，在第二版独立端口产出同视口截图；独立评审先核对整页/公共区域，再看业务布局/控件。静态截图不能代替行为或完整主题矩阵。
- System：只复用现有HeroUI和共享外壳；没有新公共卡片框架、全局宽度修改、假回退或配置层。
- Repository：Node24及锁定pnpm，统一执行 `pnpm exec eslint design-plans/issue196-brand-review-v2 --max-warnings=0`、`pnpm exec next build design-plans/issue196-brand-review-v2 --webpack`；对修改文件执行 `pnpm exec prettier <modified-files> --check`。按execution决定依赖变化的安装/类型检查；这里只列预期，不声称已运行。

### Stop conditions

- 需要改公共外壳、数据契约或扩大到产品实现时停止本轮扩大，保持原型局部。
- 若资源行信息在可用宽度内拥挤，依既定手机模式让动作下行，不挤窄侧栏、不隐藏必要状态或缩小点击目标。
- Ego已交还用户；主线程须按技能的实际恢复边界处理。审阅者不自行开新浏览器空间绕过；未执行项如实保留未验证。

### Design documentation

- 第二版截图和差异继续纳入已有 `docs/verification/site-196/prototype/`，保留第一版记录与4196预览，不覆盖旧截图冒充原稿。
- 独立设计复核分别给“公共外壳一致性”“三项用户修订”“既有缺口提案”结论；产品未实施、产品浏览器矩阵未完成、Figma未同步、人工验收未完成分别标明。
- 第二版获批后，主线程才实施产品并在有写入权限时同步适用Figma节点。当前仅重新读取，没有改Figma。
