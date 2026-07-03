import { describe, expect, it } from 'vitest'

import { isChatMemoryEligibleRequest } from '@/lib/ai/runtime/chat-memory'
import type { ChatRequest } from '@/lib/ai/types/chat'

function request(command?: 'delivery-chain' | 'summary' | 'tasklist'): ChatRequest {
    return {
        composer: command
            ? {
                  command: {
                      label: command,
                      name: command,
                  },
                  plainText: 'text',
              }
            : undefined,
        conversationId: 'conversation',
        messages: [
            {
                role: 'user',
                parts: [{ type: 'text', format: 'markdown', text: '你好' }],
            },
        ],
    }
}

describe('runtime/chat-memory eligibility', () => {
    it('允许普通 text chat 和 docs summary style turns', () => {
        expect(isChatMemoryEligibleRequest(request())).toBe(true)
        expect(isChatMemoryEligibleRequest(request('summary'))).toBe(true)
    })

    it('排除 /tasklist 和 /delivery-chain structured command turns', () => {
        expect(isChatMemoryEligibleRequest(request('tasklist'))).toBe(false)
        expect(isChatMemoryEligibleRequest(request('delivery-chain'))).toBe(false)
    })
})
