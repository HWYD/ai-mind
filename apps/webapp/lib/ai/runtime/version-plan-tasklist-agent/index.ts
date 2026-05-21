import type { ChatComposerReference, ChatRequest } from '@/lib/ai/types/chat'

import { createId } from '../../create-id'
import { createInitialVersionPlanTasklistAgentState } from './state-machine'
import type { VersionPlanTasklistAgentState } from './types'

const VERSION_PLAN_RESOURCE_URI_PATTERN = /^docs:\/\/versions\/[^/\\]+\.md$/i

// Invocation 只回答“本轮是否应该进入这个 Agent”：不命中返回 null，命中但缺少版本方案返回边界提示。
export type VersionPlanTasklistAgentInvocation =
    | {
          kind: 'missing-version-plan'
      }
    | {
          kind: 'ready'
          versionPlanReference: ChatComposerReference
      }

export interface VersionPlanTasklistAgentSkeletonResult {
    state: VersionPlanTasklistAgentState
}

function isVersionPlanReference(reference: ChatComposerReference) {
    const fileName = reference.uri.slice('docs://versions/'.length)

    // Resolver 只做入口快速收口；真正读取 version plan 时仍要在服务端资源 adapter 再做完整路径校验。
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
    // v0.1.0 只承接 /tasklist；/summary、/check 和普通问答继续走既有链路。
    if (request.composer?.command?.name !== 'tasklist') {
        return null
    }

    const versionPlanReference = request.composer.references?.find(isVersionPlanReference)

    if (!versionPlanReference) {
        // 用户选择了 /tasklist 但没有显式 @docs://versions/*.md，必须 fail closed。
        return {
            kind: 'missing-version-plan',
        }
    }

    return {
        kind: 'ready',
        versionPlanReference,
    }
}

// 这里只创建本轮 AgentState，后续读取、生成、校验和最终回答都由 runner 继续推进。
export function createVersionPlanTasklistAgentSkeleton(
    invocation: Extract<VersionPlanTasklistAgentInvocation, { kind: 'ready' }>
): VersionPlanTasklistAgentSkeletonResult {
    // 初始化 state 时只记录用户显式引用的 version plan，不读取文件，也不生成草稿。
    const state = createInitialVersionPlanTasklistAgentState({
        runId: createId(),
        versionPlanReference: invocation.versionPlanReference,
    })

    return {
        state,
    }
}

export {
    parseVersionPlanTasklistAgentAction,
    parseVersionPlanTasklistPlannerActionText,
    versionPlanTasklistAgentActionSchema,
} from './action-schema'
export { getVersionPlanTasklistAgentToolDefinitionMap, isVersionPlanTasklistAgentToolAllowed } from './agent-tools'
export { extractVersionPlan } from './plan-extract'
export { runVersionPlanTasklistAgent } from './tasklist-agent-runner'
export {
    applyVersionPlanTasklistAgentAction,
    createInitialVersionPlanTasklistAgentState,
    validateVersionPlanTasklistAgentAction,
} from './state-machine'
export { readVersionPlanForTasklistAgent } from './version-plan-reader'
export type {
    VersionPlanExtract,
    VersionPlanTasklistAgentAction,
    VersionPlanTasklistAgentState,
    VersionPlanTasklistAgentStatus,
    VersionPlanTasklistToolName,
} from './types'
