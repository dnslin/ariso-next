# 站点标题居中校准（最新正常截图）

独立设计评审按真实产品与获批联合原型提出标题约8px差异，主代理已明确授权仅修四正常root此处。已重新读 SiteForm 的 flex items-center 行：h2中文18px/28px行高，与44px帮助目标居中。Figma当前文本实测却是72×44、lineHeight28、textAlignVerticalTOP，故字形贴顶部。

本次只修改文本467:4278 / 971:32761 / 467:9038 / 971:32602。加载这些文本当前实际分段字体并await后，改为72×28、textAutoResizeHEIGHT、layoutSizingVerticalHUG，保留既有Row的CENTER。Figma自动得到y8。字体仍Noto Sans SC Medium500，lineHeight仍28，未改全球组件。

结果脚本逐个断言Row、Card及Card直接子层全部bounds与修改前一致，因此帮助目标、后续表单及完整地址入口均未移动。无创建或删除节点。精确before/after、fonts、affected IDs见desktop-title-fix.json / mobile-title-fix.json，实际脚本见对应js。*-final.json附titleFix最新版信息；所有正常根原ID保留，后代数量无变化、图像填充无变化。其他状态根未修改，应用产品未修改。

本次两页各一次并行局部写入后，figma_get_screenshot对467:4002和467:9001各一次截图。按工具下载说明curl保存desktop.png/mobile.png均exit0，并view_image检查。最新图片已覆盖之前postfix图片，无额外未变化的截图。desktop1440×1080，mobile390×844。独立设计评审者已直接通知复读以闭合8px差异。真实产品浏览器的验证与本次Figma写入证据仍各自独立。
