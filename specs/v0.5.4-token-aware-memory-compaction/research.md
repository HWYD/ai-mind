# Research: Token-aware Memory Compaction

**Feature**: [spec.md](./spec.md)
**Date**: 2026-09-01

## Research Questions

1. 主流模型的物理 context window 是否已经普遍超过 128K？
2. 应用是否应该默认吃满 1M，还是使用较小 operational cap？
3. 主流 Agent/CLI 如何决定 compaction 时机与压后留存？
4. 本地 Ollama 的 context 应如何结合 artifact 和 VRAM 约束？
5. 多 Provider 场景如何在没有完全相同 tokenizer 的情况下做安全 preflight？

## Findings

### Physical windows 已达到 200K～1M

- OpenAI 当前 GPT-5.6 系列公开 1.05M context window、128K max output：[OpenAI Models](https://developers.openai.com/api/docs/models)。
- Anthropic 当前模型按型号提供 200K 或 1M，并明确 system prompt、messages、tool results、documents 和 tool definitions 都计入窗口；文档同时强调 context 质量需要策划，而不是只看容量：[Anthropic Context Windows](https://platform.claude.com/docs/en/build-with-claude/context-windows)。
- Google Gemini 2.5 Pro 公开 1,048,576 input token limit：[Gemini Models](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro)。
- Qwen 3.7 Max 公开 1,000,000 context：[Alibaba Cloud Model Studio](https://help.aliyun.com/zh/model-studio/qwen3-7-max)。
- DeepSeek V4 Flash/Pro 公开 1M context：[DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)。

**Decision**: AI Mind catalog 记录物理窗口，但普通聊天采用独立 operational cap。物理窗口回答“模型最多能接收多少”，operational cap 回答“本产品默认愿意为一轮聊天投入多少上下文、延迟和成本”。

### Compaction 应按容量阈值，而不是消息次数

- OpenAI compaction guide 允许按 token threshold 启动 server-side compaction，证明阈值属于容量管理而不是 turn count：[OpenAI Compaction](https://developers.openai.com/api/docs/guides/compaction)。
- Gemini CLI 当前实现以 `DEFAULT_COMPRESSION_TOKEN_THRESHOLD = 0.5` 决定压缩，并在压缩结果大于原内容时拒绝采用：[Gemini CLI chatCompressionService](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/context/chatCompressionService.ts)。
- Anthropic 文档明确完整请求中的 system、tool definitions 和 tool results 都占窗口，因此只计算 recent chat message 数不能判断最终请求是否安全。

**Decision**: 使用两级条件：chat memory 达到 trigger 时主动压缩；完整 assembled input 超过 hard budget 时在请求前压缩。单次请求最多一次 persistent attempt，之后只做 ephemeral fit。

### 128K 是默认工作窗口，不是能力声明

评估过三个选项：

| Option       | Advantage                                             | Cost/Risk                                         | Result               |
| ------------ | ----------------------------------------------------- | ------------------------------------------------- | -------------------- |
| 1M default   | 最大 raw retention                                    | 延迟、成本、context dilution 和 Provider 差异最大 | Rejected             |
| 256K default | 比 128K 保留更多历史                                  | 本地/云端差异仍大，普通聊天收益不稳定             | Rejected for default |
| 128K default | 覆盖主流长对话，保留充足工具与输出 headroom，成本可控 | 极长 raw transcript 更早进入 summary              | Selected             |

**Decision**: 云端默认 128,000。后续提高 cap 只需要配置与独立验收，不修改压缩算法或公开 API。

### 70% trigger / 35% target

触发线必须给输出、动态 tools、UserMemory 和 tokenizer 偏差留余量；压后目标必须明显低于触发线，避免下一轮再次压缩。

**Decision**:

- hard input 已先扣除 output reserve 与 runtime reserve。
- chat memory trigger 为 hard input 的 70%。
- candidate target 为 hard input 的 35%。
- 这使压后到再次触发之间保留 35% hard-input headroom，同时不需要按次数 debounce。

Rejected alternatives：95% 才压缩会把动态 tool/system 变化推入紧急路径；压后仍保留 70% 会造成压缩抖动；固定 token 常数无法适应 128K/32K 两类环境。

### Ollama 选择 32K

Ollama 文档说明默认 context 随 VRAM 分档：小于 24 GiB 为 4K、24–48 GiB 为 32K、48 GiB 以上为 256K；增大 context 会提高显存需求：[Ollama Context Length](https://docs.ollama.com/context-length)。当前 Qwen3 artifacts 中，4B 公开 256K，8B/14B 公开 40K：[Ollama Qwen3 Registry](https://ollama.com/library/qwen3)。

**Decision**: 当前本地产品上限固定 32,768，并显式传 `numCtx`。它同时低于 8B/14B 的 40K artifact window，也避免默认跟随 4B 的 256K。主机显存不足仍属于部署约束，不通过静默降低产品预算解决。

### Token estimation strategy

评估过 provider-specific exact tokenizers、字符近似和共享 tokenizer：

- Provider-specific tokenizer 最精确，但当前 Qwen/DeepSeek/Doubao/Ollama 接口与版本不提供一致、低延迟的 preflight API，会让主 Runtime 感知每个 Provider。
- 字符数对 CJK、JSON、tool calls 和英文代码偏差过大，且已经造成当前压后仍被拒绝的问题。
- `o200k_base` 能覆盖多语言和现代模型常见 token pattern；额外 framing 与 10% margin 可以作为统一 conservative estimate。

**Decision**: 使用 direct dependency `js-tiktoken` 和固定 `o200k_base`；计数完整 serialized provider-visible data，每条 message +8、request +3，最后乘 1.10 向上取整。Provider usage 只用于日志校准，不参与当前请求 admission。

## Project Model Metadata Decision

| Current catalog item          | `contextWindowTokens` | Basis                                  |
| ----------------------------- | --------------------: | -------------------------------------- |
| DeepSeek V4 Flash/Pro         |             1,000,000 | DeepSeek official docs                 |
| Qwen 3.6 Flash / 3.7 Max      |             1,000,000 | Alibaba Model Studio family/model docs |
| Doubao Seed 2.0 Code/pro/mini |               256,000 | Current provider model contract        |
| Kimi K2.6 via Doubao          |               262,144 | Current provider model contract        |
| Ollama Qwen3 4B               |               256,000 | Ollama registry artifact               |
| Ollama Qwen3 8B/14B           |                40,000 | Ollama registry artifacts              |

这些值只存在于 server catalog。若供应商改变型号或窗口，必须作为 catalog update 通过测试；不能从 label 猜测，也不能暴露为前端 capability。

## Continuity Decision

持久化正确性优先于破坏性截断：

- valid candidate 才能 replace checkpoint。
- compaction failure 保留旧 summary/pins/lastCompactedAt，同时仍保存最新 completed turn。
- 当前请求使用 ephemeral fit，不把降级投影写回数据库。
- 如果 non-memory alone 超限，则明确拒绝；memory compaction 不能伪装能修复所有 oversized requests。

该决策会允许持续 outage 时 raw checkpoint 增长，但避免数据在失败路径静默丢失。后续若需要 persisted backlog limit，必须新开决策并定义数据保留策略。

## Resolved Unknowns

所有 Phase 0 问题已经得到决策；无 `NEEDS CLARIFICATION`。实现阶段不得重新选择 256K/1M 默认窗口、count-based trigger、destructive failure trimming 或 public DTO 扩展。

## 2026-09-06 Virtuoso Follow Evaluation

4.18.12 源码与 Chrome 实验：followOutput 覆盖 append、部分同项 data 增高、Footer/viewport 变化；独立子组件增高可能漏跟；callback false 不能禁用全部尺寸路径。autoscrollToBottom 是短时 trap；scrollToIndex 重试可能在上翻后拉底，公共 scrollTo 无此重试。

参考：[Virtuoso API](https://virtuoso.dev/react-virtuoso/api-reference/virtuoso/)、[Troubleshooting](https://virtuoso.dev/react-virtuoso/troubleshooting/)、[Message List modifiers](https://virtuoso.dev/message-list/scroll-modifier/)、[use-stick-to-bottom](https://github.com/stackblitz-labs/use-stick-to-bottom)、[assistant-ui](https://www.assistant-ui.com/docs/api-reference/primitives/thread)、[AI SDK Elements](https://elements.ai-sdk.dev/components/conversation)。开源实践支持区分意图与几何，不据此推断 ChatGPT/Claude 内部实现。本版不迁移付费 Message List。

浏览器补充实验：默认外部容器的 overflow-anchor 与 Virtuoso upward compensation 叠加，在上翻后产生约 40px 阅读位移；关闭浏览器锚定后该 scrollBy 消失。原生 End 单次按键产生多个 scroll 帧，故阅读锁恢复不能在第一个未到底帧丢弃输入证据。最终 Chrome 回归包含这两个场景。

## Scroll Button and Feedback Follow-up

按钮调查：真实 Page 以 180ms 间隔输入 20 次增量，旧实现出现 24 次显隐切换；显示时底部 gap 为 28–56px，约 60–70ms 后跟随回底即隐藏。根因是 !atBottom 直接控制 UI，200ms opacity/transform 动画放大症状。T053 以持久意图和已有按钮状态控制显隐，增加连续 DOM 观测，不用时间防抖替代语义。

通知调研的最终决定：截图对应顶部居中的轻量 Message 反馈模式。[Element Plus Message](https://element-plus.org/zh-CN/component/message.html) 将主动操作反馈与被动系统 Notification 区分；这不是所有组件库都采用的命名契约。shadcn 当前提供 [Base UI Toast](https://ui.shadcn.com/docs/components/base/toast)，其 manager 原生提供 Portal、超时、关闭、有限堆叠和同 id 原位更新。Toast 可以承载主动操作反馈，并不限定于系统通知。

T054 以官方 `base-vega/toast` registry source 为参考，在现有 Radix preset 中只增加 `@base-ui/react` 并复用项目 `cn`/`Button`，没有执行会覆盖现有 Button 的整项安装，也没有引入 Sonner。根 layout 只挂载一个顶部居中 Messages 宿主；短文案使用紧凑固有宽度，长文案受窄屏安全边距约束，并验证在 Radix Sheet 上层可见。项目链接复制使用稳定 id 更新同一操作。

持续故障不进入 Messages：会话服务错误位于 Sidebar/移动抽屉的最近会话区域，只读缓存位于 Composer，hydration 失败位于消息内容占位，生图限额由对应 assistant error reply 承载。移动导航在 viewport 外占位，Virtuoso Header 默认留空，通知与导航均不改变列表几何。该决定覆盖此前 Sonner 推荐和“选择器/告警归入 Header”的方案。
