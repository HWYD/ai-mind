import { extractUserMemoryCandidates } from './candidate-extractor'
import {
    type UserMemoryCandidate,
    type UserMemoryExtractionJob,
    type UserMemoryExtractionResult,
    type UserMemoryPath,
    type UserMemorySafeShortTermContext,
} from './state-schema'
import { type UserMemoryService, userMemoryService } from './user-memory-service'
import { clipUserMemoryText } from './validation'

const EXTRACTION_SAFE_SUMMARY_LIMIT = 600
const EXTRACTION_SAFE_PINNED_DECISION_LIMIT = 5

function sanitizeShortTermContext(context: UserMemorySafeShortTermContext | undefined): UserMemorySafeShortTermContext | undefined {
    if (!context) {
        return undefined
    }

    const summary = typeof context.summary === 'string' ? clipUserMemoryText(context.summary, EXTRACTION_SAFE_SUMMARY_LIMIT) : undefined
    const pinnedDecisions = Array.isArray(context.pinnedDecisions)
        ? context.pinnedDecisions.slice(0, EXTRACTION_SAFE_PINNED_DECISION_LIMIT).map(decision => clipUserMemoryText(decision))
        : undefined

    if (!summary && (!pinnedDecisions || pinnedDecisions.length === 0)) {
        return undefined
    }

    return {
        ...(pinnedDecisions && pinnedDecisions.length > 0 ? { pinnedDecisions } : {}),
        ...(summary ? { summary } : {}),
    }
}

function isEligibleUserMemoryPath(path: UserMemoryPath): boolean {
    return path === 'ordinary_chat' || path === 'tool_assisted_ordinary_chat'
}

export interface ProcessCompletedTurnForMemoryInput {
    assistantFinalText: string
    latestUserText: string
    path: UserMemoryPath
    safeShortTermContext?: UserMemorySafeShortTermContext
    sessionId: string
    sourceConversationId: string
}

interface CreateUserMemoryExtractionPipelineOptions {
    extractor?: (input: UserMemoryExtractionJob) => Promise<UserMemoryCandidate[]>
    service?: Pick<UserMemoryService, 'putCandidate'>
}

export function buildUserMemoryExtractionJobInput(input: ProcessCompletedTurnForMemoryInput): UserMemoryExtractionJob {
    return {
        assistantFinalText: input.assistantFinalText.trim(),
        latestUserText: input.latestUserText.trim(),
        path: input.path,
        safeShortTermContext: sanitizeShortTermContext(input.safeShortTermContext),
        sessionId: input.sessionId.trim(),
        sourceConversationId: input.sourceConversationId.trim(),
    }
}

export function createUserMemoryExtractionPipeline(options: CreateUserMemoryExtractionPipelineOptions = {}) {
    const extractor = options.extractor ?? extractUserMemoryCandidates
    const service = options.service ?? userMemoryService

    return async function processCompletedTurnForMemory(input: ProcessCompletedTurnForMemoryInput): Promise<UserMemoryExtractionResult> {
        if (!input.sessionId?.trim()) {
            return {
                reason: 'missing-session',
                status: 'skipped',
            }
        }

        if (!input.sourceConversationId?.trim()) {
            return {
                reason: 'missing-source-conversation',
                status: 'skipped',
            }
        }

        if (!isEligibleUserMemoryPath(input.path)) {
            return {
                reason: 'ineligible-path',
                status: 'skipped',
            }
        }

        if (!input.latestUserText.trim() || !input.assistantFinalText.trim()) {
            return {
                reason: 'empty-turn',
                status: 'skipped',
            }
        }

        const jobInput = buildUserMemoryExtractionJobInput(input)

        let candidates: UserMemoryCandidate[]

        try {
            candidates = await extractor(jobInput)
        } catch {
            return {
                reason: 'extractor-unavailable',
                status: 'failed',
            }
        }

        let written = 0
        let updated = 0
        let suppressed = 0
        let rejected = 0

        try {
            for (const candidate of candidates) {
                const result = await service.putCandidate({
                    candidate,
                    sessionId: input.sessionId,
                })

                switch (result.status) {
                    case 'written':
                        written += 1
                        break
                    case 'updated':
                        updated += 1
                        break
                    case 'suppressed':
                        suppressed += 1
                        break
                    case 'rejected':
                        rejected += 1
                        break
                    case 'skipped':
                        return {
                            reason: 'store-unavailable',
                            status: 'failed',
                        }
                }
            }
        } catch {
            return {
                reason: 'unsafe-error',
                status: 'failed',
            }
        }

        return {
            candidates: candidates.length,
            rejected,
            status: 'processed',
            suppressed,
            updated,
            written,
        }
    }
}

export const processCompletedTurnForMemory = createUserMemoryExtractionPipeline()
