import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { POST } from '@/app/api/chat/route'

function createPostRequest(payload: unknown) {
    return new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
            'Content-Type': 'application/json',
        },
    })
}

describe('POST /api/chat', () => {
    it('非法请求体会返回 400 + INVALID_CHAT_REQUEST', async () => {
        const response = await POST(createPostRequest({}))
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('INVALID_CHAT_REQUEST')
    })

    it('非法 skill 会返回 400 + INVALID_SKILL', async () => {
        const payload = {
            conversationId: 'test-invalid-skill',
            messages: [
                {
                    role: 'user',
                    parts: [
                        {
                            type: 'text',
                            format: 'markdown',
                            text: '你好',
                        },
                    ],
                },
            ],
            options: {
                skill: 'non-existent-skill',
            },
        }

        const response = await POST(createPostRequest(payload))
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('INVALID_SKILL')
        expect(typeof body.error).toBe('string')
    })
})
