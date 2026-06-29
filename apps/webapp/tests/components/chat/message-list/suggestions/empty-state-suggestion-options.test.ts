import { describe, expect, it } from 'vitest'

import { emptyStateSuggestions } from '@/components/chat/message-list/suggestions/empty-state-suggestion-options'

describe('emptyStateSuggestions', () => {
    it('includes the Tasklist Agent demo quick access entry with the v034 demo version', () => {
        const tasklistDemo = emptyStateSuggestions.find(suggestion => suggestion.label === 'Tasklist Agent Demo')

        expect(tasklistDemo).toBeTruthy()
        expect(tasklistDemo?.composer?.command?.name).toBe('tasklist')
        expect(tasklistDemo?.composer?.references).toEqual([
            expect.objectContaining({
                label: 'v034-langsmith-observability.md',
                uri: 'demo://version-plans/v034-langsmith-observability.md',
            }),
        ])
        expect(JSON.stringify(tasklistDemo)).not.toContain('v035')
        expect(JSON.stringify(tasklistDemo)).not.toContain('v036')
    })
})
