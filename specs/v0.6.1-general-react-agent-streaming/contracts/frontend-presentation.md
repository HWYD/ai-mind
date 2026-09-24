# Contract: Frontend Presentation

## Layout model

一个 General Agent assistant message 包含：

1. lifecycle header / optional Trace disclosure；
2. 按 `message.parts` ordinal 投影的 Trace 时间线（如存在）；
3. final answer Markdown（解析后在 Trace 外显示）；
4. existing message actions/artifacts。

底层 `message.parts` 保持 event ordinal；view 可把 pending/commentary 与 Tool 等投影进 Trace，但不得改变 Part identity、将新 arrival 插入旧行之前，或把 final answer 复制一份。Tool 已有的 source/owner child 容器是唯一允许脱离顶层平铺顺序的例外：安全 read source list MUST 直属于产生它的 `read-url` Tool 行之后，不得作为 Trace 末尾的聚合 footer。

## Header state

| Run status                                 | Label      | Shimmer | Default disclosure                 |
| ------------------------------------------ | ---------- | ------- | ---------------------------------- |
| running                                    | 正在思考   | yes     | 有详情时展开；无详情无箭头         |
| completed + `finalizationMode=normal`      | 已完成思考 | no      | 自动收起一次；无详情保留标题无箭头 |
| cancelled                                  | 已停止思考 | no      | 有详情时展开                       |
| failed                                     | 处理未完成 | no      | 有详情时展开                       |
| completed + `finalizationMode=constrained` | 处理未完成 | no      | 有详情时保持展开；不自动收起       |

`hasFoldableDetails=false` 时 header 是非交互文本，不渲染 chevron/CollapsibleTrigger，不进入 tab order。为 true 时整行是 button，右箭头=collapsed、下箭头=expanded，并设置 `aria-expanded`、`aria-controls`、可见 focus。

## Part presentation

| Part                             | Placement                                                    | Foldable | Final-content consumer                                                  |
| -------------------------------- | ------------------------------------------------------------ | -------- | ----------------------------------------------------------------------- |
| pending AgentTextPart            | 无 detail 时 header 下；有 detail 时 Trace chronological row | no       | no                                                                      |
| completed/interrupted commentary | Trace chronological row                                      | yes      | no                                                                      |
| completed final_answer           | Trace 外 Markdown                                            | no       | yes；`constrained` 仍可被 copy/feedback/follow-up 消费，但不可写 Memory |
| Tool/Skill/Resource/Prompt       | Trace flat row                                               | yes      | no                                                                      |
| read sources                     | owning `read-url` Tool row 后的直属 source list              | yes      | no                                                                      |

所有 public Agent text 支持现有安全 Markdown renderer，并从首个 delta 使用与 final answer 相同的正文排版、字号和行高；`pending`/`commentary` 不显示 Sparkles 或其他过程图标，也不使用 raw reasoning 标签。Tool row 不新增 chevron 或 nested disclosure，保留现有图标、单行状态；每个完成的 `web-search` 行只显示其自身安全 discovered source 的去重数，不公开 raw query/input，也不得复用 Trace 聚合搜索数。其既有安全来源容器作为直属 owner child 保持原样，并随所属 Tool 出现在后续顶层事件之前。

## Disclosure transitions

1. active Run 首个 foldable detail 出现且 `userOverride=none`：open=true。
2. 用户 toggle：记录 `userOverride=open|closed`；后续事件不覆盖。
3. pending 在 turn end 解析为 `normal` final_answer：若尚未 auto-collapse 且 user 未主动保持 open，则 open=false、`autoCollapsedForFinal=true`。`constrained` finalizer 的 final_answer 不触发自动折叠，header 保持“处理未完成”。
4. completed 后用户可再次 toggle。
5. refresh 恢复 completed snapshot：有详情默认 closed，不恢复 userOverride。`constrained` 的 header 仍为“处理未完成”，但与 normal completed snapshot 一样默认 closed。
6. pending→commentary：Part 在相同 `partId` 与 ordinal 上保留在 Trace；pending→final：Part 从其运行期位置（有 detail 时为 Trace 时间线；无 detail 时为标题下正文）投影切换到 Trace 外 final answer，React key 必须保持 `partId`，且两处 MUST 复用同一正文 renderer，避免视觉样式跳变。

## Required sequences

### Tool then final

- header running/expanded；Tool flat row；pending final text 追加在 Tool 后并采用正文 Markdown；resolution 后 header completed/Trace collapsed once；final remains Trace 外可见。

### Text then Tool then final

- early text visible pending；出现 Tool 前后所有新 part 继续按 ordinal 追加；turn end 将同一 Part 转为 commentary 并使 Trace foldable；Tool row随后显示；last pending becomes final。

### Tool, commentary, Tool, final

- Trace order exactly Tool 1 → commentary → Tool 2；final outside Trace；no commentary is nested under Tool 1/2。

### Only final

- running header without arrow；pending text streams immediately并采用正文 Markdown；resolution changes header to completed without arrow；最终正文显示在 Trace 外，视觉排版保持一致。

### Constrained finalizer

- pre-existing interrupted commentary/Tool Trace remains visible；finalizer final answer is rendered outside Trace as normal Markdown；header remains “处理未完成” and expanded；no technical badge is added around the final answer, but its body states the completed evidence scope or limitation。

### Constrained snapshot restore

- snapshot 保留 constrained provenance、final answer 与 completed public-safe Trace row，丢弃 interrupted/pending row；刷新后 header 仍为“处理未完成”，若有保留详情则默认收起，用户可自行展开。

## Accessibility

- disclosure button must have accessible name equal to current header label；
- keyboard Enter/Space toggles；
- `aria-controls` target ID stable by runId；
- no interactive wrapper when no details；
- status must not rely only on chevron/color/shimmer；
- `prefers-reduced-motion` follows existing shimmer/collapse behavior；
- streamed Markdown announcements follow existing app policy and must not repeatedly announce entire accumulated text。

## Deferred Tool detail

Pencil `Nested Trace Row Disclosure` MUST be visually annotated Deferred or excluded from implementation handoff. v0.6.1 Tool rows remain flat. No hidden hover/raw output affordance may bypass this decision。
