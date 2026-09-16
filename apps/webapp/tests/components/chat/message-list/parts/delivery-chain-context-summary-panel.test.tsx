/** @vitest-environment jsdom */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DeliveryChainContextSummaryPanel } from '@/components/chat/message-list/parts/delivery-agent/delivery-chain-context-summary-panel'
import type { ResourcePart } from '@/lib/ai/types/message'

function createResource(resourceName: string, uri: string): ResourcePart {
    return {
        id: uri,
        location: 'local',
        resourceName,
        serverId: 'project-docs-server',
        source: 'mcp',
        status: 'completed',
        type: 'resource',
        uri,
    }
}

describe('DeliveryChainContextSummaryPanel', () => {
    it('groups the delivery entry and context resources after the summary is expanded', () => {
        render(
            <DeliveryChainContextSummaryPanel
                entryResources={[
                    createResource('request-limit-banner/requirement.md', 'demo://scenarios/request-limit-banner/requirement.md'),
                ]}
                internalResources={[createResource('request-limit-banner/context.md', 'demo://scenarios/request-limit-banner/context.md')]}
            />
        )

        fireEvent.click(screen.getByText('已读取 demo 上下文 1 项'))

        const entrySection = screen.getByText('入口需求').closest('section')
        const contextSection = screen.getByText('场景上下文').closest('section')

        expect(entrySection).toBeTruthy()
        expect(contextSection).toBeTruthy()
        expect(within(entrySection as HTMLElement).getByText('request-limit-banner / requirement.md')).toBeTruthy()
        expect(within(contextSection as HTMLElement).getByText('context.md')).toBeTruthy()
    })
})
