import { describe, expect, it } from 'vitest'

import {
    imageBriefSchema,
    promptInspectionSchema,
    publicImageBriefSummarySchema,
} from '@/lib/ai/runtime/image-generation-agent/contract/image-generation-contracts'

const validBrief = {
    aspectRatio: 'landscape',
    assumptions: [],
    avoid: [],
    intent: 'A quiet lake at sunrise',
    mustInclude: ['lake'],
    subjects: ['lake'],
}

describe('image generation agent contracts', () => {
    it('keeps the internal ImageBrief and public summary strictly bounded', () => {
        expect(imageBriefSchema.safeParse(validBrief).success).toBe(true)
        expect(publicImageBriefSummarySchema.safeParse({ ...validBrief, aspectRatio: undefined }).success).toBe(true)
        expect(imageBriefSchema.safeParse({ ...validBrief, subjects: [] }).success).toBe(false)
        expect(imageBriefSchema.safeParse({ ...validBrief, extra: 'not public' }).success).toBe(false)
        expect(imageBriefSchema.safeParse({ ...validBrief, intent: 'x'.repeat(161) }).success).toBe(false)
    })

    it('accepts only the approved prompt inspection classifications', () => {
        expect(
            promptInspectionSchema.safeParse({
                issues: [{ code: 'missing_constraint', severity: 'fixable' }],
                outcome: 'revise',
                revisionInstruction: 'Add the requested lighting.',
            }).success
        ).toBe(true)
        expect(
            promptInspectionSchema.safeParse({
                issues: [{ code: 'capability_boundary', severity: 'blocking' }],
                outcome: 'block',
            }).success
        ).toBe(true)
        expect(promptInspectionSchema.safeParse({ issues: [{ code: 'unknown', severity: 'fixable' }], outcome: 'pass' }).success).toBe(
            false
        )
        expect(promptInspectionSchema.safeParse({ issues: [], outcome: 'retry' }).success).toBe(false)
    })
})
