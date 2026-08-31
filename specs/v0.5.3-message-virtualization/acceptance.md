# Acceptance Ledger: Long Message Virtualization

**Status**: IMPLEMENTATION_AND_PRODUCT_OWNER_BROWSER_ACCEPTANCE_PASSED; D027 将 CLS、DOM count、fixed iteration 与 4x CPU 观察降为非阻塞诊断。T038 的本地版本资产与 T099 的隔离数据库 integration lane 已通过；仅 release commit、tag、GitHub Release 与远端 CI 仍待显式授权。

## Baseline evidence

| Area                   | Evidence                                                                                                                                                             | Result |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Synced base            | `codex/v0.5.3-message-virtualization` created from `origin/main` at `2a15f45`                                                                                        | Passed |
| Clean starting point   | Worktree was clean before v0.5.3 specification changes                                                                                                               | Passed |
| Existing stable suite  | 2026-08-27 `pnpm test:stable`: governance 22 passed / 1 skipped; stream-core 30; desktop 103; project-assistant-service 8; webapp 1,052 tests                        | Passed |
| Feature implementation | Free `react-virtuoso@4.18.12`, single physical scroll owner, business Scroll Policy, dynamic-height virtualization and scoped disclosure persistence are implemented | Passed |

## Acceptance gates

| ID   | Requirement                                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                          | Status |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A531 | Only free `react-virtuoso@4.18.12` is added                | Manifest/lockfile contain exact `react-virtuoso@4.18.12`; production dependency scan has no `@virtuoso.dev/message-list`, license wrapper or license key                                                                                                                                                                                                                                                          | Passed |
| A532 | Every non-empty list uses Virtuoso                         | Adapter tests cover 1 and 1,000 messages; empty state remains outside Virtuoso                                                                                                                                                                                                                                                                                                                                    | Passed |
| A533 | DOM is bounded                                             | Real Chromium fixture: desktop max 15 and 324×534 max 13 `[data-item-index]` nodes across 20 cross-range scrolls, both below 50                                                                                                                                                                                                                                                                                   | Passed |
| A534 | Item identity is stable                                    | Stable `message.id` key and append/update/delete/offscreen roundtrip tests                                                                                                                                                                                                                                                                                                                                        | Passed |
| A535 | Message preparation is O(n)                                | Code inspection and test confirm one forward pass preserves nearest user composer mapping                                                                                                                                                                                                                                                                                                                         | Passed |
| A536 | Dynamic heights are correct                                | Real browser Markdown/code, delayed image (+65px), cards, disclosure and Composer resize evidence                                                                                                                                                                                                                                                                                                                 | Passed |
| A537 | Virtuoso is the sole physical scroll owner                 | Source scan finds no message `scrollTop`/`scrollHeight` positioning, window scroll or custom pixel tween; `followOutput={false}`; policy calls only list handle                                                                                                                                                                                                                                                   | Passed |
| A538 | Pinned streaming follows                                   | Policy callback tests and real browser streaming remain within bottom threshold                                                                                                                                                                                                                                                                                                                                   | Passed |
| A539 | User upward reading locks current turn                     | Wheel/touch/keyboard/drag tests; browser delayed height change preserves reader `scrollTop` and visible range                                                                                                                                                                                                                                                                                                     | Passed |
| A540 | Manual return restores follow                              | Near smooth and far auto paths tested; browser button disables/hides at bottom                                                                                                                                                                                                                                                                                                                                    | Passed |
| A541 | Next turn resets lock                                      | Send, regenerate and resume regressions pass; browser new turn returns to tail                                                                                                                                                                                                                                                                                                                                    | Passed |
| A542 | Composer height policy remains correct                     | Footer inset tests; browser 76→180px Composer growth follows when pinned and preserves reader position when locked                                                                                                                                                                                                                                                                                                | Passed |
| A543 | History first reveal is tail-first and hidden              | Regression first reproduced the one-shot hidden state. Remediation now retries through the same Virtuoso handle, upgrades height-triggered forced retry, and gates reveal on generation-scoped bottom + tail range + current tail Item mount + non-scrolling for two stable frames. Real Chrome normal-speed refresh, manual return and reader-away behavior passed; D027 makes 4x CPU a non-blocking diagnostic. | Passed |
| A544 | Stale entry work is cancelled                              | Rapid A→B, retry, Item unmount and stale bottom/range/height/scrolling generation-cancellation tests pass                                                                                                                                                                                                                                                                                                         | Passed |
| A545 | Meaningful disclosure survives recycle                     | Reasoning, Agent main/debug, Workflow and native details survive two real offscreen roundtrips                                                                                                                                                                                                                                                                                                                    | Passed |
| A546 | Invalid disclosure state is isolated/pruned                | Conversation switch, message deletion and part replacement tests pass                                                                                                                                                                                                                                                                                                                                             | Passed |
| A547 | v0.5.2 layout remains compatible                           | Desktop/mobile geometry, gutter, Composer alignment/safe area and pointer pass-through verified in real browser                                                                                                                                                                                                                                                                                                   | Passed |
| A548 | Existing chat behavior does not regress                    | Empty state, message actions, streaming, hydration, session and recovery suites pass in full stable run                                                                                                                                                                                                                                                                                                           | Passed |
| A549 | Verification suite is clean                                | Targeted tests, typecheck, lint, root stable suite and `git diff --check` pass                                                                                                                                                                                                                                                                                                                                    | Passed |
| A550 | Real-page IndexedDB fixture is isolated                    | Test-only builder and DevTools seed/cleanup scripts preflight text/image/completed-Agent donors, exclude Agent Interrupt, construct 1,000 unique completed messages and reuse one fixture image cache. 用户确认真实 Chrome fixture 回归通过；本机 fixture 按验收需要保留，cleanup 不再是收口前置条件。                                                                                                            | Passed |
| A551 | Static reader geometry does not create a reverse jump      | Image state structure and structured per-item estimates are covered by targeted tests；用户确认桌面与移动静态轻微上滚、图片/详情、刷新和拖拽均无反向回跳。                                                                                                                                                                                                                                                        | Passed |
| A552 | Refresh keeps Composer and message column geometry aligned | Page regression proves every `ChatMessageList` first mount receives the committed external viewport; gutter sync is bound to that ref and includes a next-frame settle。用户确认桌面与移动刷新视觉回归通过。                                                                                                                                                                                                      | Passed |

## Product-owner browser acceptance — 2026-08-31 (D027)

产品负责人已确认以下四组手工浏览器回归通过：

| Scope                                                          | Confirmed outcome                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 静态长会话：`1000条测试数据` 与 `最长真实会话`，桌面与 324×534 | 跨段滚动、尾部/混合区轻微上滚、拖拽、刷新、展开详情往返均未观察到空白、重叠或反向回跳。 |
| 刷新视觉：桌面与移动                                           | 骨架居中；消息列与 Composer 不横移；滚动条可见、可拖动且无突变。                        |
| 高度提示 cold/warm：fixture 与最长真实会话，桌面与移动         | 两轮均保持正确展示和滚动行为；本次不把 CLS、命中率、DOM 峰值或固定次数作为通过条件。    |
| 普通文本流式输出                                               | 停留尾部时持续跟随；主动上滑阅读历史后不被自动拉回。                                    |

本节是当前收口事实。下文标有 `Historical`、`Pending` 或旧数值门槛的记录保留用于追溯当时的发现与测试条件，但均受 D027 覆盖：它们不再构成 release blocker，也不得被解释为未通过。D027 不改变物理滚动单一所有权、`followOutput={false}`、禁止手工消息 `scrollTop`、有界渲染和静态阅读不得自动回底等正确性约束。T038 的版本锁步和公开资料已完成；commit、tag 或发布仍不在本次授权范围内。

## Automated evidence

| Command / suite                                                                   | Actual result                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat-message-list.test.tsx` + `use-chat-scroll-policy.test.tsx` + `page.test.ts` | 3 files, 42 tests passed                                                                                                                                                                                              |
| Relevant hydration/session/streaming and message-part regressions                 | Included in full stable run; all passed                                                                                                                                                                               |
| `pnpm --dir apps/webapp typecheck`                                                | Passed, 0 errors                                                                                                                                                                                                      |
| `pnpm --dir apps/webapp lint`                                                     | Passed, 0 errors and 8 pre-existing warnings (`layout`, `image-result-part`, shadcn component exports)                                                                                                                |
| `pnpm test:stable`                                                                | Governance 22 passed / 1 skipped; stream-core 30; desktop 103; project-assistant-service 8; webapp 153 files / 1,068 tests; Turbo 6/6 tasks successful                                                                |
| `git diff --check`                                                                | Passed                                                                                                                                                                                                                |
| Scroll-owner source scan                                                          | Only lifecycle/reveal `requestAnimationFrame` calls remain; no raw message pixel positioning; Virtuoso `followOutput` is explicitly false                                                                             |
| `message-virtualization-indexeddb-fixture.test.ts`                                | 5 tests passed: largest snapshot choice, missing donor abort, exact count and unique IDs, Agent Interrupt exclusion, single cache and cleanup scope                                                                   |
| DevTools Snippet syntax                                                           | `node --check` passed for the seed and cleanup snippets                                                                                                                                                               |
| T047 current regression set                                                       | `message-virtualization-indexeddb-fixture.test.ts` + message list + scroll policy + page: 4 files / 47 tests passed                                                                                                   |
| T047 current static checks                                                        | `pnpm --dir apps/webapp typecheck`, `pnpm --dir apps/webapp lint`, Prettier check and `git diff --check` all passed                                                                                                   |
| T059/T060 external-parent regression                                              | `pnpm --dir apps/webapp exec vitest run tests/app/instant-mind/page.test.ts`: 1 file / 7 tests passed. The new red assertion failed before the fix because the first message-list call received `scrollParent: null`. |

## Browser evidence

### 1,000-message fixture

- Fixture composition: 1,000 stable-key mixed-height messages covering long Markdown/code, Reasoning, Agent, Workflow, Tool/Resource native details and delayed image content.
- Desktop 1280×720: initial tail mounted indices 991–999 (9 nodes); 20 rapid cross-range scrolls reached indices 0–999 with a maximum of 15 mounted item roots.
- Mobile 324×534: initial tail mounted indices 993–999 (7 nodes); 20 rapid cross-range scrolls reached the full range with a maximum of 13 mounted item roots.
- Every 250ms settle sample reported 0 blank gaps and 0 overlaps; no visible cross-range jump was observed. Document height stayed equal to viewport height, so the message viewport remained the only page scroll surface.

### Real-page IndexedDB fixture (Google Chrome)

- **Historical pre-D027 record (superseded).** 原记录要求自动化工作将 fixture 写入用户浏览器并采集桌面 / 324×534 / 4x 的数值。现在 T048 已由产品负责人确认的真实 Chrome fixture 回归通过；本机 fixture 按验收需要保留，cleanup 不是收口前置条件，4x 与数值采样均仅作诊断。
- The standalone Vite harness remains the evidence source for delayed-image, sustained-streaming and Composer-height scenarios; those cases are intentionally not created through the read-only IndexedDB snapshot.

### Historical entry

- Final normal-speed sampling first observed the new page's `positioned=false`, then accepted only its own false→true transition. All 10/10 reveals mounted tail indices 7–13 (7 nodes) immediately and still had the same tail window 350ms later.
- After three PageUp operations the return button became visible/enabled; refreshing from that reader-away state again followed a valid false→true entry cycle and recovered to indices 7–13 with the button hidden/disabled.
- Reveal waited for same-generation bottom, tail range, current tail Item mount, non-scrolling and two stable animation frames. Height change can upgrade an already queued retry and restart reveal without requiring duplicate library callbacks.
- Rapid A→B, retry, unmount and stale bottom/range/height/scrolling observations are covered by generation-scoped automated tests.
- 4x CPU slowdown: **Historical diagnostic, not collected as a release gate.** 所选 Codex in-app Chromium 当时不提供 CPU throttling；该限制不再阻塞本版本收口。

### Dynamic height and Scroll Policy

- Markdown/code and linear streaming growth stayed pinned at the tail while follow policy was enabled.
- Delayed image at item 987 increased the measured list height by 65px after load; a reader above the tail retained the same `scrollTop` and visible range.
- Tool/Resource cards and disclosure expansion were remeasured without blank or overlap artifacts.
- User upward lock preserved the observed reader position while list height grew; a new turn reset the lock and returned to the last item.
- Far manual return used immediate positioning and reached `bottomDistance = 0`; near return used the smooth path and settled at bottom before disabling the return button.
- Composer growth from 76px to 180px preserved tail clearance when pinned; while reading, the same resize kept the viewport position unchanged.

### Disclosure and compatibility

- Reasoning, Workflow, Agent main/debug and native Resource details remained expanded after two complete offscreen unmount/remount roundtrips.
- Formal `/instant-mind` desktop geometry: message and Composer content aligned at left 331/right 1187 with stable gutter and no document scroll.
- Formal 324×534 geometry: both aligned at left 16/right 278; Composer bottom was 518px, safe area remained intact and the document did not scroll.
- A native touch/scroll gesture through the Composer-side bottom gutter moved the message viewport from `scrollTop 0` to `400`, confirming pointer pass-through outside the Composer surface.
- Native Ctrl+F remains limited to the currently rendered virtual region, as documented in the version non-goals.

## Final Step Audit

### Audit 结论

状态：PASS_WITH_NOTES

一句话结论（历史审计快照，受 D027 覆盖）：实现边界、代码质量和自动化验证已通过，审计发现的旧会话 Scroll Policy 状态泄漏已按 TDD 修复；当时建议进入 T031/T033 最终手工浏览器验收。该手工验收现已由产品负责人确认通过；4x CPU 不再是 release gate。

### 1. Step 目标匹配度

已完成：免费 `react-virtuoso` 单一路径、Virtuoso 单一物理滚动 owner、AI Mind Scroll Policy、动态高度、历史隐藏揭示、disclosure 回收保持、测试 fixture、自动化和 Chromium 预验证。审计期间补充了 conversation cancel 对 follow timer、programmatic marker、scroll observations 与返回按钮状态的完整清理。

未完成（历史快照）：T031 的 Google Chrome 桌面/移动 20 次最终复核，以及 T033 的真实 4x CPU slowdown 历史首次揭示。D027 已将前者记为产品负责人通过、后者降为非阻塞诊断。

存疑点：当前 Codex browser control 不提供 CPU throttling；正常速度 Chromium 通过不能替代该门槛。实现期间已获得独立 reviewer 的时序风险报告并逐项修复；最终复审重试因 reviewer 使用额度耗尽未返回新结论，仍以本账本中的定向测试、类型检查与真实 Chrome 证据为准。

### 2. 人工 Review 路线

建议查看顺序：

1. `apps/webapp/components/chat/message-list/chat-message-list.tsx`
    - 主要做了什么：它把完整 `MindMessage[]` 线性整理成 Virtuoso entries，并把所有实际到底命令交给 `VirtuosoHandle`。
    - 为什么要看：这是免费依赖、动态测量、有界 DOM 与 single scroll owner 的核心边界。
    - 重点确认：stable `message.id`、`customScrollParent`、`followOutput={false}`、Footer inset、buffers 和最小 imperative handle。
    - 风险信号：出现手工 slice window、像素 scroll API、第二个 follow 策略或不稳定 item key。

2. `apps/webapp/components/instamind/use-chat-scroll-policy.ts`
    - 主要做了什么：它只保存跟随/锁定/返回/历史 readiness 等业务状态，并通过 list handle 发出 `auto` 或 `smooth` 意图。
    - 为什么要看：这里决定用户上滑后是否会被抢回，以及旧会话状态能否污染新会话。
    - 重点确认：64ms 合并、用户向上意图、near/far 判断、Composer resize、全部 observation 的 generation scope、forced retry 合并和双帧 reveal。
    - 风险信号：重新读取 `scrollTop`/`scrollHeight`、自定义像素动画，或 conversation cancel 留下 timer/ref/UI 状态。

3. `apps/webapp/components/instamind/instantmind-page.tsx`
    - 主要做了什么：它保留 v0.5.2 的唯一全高视口与浮动 Composer，并协调 scroll parent、inset、history sequence 和隐藏揭示。
    - 为什么要看：这是 hydration/session 状态与虚拟列表接线的入口，也是 A→B stale cancellation 的页面边界。
    - 重点确认：目标 ownership、scrollbar width commit、下一 rAF reveal、Composer alignment 和 pointer pass-through。
    - 风险信号：旧 `messageContentRef` 回归、可见后像素纠正、文档窗口滚动或旧 sequence 揭示新会话。

4. `apps/webapp/components/chat/message-list/message-disclosure-provider.tsx` 与 `message-disclosure-state.tsx`
    - 主要做了什么：它们把重要展开选择保存在 message-list scope，并按 conversation/message/part key 隔离和 prune。
    - 为什么要看：虚拟卸载会销毁 item 组件，本模块决定哪些状态必须跨回收保留。
    - 重点确认：默认开闭语义、有效 key 集、会话 remount、删除/替换 prune，以及没有 localStorage/global store。
    - 风险信号：copy/hover 等瞬态状态被提升、key 只用 index，或旧会话状态可被新 scope 读取。

5. `apps/webapp/components/chat/message-list/messages/assistant-message.tsx` 与相关 part panels
    - 主要做了什么：它们把 Reasoning、Agent、Workflow、Tool/Resource 和 Delivery 的 disclosure 接到统一受控状态，同时保留现有 ARIA 和内容渲染。
    - 为什么要看：这是虚拟化最容易引发交互回归和 Agent debug 泄露变化的展示面。
    - 重点确认：`aria-expanded`/`details open`、稳定 part identity、nested toggle 处理和既有默认状态。
    - 风险信号：AgentTrace 显示范围扩大、raw runtime 数据新增、Resource/Tool 卡片语义变化或展开状态串位。

6. `apps/webapp/tests/components/instamind/use-chat-scroll-policy.test.tsx`、`chat-message-list.test.tsx` 与 `tests/fixtures/message-virtualization-*`
    - 主要做了什么：它们用测试侧 Virtuoso fake 固化策略契约，并用 1,000 条真实浏览器 fixture 验证几何、DOM 和动态高度。
    - 为什么要看：jsdom 无法证明 ResizeObserver 和真实滚动几何，两个证据层必须同时成立。
    - 重点确认：测试不向生产代码注入 test mode、conversation reset red/green、两次离屏往返和节点上限采样。
    - 风险信号：只测 mock 不测浏览器、通过生产 flag 暴露 fixture，或用估算高度掩盖空白/跳变。

### 3. 关键代码讲解

本 Step 的核心实现链路：

1. 入口 / 触发：`InstantMindPage` 把稳定的 message viewport HTMLElement、Composer 实测 inset 和当前消息交给 `ChatMessageList`。
2. Runtime / 状态流转：`useChatScrollPolicy` 接收 Virtuoso 的 bottom/range/height/scrolling observations，结合用户意图和当前 turn lock，决定是否调用 `scrollToEnd`；它不参与测量或像素定位。
3. Tool / Resource / Prompt / Stream 相关变化：协议、Runtime 和 DTO 均未改变；Tool/Resource/Prompt/Agent parts 只改变 UI disclosure state 的所有权。
4. 前端展示 / UI 聚合：`ChatMessageList` 用稳定 key 和真实动态测量渲染有限 item window，Footer 表达 Composer + 54px 安全区，provider 保留重要离屏状态。
5. 测试与验证链路：先用 Virtuoso fake 验证配置与 policy，再用 1,000 条 fixture 验证真实 DOM/ResizeObserver/滚动几何，最后跑全仓稳定套件。

重点文件说明：

- `chat-message-list.tsx`
    - 作用：Virtuoso adapter 与消息渲染入口。
    - 关键实现：O(n) entries、stable keys、external scroller、Footer、normalized callbacks、minimal handle。
    - 和本 Step 的关系：承担 DOM 优化和唯一物理滚动执行边界。
    - 需要注意的风险：未来升级 Virtuoso 时要重新验证 external scroller、offset 与 dynamic measurement 行为。

- `use-chat-scroll-policy.ts`
    - 作用：承载业务跟随策略和会话 entry readiness。
    - 关键实现：follow lock、64ms coalescing、user intent、near/far return、generation-scoped observations、forced retry intent 和双帧 readiness revision。
    - 和本 Step 的关系：防止 Virtuoso 内置策略与旧手工滚动同时争夺控制权。
    - 需要注意的风险：smooth/programmatic callback 时序和 4x CPU 下首次揭示仍需最终手测。

- `message-disclosure-provider.tsx`
    - 作用：保存虚拟卸载后仍有阅读意义的展开状态。
    - 关键实现：scope remount、valid key prune、controlled state setter。
    - 和本 Step 的关系：保证长列表回收不破坏阅读上下文。
    - 需要注意的风险：后续新增 part 类型时必须同步有效 key 构建与测试。

### 4. 越界与范围控制

是否越界：未发现；改动限定在 webapp 消息区、测试 fixture 与 canonical spec workspace。

是否违反 Non-goals：未发现；无 pagination、API/DB/stream、Runtime、Electron IPC、跨刷新位置或全局 disclosure store。

是否提前实现后续 Step：未发现；T038/T039 的 version bump、公开文档、commit/tag/release 均保持 deferred。

### 5. 代码质量与架构分层

结构设计：Virtuoso adapter、业务 Scroll Policy 和 disclosure provider 职责分离，React 组件遵循现有模块结构。

类型与边界：公开 handle 只暴露 `scrollToEnd('auto' | 'smooth')`，不泄漏 Virtuoso instance 或 DOM metrics；没有 server-only import。

错误处理：空消息命令安全 no-op，旧 entry generation 可取消，消息/part 删除会 prune disclosure。

可维护性：关键 callback 稳定、测试覆盖充分；provider 拆分消除了新增 Fast Refresh warning。未发现仅为测试存在的生产分支。

### 6. 功能与回归风险

新增风险：Virtuoso 升级、浏览器 ResizeObserver 时序和极端 CPU slowdown 可能影响首帧 readiness；当前通过精确依赖锁和隐藏 reveal 限制风险。

可能影响的旧链路：普通聊天、hydration/read-only/retry、follow-up、copy/feedback/delete/regenerate、Tool/Resource/Prompt/Agent 展示；全量 stable suite 均通过。

需要重点手测的地方：Google Chrome 桌面/324×534 的 20 次跨段滚动，以及 DevTools 4x CPU slowdown 下历史首次揭示与快速 A→B。

### 7. AI / Agent 专项检查

资源边界：未改变 Resource URI、访问或 Runtime 边界，仅保留 Resource details 的 UI open state。

工具作用域：未新增或扩大 Tool；普通 Tool Calling 使用现有消息 part。

模型输出约束：无模型调用、prompt 或 schema 变化。

AgentTracePanel / Stream 展示：仅把既有 main/debug 折叠状态受控化；没有新增 raw GraphState、checkpoint、prompt 或 tool output 暴露，stream protocol 未变。

### 8. 测试与验证

已执行：核心 3 files / 42 tests；root typecheck；webapp lint 0 error / 8 baseline warnings；root stable governance 22/1 skipped、stream-core 30、desktop 103、service 8、webapp 153 files / 1,068 tests、Turbo 6/6；`git diff --check`；Chromium desktop/mobile/dynamic/disclosure/layout smoke；Google Chrome 最终实现正常速度 10 次有效 false→true 刷新、离尾、手动返回与 console smoke。

未执行（历史快照）：Google Chrome T031 桌面/移动各 20 次跨段滚动最终复核；真实 4x CPU slowdown。D027 后，前者已由产品负责人手工验收通过，后者保留为可选诊断。

建议补充（可选）：按 `quickstart.md` 在 Chrome DevTools 继续采集 T031/T033 的截图、采样和首次可见帧，用于后续性能优化；不影响本版本收口。

当前结论：A543 已 Passed；T031/T033 的行为验收已通过，4x 数值诊断不阻塞 T038/T039。T038/T039 只等待用户明确授权版本锁步与发布动作。

### 9. 下一步建议

是否可以进入下一 Step：产品功能验收已完成；可以在用户明确授权后进入 release closing。

进入 release closing 前仅需：取得用户对版本锁步、提交、tag / 发布资产同步的明确授权；4x CPU 可作为后续性能优化的可选观察。

## Static Reader Intent Remediation — 2026-08-29

### Root cause and scope

`atBottomThreshold=120` 允许列表在距离末尾 120px 内仍报告 `atBottom=true`。旧的 `lockForUserIntent` 在非流式会话直接返回，因此用户轻微 wheel up 后，已排队的 `totalListHeightChanged` follow 仍会在 64ms 后调用 `scrollToEnd('auto')`，把阅读位置拉回末尾。

修复只移除了该错误的 streaming guard：wheel/touch/key 的显式向上阅读意图现在总会清理 pending follow 并建立既有 turn lock。Virtuoso 配置、120px 按钮阈值、Footer、buffer 与物理滚动 owner 均未改变。

### Evidence

| Check             | Result                                                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T049 red          | `pnpm --dir apps/webapp exec vitest run tests/components/instamind/use-chat-scroll-policy.test.tsx`：新增 completed-conversation light-wheel 测试在旧实现失败，实际收到一次 `scrollToEnd('auto')`。                                           |
| T049/T050 green   | 同一命令在修复后通过：1 file / 22 tests passed。                                                                                                                                                                                              |
| Typecheck         | `pnpm --dir apps/webapp typecheck` passed。                                                                                                                                                                                                   |
| Targeted lint     | `pnpm --dir apps/webapp exec eslint components/instamind/use-chat-scroll-policy.ts tests/components/instamind/use-chat-scroll-policy.test.tsx` passed。                                                                                       |
| Diff integrity    | `git diff --check` passed。                                                                                                                                                                                                                   |
| Full webapp lint  | 已执行但未通过：`dev-message-virtualization-fixture.ts` 的 import sort 和 `dev-message-virtualization-fixture.test.ts` 的 Prettier 格式错误为本次范围外既有未提交文件；本次修复未修改它们。                                                   |
| Real Chrome smoke | 标题为“1000条测试数据”的会话正常加载在尾部窗口，观察到 11–12 个 `[data-item-index]` 节点。自动化 Chrome wheel / DOM scroll 受 `Input.synthesizeScrollGesture` 超时限制，未将其计为轻微 wheel 的浏览器验收；该精确序列由 T049 自动化回归覆盖。 |

### Remaining manual check

该历史检查项已由 D027 的静态长会话手工验收覆盖并确认通过：轻微上滚后等待、展开详情与动态高度变化均未观察到自动回跳。4x CPU 不再阻塞 release closing。

## Three-state Static Reader Remediation — 2026-08-29

### Policy correction

T049/T050 只让已捕获的向上输入取消 follow，仍保留了 static reader 在 `atBottom=true` 时由高度变化创建 follow 的错误规则。本次将 policy 明确拆为三个互斥区间：

1. pending history entry 只允许 entry retry 通过 Virtuoso handle 定位尾部；
2. streaming output 才允许 64ms follow、列表总高度与 Composer 高度对齐；
3. completed static reader 不得因 `atBottom`、`totalListHeightChanged`、Composer、图片、详情展开或流式结束残留发送 `scrollToEnd`。

manual return 和 new-turn reset 仍是显式用户动作；Virtuoso 继续是唯一物理滚动执行者。

### Red/green evidence

| Check                  | Result                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static list height red | 新增测试在旧逻辑失败：非流式且 `atBottom=true` 的 `totalListHeightChanged` 在 64ms 后调用一次 `scrollToEnd('auto')`。                                           |
| Static Composer red    | 新增测试在旧逻辑失败：static Composer 从 0 变为 120px 时调用一次 `scrollToEnd('auto')`。                                                                        |
| Stream-finish red      | 新增测试在旧逻辑失败：流式结束前排队的 follow 在静态态仍调用一次 `scrollToEnd('auto')`。                                                                        |
| Green                  | `pnpm --dir apps/webapp exec vitest run tests/components/instamind/use-chat-scroll-policy.test.tsx`：1 file / 25 tests passed。                                 |
| Chrome load smoke      | “1000条测试数据”会话重载后稳定位于尾部窗口，实际消息根节点 11。自动化浏览器的小幅滚动未能注入（Chrome input gesture 超时/键盘未移动该 region），故不计入 T054。 |

### Remaining manual check

T054 已由 D027 通过：在真实 Chrome 的“1000条测试数据”会话尾部，轻微上移、等待、展开详情或改变 Composer 高度后，位置保持且未自动回到尾部。

## Release-closing boundary (D027)

A543 已 Passed，T031 / T033 / T048 / T054 / T058 / T063 / T074 / T077 / T092 的产品行为验收均已通过。CLS、DOM count、固定测试次数、height-hint 命中率与 4x CPU 为非阻塞诊断，因此不再构成 release closing 前置条件。T038 已完成 package lockstep version、公共版本 / release / tasklist 文档和消息视口 architecture 同步；T099 已在独立 Docker PostgreSQL 完成 migration/runtime setup 并通过 integration lane。仅明确发布授权、release commit、tag、GitHub Release 与远端 CI 仍待执行。

## Static Long-Conversation Geometry Remediation — 2026-08-29

### Change boundary

本次不再改动 `useChatScrollPolicy`：completed static reader 仍不会因高度变化发出 `scrollToEnd`。修复只减少 Virtuoso 尚未测量异构卡片时的高度误差：图片 loading、ready、expired、error 全部保留 Header、比例预览和 Footer；列表在既有 O(n) 正向遍历中提供与 data 等长的 `heightEstimates`，并且仅响应 scroll parent 的宽度变化重算图片估值。未启用 `followOutput`、`defaultItemHeight`、`fixedItemHeight`、`skipAnimationFrameInResizeObserver`、测量持久化、额外 buffer 或任何 `scrollTop` 读写。

### Automated evidence

| Check                    | Result                                                                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T055 red                 | 旧实现中 loading 卡不存在 Footer，expired/error 未保留完整的等比例 Card 几何；`heightEstimates` prop 也不存在。新增断言均失败。                                                                                                                                                    |
| T055/T056 green          | `pnpm --dir apps/webapp exec vitest run tests/components/chat/message-list/chat-message-list.test.tsx tests/components/chat/message-list/parts/image-result-part.test.tsx`：2 files / 21 tests passed。覆盖图片四态结构、1,000 条估值长度/类型差异与 portrait/landscape 比例差异。 |
| Scroll Policy regression | `pnpm --dir apps/webapp exec vitest run tests/components/instamind/use-chat-scroll-policy.test.tsx`：1 file / 25 tests passed；static reader 不产生 follow command 的三态约束保持。                                                                                                |
| Typecheck                | `pnpm --dir apps/webapp typecheck` passed。                                                                                                                                                                                                                                        |
| Targeted lint            | 四个本次文件 0 errors；`image-result-part.tsx` 保留两个既有 warning（effect 依赖与 Fast Refresh export），本次未扩大其范围。                                                                                                                                                       |
| Diff integrity           | `git diff --check` passed。                                                                                                                                                                                                                                                        |

### Remaining real-Chrome gate (T058)

在“1000条测试数据”会话的桌面和 `324×534` 视口，分别从尾部及 975–987 混合卡片区执行 20 次轻微向上滚动。每次记录输入前、下一帧、250ms、500ms 的可见锚点/位置和 `[data-item-index]` 峰值；图片缓存命中、展开详情、刷新首次进入和滚动条拖拽都必须无向更新消息方向的回跳。若仍有回跳，先记录 `rangeChanged`、总高度和图片状态；仅在无 measurement event 仍移动时，才把 `overflow-anchor: none` 作为独立 A/B，不能直接启用或归因。

## Refresh Geometry and Bootstrap Visual Remediation — 2026-08-29

### Change boundary

本次没有修改 `useChatScrollPolicy`、Virtuoso buffer、`followOutput=false`、消息高度估算或任何 `scrollTop` 读写。先前以 `chatScrollbarWidth` React state 将服务端初始 `0px` gutter 在 hydration 后改成 Windows native 宽度，会让固定 Composer 与消息列在不同坐标系中渲染；改为 CSS `scrollbar-gutter: stable both-edges` 后，两者始终使用同一外层 `left/right` 坐标轴。

Virtuoso 仍会由估算高度转向真实 measurement，初期外层 scrollable wrapper 的总高度会收敛。为避免把原生 scrollbar thumb 的长→短变化暴露给用户，history hydration/entry positioning 时只隐藏 viewport scrollbar，列表继续挂载并由既有 entry state machine 定位；骨架移到 `chat-layout` 的非滚动同级层，避免尾部定位将骨架带离视口而出现白屏。

### Automated evidence

| Check                            | Result                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T060 red                         | 旧页面断言要求 `scrollbar-gutter: stable both-edges`、Composer `right-0` 与无 `--chat-scrollbar-width` CSS variable 时失败：实际仍为 `stable`，且 hydration 仍有 `15px` gutter state。                                                                                                                 |
| T060 green                       | `pnpm --dir apps/webapp exec vitest run tests/app/instant-mind/page.test.ts`：1 file / 7 tests passed，覆盖 CSS 双边 gutter、同轴 Composer 与非空列表只在外部 scroll parent 提交后挂载。                                                                                                               |
| T061 red                         | 新增 history-entry visual bootstrap 回归在旧实现失败：viewport 仍为 `overflow-y-auto`，没有布局同级骨架。                                                                                                                                                                                              |
| T061/T062 green                  | 同一命令通过：bootstrap 使用 `overflow-y-hidden`，骨架存在于 `chat-layout` 同级且非 viewport 子节点；定位完成后恢复 `overflow-y-auto` 并移除骨架。                                                                                                                                                     |
| Affected regression suite        | `pnpm --dir apps/webapp exec vitest run tests/app/instant-mind/page.test.ts tests/components/chat/message-list/chat-message-list.test.tsx tests/components/chat/message-list/parts/image-result-part.test.tsx tests/components/instamind/use-chat-scroll-policy.test.tsx`：4 files / 53 tests passed。 |
| Typecheck / targeted lint / diff | `pnpm --dir apps/webapp typecheck`、本次页面与测试文件 ESLint、`git diff --check` 均通过。                                                                                                                                                                                                             |

### Remaining real-Chrome gate (T063)

在真实 Google Chrome 的“1000条测试数据”会话，桌面与 `324×534` 分别连续刷新 10 次，并记录服务端初始 HTML、hydration、下一 animation frame 与 reveal 后截图。必须确认消息/Composer 不横向闪动、bootstrap 仅显示骨架、不出现 scrollbar thumb 长→短突变或白屏，并在 4x CPU slowdown 下重复。该浏览器证据尚未完成，因此不能把本段视觉验收标记为 Passed。

## Composer Mask and Native Scrollbar Visibility Remediation — 2026-08-29

### Root cause and change boundary

`stable both-edges` 已使消息列与 Composer 在 hydration 前后保持相同横向坐标，但 Composer shell 的全宽 `bg-gradient-to-t` 仍覆盖了外部视口右侧 gutter。故 thumb 位于末尾、落入 Composer 高度时不可见；滚到中段、thumb 离开覆盖区才出现。这不是 Virtuoso range、总高度或 Scroll Policy 造成的。

渐变现改为内容列加 4rem 水平留白的独立、非交互绝对装饰层；Composer 实际交互列位于其上。外层 shell 不再绘制背景，因此 native scrollbar 的右侧 gutter 始终未被覆盖。没有恢复 JS gutter state、改变 Virtuoso 或修改滚动命令。

### Automated evidence

| Check                            | Result                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| T064 red                         | `pnpm --dir apps/webapp exec vitest run tests/app/instant-mind/page.test.ts` 在旧结构失败：Composer shell 仍拥有全宽 `bg-gradient-to-t`。 |
| T064/T065 green                  | 同一命令：1 file / 7 tests passed；断言 shell 无全宽 gradient，受限 `chat-composer-gradient-mask` 存在且最大宽度为内容列加 4rem。         |
| Affected regression suite        | 页面、Virtuoso、高度估算与 Scroll Policy：4 files / 53 tests passed。                                                                     |
| Typecheck / targeted lint / diff | `pnpm --dir apps/webapp typecheck`、本次页面与测试文件 ESLint、`git diff --check` 均通过。                                                |

### Remaining real-Chrome gate

在桌面“1000条测试数据”会话的顶部、中段、末尾各停留一次，Composer 保持显示；确认 native scrollbar thumb 全程可见并可拖拽。该手测与 T063 合并执行，尚未记为 Passed。

## Conversation-switch Scroll Control Remediation — 2026-08-29

### Root cause and change boundary

切换历史会话时，页面先进入 skeleton / hidden history positioning，而 Scroll Policy 的上一会话 `showScrollToBottom` observation 可能晚一个 render 才清除。原页面直接以该 observation 渲染按钮，所以新的内容尚未出现时会短暂显示下箭头，随后才消失。

页面现在只在当前 `isHistoryPresentationRevealed=true` 时挂载入口；其余时间完全不渲染。reveal 后仍复用同一 Policy 值，因此没有改变 120px 阈值、用户点击、follow lock 或 Virtuoso 的唯一滚动所有权。

### Automated evidence

| Check           | Result                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| T066 red        | `pnpm --dir apps/webapp exec vitest run tests/app/instant-mind/page.test.ts` 在旧实现失败：history skeleton 阶段仍能查询到“回到底部”按钮。 |
| T066/T067 green | 同一命令：1 file / 7 tests passed；加载/定位阶段无按钮，history reveal 后在 Policy 为 true 时恢复按钮。                                    |

## History Skeleton Horizontal Alignment Remediation — 2026-08-29

### Root cause and change boundary

为防止尾部定位把骨架滚离，骨架已移为 `chat-layout` 的绝对同级层；但 desktop 的 `chat-layout` 仍通过 padding 让消息视口位于会话侧栏右侧。骨架继续使用整页 `inset-x-0` 时会按页面而非聊天区域居中，造成它与消息列和 Composer 明显左偏。

骨架层现在在 `lg` 断点使用 `left: var(--conversation-sidebar-width)`，右侧保持聊天区域末端，内部 max-width 列不变；移动端继续从 `left: 0` 开始。没有改变 Virtuoso、history-entry command 或 Scroll Policy。

### Automated evidence

| Check           | Result                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T068 red        | `pnpm --dir apps/webapp exec vitest run tests/app/instant-mind/page.test.ts` 在旧结构失败：`conversation-entry-layout-skeleton` 缺少 desktop sidebar 左边界。 |
| T068/T069 green | 同一命令：1 file / 7 tests passed；断言骨架在 desktop 复用 `lg:left-[var(--conversation-sidebar-width)]`，且仍在 scroll viewport 外。                         |

## Root Document Gutter Remediation — 2026-08-29

### Root cause and change boundary

本地浏览器的实测几何为：窗口 `1280px`，根 `html` 的 stable gutter 使 `main` 与 `chat-message-viewport` 均在 `1265px` 结束。Instant Mind 自己已拥有独立 scrollbar，故这额外 15px 只会让 scrollbar 视觉上离最右侧留白；它不是 `react-virtuoso`、`both-edges` 或 Composer 遮罩问题。

全局 root gutter 保留给普通文档页。Instant Mind 的 SSR main 增加稳定 `data-slot`，全局 CSS 仅在该页匹配时将 root gutter 设为 `auto`；消息视口保留 `stable both-edges`，所以 Composer 与消息列的首帧对齐策略不变。

### Evidence

| Check                   | Result                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T070 red                | 页面测试在旧实现失败：`main` 没有 Instant Mind 专用 data slot，无法安全地只在该页覆写 root gutter。                                                                    |
| T070/T071 green         | `pnpm --dir apps/webapp exec vitest run tests/app/instant-mind/page.test.ts`：1 file / 7 tests passed。                                                                |
| Browser geometry before | In-app Chromium：`innerWidth=1280`、`main.right=1265`、`viewport.right=1265`、`html.scrollbarGutter=stable`。                                                          |
| Browser geometry after  | 同一环境 reload 后：`main.right=1280`、`viewport.right=1280`、`html.scrollbarGutter=auto`；viewport 仍为 `stable both-edges`，`offsetWidth=1012` / `clientWidth=982`。 |

## CLS Scroll-time Attribution — 2026-08-29

### Scope and fixture integrity

用户报告刷新和会话切换的 CLS 为 `0`，只有静态滚动与流式输出时 CLS 显著升高。归因采样先在真实 Google Chrome 本地 `http://localhost:3000/instant-mind` 执行，不修改 Scroll Policy、Virtuoso 配置或生产代码。

开始时，标题为“1000条测试数据”的会话实际只恢复了 `0–119` 共 120 条消息，不能作为长会话证据。通过既有 development-only `/instant-mind/v053-seed` 重写该专用测试会话后，尾部窗口恢复为 `989–999`，共 11 个已挂载 item；未读取、修改其他会话内容。

### Static-scroll evidence

| Sequence                    | Observed Virtuoso range          |          `scrollHeight` | Result                                                                                                                                                                                      |
| --------------------------- | -------------------------------- | ----------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 尾部，轻微上滚 `-96px`      | `989–999`，11 items              | `191,293px → 191,293px` | 0/250/500ms 均稳定；仅 scroll position 变化。                                                                                                                                               |
| 从尾部跨段上滚              | `987–999 → 856–869`，13/14 items | `191,293px → 195,742px` | 新 range 挂载期间总高度立即增加 `4,449px`。                                                                                                                                                 |
| 混合区请求轻微上滚 `-260px` | `856–869 → 851–864`，均 14 items | `195,742px → 196,014px` | 新挂载的 `851–855` 进入窗口时立即增加 `272px`；250/500ms 后不再继续变化。该次远程 scroll gesture 的实际 `scrollTop` 只减少 `92px`，但 range 已跨过 5 个 item，说明 size tree 正在同步校正。 |

该证据证明：静态阅读回跳/CLS 的候选主链是“滚动使离屏异构 item 挂载，真实 measurement 覆盖 estimate，进而改变 Virtuoso total height”，不是刷新、会话切换、根 gutter 或 static Scroll Policy 排队 follow。最后一句仍是归因假设，不把它记为已经完成的根因修复。

### Static `LayoutShift` source evidence

用户在同一 Chrome 页面安装的 `PerformanceObserver` 已先过滤 `hadRecentInput=true`，随后导出 63 条静态滚动期间的记录。各 entry 的 `value` 简单累加为 `1.7439`；这不是 Web Vitals 最终 CLS（最终值按 session window 取最大值），但足以解释面板中约 `1.57` 的高分数。

最密集的一段发生在 `106,532–110,095ms`：42 条 entry 在 3.563 秒内产生，简单累加为 `1.2148`。更关键的是，记录中反复出现相隔 1ms、数值相同、位移完全反向的成对事件：`106820/106821`、`107329/107330`、`739797/739798`、`882874/882875`、`896154/896155`。

| Pair            | Direct source observation                                                                                                                                  | Attribution                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `882874/882875` | `data-item-index=874`、`875`、`876` 与 `877` 先整体下移 `85.59375px`，下一毫秒又精确上移 `85.59375px`。                                                    | 这是一次可见的“向新消息方向回跳后又恢复”，不是单向滚轮位移。 |
| `739797/739798` | `892`、`893`、`895` 也发生同样的 `+85.59375px → -85.59375px` 成对平移。                                                                                    | 该现象跨越不同混合卡片区，非单一消息数据损坏。               |
| 边缘 item       | 首个/末个可见 item 的矩形高度随 pair 改变，但其 `y=0` 或 `bottom=1215`，属于视口裁切面积随整体平移变化，不能据此归咎某个 Resource/Agent 卡片自身高度抖动。 | 根因应查虚拟容器的布局偏移，而不是固定某一业务卡片高度。     |

已知 DOM 几何中，Virtuoso 将当前 range 放在绝对定位容器内，并通过很大的 `padding-top` spacer 表示前置离屏项目。结合上表与静态几何采样，根因已经收敛为：**离屏 item 进入 range 后，Virtuoso 的 size tree / spacer 校正发生了前后两次可见布局提交，令当前可见窗口整体先平移再反向平移。** 这与用户感知的“轻微向上滚动后回滚”一致。

该结论排除以下方向作为主因：刷新或会话切换（用户实测 CLS 为 0）、静态 Scroll Policy follow 命令（静态 reader 不发 follow）、根 document gutter、以及原生 scrollbar 外观。`heightEstimates` 误差、具体 measurement 时序、CSS scroll anchoring 是否参与第二次反向提交仍需以 A/B 验证；当前 trace 不足以在三者中唯一归因。因此不得直接扩大 buffer、关闭虚拟化、恢复手工 `scrollTop` 或把问题归为单个卡片。

### Remaining attribution evidence

流式输出的同类 trace 尚未完成：Chrome 对 standalone Vite harness 的 `localhost:4173` 和 `localhost:3001` 返回 `ERR_BLOCKED_BY_CLIENT`，因此不能把静态结论外推为流式根因。下一次诊断应在同一真实 Chrome DevTools trace 对齐 `rangeChanged`、`totalListHeightChanged`、Virtuoso measurement debug 与 token flush；诊断仅使用 DevTools / test-side harness，不增加 production test mode，也不会恢复手工 `scrollTop`。

### Static A/B attribution — 2026-08-30

本轮在真实 Chrome 的同一 “1000条测试数据” 会话上临时记录 Layout Shift、`rangeChanged`、`totalListHeightChanged` 与 item mount。插桩和 CSS A/B 均已在结束前移除，页面恢复 `overflow-anchor: auto`、结构化 `heightEstimates` 与初始 `scrollHeight=191,293px`；不保留任何生产 test mode。

| Variable                                             | Result                                                                                                                                            | Conclusion                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Baseline: `heightEstimates` + `overflow-anchor:auto` | 从尾部跨到 `841–854` 后，`total-height=193,263px`，17ms 后出现 `0.01414` shift；稍后 range 扩至 `843–859`、高度再变，9ms 后出现 `0.01136` shift。 | 测量校正、range 变化与 CLS 有直接时序关联。                                                    |
| Only `overflow-anchor:none`                          | 在 range `826–842` 出现 `0.01976` 与 `0.01067` shift；随后 range `825–841`、总高度变为 `191,950px` 后仍出现 `0.00723` shift。                     | 禁用 CSS scroll anchoring 不消除 CLS，不能作为修复方案。                                       |
| Only remove `heightEstimates`                        | 初始总高度从 `191,293px` 降为 `100,517px`，尾部最初只渲染 index `999`，随后在 `981–999`、`989–999` 间反复扩张并重测。                             | 结构化估算是长历史尾部定位的必要输入；移除它会使列表的未测量总高度严重失真，不能作为修复方案。 |

结论进一步收敛：保留 `heightEstimates` 与默认 anchoring；下一阶段应定位各异构消息的“estimate 与稳定实测高度”误差，并把首次真实测量移到进入可见区之前或消除同一 range 的二次 size-tree 提交。不得以关闭估算、关闭 anchoring、扩大 buffer 或恢复手工 `scrollTop` 掩盖问题。

## Dual Dataset Regression Baseline — 2026-08-30

### Decision

后续真实 Chrome 回归不再仅使用“1000条测试数据”。该 fixture 保留为 1,000 条可重复的混合压力集合；另从本机有效 IndexedDB snapshot 中排除 fixture 后稳定选择消息数最多的真实会话，测试准备时仅本地标记为“最长真实会话”。

### Privacy and state boundary

- 真实样本不复制、扩容、上传或输出正文；记录只允许 message count、part-type aggregate、当前本机测试标签和浏览器几何观察。
- 本地 index/snapshot title 可短暂标记为“最长真实会话”，不调用服务端改名；后续 registry reconcile 恢复服务端原标题属于预期，不影响按 selected conversation id 回归。
- fixture 仍单独生成和清理，不能作为真实样本候选。

### Browser matrix (T077, product-owner accepted under D027)

| Dataset          | Required checks                                        | Evidence                                        |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `1000条测试数据` | 尾部/混合区轻微上滚、跨段拖拽、刷新、图片与 disclosure | Passed — 用户确认；DOM 计数保留为诊断           |
| `最长真实会话`   | 轻微上滚、拖拽、刷新、已展开内容往返                   | Passed — 用户确认；结构聚合与数值采样保留为诊断 |

### Development-only real target smoke — 2026-08-30

| Check                    | Result                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Selection                | `/instant-mind/v053-seed?target=real` 排除“1000条测试数据”后完成本地选择；页面显示“最长真实会话”摘要，不读取或输出正文。                    |
| Real structure aggregate | 24 messages；`image-brief: 2`、`image-result: 2`、`skill: 4`、`text: 22`、`tool: 4`、`workflow-progress: 2`。                               |
| Chat handoff             | 点击“打开真实会话”后进入 `/instant-mind`；稳定后 tail index 为 23，当前挂载 5 个 `[data-item-index]` 节点。                                 |
| Local title boundary     | server registry reconcile 恢复了 sidebar 的服务端原标题，符合 D022；selected conversation id 与真实 tail index 保持，故回归不依赖可见标题。 |

本条是数据集准备 smoke；T077 的行为矩阵已由 D027 产品负责人验收通过。桌面 / 移动固定次数和 4x CPU 仍可继续采集为诊断，不是通过门槛。

## Rendered-height Estimate Calibration — 2026-08-30

### Scope and privacy boundary

本轮只在真实 Chrome 的两套本地数据上临时比对 `[data-item-index]` 的稳定 `getBoundingClientRect().height` 和同一 item 的 estimate。临时标记在测量完成前已移除；没有记录或输出消息正文、图片 Blob、prompt、Agent detail、IndexedDB record 或滚动位置写入。所有滚动均为浏览器用户式 wheel gesture，未使用手工 `scrollTop` 控制。

### Before / after sampled error

| Dataset / item                       | Before `actual - estimate` | After `actual - estimate` |
| ------------------------------------ | -------------------------: | ------------------------: |
| Fixture Skill + Prompt (893)         |                     +112px |                     -12px |
| Fixture Agent (895)                  |                      +94px |                       0px |
| Fixture Image Brief + Result (897)   |                      +55px |                      -1px |
| Fixture Tool (995)                   |                     +106px |                      +8px |
| Fixture Resource (997)               |                     +176px |                      +8px |
| Longest real completed Markdown (19) |                   +2,024px |                    +446px |
| Longest real completed Markdown (21) |                   +1,995px |                    -287px |

最长真实会话的两条重消息均为 text part；仅采集的无正文 DOM 结构指标显示它们包含 heading、list、fenced code 与 Markdown table。旧估算把这些结构的原始字符全部按普通段落换行处理，并受 72 行 / 2,400px 上限影响。新估算分开处理代码行、table data row、heading、list 与 prose，且放宽上限以覆盖已观察到的完成态长消息；真实 measurement 继续覆盖初值。

### Static-reader settle check

| Dataset          | Input                                   | Result                                                                                           |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `1000条测试数据` | 1 次 -360px 与连续 5 次 -180px 轻微上滚 | 每次 `afterInput === after300ms`；首轮也验证 `after250ms === after500ms`，无向更新消息方向回跳。 |
| `最长真实会话`   | 连续 3 次 -180px 轻微上滚               | 每次 `afterInput === after300ms`，无回跳。                                                       |

结论：目前证据支持“估算误差是静态回跳/CLS 的主变量”，不支持改 static Scroll Policy、关闭 `heightEstimates`、扩大 buffer、恢复手工 `scrollTop`、设置 `overflow-anchor:none` 或启用 `skipAnimationFrameInResizeObserver`。后者仅在未来误差已收敛而双跳仍可复现时再做单变量 A/B。

### Automated evidence

| Check                     | Result                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T079 red                  | `chat-message-list.test.tsx` 在旧 72 行 / 2,400px 文本估算和缺少 `flow-root` 时失败：180 行 completed text estimate 仅 1,772px，且 rich fixture 未达到校准区间。                                                                                                                                                               |
| T079 green                | 同一目标 Vitest 在新结构化估算与 `flow-root` 后通过，覆盖 180 行 completed text、fixture Skill + Prompt / Agent / Image / Tool / Resource 和 item margin containment。                                                                                                                                                         |
| Affected regression suite | `pnpm --dir apps/webapp exec vitest run tests/components/chat/message-list/chat-message-list.test.tsx tests/components/chat/message-list/parts/image-result-part.test.tsx tests/components/instamind/use-chat-scroll-policy.test.tsx tests/app/instant-mind/page.test.ts --reporter=dot --silent`：4 files / 55 tests passed。 |
| Typecheck / diff          | `pnpm --dir apps/webapp typecheck` 与 `git diff --check` 通过。                                                                                                                                                                                                                                                                |
| Targeted ESLint           | 格式问题已按首次 ESLint 输出修正；最终复跑被宿主工具缓存的系统用量限制中断，未将 ESLint 记作通过，待该限制解除后复跑。                                                                                                                                                                                                         |

本节的采样不替代完整行为矩阵；该矩阵随后已在 D027 中由产品负责人确认通过。desktop/mobile 固定次数、4x CPU 与新的 CLS 数值仍可用于后续诊断。

## Presentation-aware Real-content Estimate Calibration — 2026-08-30

### Change boundary

真实会话与 fixture 的本地 CLS 分别约为 `0.98–1.03` 和 `0.64`；两者都未达到可接受门槛，且 fixture 的 shift cluster 更多并不代表影响更大。为消除已证实的初始估值/实际渲染不一致，本轮仅调整 `heightEstimates`：关闭 reasoning 时不计 reasoning；workflow 只有 delivery-chain 或 image generation 实际会渲染时才计入；等长 CJK prose 使用双宽视觉单位。没有新增 production diagnostics、浏览器存储、网络、Scroll Policy command、`followOutput`、buffer 或手工像素滚动。

### Automated evidence

| Check           | Result                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T081 red        | 旧实现下，隐藏 reasoning 的 estimate 为 `124px`，同文本基线为 `68px`；等长 CJK / ASCII prose 都为 `124px`，新增两项断言均按预期失败。                                                                     |
| T081/T082 green | `pnpm --dir apps/webapp exec vitest run tests/components/chat/message-list/chat-message-list.test.tsx --reporter=verbose --silent`：1 file / 19 tests passed。覆盖隐藏 part 不计入估算与 CJK 宽字符换行。 |

### Real Chrome static smoke

只采集 index、item count 与几何，不读取或输出消息正文。重载后的 fixture 尾部为 index `989–999`、11 个 DOM item；一次 `-180px` 上滚后由 `222005` 到 `221822`，300ms 后保持 `221822`。`/instant-mind/v053-seed?target=real` 选择的当前最长真实会话恢复 26 条、尾部 index `23–25`；连续三次 `-180px` 上滚分别为 `26444→26264`、`26264→26090`、`26090→25910`，每次 300ms 后与输入后位置相同。

本 smoke 证明本轮没有重新引入 completed reader 的自动回底。它当时未采集新的 CLS 数值；完整双数据集、移动端、拖拽、刷新、展开和流式行为随后已由 D027 产品负责人确认通过。

## Development fixture route migration — D026

历史的 Chrome 证据记录了当时实际使用的 `/instant-mind/v053-seed` 路径，保留该 URL 以保证证据可追溯；它不是迁移后的操作说明。当前 canonical development-only 入口为 `/dev/message-virtualization`，默认模式仅写确定性的 mixed fixture，完整 donor/backup/cleanup 仍使用 DevTools Snippet。迁移后的 route/helper 自动化和 development smoke 由 T093–T097 记录；不将其误记为 T092 的 cold/warm CLS 证据。

## Cold/Warm Height Hint Acceptance — D025 / D027

状态：**T084–T091 implemented and automated-verified; T092 browser behavior accepted by product owner**。cold/warm 的真实 Chrome 数值不能由 jsdom 或 seed 伪造；但从 D027 起，它们是优化诊断而非 release 门槛。

### Automated implementation evidence — 2026-08-30

- IndexedDB 从 version 2 升至 version 3，仅新增 `message-height-hints`（`key` keyPath、`conversationId` index）；会话 index、snapshot、image cache 的 schema 与 120 条 snapshot 上限未改。
- record 只接受 `messageId`、opaque `renderFingerprint`、`history-default`、归一化有限 height 与时间；strict schema 拒绝正文等额外字段。每会话最多保留三个 layout variants，删除会话时与 snapshot/image cache 同步清理。
- `ChatMessageList` 在已提交 `scrollParent` 下先读取实际 `chat-main-column` 的精确 CSS 宽度，再读 exact conversation/layout cache 并挂载 Virtuoso；old generation、cache miss、invalid/unavailable、IndexedDB blocked 或 500ms 超时都回退当前 structural estimator，迟到 read 不会注入已挂载 generation。该读取期间页面继续以现有 history skeleton 隐藏未定位内容。
- 候选只来自 `itemsRendered.size`，同一尺寸连续两次后才进入 rAF/font-ready batch；streaming、scrolling、latest assistant、非默认 disclosure 与 unmounted generation 均禁止写入。展开态会立即废弃该消息候选，恢复默认展示后必须重新稳定测量两次；会话删除同步递增 generation 使在途旧写失效，且同 ID 后续会话可重新预热。没有持久化 `scrollTop` / `StateSnapshot`，没有新 message `ResizeObserver` 或 Scroll Policy scroll command。
- T091 定向回归：`pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts …` 覆盖 local persistence、height hints、message list、disclosure、Scroll Policy、page 与 conversation session，7 files / 112 tests passed。T092 随后由 D027 产品负责人确认浏览器行为通过；表格中的未采集数值不再表示 pending。
- T098 定向回归：`local-chat-persistence.test.ts` 18 tests passed。高度提示写入的三变体淘汰和会话删除均只通过既有 `conversationId` index 查询目标会话，不再读取整个 `message-height-hints` store；不改变 deletion generation、缓存上限或滚动控制权。

### Fixed variables

- 同一 Chrome profile、zoom、DevTools docking、viewport 和 message column CSS width；每组开始前重置 Local Metrics。
- 数据集固定为“1000条测试数据”和当前 `target=real` 选择的“最长真实会话”；不得记录正文或由 seed 伪造高度提示。
- Cold：只清理 `message-height-hints` store，不改变 conversation snapshot/image cache；按固定路径滚动并让已挂载 item 产生真实候选。
- Warm：刷新同一会话、同一宽度并重复完全相同路径；宽度或 geometry version 改变时必须作为 miss case 单独测试，不能混入对照。

### Diagnostic evidence table

| Dataset / viewport |       Cold CLS |       Warm CLS |      Reduction |  Hint hit rate | Max item delta | Total-height delta | IDB writes while streaming / eligible-history idle |       DOM peak | Result                    |
| ------------------ | -------------: | -------------: | -------------: | -------------: | -------------: | -----------------: | -------------------------------------------------: | -------------: | ------------------------- |
| Fixture / desktop  | 未采集（诊断） | 未采集（诊断） | 未采集（诊断） | 未采集（诊断） | 未采集（诊断） |     未采集（诊断） |                                     未采集（诊断） | 未采集（诊断） | Passed — 用户确认行为正确 |
| Real / desktop     | 未采集（诊断） | 未采集（诊断） | 未采集（诊断） | 未采集（诊断） | 未采集（诊断） |     未采集（诊断） |                                     未采集（诊断） | 未采集（诊断） | Passed — 用户确认行为正确 |
| Fixture / 324×534  | 未采集（诊断） | 未采集（诊断） | 未采集（诊断） | 未采集（诊断） | 未采集（诊断） |     未采集（诊断） |                                     未采集（诊断） | 未采集（诊断） | Passed — 用户确认行为正确 |
| Real / 324×534     | 未采集（诊断） | 未采集（诊断） | 未采集（诊断） | 未采集（诊断） | 未采集（诊断） |     未采集（诊断） |                                     未采集（诊断） | 未采集（诊断） | Passed — 用户确认行为正确 |

收口要求：产品负责人确认 cold/warm 的正确展示、滚动行为和流式写入边界；并持续满足无 scroll-state restore、手工消息 `scrollTop`、第二个 message `ResizeObserver` 或新的 console error。history hint 命中率、CLS 降幅、DOM count、idle batch 次数与 4x 观察数据可用于后续优化和异常排查，但不阻塞 T092 或本版本收口。

## Release-preparation verification — 2026-08-31

| Check                        | Result                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Lockstep version             | 根、webapp、desktop、project-assistant-service、stream-core 与 database manifest 均为 `0.5.3`。                                          |
| Public assets                | README、公开 version / release / tasklist 和消息视口 architecture 已同步；Prettier check 通过。                                          |
| `pnpm test` stable lane      | Passed：workspace boundary / test-lane / governance 通过；Turbo 6/6 tasks 成功，webapp 157 files / 1,107 tests passed。                  |
| `pnpm test` integration lane | Passed：独立 Docker PostgreSQL 完成 migration/runtime setup 后执行；database 2、webapp 30、desktop 20 tests 通过，Turbo 5/5 tasks 成功。 |
| `pnpm lint`                  | Passed：5/5 tasks 成功，0 errors；保留 8 个既有 warnings。                                                                               |
| `pnpm typecheck`             | Passed：7/7 tasks 成功。                                                                                                                 |
| `pnpm build`                 | Passed：4/4 tasks 成功，webapp production build 已完成。                                                                                 |

结论：本地 version asset sync、稳定测试及隔离数据库 integration lane 均已通过。T039 只剩 release commit、tag、GitHub Release 与远端 CI，均仍需用户显式授权。
