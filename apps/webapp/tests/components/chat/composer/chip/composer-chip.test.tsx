/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ComposerChipRow } from '@/components/chat/composer/chip/composer-chip'

describe('ComposerChipRow', () => {
    it('renders a resource label without exposing the input syntax prefix', () => {
        render(
            <ComposerChipRow
                references={[
                    {
                        id: 'demo:scenario:guangzhou-3-day-trip/requirement.md',
                        label: '广州三天旅行计划',
                        source: 'local',
                        type: 'resource',
                        uri: 'demo://scenarios/guangzhou-3-day-trip/requirement.md',
                    },
                ]}
            />
        )

        expect(screen.getByText('广州三天旅行计划')).toBeTruthy()
        expect(screen.queryByText('@广州三天旅行计划')).toBeNull()
    })
})
