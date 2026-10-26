# PR #301 评审修复与复核

- 日期：2026-10-26，Asia/Shanghai。
- 用户要求：先规划，再修复两份独立评审的问题；继续不合并、发布或部署。
- [修复计划](../../../../tasks/image-editor/plan.md#pr-301-评审修复计划2026-10-26)、[任务清单](../../../../tasks/image-editor/todo.md#pr-301-评审修复)。原组合工作区没有改动。
- 原评审提交：`8f9fce05`。修复生产源码及最终构建提交：`1a2bcfd8b63187f8364a411870911cb2d57bb00b`，构建版本`v0.0.0-image-editor-pr.3`。
- 环境：macOS arm64、Node24.18.1、pnpm11.19.0、原生ImageMagick/ExifTool。未使用本机Docker/Colima。

## 最终实现

1. **R1：工作区统一离开确认。** provider持有唯一任务订阅与草稿判断，编辑、模板、批量及结果中的未提交项都使用现有`useSiteNavigation`。自身退出、侧栏、同文档历史与刷新共享离开边界。取消保留配方和焦点；确认后由实际URL token变化关闭嵌入工作区并恢复来源。已冻结提交的任务不会被取消，之后新改动仍需确认。不再由当前Editor子页单独监听刷新，也不靠单独popstate路径关闭工作区。
2. **R2：直接使用Canvas。** 即时预览返回绘制后的`HTMLCanvasElement`，Konva直接消费；对比态仍读取原Image，并明确区分自然尺寸与Canvas尺寸。删除完整PNG编码、data URL及立即解码的中间层，保留源图/Logo缓存与释放。自然尺寸没有变化时返回原图片数组，切断“渲染→尺寸回调→无效状态更新→再次渲染”的反馈。
3. **O1：复用原图准入。** 原图与最终预览直接消费`requireEditSource`返回的图片、原图对象和存储，不经过面向界面的Context或重复查询。未发布接口没有聚合错误码消费者，移除`MEDIA_EDIT_UNAVAILABLE`转换层，保留具体领域错误、原状态和中文说明；源对象变化仍为`MEDIA_EDIT_SOURCE_CHANGED`。

没有数据库、依赖或公共页面视觉重设计。公共导航只增加显式动作确认，并修正同路径查询参数变化被当作当前页忽略的判断。

## 失败先行与修复过程

| 定向检查                    | 失败轮与修复后结果                                                               |
| --------------------------- | -------------------------------------------------------------------------------- |
| 共享导航退出动作与query清除 | RED 3失败/6通过；GREEN 9通过                                                     |
| 配方草稿与冻结提交边界      | 新增3项通过，结合会话测试检查尚未提交、已受理和受理后新改动                      |
| raster与缓存                | RED 4失败/3通过；GREEN 7通过。测试Canvas的编码方法实际抛错，确保业务渲染不调用它 |
| 原图准入及真实预览          | 新source测试RED 7/9失败，缺站点设置的真实原图预览也失败；GREEN对应3文件27项通过  |
| query驱动工作区关闭         | RED 1失败/1通过；补齐token变化回归后3项通过                                      |
| 自然尺寸回调                | 真实state hook测试RED 5失败；GREEN 5通过，覆盖相同尺寸、图片移除与实际尺寸变化   |

首个修复构建`473f3e79`的浏览器轮次发生Input超时。实际调用链确认无变化的naturalSize仍创建新数组，直接Canvas使已有反馈链持续执行，随后补修。独立复核同时确认当前“图库”项只清query而不卸载工作区，已补token同步及真实页面断言。

第二轮在重新打开Editor后直接寻找水印字段失败。Editor重建时工具回到选择态，测试已改为先点击“水印”再读取字段；仍严格校验原文字和打码区域，没有放宽断言。两轮临时应用与夹具均清理，原失败报告保留在本机`/tmp/ariso-pr301-fix-browser-attempt{1,2}/`。没有把失败写成通过。

## 实际验证

| 实际命令                                                                                                                                                                                                                                            | 结果                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `pnpm run typecheck`                                                                                                                                                                                                                                | 通过，包含主项目、运行时、PicGo          |
| `pnpm run test:unit --maxWorkers=2`                                                                                                                                                                                                                 | 255文件、2771项通过；另执行PicGo独立测试 |
| `pnpm exec vitest run --project unit tests/unit/media/image-editor-navigation.test.ts tests/unit/site/settings-navigation.test.ts`                                                                                                                  | 最后调整测试harness命名后12项通过        |
| `pnpm exec vitest run --project media-tools tests/integration/media/edit-*.test.ts --maxWorkers=2`                                                                                                                                                  | 8文件、64项通过                          |
| `pnpm exec vitest run --project integration tests/integration/runtime/logging.test.ts tests/integration/runtime/standalone.test.ts tests/integration/runtime/server-start.test.ts tests/integration/sharing/production-http.test.ts --maxWorkers=2` | 4文件、35项通过，包含旧CI失败的两个文件  |
| `ARISO_BUILD_VERSION=v0.0.0-image-editor-pr.3 ARISO_BUILD_REVISION=1a2bcfd8b63187f8364a411870911cb2d57bb00b pnpm run build`                                                                                                                         | 通过，standalone原生绑定校验通过         |

`pnpm run lint`、`pnpm run format:check`及`git diff --check`最终通过。测试harness初检违反Hooks命名/不可变性约定，已按仓库既有的组件回调加外部render模式修正，未关闭规则。

`EGO_TASK_SPACE=5 BROWSER_REPORT_DIR=/tmp/ariso-pr301-fix-browser node scripts/verify-browser.mjs --suite image-editor`最终退出0：**19组行为、48组布局**通过，浏览器错误为空。新增真实检查覆盖自身退出、后退、跨页及当前图库项的取消/放弃、配方和焦点保留、模板/批量视图的真实刷新警告，以及受理副本可离开且任务不受影响。源图已恢复、5个复制结果及夹具清理完成、临时应用移除，测试空间5已关闭。

[行为与布局报告](./browser/image-editor.json)、[运行器清理](./browser/runner.json)、[桌面离开确认](./browser/image-editor-leave-confirm-desktop.png)、[手机离开确认](./browser/image-editor-leave-confirm-mobile.png)。看图复核最新桌面和390×480短屏，画布、参数、保存区继续符合已批准原型；新增确认沿用原有HeroUI弹窗，没有新的Figma节点或公共外壳改版。

此前完整集成213文件2228项属于原始独立PR提交；本轮复用其不受影响范围，以64项图片编辑和35项运行时/分享定向复核覆盖当前修改，不将历史全量结果冒充新head整套重跑。

## 独立复核

两位原评审Agent针对固定生产源码`1a2bcfd8`复核。[标准质量评审](./standard-final.md)和[严格维护性评审](./thermo-final.md)均给出Approve（代码层），原R1/R2/O1及补修发现均已关闭，没有新增Required。报告区分评审者实际运行与复用作者验证，最新作者验证见本记录；后续只有测试操作路径、harness命名、文档与证据修改，生产源码未变。

## CI与未验证边界

原提交的[CI](https://github.com/dnslin/ariso-next/actions/runs/40211665879)不是全绿：checks与Media tools通过；Production integration因原有logging测试的2秒请求超时及sharing测试未等齐异步日志失败。本轮没有更改这些无关模块或放宽断言；本机对应35项通过，后续以推送后的新CI结果为准。

未重跑真实R2/SeaweedFS、其他浏览器引擎、物理手机、跨架构容器或容量性能。未实测删除编码层后的具体提速比例。不支持Navigation API的引擎沿用项目现有边界，不声称已完成同文档后退的跨引擎实测。
