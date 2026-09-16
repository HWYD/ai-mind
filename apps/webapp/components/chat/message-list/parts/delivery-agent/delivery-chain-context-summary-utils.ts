import type { ResourcePart } from '@/lib/ai/types/message'

export type DeliveryChainResourceGroupKey = 'context' | 'entry' | 'governance' | 'other' | 'rubric'

const DELIVERY_CHAIN_CONTEXT_RESOURCE_PATTERN = /^demo:\/\/scenarios\/([^/\\]+)\/context\.md$/i
const DELIVERY_CHAIN_REQUIREMENT_RESOURCE_PATTERN = /^demo:\/\/scenarios\/([^/\\]+)\/requirement\.md$/i
const DELIVERY_CHAIN_GOVERNANCE_RESOURCE_PATTERN = /^demo:\/\/governance\/([^/\\]+\.md)$/i
const DELIVERY_CHAIN_RUBRIC_RESOURCE_PATTERN = /^demo:\/\/rubrics\/([^/\\]+\.md)$/i

export function normalizeDeliveryChainResourceUri(uri: string) {
    return uri.trim().replace(/^@/, '')
}

export function getDeliveryChainResourceGroupKey(uri: string, entryUris: Set<string>): DeliveryChainResourceGroupKey {
    if (entryUris.has(uri) || DELIVERY_CHAIN_REQUIREMENT_RESOURCE_PATTERN.test(uri)) {
        return 'entry'
    }

    if (DELIVERY_CHAIN_CONTEXT_RESOURCE_PATTERN.test(uri)) {
        return 'context'
    }

    if (DELIVERY_CHAIN_RUBRIC_RESOURCE_PATTERN.test(uri)) {
        return 'rubric'
    }

    if (DELIVERY_CHAIN_GOVERNANCE_RESOURCE_PATTERN.test(uri)) {
        return 'governance'
    }

    return 'other'
}

export function buildDeliveryChainSummaryLabel(parts: ResourcePart[]) {
    if (parts.length === 0) {
        return null
    }

    if (parts.some(part => part.status === 'loading')) {
        return `正在读取 demo 上下文 ${parts.length} 项`
    }

    const failedCount = parts.filter(part => part.status === 'failed').length

    if (failedCount > 0) {
        return `已读取 demo 上下文 ${parts.length} 项（${failedCount} 项失败）`
    }

    return `已读取 demo 上下文 ${parts.length} 项`
}

export function getDeliveryChainResourceListLabel(part: ResourcePart, entryUris: Set<string>) {
    const normalizedUri = normalizeDeliveryChainResourceUri(part.uri)
    const requirementMatch = normalizedUri.match(DELIVERY_CHAIN_REQUIREMENT_RESOURCE_PATTERN)

    if (entryUris.has(normalizedUri) || requirementMatch) {
        return `${requirementMatch?.[1] ?? part.resourceName.replace(/\/requirement\.md$/i, '')} / requirement.md`
    }

    if (DELIVERY_CHAIN_CONTEXT_RESOURCE_PATTERN.test(normalizedUri)) {
        return 'context.md'
    }

    const rubricMatch = normalizedUri.match(DELIVERY_CHAIN_RUBRIC_RESOURCE_PATTERN)

    if (rubricMatch) {
        return rubricMatch[1] ?? part.resourceName
    }

    const governanceMatch = normalizedUri.match(DELIVERY_CHAIN_GOVERNANCE_RESOURCE_PATTERN)

    if (governanceMatch) {
        return governanceMatch[1] ?? part.resourceName
    }

    return part.resourceName
}
