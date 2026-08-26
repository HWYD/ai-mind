# UI Contract: Conversation Entry Presentation

## Scope

This is an internal client UI contract. It creates no remote API or public package API.

## Producer

`useConversationSessions` treats a user-selected existing conversation as the local presentation selection immediately. It writes the existing local selected-conversation value and starts local-index/server selected-preference persistence outside the local navigation path; a persistence failure retains that selection for reconciliation on the next registry recovery or refresh. A local selection generation rejects a late registry response that began before that selection, so it cannot restore UI, localStorage or the local index to an older session. When the registry is only available as a read-only local cache, selection among existing cached conversations remains allowed and never emits a registry POST; new, delete and send operations remain unavailable.

`useChatStream` supplies the page with:

- the conversation id that owns its current `messages` value; and
- a unique history-entry-ready token only after ordinary existing-conversation hydration is complete.

The producer must not emit a history-entry-ready token for a draft's live promotion. When a valid local snapshot exists, it must emit its one token before awaiting remote hydration; later remote success, unavailable-state handling, or failure must not emit a second token.

## Consumer

`InstantMindPage` must:

1. show the existing skeleton whenever a selected existing conversation does not yet own the rendered messages;
2. render current history hidden when it has a new ready token that has not been positioned;
3. call the auto-scroll hook's immediate entry-position action from a layout effect, then mark that token positioned only after its cancellable first layout correction completes;
4. cancel a pending entry correction when the selected existing conversation changes;
5. leave draft/live-stream content and previously positioned current history visible.

## Invariants

- A token is consumed at most once.
- A token whose conversation id is no longer selected is ignored.
- The entry-position action never uses smooth scrolling, moves focus, or mutates persisted user data.
- Every historical entry token re-measures the message viewport's scrollbar inset and waits for it to commit to the Composer layout before beginning hidden positioning on the following animation frame; it never reuses a prior conversation's measurement.
- The chat column has exactly one scroll owner: an `h-full overflow-y-auto` message viewport. Composer is a non-scrolling bottom overlay, and its actual measured height is represented only by content bottom padding; it never changes the viewport's height or introduces document scroll.
- The message viewport itself reserves `scrollbar-gutter: stable`. On classic-scrollbar platforms this preserves the same native gutter before and after overflow; on overlay-scrollbar platforms it consumes no layout width. The UI must not force an always-visible empty scrollbar track.
- The Composer overlay shell and lateral padding pass pointer events through to the message viewport. Only the centered Composer interaction column and its controls receive pointer events.
- The overlay shell supplies a bottom-to-top content mask. Its Composer column uses the measured message-viewport scrollbar width as a right inset, and its content padding is actual Composer height plus 54px.
- Composer inset or message-content size changes may scroll the message viewport only when it was already bottom-pinned; they never move a reader who has scrolled upward.
- The existing auto-follow and return-to-bottom action remain separate from this contract.
- A completed latest assistant reply's recommendation group is part of the ready history tree. Background selected-preference persistence must not hide that group or cause it to be inserted after the first reveal.
