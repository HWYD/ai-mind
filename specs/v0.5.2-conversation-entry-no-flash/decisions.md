# Decisions: Conversation Entry Without Scroll Flash

## D001 — v0.5.2 is an independent version workspace

v0.5.1 is already tagged on `main`. The user explicitly authorized v0.5.2 as an independent follow-up, so this workspace is the new canonical Spec Kit target.

## D002 — Hide until the first complete history correction, not merely the first write

Historical message content participates in layout while hidden. The page positions the dedicated message viewport to its bottom in a layout effect, completes its cancellable rAF correction, and only then reveals the same content. This replaces both post-paint correction and visible smooth scrolling; it must not use the document scroll position.

## D003 — Navigation hydration differs from a promoted live draft

A promoted draft already owns the visible live message sequence. It must not be routed through the history-entry skeleton or treated as a new history positioning event.

## D004 — No persisted reading position or unread model

v0.5.2 always opens a historical conversation at latest content. Adding user preferences, unread cursors, or stored scroll positions is explicitly out of scope.

## D005 — Superseded: use a message-end anchor for historical entry positioning

This decision was replaced before v0.5.2 implementation because the message viewport itself is the stable user-visible scroll owner. The anchor, `scroll-margin-bottom`, and document fallback must not be retained. A Composer overlay may use its actual `ResizeObserver` measurement as content bottom padding; no estimated offset is allowed.

## D006 — Full-height message viewport with floating Composer

The chat column's only scrollable element is an `h-full overflow-y-auto` message viewport. Mobile session selection lives inside it; Composer floats at the bottom without reducing the viewport. The Composer's actual measured height plus 54px becomes message-content bottom padding, and a `ResizeObserver` re-pins only an already-bottom-pinned user after that padding has committed. The overlay shell uses a bottom gradient mask; its lateral padding passes pointer events through, while only the centered Composer interaction column receives them. The page measures the message viewport's native scrollbar width and applies it as the Composer shell's right inset, so its card and the message content column share the same left/right edges across platforms. Every history-entry token re-measures that inset instead of reusing the skeleton or prior conversation cache; only after it commits does hidden positioning begin on the following frame, so a width-induced Composer resize is included before history is revealed. This makes the scrollbar cover the complete message area and remains the v0.5.2 compatibility foundation for later tail-first cursor and end-anchored virtual-list implementation, without adding pagination or virtualization now.

## D007 — Content-layout growth participates in bottom pinning

The message-content column is observed in addition to Composer. If a delayed Markdown/card/font layout increases `scrollHeight` while the user remains at the real end, the message viewport is re-pinned to its new bottom. The observer does nothing after an upward reader scrolls away, so it does not create a second scrolling policy or replace a future virtual-list anchor. Composer's own observer first updates the overlay safe inset and then follows the same rule.

## D008 — Existing-session selection is local-first; native gutter is stable

Selecting an existing session updates the local presentation selection and the existing local selected-conversation value synchronously, completes the local index write, then sends the server selected-preference POST. The remote request continues as background confirmation, but a failure keeps the new local session visible and leaves it to the next registry recovery or refresh to reconcile; it must not restore the previous session. A monotonic local selection generation discards registry work started before a newer local choice, and a pending-selection ref prevents nonmatching registry confirmation from replacing that choice. A valid local message snapshot becomes ready and publishes its one entry token before server ThreadState validation, preventing an old-history intermediate state and a second hidden/reposition cycle.

The actual nested message viewport, rather than `html`, owns `scrollbar-gutter: stable`. This reserves the native classic-scrollbar gutter throughout the skeleton/short/long transition and therefore stabilizes the Composer's measured right inset. Forcing `overflow-y: scroll` is rejected because it shows an empty scrollbar track; keeping the server-confirmed selection as the presentation state is rejected because it keeps old content visible during the POST round-trip.

## D009 — Local cache navigation and recommendation blocks are not server-confirmation gates

Existing local conversations remain selectable while a selected-preference confirmation is pending or the registry is read-only cached. That local path immediately updates selected-ID storage, then runs local-index persistence and, when writable, selected-preference POST through one latest-selection serial queue. A rapid A→B switch can finish an already-started A write, but it always follows with B and never lets A start a later POST after B is known; the final local and server preference therefore converge to B. Read-only mode runs only the local-index portion and does not issue a registry write. New, delete and send actions remain disabled until the corresponding server capability is available.

The completed latest assistant reply's recommendation group is derived from the ready history tree rather than the selected-preference mutation state. It is therefore laid out while history is hidden and appears in the same first reveal as its reply, eliminating the delayed block insertion that previously caused a second visible reflow.
