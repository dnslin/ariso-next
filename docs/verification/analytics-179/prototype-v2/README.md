# Issue #179 原型第二版

> 最新修订见[头部累计与数字滚动](./header-total/README.md)：累计移至头部右侧，手机另行排列，加入280ms数字滚动。[此前局部反馈](./feedback/README.md)已落实圆角/hover、取消折叠数值、近期折线和永久删除退出排行。以下为原第二版实施及验证历史。

2026-10-09。用户否决第一版，要求保留旧原型、单图只显示缩略图、图表主导、减少说明并实际使用 HeroUI。第二版是待批准的局部交互提案，**没有接入产品 API，没有替换产品页面，没有写入 Figma，也不代表人工验收完成**。

预览：`http://127.0.0.1:4181/analytics`，无需账号。旧版 `http://127.0.0.1:4179` 保留。产品独立人工预览4180与其数据不受影响。入口自动展示单图统计，关闭后可看趋势、排行及处理异常；页内可切主题，弹窗底部选择八种样例状态。

## 方案与依据

- 单图只保留桌面64px/手机48px身份缩略图，无原图/水印图预览、版本查看、下载或编辑操作。“访问版本”仅表达实际API已有的累计版本计数。
- 累计数字、三版本横条、近7/30/90天三个独立柱体构成主层级。周期互相包含，不堆叠、不虚构单图逐日数据；需要精确数值时展开范围列表，无表格。
- 全站趋势用曲线，排行用缩略图、名称和比例条，异常用紧凑缩略图卡与两组筛选。重试只更新本地演示状态，关闭保留来源焦点；永久删除没有内容入口。
- 实际使用已安装 HeroUI3.2.6 的 Card、Button、Modal、CloseButton、Tabs、ToggleButtonGroup、Popover、Tooltip、Accordion、Spinner；状态select仅为原型演示工具。实际读取[Tabs](https://heroui.com/en/docs/react/components/tabs)、[Modal](https://heroui.com/en/docs/react/components/modal)、[Tooltip](https://heroui.com/en/docs/react/components/tooltip)官方说明与本地类型。Recharts3.10.1和Lucide沿现有依赖，无新增依赖。
- 使用 frontend-design 指导层级与图表布局，emil-design-eng 指导150–180ms局部过渡及减少动效偏好，vercel-react-best-practices 指导图表延迟加载与局部状态，ego-browser执行真实浏览器验证。公共品牌、侧栏、账号布局直接复用 AdminShell，字体与颜色读取项目样式。
- 参照本轮已实际读取的 Figma 工作台 `451:3748/8551`、统计 `446:8063/8030`、详情 `102:3228` 及 [DG-ANALYTICS](../../../tasks/evidence/DG-ANALYTICS/README.md) 的设计缺口。V2新交互待批准，没有对应已批准节点。两张示例缩略图来自此前实际读取的Figma资产 d4e627b3-e422-490e-9f89-2cecff98e955 与 bcc8fe67-0010-4953-9188-daeac4f46f13，仅用于独立原型。

## 实际验证

环境：macOS、Node24.18.1、pnpm11.19.0，现有Ego Lite TaskSpace2/p2，无下载浏览器。独立Next项目在 `design-plans/issue179-review-v2`，根类型项目仅排除此独立子项目，根lint仅忽略其生成文件。根产品业务代码未在本轮修改。该原型不属于产品默认浏览器入口；不修改运行器或把其检查记作产品能力覆盖。

| 检查                                                                                  | 实际结果                                                                                              |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit --project design-plans/issue179-review-v2/tsconfig.json`      | 修正初次Tooltip payload类型不匹配后通过；最终独立构建也执行类型检查                                   |
| `pnpm run lint`                                                                       | 根全量通过；最终新增脚本另定向检查                                                                    |
| `pnpm run typecheck`                                                                  | 根全量通过，未排除共享产品源码                                                                        |
| `pnpm exec next build design-plans/issue179-review-v2 --webpack`                      | 最终构建通过，随后以Next生产模式在4181运行                                                            |
| `ego-browser nodejs < docs/verification/analytics-179/prototype-v2/browser-check.mjs` | [报告](./browser.json)10个截图布局通过；合成原型验证，非产品接口验证                                  |
| `node design-plans/issue179-review-v2/check-samples.mjs`                              | 三周期等于同一90天序列的后N天；趋势总量/热门10条：1172/1034、5761/3470、17222/5736，均不超过累计24816 |

浏览器实际检查360/390/430/768/1440宽度、桌面1440×1080、手机390×844、短视口390×400；浅深色、八种状态、信息弹层、展开数值、正文滚动、44px弹窗按钮、Escape关闭及排行来源焦点恢复、两组异常筛选和原位样例重试。控制台错误/警告为空。最后一次样例日期修正后重新构建，并在生产模式补查受影响趋势/排行截图，其他输入未变的通过项不机械重跑。减少动效媒体查询已验证，但该项不替代逐帧动画审计或真机触摸。

首次测量在视觉视口更新前断言失败；改为等待视口布局稳定。首次短视口检查在Accordion动画结束前滚动导致断言失败；等待有限动画结束后保留原断言通过。零值初图也拍在180ms过渡中，最终补充动画结束等待及所有版本横条scaleX(0)断言。初次补排行截图用错class，改为实际rank-row后补齐。首次将输出目录改为cwd时Ego进程cwd为`/`，命令失败；证据脚本恢复明确任务目录后执行通过。这些失败不计作产品缺陷或通过。

## 视觉对照与独立审查

- [桌面统计](./statistics-desktop.png)、[手机统计](./statistics-mobile.png)、[手机深色](./statistics-mobile-dark.png)：缩略图、累计、版本横条、周期柱图、可折叠数值。两组图表均在标准手机首屏可见。
- [零访问](./statistics-zero-mobile.png)、[首次失败](./statistics-error-mobile.png)：零值图形真实归零；首次失败不显示伪造更新时间。
- [短视口首屏](./statistics-short-mobile.png)、[滚动底部](./statistics-short-bottom.png)：关闭和底部工具保持可达，正文可滚至完整范围列表。
- [桌面排行](./ranking-desktop.png)、[手机首屏](./ranking-mobile.png)、[手机排行行](./ranking-mobile-rows.png)、[历史身份](./ranking-mobile-history.png)：公共外壳、曲线、短日期、长名与回收/删除身份。
- [桌面异常](./failures-desktop.png)、[手机异常](./failures-mobile.png)：缩略图网格与直接分组操作。

[独立设计复审](./review-v2.md)发现日期露出ISO尾部、Tabs选中底色错位，均修正；冗余副标题删除，零值动画取证偏差已复核关闭。[独立代码复审](./review-code.md)发现合成趋势小于排行总量及跨周期日期漂移，均校正并加算术断言。最终评审结论以各记录为准，任何原型审查均不等于用户批准。

剩余：用户批准V2；获批后产品实施、适用行为测试与真实API/浏览器验证、Figma同步、产品独立设计复审及最终人工验收。此前产品默认全量浏览器仍未执行，不能由本原型检查替代。PR #273继续草稿。
