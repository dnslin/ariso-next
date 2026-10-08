# Issue #182 SMTP 配置、测试发送与诊断

关联 [T-ID-06 / #182](https://github.com/dnslin/ariso-next/issues/182)。本记录区分实现、本地检查、真实浏览器、设计评审与所有者人工验收，不以 SMTP 接受替代最终收件。

## 范围与依据

2026-10-08 从最新 `origin/main`（`96212bea`）创建管理型独立工作区，分支 `codex/issue-182-smtp`；保留原 main 及其他任务。`gh issue view 182 --json number,title,body,state,comments,url` 与原生依赖接口回读：#182 OPEN、无评论，blocked by #60/#57/#146/#136 均 CLOSED；blocking #184 OPEN。

从[文档导航](../../README.md)读取[任务卡](../../tasks/m3-m4-platform.md#t-id-06-smtp-配置真实发送与诊断)、[identity §8.1/10](../../specs/SPEC-identity.md#81-配置和测试)、[DG-SMTP](../../tasks/evidence/DG-SMTP/README.md)、[设计交接](../../design/handoff.md)和[执行约定](../../tasks/execution.md)。需求编号 `R-21.4-01/02`、`R-24.2-02/03`、`A-26.1-09` 保留；重置邮件、CLI 和完整质量关卡由所属任务承接。

原有 SMTP 为 EV-IDENTITY-04 协议实验。本次接入生产配置、加密持久化、启动解密检查、SMTP 管理接口和 `/settings/email`。不新增邮件队列、任意收件人接口、兼容路径或重置业务。

## 当前进度

- 工作区与 Node 24.18.1 / pnpm 11.19.0 已建立，[冻结安装](./checks/install.txt)通过。
- 生产后端、客户端请求/草稿和默认浏览器入口接入已实现。产品 UI 已按所有者批准的反馈版原型实施。
- 后端定向检查与独立代码审计完成：15 项生产集成、最终 3 项后端单元通过；客户端 5 项通过。检查命令与边界见[后端记录](./checks/backend-directed.md)和[独立代码审计](./code-review.md)。邮箱大小写核对缺陷取得[失败证据](./checks/client-email-before.txt)，修复后[通过](./checks/client-email-after.txt)。
- 浏览器计划单元 76 项通过；该 agent 使用 Node 24.19.0 / pnpm 11.19.0，未使用 Node 26 作为项目证据。真实 SMTP 夹具完成 TLS/STARTTLS/无认证收件自检；本次 SMTP 自动场景因用户接管未能执行。
- 实际外部邮件环境尚待提供；已有实验收件证据不代替本次生产发送验收。
- 本地适用检查已执行，首次失败与受影响重跑分别保留，见[本地记录](./checks/local.md)。默认浏览器已结束失败，并在用户接管后停止；后续 SMTP 专项也因同一控制权状态停止，无场景通过结果。详见[浏览器边界](./browser/README.md)。产品主表单已初审，完整状态/生命周期、最终设计结论及人工验收尚未完成。

UI 沿用桌面 `34:710` / 手机 `99:786` 主表单及 DG-SMTP 状态节点，复用 OwnerShell、SettingsHeading、SettingsCategories 与 HeroUI 控件。设计上下文和截图已实际读取；主表单真实页面已按相同视口对照，完整状态尚待浏览器报告。

## 交互原型与审批边界

[可查看原型](http://127.0.0.1:3182/design-plans/issue182-review/index.html)演示桌面/手机、浅深色、原页中性成功反馈、清除确认、未保存配置测试选择及未知结果核对。它不访问真实配置或发送邮件。来源和推荐差异见[原型记录](../../../design-plans/issue182-review/plan.md)。2026-10-08 所有者明确回复“OK 就按照这个去实施”，批准整版反馈原型；随后实施产品 UI，并同步既有 Figma 节点。

使用已有 Ego Lite 任务空间 3 实际检查了 1440×1080 和 390×844。检查并修正 HeroUI secondary 默认黄色文字、动态对话框及无关同源消息重置演示状态的问题；沿项目现有 Modal.Backdrop 受控模式。代表截图：[桌面](./prototype-desktop.png)、[手机整页上部](./prototype-mobile-top.png)、[手机下部](./prototype-mobile.png)、[清除确认](./prototype-clear-mobile-fixed.png)。清除和未保存测试弹窗实际内容已复核。截图仅为原型审批依据，不代表产品浏览器验证、独立设计审计或人工验收。

原型服务由主 agent 保持运行。首次子 agent 启动的服务已退出，曾导致旧资源复核失真；已重启并禁用浏览器缓存后重新核对，旧错误截图不作为最终原型证据。后续使用同一浏览器任务空间继续，不另开空间。

### 清除位置与图标反馈

2026-10-08，所有者明确用 SMTP 页面箭头要求清除操作移到卡片右上，并补充图标。新版原型的桌面标题/保存摘要居左，清除和独立说明入口居右；手机操作在标题下方另行右对齐。旧底部入口移除。标题、字段外标签及主要操作使用已有 Lucide 图标，装饰图标不改变控件名称。待核对时保留禁用清除，无凭据时隐藏。

已用同一 Ego 空间检查 1440×1080、390/360/430/768×844，无横向溢出；手机清除按钮 166×44、说明入口 44×44，右侧对齐。实际查看[新版桌面](./prototype-feedback-desktop.png)、[390 浅色](./prototype-feedback-390-light.png)及[430 深色](./prototype-feedback-430-dark.png)，核对布局、图标、文字和底栏；[360](./prototype-feedback-360-light.png)与[768](./prototype-feedback-768-light.png)也已截图。清除确认 Escape 关闭后实际焦点回到 BUTTON“清除用户名和密码”，已复核待核对禁用及无凭据隐藏。关闭时移除弹窗，避免退出阶段短暂显示其他诊断文案。

Node 24.18.1 下原型资源重建及 `node --check out/issue182-review/surface.js` 通过。整版反馈已获批准，产品 UI 已实施；Figma 与产品验证结果在本记录后续分别列出。新版[可查看原型](http://127.0.0.1:3182/design-plans/issue182-review/index.html?v=feedback1)保持可用。

## 产品与设计进度

生产主表单已用同一 Ego 任务空间实际查看：[桌面浅色](./production-desktop-light.png)、[桌面深色](./production-desktop-dark.png)、[手机浅色](./production-mobile-light.png)、[手机深色](./production-mobile-dark.png)及[稳定清除确认](./production-clear-mobile-dark.png)。视口为1440×1080与390×844。手机下部另有[浅色](./production-mobile-light-bottom.png)和[深色](./production-mobile-dark-bottom.png)截图。两端公共结构、右侧清除与字段图标符合获批方向；手机无横向溢出，清除166×44、Info44×44，Escape关闭回焦到清除按钮。截图中的字段值来自独立预览数据，密码未回显。

独立设计初审发现待核对时隐藏清除入口与原型不符，已改为保留并禁用；发现外标签字重不一致，已统一medium。完整状态与上述改动后的实际复验仍由最终浏览器结果承接，不把旧截图当最新复验。Figma已实际同步并导出26张最终图，见[同步记录](./figma-sync.md)和[独立设计审计](./design-review.md)。

真实预览登录没有返回邮件页，定位到已交付返回路径清单缺少`/settings/email`；取得[单元失败](./checks/return-before.txt)后仅增加该路径，修后[24项通过](./checks/return-after.txt)，子路径及外部URL继续拒绝。[最新预览HTTP](./checks/preview-http.txt)已验证真实登录与该返回位置；页内重新登录的Ego行为尚待新构建场景执行。

## 并发 main 协调

实施期间 main 合入统计 PR #263（`655566ec`），双方原先占用迁移0026。本任务先提交实施代码，再合并最新 main；保留 main 的 `0026_real_sumo.sql`、snapshot 与索引变更，使用真实 Drizzle 命令生成 SMTP 的 `0027_colossal_iron_lad.sql`。新 SMTP SQL 与原文件逐字节相同，没有改写已合并迁移，也没有添加兼容分支。三个手工 runtime 夹具仅更新 SMTP 文件引用；夹具仍为原精简模块集合，checkpoint不变。

[迁移生成](./checks/migration-concurrency.txt)与[生成文件格式](./checks/migration-format.txt)已执行。受影响构建通过，5文件45项集成通过；实际main26→SMTP27升级与重复prestart通过，双parent独立复审通过，见[受影响记录](./checks/local.md#main-并发迁移协调后的受影响检查)。当前运行的默认浏览器使用合并前复制的隔离产物；后续SMTP专项使用合并后的最新构建，两者分别记录。

## 交付与人工验收

实际人工预览为[邮件服务](http://127.0.0.1:3183/settings/email)，对应获批反馈原型与Figma桌面34:710/手机99:786及同步状态。预览使用含最终medium字重与重新登录返回修复的隔离构建；main并发迁移协调未改变SMTP产品UI代码。独立测试凭证已只在当前会话提供，保存在忽略私有文件中，不进入代码、PR或公开证据。两个预览服务持续保留。

人工验收检查桌面/手机浅深色、右上清除入口、字段图标、说明关闭和焦点、独立保存与已保存配置测试、成功保留原页。独立本地SMTP接收真实测试邮件；外部提供商与真实邮箱最终收件尚未验证。原型批准不等于产品人工验收，当前未收到产品验收结论。

代码静态审计无新实现Required；唯一Required是新构建实际生命周期/重新登录验证证据。独立设计主表单初审完成，完整状态与最新改动未复验。Ego控制权停止后未绕过技能边界；恢复所需指令已明确给出，期间推进离线交付。草稿PR保留上述未完成项。

## 分支与 PR

已提交并推送 `codex/issue-182-smtp`，创建并附加[草稿PR #265](https://github.com/dnslin/ariso-next/pull/265)，关联Issue #182而不关闭Issue。main并发统计能力与迁移保留，工作区无产品未提交改动。实际PR创建状态见[GitHub回读](./checks/pr-state.json)；[检查查询](./checks/pr-checks.txt)显示无远端检查，不记作CI通过，也不等待不存在的日常工作流。证据链接提交后再实时核对最终head。未合并、未发布部署、未删除分支/worktree，预览持续保留。
