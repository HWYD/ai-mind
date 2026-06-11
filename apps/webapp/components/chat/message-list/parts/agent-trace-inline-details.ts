import type { AgentGraphNodeEntry, AgentStepEntry, PromptPart, ResourcePart, SkillPart, ToolPart } from '@/lib/ai/types/message'

import { getAgentTraceStatusValueLabel, getDetailStatusLabel } from './agent-trace-formatters'

export type AgentDetailPart = PromptPart | ResourcePart | SkillPart | ToolPart

export interface StepInlineDetail {
    icon: 'resource' | 'tool'
    label: string
    value: string
}

function tryParseJson(value?: string) {
    if (!value) {
        return null
    }

    try {
        return JSON.parse(value) as unknown
    } catch {
        return null
    }
}

function getValidationToolSummary(part: ToolPart, validateIndex: number) {
    const output = tryParseJson(part.output)

    if (!output || typeof output !== 'object' || Array.isArray(output)) {
        return {
            label: `工具调用 v${validateIndex}`,
            value: `validate_tasklist_structure：${getDetailStatusLabel(part.status)}`,
        }
    }

    const status = 'status' in output && typeof output.status === 'string' ? output.status : getDetailStatusLabel(part.status)
    const statusLabel = getAgentTraceStatusValueLabel(status)
    const score = 'score' in output && typeof output.score === 'number' ? `，评分 ${output.score}` : ''

    return {
        label: `工具调用 v${validateIndex}`,
        value: `validate_tasklist_structure：${statusLabel}${score}`,
    }
}

export function buildStepInlineDetails(steps: AgentStepEntry[], detailParts: AgentDetailPart[]) {
    const detailsByStepIndex = new Map<number, StepInlineDetail[]>()
    const resourceDetails = detailParts.filter((detailPart): detailPart is ResourcePart => detailPart.type === 'resource')
    const validationToolDetails = detailParts.filter(
        (detailPart): detailPart is ToolPart => detailPart.type === 'tool' && detailPart.toolName === 'validate_tasklist_structure'
    )
    let resourceIndex = 0
    let validationToolIndex = 0

    // 受控 Agent 路径按固定顺序执行：读资源 -> 生成 -> 校验 -> 修正 -> 再校验。
    // 展示层按这个顺序把底层 Resource/Tool 事实贴回对应 step，避免在消息流里重复铺开调试卡片。
    for (const step of steps) {
        const details: StepInlineDetail[] = []

        if (step.actionType === 'read_resource') {
            const resource = resourceDetails[resourceIndex]

            if (resource) {
                resourceIndex += 1
                details.push({
                    icon: 'resource',
                    label: '资源读取',
                    value: `${resource.uri}：${getDetailStatusLabel(resource.status)}`,
                })
            }
        }

        if (step.actionType === 'call_tool') {
            const tool = validationToolDetails[validationToolIndex]

            if (tool) {
                validationToolIndex += 1
                details.push({
                    icon: 'tool',
                    ...getValidationToolSummary(tool, validationToolIndex),
                })
            }
        }

        if (details.length > 0) {
            detailsByStepIndex.set(step.stepIndex, details)
        }
    }

    return detailsByStepIndex
}

export function buildGraphNodeInlineDetails(nodes: AgentGraphNodeEntry[], detailParts: AgentDetailPart[]) {
    const detailsByNodeId = new Map<string, StepInlineDetail[]>()
    const resourceDetails = detailParts.filter((detailPart): detailPart is ResourcePart => detailPart.type === 'resource')
    const validationToolDetails = detailParts.filter(
        (detailPart): detailPart is ToolPart => detailPart.type === 'tool' && detailPart.toolName === 'validate_tasklist_structure'
    )
    let resourceIndex = 0
    let validationToolIndex = 0

    for (const node of nodes) {
        const details: StepInlineDetail[] = []

        switch (node.nodeId) {
            case 'readVersionPlan':
            case 'readOptionalContext': {
                const resource = resourceDetails[resourceIndex]

                if (resource) {
                    resourceIndex += 1
                    details.push({
                        icon: 'resource',
                        label: '资源读取',
                        value: `${resource.uri}：${getDetailStatusLabel(resource.status)}`,
                    })
                }

                break
            }
            case 'validateTasklistV1':
            case 'validateTasklistV2': {
                const tool = validationToolDetails[validationToolIndex]

                if (tool) {
                    validationToolIndex += 1
                    details.push({
                        icon: 'tool',
                        ...getValidationToolSummary(tool, validationToolIndex),
                    })
                }

                break
            }
        }

        if (details.length > 0) {
            detailsByNodeId.set(node.nodeId, details)
        }
    }

    return detailsByNodeId
}
