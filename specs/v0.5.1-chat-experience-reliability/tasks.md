# Tasks: AI Mind Chat Experience & Image Reliability

## Implemented Work

- [x] T001 新增桌面会话标题的溢出测量、悬浮/焦点延迟和单次滚动展示；移动端维持静态截断。
- [x] T002 为图片结果加入同源 IndexedDB Blob 缓存、30 条/100 MiB LRU、快照元数据恢复、下载复用与失效占位。
- [x] T003 将“本地缓存”说明收敛为 hover tooltip，并保留无障碍标签。
- [x] T004 将图像 workflow 的生成中和 Blob 读取中状态收敛为同一结果卡片流光占位，按 ImageBrief 预留画幅。
- [x] T005 对图像规划误拦截实施字面冲突复核；每个规划节点仅在瞬时错误时最多 3 次底层请求，并对可确认的 Provider 429/5xx 实施最多三次总尝试和取消感知退避。
- [x] T006 将服务端 registry、客户端 payload、本地索引和桌面/移动导航统一扩容至 50 条，添加第 51 条裁剪与旧 10 条索引兼容用例。
- [x] T008 在桌面侧栏与移动抽屉底部加入带中性用户头像的固定访客菜单与“GitHub 项目”项；完整地址仅 hover 展示，浏览器新开标签、Electron 复制链接并在顶部反馈（移动端关闭抽屉后展示），复用现有剪贴板回退。

## Verification

- [x] T007 已运行 12 个定向 Vitest 文件（94 项测试）、`pnpm --dir apps/webapp lint`、`pnpm --dir apps/webapp typecheck` 与 `git diff --check`，结果通过并记录到 [acceptance.md](./acceptance.md)。
- [x] T009 已重新运行 3 个直接相关的 Vitest 文件（27 项测试），覆盖桌面/移动访客菜单、顶部提示和消息复制回归；`pnpm --dir apps/webapp lint`（0 error / 8 existing warnings）、`pnpm --dir apps/webapp typecheck` 与 `git diff --check` 通过。
- [x] T010 已完成提交前本地 CI 等价验证：frozen install、workspace/lint/typecheck/test-lanes、stable（153 files / 1034 tests）、隔离 PostgreSQL integration、Windows 桌面打包与产物校验，以及 3 个 Linux/amd64 Docker build target 均通过；远端 macOS arm64 job 待提交后执行。
- [x] T011 已将根目录、webapp、desktop、project-assistant-service、database 与 stream-core 的 package version 锁步更新为 `0.5.1`；同步更新桌面运行时版本提示、README 当前候选说明与 desktop public preview 默认 tag。保留 `0.5.0` 的最低兼容版本和已发布 Beta 历史记录。
