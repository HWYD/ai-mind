/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tiptap/react', async importOriginal => {
    const actual = await importOriginal<typeof import('@tiptap/react')>()

    return {
        ...actual,
        NodeViewWrapper: ({ children, ...props }: ComponentProps<'span'>) => <span {...props}>{children}</span>,
    }
})

import { InlineComposerChipNodeView } from '@/components/chat/composer/editor/composer-chip-node-view'

describe('InlineComposerChipNodeView', () => {
    it('renders the editor resource chip without duplicating the @ trigger', () => {
        const nodeViewProps = {
            deleteNode: vi.fn(),
            node: {
                attrs: {
                    label: '广州三天旅行计划',
                    uri: 'demo://scenarios/guangzhou-3-day-trip/requirement.md',
                },
                type: { name: 'resourceChip' },
            },
        } as unknown as ComponentProps<typeof InlineComposerChipNodeView>

        render(<InlineComposerChipNodeView {...nodeViewProps} />)

        expect(screen.getByText('广州三天旅行计划')).toBeTruthy()
        expect(screen.queryByText('@广州三天旅行计划')).toBeNull()
    })
})
