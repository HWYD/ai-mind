# Acceptance Ledger: Conversation Entry Without Scroll Flash

**Status**: 本地 release closing 已完成；真实历史会话的桌面、移动端及 4 倍 CPU 降速视觉冒烟均已通过。远端 GitHub Actions 是创建 tag 与 GitHub Release 的最终闸门。

## Current automated evidence

| Area                            | Evidence                                                                                                                                                                                                                                                                                                                   | Result |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Full-height viewport layout     | `page.test.ts` verifies `h-full overflow-y-auto` message viewport, internal mobile selector, bottom-fixed Composer, edge gesture pass-through and measured content bottom padding                                                                                                                                          | Passed |
| Composer overlay polish         | `page.test.ts` verifies the bottom gradient mask, scrollbar-width right inset, non-animated right alignment and 54px extra-safe-area formula                                                                                                                                                                               | Passed |
| Local-first session switch      | `conversation-session.test.tsx` delays/fails selected-preference POST, verifies B is selected before it settles, serializes rapid A→B local-index and server-preference writes to final B, discards late old registry responses, and restores saved B over an older local-index selection when the registry is unavailable | Passed |
| Local snapshot ready timing     | `use-chat-stream-hydration.test.tsx` delays bounded ThreadState validation, verifies a valid local snapshot is already `ready` with one entry token, then verifies remote completion preserves that token                                                                                                                  | Passed |
| Stable native gutter            | `page.test.ts` verifies `scrollbar-gutter: stable` is applied to the real nested message viewport rather than only to `html`                                                                                                                                                                                               | Passed |
| Scrollbar-to-entry ordering     | `page.test.ts` verifies every newly hydrated history token re-measures its scrollbar inset, remains hidden until it commits, and only then starts entry positioning on the following animation frame                                                                                                                       | Passed |
| Viewport-only scrolling         | `use-chat-auto-scroll.test.tsx` verifies streaming follow and historical entry write `scrollTop` on the message viewport and do not call `window.scrollTo`                                                                                                                                                                 | Passed |
| Post-entry content reflow       | Scroll tests verify that a bottom-pinned viewport follows later message-content height growth to its new true end, while an upward reader keeps their `scrollTop`                                                                                                                                                          | Passed |
| First visible history frame     | `page.test.ts` verifies the page keeps history hidden until the entry-position rAF callback reports completion                                                                                                                                                                                                             | Passed |
| Composer dynamic height         | `use-chat-auto-scroll.test.tsx` verifies actual `getBoundingClientRect().height` becomes the overlay inset; standalone or merged with message-content ResizeObserver entries, correction is scheduled only after inset commit; bottom-pinned users re-align and readers above do not move                                  | Passed |
| Entry cancellation              | Scroll tests verify A→B cancels A's queued correction; page tests verify cancellation occurs before B entry positioning                                                                                                                                                                                                    | Passed |
| History ownership and readiness | `use-chat-stream-hydration.test.tsx` covers normal server hydration, local rich snapshot, read-only snapshot, failure/retry, A→B switch、延迟只读缓存回退、失败响应 JSON 延迟解析与 draft promotion                                                                                                                        | Passed |
| Cached-session navigation       | `conversation-session.test.tsx` verifies a read-only local A/B cache can select B, updates the existing selected-ID/index, preserves read-only write restrictions and emits no extra registry POST                                                                                                                         | Passed |
| Recommendation first reveal     | `chat-message-list.test.tsx` verifies completed-reply recommendations remain mounted when actions are temporarily unavailable, with controls disabled rather than the recommendation block being removed and inserted later                                                                                                | Passed |
| Targeted regression             | conversation session + `use-chat-auto-scroll` + `use-chat-stream-hydration` + page: 4 files, 56 tests                                                                                                                                                                                                                      | Passed |
| Current targeted regression     | conversation session + message list + page: 3 files, 46 tests                                                                                                                                                                                                                                                              | Passed |
| Full stable suite               | `vitest.stable.config.ts`: 153 files, 1052 tests                                                                                                                                                                                                                                                                           | Passed |
| Type and lint                   | `pnpm --dir apps/webapp typecheck`; `pnpm --dir apps/webapp lint`                                                                                                                                                                                                                                                          | Passed |
| Diff hygiene                    | `git diff --check`                                                                                                                                                                                                                                                                                                         | Passed |

## Browser geometry evidence

在本地 `http://localhost:3000/instant-mind` 的 324×534 移动视口测得：页面根和消息视口均为 `0–534px`，消息视口 `clientHeight` 为 534、`overflow-y: auto`、`scrollHeight` 为 1047；Composer 浮层为 `434–534px`，消息内容底部安全区为 108px。`document.documentElement.clientHeight === scrollHeight === 534`，说明页面本身不滚动，消息滚动轨道覆盖完整聊天列高度并延伸至页面底部；在悬浮层左侧底部命中点验证其事件目标仍属于消息视口。

桌面真实页面复核：消息原生 scrollbar 宽度为 15px，Composer 列相对消息列的左右差均为 0px；浮层已应用 bottom-to-top gradient（48px 顶部渐变区）。测得 Composer 高度为 174px，消息底部安全区为 228px，即 Composer 高度加 54px，满足比旧 24px 间距额外增加 30px 的要求。

早期阶段的每个历史就绪 token 都会在入口前同步重测 scrollbar 宽度的回归已覆盖 `0px -> 15px` 的连续会话切换；本版本的当前自动化证据以本表和下文 2026-08-25 记录为准。

2026-08-25 自动化补充：选中偏好 POST 不再被计为阻塞会话选择的 mutation。缓存会话可在 registry 只读时继续本地切换，且不会发出 registry POST；新建、删除和发送仍保持不可用。快速 A→B 的本地 index 与 selected-preference POST 通过同一条最新选择优先的串行后台链路收敛为 B，避免旧 A 写入在后完成后覆盖 B。已完成回复的推荐问题由 ready 消息树决定，即使交互暂时禁用也会在隐藏历史布局阶段挂载为 disabled 按钮，不会在后台确认完成后新增整个推荐问题区块。定向 3 文件 46 测试、stable suite 153 文件 1052 测试、TypeScript、ESLint（0 error，8 条既有 warning）及 `git diff --check` 均通过。

## Browser visual evidence

2026-08-26 在本机 Chrome 的既有访客历史数据中完成常规视觉冒烟（不发送、修改或删除聊天内容）：

1. 桌面选择长历史“Vue 3 的响应式系统为什么要用 Proxy？”后，唯一消息视口 `scrollTop=5315`、`scrollHeight=6530`、`clientHeight=1215`，处于真实末尾；`scrollbar-gutter: stable` 生效。消息内容列与 Composer 卡片均为 `971–1827px`（856px），左右严格对齐。
2. 快速从短会话“25 摄氏度等于多少华氏度？”切回上述长会话后，首个消息为目标会话、消息视口仍位于底部，三条推荐问题已同时存在且可交互；未观察到旧会话作为最终可见状态残留。
3. 在 `324×534` 移动视口中，通过会话抽屉进入短会话后，消息视口为 `0–534px`、`scrollHeight=975px` 且位于底部；`documentElement.clientHeight === scrollHeight`，页面文档未滚动。
4. 将当前长会话上滑到 `scrollTop=8288` 后重复选择该会话，位置保持 `8288`；随后刷新页面，恢复同一会话并重新定位到真实末尾 `scrollTop=9188`。

## Release-closing manual acceptance

2026-08-26 补充 4 倍 CPU 降速观察：在 Chrome DevTools 的 Performance 面板将 CPU 设为 `4x slowdown` 后，用户按 `quickstart.md` 对真实长历史 A→B 切换完成观察并确认通过。可见过程仅为“加载状态 → 最新内容”，未出现前一会话残留或“历史顶部 → 滚到底部”的中间态。

持久化失败、只读缓存、延迟确认、失败重试、草稿首轮晋升、推荐问题同帧揭示和 Composer 动态高度继续由本表所列的自动化故障注入与回归测试覆盖；常规真实页面、移动视口和 4 倍 CPU 的视觉证据已完成。

## Acceptance boundary

先前 324×534 移动几何检查确认：flex Composer 使消息视口在 Composer 顶部结束，因此无法满足用户要求的“滚动条撑满”。T027–T029 已改为并验证全高消息视口和浮层 Composer；真实长历史的“hook + 页面 + 内容”最终视觉组合已由 T015、T044 与 T047 的常规页面和 4 倍 CPU 验收完成。
