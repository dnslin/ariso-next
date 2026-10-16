# 首版设计与前端验收范围

M5 于 2026-10-17 由用户确认手动验收通过，首版 DES/RG 范围随阶段完成，见[M5 归档](../archive/m5/README.md)。此页保留范围索引；[分次交接记录](https://github.com/dnslin/ariso-next/blob/975f63eeb3e9b19a0ace827ba3fe646565d5b2e2/docs/archive/m5/design-history.md)保留原有日期、批准范围和当时的验证限制。

## DES 主责任

| ID     | 首版覆盖范围                                                          | 当前规则                                                |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------------- |
| DES-01 | 初始化、字段校验、中断和已初始化入口                                  | [identity](../specs/SPEC-identity.md)                   |
| DES-02 | 申请与重置、凭据失效、撤销会话和恢复                                  | [identity](../specs/SPEC-identity.md)                   |
| DES-03 | 匿名浏览、授权、信息裁剪、连续浏览和大图                              | [sharing](../specs/SPEC-sharing.md)                     |
| DES-04 | 相册与标签管理、封面、关系及恢复                                      | [collections](../specs/SPEC-collections.md)             |
| DES-05 | 全站主题、系统/本地偏好、跨页及状态对比                               | [site](../specs/SPEC-site.md)、[交付规范](./handoff.md) |
| DES-06 | 认证、上传、图库、标签、分享、回收、存储、处理、站点、API、SMTP与统计 | [十份业务规格](../product/CAPABILITY-MAP.md)            |
| DES-07 | 公共导航、登录回跳、焦点/键盘、滚动和减少动态效果                     | [交付规范](./handoff.md)                                |

## RG 回归责任与已补代表

RG-01 覆盖选择清单；RG-02 覆盖详情与大图返回；RG-03 覆盖地址与复制；RG-04 覆盖批量关系及部分失败；RG-05 覆盖处理设置及资源边界；RG-06 覆盖真实格式与附件；RG-07 覆盖跨页面主题及响应式；RG-08 覆盖保存、持久化与请求失败恢复。原代表节点见[准备阶段设计记录](https://github.com/dnslin/ariso-next/blob/975f63eeb3e9b19a0ace827ba3fe646565d5b2e2/docs/archive/preparation-2026-09/design/README.md)。

## 真实验证清单

新界面改动执行[前端共用验收](../guides/verification.md#前端共用验收)，记录实际页面、视口、主题、状态、设计差异与功能结果。设计画板、模拟数据、截图数量和单项检查通过分别说明，不代替完整用户流程。首版人工结论不替代后续改动自身验证。
