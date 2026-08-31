/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MessageDisclosureProvider } from '@/components/chat/message-list/message-disclosure-provider'
import { useMessageDisclosureState } from '@/components/chat/message-list/message-disclosure-state'

function DisclosureProbe({ disclosureKey }: { disclosureKey: string }) {
    const [open, setOpen] = useMessageDisclosureState(disclosureKey, false)

    return (
        <button onClick={() => setOpen(current => !current)} type="button">
            {open ? 'open' : 'closed'}
        </button>
    )
}

describe('MessageDisclosureProvider', () => {
    it('reports only disclosure keys that differ from their default state and removes them when restored', async () => {
        const onDeviationKeysChange = vi.fn()
        const disclosureKey = 'conversation-a:message-a:reasoning:part-a'

        render(
            <MessageDisclosureProvider
                onDeviationKeysChange={onDeviationKeysChange}
                scopeKey="conversation-a"
                validKeys={new Set([disclosureKey])}
            >
                <DisclosureProbe disclosureKey={disclosureKey} />
            </MessageDisclosureProvider>
        )

        await waitFor(() => expect(onDeviationKeysChange).toHaveBeenLastCalledWith(new Set()))
        fireEvent.click(screen.getByRole('button', { name: 'closed' }))
        await waitFor(() => expect(onDeviationKeysChange).toHaveBeenLastCalledWith(new Set([disclosureKey])))
        fireEvent.click(screen.getByRole('button', { name: 'open' }))
        await waitFor(() => expect(onDeviationKeysChange).toHaveBeenLastCalledWith(new Set()))
    })
})
