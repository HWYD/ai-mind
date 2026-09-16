import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { tool } from '@langchain/core/tools'
import { createAgent, createMiddleware } from 'langchain'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

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
