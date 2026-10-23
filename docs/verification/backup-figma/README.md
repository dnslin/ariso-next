# 备份与恢复 Figma 同步验收

日期：2026-10-22。范围：已确认交互原型的设计同步，未修改业务代码、原型源代码或依赖。

## 交付

[打开功能页](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47854)。在原设计文件中新增“Ariso · 备份与恢复”，保留原有两个页面。临时网页捕获节点已移除。

共 60 张原生可编辑画板：15 个关键状态 × 桌面 1440×1080 / 手机 390×844 × 浅色 / 深色。合计 1510 个原生文字节点、1010 个复用实例、1560 个框架。唯一的 8 个位图节点是图库中的两张示例图片在四个视口/主题组合中的复用，没有把页面截图作为交付画板。

复用现有 Ariso Light/Dark 变量集合、原按钮/输入框和公共柔光组件；本次新增局部字段、备份范围、按钮箭头变体、原生点阵与 Lucide 图标组件。新增组件均放在本功能页。

## 画板索引

| 状态                     | 桌面浅色                                                                             | 手机浅色                                                                             | 桌面深色                                                                             | 手机深色                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| B01 备份首页与空记录     | [1282:47855](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47855) | [1282:47856](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47856) | [1299:49404](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-49404) | [1299:49608](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-49608) |
| B02 备份密码             | [1282:47857](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47857) | [1282:47858](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47858) | [1299:49717](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-49717) | [1299:49933](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-49933) |
| B03 开始备份确认         | [1282:47859](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47859) | [1282:47860](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47860) | [1299:50054](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-50054) | [1299:50286](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-50286) |
| B04 备份进行中           | [1282:47861](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47861) | [1282:47862](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47862) | [1299:50423](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-50423) | [1299:50614](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-50614) |
| B05 备份成功与保存入口   | [1282:47863](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47863) | [1282:47864](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47864) | [1299:50710](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-50710) | [1299:50895](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-50895) |
| B06 备份失败             | [1282:47865](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47865) | [1282:47866](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47866) | [1299:50986](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-50986) | [1299:51157](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-51157) |
| R01 导入备份             | [1282:47867](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47867) | [1282:47868](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47868) | [1299:51233](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-51233) | [1299:51310](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-51310) |
| R02 核对内容             | [1282:47869](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47869) | [1282:47870](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47870) | [1299:51387](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-51387) | [1299:51490](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-51490) |
| R03 配置本地与多个 S3    | [1282:47871](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47871) | [1282:47872](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47872) | [1299:51593](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-51593) | [1299:51750](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-51750) |
| R04 确认恢复             | [1282:47873](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47873) | [1282:47874](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47874) | [1299:51907](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-51907) | [1299:52010](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-52010) |
| R05 恢复进行中           | [1282:47875](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47875) | [1282:47876](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47876) | [1299:52113](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-52113) | [1299:52178](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-52178) |
| R06 等待部署者重启       | [1282:47877](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47877) | [1282:47878](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47878) | [1299:52243](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-52243) | [1299:52288](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-52288) |
| R07 恢复启用后重新登录   | [1282:47879](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47879) | [1282:47880](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47880) | [1299:52333](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-52333) | [1299:52376](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-52376) |
| R08 恢复失败与重试       | [1282:47881](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47881) | [1282:47882](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47882) | [1299:52419](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-52419) | [1299:52468](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-52468) |
| P01 暂停修改期间浏览图库 | [1282:47883](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47883) | [1282:47884](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47884) | [1299:52517](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-52517) | [1299:52660](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1299-52660) |

## 流程与边界

已建立 128 个原型连接、12 个起点，具体来源节点/目标节点见 [connections.json](connections.json)。主流程为：创建备份 → 密码 → 确认 → 进度 → 成功；导入 → 核对 → 配置存储 → 确认 → 恢复进度 → 等待重启。失败画板可进入重试或修改配置，暂停图库可返回备份进度，后台页面可切换浅深色。

进度画板的 8 秒自动跳转仅为 Figma 演示时间。实际恢复完成后，由部署者重启新实例；等待重启画板没有一键重启按钮。重启后的登录状态是独立原型起点。

文件选择、密码输入、真实下载、S3 测试和登录提交不在 Figma 内执行。取消/删除确认、输入错误提示、存储折叠切换等辅助分支未单独展开，继续以已批准的可运行网页原型为准。相应控件未连接成绕过确认的假操作。

正式设计排除了“原型导览”“恢复演示情景”“填入示例配置”“模拟重启完成”等演示工具，登录按钮也去除了“演示”字样。保留全部业务上的重启说明和示例数据，未使用真实凭据。

## 实际验证

- 全量结构检查：60 张非空画板；128 个有连接的节点；演示工具文案残留为 0；原有页面保留；两个本次捕获参考根节点已移除。详见 [index.json](index.json)。
- 独立主题复核：30 张深色画板、505 个实例，显式和解析后的浅色模式残留均为 0。详见 [theme-audit.json](qa/theme-audit.json)。
- 8 张最终代表截图已实际查看，覆盖桌面、手机、浅深色、备份、恢复配置、等待重启和暂停图库。详见 [QA 记录](qa/review.md)。
- 其余画板做结构/组件/主题检查，未逐张独立截图；长 S3 表单下方以结构核对为主。未把代表截图验收扩大为全部画板的人工验收。原型连线已通过节点结构核对，未逐条在 Figma 播放器实际点击。

## 最终代表截图

| 状态                       | 最终截图                               |
| -------------------------- | -------------------------------------- |
| M / B01 备份总览 / Light   | [查看](qa/B01-mobile-light-final.png)  |
| D / B01 备份总览 / Dark    | [查看](qa/B01-desktop-dark-final.png)  |
| D / R01 导入备份 / Light   | [查看](qa/R01-desktop-light-final.png) |
| M / R03 配置新存储 / Light | [查看](qa/R03-mobile-light-final.png)  |
| M / R03 配置新存储 / Dark  | [查看](qa/R03-mobile-dark-final.png)   |
| M / R06 等待重启 / Light   | [查看](qa/R06-mobile-light-final.png)  |
| M / R06 等待重启 / Dark    | [查看](qa/R06-mobile-dark-final.png)   |
| D / P01 暂停修改 / Light   | [查看](qa/P01-desktop-light-final.png) |

构建过程脚本与中间截图保留在任务忽略目录 `.data/backup-figma-tools`，不作为本次交付依据。验收以本页列出的 `*-final.png`、全量索引和最终 QA 结论为准。
