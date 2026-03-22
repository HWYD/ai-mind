'use client'

import { Streamdown } from 'streamdown'

import type { TextPart } from '../../lib/ai/types/message'

export function TextPartView({ part }: { part: TextPart }) {
    return (
        <div
            style={{
                lineHeight: 1.8,
                color: 'inherit',
                fontSize: '16px',
            }}
        >
            <Streamdown>{part.text}</Streamdown>
        </div>
    )
}
