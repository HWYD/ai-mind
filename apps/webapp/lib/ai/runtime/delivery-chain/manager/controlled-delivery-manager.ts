import type { AiMindChatModelHandle, ResolvedModelSelection } from '@/lib/ai/model-provider'

import type { ChatExecutionContext, WriteChunk } from '../../types'
import type { DeliveryChainInput, DeliveryChainResourceBundle } from '../graph-state'
import { createDeliveryChainModelSet } from './delivery-chain-model-set'
import { buildDeliveryManagerFailureReport } from './report-synthesis'
import { createRuntimeArtifact } from './runtime-artifacts'
import { runStructuredDeliveryManager } from './structured-delivery-manager'
import type { RuntimeArtifact, SubagentToolInvocationTrace } from './types'
import type { DeliveryManagerProgressEvent } from './workflow-progress'

interface ControlledDeliveryManagerOptions {
    context: ChatExecutionContext
    input: DeliveryChainInput
    // 保留入口参数形状，v0.4.11 的业务模型由 resolvedModelSelection 统一创建。
    modelHandle: AiMindChatModelHandle
    onProgress?: (event: DeliveryManagerProgressEvent) => void
    resolvedModelSelection: ResolvedModelSelection
    resources: DeliveryChainResourceBundle
    signal?: AbortSignal
    // 不再接受 Manager 驱动的动态工具覆盖，避免绕过固定 Contract 链路。
    workflowId: string
    writeChunk: WriteChunk
}

export interface ControlledDeliveryManagerResult {
    artifacts: RuntimeArtifact[]
    deliveryReportArtifact: RuntimeArtifact
    failureMessage?: string
    reportMarkdown: string
    status: 'blocked' | 'completed' | 'failed'
    trace: SubagentToolInvocationTrace
    warnings: string[]
}

function createContractCapabilityFailure(options: ControlledDeliveryManagerOptions): ControlledDeliveryManagerResult {
    const failureMessage = 'Fixed Contract model does not provide structured JSON output; delivery planning stopped safely.'
    const reportMarkdown = buildDeliveryManagerFailureReport({
        failureMessage,
        input: options.input,
        resources: options.resources,
        warnings: options.resources.warnings,
    })
    const deliveryReportArtifact = createRuntimeArtifact({
        kind: 'delivery_report',
        markdown: reportMarkdown,
        source: { stage: 'manager-synthesis' },
        title: 'Delivery Chain Report',
    })

    options.onProgress?.({
        failureMessage,
        status: 'failed',
        stepId: 'supervisor-pre-decision',
        summary: 'Fixed Contract model is unavailable for structured output.',
    })

    return {
        artifacts: [deliveryReportArtifact],
        deliveryReportArtifact,
        failureMessage,
        reportMarkdown,
        status: 'failed',
        trace: { invocations: [], workflowId: options.workflowId },
        warnings: [...options.resources.warnings],
    }
}

export async function runControlledDeliveryManager(options: ControlledDeliveryManagerOptions): Promise<ControlledDeliveryManagerResult> {
    const modelSet = createDeliveryChainModelSet({
        resolvedModelSelection: options.resolvedModelSelection,
    })
    const contractModel = modelSet.manager.contractHandle.model as unknown as { withStructuredOutput?: unknown }

    if (typeof contractModel.withStructuredOutput !== 'function') {
        return createContractCapabilityFailure(options)
    }

    return runStructuredDeliveryManager({
        context: options.context,
        input: options.input,
        modelSet,
        onProgress: options.onProgress,
        resources: options.resources,
        signal: options.signal,
        workflowId: options.workflowId,
        writeChunk: options.writeChunk,
    })
}
