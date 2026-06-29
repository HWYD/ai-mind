import type { ChatComposerReference, ChatRequest } from '@/lib/ai/types/chat'

import { createId } from '../../create-id'

const VERSION_PLAN_RESOURCE_URI_PATTERN = /^demo:\/\/version-plans\/[^/\\]+\.md$/i
const LEGACY_VERSION_PLAN_RESOURCE_URI_PATTERN = /^(docs|demo):\/\/versions\/[^/\\]+\.md$/i

export type VersionPlanTasklistAgentInvocation =
    | {
          kind: 'invalid-local-resource'
          reference: ChatComposerReference
      }
    | {
          kind: 'legacy-version-plan'
          versionPlanReference: ChatComposerReference
      }
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

function isLocalResourceReference(reference: ChatComposerReference) {
    return reference.type === 'resource' && reference.source === 'local'
}

function isVersionPlanReference(reference: ChatComposerReference) {
    const fileName = reference.uri.slice('demo://version-plans/'.length)

    return (
        isLocalResourceReference(reference) &&
        VERSION_PLAN_RESOURCE_URI_PATTERN.test(reference.uri) &&
        !!fileName &&
        !fileName.startsWith('.')
    )
}

function isLegacyVersionPlanReference(reference: ChatComposerReference) {
    return isLocalResourceReference(reference) && LEGACY_VERSION_PLAN_RESOURCE_URI_PATTERN.test(reference.uri)
}

export function resolveVersionPlanTasklistAgentInvocation(request: ChatRequest): VersionPlanTasklistAgentInvocation | null {
    if (request.composer?.command?.name !== 'tasklist') {
        return null
    }

    const references = request.composer.references ?? []
    const versionPlanReference = references.find(isVersionPlanReference)

    if (versionPlanReference) {
        return {
            kind: 'ready',
            versionPlanReference,
        }
    }

    const legacyVersionPlanReference = references.find(isLegacyVersionPlanReference)

    if (legacyVersionPlanReference) {
        return {
            kind: 'legacy-version-plan',
            versionPlanReference: legacyVersionPlanReference,
        }
    }

    const invalidLocalReference = references.find(isLocalResourceReference)

    if (invalidLocalReference) {
        return {
            kind: 'invalid-local-resource',
            reference: invalidLocalReference,
        }
    }

    return {
        kind: 'missing-version-plan',
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
export {
    createNoopTasklistLangSmithObserver,
    createTasklistLangSmithObserver,
    type TasklistLangSmithObserver,
    type TasklistLangSmithTraceClient,
} from './observability'
