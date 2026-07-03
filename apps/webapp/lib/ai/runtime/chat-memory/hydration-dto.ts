import { toMindMessages } from './message-adapter'
import {
    type AiMindThreadState,
    CHAT_MEMORY_PINNED_DECISION_LIMIT,
    CHAT_MEMORY_SUMMARY_PREVIEW_LIMIT,
    type ThreadHydrationDTO,
    threadHydrationDtoSchema,
} from './state-schema'

export const HYDRATION_FORBIDDEN_FIELDS = [
    'apiKey',
    'checkpoint',
    'cookie',
    'deliveryChain',
    'graphState',
    'providerConfig',
    'providerResponse',
    'rawCheckpoint',
    'rawPrompt',
    'runtimeArtifact',
    'sessionId',
    'stack',
    'subagentInvocation',
    'subagentResult',
    'tasklist',
]

export function buildThreadHydrationDTO(input: { restored: boolean; state: AiMindThreadState; threadId: string }): ThreadHydrationDTO {
    const summaryPreview = input.state.summary.trim().slice(0, CHAT_MEMORY_SUMMARY_PREVIEW_LIMIT)
    const dto = {
        threadId: input.threadId,
        messages: toMindMessages(input.state.messages),
        ...(summaryPreview ? { summaryPreview } : {}),
        pinnedDecisions: input.state.pinnedDecisions.slice(0, CHAT_MEMORY_PINNED_DECISION_LIMIT),
        restored: input.restored,
    }

    return threadHydrationDtoSchema.parse(dto)
}

export function assertNoForbiddenHydrationFields(value: unknown): void {
    if (!value || typeof value !== 'object') {
        return
    }

    const stack: unknown[] = [value]

    while (stack.length > 0) {
        const current = stack.pop()

        if (!current || typeof current !== 'object') {
            continue
        }

        if (Array.isArray(current)) {
            stack.push(...current)
            continue
        }

        for (const [key, nestedValue] of Object.entries(current)) {
            if (HYDRATION_FORBIDDEN_FIELDS.includes(key)) {
                throw new Error(`Hydration DTO contains forbidden field: ${key}`)
            }

            if (nestedValue && typeof nestedValue === 'object') {
                stack.push(nestedValue)
            }
        }
    }
}
