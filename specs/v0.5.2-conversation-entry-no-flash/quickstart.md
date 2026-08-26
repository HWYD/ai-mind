# Quickstart: Validate Conversation Entry Without Scroll Flash

## Automated checks

From the repository root:

```powershell
pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/components/instamind/conversation-session.test.tsx tests/components/instamind/use-chat-auto-scroll.test.tsx tests/components/instamind/use-chat-stream-hydration.test.tsx tests/app/instant-mind/page.test.ts
pnpm --dir apps/webapp lint
pnpm --dir apps/webapp typecheck
git diff --check
```

## Manual scenarios

1. Create or select a completed history long enough to exceed the viewport. Select it from the desktop sidebar and from the mobile drawer. Only the loading skeleton may precede the latest messages.
2. Refresh while the long conversation is selected. After recovery, the latest completed turn remains above the floating Composer's measured safe area, while the message scrollbar continues to the bottom of the full-height viewport.
3. Under browser CPU throttling, repeat the first scenario and verify that the history top is never visible between the skeleton and latest content.
4. Scroll up after entry. Re-click the selected conversation, focus the Composer, and make a non-streaming UI change; the reading position remains unchanged.
5. Start a draft conversation. Its promotion into a live stream remains continuous and does not show the history skeleton.
6. Start loading conversation A, immediately switch to B, then resolve A. B remains the only visible conversation.
7. While pinned at the newest message, expand and collapse the floating Composer (including review content when available): the latest message remains visible above its real measured safe area plus 54px, and the scrollbar still spans the full message viewport. Repeat after scrolling upward: the reading position must not change.
8. With a native message scrollbar visible, confirm that the Composer card's left/right edges exactly match the message content column, that the bottom gradient masks content behind the Composer, and that the last message retains the extra 30px gap.
9. With cached existing conversations A and B, delay or fail B's selected-preference POST, then select B. A must disappear immediately; B's cached latest content must become visible through the normal hidden-position reveal. After failure, B remains selected; refresh or use the existing recovery action to reconcile it later.
10. Switch between a short/empty state and a long history on a classic-scrollbar platform. The native scrollbar gutter remains layout-stable: Composer and message-column left/right edges do not shift, and no empty forced scrollbar track is shown.
11. Disconnect the registry after caching completed conversations A and B. Both recent-list rows remain selectable and swap their cached histories; “新聊天”, delete and send remain unavailable. Confirm that switching does not add a selected-preference POST while disconnected.
12. Delay the selected-preference POST for a completed target session. Its reply and recommendation questions must become visible in one reveal; resolving the POST must not add recommendation chips, shift the latest reply or move the scroll position.
13. Start a selected-preference persistence for A, immediately select B, then resolve A. Confirm B remains selected and the network sends B's preference only after A settles; refresh or retry registry recovery and confirm B is still the persisted preference.

## Expected outcome

The visible sequence for ordinary historical entry is exactly `loading skeleton -> latest conversation content`; it never includes an intermediate top-of-history or smooth-scroll state.
