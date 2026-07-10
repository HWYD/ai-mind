import { createAgentRunOwnerSessionHash } from '@/lib/ai/agent-runs/ownership'

import {
    getUserMemoryRuntimeConfig,
    USER_MEMORY_MAX_TEXT_CHARS,
    USER_MEMORY_SCHEMA_VERSION,
    USER_MEMORY_SEMANTIC_INDEX_VERSION,
    type UserMemoryRuntimeConfig,
} from './runtime-config'
import {
    normalizeUserMemoryDocument,
    USER_MEMORY_NAMESPACE_PREFIX,
    USER_MEMORY_TAG_LIMIT,
    type UserMemoryCandidate,
    userMemoryCandidateSchema,
    type UserMemoryDocument,
    type UserMemoryIdentity,
    type UserMemoryRejectionReason,
    type UserMemorySemanticMetadata,
    type UserMemoryType,
} from './state-schema'

const USER_MEMORY_IRRELEVANT_PATTERNS = [/^(这个|那个|它|以上|如下)$/u, /^记住这个[。.!?？]?$/u]
const USER_MEMORY_RUNTIME_PATTERNS = [
    /GraphState/i,
    /RuntimeArtifact/i,
    /workflow progress/i,
    /provider response/i,
    /raw provider response/i,
    /provider config/i,
    /raw prompt/i,
    /raw tool result/i,
    /raw resource content/i,
    /MCP raw envelope/i,
    /cookie/i,
    /API key/i,
    /sk-[A-Za-z0-9_-]{10,}/,
    /stack trace/i,
    /at .+:\d+:\d+/,
]
const USER_MEMORY_TRANSCRIPT_PATTERNS = [/\[\s*user\s*\]/i, /\[\s*assistant\s*\]/i, /^user:/im, /^assistant:/im]
const USER_MEMORY_SENSITIVE_PATTERNS = [/身份证/u, /社保/u, /护照/u, /\bssn\b/i, /social security/i, /住址/u, /银行卡/u, /信用卡/u]

export interface ValidatedUserMemoryCandidate extends UserMemoryCandidate {
    identity: UserMemoryIdentity
    stableKey: string
    tags: string[]
    text: string
}

export type UserMemoryCandidateValidationResult =
    | { status: 'accepted'; candidate: ValidatedUserMemoryCandidate }
    | { status: 'rejected'; reason: UserMemoryRejectionReason }

function normalizeWhitespace(text: string): string {
    return text.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function normalizeSearchText(text: string): string {
    return normalizeWhitespace(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function normalizeStableKeySegment(value: string): string {
    return normalizeSearchText(value)
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 96)
}

function normalizeIdentityValue(value: string): string {
    return normalizeWhitespace(value).slice(0, 80)
}

function normalizeUserMemoryIdentity(type: UserMemoryType, identity: UserMemoryIdentity): UserMemoryIdentity {
    const subject = normalizeIdentityValue(identity.subject)
    const facet = typeof identity.facet === 'string' ? normalizeIdentityValue(identity.facet) : undefined
    const polarity = type === 'user_preference' ? identity.polarity : undefined

    return {
        ...(facet ? { facet } : {}),
        ...(polarity ? { polarity } : {}),
        subject,
    }
}

function buildStableKeySegments(type: UserMemoryType, identity: UserMemoryIdentity): string[] {
    const normalizedIdentity = normalizeUserMemoryIdentity(type, identity)

    return [normalizedIdentity.polarity, normalizedIdentity.subject, normalizedIdentity.facet]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map(normalizeStableKeySegment)
        .filter(Boolean)
}

function isUnsafeIdentity(identity: UserMemoryIdentity): boolean {
    return [identity.subject, identity.facet]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .some(
            value =>
                containsPattern(value, USER_MEMORY_SENSITIVE_PATTERNS) ||
                containsPattern(value, USER_MEMORY_RUNTIME_PATTERNS) ||
                containsPattern(value, USER_MEMORY_TRANSCRIPT_PATTERNS)
        )
}

function containsPattern(text: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(text))
}

function deriveFallbackTags(text: string): string[] {
    return normalizeSearchText(text).split(' ').filter(Boolean).slice(0, USER_MEMORY_TAG_LIMIT)
}

function classifyCandidateSchemaFailure(candidate: UserMemoryCandidate): UserMemoryRejectionReason {
    const parsedCandidate = userMemoryCandidateSchema.safeParse(candidate)

    if (parsedCandidate.success) {
        return 'unsafe'
    }

    for (const issue of parsedCandidate.error.issues) {
        if (issue.code === 'unrecognized_keys') {
            return 'unsafe'
        }

        if (issue.path[0] === 'type') {
            return 'unsupported_type'
        }

        if (issue.path[0] === 'text') {
            return typeof candidate.text === 'string' && candidate.text.trim().length === 0 ? 'empty' : 'too_long'
        }
    }

    return 'unsafe'
}

export function normalizeUserMemoryTag(tag: string): string {
    return normalizeSearchText(tag)
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
}

export function normalizeUserMemoryTags(tags: string[], fallbackText?: string): string[] {
    const normalized = [...tags, ...(tags.length === 0 && fallbackText ? deriveFallbackTags(fallbackText) : [])]
        .map(normalizeUserMemoryTag)
        .filter(Boolean)

    return [...new Set(normalized)].slice(0, USER_MEMORY_TAG_LIMIT)
}

export function clipUserMemoryText(text: string, maxChars = USER_MEMORY_MAX_TEXT_CHARS): string {
    const normalized = normalizeWhitespace(text)

    return normalized.length <= maxChars ? normalized : normalized.slice(0, maxChars).trim()
}

export function sanitizeUserMemoryReason(reason: string | undefined, maxChars = 200): string | undefined {
    if (typeof reason !== 'string') {
        return undefined
    }

    const normalized = clipUserMemoryText(reason, maxChars)

    if (!normalized) {
        return undefined
    }

    if (
        containsPattern(normalized, USER_MEMORY_SENSITIVE_PATTERNS) ||
        containsPattern(normalized, USER_MEMORY_RUNTIME_PATTERNS) ||
        containsPattern(normalized, USER_MEMORY_TRANSCRIPT_PATTERNS)
    ) {
        return undefined
    }

    return normalized
}

export function buildUserMemorySemanticMetadata(
    config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig(),
    nowIso: string
): UserMemorySemanticMetadata {
    return {
        ...(typeof config.semanticEmbeddingDimensions === 'number' ? { embeddingDimensions: config.semanticEmbeddingDimensions } : {}),
        embeddingModelId: config.semanticEmbeddingModelId,
        embeddingProviderKind: config.semanticEmbeddingProviderKind,
        semanticIndexFields: [...config.semanticIndexFields],
        semanticIndexedAt: nowIso,
        semanticIndexVersion: USER_MEMORY_SEMANTIC_INDEX_VERSION,
    }
}

export function buildUserMemoryNamespace(sessionId: string, env: Record<string, string | undefined> = process.env): string[] {
    const normalizedSessionId = sessionId.trim()

    if (!normalizedSessionId) {
        throw new Error('A non-empty sessionId is required for UserMemory namespace.')
    }

    return [...USER_MEMORY_NAMESPACE_PREFIX, createAgentRunOwnerSessionHash(normalizedSessionId, env)]
}

export function buildUserMemoryStableKey(type: UserMemoryType, identity: UserMemoryIdentity): string {
    const body = buildStableKeySegments(type, identity).join('-')

    return `${type}:${body || 'general'}`
}

export function normalizeUserMemoryStableKey(stableKey: string): string {
    const [type = '', ...rest] = stableKey.split(':')
    const normalizedType = normalizeWhitespace(type)
        .toLowerCase()
        .replace(/[^\w]+/g, '_')
        .replace(/^_+|_+$/g, '')
    const normalizedBody = normalizeStableKeySegment(rest.join(':'))

    return `${normalizedType}:${normalizedBody || 'general'}`
}

export function validateUserMemoryCandidate(
    candidate: UserMemoryCandidate,
    config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig()
): UserMemoryCandidateValidationResult {
    if (!candidate.sourceConversationId?.trim()) {
        return {
            reason: 'unsafe',
            status: 'rejected',
        }
    }

    const parsedCandidate = userMemoryCandidateSchema.safeParse(candidate)

    if (!parsedCandidate.success) {
        return {
            reason: classifyCandidateSchemaFailure(candidate),
            status: 'rejected',
        }
    }

    const text = normalizeWhitespace(parsedCandidate.data.text)

    if (!text) {
        return {
            reason: 'empty',
            status: 'rejected',
        }
    }

    if (text.length > config.maxMemoryChars) {
        return {
            reason: 'too_long',
            status: 'rejected',
        }
    }

    // 稳定性由结构化抽取阶段显式给出；这里消费该字段，不再用窄语义 regex 猜测。
    if (parsedCandidate.data.stability === 'temporary') {
        return {
            reason: 'temporary',
            status: 'rejected',
        }
    }

    if (parsedCandidate.data.stability === 'speculative') {
        return {
            reason: 'speculative',
            status: 'rejected',
        }
    }

    if (parsedCandidate.data.confidence < config.minConfidence) {
        return {
            reason: 'low_confidence',
            status: 'rejected',
        }
    }

    if (containsPattern(text, USER_MEMORY_SENSITIVE_PATTERNS)) {
        return {
            reason: 'sensitive_personal_information',
            status: 'rejected',
        }
    }

    if (containsPattern(text, USER_MEMORY_RUNTIME_PATTERNS)) {
        return {
            reason: 'raw_runtime_state',
            status: 'rejected',
        }
    }

    if (containsPattern(text, USER_MEMORY_TRANSCRIPT_PATTERNS)) {
        return {
            reason: 'full_transcript',
            status: 'rejected',
        }
    }

    if (USER_MEMORY_IRRELEVANT_PATTERNS.some(pattern => pattern.test(text))) {
        return {
            reason: 'irrelevant',
            status: 'rejected',
        }
    }

    const identity = normalizeUserMemoryIdentity(parsedCandidate.data.type, parsedCandidate.data.identity)

    if (!identity.subject || isUnsafeIdentity(identity)) {
        return {
            reason: 'unsafe',
            status: 'rejected',
        }
    }

    if (parsedCandidate.data.type === 'user_preference' && identity.polarity !== 'prefer' && identity.polarity !== 'avoid') {
        return {
            reason: 'unsafe',
            status: 'rejected',
        }
    }

    const tags = normalizeUserMemoryTags(parsedCandidate.data.tags, text)
    const stableKey = normalizeUserMemoryStableKey(buildUserMemoryStableKey(parsedCandidate.data.type, identity))

    return {
        candidate: {
            ...parsedCandidate.data,
            identity,
            stableKey,
            tags,
            text,
        },
        status: 'accepted',
    }
}

export function createUserMemoryDocument(
    candidate: ValidatedUserMemoryCandidate,
    nowIso: string,
    existing?: UserMemoryDocument | null,
    semanticMetadata?: UserMemorySemanticMetadata
): UserMemoryDocument {
    const sanitizedReason = sanitizeUserMemoryReason(candidate.reason)
    const status = candidate.action === 'suppress' || candidate.conflictSignal ? 'suppressed' : 'active'
    const suppressedAt = status === 'suppressed' ? nowIso : existing?.suppressedAt
    const suppressedByConversationId = status === 'suppressed' ? candidate.sourceConversationId : existing?.suppressedByConversationId
    const persistedReason = typeof candidate.reason === 'string' ? sanitizedReason : existing?.reason
    const semantic = status === 'active' ? (semanticMetadata ?? existing?.semantic) : existing?.semantic

    return {
        schemaVersion: USER_MEMORY_SCHEMA_VERSION,
        stableKey: candidate.stableKey,
        type: candidate.type,
        text: clipUserMemoryText(candidate.text),
        identity: candidate.identity,
        tags: candidate.tags,
        confidence: candidate.confidence,
        status,
        source: candidate.source,
        sourceSignal: candidate.sourceSignal,
        sourceConversationId: candidate.sourceConversationId,
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
        ...(existing?.lastUsedAt ? { lastUsedAt: existing.lastUsedAt } : {}),
        ...(semantic ? { semantic } : {}),
        ...(suppressedAt ? { suppressedAt } : {}),
        ...(suppressedByConversationId ? { suppressedByConversationId } : {}),
        ...(persistedReason ? { reason: persistedReason } : {}),
    }
}

export function isUserMemorySemanticEligible(
    document: UserMemoryDocument,
    config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig()
): boolean {
    return (
        document.status === 'active' &&
        document.confidence >= config.minConfidence &&
        document.semantic?.embeddingModelId === config.semanticEmbeddingModelId &&
        document.semantic?.embeddingProviderKind === config.semanticEmbeddingProviderKind &&
        document.semantic?.semanticIndexVersion === config.semanticIndexVersion
    )
}

export function readUserMemoryDocumentValue(value: unknown): UserMemoryDocument | null {
    if (value && typeof value === 'object' && 'value' in value) {
        return normalizeUserMemoryDocument((value as { value: unknown }).value)
    }

    return normalizeUserMemoryDocument(value)
}
