import { Annotation, Command, END, interrupt, START, StateGraph } from '@langchain/langgraph'
import { afterAll, describe, expect, it } from 'vitest'

import { createPostgresTasklistCheckpointer } from '@/lib/ai/runtime/version-plan-tasklist-agent/checkpoint/checkpointer-provider'

const connectionString = process.env.DATABASE_URL?.trim()
const describeWithDatabase = connectionString ? describe : describe.skip

const ReviewState = Annotation.Root({
    approved: Annotation<boolean | undefined>,
    request: Annotation<string>,
})

function createReviewGraph(checkpointer: ReturnType<typeof createPostgresTasklistCheckpointer>) {
    return new StateGraph(ReviewState)
        .addNode('review', state => {
            const decision = interrupt({
                kind: 'integration_review',
                request: state.request,
            }) as { approved: boolean }

            return {
                approved: decision.approved,
            }
        })
        .addEdge(START, 'review')
        .addEdge('review', END)
        .compile({
            checkpointer,
            name: 'postgres-checkpointer-integration-test',
        })
}

describeWithDatabase('runtime/version-plan-tasklist-agent PostgresSaver integration', () => {
    const savers: Array<ReturnType<typeof createPostgresTasklistCheckpointer>> = []

    afterAll(async () => {
        await Promise.all(savers.map(saver => saver.end()))
    })

    it('可释放 saver A，再由 saver B 使用同一 threadId resume', async () => {
        const threadId = `checkpoint-thread-${Date.now()}-${Math.random()}`
        const config = {
            configurable: {
                thread_id: threadId,
            },
            durability: 'sync' as const,
        }
        const saverA = createPostgresTasklistCheckpointer(connectionString!)
        savers.push(saverA)
        await saverA.setup()

        const graphA = createReviewGraph(saverA)
        const paused = await graphA.invoke(
            {
                request: 'approve durable resume',
            },
            config
        )
        const pausedState = await graphA.getState(config)

        expect(paused.approved).toBeUndefined()
        expect(pausedState.next).toEqual(['review'])
        expect(pausedState.tasks[0]?.interrupts[0]?.value).toEqual({
            kind: 'integration_review',
            request: 'approve durable resume',
        })

        await saverA.end()
        savers.splice(savers.indexOf(saverA), 1)

        const saverB = createPostgresTasklistCheckpointer(connectionString!)
        savers.push(saverB)
        const graphB = createReviewGraph(saverB)
        const resumed = await graphB.invoke(
            new Command({
                resume: {
                    approved: true,
                },
            }),
            config
        )

        expect(resumed).toMatchObject({
            approved: true,
            request: 'approve durable resume',
        })
        expect((await graphB.getState(config)).next).toEqual([])
    })

    it('错误 threadId 返回空状态，且不能推进目标 thread 的 checkpoint', async () => {
        const saver = createPostgresTasklistCheckpointer(connectionString!)
        savers.push(saver)
        const graph = createReviewGraph(saver)
        const targetConfig = {
            configurable: {
                thread_id: `target-thread-${Date.now()}-${Math.random()}`,
            },
            durability: 'sync' as const,
        }

        await graph.invoke(
            {
                request: 'target checkpoint must remain paused',
            },
            targetConfig
        )

        const result = await graph.invoke(
            new Command({
                resume: {
                    approved: true,
                },
            }),
            {
                configurable: {
                    thread_id: `missing-thread-${Date.now()}-${Math.random()}`,
                },
                durability: 'sync',
            }
        )

        expect(result).toEqual({})
        expect((await graph.getState(targetConfig)).next).toEqual(['review'])
    })
})
