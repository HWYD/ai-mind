import { createId } from '@/lib/ai/create-id'

import type { RuntimeArtifact, RuntimeArtifactKind, SubagentToolId, SubagentToolJsonResult } from './types'

interface CreateRuntimeArtifactOptions {
    kind: RuntimeArtifactKind
    markdown: string
    metadata?: Record<string, unknown>
    source: {
        stage?: string
        subagentId?: SubagentToolId
    }
    title: string
}

export function createRuntimeArtifact(options: CreateRuntimeArtifactOptions): RuntimeArtifact {
    return {
        id: createId(),
        kind: options.kind,
        markdown: options.markdown.trim(),
        metadata: options.metadata,
        source: {
            stage: options.source.stage,
            subagentId: options.source.subagentId,
        },
        title: options.title.trim(),
    }
}

export function findRuntimeArtifact(artifacts: RuntimeArtifact[], kind: RuntimeArtifactKind) {
    return artifacts.find(artifact => artifact.kind === kind)
}

export function hasRuntimeArtifact(artifacts: RuntimeArtifact[], kind: RuntimeArtifactKind) {
    return artifacts.some(artifact => artifact.kind === kind)
}

export function createSubagentResultArtifacts(
    subagentId: SubagentToolId,
    result: SubagentToolJsonResult,
    defaultTitle: string
): RuntimeArtifact[] {
    if (result.status === 'failed') {
        return []
    }

    if (subagentId === 'plan-subagent' && result.status === 'completed') {
        return [
            createRuntimeArtifact({
                kind: 'plan',
                markdown: result.markdown,
                metadata: result.metadata,
                source: {
                    stage: 'plan',
                    subagentId,
                },
                title: result.artifactTitle ?? defaultTitle,
            }),
        ]
    }

    if (subagentId === 'task-subagent' && result.status === 'completed') {
        return [
            createRuntimeArtifact({
                kind: 'tasks',
                markdown: result.markdown,
                metadata: result.metadata,
                source: {
                    stage: 'task',
                    subagentId,
                },
                title: result.artifactTitle ?? defaultTitle,
            }),
        ]
    }

    if (subagentId === 'review-subagent' && (result.status === 'completed' || result.status === 'blocked')) {
        return [
            createRuntimeArtifact({
                kind: 'review',
                markdown: result.markdown,
                metadata: result.status === 'blocked' ? { ...result.metadata, blocked: true } : result.metadata,
                source: {
                    stage: 'review',
                    subagentId,
                },
                title: result.artifactTitle ?? defaultTitle,
            }),
        ]
    }

    // v0.4.1: risk-subagent 和 boundary-subagent 也产出 kind: 'review'，通过 metadata.reviewType 区分。
    if (
        (subagentId === 'risk-subagent' || subagentId === 'boundary-subagent') &&
        (result.status === 'completed' || result.status === 'blocked')
    ) {
        return [
            createRuntimeArtifact({
                kind: 'review',
                markdown: result.markdown,
                metadata: result.status === 'blocked' ? { ...result.metadata, blocked: true } : result.metadata,
                source: {
                    stage: 'review',
                    subagentId,
                },
                title: result.artifactTitle ?? defaultTitle,
            }),
        ]
    }

    return []
}
