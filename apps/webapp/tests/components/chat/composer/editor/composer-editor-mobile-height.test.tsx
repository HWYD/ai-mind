/** @vitest-environment jsdom */

import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ComposerEditor } from '@/components/chat/composer/editor/composer-editor'

describe('ComposerEditor mobile height', () => {
    it('keeps the mobile minimum height to a single line while preserving desktop classes', async () => {
        const { container } = render(
            <ComposerEditor value="" onChange={vi.fn()} onStop={vi.fn()} onSubmit={vi.fn()} status="ready" placeholder="测试占位" />
        )

        const editorRoot = container.querySelector('.ai-composer-editor')

        expect(editorRoot?.className).toContain('min-h-6')
        expect(editorRoot?.className).toContain('sm:min-h-12')

        await waitFor(() => {
            const editorContent = container.querySelector('.tiptap')

            expect(editorContent?.className).toContain('min-h-6')
            expect(editorContent?.className).toContain('sm:min-h-12')
        })
    })
})
