/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EmptyStateSuggestions } from '@/components/chat/message-list/suggestions/empty-state-suggestions'

describe('EmptyStateSuggestions', () => {
    it('keeps suggestion buttons constrained to the container width on mobile', () => {
        render(<EmptyStateSuggestions onSelectSuggestion={vi.fn()} />)

        const tasklistSuggestion = screen.getByText('Tasklist Agent Demo').closest('button')

        expect(tasklistSuggestion).toBeTruthy()
        expect(tasklistSuggestion?.className).toContain('w-full')
        expect(tasklistSuggestion?.className).toContain('min-w-0')
        expect(tasklistSuggestion?.className).toContain('whitespace-normal')
    })

    it('renders the full suggestion list without the rotate helper and exposes the mobile css hook', () => {
        const { container } = render(<EmptyStateSuggestions onSelectSuggestion={vi.fn()} />)
        const suggestionButtons = screen.getAllByRole('button')

        expect(screen.queryByText('换一个？')).toBeNull()
        expect(suggestionButtons).toHaveLength(6)
        expect(suggestionButtons.at(-1)).toBeTruthy()
        expect(container.querySelector('.empty-state-suggestions-grid')).toBeTruthy()
    })
})
