# 第二版局部反馈返修

2026-10-09。用户要求圆角/hover沿项目、删除“查看数值与范围”、近期访问改折线。另明确永久删除图片不参加热门排行，并授权直接更新冲突文档。这是本轮的最新依据；原第二版截图与评审保留为历史证据。

## 本轮变化与来源

| Before                                                           | After                                                                                                 | Why                                                                                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| HeroUI默认胶囊Tab、24px桌面/20px手机弹窗、不同按钮圆角           | Tab/按钮/关闭为8px，弹窗两端14px；周期外组保留12px与4px内距，统计卡20px、图库异常卡16px分别沿既有容器 | 用户要求遵守项目；handoff要求控件映射设计，不能把组件默认值当依据。14px沿已批准短弹窗，8px沿现有analytics控件；不是所有容器一律8px |
| ghost/CloseButton默认水绿hover及按压缩放，局部选择器未覆盖portal | 透明图标只改变文字色，排行轻中性背景，按压不缩放；同时覆盖prototype-page和statistics-dialog后代       | 用户反馈hover不佳；实际读取固定HeroUI包Button/CloseButton/Toggle样式及Overlay实现，修复真正作用域，不改公共组件                    |
| 三周期柱图及折叠数值列表                                         | 三个带直接数字的折线点，周期标签、单位、零基线及aria完整数值保留；范围进入Info，Accordion及其样式移除 | 用户明确要求折线并取消该入口；接口只有7/30/90汇总，不虚构单图逐日值，不把重叠周期相加                                              |
| 永久删除的第10项样例占位                                         | 用仍存在的“山间小路”补足示例前十                                                                      | 用户明确不让永久删除参与排行；真实查询/前端/默认验证也同步修正，见[真实产品证据](../../deleted-ranking.md)                         |

只更改独立原型中的上述UI；实际产品本轮改变永久删除排行资格及其前端消费，并修复真实验证发现的刷新提示推动周期按钮问题（见真实产品证据），不提前实施其余待批准交互，不写Figma。公共AdminShell源码及公共路由配置未改。Figma参照仍为既有 `451:3748/8551`、`446:8063/8030`、`102:3228`；新折线/删入口/删除排除由用户本轮明确指令指导，Figma同步未完成。

## 实际验证

Node24.18.1、pnpm11.19.0、macOS、现有Ego Lite。初次读取TaskSpace2返回用户结束/失去分配的硬停止，立即停止；收到用户“继续浏览器检查”后才claim同空间，并重新adopt原4181 tab为p2，没有新建空间或浏览器。

- 独立项目 `pnpm exec tsc --noEmit --project design-plans/issue179-review-v2/tsconfig.json` 退出0。
- 受影响app定向ESLint退出0；最终独立 `pnpm exec next build design-plans/issue179-review-v2 --webpack` 退出0，并在4181使用Next生产模式运行。
- `ego-browser nodejs < docs/verification/analytics-179/prototype-v2/feedback/check.mjs` [报告](./browser.json)通过。桌面1440×1080、手机390×844、390×400短视口，浅深色、零访问、三点直接数值、无Accordion、14px弹窗/8px关闭、透明hover、按压矩阵为单位变换、正文可滚到底、十条现存示例排行、Escape回来源焦点均实际检查。
- `ego-browser nodejs < docs/verification/analytics-179/prototype-v2/feedback/details.mjs` 补真实关闭hover、手机排行末端、异常网格。过渡完成后补图，不用截图数量替代视觉对照。

首次浏览器断言发现生成CSS仍为旧24/20px，而源码已14px；移走仅该独立项目的`.next/cache`后重建，生成CSS及真实computed style一致。首次服务启动与浏览器重载竞争导致connection refused，待服务实际200后恢复原页面。按压初次断言严格比较字符串`none`，实际为单位矩阵；改为严格比较六个矩阵值`[1,0,0,1,0,0]`验证无缩放/位移，没有放宽几何要求。补图末尾自动滚动点击被html拦截，检查页面后改用真实focus+Enter恢复演示入口；异常Tab初图在过渡帧，等待有限动画结束后仅重拍该图。失败均保持为取证/运行记录，不冒称首轮全绿。

## 同视口设计对照

- [桌面单图](./statistics-desktop.png)、[手机单图](./statistics-mobile.png)、[深色](./statistics-mobile-dark.png)：公共区域保留，缩略图、累计、版本、近期折线层级保留，三个数字无需hover可读，说明入口已删除。
- [零值](./zero-mobile.png)：三个点同一零基线，版本条归零。
- [短视口](./short-mobile.png)、[正文底部](./short-bottom.png)：固定关闭/工具区可达，正文滚动到完整折线。
- [真实hover](./hover-desktop.png)：关闭透明背景，无放大/缩小或新增彩色块。
- [桌面排行](./ranking-desktop.png)、[手机首屏](./ranking-mobile.png)、[手机末端](./ranking-mobile-bottom.png)：Tab方圆角与周期控件保留清楚层级，第10项现存样例而非删除占位。
- [手机异常](./failures-mobile.png)：16px卡片、8px操作、稳定选中态。

[独立代码复审](../review-feedback-code.md)关闭portal作用域问题，并分别评审真实排行查询；[独立设计复审](./review-design.md)只对原型视觉给结论，不能代替真实产品验证或用户批准。

最后恢复预览时，点击工具报告目标已inert；随即读取真实页面确认目标统计弹窗已打开，没有重复点击。唯一TaskSpace2只调用一次finish并保留p2供用户查看，旧版未管理tab受保护；没有停止预览服务。

原型地址仍 `http://127.0.0.1:4181/analytics`，无账号；旧4179与独立产品4180继续保留。未完成：这版新增交互的用户批准、产品UI实施与其真实验证、Figma同步、最终人工验收。默认产品全量浏览器此前未执行，本原型检查不能替代。
