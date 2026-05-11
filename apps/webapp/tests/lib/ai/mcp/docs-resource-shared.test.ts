import { describe, expect, it } from 'vitest'

import { assertSafeDocsResourcePath, createDocsResourceUri } from '@/lib/ai/mcp/adapters/docs-resource-shared'

describe('mcp/docs-resource-shared', () => {
    it('normalizes allowed docs markdown resource paths', () => {
        expect(assertSafeDocsResourcePath('README.md')).toBe('README.md')
        expect(assertSafeDocsResourcePath('docs://architecture/runtime-boundary.md')).toBe('architecture/runtime-boundary.md')
        expect(createDocsResourceUri('architecture/stream-core.md')).toBe('docs://architecture/stream-core.md')
    })

    it('rejects paths outside the docs resource boundary', () => {
        const unsafePaths = [
            '',
            '/README.md',
            'C:/README.md',
            '..',
            '../README.md',
            'architecture/../README.md',
            'docs/README.md',
            'apps/webapp/README.md',
            'packages/stream-core/README.md',
            'architecture\\runtime-boundary.md',
            'package.json',
            'architecture/runtime-boundary.txt',
        ]

        for (const unsafePath of unsafePaths) {
            expect(() => assertSafeDocsResourcePath(unsafePath)).toThrow()
        }
    })
})
