import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { afterAll, describe, expect, it } from 'vitest'

import { CHAT_MEMORY_CHECKPOINT_SCHEMA, createPostgresChatMemoryCheckpointer } from '@/lib/ai/runtime/chat-memory'

const connectionString = process.env.DATABASE_URL?.trim()
const describeWithDatabase = connectionString ? describe : describe.skip

const TestState = Annotation.Root({
    value: Annotation<string>,
})

function createGraph(checkpointer: ReturnType<typeof createPostgresChatMemoryCheckpointer>) {
    return new StateGraph(TestState)
        .addNode('save', state => state)
        .addEdge(START, 'save')
        .addEdge('save', END)
        .compile({
            checkpointer,
            name: 'chat-memory-checkpointer-integration-test',
        })
}

describeWithDatabase('runtime/chat-memory PostgresSaver setup', () => {
    const savers: Array<ReturnType<typeof createPostgresChatMemoryCheckpointer>> = []

    afterAll(async () => {
        await Promise.all(savers.map(saver => saver.end()))
    })

    it('初始化 langgraph_chat_memory schema 后可读回 state', async () => {
        const saver = createPostgresChatMemoryCheckpointer(connectionString!)
        savers.push(saver)
        await saver.setup()

        const graph = createGraph(saver)
        const config = {
            configurable: {
                thread_id: `chat-memory-test-${Date.now()}-${Math.random()}`,
            },
            durability: 'sync' as const,
        }

        await graph.invoke({ value: CHAT_MEMORY_CHECKPOINT_SCHEMA }, config)

        expect((await graph.getState(config)).values).toEqual({
            value: CHAT_MEMORY_CHECKPOINT_SCHEMA,
        })
    })
})
