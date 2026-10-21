# 实际界面与 Figma 对照

以下保留首轮设计对照。用户同日后续取消独立替换页、新旧对比和再次确认；对应当前设计、原位Figma更新与新的验证状态见[替换精简](./replacement-simple-20261021.md)。旧截图不证明新交互已验收。

2026-10-21，四项获批局部原型的实现对照。Figma 文件为 `74sT9Hrf8G4czcWeTkET5b`；完整节点清单见 [Figma 同步](./figma.md)。功能验证与设计对照分别记录，本文不代表用户最终人工验收。

## 桌面

下表截图均已检查文件内容为 JPEG、尺寸为1440×1080。照片经正式上传与实际媒体处理；数量、日期、名称、输出宽高和图片比例按真实数据呈现。复用既有详情 Modal 的承载方式属于已确认适配。

| 流程      | Figma 桌面节点 | 实际证据                                                                                                                  | 逐项结论                                                                                                                                          |
| --------- | -------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| ZIP预检查 | `1220:47051`   | [预检查](./screenshots/zip-desktop.jpg)                                                                                   | 版本、照片清单、名称/私有性/存储/大小、总量和开始下载成立；两种入口已在功能场景验证                                                               |
| 尺寸外链  | `1223:47747`   | [就绪链接](./screenshots/sizes-desktop.jpg)                                                                               | 实际压缩图预览；版本与尺寸同行；实际1280×854；URL/Markdown/HTML常显；完整稳定URL与单一复制操作成立                                                |
| 创建分享  | `1222:47054`   | [创建](./screenshots/share-create-desktop.jpg)                                                                            | 实际角色预览与80px身份卡、期限、权限后果及创建分组成立                                                                                            |
| 有效分享  | `1222:47294`   | [已创建](./screenshots/share-active-desktop.jpg)                                                                          | 状态/到期图标、完整地址、水绿访客预览、失效后果与撤销成立；截图为真实鼠标选择1小时并创建后的状态                                                  |
| 替换确认  | `1221:47188`   | [顶部](./screenshots/replacement-review-overview-desktop.jpg)、[正文末端](./screenshots/replacement-review-desktop.jpg)   | 当前图片与候选对比、稳定外链摘要、独立后果提示、固定确认操作成立。图中night.jpg是成功替换后再次选择但未提交的候选                                 |
| 替换成功  | `1221:47934`   | [顶部](./screenshots/replacement-success-overview-desktop.jpg)、[成功提示](./screenshots/replacement-success-desktop.jpg) | 当前预览已显示真实新山景，成功Alert有边框/浅底/图标；底栏只有主色返回；无旧进度消息。实际新图解码为1600×1067，预览URL随内容标识更新，外部链接不变 |

替换工作页的正文使用实际滚动容器。顶部全貌与滚动至提示区域分别留证，不把一张看不到提示的截图称为完整状态对照。旧1280×720替换截图已由上述证据替换。

## 公共区域与消费路由

本轮沿用既有 OwnerShell/PublicShell，未调整公共导航顺序、品牌、账号区或主题入口。新增单图访客路由的标题为“图片分享”，其余相册分享标题保持原样。

- 图库：四项完整流程由最终Ego定向入口验证；鼠标操作与真实照片另由独立IAB检查。
- 相册：通过正式界面创建演示相册并上传私有照片，选择后从操作栏进入相同ZIP预检查，见[相册入口](./screenshots/album-archive-desktop.jpg)。这张截图证明该入口与预检查，不单独声称相册入口已再次下载解包。
- 上传结果：正式选择文件、设置私有和相册、开始上传并完成处理，详情进入替换工作页，见[上传入口](./screenshots/upload-replacement-entry-desktop.jpg)。返回仍在/upload，焦点实际恢复到更多图片操作；未在此入口重复执行完整替换。
- 分享管理：实际切换到私有图片分享，读取已创建记录并打开同一角色预览，见[管理入口](./screenshots/share-management-desktop.jpg)；真实确认撤销后列表显示已撤销，见[列表更新](./screenshots/share-management-revoked-desktop.jpg)。

## 手机、短屏和主题

最终定向入口包含360/390/430/768与1440宽度、390×400短屏、390与1440深浅色及真实键盘。完整表单通过实际Tab遍历后截图，完整URL与只读属性、实际焦点目标、44px点击目标、弹窗归属及可见性均保留断言。已实际逐张查看下列手机代表并对照批准结构。深浅色完整表单的三个滚动位置同时核对；97份界面记录的数量本身不替代视觉对照。

| 流程             | Figma手机节点              | 实际证据与结论                                                                                                                                                                                                                                                                                                               |
| ---------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ZIP预检查        | `1220:66003`               | [390×844](./screenshots/browser-image-workflows-zip-original-light-390.png)清单与版本/操作分组成立；[390×400](./screenshots/browser-image-workflows-zip-original-manifest-short-390x400.png)修复了清单塌缩，实际清单175px，首尾行可滚动完整读取，112×44px按钮仍可达                                                          |
| 尺寸外链         | `1223:67879`               | [表单](./screenshots/browser-image-workflows-size-link-formats-light-390.png)、[完整链接](./screenshots/browser-image-workflows-size-link-form-complete-link-light-390.png)：纵向顺序、常显格式、实际输出、完整URL与操作成立；三滚动位置的两种主题已实际看图                                                                 |
| 有效分享         | `1222:66893`               | [完整地址区域](./screenshots/browser-image-workflows-private-share-active-form-complete-link-light-390.png)：身份/期限/链接/预览/撤销顺序成立，完整链接可聚焦及滚动读取；两主题已实际看图                                                                                                                                    |
| 匿名查看         | `1222:67739`               | [访客](./screenshots/browser-image-workflows-anonymous-light-390.png)：公共品牌、图片、有效期与通用文案成立；访问权限另由实际空session/私图401/分享资源验证                                                                                                                                                                  |
| 替换候选         | `1221:66112`               | [顶部](./screenshots/replacement-review-overview-mobile.jpg)、[正文下部](./screenshots/replacement-review-body-mobile.jpg)：真照片上下排列、候选名称、完整稳定外链、独立Notice和固定确认栏成立。候选未提交，JPEG390×844                                                                                                      |
| 替换处理中及返回 | `1221:66235`与既有图库卡片 | [接收中说明](./screenshots/replacement-receiving-body-mobile.jpg)、[实际活动卡片](./screenshots/replacement-return-active-mobile.jpg)、[完成更新](./screenshots/replacement-return-completed-mobile.jpg)：原生multipart暂停期间保留旧图、工作页状态与共享任务成立；释放后同一任务成功，缩略图更新且活动状态消失，JPEG390×844 |

最后一组独立IAB证据使用演示数据与正式替换接收接口，真实接收任务为 `b5e8d6c5-1efb-4336-85bd-a05ba740b83d`，日志 `/tmp/ariso-image-workflows-mobile-reception.log` 明确记录 `receiving → succeeded`。最终Ego报告中的接收返回另一次独立验证已通过。早期Ego手机PNG只展示页面顶部或目标卡片在折叠线外，未用它们冒充正文/活动状态已视觉取证；以上真实滚动截图补齐该缺口。

## 差异处理

ZIP照片/来源清单、分享真实角色预览与身份卡、尺寸常显三格式、替换独立后果提示/状态Notice/成功主操作均已恢复到批准结构。同步自动全选导致地址框重复Tab时留在屏外，已用真实键盘对照定位并去除该额外行为；显式复制失败后的手动选中保留。

全量浏览器的既有设置分类圆角偏差独立保留，未获批准也未修改，见[基线记录](./browser-known-baseline.md)。本轮四项设计对照与既有设置页偏差分别报告。
