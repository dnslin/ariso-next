# Issue #196 登录卡片居中原型独立代码审查

日期：2026-10-10（Asia/Shanghai）。使用已读取的 `code-review-and-quality`，仅审查第三版相对第二版的实际差异。范围：登录局部布局、默认演示页/版本文字、独立包名及第三版生成目录排除。第一、第二版不改；本轮审查只写本报告。

## 结论

**本次原型代码差异审查通过，无必改项。** 登录卡片居中采用纯CSS Grid，没有新增JS高度测量、窗口监听、定时定位或第二套公共外壳。`git diff --name-only -- src` 无输出。此结论不代表产品实现、真实认证、Figma同步或用户人工验收完成。

## 具体核对

- **公共外壳作用范围明确。** 最终类为 `[&_.public-content]:block! [&_.public-content]:p-0!`，只放在 `view === 'login'` 的局部包装层；复用 PublicShell 的背景、返回首页和main语义。`!` 覆盖现有未分层 `.public-content` 的普通 display/padding 声明，沿用 PublicShell 已有局部重要类做法。设置/预览分支不在此包装层内，AdminShell与固定操作栏均未修改。没有改动共享PublicShell或globals.css。
- **卡片自身居中。** 三行定义为 `minmax(max-content,1fr) auto minmax(0,1fr)`。第一行放品牌并靠该行底部，第二行放原有LoginDemo，第三行留空。上下余量足够时两个1fr轨道等分余量，配合对称的py-8和两个gap-6，让中间卡片居中；品牌不再与卡片一起作为整组居中。登录控件尺寸和内部结构未变化。
- **短视口保留自然布局。** 最终容器使用 `min-h-dvh w-full`，没有固定height/max-height或overflow-hidden；w-full避免父布局变化后按内容收缩。品牌和表单仍处于正常文档流，内容可推动容器增高。第三行的最小值0只说明它允许收缩，不能据此断言CSS Grid在所有短视口一定把该行缩至0；具体轨道分配和滚动由浏览器实测判断。没有绝对定位卡片、负向位移或以JS裁剪内容。
- **长名称保留换行。** 品牌行仍是 `w-full max-w-md`，名称仍使用 `max-w-full wrap-anywhere`，与表单同宽上限。名称增长由第一行内容高度承接，不依赖固定品牌高度。真实长名称、手机短视口和安全区的最终效果仍须浏览器/设备验证，本代码结论不代替它们。
- **变更边界可核实。** 两版app目录递归diff只列page.tsx；LoginDemo、MaterialRow、Mark、RemovalDemo和样式文件没有本次差异。默认view改为login及“第三版”演示文字只影响打开原型时展示。独立包仅改名字，图标依赖未升级。配置只增加第三版目录及生成文件排除，未放宽产品src检查。

## 实际执行与未执行

实际执行：读取两版page/package差异，执行app目录递归diff，读取PublicShell和相关globals.css，核对第三版LoginDemo与局部class，检查 `.gitignore`、`eslint.config.mjs`、`tsconfig.json` 和锁文件差异，以及 `git diff --name-only -- src`。增量复审实际读取最终page.tsx的253–278行，确认block!/p-0!/w-full已存在；再次核对src差异为空，并读取主线程生成的geometry.json与short-viewport.json。

未重跑构建、lint、类型或浏览器；未修改源文件或进行条件突变。运行截图与几何测量由主线程的本轮真实浏览器证据承接。静态代码能证明布局分工和作用范围，不能独自证明全部视口下的最终视觉位置、滚动、真实软键盘或设备安全区效果。

## 浏览器发现后的增量源码复审

首轮普通utility被公共未分层CSS覆盖，源码初审没有发现该级联问题；主线程已从computedStyle定位到main仍为grid且保留88px/32px内距。最终局部重要类与w-full修复这一实际边界，不是修改公共规则。主线程另诊断产物残留旧普通class，移动第三版自身.next后清洁重建；构建缓存处理不属于本次源码审查执行结果。

已读取主线程实际报告：[geometry.json](./geometry.json) 显示1299×865卡片宽448px、中心偏移0；1920×960、390×844、430×844、768×1024偏移均为0；360×800偏移6.5px。不能称全部视口严格居中。[short-viewport.json](./short-viewport.json) 显示420px高视口的内容可滚动，操作按钮位于188–232px可见范围，邮箱和密码保留。本审查没有再次驱动浏览器，以上为对已有报告的证据核对。

最终仍为原型代码差异审查通过，无遗留必改项；产品实施和用户批准继续分别记录。
