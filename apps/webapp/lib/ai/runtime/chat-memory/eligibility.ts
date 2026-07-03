import type { ChatRequest } from '@/lib/ai/types/chat'

export function isChatMemoryEligibleRequest(request: ChatRequest): boolean {
    const commandName = request.composer?.command?.name

    return commandName !== 'tasklist' && commandName !== 'delivery-chain'
}
