# 手机左右排列的独立正式设计复审

本轮正式页面设计复核通过，未发现需要返修的产品或 Figma 差异。用户已批准左右排列原型；这份结论来自实际产品截图、当前 Figma 与源码对照，不使用原型截图替代产品。**本轮产品人工验收仍待用户完成。**

功能与设计分别给结论：本轮账号及 OAuth 界面的真实 HTTP 回归报告通过，独立评审者只读取结果，没有重跑；本轮设计结构、代表状态、完整展开内容与短视口焦点对照通过。夹具报告明确 `realGithubOAuth=unverified`，不把预置绑定关系或这轮界面回归当成外部 GitHub 授权、换取令牌或登录的重新验证；此前真实 GitHub 证据仍由 [统一记录](../README.md) 保留。

## 范围与实际依据

本轮只调整 `AccountSettingRow` 的手机信息/操作排列。调用路径是 `/settings/account` → `AccountPage` 的邮箱、密码行和 `GithubAccount` 的绑定、站点配置行，共四个消费点。手机信息左对齐、操作在右居中；无操作行使用完整宽度；640px 起通过 `sm:contents` 保持既有标签/值/操作三列。没有增加正式产品的布局开关。

已读取项目 AGENTS.md、完整 [设计交付规范](../../../design/handoff.md) 与 [执行约定](../../../tasks/execution.md)。继续应用 using-agent-skills、frontend-ui-engineering、vercel-react-best-practices；Figma 读取前实际读取并应用 figma-use / figma-design-to-code。UI 技能用于信息层级、换行、响应式与可达操作，Figma 技能用于实际节点读取和截图对照。没有操作 Ego 或其他浏览器、读取凭据、写入产品/Figma、重跑实施者检查或提交。

实际 live 读取文件 `74sT9Hrf8G4czcWeTkET5b` 的设计信息和截图：

| 范围                                 | 节点                                  |
| ------------------------------------ | ------------------------------------- |
| 手机主浅色、主深色                   | `102:1713`、`847:32225`               |
| 桌面主页面（只读，未变化）           | `34:462`                              |
| 独立读取、绑定读取失败、配置读取失败 | `847:32081`、`847:32117`、`847:32153` |
| 配置结果未知、解绑结果未知           | `814:29892`、`196:2009`               |
| 待重启深色、配置差异展开             | `814:29997`、`847:32261`              |

实际查看 [完整展开业务图](figma/expanded-full-content-after.png)，对应 `847:32274`。同步源组件 `836:13855`、17 个手机来源/原完整区域及 70 行实例的原生记录见 [Figma 清单](figma/manifest.json)。当前配置未知整页以 [最终图](figma/config-unknown-light-after-current.png) 为准；最初漏显已有标签的过程图保留，不作为最终结论依据。

## 整页与公共区域

实际查看 [390浅色](browser/oauth-all-before-unbound-disabled-light-390.png)、[390深色](browser/oauth-all-before-unbound-disabled-dark-390.png)、[768浅色](browser/oauth-all-before-unbound-disabled-light-768.png)、[768深色](browser/oauth-all-before-unbound-disabled-dark-768.png)、[1440浅色](browser/oauth-all-before-unbound-disabled-light-1440.png)、[1440深色](browser/oauth-all-before-unbound-disabled-dark-1440.png)。按390×844、768×844、1440×1080与对应设计/现行断点先核对整页，再看业务区域。

- 手机品牌、顶部菜单、正文标题、说明与分类位置沿用公共来源。标题和分类没有随 GitHub 状态换位；选中分类带16px图标且文字完整。
- 768px 使用顶部菜单，业务恢复三列；1440px 使用232px侧栏、主区左右32px、业务最大960px。桌面账号行的位置和操作排列保持既有方案。
- 桌面导航顺序、图标、当前“站点设置”和“尚未开放”入口表达来自现行共享配置；账号区仍位于底部。没有因手机排列复制或重画公共组件。
- Figma 的站点描述、Owner 名称和邮箱是示例。真实夹具为空的站点描述以及实际账号名称/邮箱按数据呈现。具体依据是 handoff 开头“原型名称/预填值是示例，主页面按真实数据”，以及“公共界面复用与占位退出”的共享来源要求。`src/app/settings/account/page.tsx` 传入真实 site/owner 值，`AdminShell` 只在 description 非空时显示该行；这解释了示例描述行占位带来的导航纵向差异，不是本轮修改公共布局。
- 本轮产品差异只包含账号行布局，`SettingsCategories`、`OwnerShell`、`AdminShell` 未修改。没有把此前三消费路由检查冒称本轮重新执行；相关既有公共结论保留于 [恢复后的评审](../browser-recovery/design-review.md)。

## 业务、控件与状态对照

| 对照项                | 实际产品证据                                                                                                                                                                                                                                                                                         | 结论                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 普通邮箱/密码、未配置 | 主390浅深图及 [product-metrics.json](browser/product-metrics.json)                                                                                                                                                                                                                                   | 标签13px、值14px在左；16px图标与文字保留；修改按钮右侧居中。邮箱/密码按钮90×44px，配置109.25×44px。未绑定无操作行占整行，未配置主操作黄色。                                     |
| 95字符长邮箱          | [360浅色](browser/phone/oauth-390-before-unbound-disabled-light-360.png)、[360深色](browser/phone/oauth-390-before-unbound-disabled-dark-360.png)、[390浅色](browser/phone/oauth-390-before-unbound-disabled-light-390.png)、[390深色](browser/phone/oauth-390-before-unbound-disabled-dark-390.png) | 真实邮箱在360完整换为5行、390为4行；按钮仍独立在右，未截断、缩字或横向溢出。Figma普通邮箱不与该长样本作等高断言。                                                               |
| 独立读取              | [绑定读取中](browser/phone/oauth-390-before-account-github-loading-light-390.png)、[配置读取中](browser/phone/oauth-390-before-oauth-settings-loading-dark-390.png)                                                                                                                                  | Spinner和文字只属于正在读取的一行，另一职责的现有配置/解绑操作继续可见。                                                                                                        |
| 独立读取失败          | [绑定读取失败](browser/phone/oauth-390-before-account-github-read-error-light-390.png)、[配置读取失败](browser/phone/oauth-390-before-oauth-settings-read-error-dark-390.png)                                                                                                                        | 错误在左、对应重新读取操作在右；不以某一读取失败隐藏另一职责。真实诊断文字比Figma示例长时自然换行，不改写错误。                                                                 |
| 配置未知关闭后        | [真实浅色图](browser/phone/oauth-390-before-configuration-unknown-closed-light-390.png)                                                                                                                                                                                                              | 保留上次读取的生效状态、待核对后果与真实读取错误；右侧只显示核对配置，不恢复重复提交。                                                                                          |
| 解绑未知关闭后        | [未发送深色](browser/phone/oauth-390-enabled-unlink-unknown-closed-not-sent-dark-390.png)、[已提交浅色](browser/phone/oauth-390-enabled-unlink-unknown-closed-committed-light-390.png)                                                                                                               | 上次读取账号、待核对和诊断可读；核对绑定位于对应文字右侧。站点配置仍为独立行，不与解绑状态混用。                                                                                |
| 已绑定、可绑定        | [已绑定浅色](browser/phone/oauth-390-enabled-bound-light-390.png)、[可绑定深色](browser/phone/oauth-390-enabled-unbound-enabled-dark-390.png)                                                                                                                                                        | 绑定主操作与解绑次操作分别明确；核对成功通知为中性，页面保留原账号区域。                                                                                                        |
| 待重启收起            | [浅色](browser/phone/oauth-390-before-bound-saved-disabled-light-390.png)、[深色](browser/phone/oauth-390-before-bound-saved-disabled-dark-390.png)                                                                                                                                                  | 保存/生效启停与“保存不会自动重启”持续呈现；登录停用时绑定保留，摘要不挤占右侧操作。实际配置值不同于Figma示例，状态与布局仍按真实值表达。                                        |
| 配置差异完整展开      | [真实顶部](browser/phone/oauth-390-full-pending-expanded-top-dark-390.png)、[实际滚动到底部](browser/phone/oauth-390-full-pending-expanded-bottom-dark-390.png)、[expanded-full.json](browser/phone/expanded-full.json)                                                                              | 两份公开快照完整可见，标题/Client ID/密钥状态各占一行，份内4px、份间12px；Accordion横内距16px、固定“查看配置差异”文字及旋转箭头保持。首屏裁切未被误作完整证据，补图后边界关闭。 |
| 短视口                | [390×400解绑浅色](browser/phone/oauth-390-enabled-unlink-short-light-390.png)、[深色](browser/phone/oauth-390-enabled-unlink-short-dark-390.png)、[真实Tab焦点图](browser/oauth-390-preview-short-keyboard-dark-390.png)                                                                             | 解绑正文和底部动作可达；账号入口通过真实Tab自动滚动进入可见区域，44px目标与焦点环没有被裁切。                                                                                   |

真实生产预览3182的 [浅色图](browser/oauth-390-preview-manual-preview-light-390.png)、[深色图](browser/oauth-390-preview-manual-preview-dark-390.png) 也已实际查看。它们沿新布局呈现当前独立测试账号，并未借长邮箱夹具修改人工预览数据。

## 精度、证据与完成边界

已对照 [Figma与产品原始坐标](figma/product-comparison.json)，邮箱/密码按钮 x267、y341/418、90×44px一致。Figma标签19.5px行高的原生文字框取整为20px，使值位置存在0.25px差异，GitHub两段文字累计1px使配置操作 y669 对实际 y668；长配置按钮自然字形宽110对109.25px，右边缘同为357px。这些是原生文字框/字形近似，未改变结构、点击区域或主题。没有为消除该取整更改产品字体，也没有把Figma值记成新DOM测量。

功能证据实际读取：主流程 [before](browser/oauth-all-before.json)、[after](browser/oauth-all-after.json)、[enabled](browser/oauth-all-enabled.json)、[账号回归](browser/account.json) 均 `passed`、`browserErrors=[]`；手机 [五阶段汇总](browser/phone/phone-summary.json) 与三个阶段报告同样通过。保存、两次真实进程重启、响应丢失/读取失败、未知关闭与核对均由真实服务处理，报告同时保留预置绑定关系和外部OAuth未在此夹具验证的限制。

[manual-preview.json](browser/manual-preview.json) 已实际读取：390×400浅深主题下真实Tab依次使邮箱、密码和配置入口完整可见，均高44px且记录最终HeroUI焦点环。此前把程序聚焦误当键盘可见焦点的失败记录保留，后续真实Tab通过不倒改旧失败，也未为修正验证方式改产品。

产品局部布局已完成、对应真实浏览器回归与本轮独立设计复审通过；Figma原位同步与精度对照已完成。用户只批准了方案，**本轮最终产品人工验收仍待完成**。本子任务不执行应用检查，不把父任务本地检查、静态设计、当前报告或历史人工验收混成同一完成状态。未扩大重画既有账号全局加载/会话错误Card、弹窗或其他模块；本轮仅新增改动区域和上述相关状态的实际对照。
