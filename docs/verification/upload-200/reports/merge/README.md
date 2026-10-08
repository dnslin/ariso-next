# 联合基本设置最终证据索引

2026-10-08。归档本轮实际实施、浏览器、Figma同步和独立复审证据。合并、关闭Issue与清理仍由主代理按用户授权完成；本索引不预先宣称已执行。

## 当前各项结果

| 范围                           | 实际证据与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 适用工程检查                   | [冻结安装](install.txt)、[build](build.txt)、[lint](lint.txt)、[format](format.txt)、[typecheck](typecheck.txt)、[测试修改后类型](typecheck-test-final.txt)已执行。全量单元首轮[unit.txt](unit.txt)为136文件1797通过、1文件2失败，适配后[两受影响文件9项](joint-unit-final.txt)通过；不称首轮单轮全量全绿。[HTTP/进程重启](integration.txt)4文件13项通过。                                                                                                                                                                                    |
| 联合 site behavior             | [最终报告](site-behavior-expiry-diagnostic/site-general.json) passed/behavior，6 checks、12 layouts、browserErrors=[]，无error/cleanupError；联合表单所属保存、真实RSC刷新不覆盖另一组草稿、链接与真实Back离开、双向401均已到达。初次NumberField聚焦wheel以及手机等待超时见[历史失败](site-behavior.json)与[诊断](site-behavior-diagnostic.json)，不倒改为通过。                                                                                                                                                                              |
| 联合 site recovery             | [最终报告](site-recovery-bound-fetch/site-general.json) passed/recovery，5 checks、34 layouts、browserErrors=[]，expiredSave为真实PATCH401/UNAUTHORIZED，无error/cleanupError；双向初读失败时另一模块仍独立保存、未知结果核对和差异选择均有实证。[原失败](site-recovery.json)与[原生fetch接收者失败](site-recovery-final.json)保留。                                                                                                                                                                                                          |
| 联合 site consumers / 公共外壳 | [消费者](site-consumers/site-general.json) passed/consumers，1 check、10 layouts、browserErrors=[]，无error/cleanupError；[公共OwnerShell](site-consumers/owner-shell.json) passed，9 checks、33 pages，实际11个已交付路由及未开放说明保持。[运行器](site-consumers/runner.json) passed。                                                                                                                                                                                                                                                     |
| 上传设置本轮补验               | [分阶段最终汇总](upload-browser-final.json)：代表布局1check/12layouts完成；[行为](upload-behavior-keyboard/upload-settings.json)2checks/5layouts、[恢复及手机区域](upload-recovery-regions/upload-settings.json)2checks/19layouts、[消费者](upload-consumers/upload-settings.json)2checks/20layouts均passed，无browserErrors/error/cleanupError。保留[首轮](upload-browser-first-failed.json)、[初诊断](upload-behavior-diagnostic/upload-settings.json)、[真实事件诊断](upload-behavior-events/upload-settings.json)，不称单次默认全量通过。 |
| 图片处理设置往返               | [首轮](processing-settings/processing.json)和[重跑](processing-settings-retry/processing.json)均完成共同入口唯一关联GET、fresh读取/失败/显式重试、同document/window/timeOrigin与20字段PATCH。后续原水印素材重试disconnected使整组failed，各8checks；无本次产品回归证据，唯一根因未确定，不称整组passed，按用户明确后续合并授权保留限制收尾。                                                                                                                                                                                                  |
| 代码与结构评审                 | [正确性/契约复审](review-final.md)、[结构复审](structure-final.md)没有本联合增量Required/P1/P2。报告中各阶段“待运行”的句子是评审当时边界；最新实际结果以本表独立报告为准。                                                                                                                                                                                                                                                                                                                                                                    |
| 设计复审                       | [独立设计](design-final.md)实际复读正常双主题/响应式、联合状态、17张上传恢复代表图及[最新三手机区域](upload-recovery-regions/upload-settings.json)，全部本次必需设计差异与证据缺口已闭合，无产品必修问题；原首屏未见下方卡的事实保留。                                                                                                                                                                                                                                                                                                        |
| Figma正常同步                  | [桌面](figma/desktop.png)、[手机](figma/mobile.png)为最新标题局部校准后截图；四根ID保留，两个桌面正常根各213后代、两个手机正常根各106，均imagefills=0。[完整桌面结构](figma/desktop-final.json)、[完整手机结构](figma/mobile-final.json)、[标题校准](figma/title-fix-log.md)记录字体、精确ID与不变边界。仅正常根同步，异常专属原节点保留历史。                                                                                                                                                                                                |
| 人工验收                       | 原#200上传UI人工验收明确通过，联合原型获用户批准。联合产品没有新增逐项人工运行验收记录；原型批准、原人工验收、自动浏览器与合并授权不互相替代。                                                                                                                                                                                                                                                                                                                                                                                                |

## Figma写入记录

[初次同步](figma/sync-log.md)、[公共导航与字重修正](figma/postfix-log.md)、[站点标题居中最终校准](figma/title-fix-log.md)按顺序保留。各次局部修复只改指定四normal roots，不改产品或全局组件。最新版正常标题是72×28，在44px row内自动y8居中，卡、帮助入口与下方form/link bounds未变化：[桌面JSON](figma/desktop-title-fix.json)/[实际脚本](figma/desktop-title-fix.js)、[手机JSON](figma/mobile-title-fix.json)/[实际脚本](figma/mobile-title-fix.js)。

全局Button/Primary原3:22实际Regular400没有改写；八个保存按钮实例按当前产品/获批基准及原#200上传实例实际字体分段采用Noto Sans SC Medium500。桌面总览/访问统计沿真实OwnerShell当前unavailable状态，API后端交付不冒充页面已交付。

## 最终补验与授权收尾

[上传分阶段最终结果](upload-browser-final.json)汇总既有representative完成与最新behavior、recovery、consumers真实passed结果；不是新单轮默认全量通过。[真实输入事件诊断](upload-behavior-events/upload-settings.json)保留失败及实际wheel/input/change/blur，键盘输入后的严格原断言全部通过。

[手机区域补图](upload-recovery-regions/upload-settings.json)已实际覆盖三处卡内区域，并由[独立设计](design-final.md)复读通过。原首屏图没有显示下方卡的事实保留，不倒改历史。

[图片处理原脚本重跑](processing-settings-retry/processing.json)仍在旧素材重试page.click disconnected失败；本次入口所有新旧断言已完成，不能称整组passed或根因已确定。源码相对main未变，独立契约评审未发现本次回归证据。用户明确后续合并授权持续有效，保留该限制完成本任务收尾。

本表上方早期待运行句子是各阶段时点记录，当前结果以上述最终报告及主[实施记录](../../README.md)为准。人工验收、原型批准、浏览器、独立设计与合并授权保持各自边界。

## 安全与路径检查

只复制指定Figma图片/JSON/脚本/日志、独立报告与不含凭证的模块报告及PNG。未复制账号记录、测试配置、credentials、cookie、授权header或生产/测试数据库。保存报告中的本机路径、测试origin和真实诊断，不因非敏感信息任意删减。临时Figma下载地址按工具提示不归档；截图已经本地保存。
