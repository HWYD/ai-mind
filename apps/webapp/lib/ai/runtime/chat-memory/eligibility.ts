import type { ChatRequest } from '@/lib/ai/types/chat'

import type { FinalTurnSource } from './final-turn-adapter'

function getCommandName(request: ChatRequest) {
    const commandName = request.composer?.command?.name

    return typeof commandName === 'string' ? commandName : undefined
}

export function isChatMemoryContextEligibleRequest(request: ChatRequest): boolean {
    const commandName = getCommandName(request)

    return commandName !== 'tasklist' && commandName !== 'delivery-chain'
}

export function isChatMemoryWriteEligibleRequest(request: ChatRequest, source: FinalTurnSource = 'chat'): boolean {
    const commandName = getCommandName(request)

    switch (source) {
        case 'tasklist-agent':
            return commandName === 'tasklist'
        case 'delivery-chain':
            return commandName === 'delivery-chain'
        default:
            return commandName !== 'tasklist' && commandName !== 'delivery-chain'
    }
}

export const isChatMemoryEligibleRequest = isChatMemoryContextEligibleRequest
