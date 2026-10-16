# 设计与原型

当前设计文件为 [Ariso Figma](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b)。桌面和手机各按 00–16 统一为 17 个模块分区，同一模块的主页面、操作状态、异常、主题与尺寸对照集中查看。

| 文档                                                                                                                                                 | 用途                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [设计交付规范](./handoff.md)                                                                                                                         | 当前视觉、交互、组件复用、UI 家族与已批准修订 |
| [首版验收范围](./acceptance.md)                                                                                                                      | DES/RG 范围及 M5 完成依据                     |
| [首版设计交接](https://github.com/dnslin/ariso-next/blob/975f63eeb3e9b19a0ace827ba3fe646565d5b2e2/docs/archive/m5/design-history.md)                 | DG 适用核对、分次批准与当时验证边界           |
| [准备阶段记录](https://github.com/dnslin/ariso-next/blob/975f63eeb3e9b19a0ace827ba3fe646565d5b2e2/docs/archive/preparation-2026-09/design/README.md) | 旧稿、完整状态节点和分区整理证据              |

原型表达视觉和预设交互，不能证明业务已实现。功能范围以 [PRD](../product/Ariso-PRD-v1.1.md) 与 [业务规格](../product/CAPABILITY-MAP.md) 为准；旧稿中的演示数据、旧布局和“下一批”不覆盖当前规则。

## 17 个模块入口

| 模块                    | 桌面分区                                                                     | 手机分区                                                                     |
| ----------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 00 · 设计导航与共用规范 | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1007) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2261) |
| 01 · 首次初始化         | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1008) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2262) |
| 02 · 首页与登录         | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1009) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2263) |
| 03 · 找回与重置密码     | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1010) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2264) |
| 04 · 账号安全与 GitHub  | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1011) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2265) |
| 05 · 工作台与访问统计   | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1012) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2266) |
| 06 · 上传               | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1013) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2267) |
| 07 · 图库与图片详情     | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1014) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2268) |
| 08 · 相册               | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1015) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2269) |
| 09 · 标签               | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1016) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2270) |
| 10 · 分享管理与访客浏览 | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2271) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2279) |
| 11 · 回收站             | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2272) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2280) |
| 12 · 存储管理           | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2273) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2281) |
| 13 · 站点基础设置       | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2274) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2282) |
| 14 · 图片处理与水印     | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2275) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2283) |
| 15 · 邮件服务           | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2276) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2284) |
| 16 · 上传 API 与 Token  | [桌面](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2277) | [手机](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2285) |

模块按编号从左到右、从上到下阅读。共用组件和跨模块阅读画板放在 00，阅读画板仍连接各业务模块内的具体状态。新增内容归入对应模块，不再创建 07-B/C/D 或 R1–R6 一类独立子分区。

## 当前交付边界

当前模块组织沿用 2026-09-20 的分区整理，节点与交互保留，见[完成证据](https://github.com/dnslin/ariso-next/blob/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/archive/preparation-2026-09/design/verification/module-sections-completed-2026-09-20.json)。M5 首版整体验收已由用户确认通过；后续改动引用具体 UI 家族、状态节点与所属规格，并执行[前端共用验收](../guides/verification.md#前端共用验收)。
