import type { ChatComposerReference, ChatRequest } from '@/lib/ai/types/chat'

import { createId } from '../../create-id'

const VERSION_PLAN_RESOURCE_URI_PATTERN = /^docs:\/\/versions\/[^/\\]+\.md$/i

export type VersionPlanTasklistAgentInvocation =
    | {
          kind: 'missing-version-plan'
      }
    | {
          kind: 'ready'
          versionPlanReference: ChatComposerReference
      }

export interface VersionPlanTasklistAgentSkeletonResult {
    runId: string
    versionPlanReference: ChatComposerReference
}

function isVersionPlanReference(reference: ChatComposerReference) {
    const fileName = reference.uri.slice('docs://versions/'.length)

    return (
        reference.type === 'resource' &&
        reference.source === 'local' &&
        VERSION_PLAN_RESOURCE_URI_PATTERN.test(reference.uri) &&
        !!fileName &&
        !fileName.startsWith('.') &&
        !reference.uri.includes('..')
    )
}

export function resolveVersionPlanTasklistAgentInvocation(request: ChatRequest): VersionPlanTasklistAgentInvocation | null {
    if (request.composer?.command?.name !== 'tasklist') {
        return null
    }

    const versionPlanReference = request.composer.references?.find(isVersionPlanReference)

    if (!versionPlanReference) {
        return {
            kind: 'missing-version-plan',
        }
    }

    return {
        kind: 'ready',
        versionPlanReference,
    }
}

export function createVersionPlanTasklistAgentSkeleton(
    invocation: Extract<VersionPlanTasklistAgentInvocation, { kind: 'ready' }>
): VersionPlanTasklistAgentSkeletonResult {
    return {
        runId: createId(),
        versionPlanReference: invocation.versionPlanReference,
    }
}

export {
    resumeVersionPlanTasklistAgentRun,
    startVersionPlanTasklistAgentRun,
    type PreparedVersionPlanTasklistAgentResume,
} from './agent-run-coordinator'
export {
    resumeVersionPlanTasklistGraph,
    runInitialVersionPlanTasklistGraph,
    runVersionPlanTasklistGraph,
} from './graph/run-version-plan-tasklist-graph'
export { createTasklistAgentModelSet } from './model/tasklist-agent-model-set'
export { readVersionPlanForTasklistAgent } from './resources/version-plan-reader'
export { getTasklistAgentRuntimeConfig } from './config/agent-runtime-config'
