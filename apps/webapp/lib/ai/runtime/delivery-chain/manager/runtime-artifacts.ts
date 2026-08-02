import { createId } from '@/lib/ai/create-id'

import type { PlanArtifactDraft, TaskArtifactDraft } from './agent-contracts'
import type { RuntimeArtifact, RuntimeArtifactKind, SubagentToolId } from './types'
import type { RuntimePlanArtifact, RuntimeTaskArtifact } from './types'

interface CreateRuntimeArtifactOptions {
    artifactId?: string
    kind: RuntimeArtifactKind
    markdown: string
    source: {
        stage?: string
        subagentId?: SubagentToolId
    }
    revision?: 1 | 2
    title: string
}

export function createRuntimeArtifact(options: CreateRuntimeArtifactOptions): RuntimeArtifact {
    const artifactId = options.artifactId ?? createId()

    return {
        artifactId,
        id: artifactId,
        kind: options.kind,
        markdown: options.markdown.trim(),
        source: {
            stage: options.source.stage,
            subagentId: options.source.subagentId,
        },
        revision: options.revision ?? 1,
        title: options.title.trim(),
    }
}

export function createRuntimePlanArtifact(draft: PlanArtifactDraft): RuntimePlanArtifact {
    return {
        ...createRuntimeArtifact({
            kind: 'plan',
            markdown: draft.markdown,
            source: { stage: 'plan', subagentId: 'plan-subagent' },
            title: 'Delivery Chain Plan',
        }),
        ...draft,
    }
}

export function reviseRuntimePlanArtifact(existing: RuntimePlanArtifact, draft: PlanArtifactDraft): RuntimePlanArtifact {
    return {
        ...existing,
        ...draft,
        revision: 2,
    }
}

export function createRuntimeTaskArtifact(draft: TaskArtifactDraft, plan: RuntimePlanArtifact): RuntimeTaskArtifact {
    return {
        ...createRuntimeArtifact({
            kind: 'tasks',
            markdown: draft.markdown,
            source: { stage: 'task', subagentId: 'task-subagent' },
            title: 'Delivery Chain Tasks',
        }),
        ...draft,
        planRef: { artifactId: plan.artifactId, revision: plan.revision },
    }
}

export function reviseRuntimeTaskArtifact(
    existing: RuntimeTaskArtifact,
    draft: TaskArtifactDraft,
    plan: RuntimePlanArtifact
): RuntimeTaskArtifact {
    return {
        ...existing,
        ...draft,
        planRef: { artifactId: plan.artifactId, revision: plan.revision },
        revision: 2,
    }
}

export function findRuntimeArtifact(artifacts: RuntimeArtifact[], kind: RuntimeArtifactKind) {
    return artifacts.find(artifact => artifact.kind === kind)
}

export function hasRuntimeArtifact(artifacts: RuntimeArtifact[], kind: RuntimeArtifactKind) {
    return artifacts.some(artifact => artifact.kind === kind)
}
