# 目录选择源码诊断（2026-10-02）

本轮仅只读调查；没有操作 TaskSpace 3、创建空间、下载浏览器或改动产品/测试代码。现有失败仍是 cancel / 0 文件，未执行新的浏览器复测。

## 已确认

- `e2e/upload-input.mjs:148-178` 对真实生产目录 input 使用 CDP 的 DOM.setFileInputFiles，监听 change / cancel，收到 cancel 会断言失败。后续目录扫描并未执行。
- `docs/verification/upload-159/README.md:73` 已记录独立原生 input 的三条实际路径（直接 CDP / Ego 高层 / 拦截 chooser）均 cancel，因此失败不依赖 React / UploadController。
- 安装入口 `/Users/dnslin/.local/bin/ego-browser` 指向已安装 Ego Lite 0.5.1.13；没有另行安装运行时或读取用户 profile。
- Ego 公开源码 `driver/page-input.ts` 中 setInputFiles 与 intercepted chooser 的 setFiles 最终共用 `setFilesOnBackendNode`，发送同一个 DOM.setFileInputFiles；没有找到专用目录递归 API。
- Chromium DOM.setFileInputFiles 调用 HTMLInputElement.SetFilesFromPaths。当 input 有 webkitdirectory 时，只取首个目录路径并通过浏览器级 EnumerateChosenDirectory 枚举。普通多文件则直接构建 FileList。后端枚举须拥有文件访问授予和 browser delegate；拒绝、取消、空选择结果可触发 cancel。
- Ego native 实现没有可供本机审读的公开源码；无法仅凭 cancel 判断是文件访问授予、native delegate 还是另一个枚举原因。浏览器边界定位已确认，精确内部原因仍未知。

## 最小处置

不修改产品 UI，不伪造 FileList / change，不以 directory drop 代替 picker，不删除/削弱原生选择断言。用同一 TaskSpace 3 的独立测试实例准备真实测试目录、监听真实输入事件、保持页面和服务可用，handOff 由用户完成 macOS 文件夹选择。确认回到 Agent 后读取真实输入结果、扫描汇总和队列身份；若原生选择成功，可以补齐 picker 行为证据，自动 CDP cancel 历史仍不能改记通过。若原生操作也失败，再根据具体错误修复，不预先更换架构。

## 官方来源

- Ego 文件入口：https://github.com/citrolabs/ego-lite/blob/main/package/ego-browser/src/driver/page-input.ts
- Ego Page cdp / setInputFiles / chooser：https://github.com/citrolabs/ego-lite/blob/main/package/ego-browser/src/page-model.ts
- Chromium DOM renderer handler：https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/inspector/inspector_dom_agent.cc
- Chromium directory / files 分支：https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/html/forms/file_input_type.cc
- Chromium 文件访问授予：https://github.com/chromium/chromium/blob/main/content/browser/devtools/protocol/dom_handler.cc
- Chromium 目录枚举检查：https://github.com/chromium/chromium/blob/main/content/browser/web_contents/file_chooser_impl.cc
- Ego 原生提示交接说明：https://lite.ego.app/article/automate-native-file-dialogs

Ego skill 的明确规则：Permission prompts, device choosers, and other browser-owned prompts require the user to handle them。故无法用 OS 自动化替代人工交接；这不是项目策略自行扩大授权要求。
