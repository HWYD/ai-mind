import { chunkMarkdownForArtifact, emitTextArtifactFromMarkdown, writeStaticReasoningPart, writeStaticTextPart } from '../../src'
import type { ChatStreamChunk } from '../../src/protocol'

function collectChunks() {
    const chunks: ChatStreamChunk[] = []

    return {
        chunks,
        writeChunk: (chunk: ChatStreamChunk) => {
            chunks.push(chunk)
        },
    }
}

describe('static parts', () => {
    it('writes a complete static text part', () => {
        const collector = collectChunks()

        writeStaticTextPart(collector.writeChunk, 'hello')

        expect(collector.chunks).toHaveLength(3)
        expect(collector.chunks[0]).toMatchObject({ type: 'text-start' })
        const partId = (collector.chunks[0] as { partId: string }).partId
        expect(collector.chunks[1]).toEqual({
            type: 'text-delta',
            partId,
            delta: 'hello',
        })
        expect(collector.chunks[2]).toEqual({
            type: 'text-end',
            partId,
        })
    })

    it('writes a complete static reasoning part', () => {
        const collector = collectChunks()

        writeStaticReasoningPart(collector.writeChunk, 'because')

        expect(collector.chunks).toHaveLength(3)
        expect(collector.chunks[0]).toMatchObject({ type: 'reasoning-start' })
        const partId = (collector.chunks[0] as { partId: string }).partId
        expect(collector.chunks[1]).toEqual({
            type: 'reasoning-delta',
            partId,
            delta: 'because',
        })
        expect(collector.chunks[2]).toEqual({
            type: 'reasoning-end',
            partId,
        })
    })

    it('skips empty static parts', () => {
        const collector = collectChunks()

        writeStaticTextPart(collector.writeChunk, '')
        writeStaticReasoningPart(collector.writeChunk, '')

        expect(collector.chunks).toHaveLength(0)
    })

    it('chunks markdown by headings, paragraphs, and fixed length fallback', () => {
        expect(chunkMarkdownForArtifact('# Title\n\n## A\nA body\n\n## B\nB body')).toEqual([
            '# Title\n\n',
            '## A\nA body\n\n',
            '## B\nB body',
        ])
        expect(chunkMarkdownForArtifact('# Title\n\n### A\nA body\n\n### B\nB body')).toEqual([
            '# Title\n\n',
            '### A\nA body\n\n',
            '### B\nB body',
        ])
        expect(chunkMarkdownForArtifact('alpha\n\nbeta\n\ngamma')).toEqual(['alpha\n\n', 'beta\n\n', 'gamma'])
        expect(chunkMarkdownForArtifact('x'.repeat(2600))).toHaveLength(2)
    })

    it('writes a complete text artifact from markdown', () => {
        const collector = collectChunks()
        const markdown = '# Tasklist\n\n## Step 1\nDo it\n\n## Step 2\nCheck it'
        const result = emitTextArtifactFromMarkdown(collector.writeChunk, {
            artifactId: 'artifact-tasklist-1',
            artifactKind: 'tasklist',
            markdown,
            metadata: {
                generatedFrom: 'docs://versions/v0.1.1.md',
                revision: 2,
                targetVersion: 'v0.1.1',
                validated: true,
            },
            sourceStepId: 'final-step',
            title: 'v0.1.1 Tasklist 草稿',
        })

        expect(result?.artifactId).toBe('artifact-tasklist-1')
        expect(collector.chunks[0]).toMatchObject({
            artifactId: 'artifact-tasklist-1',
            artifactKind: 'tasklist',
            artifactType: 'text',
            format: 'markdown',
            sourceStepId: 'final-step',
            title: 'v0.1.1 Tasklist 草稿',
            type: 'artifact-start',
        })
        expect(collector.chunks.some(chunk => chunk.type === 'artifact-delta' && chunk.delta.includes('## Step 1'))).toBe(true)
        expect(collector.chunks.at(-1)).toMatchObject({
            artifactId: 'artifact-tasklist-1',
            metadata: {
                charCount: markdown.length,
                sectionCount: 3,
                validated: true,
            },
            status: 'completed',
            type: 'artifact-end',
        })
    })
})
