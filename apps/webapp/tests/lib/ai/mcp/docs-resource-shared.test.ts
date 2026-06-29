import { describe, expect, it } from 'vitest'

import { assertSafeDocsResourcePath, createDocsResourceUri } from '@/lib/ai/mcp/adapters/docs-resource-shared'

describe('mcp/docs-resource-shared', () => {
    it('normalizes allowed demo resource paths', () => {
        expect(assertSafeDocsResourcePath('README.md')).toBe('README.md')
        expect(assertSafeDocsResourcePath('demo://governance/delivery-boundaries.md')).toBe('governance/delivery-boundaries.md')
        expect(assertSafeDocsResourcePath('demo://version-plans/v034-langsmith-observability.md')).toBe(
            'version-plans/v034-langsmith-observability.md'
        )
        expect(assertSafeDocsResourcePath('demo-manifest.json')).toBe('demo-manifest.json')
        expect(createDocsResourceUri('governance/engineering-rules.md')).toBe('demo://governance/engineering-rules.md')
    })

    it('rejects paths outside the demo resource boundary', () => {
        const unsafePaths = [
            '',
            '/README.md',
            'C:/README.md',
            '..',
            '../README.md',
            'version-plans/../README.md',
            'docs/README.md',
            'apps/webapp/README.md',
            'packages/stream-core/README.md',
            'private-folder/plans/demo.md',
            'governance\\delivery-boundaries.md',
            'package.json',
            'governance/delivery-boundaries.txt',
            'demo://versions/v034-langsmith-observability.md',
            '@demo://versions/v034-langsmith-observability.md',
            'docs://versions/v0.3.4-tasklist-agent-langsmith-observability.md',
            '@docs://versions/v0.3.4-tasklist-agent-langsmith-observability.md',
            '@specs://035-agent-demo-workspace-resource-boundary/spec.md',
            'file://README.md',
        ]

        for (const unsafePath of unsafePaths) {
            expect(() => assertSafeDocsResourcePath(unsafePath)).toThrow()
        }
    })
})
