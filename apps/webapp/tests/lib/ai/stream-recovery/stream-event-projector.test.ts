import { beforeEach, describe, expect, it } from 'vitest'

import { StreamEventProjector } from '@/lib/ai/stream-recovery/stream-event-projector'
import type { AppendStreamEventInput } from '@/lib/ai/stream-recovery/stream-event-store'

const ownerSessionHash = 'a'.repeat(64)
const runId = 'run_1'

class FakeStreamEventStore {
    appended: AppendStreamEventInput[] = []

    async appendEvent(input: AppendStreamEventInput) {
        this.appended.push(input)

        return {
            eventId: `evt_${this.appended.length}`,
            eventKind: input.terminalState ? 'terminal' : input.eventKind,
            payload: input.payload,
            protocolVersion: 1,
            runId: input.runId,
            runStatus: input.runStatus,
            sequence: this.appended.length,
            ...(input.terminalState ? { terminal: true, terminalState: input.terminalState } : {}),
        }
    }
}

describe('stream-event-projector', () => {
    let fakeStore: FakeStreamEventStore
    let projector: StreamEventProjector

    beforeEach(() => {
        fakeStore = new FakeStreamEventStore()
        projector = new StreamEventProjector(fakeStore as never)
    })

    it('projects normal public chunks as chunk events', async () => {
        await expect(
            projector.projectChunk({
                chunk: {
                    delta: 'hello',
                    partId: 'answer',
                    type: 'text-delta',
                },
                ownerSessionHash,
                runId,
            })
        ).resolves.toMatchObject({
            eventKind: 'chunk',
            sequence: 1,
        })
        expect(fakeStore.appended[0]).toMatchObject({
            eventKind: 'chunk',
            ownerSessionHash,
            runId,
        })
    })

    it('maps finish and error chunks to terminal stream states', async () => {
        await expect(
            projector.projectChunk({
                chunk: {
                    type: 'finish',
                },
                ownerSessionHash,
                runId,
            })
        ).resolves.toMatchObject({
            eventKind: 'terminal',
            terminal: true,
            terminalState: 'completed',
        })
        await expect(
            projector.projectChunk({
                chunk: {
                    errorCode: 'MODEL_STREAM_FAILED',
                    message: 'Model stream failed.',
                    retryable: false,
                    scope: 'runtime',
                    type: 'error',
                },
                ownerSessionHash,
                runId,
            })
        ).resolves.toMatchObject({
            eventKind: 'terminal',
            terminal: true,
            terminalState: 'failed',
        })
    })

    it('keeps tool, resource and prompt errors as non-terminal local events', async () => {
        for (const scope of ['tool', 'resource', 'prompt'] as const) {
            const event = await projector.projectChunk({
                chunk: {
                    errorCode: 'TOOL_EXECUTION_FAILED',
                    message: `${scope} failed`,
                    retryable: true,
                    scope,
                    type: 'error',
                },
                ownerSessionHash,
                runId,
            })
            expect(event).toMatchObject({ eventKind: 'chunk' })
            expect(event).not.toHaveProperty('terminal')
            expect(event).not.toHaveProperty('terminalState')
        }
    })

    it('allows a local error to be followed by body output and one completed terminal', async () => {
        for (const scope of ['tool', 'resource', 'prompt'] as const) {
            fakeStore.appended.length = 0

            await projector.projectChunk({
                chunk: {
                    errorCode: 'TOOL_EXECUTION_FAILED',
                    message: `${scope} failed`,
                    retryable: true,
                    scope,
                    type: 'error',
                },
                ownerSessionHash,
                runId,
            })
            await projector.projectChunk({
                chunk: {
                    delta: 'continued answer',
                    partId: 'answer',
                    type: 'text-delta',
                },
                ownerSessionHash,
                runId,
            })
            await projector.projectChunk({
                chunk: { type: 'finish' },
                ownerSessionHash,
                runId,
            })

            expect(fakeStore.appended.map(event => event.terminalState)).toEqual([undefined, undefined, 'completed'])
            expect(fakeStore.appended.map(event => event.eventKind)).toEqual(['chunk', 'chunk', 'terminal'])
        }
    })

    it('maps Agent interrupt/resume to non-terminal lifecycle statuses', async () => {
        await expect(
            projector.projectChunk({
                chunk: {
                    agentName: 'version-plan-to-tasklist-agent',
                    assistantMessageId: 'assistant_1',
                    interruptId: 'interrupt_1',
                    interruptKind: 'strategy_review',
                    payload: {
                        allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
                        data: {
                            planUri: 'demo://version-plans/v0.4.10.md',
                            reviewRound: 1,
                            strategy: {
                                granularity: 'medium',
                                grouping: 'by_phase',
                                priorityFocus: ['core_runtime'],
                                stepCountRange: '5-8',
                            },
                            targetVersion: 'v0.4.10',
                        },
                        kind: 'strategy_review',
                        nodeName: 'reviewTasklistStrategy',
                        runId,
                        threadId: 'thread_1',
                    },
                    runId,
                    threadId: 'thread_1',
                    type: 'agent-interrupt',
                },
                ownerSessionHash,
                runId,
            })
        ).resolves.toMatchObject({
            eventKind: 'lifecycle',
            runStatus: 'paused',
        })
        await expect(
            projector.projectChunk({
                chunk: {
                    agentName: 'version-plan-to-tasklist-agent',
                    assistantMessageId: 'assistant_1',
                    interruptId: 'interrupt_1',
                    runId,
                    threadId: 'thread_1',
                    type: 'agent-resume',
                },
                ownerSessionHash,
                runId,
            })
        ).resolves.toMatchObject({
            eventKind: 'lifecycle',
            runStatus: 'running',
        })
    })

    it('projects lifecycle run-status payloads including terminal cancellation', async () => {
        await expect(projector.projectLifecycle({ ownerSessionHash, runId, status: 'paused' })).resolves.toMatchObject({
            eventKind: 'lifecycle',
            runStatus: 'paused',
        })
        await expect(
            projector.projectLifecycle({
                code: 'USER_CANCELLED',
                message: 'Cancelled by user.',
                ownerSessionHash,
                runId,
                status: 'cancelled',
            })
        ).resolves.toMatchObject({
            eventKind: 'terminal',
            terminal: true,
            terminalState: 'cancelled',
        })
    })

    it('rejects invalid public DTOs', async () => {
        await expect(
            projector.projectChunk({
                chunk: {
                    delta: 'hello',
                    graphState: {
                        raw: true,
                    },
                    partId: 'answer',
                    type: 'text-delta',
                } as never,
                ownerSessionHash,
                runId,
            })
        ).rejects.toMatchObject({
            code: 'STREAM_EVENT_INVALID',
        })
    })

    it.each([
        'risk-subagent: 已完成',
        'task-subagent 缺少 plan artifact',
        'boundary-subagent: pass',
        '文档仅提及 OPENAI_API_KEY，不包含赋值',
    ])('preserves safe technical content: %s', async delta => {
        await expect(
            projector.projectChunk({
                chunk: {
                    delta,
                    partId: 'answer',
                    type: 'text-delta',
                },
                ownerSessionHash,
                runId,
            })
        ).resolves.toMatchObject({
            payload: {
                delta,
            },
        })
    })

    it.each([
        ['Bearer sensitive-token', 'Bearer [REDACTED]'],
        ['sk-example-value', 'sk-[REDACTED]'],
        ['Example api_key: sk-example-value', 'Example api_key: [REDACTED]'],
        ['OPENAI_API_KEY=vendor-secret-value', 'OPENAI_API_KEY=[REDACTED]'],
    ])('redacts secret-like content: %s', async (delta, expectedDelta) => {
        await expect(
            projector.projectChunk({
                chunk: {
                    delta,
                    partId: 'answer',
                    type: 'text-delta',
                },
                ownerSessionHash,
                runId,
            })
        ).resolves.toMatchObject({
            payload: {
                delta: expectedDelta,
            },
        })
    })
})
