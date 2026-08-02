import { describe, expect, it } from 'vitest'

import {
    canCallPlanningModel,
    canGenerateImage,
    canRevisePrompt,
    createInitialImageGenerationGraphState,
} from '@/lib/ai/runtime/image-generation-agent/graph/graph-state'

describe('image generation graph state', () => {
    it('enforces the planning, revision and generation hard limits before an external call', () => {
        const state = createInitialImageGenerationGraphState({ rawDescription: 'a quiet lake', runId: 'run-1' })

        expect(canCallPlanningModel(state)).toBe(true)
        expect(canRevisePrompt(state)).toBe(true)
        expect(canGenerateImage(state)).toBe(true)
        expect(canCallPlanningModel({ ...state, execution: { ...state.execution, planningModelCalls: 5 } })).toBe(false)
        expect(canRevisePrompt({ ...state, execution: { ...state.execution, promptRevisionCount: 1 } })).toBe(false)
        expect(canGenerateImage({ ...state, execution: { ...state.execution, generationCount: 1 } })).toBe(false)
    })
})
