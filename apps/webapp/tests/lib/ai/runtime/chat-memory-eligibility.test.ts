import { describe, expect, it } from 'vitest'

import { isChatMemoryContextEligibleRequest, isChatMemoryWriteEligibleRequest } from '@/lib/ai/runtime/chat-memory'
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
    it('context eligibility 允许普通 text chat 和 docs summary style turns', () => {
        expect(isChatMemoryContextEligibleRequest(request())).toBe(true)
        expect(isChatMemoryContextEligibleRequest(request('summary'))).toBe(true)
    })

    it('context eligibility 继续排除 /tasklist 和 /delivery-chain structured command turns', () => {
        expect(isChatMemoryContextEligibleRequest(request('tasklist'))).toBe(false)
        expect(isChatMemoryContextEligibleRequest(request('delivery-chain'))).toBe(false)
    })

    it('write eligibility allows structured final-turn writes without changing context eligibility', () => {
        expect(isChatMemoryWriteEligibleRequest(request(), 'chat')).toBe(true)
        expect(isChatMemoryWriteEligibleRequest(request('summary'), 'mcp-resource')).toBe(true)
        expect(isChatMemoryWriteEligibleRequest(request('tasklist'), 'tasklist-agent')).toBe(true)
        expect(isChatMemoryWriteEligibleRequest(request('delivery-chain'), 'delivery-chain')).toBe(true)
        expect(isChatMemoryWriteEligibleRequest(request('tasklist'), 'tool')).toBe(false)
        expect(isChatMemoryWriteEligibleRequest(request('delivery-chain'), 'chat')).toBe(false)
    })
})
