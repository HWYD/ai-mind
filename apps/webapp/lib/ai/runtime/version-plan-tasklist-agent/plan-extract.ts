import type { VersionPlanExtract } from './types'

const TARGET_VERSION_PATTERN = /\bv\d+\.\d+\.\d+\b/i

// P0 只做轻量 section extraction，不引入 Markdown AST；别名用于兼容中英文方案标题。
const sectionAliases = {
    goals: ['goals', '目标', '版本目标'],
    interfaceChanges: ['important interface changes', 'interface changes', '接口变化', '重要接口变化', '协议变化'],
    keyChanges: ['key changes', '关键改动', '关键实现变更', '核心改动', '主要改动'],
    nonGoals: ['non-goals', 'non goals', '非目标', '本版不做', '明确不做'],
    summary: ['summary', '摘要', '版本说明', '目标说明'],
    testPlan: ['test plan', '测试计划', '验证计划', '测试方案'],
} satisfies Record<Exclude<keyof VersionPlanExtract, 'targetVersion' | 'title'>, string[]>

interface MarkdownSection {
    heading: string
    lines: string[]
    normalizedHeading: string
}

/**
 * 统一标题文本的比较形态，用于把中英文标题别名和真实 Markdown 标题做宽松匹配。
 */
function normalizeHeading(value: string) {
    return value
        .replace(/[`*_#：:]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
}

/**
 * 清理段落或列表项里的 Markdown 行内语法，让 planExtract 保留更适合模型消费的纯文本。
 */
function cleanMarkdownInline(value: string) {
    return value
        .replace(/^\s*>+\s?/, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
        .trim()
}

/**
 * 从用户目标、资源 URI 或标题中提取 vX.Y.Z 版本号；识别不到时交给调用方兜底。
 */
function extractTargetVersionFromText(text?: string) {
    return TARGET_VERSION_PATTERN.exec(text ?? '')?.[0]
}

/**
 * 读取 Markdown 第一个一级标题，作为版本方案的主标题。
 */
function extractTitle(markdown: string) {
    return markdown
        .split(/\r?\n/)
        .map(line => /^#\s+(.+?)\s*$/.exec(line)?.[1]?.trim())
        .find(Boolean)
}

/**
 * 按二级标题切分版本方案正文，保留每个 section 的原始行和规范化标题。
 */
function extractSections(markdown: string) {
    const sections: MarkdownSection[] = []
    let currentSection: MarkdownSection | null = null

    for (const line of markdown.split(/\r?\n/)) {
        // 只把二级标题当作主 section，三级标题会留在父 section 内容里，避免 Key Changes 下的细分项被切碎。
        const headingMatch = /^##\s+(.+?)\s*$/.exec(line)

        if (headingMatch) {
            if (currentSection) {
                sections.push(currentSection)
            }

            const heading = headingMatch[1].trim()

            currentSection = {
                heading,
                lines: [],
                normalizedHeading: normalizeHeading(heading),
            }
            continue
        }

        currentSection?.lines.push(line)
    }

    if (currentSection) {
        sections.push(currentSection)
    }

    return sections
}

/**
 * 在已切分的 section 中按标题别名查找目标 section 内容行。
 */
function findSectionLines(sections: MarkdownSection[], aliases: string[]) {
    const normalizedAliases = aliases.map(normalizeHeading)
    const section = sections.find(item => normalizedAliases.some(alias => item.normalizedHeading.includes(alias)))

    return section?.lines ?? []
}

/**
 * 从 section 行中提取普通列表项或 GFM checklist 项，跳过代码块里的示例文本。
 */
function extractListItems(lines: string[]) {
    const items: string[] = []
    let inCodeBlock = false

    for (const line of lines) {
        // code block 里的 "- [ ]" 只是示例文本，不能被当成真实 task/list item。
        if (/^\s*```/.test(line)) {
            inCodeBlock = !inCodeBlock
            continue
        }

        if (inCodeBlock) {
            continue
        }

        const itemMatch = /^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s*)?(.+?)\s*$/.exec(line)

        if (itemMatch) {
            items.push(cleanMarkdownInline(itemMatch[1]))
        }
    }

    return items.filter(Boolean)
}

/**
 * 从 section 行中提取连续段落，用作没有列表结构时的降级内容来源。
 */
function extractParagraphs(lines: string[]) {
    const paragraphs: string[] = []
    let currentParagraph: string[] = []
    let inCodeBlock = false

    for (const line of lines) {
        if (/^\s*```/.test(line)) {
            inCodeBlock = !inCodeBlock
            continue
        }

        if (inCodeBlock) {
            continue
        }

        if (!line.trim()) {
            if (currentParagraph.length > 0) {
                paragraphs.push(cleanMarkdownInline(currentParagraph.join(' ')))
                currentParagraph = []
            }
            continue
        }

        currentParagraph.push(line.trim())
    }

    if (currentParagraph.length > 0) {
        paragraphs.push(cleanMarkdownInline(currentParagraph.join(' ')))
    }

    return paragraphs.filter(Boolean)
}

/**
 * 优先提取 section 内的列表项；没有列表时退回段落，兼容不同写法的方案文档。
 */
function extractSectionItems(sections: MarkdownSection[], aliases: string[]) {
    const lines = findSectionLines(sections, aliases)
    const listItems = extractListItems(lines)

    // 版本方案里有些 section 是段落叙述而不是列表，列表为空时退回提取段落，保证 planExtract 不过度依赖固定格式。
    return listItems.length > 0 ? listItems : extractParagraphs(lines)
}

/**
 * 提取方案摘要：优先使用显式 Summary section，否则取一级标题后的首段说明。
 */
function extractSummary(markdown: string, sections: MarkdownSection[]) {
    const explicitSummary = extractSectionItems(sections, sectionAliases.summary)[0]

    if (explicitSummary) {
        return explicitSummary
    }

    const linesBeforeFirstSection = markdown.split(/\r?\n/).slice(1)
    const firstSectionIndex = linesBeforeFirstSection.findIndex(line => /^##\s+/.test(line))
    const candidateLines = firstSectionIndex === -1 ? linesBeforeFirstSection : linesBeforeFirstSection.slice(0, firstSectionIndex)

    return extractParagraphs(candidateLines)[0]
}

/**
 * 将完整版本方案 Markdown 转成 Agent 可消费的轻量结构化摘要。
 */
export function extractVersionPlan(
    markdown: string,
    options: {
        planUri: string
        userGoal: string
    }
): VersionPlanExtract {
    const title = extractTitle(markdown)
    const sections = extractSections(markdown)
    // 用户显式输入优先级最高；否则从 URI 和标题兜底识别，识别不到也不阻断后续生成。
    const targetVersion =
        extractTargetVersionFromText(options.userGoal) ??
        extractTargetVersionFromText(options.planUri) ??
        extractTargetVersionFromText(title) ??
        'unknown'

    return {
        goals: extractSectionItems(sections, sectionAliases.goals),
        interfaceChanges: extractSectionItems(sections, sectionAliases.interfaceChanges),
        keyChanges: extractSectionItems(sections, sectionAliases.keyChanges),
        nonGoals: extractSectionItems(sections, sectionAliases.nonGoals),
        summary: extractSummary(markdown, sections),
        targetVersion,
        testPlan: extractSectionItems(sections, sectionAliases.testPlan),
        title,
    }
}
