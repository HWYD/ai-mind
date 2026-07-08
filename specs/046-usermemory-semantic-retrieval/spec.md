# Feature Specification: AI Mind v0.4.6 UserMemory Semantic Retrieval Baseline

**Feature Branch**: `[046-usermemory-semantic-retrieval]`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "在 v0.4.5 Long-term User Memory Store Baseline 基础上，为当前 browser session 范围内的长期 UserMemory 增加语义召回基线。"

## Summary

v0.4.6 在 v0.4.5 `UserMemory Store` 基线之上，增强长期用户记忆的召回方式：当用户换一种说法表达需求时，系统可以通过语义相关性召回合适的 `UserMemory`，而不是只依赖 `type`、`tags` 和 normalized text overlap。

本版本继续使用 `UserMemory` / 长期用户记忆作为主命名。它表示当前 browser session 范围内、跨 conversations 可复用的长期用户偏好、稳定指令、工作流偏好、反复确认的约束、稳定上下文和项目相关上下文。v0.4.6 只增强召回，不改变 `UserMemory` 的产品语义、写入来源、作用域边界和上下文注入边界。

v0.4.6 的一句话定位是：当前 browser session 范围内的长期用户记忆语义召回基线。

本版本不是知识库 RAG，不是文档问答，不是聊天历史搜索，不是账号级用户画像，也不是独立向量数据库版本。语义召回只能基于干净、校验后的 `UserMemory` 内容，不能把完整聊天记录、raw user message、ThreadState、raw tool result、GraphState 或 RuntimeArtifact 当作语义索引内容。

## Clarifications

### Session 2026-07-08

- Q: 当 semantic retrieval 本身已经成功并且产生了可接受结果时，v0.4.6 要不要再额外跑一次 rule-based retrieval 并合并结果？ → A: 废弃该方向。v0.4.6 确定只做 `PostgresStore` vector semantic search 作为正式召回路径，不再把 rule-based / lexical / metadata signal 作为本版本正式 candidate source。现有 v0.4.5 规则代码可以作为 legacy implementation detail 暂存，但本版不得新增、强化或依赖它作为验收路径。
- Q: v0.4.6 的 semantic retrieval 要不要有一个明确的 feature flag，用来控制启用、灰度、回滚和对比验证？ → A: 选项 B，不需要 feature flag，v0.4.6 落地后默认全量启用。
- Q: v0.4.6 这一版，tool-assisted ordinary chat 要不要和 ordinary text chat 一起作为正式验收范围？ → A: 选项 A，ordinary text chat 和 tool-assisted ordinary chat 都作为本版正式验收范围。
- Q: semantic index 的字段边界如何落地？ → A: v0.4.6 只对 `UserMemory.text` 和 `UserMemory.tags` 建立 semantic vector index；`UserMemory.type` 只作为过滤、排序和展示元信息，不单独向量化。
- Q: Store semantic search 第一版使用哪种模式？ → A: v0.4.6 只使用 `PostgresStore` vector search 作为 semantic path，不使用 `PostgresStore` hybrid/text search。当前本地实现的 hybrid keyword 部分会对完整 `store.value` JSON 做 text search，可能绕过 UserMemory index allowlist；后续如引入 keyword/hybrid，只能使用字段白名单 keyword signal。
- Q: 真实 semantic retrieval 是否支持 InMemoryStore？ → A: 不支持真实语义检索；真实 semantic retrieval 只承诺 `PostgresStore`，`InMemoryStore` 只用于普通本地/单测，单测使用 deterministic semantic behavior。
- Q: embedding provider 是否跟随当前聊天模型选择？ → A: 不跟随；UserMemory semantic retrieval 使用独立 embedding provider runtime config。第一版固定使用火山引擎 Ark OpenAI-compatible 路线的 `doubao-embedding-vision`，复用项目现有 Doubao provider 同一条 `baseUrl` / `api key` 来源，但不能跟随聊天模型选择器自动切换。
- Q: semantic retrieval timeout 第一版设多少？ → A: 默认 1500ms，超时后 fail open，注入 0 条 UserMemory。
- Q: 为了下一版扩展混合搜索，v0.4.6 哪些内容应提前废弃？ → A: 废弃本版 semantic + rule/lexical 并行融合、lexicalScore、matchedFields、rank fusion、rule fallback 验收和新增规则召回增强。下一版 hybrid 应通过字段白名单 keyword signal 正式接入，而不是复用或继续扩展 v0.4.5 手写规则召回。
- Q: v0.4.6 要不要采用 LLM query rewrite / query transformation？ → A: 不采用。虽然 LLM query rewrite 是更广义 RAG / retrieval 里的常见做法之一，但它会为当前长期用户记忆召回引入额外的语义漂移、否定丢失和本次例外条件丢失风险。v0.4.6 直接使用 latest user input 作为临时 retrieval query，只允许做确定性的轻量规范化，不做 LLM 改写。
- Q: semantic score 阈值、topK、过滤顺序、semantic index metadata 落点和长 query 处理第一版怎么定？ → A: 默认 `semantic score >= 0.70` 才能进入最终注入判断，初始 `topK = 8`。过滤顺序固定为：eligibility 判断 → query 轻量规范化与长度裁剪 → browser-session scope → vector semantic search → active/inactive/suppression 过滤 → semantic score 阈值过滤 → stableKey 去重 → conflict handling → context budget selection。`Semantic Index Metadata` 第一版写入 `UserMemory` 的内部 document metadata，而不是 runtime-only 临时状态。长 query 只做确定性处理：`trim`、空白折叠、最多 800 字符；超出时保留前 400 字符和后 400 字符，不做 LLM 改写。
- Q: 如果 tool-assisted ordinary chat 的路径边界判定不清、semantic score 异常，或者 embedding dimensions 这类底层参数需要落地，第一版怎么处理？ → A: 路径边界判定不清时，按不 eligible 处理，直接不触发 UserMemory semantic retrieval。`semantic score` 缺失、`NaN`、异常或不稳定时，按不可安全注入处理，宁可返回 0 条。`embedding dimensions` 属于实现期底层参数，v0.4.6 不把它写成 spec 固定值，只要求与固定的 `doubao-embedding-vision` 官方规格一致。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 回答风格偏好的语义召回 (Priority: P1)

用户曾保存长期记忆：“用户喜欢技术解释先用大白话，再补充专业说明。”之后用户在同一 browser session 的另一个 conversation 中问：“LangGraph Store 是什么？别讲太抽象。”

系统应能识别当前问题和回答风格偏好之间的语义关系，召回这条 `UserMemory`，并把它作为受控补充上下文注入，让回答更符合用户长期偏好。

**Why this priority**: 这是 v0.4.6 最核心的价值：用户不需要重复表达偏好，系统也不要求关键词完全重合。

**Independent Test**: 先保存回答风格偏好，再用不同措辞提出相关技术解释请求。验证系统能选择该 `UserMemory`，且回答风格受到这条长期记忆影响。

**Acceptance Scenarios**:

1. **Given** 当前 browser session 中已有 active UserMemory“用户喜欢技术解释先用大白话，再补充专业说明”，**When** 用户问“LangGraph Store 是什么？别讲太抽象”，**Then** 系统应语义召回该 UserMemory。
2. **Given** 该 UserMemory 被选中，**When** 系统组装模型上下文，**Then** 它只能作为 supplemental context 注入，不得覆盖 latest user message。
3. **Given** selected conversation 仍有自己的 summary、pinnedDecisions 和 recent messages，**When** 注入 UserMemory，**Then** `ThreadState` 仍然是当前 conversation 的短期上下文事实源。

---

### User Story 2 - 饮食偏好的语义召回 (Priority: P1)

用户曾保存长期记忆：“用户不吃香菜。”之后用户问：“今天适合吃什么清淡点？”

系统可以语义召回“不吃香菜”这条长期记忆，避免推荐明显依赖香菜的食物。

**Why this priority**: 这验证了语义召回可以处理偏好和场景之间的间接关系，而不是只处理完全同词匹配。

**Independent Test**: 保存饮食偏好后提出不直接包含“香菜”的饮食建议请求。验证系统能选择相关 UserMemory，并在回答中避开冲突推荐。

**Acceptance Scenarios**:

1. **Given** 当前 browser session 中已有 active UserMemory“用户不吃香菜”，**When** 用户问“今天适合吃什么清淡点”，**Then** 系统可以语义召回该 UserMemory。
2. **Given** 召回结果包含饮食偏好，**When** 系统回答饮食建议，**Then** 不应推荐明显依赖香菜的选择。
3. **Given** 用户当前输入明确指定“这次可以放香菜”，**When** UserMemory 与当前输入冲突，**Then** 当前输入优先。

---

### User Story 3 - 不相关问题不召回 (Priority: P1)

用户保存过“用户不吃香菜”后，又问“解释一下 React Server Components 的边界。”

系统不应因为存在长期记忆就强行注入饮食偏好。没有相关语义关系时，允许选择 0 条 `UserMemory`。

**Why this priority**: 语义召回的底线是少召回也不要乱召回。不相关记忆会污染回答，并削弱用户对长期记忆的信任。

**Independent Test**: 保存饮食偏好后提出无关技术问题。验证模型可见上下文中不包含该饮食偏好。

**Acceptance Scenarios**:

1. **Given** Store 中只有“用户不吃香菜”，**When** 用户问“解释 React Server Components”，**Then** 系统不得注入这条饮食偏好。
2. **Given** semantic search 返回低相关候选，**When** 相关性不足或边界无法判断，**Then** 系统应选择 0 条 UserMemory。
3. **Given** Store 中存在多条记忆，**When** latest user input 只和其中一部分相关，**Then** 系统只能注入通过过滤和预算限制的相关 UserMemory。

---

### User Story 4 - Semantic retrieval 失败时安全降级 (Priority: P1)

当 semantic retrieval 因 embedding provider、Store timeout 或 semantic search 不可用而失败时，普通聊天必须继续。

系统应通过 `PostgresStore` vector semantic search 获取候选，并在过滤、排序和预算控制后选择最终注入结果。若 semantic retrieval 不可用或没有可接受结果，系统安全降级为 0 条 UserMemory 注入。本版本不要求为旧 UserMemory 数据提供兜底召回，也不新增 rule-based / lexical candidate source。

**Why this priority**: 长期记忆召回不能成为普通聊天主链路的单点故障。

**Independent Test**: 模拟 semantic vector retrieval 成功、失败、超时和无可接受结果。验证系统只使用 semantic vector candidates 作为本版正式召回候选；当 semantic retrieval 不可用或没有可接受结果时，系统注入 0 条 UserMemory，不影响 streaming、ThreadState 或 final-turn memory。

**Acceptance Scenarios**:

1. **Given** semantic vector retrieval 返回可接受结果，**When** ordinary chat 继续组装上下文，**Then** 系统应只基于 semantic vector candidates 选择最终注入结果。
2. **Given** semantic vector retrieval 不可用、超时或返回结果不可接受，**When** 用户继续聊天，**Then** 系统应注入 0 条 UserMemory 并继续回答。
3. **Given** v0.4.5 规则召回逻辑仍存在于代码中，**When** v0.4.6 semantic retrieval 失败，**Then** 本版本不要求调用它作为 fallback，也不得把它作为验收成功条件。
4. **Given** embedding 或 Store 抛出内部错误，**When** 用户收到回答，**Then** 不得暴露 raw database、embedding、Store、provider 或 runtime error。
5. **Given** 用户输入很长、包含否定或本次例外条件，**When** 系统发起 retrieval query，**Then** v0.4.6 MUST 直接使用 latest user input，不得先用 LLM 做 query rewrite。

---

### User Story 5 - Suppressed memory 不参与语义召回 (Priority: P1)

用户曾保存“用户喜欢吃桃子”，后来明确说“我现在不太喜欢吃桃子了，以后别按这个推荐。”

后续用户问“推荐几种水果”时，被 suppressed 或 inactive 的旧记忆不应参与 semantic retrieval，也不应被注入。

**Why this priority**: 语义召回必须尊重 v0.4.5 的 conflict / suppression 边界，否则旧偏好会持续干扰新意图。

**Independent Test**: 先保存偏好，再通过明确否定使其 suppressed，随后提出相关问题。验证 suppressed memory 不进入 selected UserMemory。

**Acceptance Scenarios**:

1. **Given** 一条 UserMemory 已被标记为 suppressed 或 inactive，**When** semantic retrieval 命中它，**Then** 系统必须在注入前过滤掉它。
2. **Given** active memory 与 suppressed memory 都语义相关，**When** 系统选择 UserMemory，**Then** suppressed memory 不参与排序和注入。
3. **Given** 多条 UserMemory 互相冲突且无法安全判断，**When** 系统组装上下文，**Then** 应宁愿不注入冲突记忆。

---

### User Story 6 - Tool-assisted ordinary chat 的受控接入 (Priority: P2)

对于仍属于 ordinary chat 边界的 tool-assisted 普通问答，系统 MUST 使用同一套 UserMemory semantic retrieval 规则。UserMemory 只能影响普通回答上下文，不能改变 Tool、MCP、Tasklist 或 Delivery 的权限边界。

**Why this priority**: tool-assisted ordinary chat 是普通问答正式范围的一部分；如果这一类请求不进入正式验收，用户的长期偏好体验会在常见工具场景里出现断层。

**Independent Test**: 在 tool-assisted ordinary chat 中提出与长期偏好相关的问题。验证 UserMemory 可以作为回答上下文使用，但不改变工具调用权限、raw tool input 或 Tasklist / Delivery 边界。

**Acceptance Scenarios**:

1. **Given** 当前请求属于 tool-assisted ordinary chat，**When** 它仍在 ordinary chat context boundary 内，**Then** 系统 MUST 使用 UserMemory semantic retrieval。
2. **Given** UserMemory 被选中，**When** 工具调用执行，**Then** UserMemory 不得改变 tool authority 或 raw tool input 的安全边界。
3. **Given** 请求进入 Tasklist、Delivery、HITL checkpoint 或 workflow progress path，**When** 系统处理该请求，**Then** 不得默认接入 UserMemory semantic retrieval。

### Edge Cases

- 当前 browser session 没有任何 UserMemory：semantic retrieval 返回空选择，普通聊天继续。
- semantic search 失败：普通聊天继续；本版本安全降级为 0 条 UserMemory 注入，不要求 rule-based / lexical fallback。
- `PostgresStore` hybrid/text search 可用但不应作为本版 semantic path：当前 hybrid keyword 部分会对完整 `store.value` JSON 做 text search，可能绕过 semantic index allowlist。
- embedding provider 不可用：普通聊天继续，不破坏 UserMemory Store。
- Store timeout：停止等待长期记忆召回，继续普通聊天。
- 用户输入很长：可以做确定性长度控制或轻量规范化，但不得用 LLM 改写 query。
- semantic score 不可用或不稳定：不得盲目信任分数，应保守选择或注入 0 条。
- semantic retrieval 返回过多结果：必须经过 topK、budget、active、confidence 和 suppression 过滤。
- semantic retrieval 命中 suppressed 或 inactive memory：不得注入。
- UserMemory 与当前用户输入冲突：当前用户输入优先。
- 多条 UserMemory 相互冲突：active 优先；updatedAt 较新的 memory 优先；仍无法判断时不注入冲突记忆。
- 新写入的 UserMemory 尚未完成 semantic indexing：不影响普通聊天；本版本允许注入 0 条 UserMemory。
- v0.4.5 或更早版本已有 UserMemory：本版本不要求兼容、不要求补建 semantic index，也不要求通过 rule-based / lexical signal 兜底召回。
- latest user input 用作 retrieval query：只能临时使用，不能持久化成 semantic index 内容、长期记忆内容、hydration payload、stream payload 或持久化 debug 数据。
- hydration、sidebar list loading 或 conversation switching：不得触发 UserMemory semantic retrieval。
- Tasklist / Delivery 路径：不得默认接入 UserMemory semantic retrieval。

## Requirements _(mandatory)_

### Functional Requirements

#### Product Boundary

- **FR-046-001**: System MUST 继续使用 `UserMemory` / 长期用户记忆 作为主实体命名。
- **FR-046-002**: System MUST 将 v0.4.6 定义为对 v0.4.5 的召回增强，而不是新的 memory 产品类别。
- **FR-046-003**: System MUST 保持 UserMemory 为 browser-session scoped。
- **FR-046-004**: System MUST NOT 将 UserMemory semantic retrieval 视为 account-level memory、cross-device memory、global user profile 或 global personalization。
- **FR-046-005**: System MUST 保持 `ThreadState` 为 selected conversation 的短期上下文事实源。
- **FR-046-006**: System MUST 保持 `UserMemory Store` 为跨 conversations 的长期用户记忆边界。
- **FR-046-007**: System MUST 将 semantic retrieval 保持为 UserMemory 的召回增强能力，而不是 knowledge-base RAG 或 chat-history search。

#### Semantic Retrieval

- **FR-046-008**: System MUST 支持 ordinary text chat 的 UserMemory semantic retrieval。
- **FR-046-009**: 当请求仍处于 ordinary chat context boundary 内时，System MUST 支持 tool-assisted ordinary chat 的 UserMemory semantic retrieval。
- **FR-046-010**: System MUST NOT 默认在 Tasklist Agent、Delivery Chain、Delivery Manager、HITL checkpoint / resume path、workflow progress path、MCP raw resource path、frontend hydration、sidebar conversation list 或 conversation switching 中启用 UserMemory semantic retrieval。
- **FR-046-011**: System MUST 只将 latest user input 临时用作 semantic retrieval query。
- **FR-046-012**: System MUST NOT 将 latest user input 持久化为 semantic index content、long-term memory content、hydration payload、stream payload 或持久化 debug 数据。
- **FR-046-012A**: v0.4.6 MUST NOT 对 latest user input 执行 LLM query rewrite、query transformation、HyDE、query expansion 或其他生成式 retrieval preprocessing。System MAY 只做确定性的轻量规范化，例如 trim、空白折叠和安全长度限制。
- **FR-046-012B**: latest user input 在进入 semantic retrieval 前 MUST 做确定性的轻量规范化：trim、空白折叠，以及最多 800 字符的安全长度限制；超过上限时 MUST 保留前 400 字符和后 400 字符。System MUST NOT 因长 query 触发 LLM 改写或生成式压缩。
- **FR-046-013**: System MUST 只从当前 browser session namespace 中检索 UserMemory。
- **FR-046-014**: 在任何 UserMemory 注入前，System MUST 对 semantic vector candidates 应用 active status、confidence、suppression、topK 和 context budget 过滤。
- **FR-046-014A**: v0.4.6 的 semantic retrieval 初始 candidate topK MUST 默认设为 8。
- **FR-046-014B**: v0.4.6 的最终 injected candidate MUST 满足 `semantic score >= 0.70`；当 score 缺失、异常或不稳定时，System MUST 保守降权或不注入。
- **FR-046-014C**: v0.4.6 的正式过滤顺序 MUST 为：retrieval eligibility 判断 → query 轻量规范化与长度裁剪 → browser-session namespace 限定 → `PostgresStore` vector semantic search → active/inactive/suppression 过滤 → semantic score 阈值过滤 → `stableKey` 去重 → conflict handling → context budget selection。
- **FR-046-015**: 当不存在相关 memory 时，System MUST 允许 0 条 UserMemory 注入。
- **FR-046-016**: System SHOULD 优先选择更少但高置信的 UserMemory，而不是更宽泛的低置信召回。
- **FR-046-017**: System MUST 使用 `PostgresStore` vector semantic search 作为 v0.4.6 唯一正式 UserMemory retrieval candidate source。
- **FR-046-017B**: System MUST NOT 在 v0.4.6 中新增、强化或正式依赖 rule-based / lexical / metadata candidate source。
- **FR-046-017C**: 当 semantic vector retrieval 不可用，或没有可接受候选时，System MUST 安全降级到 0 条 UserMemory 注入。
- **FR-046-017D**: 现有 v0.4.5 rule-based retrieval MAY 作为 legacy implementation detail 暂存，但 MUST NOT 成为 v0.4.6 semantic retrieval acceptance、fallback 或 hybrid 预实现。
- **FR-046-017E**: 在 v0.4.6 版本收口前，legacy rule-based / lexical runtime wiring MUST 从正式代码链路和正式验收依赖中清除。允许存在未被调用的历史代码只作为过渡，但 release-closing 状态不得再由任何正式 runtime path、test acceptance path 或 config path 触发。
- **FR-046-017A**: System MUST 在执行 semantic retrieval 或 embedding query 之前先判断 UserMemory retrieval eligibility。被排除的 runtime path MUST NOT 触发 semantic retrieval，即使结果后续会被丢弃。
- **FR-046-017F**: 当 runtime 无法明确证明当前请求仍处于 ordinary chat context boundary 内时，System MUST 将其视为 UserMemory retrieval ineligible，并且 MUST NOT 触发 semantic retrieval 或 embedding query。

#### LangGraph Store Semantic Search Direction

- **FR-046-018**: System MUST 将 `LangGraph Store semantic search` 保持为 v0.4.6 的 semantic retrieval 需求方向。
- **FR-046-019**: System MUST NOT 将 `PGVectorStore`、`pgvector`、Milvus、Qdrant、Pinecone 或独立向量数据库定位为 AI Mind v0.4.6 的产品路线。
- **FR-046-020**: 如果底层 semantic search 能力需要 storage-level support，这一细节 MUST 在 planning 阶段确认，但不能改变本版本的产品边界。
- **FR-046-020A**: v0.4.6 MUST NOT 依赖 feature flag 才能启用 semantic retrieval；该能力在本版本落地后默认全量启用。
- **FR-046-020B**: v0.4.6 MUST 使用 `PostgresStore` vector search 作为真实 semantic retrieval Store path；System MUST NOT 使用 `PostgresStore` hybrid/text search 作为本版 semantic path。
- **FR-046-020D**: Future versions MAY introduce field-allowlisted keyword / hybrid retrieval signal, but MUST NOT search full `UserMemory` document JSON or raw `store.value::text`.
- **FR-046-020C**: 真实 semantic retrieval MUST 只承诺 `PostgresStore`；`InMemoryStore` MAY 用于普通本地开发和 deterministic tests，但 MUST NOT 被表达为真实线上 semantic search 能力。

#### Write Boundary

- **FR-046-021**: v0.4.6 中，System MUST NOT 新增 UserMemory 写入来源。
- **FR-046-022**: System MUST 保持 v0.4.5 的写入边界：eligible ordinary turn extraction、将 explicit memory intent 作为强信号、可选的 pinnedDecision promotion、deterministic validation、stable key / dedupe，以及 suppression / conflict handling。
- **FR-046-023**: System MUST 将 explicit memory intent 视为高优先级信号，但在 v0.4.5 既有边界下，explicit memory intent MUST NOT 成为唯一可能来源。
- **FR-046-024**: System MUST NOT 仅因为启用了 semantic retrieval，就从每个 assistant turn 自动抽取长期记忆。
- **FR-046-025**: System MUST NOT 向量化 full conversation transcript、`ThreadState.messages`、raw assistant final text、raw tool result、GraphState、RuntimeArtifact、workflow progress、raw prompt、provider response、API key、cookie 或 provider config。

#### Semantic Index Content Boundary

- **FR-046-026**: System MUST 只基于干净、经过校验的 UserMemory 内容构建 semantic retrieval。
- **FR-046-027**: Semantic vector index content MUST 只包含 `UserMemory.text` 和 `UserMemory.tags`。
- **FR-046-027A**: `UserMemory.type` MAY 用作 filtering、ranking 和 display metadata，但 MUST NOT 在 v0.4.6 中作为 standalone vector field 建立 semantic index。
- **FR-046-028**: Semantic index content MUST NOT 包含完整 conversation transcript、`ThreadState.messages`、raw `ThreadState.summary`、raw `ThreadState.pinnedDecisions`、raw user message、raw assistant final text、raw tool result、MCP raw envelope、GraphState、RuntimeArtifact、workflow progress、provider response、raw prompt、API key、cookie、provider config、sourceConversationId、debug metadata 或 suppression reason。
- **FR-046-029**: Semantic index MUST 基于显式 allowlist 的 UserMemory 字段构建。System MUST NOT 索引完整的 UserMemory document JSON。
- **FR-046-029A**: v0.4.6 的 `Semantic Index Metadata` MUST 写入 UserMemory 内部 document metadata；System MUST NOT 仅依赖 runtime-only 临时状态表达 semantic indexing 结果。
- **FR-046-030**: active 且 validated 的 UserMemory 在完成索引后 SHOULD 具备 semantic retrieval eligibility。
- **FR-046-031**: 即使曾经被 indexed，suppressed 或 inactive 的 UserMemory 也 MUST NOT 参与 semantic retrieval 注入。
- **FR-046-032**: v0.4.6 MUST NOT 要求为本版本之前创建的 UserMemory 数据做 compatibility migration、semantic reindex 或 rule-based / lexical fallback。

#### Embedding Provider Boundary

- **FR-046-033**: System MUST 支持独立的 UserMemory embedding provider 配置。
- **FR-046-034**: Development 环境 SHOULD 支持真实 embedding provider，用于本地 semantic recall 验证。
- **FR-046-035**: Automated tests MUST 支持稳定、可预测的语义行为，不能依赖外部 API、网络、费用或不稳定的语义结果。
- **FR-046-036**: 当 API key 和网络条件可用时，integration 或 acceptance 验证 MAY 使用真实 embedding provider。
- **FR-046-037**: 测试用 embedding 行为 MUST NOT 被视为线上产品能力。
- **FR-046-038**: 如果 embedding provider 不可用，System MUST 降级为 0 条 UserMemory 注入；本版本不要求 rule-based / lexical fallback。
- **FR-046-039**: embedding 失败 MUST NOT 破坏 ordinary chat、streaming、selected conversation ThreadState、final-turn memory 或 UserMemory Store。
- **FR-046-039A**: UserMemory semantic retrieval MUST 使用独立 embedding provider runtime config；它 MUST NOT 跟随当前聊天模型选择器自动切换 embedding model。
- **FR-046-039B**: v0.4.6 的默认真实 embedding provider 路线 MUST 使用火山引擎 Ark OpenAI-compatible embedding path，并固定使用 `doubao-embedding-vision` 作为第一版 embedding model。该能力 MAY 复用项目现有 Doubao provider 同一条 `baseUrl` / `api key` 来源，但 MUST 保持为独立的 UserMemory semantic retrieval config。
- **FR-046-039C**: v0.4.6 MUST NOT 将 `embedding dimensions` 写成产品级 spec 固定值；若底层 Store 或 provider 需要 dimensions，System MUST 使用与 `doubao-embedding-vision` 官方规格一致的实现期配置。
- **FR-046-040**: embedding provider MAY 只接收 semantic retrieval 所允许的最小文本：干净的 UserMemory 内容和临时 retrieval query。
- **FR-046-041**: embedding provider MUST NOT 接收 full transcript、full ThreadState、raw tool result、MCP raw resource content、GraphState、RuntimeArtifact、raw prompt、provider response、API key、cookie、provider config 或 debug metadata。
- **FR-046-042**: System MUST NOT 向 frontend 用户暴露 raw embedding vectors。
- **FR-046-043**: System MUST NOT 将 embedding vectors 放入 hydration payload、stream payload 或 public reducer state。
- **FR-046-044**: embedding request logs MUST NOT 持久化 raw query text、raw UserMemory text、embedding vectors、provider response 或 provider error payload。

#### Context Injection Boundary

- **FR-046-045**: Selected UserMemory MUST 只作为有边界的 supplemental context 注入。
- **FR-046-046**: 除非在 plan 阶段明确修改，v0.4.6 MUST 保持 v0.4.5 的注入限制：最多 3 条 UserMemory、每条最多 300 个中文字符、总计最多 900 个中文字符，且 confidence >= 0.7。
- **FR-046-047**: semantic retrieval 成功后，System MUST NOT 绕过 relevance threshold、active / confidence / suppression 过滤、memory-type guardrail 或 context budget。
- **FR-046-048**: 如果 semantic retrieval 过滤后没有可接受的 UserMemory，System MUST 允许 0 条 UserMemory 注入。
- **FR-046-049**: System MUST 保持 selected conversation ThreadState 为当前短期上下文事实源。
- **FR-046-050**: latest user message MUST 始终高于 selected UserMemory。
- **FR-046-051**: UserMemory MUST NOT 覆盖当前用户输入。
- **FR-046-052**: UserMemory MUST NOT 取代 selected conversation summary、pinnedDecisions 或 recent messages。
- **FR-046-053**: UserMemory MUST NOT 将其他 conversation 的完整 messages 带入当前 conversation。
- **FR-046-054**: UserMemory MUST NOT 进入 hydration payload。
- **FR-046-055**: 当多条 UserMemory 相互冲突时，active memory SHOULD 优先；如果 active entries 仍然冲突，updatedAt 更新更晚的 memory SHOULD 优先；如果仍无法安全判断，System SHOULD 不注入这些冲突记忆。

#### Failure Degradation And Non-regression

- **FR-046-056**: UserMemory semantic retrieval MUST 保持为 runtime-controlled。主 assistant 在 v0.4.6 中 MUST NOT 获得 semantic-memory-search tool。
- **FR-046-057**: UserMemory semantic retrieval MUST NOT 成为 ordinary chat 的单点故障。
- **FR-046-058**: semantic retrieval 失败 MUST NOT 影响 selected conversation ThreadState、final-turn memory、streaming 或用户已完成的回答。
- **FR-046-059**: System MUST NOT 向用户暴露 raw database、embedding、Store、provider、API key、cookie 或内部 runtime error。
- **FR-046-060**: System MUST 保持 v0.4.5 的 UserMemory 写入行为兼容。
- **FR-046-061**: System MUST 保持 v0.4.4 的 Conversation Registry 行为不变。
- **FR-046-062**: System MUST 保持 per-conversation ThreadState isolation 不变。
- **FR-046-063**: System MUST 保持 v0.4.3 的 final-turn memory 行为兼容。
- **FR-046-064**: System MUST 保持 Tasklist checkpoint / resume semantics 不变。
- **FR-046-065**: System MUST 保持 Delivery run-local semantics 不变。
- **FR-046-066**: System MUST 保持 stream-core chunk union 不变。
- **FR-046-067**: System MUST 保持 frontend reducer public shape 不变。
- **FR-046-068**: System MUST 将 tool-assisted ordinary chat 纳入 v0.4.6 的正式验收范围，但其接入不得改变 Tool、MCP、Tasklist 或 Delivery 的权限边界。

### Key Entities _(include if feature involves data)_

- **UserMemory**: 当前 browser session 范围内、可跨 conversations 复用的长期用户记忆。它表示经过验证的长期用户偏好、稳定用户背景、稳定指令、工作流偏好、反复确认约束、项目相关上下文或风险控制偏好。
- **Semantic Retrieval Request**: 一次基于 latest user input 发起的长期用户记忆语义召回请求。latest user input 只临时作为 query 使用，不进入长期索引或公开 payload。
- **Selected UserMemory**: 某次 eligible chat request 中最终被选中的少量 UserMemory。它必须经过 browser-session scope、active、confidence、suppression、topK 和 budget 过滤，只能作为 supplemental context 注入。
- **Embedding Provider**: 为 semantic retrieval 提供语义表示能力的 provider。它只能接收最小、干净、允许参与语义召回的文本。
- **Semantic Index Content**: 允许进入语义向量索引范围的干净 UserMemory 内容。它可以来自 `UserMemory.text` 和 `UserMemory.tags`；`UserMemory.type` 只作为过滤、排序和展示元信息，不能作为 standalone vector field；semantic index content 不能来自 raw conversation 或 raw runtime state。
- **Semantic Index Metadata**: 描述 UserMemory 是否具备 semantic retrieval eligibility 的元信息。第一版必须写入 UserMemory 内部 document metadata，而不是只保留 runtime-only 临时状态；它不能包含 raw transcript、raw runtime state、debug metadata、sourceConversationId 或敏感配置。
- **Deprecated Rule-based / Lexical Retrieval**: v0.4.5 的规则召回能力在 v0.4.6 中不再作为正式 candidate source。它可以作为 legacy implementation detail 暂存，但本版本不新增、不强化、不验收、不作为 fallback。下一版 hybrid 应通过字段白名单 keyword signal 正式接入。
- **Retrieval Query**: v0.4.6 的 retrieval query 直接来自 latest user input。它只允许做确定性的轻量规范化，不允许 LLM query rewrite、query expansion 或生成式改写。
- **ThreadState**: selected conversation 的短期上下文事实源。它继续承载当前 conversation 的短期上下文，不接收 UserMemory、embedding vector 或 semantic retrieval 内部数据。

## Scope Boundaries

### In Scope

- 当前 browser session 范围内的 UserMemory semantic retrieval。
- `LangGraph Store semantic search` 作为语义召回需求方向。
- ordinary text chat 的语义召回。
- tool-assisted ordinary chat 在 ordinary chat context boundary 内的受控语义召回。
- `PostgresStore` vector semantic search 作为唯一正式召回路径。
- active / confidence / suppression / topK / budget 过滤。
- `semantic score >= 0.70` 的保守阈值。
- 初始 `topK = 8` 的小候选集策略。
- 只对干净、校验后的 UserMemory 内容建立 semantic retrieval 能力。
- latest user input 作为临时 retrieval query。
- embedding provider 的最小数据边界。
- semantic retrieval failure safe degradation。
- semantic retrieval eligibility 必须在 embedding query 或 semantic search 前完成判断。
- v0.4.5 UserMemory 写入边界和上下文注入边界 non-regression。

### Non-Goals

- 完整 RAG 知识库。
- 文档上传。
- document chunk。
- citation。
- reranker。
- query rewrite agent。
- LLM query rewrite / query transformation / HyDE / query expansion。
- 聊天历史语义搜索。
- 向量化 conversation messages。
- 向量化完整 ThreadState。
- 向量化完整 transcript。
- 向量化 raw user message 作为长期索引内容。
- 向量化 raw assistant final text。
- 向量化 raw tool result。
- 向量化 MCP raw resource content。
- 向量化 GraphState。
- 向量化 RuntimeArtifact。
- 将 `PGVectorStore`、`pgvector`、Milvus、Qdrant、Pinecone 或独立向量库作为 v0.4.6 产品主路线。
- 账号级长期记忆。
- 跨设备同步。
- 用户全局画像。
- Memory Inspector。
- memory edit UI。
- memory delete UI。
- 向量搜索结果 UI 面板。
- 大规模 batch re-embedding 管理后台。
- 为旧 UserMemory 数据提供 semantic reindex、兼容迁移或 rule-based / lexical fallback 召回承诺。
- 新增或强化 rule-based retrieval / lexical candidate source。
- semantic + lexical 并行融合、RRF、rank fusion、lexicalScore、matchedFields。
- 默认接入 Tasklist / Delivery。
- 修改 stream-core chunk union。
- 修改 frontend reducer public shape。
- 新增 UserMemory 写入来源。
- 每轮 assistant turn 自动长期记忆抽取。
- 向前端暴露 embedding vector。
- 在 hydration 或 stream payload 中携带 embedding vector。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-046-001**: 已保存的回答风格偏好，在用户换一种说法提出相关技术解释请求时，能够被选中为 UserMemory supplemental context。
- **SC-046-002**: 已保存的饮食偏好，在用户提出相关饮食建议请求时，能够被选中为 UserMemory supplemental context。
- **SC-046-003**: 不相关长期记忆在无关的 ordinary chat 请求中，被注入 UserMemory 的次数为 0。
- **SC-046-004**: suppressed 或 inactive 的 UserMemory，最终被注入的次数为 0。
- **SC-046-005**: 当 semantic vector retrieval 返回可接受结果时，系统只基于 semantic vector candidates 选择最终注入的 UserMemory。
- **SC-046-006**: 当 semantic vector retrieval 失败、超时或无可接受结果时，ordinary chat 仍能完成，并注入 0 条 UserMemory。
- **SC-046-007**: embedding provider 不可用时，ordinary chat、streaming、ThreadState、final-turn memory 和 UserMemory Store 均不被破坏。
- **SC-046-008**: UserMemory、embedding vector 和 semantic retrieval internals 出现在 ThreadState、hydration payload、Conversation Registry、stream-core chunks、frontend reducer public shape 中的次数为 0。
- **SC-046-009**: 完整 transcript、conversation messages、完整 ThreadState、raw user message、raw assistant final text、raw tool result、MCP raw resource content、GraphState 和 RuntimeArtifact 被当作 semantic index content 使用的次数为 0。
- **SC-046-010**: Tasklist / Delivery 的 checkpoint、resume、run-local、workflow progress 和 GraphState 边界不会因 v0.4.6 改变。
- **SC-046-011**: 当当前用户输入与长期记忆冲突时，当前用户输入优先。
- **SC-046-012**: v0.4.5 的 explicit memory intent strong signal、pinnedDecision promotion、deterministic validation、stable key / dedupe、suppression / conflict handling 和 bounded context injection 语义保持兼容；v0.4.5 rule-based retrieval 不作为 v0.4.6 正式验收路径。
- **SC-046-015**: v0.4.6 的正式代码链路、正式验收和 release-closing 状态中，rule-based / lexical retrieval 被 runtime 触发的次数为 0。
- **SC-046-016**: v0.4.6 的 semantic retrieval query 在正式实现中直接来自 latest user input；LLM query rewrite、query transformation、HyDE 或 query expansion 被调用的次数为 0。
- **SC-046-013**: v0.4.6 落地后，ordinary text chat 的 semantic retrieval 默认可用，不依赖 feature flag 才能进入验收范围。
- **SC-046-014**: tool-assisted ordinary chat 在 ordinary chat context boundary 内，与 ordinary text chat 一样进入正式验收范围，且不会改变 Tool、MCP、Tasklist 或 Delivery 的权限边界。

## Assumptions

- v0.4.6 不新增 UserMemory 写入来源，只增强召回方式。
- v0.4.6 不要求兼容、补建旧 UserMemory 的 semantic index，也不要求为旧数据提供 rule-based / lexical fallback 召回；验收范围以本版本后具备 semantic eligibility 的 UserMemory 为准。
- `LangGraph Store semantic search` 在当前项目依赖中具备 `PostgresStore` vector search 入口；v0.4.6 只采用 vector search，不采用 hybrid/text search。当前本地 `PostgresStore` hybrid keyword path 会对完整 `store.value` JSON 做 text search，不符合本版本字段白名单边界。
- `PGVectorStore`、`pgvector` 和独立向量数据库不是 v0.4.6 的产品主路线；`pgvector` 只作为 `PostgresStore` semantic search 的底层存储能力要求出现。
- v0.4.6 不通过 feature flag 灰度或关闭 semantic retrieval；默认按本版范围直接启用。
- ordinary text chat 和 tool-assisted ordinary chat 都是 v0.4.6 的正式验收范围；前提是 tool-assisted ordinary chat 不突破 ordinary chat context boundary。
- automated tests 需要稳定语义行为，但测试用 deterministic embedding / semantic behavior 不代表线上产品能力。
- 真实 semantic retrieval 只承诺 `PostgresStore`；`InMemoryStore` 只用于普通本地开发和 deterministic tests。
- 第一版 embedding provider 使用独立 UserMemory runtime config，不跟随聊天模型选择器；默认走火山引擎 Ark OpenAI-compatible 路线，固定 model id 为 `doubao-embedding-vision`，并复用项目现有 Doubao provider 同一条 `baseUrl` / `api key` 来源。
- 若 runtime 无法明确判断某次 tool-assisted 请求仍属于 ordinary chat boundary，则按不 eligible 处理，不触发 semantic retrieval。
- semantic retrieval timeout 默认 1500ms。
- debug log 可以在 development 更详细，但仍不得记录 raw query、raw UserMemory text、embedding vector、provider response 或 provider error payload。
- latest user input 可以临时用于 semantic retrieval query，但不能被持久化为长期索引内容或长期记忆。
- latest user input 在 v0.4.6 中直接作为 retrieval query 使用，不经过 LLM query rewrite；只允许做 trim、空白折叠和最多 800 字符的确定性长度裁剪，超出时保留前 400 字符和后 400 字符。
- v0.4.6 的默认 semantic score 阈值为 `0.70`，初始 topK 为 `8`。
- `semantic score` 缺失、`NaN`、异常或不稳定时，按不可安全注入处理，宁可返回 0 条 UserMemory。
- `embedding dimensions` 属于实现期底层配置，不写成产品级 spec 固定值；只要求与 `doubao-embedding-vision` 官方规格一致。
- semantic index metadata 第一版写入 UserMemory 内部 document metadata，而不是 runtime-only 临时状态。
- UserMemory 仍然只作为 supplemental context；latest user message、selected conversation summary、pinnedDecisions 和 recent messages 的短期上下文地位不因本版本改变。
- 后续如需要真正 keyword / hybrid search，应作为字段白名单 keyword signal 引入，只能搜索干净 UserMemory 字段或派生的 clean search payload，不能搜索完整 Store JSON；不得复用 v0.4.5 手写 rule-based retrieval 作为 hybrid keyword path。

## Open Questions

- 下一版 hybrid 的 keyword signal 字段、中文分词策略和 rank fusion 权重需要在下一版 plan 中确认；v0.4.6 不预实现。
- 后续版本是否需要在 hybrid 稳定之后再评估 constrained LLM query rewrite，需要下一版或更后续版本确认；v0.4.6 不评估落地。

## Spec Boundary Summary

v0.4.6 只做 `UserMemory` 的语义召回增强。它让当前 browser session 范围内、已经清洗和验证过的长期用户记忆更容易在用户换一种说法时被召回，但不改变长期记忆的写入来源、作用域、上下文注入边界和失败降级原则。

本版本的关键边界是：可以临时用 latest user input 查询；只能通过字段白名单索引干净的 UserMemory；semantic retrieval 失败要安全降级到 0 条 UserMemory 注入；suppressed / inactive memory 不参与注入；Tasklist / Delivery 不触发 semantic retrieval；不把系统扩展成知识库 RAG、聊天历史语义搜索、账号级用户画像或独立向量数据库版本。
