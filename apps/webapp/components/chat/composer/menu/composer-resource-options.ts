import type { ComposerReference } from '../composer-types'

export interface ComposerResourceOption extends ComposerReference {
    description: string
}

export const composerResourceOptions: ComposerResourceOption[] = [
    {
        id: 'docs:README.md',
        type: 'resource',
        label: 'docs/README.md',
        uri: 'docs://README.md',
        source: 'local',
        description: '项目公开文档入口与能力概览',
    },
    {
        id: 'docs:architecture/runtime-boundary.md',
        type: 'resource',
        label: 'docs/architecture/runtime-boundary.md',
        uri: 'docs://architecture/runtime-boundary.md',
        source: 'local',
        description: 'Runtime 主链路与分层边界说明',
    },
    {
        id: 'docs:architecture/stream-core.md',
        type: 'resource',
        label: 'docs/architecture/stream-core.md',
        uri: 'docs://architecture/stream-core.md',
        source: 'local',
        description: '结构化流式协议与 typed parts 说明',
    },
    {
        id: 'docs:architecture/capability-skill-surface.md',
        type: 'resource',
        label: 'docs/architecture/capability-skill-surface.md',
        uri: 'docs://architecture/capability-skill-surface.md',
        source: 'local',
        description: 'Capability、Skill 与 Composer 表面的关系',
    },
    {
        id: 'remote:project-assistant-service:latest-context',
        type: 'resource',
        label: 'latest-context',
        uri: 'project://latest-context',
        source: 'remote',
        serverId: 'project-assistant-service',
        description: 'Project Assistant Service 提供的项目聚合上下文',
    },
]

export function getFilteredComposerResources(query: string) {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
        return composerResourceOptions
    }

    return composerResourceOptions.filter(resource => {
        const searchableText =
            `${resource.label} ${resource.uri} ${resource.source} ${resource.serverId ?? ''} ${resource.description}`.toLowerCase()

        return searchableText.includes(normalizedQuery)
    })
}
