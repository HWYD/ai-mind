import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { FakeChatModel } from '@langchain/core/utils/testing'
import { ReducedValue, StateSchema } from '@langchain/langgraph'
import { describe, expect, it, vi } from 'vitest'

import { createGeneralReActRunContext, generalReActRunContextSchema } from '@/lib/ai/runtime/general-react-agent/agent-context'
import { createGeneralReActInitialState, generalReActAgentStateSchema } from '@/lib/ai/runtime/general-react-agent/agent-state'
import { GENERAL_REACT_RUNTIME_DEFAULTS } from '@/lib/ai/runtime/general-react-agent/runtime-config'

describe('General ReAct state and runtime defaults', () => {
    it('freezes the v0.6.1 loop and finalizer budgets', () => {
        expect(GENERAL_REACT_RUNTIME_DEFAULTS).toMatchObject({
            hardDeadlineMs: 270_000,
            loopDeadlineMs: 235_000,
            maxFinalizerMs: 30_000,
            maxLogicalToolCalls: 14,
            maxLoopModelCalls: 10,
            maxModelCalls: 11,
            maxObservationChars: 48_000,
            maxToolBearingRounds: 9,
            recursionLimit: 24,
            reservedFinalizerModelCalls: 1,
            terminalReserveMs: 5_000,
        })
    })

    it('freezes the fixed v0.6.1 server-owned budgets', () => {
        expect(GENERAL_REACT_RUNTIME_DEFAULTS).toEqual({
            hardDeadlineMs: 270_000,
            loopDeadlineMs: 235_000,
            maxFinalizerMs: 30_000,
            maxLogicalToolCalls: 14,
            maxLoopModelCalls: 10,
            maxModelCalls: 11,
            maxModelRetries: 1,
            maxNoProgressRounds: 2,
            maxObservationChars: 48_000,
            maxObservationCharsPerCall: 12_000,
            maxToolConcurrency: 3,
            maxToolRetries: 4,
            maxToolBearingRounds: 9,
            recursionLimit: 24,
            reservedFinalizerModelCalls: 1,
            terminalReserveMs: 5_000,
        })
        expect(Object.isFrozen(GENERAL_REACT_RUNTIME_DEFAULTS)).toBe(true)
    })

    it('creates one run-local initial state with deadlines derived from the outer start time', async () => {
        const state = createGeneralReActInitialState(10_000)

        expect(state).toMatchObject({
            _loopDeadlineAtMs: 245_000,
            _loopModelCallCount: 0,
            _toolBearingRoundCount: 0,
            _authorizedUrls: [],
            _callFingerprints: [],
            _currentActionBatch: null,
            _executedToolCallCount: 0,
            _finalizationMode: null,
            _hardDeadlineAtMs: 280_000,
            _modelRetryCount: 0,
            _noProgressRounds: 0,
            _observationChars: 0,
            _runPhase: 'preparing',
            _sources: [],
            _startedAtMs: 10_000,
            _stopReason: null,
            _toolCallCount: 0,
            _toolRequestCount: 0,
            _toolRetryCount: 0,
        })
        await expect(generalReActAgentStateSchema.validateInput(state)).resolves.toEqual(state)
    })

    it('accepts the finalizer phase after the tenth loop decision', async () => {
        const state = {
            ...createGeneralReActInitialState(10_000),
            _loopModelCallCount: 10,
            _runPhase: 'finalizing',
        }

        await expect(generalReActAgentStateSchema.validateInput(state)).resolves.toEqual(state)
    })

    it('accepts ten loop model calls but rejects an eleventh before finalizer capacity is consumed', async () => {
        const state = createGeneralReActInitialState(10_000)

        await expect(
            generalReActAgentStateSchema.validateInput({
                ...state,
                _loopModelCallCount: GENERAL_REACT_RUNTIME_DEFAULTS.maxLoopModelCalls,
            })
        ).resolves.toMatchObject({ _loopModelCallCount: 10 })
        await expect(
            generalReActAgentStateSchema.validateInput({
                ...state,
                _loopModelCallCount: GENERAL_REACT_RUNTIME_DEFAULTS.maxLoopModelCalls + 1,
            })
        ).rejects.toThrow()
    })

    it('uses normal or constrained Answer modes and rejects the removed natural mode', async () => {
        const state = createGeneralReActInitialState(10_000)

        await expect(generalReActAgentStateSchema.validateInput({ ...state, _finalizationMode: 'normal' })).resolves.toMatchObject({
            _finalizationMode: 'normal',
        })
        await expect(generalReActAgentStateSchema.validateInput({ ...state, _finalizationMode: 'natural' })).rejects.toThrow()
    })

    it('grants only safe URLs explicitly present in the current user message', () => {
        const state = createGeneralReActInitialState(10_000, [
            new SystemMessage('https://system.example/private-context'),
            new HumanMessage(
                '请读取 https://docs.example.com/guide#section 和 http://127.0.0.1/admin。重复 https://docs.example.com/guide。'
            ),
        ])

        expect(state._authorizedUrls).toEqual([
            {
                canonicalUrl: 'https://docs.example.com/guide',
                grantCallId: null,
                grantedAtRound: 0,
                grantedBy: 'user',
                host: 'docs.example.com',
            },
        ])
    })

    it('merges revalidated server-trusted same-thread user URLs without accepting unsafe URLs', () => {
        const state = createGeneralReActInitialState(
            10_000,
            [new HumanMessage('这轮请继续处理，但没有重复链接。')],
            ['https://docs.example.com/previous#section', 'http://127.0.0.1/internal', 'https://user:password@example.com/private']
        )

        expect(state._authorizedUrls).toEqual([
            {
                canonicalUrl: 'https://docs.example.com/previous',
                grantCallId: null,
                grantedAtRound: 0,
                grantedBy: 'user',
                host: 'docs.example.com',
            },
        ])
    })

    it('re-canonicalizes server-trusted URLs and caps reuse at eight entries', () => {
        const trustedUrls = Array.from({ length: 9 }, (_, index) => `https://docs.example.com/page-${index}#fragment`)
        const state = createGeneralReActInitialState(10_000, [], trustedUrls)

        expect(state._authorizedUrls).toHaveLength(8)
        expect(state._authorizedUrls.map(grant => grant.canonicalUrl)).toEqual(
            Array.from({ length: 8 }, (_, index) => `https://docs.example.com/page-${index}`)
        )
    })

    it('uses LangGraph reducers for merge-safe counter deltas', () => {
        expect(StateSchema.isInstance(generalReActAgentStateSchema)).toBe(true)

        const toolCallCount = generalReActAgentStateSchema.fields._toolCallCount
        const observationChars = generalReActAgentStateSchema.fields._observationChars

        expect(ReducedValue.isInstance(toolCallCount)).toBe(true)
        expect(ReducedValue.isInstance(observationChars)).toBe(true)

        if (!ReducedValue.isInstance(toolCallCount) || !ReducedValue.isInstance(observationChars)) {
            throw new Error('Expected counter fields to use ReducedValue')
        }

        expect(toolCallCount.reducer(4, 3)).toBe(7)
        expect(observationChars.reducer(12_000, 2_500)).toBe(14_500)
    })

    it('rejects invalid state values at the schema boundary', async () => {
        const state = createGeneralReActInitialState(10_000)

        await expect(
            generalReActAgentStateSchema.validateInput({
                ...state,
                _runPhase: 'unknown',
            })
        ).rejects.toThrow()
        await expect(
            generalReActAgentStateSchema.validateInput({
                ...state,
                _toolCallCount: GENERAL_REACT_RUNTIME_DEFAULTS.maxLogicalToolCalls + 1,
            })
        ).rejects.toThrow()
    })
})

describe('General ReAct immutable runtime context', () => {
    it('validates execution dependencies and freezes the context reference set', () => {
        const signal = new AbortController().signal
        const toolDefinitionMap = new Map()
        const input = {
            clock: { now: () => 10_000 },
            createPhaseModel: vi.fn(() => new FakeChatModel({})),
            executionContext: {
                resolvedModelSelection: {
                    catalogItem: {
                        availableIn: ['development' as const],
                        capabilities: {
                            chat: true,
                            embedding: false,
                            jsonOutput: true,
                            streaming: true,
                            tasklist: false,
                            toolCalling: true,
                        },
                        contextWindowTokens: 32_000,
                        enabled: true,
                        family: 'qwen' as const,
                        id: 'qwen:test',
                        label: 'Test model',
                        modelKey: 'test',
                        provider: 'qwen' as const,
                        providerModel: 'test-model',
                    },
                    modelId: 'qwen:test',
                    provider: 'qwen' as const,
                    providerModel: 'test-model',
                    routeType: 'chat' as const,
                },
            },
            isTransportClosed: vi.fn(() => false),
            normalizeModelError: vi.fn(() => ({
                code: 'MODEL_ERROR',
                logMeta: {},
                message: '模型调用失败。',
                retryable: false,
            })),
            publishChunk: vi.fn(async () => undefined),
            retryPermitPool: {
                snapshot: vi.fn(() => []),
                tryAcquire: vi.fn(() => null),
            },
            runSignal: signal,
            toolDefinitionMap,
        }

        const context = createGeneralReActRunContext(input)

        expect(generalReActRunContextSchema.parse(context)).toEqual(context)
        expect(context.runSignal).toBe(signal)
        expect(context.toolDefinitionMap).toBe(toolDefinitionMap)
        expect(Object.isFrozen(context)).toBe(true)
        expect(() => Object.assign(context, { runSignal: new AbortController().signal })).toThrow()
    })

    it('fails closed when a required dependency is missing or the signal is invalid', () => {
        expect(() => generalReActRunContextSchema.parse({})).toThrow()
        expect(() =>
            generalReActRunContextSchema.parse({
                clock: { now: () => 10_000 },
                createPhaseModel: vi.fn(),
                executionContext: {},
                isTransportClosed: vi.fn(() => false),
                normalizeModelError: vi.fn(),
                publishChunk: vi.fn(async () => undefined),
                retryPermitPool: {
                    snapshot: vi.fn(() => []),
                    tryAcquire: vi.fn(() => null),
                },
                runSignal: {},
                toolDefinitionMap: new Map(),
            })
        ).toThrow()
    })
})
