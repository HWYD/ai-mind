import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs'
import { tool } from '@langchain/core/tools'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createGeneralReActRunContext } from '@/lib/ai/runtime/general-react-agent/agent-context'
import {
    GeneralReActAgentRunError,
    GeneralReActAgentRunner,
    type GeneralReActRunnerInput,
} from '@/lib/ai/runtime/general-react-agent/general-react-agent-runner'
import { RetryPermitPool } from '@/lib/ai/runtime/general-react-agent/retry-permit-pool'
import { calculatorToolDefinition } from '@/lib/ai/tools/calculator-tool'
import type { ChatToolDefinition } from '@/lib/ai/tools/registry'

class ScriptedModel extends BaseChatModel {
    constructor(private readonly generateMessage: () => AIMessage | Promise<AIMessage>) {
        super({})
    }

    _llmType() {
        return 'general-react-runner-test'
    }

    bindTools() {
        return this
    }

    async _generate(_messages: BaseMessage[]): Promise<ChatResult> {
        const message = await this.generateMessage()
        return { generations: [{ message, text: message.text }] }
    }
}

class CallbackStreamingModel extends BaseChatModel {
    constructor() {
        super({})
    }

    _llmType() {
        return 'general-react-runner-streaming-test'
    }

    bindTools() {
        return this
    }

    async _generate(_messages: BaseMessage[], _options: unknown, runManager?: CallbackManagerForLLMRun) {
        for (const token of ['第一段', '第二段']) {
            await runManager?.handleLLMNewToken(token, undefined, undefined, undefined, undefined, {
                chunk: new AIMessageChunk({ content: token }),
            })
        }

        const message = new AIMessage('第一段第二段')
        return { generations: [{ message, text: message.text }] }
    }
}

class ToolThenFinalStreamingModel extends BaseChatModel {
    private callCount = 0

    constructor(private readonly toolCall: NonNullable<AIMessage['tool_calls']>[number]) {
        super({})
    }

    _llmType() {
        return 'general-react-runner-tool-streaming-test'
    }

    bindTools() {
        return this
    }

    async _generate(_messages: BaseMessage[], _options: unknown, runManager?: CallbackManagerForLLMRun) {
        this.callCount += 1
        if (this.callCount === 1) {
            const preToolText = '我先查一下。'
            await runManager?.handleLLMNewToken(preToolText, undefined, undefined, undefined, undefined, {
                chunk: new AIMessageChunk({ content: preToolText }),
            })
            const message = new AIMessage({ content: preToolText, tool_calls: [this.toolCall] })
            return { generations: [{ message, text: message.text }] }
        }

        const message = new AIMessage('最终完整回答。')
        return { generations: [{ message, text: message.text }] }
    }
}

class NonCancellableHangingModel extends BaseChatModel {
    constructor() {
        super({})
    }

    _llmType() {
        return 'general-react-runner-hanging-test'
    }

    bindTools() {
        return this
    }

    async _generate(): Promise<ChatResult> {
        return await new Promise<ChatResult>(() => undefined)
    }
}

class NonCancellableLateModel extends BaseChatModel {
    constructor() {
        super({})
    }

    _llmType() {
        return 'general-react-runner-late-test'
    }

    bindTools() {
        return this
    }

    async _generate(): Promise<ChatResult> {
        await new Promise(resolve => setTimeout(resolve, 25))
        const message = new AIMessage('迟到的 Agent 结果')
        return { generations: [{ message, text: message.text }] }
    }
}

class StreamingAnswerModel extends BaseChatModel {
    bindToolsCalls = 0

    constructor() {
        super({})
    }

    _llmType() {
        return 'general-react-runner-answer-streaming-test'
    }

    bindTools(..._args: Parameters<BaseChatModel['bindTools']>): never {
        this.bindToolsCalls += 1
        throw new Error('Answer phase must not bind tools')
    }

    async *_streamResponseChunks() {
        for (const token of ['答案第一段', '答案第二段']) {
            yield new ChatGenerationChunk({ message: new AIMessageChunk({ content: token }), text: token })
        }
    }

    async _generate(): Promise<ChatResult> {
        const message = new AIMessage('答案第一段答案第二段')
        return { generations: [{ message, text: message.text }] }
    }
}

class AnswerModelRequiringActionCandidateRemoval extends BaseChatModel {
    receivedMessages: BaseMessage[] = []

    constructor() {
        super({})
    }

    _llmType() {
        return 'general-react-runner-answer-context-test'
    }

    bindTools(): never {
        throw new Error('Answer phase must not bind tools')
    }

    async *_streamResponseChunks(messages: BaseMessage[]) {
        this.receivedMessages = messages
        const lastMessage = messages.at(-1)
        if (lastMessage instanceof AIMessage && lastMessage.text === 'Action 终局候选，不能作为 Answer 上下文') {
            return
        }

        const answer = '基于可靠上下文重新生成的最终回答。'
        yield new ChatGenerationChunk({ message: new AIMessageChunk({ content: answer }), text: answer })
    }

    async _generate(): Promise<ChatResult> {
        throw new Error('Answer stream must be consumed directly')
    }
}

class CapturingAnswerModel extends BaseChatModel {
    receivedMessages: BaseMessage[] = []

    constructor(private readonly answer: string) {
        super({})
    }

    _llmType() {
        return 'general-react-runner-capturing-answer-test'
    }

    bindTools(): never {
        throw new Error('Answer phase must not bind tools')
    }

    async *_streamResponseChunks(messages: BaseMessage[]) {
        this.receivedMessages = messages
        yield new ChatGenerationChunk({ message: new AIMessageChunk({ content: this.answer }), text: this.answer })
    }

    async _generate(): Promise<ChatResult> {
        throw new Error('Answer stream must be consumed directly')
    }
}

class PartialThenProviderErrorAnswerModel extends BaseChatModel {
    constructor(private readonly error: Error = new Error('provider connection lost')) {
        super({})
    }

    _llmType() {
        return 'general-react-runner-partial-answer-error-test'
    }

    bindTools(): never {
        throw new Error('Answer phase must not bind tools')
    }

    async *_streamResponseChunks() {
        const prefix = '已经公开的回答前缀。'
        yield new ChatGenerationChunk({ message: new AIMessageChunk({ content: prefix }), text: prefix })
        throw this.error
    }

    async _generate(): Promise<ChatResult> {
        throw this.error
    }
}

class ProviderErrorBeforeTextAnswerModel extends BaseChatModel {
    constructor(private readonly error: Error = new Error('provider connection lost')) {
        super({})
    }

    _llmType() {
        return 'general-react-runner-empty-answer-error-test'
    }

    bindTools(): never {
        throw new Error('Answer phase must not bind tools')
    }

    async *_streamResponseChunks() {
        yield* []
        throw this.error
    }

    async _generate(): Promise<ChatResult> {
        throw this.error
    }
}

class PartialThenAbortResponsiveHangingAnswerModel extends BaseChatModel {
    constructor() {
        super({})
    }

    _llmType() {
        return 'general-react-runner-partial-answer-timeout-test'
    }

    bindTools(): never {
        throw new Error('Answer phase must not bind tools')
    }

    async *_streamResponseChunks(_messages: BaseMessage[], options?: { signal?: AbortSignal }) {
        const prefix = '已经公开的超时回答前缀。'
        yield new ChatGenerationChunk({ message: new AIMessageChunk({ content: prefix }), text: prefix })
        await new Promise<void>(resolve => {
            if (options?.signal?.aborted) {
                resolve()
                return
            }
            options?.signal?.addEventListener('abort', () => resolve(), { once: true })
        })
    }

    async _generate(): Promise<ChatResult> {
        throw new Error('Answer stream must be consumed directly')
    }
}

class PartialThenToolCallAnswerModel extends BaseChatModel {
    constructor() {
        super({})
    }

    _llmType() {
        return 'general-react-runner-partial-answer-tool-call-test'
    }

    bindTools(): never {
        throw new Error('Answer phase must not bind tools')
    }

    async *_streamResponseChunks() {
        const prefix = '已经公开的回答前缀。'
        yield new ChatGenerationChunk({ message: new AIMessageChunk({ content: prefix }), text: prefix })
        yield new ChatGenerationChunk({
            message: new AIMessageChunk({
                content: '',
                tool_call_chunks: [{ args: '{}', id: 'late-answer-tool-1', index: 0, name: 'calculator', type: 'tool_call_chunk' }],
            }),
            text: '',
        })
    }

    async _generate(): Promise<ChatResult> {
        throw new Error('Answer stream should be consumed directly')
    }
}

function createHarness(options: {
    agentGenerate: () => AIMessage | Promise<AIMessage>
    answerGenerate?: () => AIMessage | Promise<AIMessage>
    constrainedGenerate?: () => AIMessage | Promise<AIMessage>
    initialNow?: number
    runDeadlineAtMs?: number
    selectedSkill?: { description?: string; name: string; skillId: string }
    signal?: AbortSignal
    agentModel?: BaseChatModel
    answerModel?: BaseChatModel
    toolDefinitionMap?: Map<string, ChatToolDefinition>
}) {
    let now = options.initialNow ?? 1_000
    const chunks: unknown[] = []
    const agentModel = options.agentModel ?? new ScriptedModel(options.agentGenerate)
    const constrainedModel = new ScriptedModel(options.constrainedGenerate ?? (() => new AIMessage('')))
    const answerModel =
        options.answerModel ?? new ScriptedModel(options.answerGenerate ?? options.constrainedGenerate ?? options.agentGenerate)
    const createPhaseModel = vi.fn(({ phase }: { phase: string }) => {
        if (phase === 'action') return agentModel
        if (phase === 'answer') return answerModel
        return constrainedModel
    })
    const context = createGeneralReActRunContext({
        clock: { now: () => now },
        createPhaseModel: createPhaseModel as never,
        executionContext: {
            resolvedModelSelection: {},
            ...(options.runDeadlineAtMs === undefined ? {} : { runDeadlineAtMs: options.runDeadlineAtMs }),
        } as never,
        isTransportClosed: () => false,
        normalizeModelError: () => ({ code: 'MODEL_ERROR', logMeta: {}, message: '模型调用失败。', retryable: false }),
        publishChunk: async chunk => {
            chunks.push(chunk)
        },
        retryPermitPool: new RetryPermitPool(),
        runSignal: options.signal ?? new AbortController().signal,
        selectedSkill: options.selectedSkill,
        toolDefinitionMap: options.toolDefinitionMap ?? new Map(),
    })

    return {
        answerMessages: [new SystemMessage('TEST_ANSWER_POLICY')],
        chunks,
        context,
        createPhaseModel,
        setNow(value: number) {
            now = value
        },
    }
}

function runHarness(
    harness: ReturnType<typeof createHarness>,
    input: Omit<GeneralReActRunnerInput, 'answerMessages'> & Partial<Pick<GeneralReActRunnerInput, 'answerMessages'>>
) {
    return new GeneralReActAgentRunner().run({ answerMessages: harness.answerMessages, ...input })
}

describe('general-react-agent runner', () => {
    it('保留 provider callback 的真实文本增量，不在 run 结束时退化成单块 delta', async () => {
        const harness = createHarness({
            agentGenerate: () => new AIMessage('unused'),
            agentModel: new CallbackStreamingModel(),
            answerModel: new StreamingAnswerModel(),
        })

        await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('你好')],
            runId: 'run-streaming-1',
            threadId: 'thread-streaming-1',
        })

        expect(harness.chunks.filter(chunk => (chunk as { type?: string }).type === 'text-delta')).toEqual([
            { delta: '答案第一段', partId: expect.any(String), type: 'text-delta' },
            { delta: '答案第二段', partId: expect.any(String), type: 'text-delta' },
        ])
    })

    it('沿用 preparation 前建立的 absolute deadline，不在 runner 内重开 180 秒', async () => {
        const harness = createHarness({
            agentGenerate: () => new AIMessage('自然回答'),
            initialNow: 30_000,
            runDeadlineAtMs: 181_000,
        })

        await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('你好')],
            runId: 'run-outer-deadline',
            threadId: 'thread-outer-deadline',
        })

        expect(harness.createPhaseModel).toHaveBeenCalledWith(expect.objectContaining({ phase: 'action', timeoutMs: 116_000 }))
    })

    it('Answer 只接收自己的服务端提示词，不携带 Action 的工具调用指令', async () => {
        const answerModel = new AnswerModelRequiringActionCandidateRemoval()
        const harness = createHarness({
            agentGenerate: () => new AIMessage('Action 终局候选，不能作为 Answer 上下文'),
            answerModel,
        })
        const userMessage = new HumanMessage('解释这个概念')

        await runHarness(harness, {
            answerMessages: [new SystemMessage('ANSWER_POLICY: 面向用户作答，不调用工具。'), userMessage],
            context: harness.context,
            messages: [new SystemMessage('ACTION_ONLY: 直接发起合法的 tool call。'), userMessage],
            runId: 'run-answer-projection',
            threadId: 'thread-answer-projection',
        })

        expect(answerModel.receivedMessages.map(message => message.text)).toEqual([
            'ANSWER_POLICY: 面向用户作答，不调用工具。',
            '解释这个概念',
        ])
    })

    it('Answer 将 ToolMessage 转成受控资料，避免 provider 继续生成工具调用', async () => {
        const answerModel = new AnswerModelRequiringActionCandidateRemoval()
        let actionCallCount = 0
        const harness = createHarness({
            agentGenerate: () => {
                actionCallCount += 1

                return actionCallCount === 1
                    ? new AIMessage({
                          content: '这是调用工具前的私有 Action 草稿。',
                          tool_calls: [
                              {
                                  args: { expression: '1 + 1' },
                                  id: 'private-action-tool-call',
                                  name: 'calculator',
                                  type: 'tool_call',
                              },
                          ],
                      })
                    : new AIMessage('工具后的私有 Action 收口文本。')
            },
            answerModel,
            toolDefinitionMap: new Map([['calculator', calculatorToolDefinition]]),
        })
        const userMessage = new HumanMessage('计算 1 + 1')

        await runHarness(harness, {
            answerMessages: [new SystemMessage('ANSWER_POLICY'), userMessage],
            context: harness.context,
            messages: [new SystemMessage('ACTION_ONLY'), userMessage],
            runId: 'run-private-action-text',
            threadId: 'thread-private-action-text',
        })

        expect(answerModel.receivedMessages.map(message => message.text)).not.toContain('这是调用工具前的私有 Action 草稿。')
        expect(answerModel.receivedMessages.map(message => message.text)).not.toContain('工具后的私有 Action 收口文本。')

        expect(answerModel.receivedMessages.some(message => ToolMessage.isInstance(message))).toBe(false)
        expect(answerModel.receivedMessages.some(message => AIMessage.isInstance(message) && message.tool_calls?.length)).toBe(false)
        const observationMessage = answerModel.receivedMessages.at(-1)
        expect(observationMessage).toMatchObject({
            content: expect.stringMatching(/\[工具观察 1 \| calculator \| (success|timeout)\]/),
        })
        expect(observationMessage?.text).toMatch(/计算结果：2|工具执行超时。/)
        expect(observationMessage?.text).not.toContain('这是调用工具前的私有 Action 草稿。')
        expect(observationMessage?.text).not.toContain('工具后的私有 Action 收口文本。')
    })

    it('阶段超时会终止不响应 abort 的完整 Agent stream，并进入 constrained final', async () => {
        const now = Date.now()
        const harness = createHarness({
            agentGenerate: () => new AIMessage('不会返回'),
            agentModel: new NonCancellableHangingModel(),
            constrainedGenerate: () => new AIMessage('阶段超时后的收口回答'),
            initialNow: now,
            runDeadlineAtMs: now + 35_001,
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('请处理一个长任务')],
            runId: 'run-phase-timeout',
            threadId: 'thread-phase-timeout',
        })

        expect(result).toMatchObject({
            assistantText: '阶段超时后的收口回答',
            finalizationMode: 'constrained',
        })
        expect(harness.createPhaseModel.mock.calls.map(call => call[0].phase)).toEqual(['action', 'answer'])
        expect(harness.chunks.filter(chunk => (chunk as { type?: string }).type === 'text-delta')).toEqual([
            { delta: '阶段超时后的收口回答', partId: expect.any(String), type: 'text-delta' },
        ])
        expect(result.memoryWriteEligible).toBe(false)
    })

    it('历史 assistant 回答不能被当作当前 Run 的自然最终回答', async () => {
        const historicalMessages = [
            ...Array.from({ length: 6 }, (_, index) => [
                new HumanMessage(`历史问题 ${index + 1}`),
                new AIMessage(`历史回答 ${index + 1}`),
            ]).flat(),
            new HumanMessage('当前问题'),
        ]
        const harness = createHarness({ agentGenerate: () => new AIMessage('当前 Run 的新回答') })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: historicalMessages,
            runId: 'run-history-boundary',
            threadId: 'thread-history-boundary',
        })

        expect(harness.createPhaseModel).toHaveBeenCalledWith(expect.objectContaining({ phase: 'action' }))
        expect(result.assistantText).toBe('当前 Run 的新回答')
        expect(result.assistantText).not.toBe('历史回答 6')
        expect(result.memoryWriteEligible).toBe(true)
    })

    it('阶段超时后迟到的 Agent 结果不会继续推进 public stream', async () => {
        const now = Date.now()
        const harness = createHarness({
            agentGenerate: () => new AIMessage('不会返回'),
            agentModel: new NonCancellableLateModel(),
            constrainedGenerate: () => new AIMessage('只允许收口回答'),
            initialNow: now,
            runDeadlineAtMs: now + 35_001,
        })

        await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('请处理一个长任务')],
            runId: 'run-phase-late-result',
            threadId: 'thread-phase-late-result',
        })
        await new Promise(resolve => setTimeout(resolve, 40))

        expect(
            harness.chunks
                .filter(chunk => (chunk as { type?: string }).type === 'text-delta')
                .map(chunk => (chunk as { delta: string }).delta)
        ).toEqual(['只允许收口回答'])
    })

    it('自然 final 产生非空回答、chat source 和安全增量文本', async () => {
        const harness = createHarness({ agentGenerate: () => new AIMessage('自然回答') })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('你好')],
            runId: 'run-1',
            threadId: 'thread-1',
        })

        expect(result).toMatchObject({
            assistantText: '自然回答',
            executedToolCallCount: 0,
            finalizationMode: 'normal',
            modelCallCount: 2,
            source: 'chat',
            stopReason: 'natural_completion',
        })
        expect(harness.chunks.map(chunk => (chunk as { type: string }).type)).toEqual([
            'agent-run-start',
            'text-start',
            'text-delta',
            'agent-run-end',
            'text-end',
        ])
    })

    it('Action 的无 Tool 草稿不公开，Answer 阶段才按连续 delta 即时输出最终文本', async () => {
        const answerModel = new StreamingAnswerModel()
        const harness = createHarness({
            agentGenerate: () => new AIMessage('Action 内部草稿，不应公开'),
            answerModel,
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('请回答问题')],
            runId: 'run-action-answer-streaming',
            threadId: 'thread-action-answer-streaming',
        })

        expect(result.assistantText).toBe('答案第一段答案第二段')
        expect(harness.createPhaseModel.mock.calls.map(call => call[0].phase)).toEqual(['action', 'answer'])
        expect(harness.chunks.filter(chunk => (chunk as { type?: string }).type === 'text-delta')).toEqual([
            { delta: '答案第一段', partId: expect.any(String), type: 'text-delta' },
            { delta: '答案第二段', partId: expect.any(String), type: 'text-delta' },
        ])
        expect(harness.chunks.map(chunk => (chunk as { type: string }).type)).toEqual([
            'agent-run-start',
            'text-start',
            'text-delta',
            'text-delta',
            'agent-run-end',
            'text-end',
        ])
        expect(harness.chunks.some(chunk => JSON.stringify(chunk).includes('Action 内部草稿'))).toBe(false)
    })

    it('Answer 只接收可靠对话上下文，不携带 Action 的无 Tool 终局候选', async () => {
        const answerModel = new AnswerModelRequiringActionCandidateRemoval()
        const harness = createHarness({
            agentGenerate: () => new AIMessage('Action 终局候选，不能作为 Answer 上下文'),
            answerModel,
        })

        const result = await runHarness(harness, {
            answerMessages: [new HumanMessage('今天是星期几？')],
            context: harness.context,
            messages: [new HumanMessage('今天是星期几？')],
            runId: 'run-answer-context-without-action-candidate',
            threadId: 'thread-answer-context-without-action-candidate',
        })

        expect(result.assistantText).toBe('基于可靠上下文重新生成的最终回答。')
        expect(
            answerModel.receivedMessages.some(
                message => message instanceof AIMessage && message.text === 'Action 终局候选，不能作为 Answer 上下文'
            )
        ).toBe(false)
        expect(answerModel.receivedMessages.map(message => message.text)).not.toContain(
            '本轮行动阶段因时间限制提前结束。只使用已经完成且可靠的信息；不要把未完成、未执行或失败的观察写成完整事实。'
        )
    })

    it('Answer 阶段复用所选模型但保持 unbound，避免重新暴露 Tool 能力', async () => {
        const answerModel = new StreamingAnswerModel()
        const harness = createHarness({
            agentGenerate: () => new AIMessage('Action 草稿'),
            answerModel,
        })

        await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('不需要工具的问题')],
            runId: 'run-answer-unbound',
            threadId: 'thread-answer-unbound',
        })

        expect(answerModel.bindToolsCalls).toBe(0)
        expect(harness.createPhaseModel).toHaveBeenCalledWith(expect.objectContaining({ phase: 'answer' }))
    })

    it('Answer 返回 Tool Call 时 fail closed，而不是把不完整结果投影为最终文本', async () => {
        const answerModel = new ScriptedModel(
            () =>
                new AIMessage({
                    content: '不应公开',
                    tool_calls: [{ args: {}, id: 'answer-tool-1', name: 'calculator', type: 'tool_call' }],
                })
        )
        let actionCallCount = 0
        const harness = createHarness({
            agentGenerate: () => {
                actionCallCount += 1
                return new AIMessage(actionCallCount === 1 ? 'Action terminal 草稿' : 'Action terminal 草稿')
            },
            answerModel,
        })

        await expect(
            runHarness(harness, {
                context: harness.context,
                messages: [new HumanMessage('请严格回答')],
                runId: 'run-answer-tool-call',
                threadId: 'thread-answer-tool-call',
            })
        ).rejects.toMatchObject({ code: 'AGENT_CONTRACT_VIOLATION' })
        expect(harness.chunks.some(chunk => JSON.stringify(chunk).includes('不应公开'))).toBe(false)
    })

    it('Answer 在公开文本前缀后发生 provider 异常时以失败收口，不拼接 fallback 或持久化不完整回答', async () => {
        const harness = createHarness({
            agentGenerate: () => new AIMessage('Action terminal 草稿'),
            answerModel: new PartialThenProviderErrorAnswerModel(),
        })

        await expect(
            runHarness(harness, {
                context: harness.context,
                messages: [new HumanMessage('请回答')],
                runId: 'run-answer-partial-provider-error',
                threadId: 'thread-answer-partial-provider-error',
            })
        ).rejects.toMatchObject({ code: 'RUN_FAILED' })

        expect(
            harness.chunks.filter(
                (chunk): chunk is { delta: string; type: 'text-delta' } => (chunk as { type?: string }).type === 'text-delta'
            )
        ).toEqual([{ delta: '已经公开的回答前缀。', partId: expect.any(String), type: 'text-delta' }])
        expect(harness.chunks.some(chunk => JSON.stringify(chunk).includes('抱歉，我暂时无法'))).toBe(false)
        expect(harness.chunks).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'text-end' })]))
    })

    it('Answer 在首个文本前发生 provider 异常时 fail closed，而不是伪装成正常空白 fallback', async () => {
        const harness = createHarness({
            agentGenerate: () => new AIMessage('Action terminal 草稿'),
            answerModel: new ProviderErrorBeforeTextAnswerModel(),
        })

        await expect(
            runHarness(harness, {
                context: harness.context,
                messages: [new HumanMessage('请回答')],
                runId: 'run-answer-empty-provider-error',
                threadId: 'thread-answer-empty-provider-error',
            })
        ).rejects.toMatchObject({ code: 'RUN_FAILED' })

        expect(harness.chunks.some(chunk => JSON.stringify(chunk).includes('抱歉，我暂时无法'))).toBe(false)
        expect(harness.chunks).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'text-start' })]))
        expect(harness.chunks).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'text-end' })]))
    })

    it('Answer 在公开前缀后超时时以失败收口，不追加 fallback 或 text-end', async () => {
        vi.useFakeTimers()
        try {
            const harness = createHarness({
                agentGenerate: () => new AIMessage('Action terminal 草稿'),
                answerModel: new PartialThenAbortResponsiveHangingAnswerModel(),
            })
            const run = runHarness(harness, {
                context: harness.context,
                messages: [new HumanMessage('请回答')],
                runId: 'run-answer-partial-timeout',
                threadId: 'thread-answer-partial-timeout',
            })
            const rejectedRun = expect(run).rejects.toMatchObject({ code: 'RUN_FAILED' })

            await vi.advanceTimersByTimeAsync(0)
            expect(
                harness.chunks.filter(
                    (chunk): chunk is { delta: string; type: 'text-delta' } => (chunk as { type?: string }).type === 'text-delta'
                )
            ).toEqual([{ delta: '已经公开的超时回答前缀。', partId: expect.any(String), type: 'text-delta' }])

            await vi.advanceTimersByTimeAsync(30_000)
            await rejectedRun

            expect(harness.chunks.some(chunk => JSON.stringify(chunk).includes('抱歉，我暂时无法'))).toBe(false)
            expect(harness.chunks).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'text-end' })]))
        } finally {
            vi.useRealTimers()
        }
    })

    it('Answer 在公开文本后才返回 Tool Call 时 fail closed，不把已公开前缀伪装成完整成功回答', async () => {
        const harness = createHarness({
            agentGenerate: () => new AIMessage('Action terminal 草稿'),
            answerModel: new PartialThenToolCallAnswerModel(),
        })

        await expect(
            runHarness(harness, {
                context: harness.context,
                messages: [new HumanMessage('请回答')],
                runId: 'run-answer-late-tool-call',
                threadId: 'thread-answer-late-tool-call',
            })
        ).rejects.toMatchObject({ code: 'AGENT_CONTRACT_VIOLATION' })

        expect(
            harness.chunks.filter(
                (chunk): chunk is { delta: string; type: 'text-delta' } => (chunk as { type?: string }).type === 'text-delta'
            )
        ).toEqual([{ delta: '已经公开的回答前缀。', partId: expect.any(String), type: 'text-delta' }])
        expect(harness.chunks.some(chunk => JSON.stringify(chunk).includes('抱歉，我暂时无法'))).toBe(false)
        expect(harness.chunks).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'text-end' })]))
    })

    it('模型调用预算同时计入 Action 和 Answer：无 Tool 也必须完成两次模型调用', async () => {
        const harness = createHarness({
            agentGenerate: () => new AIMessage('Action 草稿'),
            answerModel: new ScriptedModel(() => new AIMessage('Answer 结果')),
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('普通问答')],
            runId: 'run-action-answer-budget',
            threadId: 'thread-action-answer-budget',
        })

        expect(result.modelCallCount).toBe(2)
        expect(harness.createPhaseModel.mock.calls.map(call => call[0].phase)).toEqual(['action', 'answer'])
    })

    it('工具前的模型提示不会作为最终回答发送，只有确认无 Tool Call 的最终回答可见', async () => {
        const toolCall = { args: { query: 'AI' }, id: 'search-call-1', name: 'web-search', type: 'tool_call' as const }
        const searchSchema = z.object({ query: z.string() }).strict()
        const searchDefinition: ChatToolDefinition = {
            executionPolicy: { kind: 'standard-tool', profile: 'local-deterministic', retrySafe: true },
            name: 'web-search',
            schema: searchSchema,
            tool: tool(async () => ({ results: [] }), { description: 'search', name: 'web-search', schema: searchSchema }),
            runtimeScopes: ['general-react-agent'],
        }
        const harness = createHarness({
            agentGenerate: () => new AIMessage('未使用的脚本模型'),
            agentModel: new ToolThenFinalStreamingModel(toolCall),
            answerGenerate: () => new AIMessage('最终完整回答。'),
            toolDefinitionMap: new Map([['web-search', searchDefinition]]),
        })

        await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('请查询 AI')],
            runId: 'run-no-duplicate-final',
            threadId: 'thread-no-duplicate-final',
        })

        const textDeltas = harness.chunks
            .filter((chunk): chunk is { type: 'text-delta'; delta: string } => (chunk as { type?: string }).type === 'text-delta')
            .map(chunk => chunk.delta)

        expect(textDeltas).toEqual(['最终完整回答。'])
    })

    it('先投影 agent-run-start，再把 Skill 选择放入同一个 General Trace', async () => {
        const harness = createHarness({
            agentGenerate: () => new AIMessage('带技能的回答'),
            selectedSkill: { description: '通用研究能力', name: '实用技能', skillId: 'utility-skill' },
        })

        await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('使用技能回答')],
            runId: 'run-skill-1',
            threadId: 'thread-skill-1',
        })

        expect(harness.chunks.map(chunk => (chunk as { type: string }).type)).toEqual([
            'agent-run-start',
            'skill-selected',
            'text-start',
            'text-delta',
            'agent-run-end',
            'text-end',
        ])
    })

    it('依据实际 Tool 执行数量将完成回答归类为 tool source', async () => {
        let modelCall = 0
        const harness = createHarness({
            agentGenerate: () => {
                modelCall += 1
                if (modelCall === 1) {
                    return new AIMessage({
                        content: '',
                        tool_calls: [
                            {
                                args: { expression: '1 + 1' },
                                id: 'calculator-call-1',
                                name: 'calculator',
                                type: 'tool_call',
                            },
                        ],
                    })
                }

                return new AIMessage('计算结果为 2')
            },
            initialNow: Date.now(),
            toolDefinitionMap: new Map([['calculator', calculatorToolDefinition]]),
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('计算 1 + 1')],
            runId: 'run-tool-1',
            threadId: 'thread-tool-1',
        })

        expect(result).toMatchObject({
            assistantText: '计算结果为 2',
            executedToolCallCount: 1,
            source: 'tool',
            toolCallCount: 1,
        })
    })

    it('拒绝或预算阻断的 ToolMessage 不会把 Memory source 误归类为 tool', async () => {
        const readUrlSchema = z.object({ url: z.string().url() }).strict()
        let executionCalled = false
        const readUrlDefinition: ChatToolDefinition = {
            executionPolicy: { kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
            name: 'read-url',
            schema: readUrlSchema,
            tool: tool(
                async () => {
                    executionCalled = true
                    return { requestedUrl: 'https://example.com/private', text: '不应被读取' }
                },
                { name: 'read-url', description: 'read', schema: readUrlSchema }
            ),
            runtimeScopes: ['general-react-agent'],
        }
        let modelCall = 0
        const harness = createHarness({
            agentGenerate: () => {
                modelCall += 1
                if (modelCall === 1) {
                    return new AIMessage({
                        content: '',
                        tool_calls: [
                            {
                                args: { url: 'https://example.com/private' },
                                id: 'unauthorized-read-1',
                                name: 'read-url',
                                type: 'tool_call',
                            },
                        ],
                    })
                }

                return new AIMessage('未执行网页读取')
            },
            initialNow: Date.now(),
            toolDefinitionMap: new Map([['read-url', readUrlDefinition]]),
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('读取网页')],
            runId: 'run-denied-read-1',
            threadId: 'thread-denied-read-1',
        })

        expect(executionCalled).toBe(false)
        expect(result).toMatchObject({
            assistantText: '未执行网页读取',
            executedToolCallCount: 0,
            source: 'chat',
            toolCallCount: 1,
        })
    })

    it('允许 read-url 读取当前用户消息中已明确提供的安全 URL', async () => {
        const readUrlSchema = z.object({ url: z.string().url() }).strict()
        const readUrlDefinition: ChatToolDefinition = {
            executionPolicy: { kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
            name: 'read-url',
            schema: readUrlSchema,
            tool: tool(async ({ url }) => ({ requestedUrl: url, text: '公开页面正文', title: '公开页面' }), {
                description: 'read',
                name: 'read-url',
                schema: readUrlSchema,
            }),
            runtimeScopes: ['general-react-agent'],
        }
        let modelCall = 0
        const harness = createHarness({
            agentGenerate: () => {
                modelCall += 1
                return modelCall === 1
                    ? new AIMessage({
                          content: '',
                          tool_calls: [
                              {
                                  args: { url: 'https://docs.example.com/guide#section' },
                                  id: 'user-url-read-1',
                                  name: 'read-url',
                                  type: 'tool_call',
                              },
                          ],
                      })
                    : new AIMessage('已读取用户提供的页面')
            },
            initialNow: Date.now(),
            toolDefinitionMap: new Map([['read-url', readUrlDefinition]]),
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('读取 https://docs.example.com/guide#section')],
            runId: 'run-user-url-read-1',
            threadId: 'thread-user-url-read-1',
        })

        expect(result).toMatchObject({
            assistantText: '已读取用户提供的页面',
            executedToolCallCount: 1,
            source: 'tool',
        })
    })

    it('同一 action batch 最多并行执行三个普通 Tool，并保持四个 logical call 配对', async () => {
        let active = 0
        let peak = 0
        const definitions: ChatToolDefinition[] = Array.from({ length: 4 }, (_, index) => {
            const name = `parallel-tool-${index + 1}`
            const schema = z.object({ value: z.number() }).strict()

            return {
                executionPolicy: {
                    attemptTimeoutMs: 1000,
                    kind: 'standard-tool',
                    profile: 'local-deterministic',
                    retrySafe: true,
                },
                name,
                schema,
                tool: tool(
                    async ({ value }) => {
                        active += 1
                        peak = Math.max(peak, active)
                        await new Promise(resolve => setTimeout(resolve, 15))
                        active -= 1
                        return `${name}:${value}`
                    },
                    { name, description: name, schema }
                ),
                runtimeScopes: ['general-react-agent'],
            }
        })
        let modelCall = 0
        const harness = createHarness({
            agentGenerate: () => {
                modelCall += 1
                if (modelCall === 1) {
                    return new AIMessage({
                        content: '',
                        tool_calls: definitions.map((definition, index) => ({
                            args: { value: index + 1 },
                            id: `parallel-call-${index + 1}`,
                            name: definition.name,
                            type: 'tool_call' as const,
                        })),
                    })
                }

                return new AIMessage('四个工具都已完成')
            },
            initialNow: Date.now(),
            toolDefinitionMap: new Map(definitions.map(definition => [definition.name, definition])),
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('并行处理')],
            runId: 'run-parallel-1',
            threadId: 'thread-parallel-1',
        })

        expect(peak).toBe(3)
        expect(result).toMatchObject({
            executedToolCallCount: 4,
            source: 'tool',
            toolCallCount: 4,
            toolRequestCount: 4,
        })
        expect(harness.chunks.filter(chunk => (chunk as { type?: string }).type === 'tool-start')).toHaveLength(4)
        expect(harness.chunks.filter(chunk => (chunk as { type?: string }).type === 'tool-end')).toHaveLength(4)
    })

    it('web-search 授权返回 URL 后才能进入下一轮 read-url', async () => {
        const searchSchema = z.object({ query: z.string() }).strict()
        const readSchema = z.object({ url: z.string().url() }).strict()
        const searchDefinition: ChatToolDefinition = {
            executionPolicy: { kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
            name: 'web-search',
            schema: searchSchema,
            tool: tool(
                async () => ({
                    results: [{ snippet: '公开文档', title: 'Docs', url: 'https://example.com/docs' }],
                }),
                { name: 'web-search', description: 'search', schema: searchSchema }
            ),
            runtimeScopes: ['general-react-agent'],
        }
        const readDefinition: ChatToolDefinition = {
            executionPolicy: { kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
            name: 'read-url',
            schema: readSchema,
            tool: tool(async ({ url }) => ({ requestedUrl: url, text: '正文内容', title: 'Docs' }), {
                name: 'read-url',
                description: 'read',
                schema: readSchema,
            }),
            runtimeScopes: ['general-react-agent'],
        }
        let modelCall = 0
        const harness = createHarness({
            agentGenerate: () => {
                modelCall += 1
                if (modelCall === 1) {
                    return new AIMessage({
                        content: '',
                        tool_calls: [{ args: { query: 'LangChain' }, id: 'search-call-1', name: 'web-search', type: 'tool_call' }],
                    })
                }
                if (modelCall === 2) {
                    return new AIMessage({
                        content: '',
                        tool_calls: [{ args: { url: 'https://example.com/docs' }, id: 'read-call-1', name: 'read-url', type: 'tool_call' }],
                    })
                }

                return new AIMessage('已读取文档')
            },
            initialNow: Date.now(),
            toolDefinitionMap: new Map([
                ['web-search', searchDefinition],
                ['read-url', readDefinition],
            ]),
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('搜索并读取文档')],
            runId: 'run-search-read-1',
            threadId: 'thread-search-read-1',
        })

        expect(result).toMatchObject({
            assistantText: '已读取文档',
            executedToolCallCount: 2,
            source: 'tool',
            toolCallCount: 2,
        })
        expect(result.sources).toEqual([
            expect.objectContaining({
                originTool: 'read-url',
                status: 'read',
                url: 'https://example.com/docs',
            }),
        ])
    })

    it('Action cutoff 后不执行 Tool，至多调用一次 unbound constrained final', async () => {
        const answerModel = new CapturingAnswerModel('根据现有信息给出回答')
        const harness = createHarness({
            agentGenerate: () => {
                harness.setNow(146_001)
                return new AIMessage({
                    content: '',
                    tool_calls: [{ args: { expression: '1+1' }, id: 'call-1', name: 'calculator', type: 'tool_call' }],
                })
            },
            constrainedGenerate: () => new AIMessage('根据现有信息给出回答'),
            answerModel,
            initialNow: 1_000,
        })

        const result = await runHarness(harness, {
            answerMessages: [new HumanMessage('计算')],
            context: harness.context,
            messages: [new HumanMessage('计算')],
            runId: 'run-1',
            threadId: 'thread-1',
        })

        expect(result).toMatchObject({
            assistantText: '根据现有信息给出回答',
            finalizationMode: 'constrained',
            stopReason: 'action_deadline',
        })
        expect(harness.createPhaseModel.mock.calls.map(call => call[0].phase)).toEqual(['action', 'answer'])
        expect(harness.createPhaseModel.mock.calls[1]?.[0]).toMatchObject({ maxRetries: 0, phase: 'answer', timeoutMs: 29_999 })
        expect(answerModel.receivedMessages.map(message => message.text)).toContain(
            '本轮行动阶段因时间限制提前结束。只使用已经完成且可靠的信息；不要把未完成、未执行或失败的观察写成完整事实。'
        )
    })

    it('无进展收口时向 Answer 注入安全限制上下文，而正常 Answer 不注入该文案', async () => {
        const answerModel = new AnswerModelRequiringActionCandidateRemoval()
        let actionCallCount = 0
        const harness = createHarness({
            agentGenerate: () => {
                actionCallCount += 1
                return new AIMessage({
                    content: '',
                    tool_calls: [
                        {
                            args: { expression: '1 + 1' },
                            id: `model-limit-${actionCallCount}`,
                            name: 'calculator',
                            type: 'tool_call',
                        },
                    ],
                })
            },
            answerModel,
            toolDefinitionMap: new Map([['calculator', calculatorToolDefinition]]),
        })

        const result = await runHarness(harness, {
            answerMessages: [new SystemMessage('ANSWER_POLICY'), new HumanMessage('持续计算')],
            context: harness.context,
            messages: [new SystemMessage('ACTION_POLICY'), new HumanMessage('持续计算')],
            runId: 'run-model-limit-answer-context',
            threadId: 'thread-model-limit-answer-context',
        })

        expect(result.stopReason).toBe('no_progress')
        expect(answerModel.receivedMessages.map(message => message.text)).toContain(
            '本轮行动没有获得足以继续的可靠结果。不要把被拒绝、失败或未完成的观察写成已确认事实；基于现有可靠信息说明限制。'
        )
    })

    it('Action 的无 Tool 结果到达 cutoff 时必须进入 constrained Answer，不能作为 normal Answer 或写入 Memory', async () => {
        const harness = createHarness({
            agentGenerate: () => {
                harness.setNow(146_000)
                return new AIMessage('已经超过 Action 截止时间的内部草稿')
            },
            constrainedGenerate: () => new AIMessage('基于截止前可靠信息的受限回答'),
            initialNow: 1_000,
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('请回答')],
            runId: 'run-action-cutoff-no-tool',
            threadId: 'thread-action-cutoff-no-tool',
        })

        expect(result).toMatchObject({
            assistantText: '基于截止前可靠信息的受限回答',
            finalizationMode: 'constrained',
            memoryWriteEligible: false,
            stopReason: 'action_deadline',
        })
    })

    it('在首次 Action 模型调用前已到 cutoff 时不调用 provider，且模型计数只计入 Answer', async () => {
        let actionProviderInvoked = false
        const harness = createHarness({
            agentGenerate: () => {
                actionProviderInvoked = true
                return new AIMessage('不应调用的 Action 草稿')
            },
            constrainedGenerate: () => new AIMessage('基于截止前可靠信息的受限回答'),
            initialNow: 146_000,
            runDeadlineAtMs: 181_000,
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('请回答')],
            runId: 'run-pre-model-action-cutoff',
            threadId: 'thread-pre-model-action-cutoff',
        })

        expect(actionProviderInvoked).toBe(false)
        expect(result).toMatchObject({
            finalizationMode: 'constrained',
            memoryWriteEligible: false,
            modelCallCount: 1,
            stopReason: 'action_deadline',
        })
    })

    it('constrained final 返回空白时使用确定性安全 fallback', async () => {
        const harness = createHarness({
            agentGenerate: () => {
                harness.setNow(146_000)
                return new AIMessage({
                    content: '',
                    tool_calls: [{ args: {}, id: 'call-1', name: 'datetime', type: 'tool_call' }],
                })
            },
            constrainedGenerate: () => new AIMessage('   '),
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('现在几点')],
            runId: 'run-1',
            threadId: 'thread-1',
        })

        expect(result.finalizationMode).toBe('deterministic_fallback')
        expect(result.assistantText.trim()).not.toBe('')
        expect(result.assistantText).not.toContain('Error')
    })

    it('Hard deadline 优先于模型返回，不再启动 constrained final 或输出完成回答', async () => {
        const harness = createHarness({
            agentGenerate: () => {
                harness.setNow(181_001)
                return new AIMessage('过期回答')
            },
            initialNow: 1_000,
        })

        await expect(
            runHarness(harness, {
                context: harness.context,
                messages: [new HumanMessage('慢问题')],
                runId: 'run-1',
                threadId: 'thread-1',
            })
        ).rejects.toMatchObject({ code: 'RUN_DEADLINE' })
        expect(harness.createPhaseModel).toHaveBeenCalledTimes(1)
        expect(harness.chunks).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'text-start' })]))
    })

    it('显式取消不生成 constrained final 或 deterministic fallback', async () => {
        const controller = new AbortController()
        controller.abort(new DOMException('cancelled', 'AbortError'))
        const harness = createHarness({ agentGenerate: () => new AIMessage('不应调用'), signal: controller.signal })

        await expect(
            runHarness(harness, {
                context: harness.context,
                messages: [new HumanMessage('取消')],
                runId: 'run-1',
                threadId: 'thread-1',
            })
        ).rejects.toBeInstanceOf(GeneralReActAgentRunError)
        expect(harness.createPhaseModel).not.toHaveBeenCalled()
    })

    it('受控收口绕过 afterAgent 时仍按截止语义结束，而不是误报内部终态缺失', async () => {
        const toolSchema = z.object({ value: z.string() }).strict()
        const slowTool: ChatToolDefinition = {
            executionPolicy: { kind: 'standard-tool', profile: 'local-deterministic', retrySafe: true },
            name: 'deadline-after-tool',
            schema: toolSchema,
            tool: tool(
                async () => {
                    harness.setNow(146_001)
                    return 'tool completed'
                },
                { name: 'deadline-after-tool', description: 'deadline after tool', schema: toolSchema }
            ),
            runtimeScopes: ['general-react-agent'],
        }
        const harness = createHarness({
            agentGenerate: () =>
                new AIMessage({
                    content: '',
                    tool_calls: [
                        {
                            args: { value: 'deadline' },
                            id: 'deadline-after-tool-1',
                            name: 'deadline-after-tool',
                            type: 'tool_call',
                        },
                    ],
                }),
            constrainedGenerate: () => new AIMessage('基于已有信息收口'),
            toolDefinitionMap: new Map([[slowTool.name, slowTool]]),
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('截止后的收口')],
            runId: 'run-deadline-after-tool',
            threadId: 'thread-deadline-after-tool',
        })

        expect(result).toMatchObject({
            assistantText: '基于已有信息收口',
            finalizationMode: 'constrained',
        })
        expect(result.stopReason).not.toBe('agent_contract_violation')
        expect(harness.createPhaseModel).toHaveBeenCalledTimes(2)
    })

    it('把外层生命周期预留触发的 TimeoutError 归类为 run deadline', async () => {
        const controller = new AbortController()
        controller.abort(new DOMException('General ReAct run deadline exceeded.', 'TimeoutError'))
        const harness = createHarness({ agentGenerate: () => new AIMessage('不应调用'), signal: controller.signal })

        await expect(
            runHarness(harness, {
                context: harness.context,
                messages: [new HumanMessage('慢问题')],
                runId: 'run-outer-timeout',
                threadId: 'thread-outer-timeout',
            })
        ).rejects.toMatchObject({ code: 'RUN_DEADLINE' })
        expect(harness.createPhaseModel).not.toHaveBeenCalled()
    })
})
