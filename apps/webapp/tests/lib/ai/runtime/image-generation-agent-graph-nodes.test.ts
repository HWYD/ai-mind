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
    it('requests a Simplified Chinese public ImageBrief while preserving literal visible text', async () => {
        const model = createModel([
            {
                aspectRatio: 'square',
                assumptions: [],
                avoid: [],
                intent: '一只晒太阳的橘猫',
                mustInclude: [],
                subjects: ['橘猫'],
                visibleText: ['AI Mind'],
            },
        ])

        await createImageBriefNode({
            model,
            state: createInitialImageGenerationGraphState({
                rawDescription: '一只晒太阳的橘猫，画面中写 AI Mind',
                runId: 'run-chinese-brief',
            }),
        })

        expect(model.invoke).toHaveBeenCalledWith(
            expect.objectContaining({
                instruction: expect.stringContaining('Use Simplified Chinese'),
                schemaName: 'ImageBrief',
            }),
            expect.anything()
        )
    })

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

    it('passes the ImageBrief and current prompt to planning instead of reinterpreting an ambiguous user description', async () => {
        const rawDescription = '一只猫咪坐在餐厅里吃面条，手上拿着手机在玩耍，吃得很开心'
        const model = createModel([
            {
                aspectRatio: 'square',
                assumptions: [],
                avoid: ['human hands'],
                intent: 'A happy cat eating noodles while holding a phone with its paws',
                mustInclude: ['cat holding phone in paws'],
                subjects: ['cat', 'noodles', 'phone'],
            },
            { prompt: 'A happy cat uses its paws to hold a phone while eating noodles at a restaurant table.' },
            { issues: [], outcome: 'pass' },
        ])
        const brief = await createImageBriefNode({
            model,
            state: createInitialImageGenerationGraphState({ rawDescription, runId: 'run-cat-paws' }),
        })
        const drafted = await createPromptDraftNode({ model, state: brief })
        await inspectPromptNode({ model, state: drafted })

        expect(model.invoke).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                imageBrief: expect.objectContaining({ mustInclude: ['cat holding phone in paws'] }),
                rawDescription,
                schemaName: 'ImagePromptDraft',
            }),
            expect.anything()
        )
        expect(model.invoke).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                imageBrief: expect.objectContaining({ avoid: ['human hands'] }),
                prompt: 'A happy cat uses its paws to hold a phone while eating noodles at a restaurant table.',
                rawDescription,
                schemaName: 'PromptInspection',
            }),
            expect.anything()
        )
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

    it('uses the previous prompt and inspection instruction for the one permitted revision', async () => {
        const model = createModel([{ prompt: 'Corrected prompt' }])
        const initial = {
            ...createInitialImageGenerationGraphState({ rawDescription: 'a quiet lake', runId: 'run-1' }),
            brief: {
                internal: {
                    aspectRatio: 'square' as const,
                    assumptions: [],
                    avoid: [],
                    intent: 'lake',
                    mustInclude: [],
                    subjects: ['lake'],
                },
            },
            prompt: {
                inspection: {
                    issues: [{ code: 'missing_constraint' as const, severity: 'fixable' as const }],
                    outcome: 'revise' as const,
                    revisionInstruction: 'Add the requested warm lighting.',
                },
                value: 'A lake at sunrise',
            },
        }
        const revised = await revisePromptNode({ model, state: initial })
        const blocked = await revisePromptNode({ model, state: revised })

        expect(revised.execution.promptRevisionCount).toBe(1)
        expect(blocked.output).toEqual({ failureCode: 'IMAGE_PROMPT_BLOCKED', status: 'blocked' })
        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(model.invoke).toHaveBeenCalledWith(
            expect.objectContaining({
                imageBrief: expect.objectContaining({ intent: 'lake' }),
                prompt: 'A lake at sunrise',
                revisionInstruction: 'Add the requested warm lighting.',
                schemaName: 'ImagePromptDraft',
            }),
            expect.anything()
        )
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
            { issues: [{ code: 'missing_constraint', severity: 'fixable' }], outcome: 'revise', revisionInstruction: 'Clarify lighting' },
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

    it('continues after a blocking inspection when strict confirmation finds no literal conflict', async () => {
        const model = createModel([
            { aspectRatio: 'square', assumptions: [], avoid: [], intent: 'cat', mustInclude: [], subjects: ['cat'] },
            { prompt: 'A ginger cat sleeping on a sunny beach' },
            { issues: [{ code: 'conflict', severity: 'blocking' }], outcome: 'block' },
            { conflictingRequirements: ['蓝色', '红色'], outcome: 'block' },
        ])

        await expect(
            runImageGenerationGraph({ model, rawDescription: '一只橘猫在阳光明媚的沙滩上睡觉', runId: 'run-confirm-pass' })
        ).resolves.toMatchObject({
            execution: { planningModelCalls: 4 },
            output: { status: 'ready' },
        })
        expect(model.invoke).toHaveBeenLastCalledWith(expect.objectContaining({ schemaName: 'PromptBlockConfirmation' }), expect.anything())
    })

    it('keeps a block only when confirmation cites two literal conflicting requirements', async () => {
        const model = createModel([
            { aspectRatio: 'square', assumptions: [], avoid: [], intent: 'cat', mustInclude: [], subjects: ['cat'] },
            { prompt: 'A cat' },
            { issues: [{ code: 'conflict', severity: 'blocking' }], outcome: 'block' },
            { conflictingRequirements: ['纯黑色', '纯白色'], outcome: 'block' },
        ])

        const result = await runImageGenerationGraph({
            model,
            rawDescription: '仅生成一只纯黑色猫，并且这只猫必须纯白色。',
            runId: 'run-confirm-block',
        })

        expect(result.prompt.blockConfirmation).toEqual({ conflictingRequirements: ['纯黑色', '纯白色'], outcome: 'block' })
        expect(result).toMatchObject({
            execution: { planningModelCalls: 4 },
            output: { failureCode: 'IMAGE_PROMPT_BLOCKED', status: 'blocked' },
        })
    })
})
