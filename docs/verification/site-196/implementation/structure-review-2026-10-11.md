# PR #277 独立结构维护性审查

结论：**Approve**。没有需要阻塞本 PR 的高确信结构维护性问题。以下两项仅为可选建议，不能据此认定已批准界面或现有恢复行为需要重做。

审查者角色：thermo-nuclear-code-quality-review；同时采用 vercel-react-best-practices。已读取实际技能文件、项目 AGENTS.md、docs/README.md、docs/design/handoff.md、docs/tasks/execution.md，以及 T-SITE-04 和 SPEC-site §6/7 的当前契约。独立从源码建立结论，没有以旧 code-review.md 的结论作为正确性前提。

固定差异：9ab5be055e9790d1b243935e259d5af87cccd610 → 01cd853d189d02baa868901a82d9d7e223455ea0。工作区为 /Users/dnslin/.codex/worktrees/issue-196-brand-settings/ariso。远端 main 后续前进不纳入本 PR 归因。2026-10-11 用户人工验收通过属于本次输入，覆盖旧报告里的待人工验收表述；保留紧凑 HeroUI 品牌设置、登录卡片居中、不额外展示品牌、紧凑忘记密码与 GitHub 图标。

## 范围和规模

完整检查新增/修改生产代码、单元测试差异、e2e 品牌场景与公共运行器差异；核对既有 settings HTTP、branding HTTP、brandingUrl、useSiteSettings、SiteNavigation、Shell、分享 Brand 等调用链。原型目录作为保留的设计材料核对隔离配置和体积，不把它当生产实现或持续运行的第二套业务架构。未执行 Ego、预览、安装、提交、推送或 PR 评论。

固定差异按 git numstat 统计：

| 类别              | 文件数 | 新增行 | 删除行 | 二进制文件 |
| ----------------- | -----: | -----: | -----: | ---------: |
| src               |     46 |   1096 |     16 |          0 |
| tests/unit        |      7 |    557 |     22 |          0 |
| e2e               |     11 |   1798 |      3 |          0 |
| scripts           |      3 |     34 |      1 |          0 |
| design-plans      |     35 |   3230 |      0 |          0 |
| docs/verification |    289 |  54387 |      0 |        161 |

新增品牌生产组件/API/hook共8文件955行，最大 BrandingPage 231行，useBranding 203行；并非一个近千行组件。扫描全部改动的 TS/TSX/MJS/CSS 文件，没有文件由不足1000行跨至1000行以上。唯一原本超1000行且本次变化的文件是 scripts/verify-browser.mjs，1079→1083，仅新增4个输出报告清理文件名，没有往该大文件追加品牌流程分支。证据 JSON、日志与截图的体积不等同生产源码膨胀。

## 结构判断

- 职责在现有层次内：BrandingPage组合页面；useBranding持有所选File、操作与异步生命周期；branding-api负责请求与公开字段；BrandingPreview/Removal/Row是实际不同的页面区域。文件拆分没有只传参的空包装层。
- 服务端沿用site GET、既有PUT/DELETE、brandingUrl和公开素材路由。客户端没有复制内容识别、文件落盘或SQLite规则。后台页面只增加公开logoUrl，仍由OwnerShell/AdminShell维护品牌与导航；没有各页复制品牌渲染。
- 七个phase分别承载选择、提交、明确拒绝、结果未知、核对中、核对失败、读回后选择。将它们合成几个boolean会扩大非法组合，删掉核对/读回选择会改变已要求行为。busy/uncertain/locked由phase派生，没有维护三套独立状态。
- saved/source/operation虽有相近数据，但source是上一份传入快照的身份，saved保留最后一次确定配置，operation保留本地未确认File；用途不同。简单删除saved或用失败后的null覆盖，会丢失失败时仍须呈现的配置。未发现可安全删除整层并显著缩短实现的明显重构。
- previewUrl ref与operation.previewUrl分别服务卸载清理和渲染，inFlight ref与phase分别服务同一事件间隙的重复提交和界面状态，expiredRef与expired分别服务迟到结果屏蔽和呈现。当前分工有具体需求，不能只按重复字段名判冗余。
- SiteLogo与BrandingMark的默认内容、错误语义、大小和消费者不同；将其强行合并会引入模式分支。品牌选择预览与公开Logo也不是同一种组件契约。
- 写入后的公开字段刷新与跨页刷新复用TanStack Query和router.refresh。没有引入新事件总线、通用状态机框架、Repository或兼容回退。事件里创建Blob而卸载时释放，未引入effect驱动的预览重建。

## 可选建议（均不阻塞）

1. **子组件参数可以更明确。** `src/components/site/branding-preview.tsx:15-19` 和 `branding-removal.tsx:12-14` 接受整个hook返回值，并用非空断言读取operation/file。当前BrandingPage在saved存在且确有相应operation时才渲染，调用链成立，没有发现实际非法调用。维护负担是后续改变调用条件时TypeScript不能指出违约。若以后改这些组件，可直接传入已收窄的operation（预览明确要求File）和saved，保留其余现有动作参数，删掉局部`!`；不必为了这点改成全局状态机或新增一套adapter。

2. **品牌重启的phase判断可留在品牌编排边界。** `scripts/browser-business.mjs:27-49` 新增24行，使通用业务场景执行器读取`siteBrandingPhase`并知道`consumers`需重启。实际影响是修改品牌阶段名需要同时改plan、品牌e2e入口与此文件。当前仅一个紧凑分支，职责仍是进程重启编排；上传原本也在此处理前置重启，不能按文件名认定业务泄漏已失控。若再增加另一种同类持久化场景，可参照既有browser-oauth把品牌两阶段封装为品牌编排函数，并由通用入口仅分发；届时能删除此处phase知识。现在单为24行再加模块与分发，收益不足，不要求本PR先泛化执行计划或拆文件。

## 验证与限制

本审查实际执行：

- `git diff --numstat <base> <head>`与逐文件git show行数扫描：得到上述体积和1000行阈值结果。
- `git diff --check <base> <head> -- src tests e2e scripts package.json pnpm-lock.yaml eslint.config.mjs tsconfig.json .gitignore`：exit0。
- `git diff --check <base> <head>`：exit2，仅原始归档日志的末尾空行、构建进度CR/尾空白。没有把原始日志的格式当产品结构缺陷；没有改写证据。

本次没有重跑测试、类型检查、构建或浏览器。原实施证据保留其真实边界：完整集成190/191文件、唯一畸形multipart ECONNRESET；完整浏览器59通过/20失败/2阻断；品牌默认组合18检查/118布局及真实重启通过，受影响检查分别通过。以上是对已归档记录的核对，不是本审查重新执行的结果，也没有用定向通过改写全量失败。本审查结论仅针对固定差异的结构维护性，不代表本次重新验证所有运行行为或远端CI。

源码、测试、已有docs均未由本审查者修改。报告只写入 /tmp/issue196-review-structure-20261011.md。
