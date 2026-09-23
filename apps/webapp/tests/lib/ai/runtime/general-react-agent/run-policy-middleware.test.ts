import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'

import { createGeneralReActInitialState } from '@/lib/ai/runtime/general-react-agent/agent-state'
import {
    createGeneralReActToolFingerprint,
    evaluateAfterModelPolicy,
    evaluateBeforeModelPolicy,
    resolveNoProgressRounds,
    selectGeneralReActStopReason,
} from '@/lib/ai/runtime/general-react-agent/middleware/run-policy-middleware'

describe('general-react-agent run policy', () => {
    it('无 Tool 的 loop 正文直接结束并标记为 normal', () => {
        const state = createGeneralReActInitialState(1_000)

        expect(
            evaluateAfterModelPolicy({
                batchId: 'batch-1',
                message: new AIMessage('直接回答'),
                state: { ...state, _loopModelCallCount: 1 },
            })
        ).toMatchObject({
            _finalizationMode: 'normal',
            _runPhase: 'finalizing',
            _stopReason: 'natural_completion',
            jumpTo: 'end',
        })
    })

    it('明确 length 只能进入 constrained finalizer，content filter 则 fail closed', () => {
        const state = createGeneralReActInitialState(1_000)
        const lengthMessage = new AIMessage({ content: '被截断的正文', response_metadata: { finish_reason: 'length' } })
        const contentFilterMessage = new AIMessage({
            additional_kwargs: { finish_reason: 'content_filter' },
            content: '不应作为 final 的正文',
        })

        expect(evaluateAfterModelPolicy({ batchId: 'length', message: lengthMessage, state })).toMatchObject({
            _finalizationMode: 'constrained',
            _stopReason: 'model_error',
        })
        expect(evaluateAfterModelPolicy({ batchId: 'filter', message: contentFilterMessage, state })).toMatchObject({
            _finalizationMode: 'constrained',
            _stopReason: 'agent_contract_violation',
        })
    })

    it('normal final 决策后到达的 Tool Call 必须 fail closed，不能重新 admission', () => {
        const state = createGeneralReActInitialState(1_000)
        const lateToolMessage = new AIMessage({
            content: '不应执行这个工具。',
            tool_calls: [{ args: {}, id: 'late-tool', name: 'datetime', type: 'tool_call' }],
        })

        expect(
            evaluateAfterModelPolicy({
                batchId: 'late-tool',
                message: lateToolMessage,
                state: { ...state, _finalizationMode: 'normal', _runPhase: 'finalizing' },
            })
        ).toMatchObject({
            _currentActionBatch: null,
            _finalizationMode: 'constrained',
            _stopReason: 'agent_contract_violation',
            jumpTo: 'end',
        })
    })

    it('按 assistant ordinal 为同批 Tool Call 预占最多十四个 logical slots', () => {
        const state = createGeneralReActInitialState(1_000)
        const toolCalls = Array.from({ length: 15 }, (_, index) => ({
            args: { value: index },
            id: `call-${index + 1}`,
            name: 'calculator',
            type: 'tool_call' as const,
        }))

        const update = evaluateAfterModelPolicy({
            batchId: 'batch-1',
            message: new AIMessage({ content: '', tool_calls: toolCalls }),
            state: { ...state, _loopModelCallCount: 1 },
        })

        expect(update._toolBearingRoundCount).toBe(1)
        expect(update._toolRequestCount).toBe(15)
        expect(update._toolCallCount).toBe(14)
        expect(update._currentActionBatch?.orderedCallIds).toEqual(toolCalls.map(call => call.id))
        expect(update._currentActionBatch?.admissions['call-1']).toMatchObject({ admitted: true, ordinal: 1 })
        expect(update._currentActionBatch?.admissions['call-15']).toMatchObject({
            admitted: false,
            blockedReason: 'tool_call_limit',
            ordinal: 15,
        })
    })

    it('拒绝同一 assistant batch 中的重复 call id', () => {
        const state = createGeneralReActInitialState(1_000)
        const message = new AIMessage({
            content: '',
            tool_calls: [
                { args: {}, id: 'duplicate', name: 'datetime', type: 'tool_call' },
                { args: {}, id: 'duplicate', name: 'datetime', type: 'tool_call' },
            ],
        })

        expect(evaluateAfterModelPolicy({ batchId: 'batch-1', message, state })).toMatchObject({
            _finalizationMode: 'constrained',
            _runPhase: 'finalizing',
            _stopReason: 'agent_contract_violation',
            jumpTo: 'end',
        })
    })

    it('九个携带 Tool 的 loop rounds 后仍允许第十次 loop 作无 Tool 收口决策', () => {
        const state = createGeneralReActInitialState(1_000)

        expect(
            evaluateBeforeModelPolicy({
                nowMs: 2_000,
                runAborted: false,
                state: { ...state, _loopModelCallCount: 9, _toolBearingRoundCount: 9 },
            })
        ).toMatchObject({ _runPhase: 'looping', _stopReason: null })
    })

    it('第十次 loop 仍请求 Tool 时不再 admission，并交给 constrained finalizer 收口', () => {
        const state = createGeneralReActInitialState(1_000)

        expect(
            evaluateAfterModelPolicy({
                batchId: 'batch-10',
                message: new AIMessage({
                    content: '',
                    tool_calls: [{ args: {}, id: 'call-10', name: 'datetime', type: 'tool_call' }],
                }),
                nowMs: 2_000,
                state: { ...state, _loopModelCallCount: 9, _toolBearingRoundCount: 9 },
            })
        ).toMatchObject({
            _currentActionBatch: null,
            _finalizationMode: 'constrained',
            _runPhase: 'finalizing',
            jumpTo: 'end',
        })
    })

    it('历史 AIMessage 不应计入当前 Run 的模型预算', () => {
        const state = createGeneralReActInitialState(1_000)
        const historicalMessages = [
            ...Array.from({ length: 6 }, (_, index) => [
                new HumanMessage(`历史问题 ${index + 1}`),
                new AIMessage(`历史回答 ${index + 1}`),
            ]).flat(),
            new HumanMessage('当前问题'),
        ]

        expect(
            evaluateBeforeModelPolicy({
                messages: historicalMessages,
                nowMs: 2_000,
                runAborted: false,
                state,
            })
        ).toMatchObject({
            _runPhase: 'looping',
            _stopReason: null,
        })
    })

    it('连续两个无进展 batch 进入 no_progress，成功 observation 会清零', () => {
        expect(resolveNoProgressRounds(0, ['duplicate', 'provider_error'])).toBe(1)
        expect(resolveNoProgressRounds(1, ['denied', 'budget_blocked'])).toBe(2)
        expect(resolveNoProgressRounds(1, ['duplicate', 'success'])).toBe(0)

        const state = createGeneralReActInitialState(1_000)
        expect(
            evaluateBeforeModelPolicy({
                nowMs: 2_000,
                runAborted: false,
                state: { ...state, _noProgressRounds: 2 },
            })
        ).toMatchObject({ _stopReason: 'no_progress', jumpTo: 'end' })
    })

    it('fingerprint 对 key 顺序稳定，并将同参数调用识别为重复', () => {
        expect(createGeneralReActToolFingerprint('web-search', { b: 2, a: { d: 4, c: 3 } })).toBe(
            createGeneralReActToolFingerprint('web-search', { a: { c: 3, d: 4 }, b: 2 })
        )
    })

    it('使用固定 stop priority，不允许低优先级原因覆盖取消或 deadline', () => {
        expect(
            selectGeneralReActStopReason({
                actionDeadline: true,
                agentContractViolation: true,
                modelError: true,
                noProgress: true,
                requestCancelled: true,
                runDeadline: true,
                securityDenied: true,
                toolFailure: true,
            })
        ).toBe('request_cancelled')
        expect(selectGeneralReActStopReason({ actionDeadline: true, runDeadline: true })).toBe('run_deadline')
    })
})
