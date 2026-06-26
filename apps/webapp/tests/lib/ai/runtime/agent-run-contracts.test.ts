import { describe, expect, it } from 'vitest'

import {
    agentInterruptKindSchema,
    agentInterruptStatusSchema,
    agentRunApiErrorCodeSchema,
    agentRunResultStatusSchema,
    agentRunStatusSchema,
} from '@/lib/ai/agent-runs/contracts'
import {
    VERSION_PLAN_TASKLIST_AGENT_VERSION,
    VERSION_PLAN_TASKLIST_GRAPH_VERSION,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/types'

describe('lib/ai/agent-runs contracts', () => {
    it('冻结 run、result 和 interrupt 状态', () => {
        expect(agentRunStatusSchema.options).toEqual([
            'running',
            'paused',
            'resuming',
            'completed',
            'rejected',
            'failed',
            'cancelled',
            'version_mismatch',
        ])
        expect(agentRunResultStatusSchema.options).toEqual(['final', 'final_with_manual_review_items', 'blocked', 'rejected'])
        expect(agentInterruptStatusSchema.options).toEqual(['pending', 'decided', 'rejected', 'invalidated'])
        expect(agentInterruptKindSchema.options).toEqual(['strategy_review', 'tasklist_revision_review'])
    })

    it('冻结 resume API 错误码并拒绝未知值', () => {
        expect(agentRunApiErrorCodeSchema.safeParse('AGENT_RUN_VERSION_MISMATCH').success).toBe(true)
        expect(agentRunApiErrorCodeSchema.safeParse('RAW_CHECKPOINT_ERROR').success).toBe(false)
    })

    it('显式记录 agentVersion 和 graphVersion', () => {
        expect(VERSION_PLAN_TASKLIST_AGENT_VERSION).toBe('v0.3.0')
        expect(VERSION_PLAN_TASKLIST_GRAPH_VERSION).toBe('v0.3.0')
    })
})
