import { getUserMemoryRuntimeConfig, type UserMemoryRuntimeConfig } from './runtime-config'
import type { SelectedUserMemory, UserMemoryDocument, UserMemoryType } from './state-schema'
import { clipUserMemoryText } from './validation'

const DIRECT_OVERLAP_ONLY_TYPES = new Set<UserMemoryType>(['project_context', 'risk_preference', 'stable_user_context'])
const ALLOWED_SINGLE_CHAR_TAGS = new Set(['吃', '穿', '用', '做'])
const LOW_SIGNAL_TAGS = new Set(['喜欢', '不喜欢', '偏好', '爱好', '习惯', '用户', '记住'])
const LOW_SIGNAL_CJK_PHRASES = new Set(['用户', '记住', '以后', '这个', '那个', '一下', '怎么', '什么', '喜欢', '不喜'])
const MIN_RELEVANCE_SCORE = 1.5
const PARTIAL_TEXT_OVERLAP_WEIGHTS: Partial<Record<UserMemoryType, number>> = {
    communication_preference: 1,
    recurring_constraint: 1,
    stable_user_context: 1.5,
    standing_instruction: 1,
    workflow_preference: 1,
}

function normalizeQueryText(text: string): string {
    return text
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function extractTokens(text: string): string[] {
    return normalizeQueryText(text).split(' ').filter(Boolean)
}

function extractAsciiTokens(text: string): string[] {
    return extractTokens(text).filter(token => /[a-z0-9]/i.test(token) && token.length >= 2)
}

function extractCjkPhrases(text: string): string[] {
    const normalizedText = normalizeQueryText(text)
    const segments = normalizedText.match(/[\u4e00-\u9fff]+/gu) ?? []
    const phrases = new Set<string>()

    for (const segment of segments) {
        const maxLength = Math.min(4, segment.length)

        for (let length = 2; length <= maxLength; length += 1) {
            for (let index = 0; index <= segment.length - length; index += 1) {
                const phrase = segment.slice(index, index + length)

                if (!LOW_SIGNAL_CJK_PHRASES.has(phrase)) {
                    phrases.add(phrase)
                }
            }
        }
    }

    return [...phrases]
}

function normalizeStructuredTags(tags: string[]): string[] {
    return [...new Set(tags.map(normalizeQueryText).filter(Boolean))].filter(tag => {
        if (LOW_SIGNAL_TAGS.has(tag)) {
            return false
        }

        if (tag.length === 1) {
            return ALLOWED_SINGLE_CHAR_TAGS.has(tag)
        }

        return true
    })
}

function scoreStructuredTagOverlap(tags: string[], queryText: string): number {
    return normalizeStructuredTags(tags).reduce((score, tag) => {
        if (!queryText.includes(tag)) {
            return score
        }

        return score + (tag.length === 1 ? 2 : 3)
    }, 0)
}

function scoreWholeTextOverlap(text: string, queryText: string): number {
    const normalizedText = normalizeQueryText(text)

    if (!normalizedText) {
        return 0
    }

    return queryText.includes(normalizedText) ? 2 : 0
}

function scorePartialTextOverlap(document: UserMemoryDocument, queryText: string): number {
    const weight = PARTIAL_TEXT_OVERLAP_WEIGHTS[document.type]

    if (!weight) {
        return 0
    }

    const queryPhrases = extractCjkPhrases(queryText)

    if (queryPhrases.length === 0) {
        return 0
    }

    const documentPhrases = new Set(extractCjkPhrases(document.text))
    let matches = 0

    for (const phrase of queryPhrases) {
        if (documentPhrases.has(phrase)) {
            matches += 1
        }
    }

    return Math.min(matches * weight, document.type === 'stable_user_context' ? 3 : 2)
}

function scoreIdentityOverlap(document: UserMemoryDocument, queryText: string): number {
    const normalizedIdentityValues = [document.identity.subject, document.identity.facet]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map(normalizeQueryText)
        .filter(Boolean)

    if (normalizedIdentityValues.length === 0) {
        return 0
    }

    let score = 0

    for (const value of normalizedIdentityValues) {
        if (queryText.includes(value)) {
            score += 2
        }
    }

    const queryPhrases = extractCjkPhrases(queryText)
    const identityPhrases = new Set(normalizedIdentityValues.flatMap(extractCjkPhrases))

    for (const phrase of queryPhrases) {
        if (identityPhrases.has(phrase)) {
            score += 1
        }
    }

    const queryTokens = extractAsciiTokens(queryText)
    const identityTokens = new Set(normalizedIdentityValues.flatMap(extractAsciiTokens))

    for (const token of queryTokens) {
        if (identityTokens.has(token)) {
            score += 1.5
        }
    }

    return Math.min(score, 4)
}

function scoreAsciiTokenOverlap(document: UserMemoryDocument, queryText: string): number {
    const queryTokens = extractAsciiTokens(queryText)

    if (queryTokens.length === 0) {
        return 0
    }

    const memoryTokens = new Set([
        ...extractAsciiTokens(document.text),
        ...normalizeStructuredTags(document.tags).flatMap(extractAsciiTokens),
    ])

    let score = 0

    for (const token of queryTokens) {
        if (memoryTokens.has(token)) {
            score += 1.5
        }
    }

    return score
}

function scoreRelevantUserMemory(document: UserMemoryDocument, latestUserText: string): number {
    const queryText = normalizeQueryText(latestUserText)

    if (!queryText) {
        return 0
    }

    const lexicalScore =
        scoreStructuredTagOverlap(document.tags, queryText) +
        scoreIdentityOverlap(document, queryText) +
        scoreWholeTextOverlap(document.text, queryText) +
        scorePartialTextOverlap(document, queryText) +
        scoreAsciiTokenOverlap(document, queryText)

    if (lexicalScore === 0 && DIRECT_OVERLAP_ONLY_TYPES.has(document.type)) {
        return 0
    }

    return lexicalScore
}

export function scoreUserMemory(document: UserMemoryDocument, latestUserText: string): number {
    return scoreRelevantUserMemory(document, latestUserText)
}

export function selectRelevantUserMemories(
    documents: UserMemoryDocument[],
    latestUserText: string,
    config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig()
): SelectedUserMemory[] {
    const sorted = documents
        .filter(document => document.status === 'active' && document.confidence >= config.minConfidence)
        .map(document => ({
            document,
            score: scoreRelevantUserMemory(document, latestUserText),
        }))
        .filter(item => item.score >= MIN_RELEVANCE_SCORE)
        .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score
            }

            return right.document.updatedAt.localeCompare(left.document.updatedAt)
        })

    const selected: SelectedUserMemory[] = []
    let totalChars = 0

    for (const item of sorted) {
        if (selected.length >= config.maxSelectedMemories || totalChars >= config.maxTotalChars) {
            break
        }

        const clippedText = clipUserMemoryText(item.document.text, config.maxMemoryChars)

        if (!clippedText) {
            continue
        }

        if (totalChars + clippedText.length > config.maxTotalChars) {
            continue
        }

        selected.push({
            stableKey: item.document.stableKey,
            type: item.document.type,
            text: clippedText,
            tags: item.document.tags,
            score: item.score,
        })
        totalChars += clippedText.length
    }

    return selected
}
