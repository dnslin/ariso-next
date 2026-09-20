# 设计与原型

当前设计文件为 [Ariso Figma](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b)。桌面和手机各按 00–16 统一为 17 个模块分区，同一模块的主页面、操作状态、异常、主题与尺寸对照集中查看。

| 文档                                                            | 用途                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| [设计交付规范](./handoff.md)                                    | 有效视觉、布局、交互规则，以及 UI 家族与主节点映射         |
| [待验收清单](./acceptance.md)                                   | DES / RG 当前责任、仍需联调或设计确认的范围与完成条件      |
| [历史设计记录](../archive/preparation-2026-09/design/README.md) | 早期稿、逐批节点表、原始检查记录；用于追溯，不作为当前进度 |

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

2026-09-20 已完成分区整理：两端共 34 个分区，保留 1,737 个根节点、77,460 个内容节点及 9,938 条交互配置，删除 48 个空旧分区。画板 ID 和尺寸保留，结构、交互配置及代表截图检查通过。[整理完成证据](../archive/preparation-2026-09/design/verification/module-sections-completed-2026-09-20.json)。

这些检查不等于全部业务页面逐页视觉验收，也不等于 Figma 播放器或真实网页行为通过。开发任务从本目录选模块，再引用具体 UI 家族、状态节点、所属规格和[待验收项](./acceptance.md)。历史完整节点表保留在归档，现有画板引用无需重新编号。
