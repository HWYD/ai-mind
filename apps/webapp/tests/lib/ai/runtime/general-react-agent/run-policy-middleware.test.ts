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
    it('无 Tool 的 Action 文本只结束决策并进入 Answer Phase', () => {
        const state = createGeneralReActInitialState(1_000)

        expect(
            evaluateAfterModelPolicy({
                batchId: 'batch-1',
                message: new AIMessage('直接回答'),
                state: { ...state, _actionModelCallCount: 1 },
            })
        ).toMatchObject({
            _finalizationMode: 'normal',
            _runPhase: 'answering',
            _stopReason: 'natural_completion',
            jumpTo: 'end',
        })
    })

    it('按 assistant ordinal 为同批 Tool Call 预占最多九个 logical slots', () => {
        const state = createGeneralReActInitialState(1_000)
        const toolCalls = Array.from({ length: 10 }, (_, index) => ({
            args: { value: index },
            id: `call-${index + 1}`,
            name: 'calculator',
            type: 'tool_call' as const,
        }))

        const update = evaluateAfterModelPolicy({
            batchId: 'batch-1',
            message: new AIMessage({ content: '', tool_calls: toolCalls }),
            state: { ...state, _actionModelCallCount: 1 },
        })

        expect(update._actionRoundCount).toBe(1)
        expect(update._toolRequestCount).toBe(10)
        expect(update._toolCallCount).toBe(9)
        expect(update._currentActionBatch?.orderedCallIds).toEqual(toolCalls.map(call => call.id))
        expect(update._currentActionBatch?.admissions['call-1']).toMatchObject({ admitted: true, ordinal: 1 })
        expect(update._currentActionBatch?.admissions['call-10']).toMatchObject({
            admitted: false,
            blockedReason: 'tool_call_limit',
            ordinal: 10,
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
            _runPhase: 'answering',
            _stopReason: 'agent_contract_violation',
            jumpTo: 'end',
        })
    })

    it('六个携带 Tool 的 Action rounds 后仍允许第七次 Action 作无 Tool 收口决策', () => {
        const state = createGeneralReActInitialState(1_000)

        expect(
            evaluateBeforeModelPolicy({
                nowMs: 2_000,
                runAborted: false,
                state: { ...state, _actionModelCallCount: 6, _actionRoundCount: 6 },
            })
        ).toMatchObject({ _runPhase: 'acting', _stopReason: null })
    })

    it('第七次 Action 仍请求 Tool 时不再 admission，并交给 constrained Answer 收口', () => {
        const state = createGeneralReActInitialState(1_000)

        expect(
            evaluateAfterModelPolicy({
                batchId: 'batch-7',
                message: new AIMessage({
                    content: '',
                    tool_calls: [{ args: {}, id: 'call-7', name: 'datetime', type: 'tool_call' }],
                }),
                nowMs: 2_000,
                state: { ...state, _actionModelCallCount: 6, _actionRoundCount: 6 },
            })
        ).toMatchObject({
            _currentActionBatch: null,
            _finalizationMode: 'constrained',
            _runPhase: 'answering',
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
            _runPhase: 'acting',
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
