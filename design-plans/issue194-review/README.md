# Issue #194 基本设置补充原型

此目录为独立 Next 原型，不导入生产页面。示例状态和保存行为不代表真实接口或产品验收。仅补充 T-SITE-02 的 DG-SITE 表达缺口，等待用户批准后实施产品并同步 Figma。

Node 24 下从仓库运行：

```sh
node node_modules/next/dist/bin/next dev design-plans/issue194-review --webpack --hostname 127.0.0.1 --port 3194
```

入口：http://127.0.0.1:3194/settings/general 。无需登录。上方原型状态选择器提供正常、加载、读取失败、字段错误、保存中、结果未知、核对中、核对失败、核对差异、地址更新、模块读取失败、空/停用默认和未初始化代表。主题按钮只用于预览。导航和其他模块入口用于展示组合边界，不构成其他页面的交付。

复用现有 AdminShell、SettingsHeading/SettingsCategories、StorageTip、Providers、字体及 HeroUI 3.2.6；图标用 Lucide。未复制公共组件或修改公共来源。保留三组卡片、外标签、两端响应式和固定保存栏。

建议调整：成功保留原页，简短中性反馈；地址更新后当前地址/回调和维护后果持续可读，复制仅用已保存值；未知结果只读核对，差异时选择服务器设置或保留草稿；普通说明中性文字/Tips，部分模块读错不封锁站点保存。品牌、上传限制和主题后续功能按真实当前能力标注尚未开放。

设计来源、真实原型截图与审批状态统一见 [任务证据](../../docs/verification/site-194/README.md)。原型方案批准不等于正式产品人工验收。
