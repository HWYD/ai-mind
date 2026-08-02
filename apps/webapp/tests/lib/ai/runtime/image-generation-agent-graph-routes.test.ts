import { describe, expect, it } from 'vitest'

import { routeAfterPromptInspection } from '@/lib/ai/runtime/image-generation-agent/graph/edges/route-after-prompt-inspection'
import { IMAGE_GENERATION_GRAPH_NODE_IDS } from '@/lib/ai/runtime/image-generation-agent/graph/graph-node-ids'
import { createInitialImageGenerationGraphState } from '@/lib/ai/runtime/image-generation-agent/graph/graph-state'

describe('routeAfterPromptInspection', () => {
    it('routes pass, the one permitted revision, and a blocking result deterministically', () => {
        const state = createInitialImageGenerationGraphState({ rawDescription: 'a quiet lake', runId: 'run-1' })

        expect(routeAfterPromptInspection({ ...state, prompt: { inspection: { issues: [], outcome: 'pass' } } })).toBe(
            IMAGE_GENERATION_GRAPH_NODE_IDS.finishReady
        )
        expect(routeAfterPromptInspection({ ...state, prompt: { inspection: { issues: [], outcome: 'revise' } } })).toBe(
            IMAGE_GENERATION_GRAPH_NODE_IDS.revisePrompt
        )
        expect(routeAfterPromptInspection({ ...state, prompt: { inspection: { issues: [], outcome: 'block' } } })).toBe(
            IMAGE_GENERATION_GRAPH_NODE_IDS.finishBlocked
        )
    })
})
