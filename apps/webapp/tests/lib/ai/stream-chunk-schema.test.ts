import { describe, expect, it } from 'vitest'

import { chatStreamChunkSchema } from '@/lib/ai/stream-chunk-schema'

describe('chatStreamChunkSchema artifact chunks', () => {
    it('接受合法 artifact chunk', () => {
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'artifact-start',
                artifactId: 'artifact-tasklist',
                artifactKind: 'tasklist',
                artifactType: 'text',
                format: 'markdown',
                metadata: {
                    generatedFrom: 'docs://versions/v0.1.1.md',
                    revision: 2,
                    targetVersion: 'v0.1.1',
                    validated: true,
                },
                sourceStepId: 'final-step',
                title: 'v0.1.1 Tasklist 草稿',
            }).success
        ).toBe(true)
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'artifact-delta',
                artifactId: 'artifact-tasklist',
                delta: '# Tasklist',
            }).success
        ).toBe(true)
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'artifact-end',
                artifactId: 'artifact-tasklist',
                metadata: {
                    charCount: 10,
                    sectionCount: 1,
                },
                status: 'completed',
            }).success
        ).toBe(true)
    })

    it('拒绝非法 artifactKind 和 status', () => {
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'artifact-start',
                artifactId: 'artifact-tasklist',
                artifactKind: 'tasklist_draft',
                artifactType: 'text',
                format: 'markdown',
                title: 'Tasklist',
            }).success
        ).toBe(false)
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'artifact-end',
                artifactId: 'artifact-tasklist',
                status: 'streaming',
            }).success
        ).toBe(false)
    })
})
