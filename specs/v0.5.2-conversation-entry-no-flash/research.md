# Research: Conversation Entry Without Scroll Flash

## Decision 1 — Treat history entry as a two-stage visual commit

**Decision**: Keep the existing loading skeleton until the selected conversation's own history is available. Render that history in layout but hidden, synchronously place the independent message viewport at its bottom, complete one cancellable animation-frame correction, then reveal it.

**Rationale**: A normal post-paint effect allows users to see the first DOM position before the scroll update. React documents `useLayoutEffect` specifically for visual work that must occur before paint; a one-shot `requestAnimationFrame` provides the first late-layout correction before visible history is released. The Composer's exact overlay inset is included in scroll height before this correction, so the visible latest message is not obscured.

**Alternatives considered**:

- Only call `scrollTo` after hydration: rejected because a long history can flash at its top.
- Smooth-scroll to the bottom: rejected because the motion itself exposes the unwanted transition.
- Fade in after arbitrary delay: rejected because it adds latency and motion without proving layout is correct.

## Decision 2 — Keep content ownership and entry readiness separate

**Decision**: The chat stream hook exposes local-only metadata for (a) which conversation owns the currently rendered messages and (b) a monotonically advancing history-entry-ready token. The token is emitted only for completed historical hydration, not when a draft is promoted during live streaming.

**Rationale**: On a rapid session change, React can momentarily hold the previous message array while the new hydration effect begins. Ownership prevents that stale array from being visible. A readiness token lets a retry of the same conversation produce a new presentation event and prevents a promoted draft from being mistaken for restored history.

**Alternatives considered**:

- Infer readiness from `hydrationStatus` alone: rejected because it cannot distinguish a previous ready state, a same-session retry, and draft promotion.
- Persist per-session scroll offsets: rejected by product decision; it conflicts with opening at newest content and adds local data lifecycle work.

## Decision 3 — Preserve current stream and accessibility semantics

**Decision**: The entry action uses immediate scrolling only, does not move focus or announce new content, and does not run for live draft promotion. Existing stream follow, user-scroll lock, and manual return-to-bottom behavior remain unchanged.

**Rationale**: The selected sidebar or drawer control retains keyboard focus. The existing loading status already communicates that the conversation is loading. The former stream semantics are independently covered and must not become coupled to navigation hydration.

## Decision 4 — Use a dedicated message viewport as the paging foundation

**Decision**: The chat column has one full-height message viewport. Composer floats at the bottom and is not a flex sibling that reduces this viewport. A `ResizeObserver` measures its actual height, applies it as message-content bottom padding, and only re-pins the viewport when that padding has committed and the user was already at the end. The overlay shell and its lateral blank area pass pointer events through to the message viewport; only the Composer card interaction column captures them.

**Rationale**: The user-visible scrollbar must represent the full message working area, not only the height left after Composer. A dedicated full-height viewport makes the scroll owner explicit and is the expected substrate for tail-first cursor pagination and end-anchored virtualization. The overlay is safe because its exact height is added to message-content padding, rather than being inferred from a fixed constant.

**Layout-growth rule**: Historical Markdown/cards can complete their own measurement after the first hydrated tree commits. Observe the message-content column and re-pin only while the viewport is bottom-pinned; otherwise the earlier `scrollTop = scrollHeight - clientHeight` becomes stale and leaves the scrollbar short of its real bottom.

**Alternatives considered**:

- Flex Composer that reduces the viewport: rejected because the scrollbar ends above the bottom overlay and fails the mobile visual acceptance target.
- Fixed Composer with an estimated `bottomSpacing`: rejected because an estimate fails as the Composer grows. The accepted variant uses a `ResizeObserver` measurement and applies only that exact value as content padding inside the single message viewport.
- Reverse message order / `column-reverse`: rejected because it reverses keyboard and DOM-order semantics and complicates normal-order message rendering.
- Add cursor pagination or virtualization now: deferred; this version establishes the viewport without unneeded API, database, or dependency changes.

## Decision 5 — Mask the Composer overlay and align against the real scrollbar

**Decision**: The floating Composer shell uses a bottom-to-top background gradient and keeps its pointer-event pass-through behavior outside the Composer interaction column. The page measures `offsetWidth - clientWidth` for the message viewport and applies that width as the Composer shell's right inset. Message content bottom padding is Composer height plus 54px.

**Rationale**: An opaque/gradient shell stops message text from showing below the Composer. The message viewport and fixed Composer otherwise center within different widths whenever a native scrollbar consumes layout width, creating a visible horizontal mismatch. Measuring the actual width avoids an incorrect hard-coded scrollbar size and handles overlay scrollbars. Every historical-entry token repeats this measurement rather than inheriting a skeleton or prior-conversation cache, remains hidden until it has committed, then starts on the following frame so a width-induced Composer resize is included in its final correction. The extra 30px after Composer preserves a clearer visual separation at the newest message.

## Decision 6 — Local-first existing-session presentation and stable native gutter

**Decision**: Update the selected existing session locally before the server registry POST resolves, write the current local selected-session value immediately, and retain it if remote persistence fails. A valid local message snapshot becomes `ready` and emits its entry token before the bounded ThreadState request completes. Apply `scrollbar-gutter: stable` to the nested message viewport itself.

**Rationale**: The previous server-confirmed selection state made the old conversation remain current until the POST response arrived, so correct ownership guards could not hide it. The thread route validates that the requested conversation exists without requiring it to be the server-selected one, so the local B view can hydrate safely while preference persistence is pending. Existing local storage/index recovery already supplies B as a registry hint after refresh, making it the reconciliation path without an API change. `scrollbar-gutter: stable` reserves a classic scrollbar's native space before overflow and leaves overlay scrollbar layouts unchanged, so the measured Composer inset remains stable through skeleton-to-history transitions.

**Alternatives considered**:

- Keep server-confirmed selection as the only selected state: rejected because the old conversation remains visibly current through network latency.
- Optimistically select B but roll back to A on persistence failure: rejected by the confirmed product decision; it replaces a network error with a disruptive content reversal.
- Add a new retry API, database field or queue: deferred; existing local selection recovery plus the next registry request is sufficient for this version.
- Use `overflow-y: scroll`: rejected because it forces an empty visible scrollbar track. `scrollbar-gutter: stable` reserves layout only when the platform uses classic scrollbars.

## Decision 7 — Local navigation is independent from write availability and recommendation layout

**Decision**: Treat cached existing-session selection as a local navigation operation, rather than a server mutation. Local-index persistence and selected-preference confirmation run after the local state change in one non-blocking, latest-selection serial queue: it coalesces a rapid A→B switch before A reaches the network, or sends B only after an already-started A POST settles. When the registry is unavailable, run only the local-index portion and retain the existing read-only restriction for create, delete and send. Derive the completed assistant recommendation group from the ready message tree independently of that persistence state.

**Rationale**: Reusing a single `disabled` value for server write availability, in-flight selected-preference confirmation and local navigation makes cached rows visually and functionally unavailable even though their snapshots are usable. It also removes recommendation cards from the initial history tree until the confirmation returns, producing a visible second layout change. Keeping those concerns separate preserves offline browsing and makes the hidden history layout complete before it is revealed.

**Alternatives considered**:

- Enable every sidebar action in a read-only cache: rejected because new/delete operations would appear available but cannot be confirmed safely.
- Wait for selected-preference POST before allowing the next local switch: rejected because it reproduces the disabled-list failure under slow or failed network conditions.
- Fire every selected-preference POST concurrently: rejected because a late A request can overwrite a newer B preference on the server, even if the client ignores A's response.
- Keep recommendations hidden until all sidebar mutations settle: rejected because their late insertion changes the already-visible history height and is the observed flash.

## Product Evidence

- Slack presents both resume-position and newest-message preferences; AI Mind's confirmed v0.5.2 choice is newest-message entry without a preference surface.
- Microsoft Teams directs users to the latest unread message for catch-up; AI Mind has no unread cursor, so latest completed content is its appropriate equivalent.
- The user-provided ChatGPT screenshot is a visual reference only; its text is not a project instruction or a copied product specification.

Sources: [Slack](https://slack.com/help/articles/360043037853-Manage-your-Mark-as-Read-preference), [Microsoft Teams](https://support.microsoft.com/en-US/accessibility/teams/moving-from-microsoft-classic-teams-to-new-teams-for-people-using-a-screen-reader), [React](https://react.dev/reference/react/useLayoutEffect), [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), [MDN Flex](https://developer.mozilla.org/docs/Web/CSS/flex), [MDN scrollbar-gutter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-gutter), [TanStack Chat](https://tanstack.com/virtual/latest/docs/chat).
