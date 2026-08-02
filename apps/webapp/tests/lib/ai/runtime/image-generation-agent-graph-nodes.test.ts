import { describe, expect, it, vi } from 'vitest'

import { createInitialImageGenerationGraphState } from '@/lib/ai/runtime/image-generation-agent/graph/graph-state'
import { createImageBriefNode } from '@/lib/ai/runtime/image-generation-agent/graph/nodes/image-brief-node'
import type { ImagePlanningModel } from '@/lib/ai/runtime/image-generation-agent/graph/nodes/planning-model'
import {
    createPromptDraftNode,
    inspectPromptNode,
    revisePromptNode,
} from '@/lib/ai/runtime/image-generation-agent/graph/nodes/prompt-nodes'
import { runImageGenerationGraph } from '@/lib/ai/runtime/image-generation-agent/graph/run-image-generation-graph'

function createModel(outputs: unknown[]): ImagePlanningModel & { invoke: ReturnType<typeof vi.fn> } {
    return {
        invoke: vi.fn(async () => outputs.shift()),
    }
}

describe('image generation graph nodes', () => {
    it('uses exactly one structured call per node and keeps the internal prompt out of the public brief', async () => {
        const model = createModel([
            { aspectRatio: 'landscape', assumptions: [], avoid: [], intent: 'lake', mustInclude: [], subjects: ['lake'] },
            { prompt: 'A quiet lake at sunrise' },
            { issues: [], outcome: 'pass' },
        ])
        const initial = createInitialImageGenerationGraphState({ rawDescription: 'a quiet lake', runId: 'run-1' })
        const brief = await createImageBriefNode({ model, state: initial })
        const drafted = await createPromptDraftNode({ model, state: brief })
        const inspected = await inspectPromptNode({ model, state: drafted })

        expect(inspected.execution.planningModelCalls).toBe(3)
        expect(inspected.brief.publicSummary).not.toHaveProperty('prompt')
        expect(inspected.prompt.inspection).toMatchObject({ outcome: 'pass' })
    })

    it('counts a schema-invalid planning response then fails without a hidden repair call', async () => {
        const model = createModel([{ unsupported: true }])
        const state = await createImageBriefNode({
            model,
            state: createInitialImageGenerationGraphState({ rawDescription: 'a quiet lake', runId: 'run-1' }),
        })

        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(state.execution.planningModelCalls).toBe(1)
        expect(state.output).toEqual({ failureCode: 'IMAGE_PROMPT_PLANNING_FAILED', status: 'failed' })
    })

    it('fails safely when inspection or revision structured output is invalid', async () => {
        const invalidInspection = createModel([
            { aspectRatio: 'square', assumptions: [], avoid: [], intent: 'cat', mustInclude: [], subjects: ['cat'] },
            { prompt: 'A black cat' },
            { issues: [{ code: 'unknown', severity: 'fixable' }], outcome: 'pass' },
        ])
        const invalidRevision = createModel([
            { aspectRatio: 'square', assumptions: [], avoid: [], intent: 'cat', mustInclude: [], subjects: ['cat'] },
            { prompt: 'A black cat' },
            { issues: [{ code: 'missing_constraint', severity: 'fixable' }], outcome: 'revise', revisionInstruction: 'Add lighting' },
            { unsupported: true },
        ])

        await expect(
            runImageGenerationGraph({ model: invalidInspection, rawDescription: 'cat', runId: 'run-inspection' })
        ).resolves.toMatchObject({
            execution: { planningModelCalls: 3 },
            output: { failureCode: 'IMAGE_PROMPT_PLANNING_FAILED', status: 'failed' },
        })
        await expect(
            runImageGenerationGraph({ model: invalidRevision, rawDescription: 'cat', runId: 'run-revision' })
        ).resolves.toMatchObject({
            execution: { planningModelCalls: 4 },
            output: { failureCode: 'IMAGE_PROMPT_PLANNING_FAILED', status: 'failed' },
        })
        expect(invalidInspection.invoke).toHaveBeenCalledTimes(3)
        expect(invalidRevision.invoke).toHaveBeenCalledTimes(4)
    })

    it('allows one revision only', async () => {
        const model = createModel([{ prompt: 'Corrected prompt' }])
        const initial = createInitialImageGenerationGraphState({ rawDescription: 'a quiet lake', runId: 'run-1' })
        const revised = await revisePromptNode({ model, state: initial })
        const blocked = await revisePromptNode({ model, state: revised })

        expect(revised.execution.promptRevisionCount).toBe(1)
        expect(blocked.output).toEqual({ failureCode: 'IMAGE_PROMPT_BLOCKED', status: 'blocked' })
        expect(model.invoke).toHaveBeenCalledTimes(1)
    })

    it('runs the direct and one-revision paths within their fixed planning budgets', async () => {
        const direct = createModel([
            { aspectRatio: 'square', assumptions: [], avoid: [], intent: 'cat', mustInclude: [], subjects: ['cat'] },
            { prompt: 'A black cat' },
            { issues: [], outcome: 'pass' },
        ])
        const revised = createModel([
            { aspectRatio: 'square', assumptions: [], avoid: [], intent: 'cat', mustInclude: [], subjects: ['cat'] },
            { prompt: 'A black cat' },
            { issues: [], outcome: 'revise', revisionInstruction: 'Clarify lighting' },
            { prompt: 'A black cat in soft daylight' },
            { issues: [], outcome: 'pass' },
        ])

        await expect(runImageGenerationGraph({ model: direct, rawDescription: 'cat', runId: 'run-direct' })).resolves.toMatchObject({
            execution: { planningModelCalls: 3, promptRevisionCount: 0 },
            output: { status: 'ready' },
        })
        await expect(runImageGenerationGraph({ model: revised, rawDescription: 'cat', runId: 'run-revised' })).resolves.toMatchObject({
            execution: { planningModelCalls: 5, promptRevisionCount: 1 },
            output: { status: 'ready' },
        })
    })
})
