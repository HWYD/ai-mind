import type { ComposerCommand } from '../composer-types'

export interface ComposerCommandOption extends ComposerCommand {
    description: string
}

export const composerCommandOptions: ComposerCommandOption[] = [
    {
        name: 'delivery-chain',
        label: '生成交付计划',
        description: '基于需求生成方案、任务拆解和评审报告',
    },
    {
        name: 'tasklist',
        label: '生成任务清单',
        description: '基于当前目标生成版本 tasklist 草稿',
    },
    {
        name: 'summary',
        label: '总结文档',
        description: '基于引用的文档或上下文生成结构化摘要',
    },
    {
        name: 'check',
        label: '检查文档一致性',
        description: '检查方案、tasklist、版本口径是否存在明显不一致',
    },
]

export function getFilteredComposerCommands(query: string) {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
        return composerCommandOptions
    }

    return composerCommandOptions.filter(command => {
        const searchableText = `${command.name} ${command.label} ${command.description}`.toLowerCase()

        return searchableText.includes(normalizedQuery)
    })
}
