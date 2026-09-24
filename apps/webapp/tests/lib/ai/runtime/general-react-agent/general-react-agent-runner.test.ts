import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { ChatGenerationChunk } from '@langchain/core/outputs'
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
import type { ChatToolDefinition } from '@/lib/ai/tools/registry'

class ScriptedModel extends BaseChatModel {
    private invocationIndex = 0

    constructor(
        private readonly responses: Array<() => AIMessage | Promise<AIMessage>>,
        private readonly callbackDeltas: string[][] = []
    ) {
        super({})
    }

    _llmType() {
        return 'general-react-runner-scripted'
    }

    bindTools() {
        return this
    }

    async _generate(_messages: BaseMessage[], _options: unknown, runManager?: CallbackManagerForLLMRun): Promise<ChatResult> {
        const responseIndex = Math.min(this.invocationIndex, this.responses.length - 1)
        this.invocationIndex += 1
        for (const delta of this.callbackDeltas[responseIndex] ?? []) {
            await runManager?.handleLLMNewToken(delta, undefined, undefined, undefined, undefined, {
                chunk: new AIMessageChunk({ content: delta }),
            })
        }

        const message = await this.responses[responseIndex]()
        return { generations: [{ message, text: message.text }] }
    }
}

class PartialThenProviderErrorFinalizer extends BaseChatModel {
    constructor() {
        super({})
    }

    _llmType() {
        return 'general-react-runner-partial-finalizer'
    }

    bindTools(): never {
        throw new Error('Constrained finalizer must not bind tools')
    }

    async *_streamResponseChunks() {
        const delta = '已经公开的受限回答前缀。'
        yield new ChatGenerationChunk({ message: new AIMessageChunk({ content: delta }), text: delta })
        throw new Error('provider connection lost')
    }

    async _generate(): Promise<ChatResult> {
        throw new Error('The stream must be consumed directly')
    }
}

function createToolDefinition(input: { execute: (args: { value: string }) => Promise<string> | string; name: string }): ChatToolDefinition {
    const schema = z.object({ value: z.string() }).strict()
    return {
        executionPolicy: { kind: 'standard-tool', profile: 'local-deterministic', retrySafe: true },
        name: input.name,
        schema,
        tool: tool(async ({ value }) => input.execute({ value }), {
            description: input.name,
            name: input.name,
            schema,
        }),
        runtimeScopes: ['general-react-agent'],
    }
}

function createHarness(input: {
    finalizerModel?: BaseChatModel
    loopModel: BaseChatModel
    toolDefinitionMap?: Map<string, ChatToolDefinition>
}) {
    const chunks: unknown[] = []
    const createPhaseModel = vi.fn(({ phase }: { phase: string }) => {
        if (phase === 'loop') return input.loopModel
        if (phase === 'finalizer') return input.finalizerModel ?? new ScriptedModel([() => new AIMessage('受限收口回答。')])
        throw new Error(`Unexpected model phase: ${phase}`)
    })
    const context = createGeneralReActRunContext({
        clock: { now: () => Date.now() },
        createPhaseModel: createPhaseModel as never,
        executionContext: { resolvedModelSelection: {} } as never,
        isTransportClosed: () => false,
        normalizeModelError: () => ({ code: 'MODEL_ERROR', logMeta: {}, message: '模型调用失败。', retryable: false }),
        publishChunk: async chunk => {
            chunks.push(chunk)
        },
        retryPermitPool: new RetryPermitPool(),
        runSignal: new AbortController().signal,
        toolDefinitionMap: input.toolDefinitionMap ?? new Map(),
    })

    return { chunks, context, createPhaseModel }
}

function runHarness(
    harness: ReturnType<typeof createHarness>,
    input: Omit<GeneralReActRunnerInput, 'finalizerMessages'> & Partial<Pick<GeneralReActRunnerInput, 'finalizerMessages'>>
) {
    return new GeneralReActAgentRunner().run({ finalizerMessages: [new SystemMessage('FINALIZER_POLICY')], ...input })
}

function chunksOfType<T extends string>(chunks: unknown[], type: T) {
    return chunks.filter((chunk): chunk is { type: T } & Record<string, unknown> => {
        return Boolean(chunk && typeof chunk === 'object' && (chunk as { type?: unknown }).type === type)
    })
}

describe('general-react-agent runner', () => {
    it('纯正文只经过一次 loop，直接输出 normal final Agent text', async () => {
        const harness = createHarness({ loopModel: new ScriptedModel([() => new AIMessage('单次 loop 最终回答')]) })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('直接回答')],
            runId: 'run-direct-loop-final',
            threadId: 'thread-direct-loop-final',
        })

        expect(result).toMatchObject({
            assistantText: '单次 loop 最终回答',
            finalizationMode: 'normal',
            memoryWriteEligible: true,
            modelCallCount: 1,
            source: 'chat',
            stopReason: 'natural_completion',
        })
        expect(harness.createPhaseModel.mock.calls.map(call => call[0].phase)).toEqual(['loop'])
        expect(harness.chunks).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'agent-text-start', runId: 'run-direct-loop-final' }),
                expect.objectContaining({ type: 'agent-text-delta', delta: '单次 loop 最终回答' }),
                expect.objectContaining({ type: 'agent-text-end', outcome: 'final_answer', status: 'completed' }),
                expect.objectContaining({ type: 'agent-run-end', finalizationMode: 'normal', status: 'completed' }),
            ])
        )
    })

    it('loop callback 的正文增量按原顺序公开，不退化为结束时单块文本', async () => {
        const harness = createHarness({
            loopModel: new ScriptedModel([() => new AIMessage('第一段第二段')], [['第一段', '第二段']]),
        })

        await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('流式回答')],
            runId: 'run-loop-deltas',
            threadId: 'thread-loop-deltas',
        })

        expect(chunksOfType(harness.chunks, 'agent-text-delta').map(chunk => chunk.delta)).toEqual(['第一段', '第二段'])
    })

    it('先有说明文字再调用 Tool 时，说明作为 commentary 在 tool-start 之前闭合，随后正文成为 final', async () => {
        const calculator = createToolDefinition({ execute: ({ value }) => `计算结果 ${value}`, name: 'calculator' })
        const harness = createHarness({
            loopModel: new ScriptedModel(
                [
                    () =>
                        new AIMessage({
                            content: '我先计算一下。',
                            tool_calls: [{ args: { value: '1+1' }, id: 'calculator-1', name: 'calculator', type: 'tool_call' }],
                        }),
                    () => new AIMessage('结果是 2。'),
                ],
                [['我先', '计算一下。'], ['结果是 2。']]
            ),
            toolDefinitionMap: new Map([[calculator.name, calculator]]),
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('计算 1+1')],
            runId: 'run-text-tool-final',
            threadId: 'thread-text-tool-final',
        })

        expect(result).toMatchObject({ assistantText: '结果是 2。', finalizationMode: 'normal', source: 'tool' })
        const events = harness.chunks.map(chunk => (chunk as { type: string }).type)
        const commentaryEnd = harness.chunks.findIndex(
            chunk => (chunk as { type?: string }).type === 'agent-text-end' && (chunk as { outcome?: string }).outcome === 'commentary'
        )
        expect(commentaryEnd).toBeGreaterThanOrEqual(0)
        expect(commentaryEnd).toBeLessThan(events.indexOf('tool-start'))
        expect(chunksOfType(harness.chunks, 'agent-text-end')).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ outcome: 'commentary', status: 'completed' }),
                expect.objectContaining({ outcome: 'final_answer', status: 'completed' }),
            ])
        )
    })

    it('先 Tool、工具间说明、再 Tool、最后正文时，为每个模型 turn 保留独立 Trace 行', async () => {
        const firstTool = createToolDefinition({ execute: () => '第一个结果', name: 'first-tool' })
        const secondTool = createToolDefinition({ execute: () => '第二个结果', name: 'second-tool' })
        const harness = createHarness({
            loopModel: new ScriptedModel(
                [
                    () =>
                        new AIMessage({
                            content: '',
                            tool_calls: [{ args: { value: 'a' }, id: 'first-1', name: 'first-tool', type: 'tool_call' }],
                        }),
                    () =>
                        new AIMessage({
                            content: '第一个结果已拿到，再查第二项。',
                            tool_calls: [{ args: { value: 'b' }, id: 'second-1', name: 'second-tool', type: 'tool_call' }],
                        }),
                    () => new AIMessage('两项结果已经汇总。'),
                ],
                [[], ['第一个结果已拿到，', '再查第二项。'], ['两项结果已经汇总。']]
            ),
            toolDefinitionMap: new Map([
                [firstTool.name, firstTool],
                [secondTool.name, secondTool],
            ]),
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('完成两项查询')],
            runId: 'run-tool-text-tool-final',
            threadId: 'thread-tool-text-tool-final',
        })

        expect(result).toMatchObject({ assistantText: '两项结果已经汇总。', finalizationMode: 'normal', toolCallCount: 2 })
        expect(chunksOfType(harness.chunks, 'tool-start')).toHaveLength(2)
        expect(chunksOfType(harness.chunks, 'agent-text-start')).toHaveLength(2)
        expect(chunksOfType(harness.chunks, 'agent-text-end')).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ outcome: 'commentary', status: 'completed' }),
                expect.objectContaining({ outcome: 'final_answer', status: 'completed' }),
            ])
        )
    })

    it('空的自然 no-Tool 结果进入一次无 Tool constrained finalizer，且不写入 Memory', async () => {
        const harness = createHarness({
            finalizerModel: new ScriptedModel([() => new AIMessage('当前没有足够信息完成回答。')]),
            loopModel: new ScriptedModel([() => new AIMessage('')]),
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('请回答')],
            runId: 'run-empty-loop-finalizer',
            threadId: 'thread-empty-loop-finalizer',
        })

        expect(result).toMatchObject({
            assistantText: '当前没有足够信息完成回答。',
            finalizationMode: 'constrained',
            memoryWriteEligible: false,
            modelCallCount: 2,
        })
        expect(harness.createPhaseModel.mock.calls.map(call => call[0].phase)).toEqual(['loop', 'finalizer'])
        expect(harness.chunks).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'agent-text-end', outcome: 'final_answer', status: 'completed' }),
                expect.objectContaining({ type: 'agent-run-end', finalizationMode: 'constrained', status: 'completed' }),
            ])
        )
    })

    it('明确 length 正文不能成为 normal final，而是进入一次 constrained finalizer', async () => {
        const harness = createHarness({
            finalizerModel: new ScriptedModel([() => new AIMessage('基于已完成的信息给出受限回答。')]),
            loopModel: new ScriptedModel([
                () => new AIMessage({ content: '被截断的候选正文', response_metadata: { finish_reason: 'length' } }),
            ]),
        })

        const result = await runHarness(harness, {
            context: harness.context,
            messages: [new HumanMessage('请回答')],
            runId: 'run-length-finalizer',
            threadId: 'thread-length-finalizer',
        })

        expect(result).toMatchObject({
            assistantText: '基于已完成的信息给出受限回答。',
            finalizationMode: 'constrained',
            memoryWriteEligible: false,
            stopReason: 'model_error',
        })
        expect(harness.createPhaseModel.mock.calls.map(call => call[0].phase)).toEqual(['loop', 'finalizer'])
        expect(chunksOfType(harness.chunks, 'agent-text-end')).toContainEqual(
            expect.objectContaining({ outcome: 'commentary', status: 'interrupted' })
        )
    })

    it('明确 content_filter 不调用 finalizer，也不产生 completed final', async () => {
        const harness = createHarness({
            loopModel: new ScriptedModel([
                () => new AIMessage({ additional_kwargs: { finish_reason: 'content_filter' }, content: '不应完成' }),
            ]),
        })

        await expect(
            runHarness(harness, {
                context: harness.context,
                messages: [new HumanMessage('请回答')],
                runId: 'run-filter-blocked',
                threadId: 'thread-filter-blocked',
            })
        ).rejects.toMatchObject({ code: 'AGENT_CONTRACT_VIOLATION' })

        expect(harness.createPhaseModel.mock.calls.map(call => call[0].phase)).toEqual(['loop'])
        expect(chunksOfType(harness.chunks, 'agent-text-end')).toContainEqual(
            expect.objectContaining({ outcome: 'commentary', status: 'interrupted' })
        )
        expect(chunksOfType(harness.chunks, 'agent-run-end')).not.toContainEqual(expect.objectContaining({ status: 'completed' }))
    })

    it('受限 finalizer 在公开部分正文后异常时，以 interrupted commentary 收口而不是伪造 final', async () => {
        const harness = createHarness({
            finalizerModel: new PartialThenProviderErrorFinalizer(),
            loopModel: new ScriptedModel([() => new AIMessage('')]),
        })

        await expect(
            runHarness(harness, {
                context: harness.context,
                messages: [new HumanMessage('请回答')],
                runId: 'run-partial-finalizer-failure',
                threadId: 'thread-partial-finalizer-failure',
            })
        ).rejects.toBeInstanceOf(GeneralReActAgentRunError)

        expect(chunksOfType(harness.chunks, 'agent-text-delta')).toEqual(
            expect.arrayContaining([expect.objectContaining({ delta: '已经公开的受限回答前缀。' })])
        )
        expect(chunksOfType(harness.chunks, 'agent-text-end')).toContainEqual(
            expect.objectContaining({ outcome: 'commentary', status: 'interrupted' })
        )
        expect(chunksOfType(harness.chunks, 'agent-run-end')).toContainEqual(expect.objectContaining({ status: 'failed' }))
    })
})
