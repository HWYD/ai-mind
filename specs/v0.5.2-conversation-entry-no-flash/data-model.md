# Data Model: Conversation Entry Presentation

## Persisted data

v0.5.2 introduces no persisted entity, database migration, API payload field, IndexedDB record, localStorage key, or stream chunk.

## Client-only presentation state

| State                         | Fields                                                      | Lifecycle                                                                                                                                                   | Purpose                                                                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Message ownership             | `conversationId \| null`                                    | Reset when ordinary hydration starts; set only when the message array belongs to that conversation or its promoted live stream                              | Blocks stale messages from a previously selected conversation.                                                                                                                                                                                |
| History entry readiness       | `conversationId`, increasing `sequence`                     | Created only when ordinary history hydration has settled, including a valid local read-only snapshot; reset on a new attempt                                | Identifies one safe-to-position history render and makes a same-conversation retry distinct.                                                                                                                                                  |
| Positioned entry              | consumed readiness `sequence`                               | Held by the page until another ready token arrives                                                                                                          | Reveals hidden history only after message-viewport bottom positioning has run.                                                                                                                                                                |
| Composer overlay inset        | actual Composer border-box height                           | Updated by `ResizeObserver`; discarded on unmount                                                                                                           | Supplies the message content's bottom safe area without changing the message viewport height.                                                                                                                                                 |
| Chat scrollbar width          | `messageViewport.offsetWidth - messageViewport.clientWidth` | Measured on layout, viewport resize, and once for every unconsumed history-entry token; discarded on unmount                                                | Becomes the floating Composer shell's right inset so its content column aligns with the message content column. The viewport itself reserves a stable native gutter, so this value does not oscillate when content first overflows.           |
| Pending selection persistence | `conversationId \| null` ref plus selection generation      | Set after a local existing-session choice and cleared only by its matching registry confirmation; a newer local choice invalidates older registry responses | Records an out-of-band server selected-preference confirmation without rolling the local choice back or disabling local navigation. No new persisted field is created: the existing local selected-conversation value is updated immediately. |

## Transitions

```text
selected existing conversation
  -> local selected id + existing local index value
  -> loading / ownership mismatch: skeleton
  -> current ownership + entry-ready token: hidden real history
  -> layout position committed: visible latest history
  -> server preference confirmation: clear pending persistence

server preference failure
  -> retain local selected id + local snapshot
  -> retry through the next registry recovery or refresh

read-only registry cache + cached A/B
  -> allow local A <-> B selection and local index update
  -> do not create/delete/send or POST selected-preference

late registry response from an earlier selection generation
  -> ignored before it can change UI, localStorage or the local index

draft first turn
  -> promoted live stream ownership: visible live history
  -> no entry-ready token and no navigation skeleton
```

Late results are ignored unless their conversation id is still the selected conversation. A valid local snapshot becomes ready before remote verification and never issues a second entry token; an error without a valid local snapshot remains the existing error state.

The completed latest assistant reply's recommendation group is derived from that ready message tree. It is present during hidden entry layout even while selected-preference persistence is outstanding, so its later completion cannot add a second visible block.

The message viewport's bottom-pinned state is ephemeral hook state. It is neither a saved reading position nor a paging cursor; it determines whether Composer inset or message-content layout growth may keep the newest message aligned.
