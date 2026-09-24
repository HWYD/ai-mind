import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { tool } from '@langchain/core/tools'
import { createAgent, createMiddleware } from 'langchain'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createCompletedAgentRunEndFixture, createModelTurnStreamFixture } from './model-turn-stream-fixtures'

type GenerateResponse = (options: BaseChatModel['ParsedCallOptions']) => Promise<AIMessage> | AIMessage

class ScriptedChatModel extends BaseChatModel {
    private invocationIndex = 0

    constructor(
        private readonly responses: GenerateResponse[],
        private readonly onGenerate?: () => void
    ) {
        super({})
    }

    _llmType(): string {
        return 'dependency-compatibility-scripted-model'
    }

    bindTools() {
        return this
    }

    async _generate(_messages: BaseMessage[], options: this['ParsedCallOptions']): Promise<ChatResult> {
        this.onGenerate?.()
        const response = this.responses[Math.min(this.invocationIndex, this.responses.length - 1)]
        this.invocationIndex += 1

        if (!response) {
            throw new Error('Scripted model exhausted its responses')
        }

        const message = await response(options)
        return {
            generations: [
                {
                    message,
                    text: typeof message.content === 'string' ? message.content : '',
                },
            ],
        }
    }
}

function createV2Agent(model: BaseChatModel, middleware: ReturnType<typeof createMiddleware>[] = [], tools = []) {
    return createAgent({
        middleware,
        model,
        tools,
        version: 'v2',
    })
}

describe('LangChain createAgent dependency compatibility', () => {
    it('keeps completed normal and constrained agent-run-end finalization modes explicit in the spike fixtures', () => {
        expect([createCompletedAgentRunEndFixture('normal'), createCompletedAgentRunEndFixture('constrained')]).toEqual([
            { finalizationMode: 'normal', status: 'completed', type: 'agent-run-end' },
            { finalizationMode: 'constrained', status: 'completed', type: 'agent-run-end' },
        ])
    })

    it('exposes text deltas, a complete AIMessage, Tool calls, normal closure, and terminal metadata for one logical model turn', async () => {
        const fixture = createModelTurnStreamFixture({
            content: '我先查询天气。',
            modelTurnId: 'weather-turn-1',
            publicTextDeltas: ['我先', '查询天气。'],
            toolCalls: [
                {
                    args: { city: '上海' },
                    id: 'weather-call-1',
                    name: 'lookup_weather',
                    type: 'tool_call',
                },
            ],
        })
        const streamMetadata: Record<string, unknown>[] = []
        const observedTurn: {
            completeMessage?: AIMessage
            modelTurnId?: string
            ordinal?: number
            publicTextDeltas: string[]
        } = { publicTextDeltas: [] }
        const lookupWeather = tool(async () => '晴', {
            description: 'Look up weather for a city.',
            name: 'lookup_weather',
            schema: z.object({ city: z.string() }),
        })
        const afterModel = createMiddleware({
            afterModel: {
                canJumpTo: ['end'],
                hook: state => {
                    const message = state.messages.at(-1)
                    if (AIMessage.isInstance(message)) {
                        observedTurn.completeMessage = message
                        const modelTurnId = (message.response_metadata as { model_turn_id?: unknown }).model_turn_id
                        if (typeof modelTurnId === 'string') {
                            observedTurn.modelTurnId = modelTurnId
                        }
                    }

                    return { jumpTo: 'end' } as never
                },
            },
            name: 'dependency-compatibility-model-turn-capture',
        })
        const agent = createV2Agent(fixture.model, [afterModel], [lookupWeather])

        for await (const streamEvent of await agent.stream(
            { messages: [new HumanMessage('上海天气如何？')] },
            { streamMode: ['messages', 'updates'] }
        )) {
            if (!Array.isArray(streamEvent) || streamEvent[0] !== 'messages' || !Array.isArray(streamEvent[1])) {
                continue
            }

            const [message, metadata] = streamEvent[1]
            if (typeof message === 'object' && message !== null && 'content' in message && typeof message.content === 'string') {
                observedTurn.publicTextDeltas.push(message.content)
            }
            if (typeof metadata === 'object' && metadata !== null) {
                streamMetadata.push(metadata as Record<string, unknown>)
                if (typeof metadata.langgraph_step === 'number') {
                    observedTurn.ordinal = metadata.langgraph_step
                }
            }
        }

        expect(observedTurn).toMatchObject({
            modelTurnId: fixture.expected.modelTurnId,
            ordinal: expect.any(Number),
            publicTextDeltas: fixture.expected.publicTextDeltas,
        })
        expect(observedTurn.completeMessage).toMatchObject({
            content: observedTurn.publicTextDeltas.join(''),
            response_metadata: { model_turn_id: observedTurn.modelTurnId },
            tool_calls: fixture.expected.toolCalls,
        })
        expect(observedTurn.completeMessage?.content).toBe(observedTurn.publicTextDeltas.join(''))
        expect(streamMetadata).toContainEqual(expect.objectContaining({ langgraph_node: 'model_request' }))
        expect(streamMetadata.some(metadata => typeof metadata.langgraph_step === 'number')).toBe(true)
    })

    it('preserves explicit non-natural provider metadata after the stream closes', async () => {
        const fixture = createModelTurnStreamFixture({
            content: '输出因长度限制而中断',
            finishReason: 'length',
            reasoningContent: 'private reasoning must not become a public text delta',
        })
        let completedMessage: AIMessage | undefined
        const publicTextDeltas: string[] = []
        const agent = createV2Agent(fixture.model, [
            createMiddleware({
                afterModel: state => {
                    const message = state.messages.at(-1)
                    if (AIMessage.isInstance(message)) {
                        completedMessage = message
                    }
                },
                name: 'dependency-compatibility-finish-metadata-capture',
            }),
        ])

        for await (const streamEvent of await agent.stream(
            { messages: [new HumanMessage('请给出受限回答')] },
            { streamMode: ['messages', 'updates'] }
        )) {
            if (!Array.isArray(streamEvent) || streamEvent[0] !== 'messages' || !Array.isArray(streamEvent[1])) {
                continue
            }

            const [message] = streamEvent[1]
            if (typeof message === 'object' && message !== null && 'content' in message && typeof message.content === 'string') {
                publicTextDeltas.push(message.content)
            }
        }

        expect(publicTextDeltas).toEqual(fixture.expected.publicTextDeltas)
        expect(publicTextDeltas).not.toContain('private reasoning must not become a public text delta')
        expect(completedMessage).toMatchObject({
            content: '输出因长度限制而中断',
            response_metadata: { finish_reason: fixture.expected.finishReason },
        })
    })

    it('imports and streams safely in the Node.js server runtime', async () => {
        expect(typeof createAgent).toBe('function')

        const agent = createV2Agent(new ScriptedChatModel([async () => new AIMessage({ content: 'server stream ready' })]))
        const chunks = []

        for await (const chunk of await agent.stream(
            { messages: [new HumanMessage('check server stream')] },
            { streamMode: ['messages', 'updates'] }
        )) {
            chunks.push(chunk)
        }

        expect(chunks.length).toBeGreaterThan(0)
    })

    it('runs middleware before hooks in declaration order and after hooks in reverse order', async () => {
        const order: string[] = []
        const first = createMiddleware({
            afterModel: () => {
                order.push('first:after')
            },
            beforeModel: () => {
                order.push('first:before')
            },
            name: 'dependency-compatibility-first',
        })
        const second = createMiddleware({
            afterModel: () => {
                order.push('second:after')
            },
            beforeModel: () => {
                order.push('second:before')
            },
            name: 'dependency-compatibility-second',
        })
        const model = new ScriptedChatModel([async () => new AIMessage({ content: 'done' })], () => order.push('model'))

        await createV2Agent(model, [first, second]).invoke({
            messages: [new HumanMessage('check middleware order')],
        })

        expect(order).toEqual(['first:before', 'second:before', 'model', 'second:after', 'first:after'])
    })

    it('propagates the invocation AbortSignal into the model call', async () => {
        const controller = new AbortController()
        let receivedSignal: AbortSignal | undefined
        let markModelStarted: (() => void) | undefined
        const modelStarted = new Promise<void>(resolve => {
            markModelStarted = resolve
        })
        const model = new ScriptedChatModel([
            options =>
                new Promise<AIMessage>((_resolve, reject) => {
                    receivedSignal = options.signal
                    markModelStarted?.()
                    options.signal?.addEventListener(
                        'abort',
                        () => reject(options.signal?.reason ?? new DOMException('Aborted', 'AbortError')),
                        { once: true }
                    )
                }),
        ])
        const invocation = createV2Agent(model).invoke(
            { messages: [new HumanMessage('check abort propagation')] },
            { signal: controller.signal }
        )

        await modelStarted
        controller.abort(new DOMException('Cancelled by test', 'AbortError'))

        await expect(invocation).rejects.toMatchObject({ name: 'AbortError' })
        expect(receivedSignal).toBeDefined()
        expect(receivedSignal?.aborted).toBe(true)
        expect(receivedSignal?.reason).toMatchObject({ name: 'AbortError' })
    })

    it('honors maxConcurrency=3 for four parallel v2 tool calls', async () => {
        let active = 0
        let peak = 0
        let started = 0
        let releaseFirstBatch: (() => void) | undefined
        const firstBatchReady = new Promise<void>(resolve => {
            releaseFirstBatch = resolve
        })
        const tools = Array.from({ length: 4 }, (_, index) => {
            const name = `parallel_tool_${index + 1}`
            return tool(
                async ({ value }) => {
                    active += 1
                    started += 1
                    peak = Math.max(peak, active)

                    if (started === 3) {
                        releaseFirstBatch?.()
                    }

                    await firstBatchReady
                    await new Promise(resolve => setTimeout(resolve, 5))
                    active -= 1
                    return value
                },
                {
                    description: `Return ${name} input after the concurrency probe releases it.`,
                    name,
                    schema: z.object({ value: z.number() }),
                }
            )
        })
        let modelCall = 0
        const model = new ScriptedChatModel([
            async () => {
                modelCall += 1
                return new AIMessage({
                    content: '',
                    tool_calls: tools.map((currentTool, index) => ({
                        args: { value: index + 1 },
                        id: `parallel-call-${index + 1}`,
                        name: currentTool.name,
                        type: 'tool_call' as const,
                    })),
                })
            },
            async () => {
                modelCall += 1
                return new AIMessage({ content: 'parallel tools completed' })
            },
        ])

        await createV2Agent(model, [], tools).invoke({ messages: [new HumanMessage('run four independent tools')] }, { maxConcurrency: 3 })

        expect(modelCall).toBe(2)
        expect(started).toBe(4)
        expect(peak).toBe(3)
    })
})
