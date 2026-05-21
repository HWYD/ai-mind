import { visit } from 'unist-util-visit'

import type { MarkdownNode, MarkdownRootNode } from './parse-tasklist-markdown'
import type { TasklistChecklistItem, TasklistHeading, TasklistStepSection, TasklistStructure } from './tasklist-structure-types'

const STEP_HEADING_PATTERN = /(?:^|\b)(?:step\s*\d+|第\s*\d+\s*步|实施步骤\s*\d*|阶段\s*\d+)/i
const VERIFICATION_PATTERN = /验证|测试|校验|检查|回归|smoke|e2e|lint|typecheck|build|test/i
const ENGINEERING_VERIFICATION_PATTERN = /工程验证|工程校验|lint|typecheck|build|test/i
const EXECUTION_DISCIPLINE_PATTERN = /执行纪律|实施纪律|执行规则|暂停|等待确认|review/i
const NON_GOALS_PATTERN = /non-goals|non goals|非目标|本版不做|明确不做/i
const RISKS_PATTERN = /risks?|风险|人工确认点|确认点/i
const TEST_PLAN_PATTERN = /test plan|测试计划|验证计划|最小验证/i
const PAUSE_POINT_PATTERN = /暂停|等待确认|手动验证|review/i

/**
 * 将 mdast 节点递归转成纯文本，用于标题、段落和 checklist 内容的规则匹配。
 */
function nodeToText(node: MarkdownNode): string {
    if (typeof node.value === 'string') {
        return node.value
    }

    const childrenText = (node.children ?? []).map(nodeToText).join('')

    // link 节点的文本只包含锚文本；把 URL 一起纳入纯文本，才能精确识别 [方案](docs://...) 形式的来源方案。
    if (node.type === 'link' && node.url) {
        return `${childrenText} ${node.url}`
    }

    return childrenText
}

/**
 * 收集真实 GFM checklist item；remark-gfm 只会给列表项节点打 checked 标记，代码块不会误入这里。
 */
function collectChecklistItems(node: MarkdownNode): TasklistChecklistItem[] {
    const checklistItems: TasklistChecklistItem[] = []

    visit(node, 'listItem', item => {
        const listItem = item as MarkdownNode

        if (typeof listItem.checked === 'boolean') {
            checklistItems.push({
                checked: listItem.checked,
                text: nodeToText(listItem).trim(),
            })
        }
    })

    return checklistItems.filter(item => item.text)
}

/**
 * 收集文档中的所有 heading，保留深度用于区分一级标题、章节标题和 Step 子标题。
 */
function collectHeadings(root: MarkdownRootNode): TasklistHeading[] {
    const headings: TasklistHeading[] = []

    visit(root, 'heading', node => {
        const heading = node as MarkdownNode
        const text = nodeToText(heading).trim()

        if (text) {
            headings.push({
                depth: heading.depth ?? 0,
                text,
            })
        }
    })

    return headings
}

/**
 * 创建单个 Step 的聚合容器，后续遍历会把该 Step 下的 checklist 和验证信号填进去。
 */
function createStepSection(title: string): TasklistStepSection {
    return {
        checklistItems: [],
        hasVerification: false,
        taskCount: 0,
        title,
    }
}

/**
 * 按 Step heading 聚合任务项；遇到同级或更高层级的非 Step heading 时结束当前 Step 范围。
 */
function collectStepSections(root: MarkdownRootNode): TasklistStepSection[] {
    const steps: TasklistStepSection[] = []
    let currentStep: TasklistStepSection | undefined
    let currentStepDepth = 0

    for (const child of root.children) {
        if (child.type === 'heading') {
            const headingText = nodeToText(child).trim()
            const headingDepth = child.depth ?? 0

            if (STEP_HEADING_PATTERN.test(headingText)) {
                currentStep = createStepSection(headingText)
                currentStepDepth = headingDepth
                steps.push(currentStep)
                continue
            }

            if (currentStep && headingDepth > 0 && headingDepth <= currentStepDepth) {
                currentStep = undefined
                currentStepDepth = 0
            }
        }

        if (!currentStep) {
            continue
        }

        const text = nodeToText(child).trim()

        if (VERIFICATION_PATTERN.test(text)) {
            currentStep.hasVerification = true
        }

        const checklistItems = collectChecklistItems(child)
        currentStep.checklistItems.push(...checklistItems)
        currentStep.taskCount += checklistItems.length
    }

    return steps
}

/**
 * 从 Markdown AST 提取 tasklist 结构特征，供规则层判断标题、Step、Checklist 和验证内容是否完整。
 */
export function extractTasklistStructure(root: MarkdownRootNode, options: { planUri: string }): TasklistStructure {
    const documentText = nodeToText(root)
    const headings = collectHeadings(root)
    const checklistItems = collectChecklistItems(root)

    return {
        checklistItems,
        hasAnyVerificationContent: VERIFICATION_PATTERN.test(documentText),
        hasEngineeringVerification: ENGINEERING_VERIFICATION_PATTERN.test(documentText),
        hasExecutionDisciplineSection: headings.some(heading => EXECUTION_DISCIPLINE_PATTERN.test(heading.text)),
        hasNonGoalsSection: headings.some(heading => NON_GOALS_PATTERN.test(heading.text)),
        hasPausePoint: PAUSE_POINT_PATTERN.test(documentText),
        hasRisksSection: headings.some(heading => RISKS_PATTERN.test(heading.text)),
        hasSourcePlanUri: documentText.includes(options.planUri),
        hasTestPlanSection: headings.some(heading => TEST_PLAN_PATTERN.test(heading.text)),
        headings,
        steps: collectStepSections(root),
        title: headings.find(heading => heading.depth === 1)?.text,
    }
}
