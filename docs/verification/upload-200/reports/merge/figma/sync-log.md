> 最新正常截图与标题居中结果见 title-fix-log.md、*-title-fix.json。desktop.png/mobile.png 已由本次标题局部修复各一次截图覆盖。

> 最新结果：独立设计复审后已修正公共侧栏和按钮字重。最新证据见 postfix-log.md、*-postfix.json 和更新后的 *-final.json；desktop.png/mobile.png 已由各一次 post-fix 截图覆盖。以下内容保留初次同步记录。

# 联合基本设置 Figma 同步记录

时间：2026-10-08T12:04:23Z
文件：74sT9Hrf8G4czcWeTkET5b
范围：用户已批准的 #194 + #200 联合正常页面。只写入指定 Figma 正常节点与本忽略目录证据；未改产品、测试或受跟踪文档，未操作 Ego。

## 结果

四个根节点保留原 ID：桌面 467:4002 / 470:10085，手机 467:9001 / 470:10377。两原任务的正常节点均呈现联合方案。站点信息四字段、上传限制三字段与关联四行保留。旧关联上传占位 897:15513 / 897:15548 已删除。

桌面操作栏：x232 y999 w1208 h81；padding 12/32/20/32；两个200×48按钮、gap12。
手机操作栏：x0 y763 w390 h81；padding12/16/20/16；两个173×48按钮、gap12。
手机替换旧64px菜单目标，复用 #200 的44×44菜单按钮；整体header仍64高。

桌面新上传卡971:32694；上传任务正常页新scroll/footer971:32723 / 971:32851。
手机新上传卡971:32554；上传任务正常页新scroll/footer971:32590 / 971:32689；站点正常页新header971:32583。

正常页中文采用当前实际分段字体 Noto Sans SC Regular/Medium。品牌 Caveat、桌面侧栏英文 Inter 保留。所有涉及字体均从当前 getStyledTextSegments(['fontName']) 读取并 await loadFontAsync 后才写入。复用 Button/Primary、Input、Site RelatedSetting、公共标题和 #200 UploadGroupHeading/NumberField/Header 的实例；保留既有变量绑定，不新增token或组件。仓库未找到所需组件的 Code Connect 文件，故通过现有屏幕发现其组件key。未导入截图或整页图像。四根 image-filled nodes 均为0。

根后代数量和类型：

- 467:4002：209；FRAME67/TEXT56/VECTOR63/INSTANCE23。
- 470:10085：213；FRAME69/TEXT58/VECTOR63/INSTANCE23。差异来自保留各自原桌面侧栏，后者仍有原“尚未开放”标签。
- 467:9001：106；FRAME32/TEXT39/VECTOR14/INSTANCE21。
- 470:10377：106；FRAME32/TEXT39/VECTOR14/INSTANCE21。

完整创建身份（含提交后出现的虚拟实例后代）记录在 desktop-final.json / mobile-final.json。桌面创建154，删除71；手机创建132，删除56。原write返回保守affected ID集合，含未重新赋值的原shell子层；未将这些描述为全部显式属性写入。原始write结果仍保留为 *-sync.json。

## 调用与证据

实际技能：figma-use / figma-generate-design；已读 plugin API index与相关独立类型、字体加载gotchas、design systems说明。
每页独立的调用以 Promise.all 同时发出，每call仅切页一次。具体读取和写入代码保留在 *-read.js / *-sync.js / *-readback.js，具体返回保留在 *-before.json / *-sync.json / *-final.json。

- figma_use_figma read：读取根、source卡、footer、关联行、字体、组件key、已有变量绑定。
- figma_use_figma write：每page各一次成功写入，参数 fileKey 上述文件、skillNames figma-use,figma-generate-design；代码见 *-sync.js。
- figma_use_figma readback：补齐clone提交后才能被遍历的虚拟实例后代ID。
- figma_get_screenshot(fileKey=74sT9Hrf8G4czcWeTkET5b,nodeId=467:4002,maxDimension=1440)：一次桌面完整组合截图，1440×1080。
- figma_get_screenshot(fileKey=74sT9Hrf8G4czcWeTkET5b,nodeId=467:9001,maxDimension=1440)：一次手机完整组合截图，390×844。
- curl -fL --silent --show-error -o <evidence>/desktop.png <tool-returned temporary asset URL>：exit0。
- curl -fL --silent --show-error -o <evidence>/mobile.png <tool-returned temporary asset URL>：exit0。
  截图依工具提供的下载说明立即保存；日志不保存被工具声明为临时敏感地址的asset URL。
- view_image：检查上述两张图片；未发现整页重叠、占位文案或按钮裁剪。
- git check-ignore test-results/merge-264/figma/desktop-final.json test-results/merge-264/figma/mobile.png：两路径均忽略。

读取调用曾遇到两类可安全重试问题：占位符替换误改PAGE类型常量、返回超过20480字节。均是未写入读取调用，工具返回safeToRetryWithoutCanvasRead=true、无canvas edits committed；已修正脚本/缩小返回。成功写入未遇到错误。

## 验证边界

正常节点同步完成。指定加载、错误、会话专属节点保持历史原样，本记录不声称它们已经更新为联合方案。Figma截图是正常可视视口；滚动下方内容仍存在编辑层和结构返回中。产品真实浏览器截图、运行时验证与独立设计复审由主代理/设计评审者另行完成，不能用本次Figma静态截图替代。
