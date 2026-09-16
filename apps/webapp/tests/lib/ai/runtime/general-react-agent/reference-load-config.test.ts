import { describe, expect, it } from 'vitest'

import { createReferenceLoadConfig } from './reference-load-config'

describe('reference load configuration', () => {
    it('requires auditable target metadata for a production-like performance gate', () => {
        expect(() => createReferenceLoadConfig({ AI_MIND_REFERENCE_LOAD_GATE: 'production-like' })).toThrow(
            'AI_MIND_REFERENCE_LOAD_TOPOLOGY'
        )
        expect(() =>
            createReferenceLoadConfig({
                AI_MIND_REFERENCE_LOAD_GATE: 'production-like',
                AI_MIND_REFERENCE_LOAD_TOPOLOGY: 'aws-ap-southeast-1',
            })
        ).toThrow('AI_MIND_REFERENCE_LOAD_DATABASE_INSTANCE')
    })

    it('records complete non-secret target metadata and keeps ordinary runs diagnostic', () => {
        expect(
            createReferenceLoadConfig({
                AI_MIND_REFERENCE_LOAD_DATABASE_INSTANCE: 'ai-mind-postgres-primary',
                AI_MIND_REFERENCE_LOAD_GATE: 'production-like',
                AI_MIND_REFERENCE_LOAD_TOPOLOGY: 'aws-ap-southeast-1',
            })
        ).toEqual({
            databaseInstance: 'ai-mind-postgres-primary',
            performanceGate: 'production-like',
            topology: 'aws-ap-southeast-1',
        })
        expect(createReferenceLoadConfig({})).toEqual({
            databaseInstance: 'unspecified',
            performanceGate: 'diagnostic',
            topology: 'unspecified',
        })
    })
})
