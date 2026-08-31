# Quickstart: Long Message Virtualization

本文件用于 v0.5.3 实现与验收。当前规格阶段只确认命令和证据格式；只有实现完成并实际运行后，才能在 `acceptance.md` 标记 Passed。

## 1. Confirm workspace and feature pointer

```powershell
git status --short --branch
Get-Content -Raw .specify\feature.json
```

预期：

- branch 为 `codex/v0.5.3-message-virtualization`；
- feature directory 为 `specs/v0.5.3-message-virtualization`；
- 开始实现前不存在与本版无关的未解释改动。

## 2. Install only the free package

```powershell
pnpm --filter @ai-mind/webapp add react-virtuoso@4.18.12
```

检查 `apps/webapp/package.json` 与 `pnpm-lock.yaml`：必须出现 `react-virtuoso@4.18.12`，不得出现 `@virtuoso.dev/message-list`、`VirtuosoMessageListLicense` 或 license key 配置。

## 3. TDD order

先运行新增/修改后的定向测试并确认新断言在实现前失败：

```powershell
pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/components/chat/message-list/chat-message-list.test.tsx tests/components/instamind/use-chat-scroll-policy.test.tsx tests/app/instant-mind/page.test.ts
```

测试侧 mock `react-virtuoso` 的 callbacks/handle；生产代码不得增加 test mode、fixture branch 或 hidden flag。

## 4. Targeted verification

实现每个 Step 后至少运行：

```powershell
pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/components/chat/message-list/chat-message-list.test.tsx tests/components/instamind/use-chat-scroll-policy.test.tsx tests/app/instant-mind/page.test.ts
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
git diff --check
```

最终回归：

```powershell
pnpm test:stable
```

## 5. Prepare the 1,000-message acceptance fixture

使用 implementation test fixture 生成 1,000 条稳定 ID 的交替 user/assistant 消息，至少循环覆盖：

- 短/长 Markdown 段落与列表；
- fenced code block；
- 有尺寸和延迟完成两类图片；
- reasoning；
- tool、resource、skill、prompt、workflow 卡片；
- Agent Trace 主详情和 debug；
- native `<details>`；
- 最新 assistant 消息持续流式增长。

Fixture 必须位于测试/本地验收侧，不能通过生产 route、环境开关或 runtime provider 暴露。真实浏览器验收可以使用 disposable 本地会话导入同一 fixture；不要污染用户正式会话数据。

如需直接运行已实现的 standalone fixture，在仓库根目录执行：

```powershell
pnpm --dir apps/webapp exec vite --config tests/fixtures/message-virtualization.vite.config.ts
```

然后在 Chrome 打开 `http://127.0.0.1:4173/message-virtualization.html`。该页面默认装载 1,000 条消息，右上角可控制“开始流式增长”“模拟新一轮”和 Composer 高度；用 `Ctrl+C` 停止本地 fixture 服务。

### Run the real-page IndexedDB fixture

该路径用于最终 Chrome 验收，不会修改 production bundle 或服务端数据。它只覆盖 read-only history、图片 cache hydration、completed Agent Trace 和虚拟滚动；延迟图片、流式增长与 Composer toggle 继续使用上面的 standalone harness。

1. 启动本地应用并在 Chrome 打开 `http://localhost:3000/instant-mind`。新建普通会话，发送且仅发送 `1000条测试数据`，等待该会话完成；它同时成为服务端 registry 可识别的测试会话标题。
2. 保持这个会话为当前选中状态，优先在同一页面的 DevTools Console 粘贴并运行 `apps/webapp/tests/fixtures/message-virtualization-indexeddb-seed.devtools.js`；这是唯一会执行 donor preflight、图片 cache 复制、backup 与 cleanup 的完整路径。若 Console 不可用，在开发服务器打开 `http://localhost:3000/dev/message-virtualization`；该页读取当前选中的“1000条测试数据”会话并一次性写入确定性的混合 fixture snapshot，完成后自动回到聊天页。该 fallback 不复制 donor、图片 Blob，也不建立 cleanup backup；两种路径都不输出原会话正文、标题或 ID。
3. 直接刷新，无需 Request Blocking。预期当前会话标题仍为 `1000条测试数据`，并显示 1,000 条本地 snapshot 消息。
4. 完成桌面和 `324×534` 验收后，可在同一页面 Console 运行 `message-virtualization-indexeddb-cleanup.devtools.js` 恢复原 snapshot；若需保留本机 fixture 以便后续调优，可不执行 cleanup。4x slowdown 只作可选性能观察。cleanup 不删除服务端测试会话；如不再需要，可从 UI 手动删除它。

若 seed 报告没有可用的 image Blob 或 completed Agent Trace，不得改造生产数据或伪造 donor；保留 standalone harness 的对应证据，并在 acceptance 记录缺口。

## 6. Run the app

```powershell
pnpm --dir apps/webapp dev
```

在 Chrome 打开 `http://localhost:3000/instant-mind`，使用独立本地测试会话执行下列检查。

## 7. Browser acceptance

### Long history and DOM bound

1. 进入 1,000 条混合消息会话，确认首次可见内容直接处于真实末尾。
2. 在 DevTools Performance 中观察常规速度；`4x slowdown` 可按需作为性能诊断重复进入，不是当前版本收口条件。
3. 快速跨段上下滚动至少 20 次，覆盖鼠标滚轮、scrollbar drag 和移动触摸模拟。
4. 每次停止滚动 250ms 后，可在 Elements/Console 统计 Virtuoso 当前 item wrappers（可使用库生成的 `[data-item-index]`）；该数值用于诊断和后续调优。
5. 确认没有空白断层、重叠、重复/串位消息或无法继续滚动的停顿。

### Streaming policy

1. 位于末尾开始流式输出：Markdown 增长、延迟图片和卡片展开后仍保持最新内容可见。
2. 流式中使用 wheel/touch/PageUp/Home/Shift+Space 向上阅读：本轮不再抢回末尾。
3. 点击“回到底部”：近距离使用短平滑反馈，远距离即时返回；随后继续 follow。
4. 再次上滑并开始新一轮：新一轮恢复 follow。
5. 增高/缩短 Composer：末尾用户保持完整可见，上方 reader 不移动。

### Completed static reader — no reverse jump

1. 从尾部与索引约 975–987 的混合卡片区各轻微向上滚动 20 次；每次记录输入前、下一帧、250ms 和 500ms 的可见锚点，停止后不得向更新消息方向回跳。
2. 覆盖 IndexedDB 图片缓存命中、展开 Reasoning/Agent/Workflow、刷新后首次进入和原生滚动条拖拽；可同时记录 `[data-item-index]` 供后续调优。
3. 若仍复现，先在 DevTools 记录 `rangeChanged`、`totalListHeightChanged` 与图片 state 是否在回跳窗口变化；不要直接启用 `overflow-anchor: none`、扩大 buffer 或恢复手工 `scrollTop`。

### Disclosure state

分别展开 Reasoning、Agent Trace 主详情/debug、Workflow、Resource/Raw/Delivery details；滚动足够远让它们离开 `[data-item-index]` 挂载范围，再返回两次。重要展开状态必须保持，copy/hover 反馈允许重置。

### Compatibility

在桌面和 `324×534` 移动视口确认：

- message viewport 仍覆盖完整聊天列高度；
- document 本身不滚动；
- `scrollbar-gutter: stable both-edges` 生效；
- Composer 与消息列左右对齐，最后消息不被覆盖；
- 刷新后记录服务端初始 HTML、hydration、下一 animation frame 和历史 reveal：消息列与 Composer 列不得横向闪动；history bootstrap 只显示非滚动骨架，最终 reveal 前不得看到原生滚动条从长条突然收缩为短条或骨架滚离后的白屏；
- Composer 保持显示时，在长会话顶部、中段与末尾分别确认右侧 native scrollbar thumb 可见且可拖拽；底部渐变不得覆盖该 gutter；
- 在桌面 native scrollbar 环境确认消息视口 right edge 等于窗口可用右边界；Instant Mind 不得因根文档的 stable gutter 额外留出 15px；
- 快速切换两个历史会话：skeleton 与当前会话 reveal 前不得闪现“回到底部”按钮；reveal 后才继续验证其既有 120px 阈值行为；
- 在侧栏展开和收起两种桌面状态切换历史会话：骨架须与消息内容列、Composer 内容列同轴；在 `324×534` 视口中骨架保持移动端全宽对齐；
- Composer 外侧底部区域仍把滚动手势交给消息视口；
- empty suggestions、follow-up、copy/feedback/delete/regenerate、read-only/error/retry 均可用。

## 8. Evidence recording

将可获得的实际 pass counts、浏览器 viewport/DOM count、4x slowdown 观察、发现与修正写入 [acceptance.md](./acceptance.md)。D027 允许以产品负责人确认的手动行为结果完成本版本验收；缺少诊断数值不再使已确认的条目保持 Pending。
