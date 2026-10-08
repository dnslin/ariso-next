> 最新正常截图与标题居中结果见 title-fix-log.md、*-title-fix.json。desktop.png/mobile.png 已由本次标题局部修复各一次截图覆盖。

# 独立设计评审后局部修正

此记录及 *-postfix.json 为最新写入；desktop.png / mobile.png 已由一次对应视口的 post-fix 截图覆盖。初次正常页面截图各一次，因具体缺陷修正后又各一次，未再次截取未变化的最终图。

实际 OwnerShell 当前导航总览、访问统计 unavailable=true。desktop 467:4002 原导航沿用了历史公共样式，故将 470:10278 的实际导航子层 clone 到 467:4195。Sidebar467:4188、导航467:4195、root467:4002 均保留；470正常root公共导航不需要改变，手机正常root只有折叠菜单无需添加桌面导航。71个新增导航后代、67个旧导航后代删除，完整ID见desktop-postfix.json。现在桌面两个正常root均213后代、69FRAME/58TEXT/63VECTOR/23INSTANCE，两个手机正常root均106后代。imagefills仍均0。

检查全局 Button/Primary 文本3:22发现其实际 Noto Sans SC Regular400；它不是500，因此没有把“全局主定义已确认500”当作事实。依据主代理确认的产品/获批方向及现行 #200 上传保存实例的实际字体分段，把四正常root八个保存按钮实例内文字统一为 Noto Sans SC Medium500。读取全部当前 font segments，await loadFontAsync，随后使用实际已有Medium500字体进行setRangeFontName；未改全局组件定义、字号、按钮尺寸、其他历史状态根。

按钮精确身份、最终fonts与新affected/deleted/created IDs见 *-postfix.json；累计节点身份/最新根counts见 *-final.json。两端 *-postfix.js 保留实际修改脚本。

实际后续工具：

- figma_use_figma 先并行读取两页当前侧栏和按钮分段字体；
- figma_use_figma 读取原Button/Primary文本3:22及导航根；
- figma_use_figma 两页各一次并行局部修改；
- figma_get_screenshot 两视口各一次postfix (467:4002 1440×1080，467:9001 390×844)；
- curl -fL --silent --show-error -o <evidence>/desktop.png <returned temporary screenshot URL>：exit0；
- curl -fL --silent --show-error -o <evidence>/mobile.png <returned temporary screenshot URL>：exit0；
- view_image 检查两张postfix图，侧栏总览/访问统计均显式尚未开放，保存按钮文字字重一致、未裁剪。
  截图短期地址仍不写日志。独立设计评审者已通知复读。未更改产品、未操作Ego、未重新运行应用测试。
