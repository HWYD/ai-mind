const DELIVERY_CHAIN_REPORT_TITLE = '# Delivery Chain Report / 交付计划报告'

const DELIVERY_CHAIN_SECTION_TITLES = [
    '输入来源',
    '需求摘要',
    '默认假设',
    '实现方案',
    '任务拆解',
    '交付评审',
    '风险',
    '非目标',
    '下一步建议',
] as const

const DELIVERY_CHAIN_SECTION_IDS: Record<string, string> = {
    下一步建议: 'next-steps',
    交付评审: 'review',
    输入来源: 'input-source',
    实现方案: 'implementation-plan',
    默认假设: 'assumptions',
    非目标: 'non-goals',
    任务拆解: 'task-breakdown',
    需求摘要: 'requirement-summary',
    风险: 'risks',
}

export interface DeliveryChainReportSection {
    id: string
    markdown: string
    title: string
}

export interface ParsedDeliveryChainReport {
    leadMarkdown: string
    sections: DeliveryChainReportSection[]
}

export function canRenderDeliveryChainReport(markdown: string) {
    return markdown.trimStart().startsWith(DELIVERY_CHAIN_REPORT_TITLE)
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findSectionHeading(markdown: string, title: string, fromIndex: number) {
    const pattern = new RegExp(`^##\\s+${escapeRegExp(title)}\\s*$`, 'gm')

    pattern.lastIndex = fromIndex

    return pattern.exec(markdown)
}

function stripLeadingDuplicateHeading(markdown: string, title: string) {
    const pattern = new RegExp(`^##\\s+${escapeRegExp(title)}\\s*(?:\\r?\\n)+`)

    return markdown.replace(pattern, '').trim()
}

export function parseDeliveryChainReport(markdown: string): ParsedDeliveryChainReport | null {
    const normalizedMarkdown = markdown.trim()

    if (!normalizedMarkdown.startsWith(DELIVERY_CHAIN_REPORT_TITLE)) {
        return null
    }

    const matches: Array<{ headingLength: number; index: number; title: string }> = []
    let searchStart = DELIVERY_CHAIN_REPORT_TITLE.length

    for (const title of DELIVERY_CHAIN_SECTION_TITLES) {
        const match = findSectionHeading(normalizedMarkdown, title, searchStart)

        if (!match) {
            continue
        }

        matches.push({
            headingLength: match[0].length,
            index: match.index,
            title,
        })
        searchStart = match.index + match[0].length
    }

    if (matches.length === 0) {
        return null
    }

    const firstSectionIndex = matches[0].index

    if (firstSectionIndex <= DELIVERY_CHAIN_REPORT_TITLE.length) {
        return null
    }

    const leadMarkdown = normalizedMarkdown.slice(DELIVERY_CHAIN_REPORT_TITLE.length, firstSectionIndex).trim()
    const sections: DeliveryChainReportSection[] = []
    const seenSectionIds = new Map<string, number>()

    for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index]
        const contentStart = match.index + match.headingLength
        const contentEnd = index + 1 < matches.length ? matches[index + 1].index : normalizedMarkdown.length
        const baseId = DELIVERY_CHAIN_SECTION_IDS[match.title]
        const duplicateCount = (seenSectionIds.get(baseId) ?? 0) + 1

        seenSectionIds.set(baseId, duplicateCount)

        sections.push({
            id: duplicateCount === 1 ? baseId : `${baseId}-${duplicateCount}`,
            markdown: stripLeadingDuplicateHeading(normalizedMarkdown.slice(contentStart, contentEnd).trim(), match.title),
            title: match.title,
        })
    }

    if (sections.length < 3) {
        return null
    }

    return {
        leadMarkdown,
        sections,
    }
}
