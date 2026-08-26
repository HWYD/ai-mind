# Implementation Plan: Conversation Entry Without Scroll Flash

**Version**: v0.5.2
**Feature**: 已有会话进入时展示最新消息，并避免可感知的滚动闪动
**Spec**: [spec.md](./spec.md)

## Summary

当用户点击历史会话或刷新恢复已有会话时，消息历史应以最新消息在视口底部的状态首次可见；用户随后可向上浏览历史。已有会话的本地选择先于服务端选中偏好持久化生效，且有效本地快照在远端验证前即可进入两阶段呈现；后台失败保留目标会话并由下一次注册表恢复/刷新确认。实现采用两阶段进入：保留既有骨架屏，真实消息树完成布局后先保持不可见，在 `useLayoutEffect` 中对独立消息视口执行无动画的到底定位并同步显示。这样滚动写入发生在浏览器首帧绘制前，不会出现“先在顶部显示、再跳到底部”的闪动。

聊天列使用完整高度的独立消息视口：移动会话选择器位于该视口内并保持顶部 sticky，Composer 作为底部悬浮层而不参与消息区高度分配。`ResizeObserver` 读取 Composer 的真实高度并将其作为消息内容末尾安全区；消息视口自身保持 `h-full overflow-y-auto`，滚动条延伸至聊天列底部。本版不接入 cursor、向上加载或虚拟列表，但该消息视口是后续“尾页优先 + 向上加载 + 端锚定虚拟化”的固定承载面。

草稿会话的首轮回复与已有会话的流式续写不属于历史进入，不重复套用隐藏或定位，保持当前连续体验。重试、快速切换、卸载均可取消过期定位请求。

## Technical Context

| Area                     | Decision                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend                 | Next.js App Router、React、TypeScript、Tailwind；沿用现有 Instant Mind 组件结构                                                                                                                                           |
| Scroll container         | 聊天列内唯一的消息视口；禁止读写 `window`、`document` 或页面根滚动容器；消息视口自身使用 `scrollbar-gutter: stable`；Composer 浮层仅交互列接收指针事件，其余区域穿透到消息视口；其右边界按消息视口实测 scrollbar 宽度收缩 |
| Session selection        | 既有会话在本地立即选中、写入现有 localStorage/index 后由“最新选择优先”的串行后台链路 POST 确认；该确认不锁定已有会话导航，失败不回滚，下一次注册表恢复或刷新重试；只读缓存仅写本地 index，且仅禁止新建、删除和发送        |
| Pre-paint timing         | React `useLayoutEffect`；不使用 `setTimeout`、CSS 平滑滚动或淡入动画                                                                                                                                                      |
| Entry trigger            | `useChatStream` 发布当前会话的、单调递增的历史就绪 token                                                                                                                                                                  |
| Stale-content protection | 将消息所属会话 ID 与当前选中会话 ID 比较；不匹配时维持骨架屏                                                                                                                                                              |
| Compatibility            | 不修改 API、持久化模型、流式协议、Electron IPC 或用户阅读位置数据；不预埋未使用的 cursor 类型                                                                                                                             |
| Validation               | Vitest 定向回归、webapp lint/typecheck、浏览器手工冒烟                                                                                                                                                                    |

## Constitution Check

| Principle / constraint | Assessment                                                                      | Result |
| ---------------------- | ------------------------------------------------------------------------------- | ------ |
| 最小正确改动           | 仅改变前端历史进入呈现协调；不改变消息数据、服务端契约或 Runtime                | Pass   |
| 历史消息可靠性         | 仍使用现有 hydration、错误、只读快照与重试链路                                  | Pass   |
| 流式交互               | 自动跟随、用户上滑锁定、回到底部按钮语义不变；新增入口定位是独立的一次性动作    | Pass   |
| 分层边界               | 所有状态均为前端 UI 短生命周期信号；不向聊天主链写入数据层状态                  | Pass   |
| 可测试性               | 通过内部 hook 返回契约验证就绪、过期会话和无动画定位；不引入 test-only 生产开关 | Pass   |
| 复杂度                 | 无例外；不增加抽象层或新依赖                                                    | Pass   |

## Architecture and Execution Flow

```text
selected existing conversation
  -> immediately update local selected ID and existing local index
  -> clear prior history ownership / show existing skeleton
  -> valid local snapshot becomes ready before remote validation (including completed follow-up recommendations)
  -> useChatStream publishes { conversationId, sequence }
  -> page mounts real history as invisible
  -> useLayoutEffect calls immediate bottom positioning
  -> same layout effect records consumed sequence
  -> browser's first visible history frame is already at newest message
```

```text
draft first reply -> conversation promotion -> normal streaming output
                                           -> no history-entry token / no re-hide
```

### Presentation State Rules

1. `messageConversationId` is the owner of the messages currently held in the UI. It is cleared before loading another existing conversation.
2. `historyEntryReady` is `{ conversationId, sequence }`, produced only after a normal existing-conversation hydration settles successfully. `sequence` makes retries of the same ID distinguishable.
3. The page renders the hydration skeleton while an existing selected session is loading, or while message ownership does not match the selected ID.
4. A current, unconsumed token mounts the true history with `visibility: hidden`; for each token the page synchronously re-measures and commits the scrollbar right inset, then starts the scroll hook’s immediate entry method on the next animation frame and exposes history only after its correction callback.
5. The entry method writes only to the message viewport. It performs an immediate primary positioning plus one cancellable `requestAnimationFrame` correction after the Composer safe inset has been applied, and keeps the real history hidden until that correction has run; it never enables smooth scrolling.
6. `ResizeObserver` instances observe the Composer and the message-content column. The Composer observer updates the exact bottom safe inset;该 state 提交为内容 padding 后，才在 viewport 原本位于末尾时重新对齐新的真实末尾。The content observer covers delayed Markdown/card/font layout growth. An up-scrolling reader is never moved by either observer.
7. Composer 浮层的外壳和横向留白使用 pointer-event pass-through，只有 Composer 交互列、回到底部按钮及其子控件接收指针事件；消息视口在悬浮层两侧与空白处仍可滚动。
8. No token is emitted for a newly promoted draft conversation; its live response must remain visible continuously.
9. Composer shell uses a bottom-to-top background gradient as a visual mask. Its content bottom padding is actual Composer height plus 54px, while the Composer column's right boundary excludes the message viewport's measured native scrollbar width so both columns align exactly.
10. An existing-session selection changes the local presentation ID synchronously and queues local-index/server selected-preference persistence outside the interactive navigation path. The queue serializes those two writes and always re-reads the latest selection before its next local write or POST, so rapid A→B interaction ultimately persists B even if A has already started. On its failure, the target session remains selected and its existing local snapshot remains usable; a registry recovery or refresh reconciles the pending preference. A local selection generation rejects registry requests that began before the new choice. A valid local snapshot publishes its entry token before the bounded thread request, and every later remote branch must not publish another token. A read-only cache still permits selecting another already-indexed local session, writes its local index only, but not creating, deleting or sending.
11. A completed latest assistant reply's recommendation group is calculated from the ready message tree, not from background selected-preference persistence. It therefore participates in the same hidden layout and first reveal as that reply; controls may remain unavailable only for genuinely non-interactive states.

## Internal Interface Changes

### `useChatStream`

Add two UI-only fields to its return value:

- `messageConversationId: string | null` — identifies which conversation owns `messages`.
- `historyEntryReady: { conversationId: string; sequence: number } | null` — indicates that an existing conversation’s history is ready for one pre-paint entry positioning.

These values are not persisted, sent to the API, or included in the stream protocol.

### `useChatAutoScroll`

Expose `scrollViewportRef`, `composerContainerRef`, `messageContentRef`, `composerOverlayInset`, and `positionConversationEntryAtBottom(onPositioned?): void`:

- cancels any prior entry correction;
- scrolls the message viewport to its own bottom without a document fallback;
- queues one cancellable animation-frame correction for late layout/composer measurement and invokes the optional callback only after that correction;
- does not alter user-controlled auto-follow state and does not request smooth scroll.

`composerOverlayInset` is the Composer's actual measured height and is applied by the page as message-content bottom padding. `composerContainerRef` and `messageContentRef` remain observed for size changes; no document fallback or message-end anchor is used.

### `InstantMindPage`

Track the consumed `sequence`, derive current history visibility from the selected ID plus ownership/token, and call the new entry method from `useLayoutEffect` before the real history becomes visible. The page owns the full-height message layout, renders the Composer as a bottom overlay, and applies the hook-provided safe inset to the message-content wrapper.

## Implementation Steps

1. Add failing regression tests for history ownership/readiness, initial entry positioning, retry/supersession, and draft promotion continuity.
2. Extend `useChatStream` with the internal ownership and readiness signals, carefully invalidating stale data on session changes and retry.
3. Refactor `useChatAutoScroll` to own an independent full-height message viewport and expose a Composer-safe-inset measurement; Composer resize only re-pins users already at the end.
4. Convert `InstantMindPage` to the full-height message viewport with a bottom-floating Composer, apply the exact dynamic safe inset, then coordinate skeleton, invisible layout and synchronous reveal in `useLayoutEffect`.
5. Run targeted tests, lint and typecheck; perform manual browser validation for long history, rapid switching, refresh restore, failure/retry, and a draft’s first reply.
6. Add local-first session-selection, immediate local-snapshot readiness and stable nested scrollbar-gutter regressions; confirm that background confirmation does not re-hide/reposition a displayed snapshot or shift Composer horizontally.
7. Keep cached-session navigation available while registry recovery is unavailable, while retaining write-operation safeguards; confirm recommendation groups are already mounted in the entry tree before an out-of-band selection confirmation settles.

## Project Structure

```text
apps/webapp/components/instamind/
├── instantmind-page.tsx              # entry presentation coordination
├── use-chat-stream.ts                # hydration ownership and readiness signal
└── use-chat-auto-scroll.ts           # immediate, cancellable entry positioning

apps/webapp/tests/components/instamind/
├── use-chat-stream-hydration.test.tsx
└── use-chat-auto-scroll.test.tsx

apps/webapp/tests/app/
└── instant-mind/page.test.ts
```

## Deferred Release-Closing Work

本计划实现 v0.5.2 行为与版本规格资产；正式 release closing 时再按项目流程处理 lockstep package version、发布说明与 tag，不在本次前端行为改动中提前修改无关包版本。
