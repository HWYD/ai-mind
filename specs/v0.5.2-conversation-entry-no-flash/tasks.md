# Tasks: Conversation Entry Without Scroll Flash

**Input**: Design documents from `specs/v0.5.2-conversation-entry-no-flash/`
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: 本版本改变用户可见的会话进入与滚动行为，测试先行是必需项。每项新增断言应先在现有实现上失败，再实施最小生产改动。

## Phase 1: Test Baseline

- [x] T001 [P] [US1] 在 `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx` 为当前消息归属和已有会话历史就绪 token 增加失败回归测试，覆盖正常恢复、只读本地快照和失败不发 token。
- [x] T002 [P] [US2] 在 `apps/webapp/tests/components/instamind/use-chat-auto-scroll.test.tsx` 为无动画的会话进入到底定位及可取消 animation-frame 修正增加失败回归测试。
- [x] T003 [P] [US1] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 为当前会话等待 token 时的隐藏真实历史、定位调用和同步显示增加失败回归测试；更新现有 hook mock 的公开契约。
- [x] T004 [US3] 在上述 hydration/page 回归测试中覆盖快速切换、同一会话重试和草稿晋升首轮回复，确保过期 token 不生效且草稿不会重入历史进入流程。

## Phase 2: User Story 1 — 打开历史会话先看到最新消息 (Priority: P1)

**Goal**: 已有会话正常恢复完成后，页面只对当前会话执行一次首帧前到底定位。

**Independent Test**: 打开包含长历史的已有会话，首个可见的真实消息帧位于底部，最新消息可见；向上滚动仍可查看历史。

- [x] T005 [US1] 在 `apps/webapp/components/instamind/use-chat-stream.ts` 维护 `messageConversationId` 与带单调 `sequence` 的 `historyEntryReady`，使其仅在已有会话 hydration 成功稳定后发布。
- [x] T006 [US1] 在 `apps/webapp/components/instamind/use-chat-auto-scroll.ts` 实现 `positionConversationEntryAtBottom`：直接定位、一次可取消 rAF 修正、无 smooth scroll，且不改变现有流式自动跟随语义。
- [x] T007 [US1] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 基于消息归属和当前 token 协调骨架屏、不可见真实历史、`useLayoutEffect` 定位与显示，避免旧会话内容短暂展示。
- [x] T008 [US1] 运行 US1 的定向 Vitest 测试并修复仅限本 Story 的失败。

## Phase 3: User Story 2 — 无闪动且不干扰阅读控制 (Priority: P2)

**Goal**: 底部定位不以可见滚动动画完成，且不破坏既有的用户上滑锁定和“回到底部”行为。

**Independent Test**: 长历史切换时没有先顶部后底部的可见跳动；流式过程中上滑、回到底部以及普通继续输出与 v0.5.1 行为一致。

- [x] T009 [US2] 在 `apps/webapp/components/instamind/use-chat-auto-scroll.ts` 和对应测试中确认入口定位的清理路径覆盖会话切换与组件卸载，且不复用手动回到底部的平滑动画。
- [x] T010 [US2] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 和页面测试中验证 token 已消费后不重复隐藏或重新定位，保持用户主动阅读位置不被二次抢占。
- [x] T011 [US2] 运行滚动与页面定向回归测试，确认旧的流式跟随测试仍通过。

## Phase 4: User Story 3 — 异步、重试和草稿边界安全 (Priority: P3)

**Goal**: 快速切换、加载失败后重试、草稿晋升和卸载不会暴露错误会话内容或执行过期滚动。

**Independent Test**: 快速从 A 切至 B、A 失败后重试、以及草稿第一轮回复时，只有当前已有会话可触发入口定位；草稿响应连续可见。

- [x] T012 [US3] 在 `apps/webapp/components/instamind/use-chat-stream.ts` 处理 hydration 取消、重试和草稿晋升时的 token/归属失效规则，满足契约文档。
- [x] T013 [US3] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 消费 token 时仅接受当前已选会话与未消费 sequence，忽略过期异步结果。
- [x] T014 [US3] 运行 hydration、页面和 auto-scroll 定向测试，确认快速切换、失败重试及草稿晋升场景通过。

## Phase 5: Verification and Documentation

- [x] T015 [P] 按 `quickstart.md` 对长历史切换、刷新恢复、快速切换、失败重试、草稿首轮回复做浏览器手工冒烟，并记录结果到 `acceptance.md`。
- [x] T016 运行 `pnpm --filter @ai-mind/webapp test -- --run` 中受影响的测试文件、`pnpm lint:webapp`、`pnpm typecheck`，并处理本版本回归。
- [x] T017 运行规格与实现收敛检查，更新 `acceptance.md`、`decisions.md` 和本清单的完成状态；版本 lockstep 与 release closing 依 `plan.md` 的 deferred 边界另行处理。
- [x] T018 Superseded — 原“消息末尾锚点 + fixed Composer 高度补偿”方案已由 D006 替代；不再保留锚点、`bottomSpacing` 或 document fallback。

## Phase 6: Dedicated Message Viewport Foundation

- [x] T019 [US1] 在 `apps/webapp/tests/components/instamind/use-chat-auto-scroll.test.tsx` 先行建立消息视口滚动、入口 rAF 取消、Composer 贴底回贴和上滑不打扰的失败回归；在 `apps/webapp/tests/app/instant-mind/page.test.ts` 建立 flex 布局、无 fixed Composer/锚点的失败断言。
- [x] T020 [US1] 重构 `apps/webapp/components/instamind/use-chat-auto-scroll.ts`：返回消息视口和 Composer refs，所有滚动只写入消息视口，保留流式上滑锁定、手动回到底部、一次性入口校正及清理。
- [x] T021 [US1] 重构 `apps/webapp/components/instamind/instantmind-page.tsx` 为 `h-dvh` flex 聊天列，Composer 作为 `shrink-0` sibling，移除 fixed 覆盖、`bottomSpacing`、最小高度计算及消息末尾锚点。
- [x] T022 [US2] 运行 Hook、页面和 hydration 定向 Vitest 回归，确认最新内容进入、流式跟随、回到底部、A→B 取消和草稿边界不回归。
- [x] T023 [US2] 运行 lint、typecheck、完整 stable suite、`git diff --check` 与 Spec Kit converge；把自动化证据写回 `acceptance.md` 和本清单。

## Phase 7: Real Bottom Reflow Correction

- [x] T024 [US1] 在 `apps/webapp/tests/components/instamind/use-chat-auto-scroll.test.tsx` 先增加失败回归：历史内容在初次进入后继续增高时，贴底消息视口必须重对齐到真实末尾；已上滑时不得移动。
- [x] T025 [US1] 在 `apps/webapp/components/instamind/use-chat-auto-scroll.ts` 观察消息内容列并复用贴底重对齐；在 `apps/webapp/components/instamind/instantmind-page.tsx` 中把可见历史的释放延后到首次 rAF 校正完成。
- [x] T026 [US1] 运行滚动和页面定向回归、浏览器几何检查、lint/typecheck/stable suite/`git diff --check`，并更新本版本验收账本与收敛结论。

## Phase 8: Full-Height Viewport with Floating Composer

- [x] T027 [US1] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 先增加失败结构回归：消息视口为 `h-full overflow-y-auto`、移动会话栏位于其内部、Composer 为底部浮层且边缘手势穿透；在 `apps/webapp/tests/components/instamind/use-chat-auto-scroll.test.tsx` 增加 Composer 实测高度安全区提交后才贴底重对齐的失败回归。
- [x] T028 [US1] 在 `apps/webapp/components/instamind/use-chat-auto-scroll.ts` 暴露由 Composer `ResizeObserver` 驱动的实际 overlay inset，并在安全区提交后贴底校正；在 `apps/webapp/components/instamind/instantmind-page.tsx` 将消息视口改为满高、Composer 改为可穿透的浮层，并把 inset 只作为消息内容底部 padding。
- [x] T029 [US1] 运行定向与全量 stable 测试、lint、typecheck、`git diff --check`，按 324×534 移动视口检查消息视口/滚动条连续到页面底部并更新验收账本；真实长历史视觉冒烟仍由 T015 负责。

## Phase 9: Composer Overlay Polish

- [x] T030 [US1] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 先增加失败结构回归：Composer shell 有底部渐变遮罩、按消息 scrollbar CSS 变量收缩右侧、保留左侧过渡且内容安全区为实际高度加 54px。
- [x] T031 [US1] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 测量消息视口原生 scrollbar 宽度并对齐 Composer；增加穿透式遮罩，安全区额外增加 30px。
- [x] T032 [US1] 运行定向与完整 stable 测试、lint、typecheck、`git diff --check`，在真实页面确认遮罩、列对齐和额外 30px 间距；更新验收账本。
- [x] T033 [US1] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 先增加失败回归：新历史在 scrollbar inset 计量完成且下一帧之前不得调用入口定位；快速切换仍取消过期入口。
- [x] T034 [US1] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 将首次历史入口定位延后到 measured scrollbar inset 提交后的 rAF，保持真实历史在此期间不可见。
- [x] T035 [US1] 重新运行入口、滚动和页面定向回归、完整 stable suite、typecheck、lint 与真实页面测量，确认该时序门槛不影响既有滚动语义。
- [x] T036 [US1] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 先复现“骨架/上一会话为 0px、下一长历史为 15px”时旧缓存会提前开始入口定位的失败回归。
- [x] T037 [US1] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 将 scrollbar 同步绑定到每个未消费的历史就绪 token，并在测量状态提交后才排队入口 rAF。
- [x] T038 [US1] 重跑 3 文件 27 项定向回归、stable suite、typecheck、lint 与真实页面列几何；确认令牌级测量门槛、遮罩、列对齐和 54px 安全区同时成立。

## Phase 10: Local-first Session Switch and Stable Gutter

- [x] T039 [P] [US1] 在 `apps/webapp/tests/components/instamind/conversation-session.test.tsx` 先增加失败回归：选中 B 的本地状态与既有本地索引必须在后台 registry POST 未完成时已生效，POST 失败后仍保留 B 且不显示全局错误；旧 registry 响应、未完成的索引写入和服务端不可用后的刷新恢复都不得还原 A。
- [x] T040 [P] [US3] 在 `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx` 先增加失败回归：有效本地快照在远端 ThreadState 请求未完成时即为 ready 并发布一个 token，远端结果不得产生第二个 token。
- [x] T041 [P] [US1] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 先增加失败结构回归：实际 `chat-message-viewport` 具有稳定 native scrollbar gutter，不能只依赖 `html` 的 gutter。
- [x] T042 [US1] 在 `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts` 实施本地优先选择和后台确认失败保留；在 `apps/webapp/components/instamind/use-chat-stream.ts` 让有效本地快照立即就绪且只发一次 token；在 `apps/webapp/components/instamind/instantmind-page.tsx` 将 gutter 作用到唯一消息视口。
- [x] T043 [US3] 完成新增 4 个测试文件的 red/green 基线与通过验证；运行完整 stable suite、lint、typecheck、`git diff --check`，并把自动化证据写回验收账本。
- [x] T044 [P] [US3] 按 `quickstart.md` 在含真实/测试历史数据的环境中，补充本地 A→B、持久化失败、短/长内容 gutter 与 4 倍 CPU 的手工视觉验证证据。

## Phase 11: Cached Navigation and Complete First Reveal

- [x] T045 [US3] 在 `apps/webapp/tests/components/instamind/conversation-session.test.tsx` 和 `apps/webapp/tests/app/instant-mind/page.test.ts` 先增加失败回归：注册表只读缓存中 A/B 仍可本地切换且不 POST、写操作仍禁用；快速 A→B 时本地索引与 selected-preference 写入最终收敛为 B；后台 selected-preference 确认期间，推荐问题已经处于首次历史揭示树中。
- [x] T046 [US3] 在 `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts`、`conversation-sidebar.tsx`、`conversation-mobile-selector.tsx` 和 `instantmind-page.tsx` 拆分本地会话选择与服务端写操作的禁用策略；选中偏好持久化改为不阻塞、最新选择优先的串行后台确认，且只读缓存仅写本地 index、不发 POST。
- [x] T047 [US3] 已完成会话、页面和消息列表定向回归以及 lint/typecheck/stable suite/`git diff --check`，并更新 `acceptance.md`；按 `quickstart.md` 在真实历史环境复测 A↔B、推荐问题首帧与 4 倍 CPU，断网缓存和延迟确认继续由自动化故障注入覆盖。

## Dependencies and Execution Order

1. T001–T004 先于任何生产代码修改完成，用于建立失败基线。
2. T005–T007 按顺序实施核心链路；T008 通过后进入后续回归。
3. T009–T011 验证滚动交互不退化。
4. T012–T014 收口异步边界。
5. T015 与 T023 仅在自动化回归稳定后执行。
6. T019–T022 必须在 T023 前完成；T023 完成后重新评估 T017 的收敛结论。

## Parallel Opportunities

- T001、T002、T003 和 T004 分别修改不同的测试关注点，可在无共享编辑冲突时并行准备。
- T015 的手工冒烟可与 T016 的自动化验证并行，但必须都完成后才可更新验收结论。
