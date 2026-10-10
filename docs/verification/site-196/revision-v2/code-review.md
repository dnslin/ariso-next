# Issue #196 第二版原型独立代码审查

日期：2026-10-10（Asia/Shanghai）。按已读取的 `code-review-and-quality` 五个维度审查。范围是第二版相对第一版的实际源码差异，以及原型隔离配置、图标依赖和锁文件变化。第一版保留；本轮审查没有修改原型源码，也没有运行构建或浏览器。

## 结论

**第二版原型代码审查通过，无遗留必改项。** 素材操作、资源生命周期、登录局部修订和依赖隔离未发现新增必改功能问题。首轮发现的一项加载状态可访问性回退已修正并经只读源码复核。此结论只适用于独立原型，不代表 Issue #196 产品实现、真实 API、Figma 同步或人工验收完成。`git diff --name-only -- src` 无输出。

## 首轮发现与修复复核

**读取中骨架屏需要保留可读状态文本。** 第二版 `app/page.tsx` 的 loading 分支删除了第一版“正在读取品牌设置…”标题，仅在普通 `div` 上添加 `aria-label`，其父 Card 是未命名的 `role="status"`。实际读取了 HeroUI Skeleton 的实现：它只输出 div，没有内置读取状态文字。普通 div 的标签不能可靠替代状态容器内的可读内容。建议在现有 status Card 内加入一行 `sr-only` 文本“正在读取品牌设置”，无需增加可见文案或更改布局。这一项先做源码复核，读屏实测保持未验证。

**已修复。** 只读复核 `app/page.tsx` 329–354行，loading分支已在 `role="status"` Card内添加 `<span className="sr-only">正在读取品牌设置…</span>`，并移除普通div上的aria-label。状态容器现在含实际文字，骨架屏的可见几何不变。本轮只读复核这一修复并更新报告，没有编辑源码或重跑构建、浏览器；读屏实测仍未执行。

## 已核对的具体差异

| 关注点                 | 结果                                                                                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MaterialRow 两用途分工 | 父页分别把真实 `assetKind` 捕获到 `onSelect`/`onRemove`，子组件不持有第二份素材状态。选择保留共享 `chooseFile`；打开选择器前同步用途与 accept。移除仍打开原有 RemovalDemo 确认，不直接清素材。                                                        |
| 状态和按钮语义         | 无素材时只有“选择文件”；自定义/缺失时提供“替换文件”和“移除”。按钮有用途明确的 aria-label，disabled 从原有 locked 传入。Chip 的内置/自定义/无法读取有文字，不仅以颜色表达。                                                                            |
| File/Blob 资源         | Mark 提取到 `brand-mark.tsx` 后保持原逻辑：effect 创建 Blob URL，素材变化、错误或卸载时撤销；选中 File 与每用途模拟保存引用没有被复制为完整对象。选择、失败保留、unknown核对以及两个在途定时器的逻辑未改。                                            |
| 图像失败               | Mark 的解码失败仍显示明确错误，不回退默认标识；MaterialRow 的既定 missing 场景显示 ImageOff 和可读错误。真实文件是否允许仍由未来产品服务决定，accept不冒充内容验证。                                                                                  |
| 登录删除描述           | 仅登录品牌分支删除 `{description}` 可见段落。description变量、后台AdminShell和上传展示预览继续消费原值。登录卡片自身欢迎语和IdentityField保持；没有修改产品登录组件或描述数据。                                                                       |
| GitHub 图标            | `@gravity-ui/icons/LogoGithub` 直接导入，16px、currentColor、aria-hidden；按钮可访问名称仍为“使用 GitHub 登录”。检查安装包 exports 的 `./*`、对应声明和实现，确认该深导入存在，不经过整包图标索引。点击仍只显示原型通知，不发认证请求。               |
| 设置与预览底栏         | 设置列表传 `footer: undefined`，移除没有真实作用的重复底栏。预览分支保留AdminShell原有固定操作栏、取消和上传；locked禁用及unknown核对上下文不因列表布局变化消失。                                                                                     |
| 公共区域和布局范围     | 新section左对齐、限宽960px；业务内容改为一个HeroUI Card内的两行MaterialRow。公共AdminShell/PublicShell/IdentityField未改。导航图标、顺序及unavailable边界沿第一版。具体视觉观感由独立设计截图评审判断，本代码审查不把计划中的“双列卡片”当成实际实现。 |
| 依赖隔离               | 新包只声明在第二版独立package.json/importer，版本2.22.0；锁文件新增该包和对已有tslib/React的引用，没有替换产品React/HeroUI版本。安装包标明MIT，未引入Gravity UIKit。未执行依赖漏洞审计，不声称没有已知漏洞。                                          |
| 配置隔离               | .gitignore/eslint只增加第二版生成文件排除；根tsconfig增加第二版目录排除，第二版自身保留独立strict类型配置。产品src检查边界未放宽。                                                                                                                    |

## 实际执行与验证边界

实际执行了两版文件diff、`git status --short`、`git diff -- .gitignore eslint.config.mjs tsconfig.json pnpm-lock.yaml`、`git diff --name-only -- src`；读取 MaterialRow/Mark/登录/删除/父页调用链、安装包元信息/LogoGithub导出类型与实现，以及HeroUI Skeleton真实实现。RemovalDemo和style.css两版diff为空。

未重跑实施者已通过的构建、lint、类型或浏览器检查；未进行条件突变或修改行为测试。主线程提供的实际运行结果须由统一证据记录承接，不能由本审查替代。真实文件上传/服务持久化/重启、产品响应式与元信息联动、Figma写入、用户批准和最终人工验收均不在本轮代码审查完成结论内。
