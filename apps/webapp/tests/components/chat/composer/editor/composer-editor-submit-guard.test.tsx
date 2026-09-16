/** @vitest-environment jsdom */

import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ComposerEditor } from '@/components/chat/composer/editor/composer-editor'

describe('ComposerEditor submit guard', () => {
    it.each(['submitted', 'streaming'] as const)('does not submit on Enter while status is %s', async status => {
        const onSubmit = vi.fn()
        const { container } = render(<ComposerEditor value="下一条问题" onChange={vi.fn()} onSubmit={onSubmit} status={status} />)

        await waitFor(() => {
            expect(container.querySelector('.ProseMirror')).not.toBeNull()
        })

        fireEvent.keyDown(container.querySelector('.ProseMirror')!, { key: 'Enter' })

        expect(onSubmit).not.toHaveBeenCalled()
    })
})
