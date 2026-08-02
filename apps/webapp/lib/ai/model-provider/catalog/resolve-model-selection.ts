import { getModelProviderConfig } from '../provider-config'
import type { AiMindModelCatalogItem, ModelRouteType, ResolvedModelSelection } from '../types'
import { modelCatalog } from './model-catalog'

export type ModelSelectionErrorCode =
    | 'MODEL_NOT_FOUND'
    | 'MODEL_DISABLED'
    | 'MODEL_PROVIDER_NOT_ALLOWED'
    | 'MODEL_NOT_AVAILABLE_IN_ENVIRONMENT'
    | 'MODEL_DOES_NOT_SUPPORT_ROUTE_TYPE'
    | 'MODEL_DOES_NOT_SUPPORT_TOOL_CALLING'
    | 'MODEL_DOES_NOT_SUPPORT_JSON_OUTPUT'

export class ModelSelectionError extends Error {
    readonly code: ModelSelectionErrorCode
    readonly modelId: string

    constructor(code: ModelSelectionErrorCode, modelId: string, message: string) {
        super(message)
        this.code = code
        this.modelId = modelId
        this.name = 'ModelSelectionError'
    }
}

export interface ResolveModelSelectionParams {
    modelId?: string
    routeType: ModelRouteType
    /** 是否需要 Tool Calling（当前链路显式声明需额外能力，例如普通 Tool Calling 或 Capability Context 等） */
    requireToolCalling?: boolean
    /** 是否需要严格结构化输出能力。Delivery Chain 的 Agent Contract 以此为前置条件。 */
    requireJsonOutput?: boolean
}

/**
 * 根据 catalog 校验 + provider /tasklist 等模型选择的统一入口。
 *
 * 错误语义：
 * - 请求未传 modelId 时使用 config.defaultModelId。
 * - 请求传入非法 modelId 时 fail closed，不回退默认模型。
 * - provider 不在 allowedProviders 或 catalog item.enabled 或 当前环境不在 availableIn 或 routeType 不支持时 fail closed。
 * - 需要 Tool Calling 但 catalog item 未声明 toolCalling=true 时 fail closed。
 */
export function resolveModelSelection(params: ResolveModelSelectionParams): ResolvedModelSelection {
    const config = getModelProviderConfig()
    const targetModelId = params.modelId ?? config.defaultModelId

    const catalogItem = resolveFromCatalog(targetModelId)

    validateAvailabilityInCatalog(catalogItem, targetModelId)
    validateProviderAllowed(catalogItem, targetModelId, config.allowedProviders)
    validateEnvironment(catalogItem, targetModelId)
    validateRouteType(catalogItem, targetModelId, params.routeType)

    if (params.requireToolCalling && !catalogItem.capabilities.toolCalling) {
        throw new ModelSelectionError(
            'MODEL_DOES_NOT_SUPPORT_TOOL_CALLING',
            targetModelId,
            `Model "${targetModelId}" does not declare tool calling capability for request route type "${params.routeType}".`
        )
    }

    if (params.requireJsonOutput && !catalogItem.capabilities.jsonOutput) {
        throw new ModelSelectionError(
            'MODEL_DOES_NOT_SUPPORT_JSON_OUTPUT',
            targetModelId,
            `Model "${targetModelId}" does not declare JSON output capability for request route type "${params.routeType}".`
        )
    }

    return {
        catalogItem,
        modelId: targetModelId,
        provider: catalogItem.provider,
        providerModel: catalogItem.providerModel,
        routeType: params.routeType,
    }
}

function resolveFromCatalog(modelId: string): AiMindModelCatalogItem {
    const item = modelCatalog.find(catalogItem => catalogItem.id === modelId)

    if (!item) {
        throw new ModelSelectionError('MODEL_NOT_FOUND', modelId, `Model "${modelId}" is not defined in AI Mind model catalog.`)
    }

    return item
}

function validateAvailabilityInCatalog(catalogItem: AiMindModelCatalogItem, modelId: string) {
    if (!catalogItem.enabled) {
        throw new ModelSelectionError('MODEL_DISABLED', modelId, `Model "${modelId}" is currently disabled.`)
    }
}

function validateProviderAllowed(catalogItem: AiMindModelCatalogItem, modelId: string, allowedProviders: string[]) {
    if (!allowedProviders.includes(catalogItem.provider)) {
        throw new ModelSelectionError(
            'MODEL_PROVIDER_NOT_ALLOWED',
            modelId,
            `Model provider "${catalogItem.provider}" is not allowed in current configuration.`
        )
    }
}

function validateEnvironment(catalogItem: AiMindModelCatalogItem, modelId: string) {
    const currentEnvironment = process.env.NODE_ENV === 'production' ? 'production' : 'development'

    if (!catalogItem.availableIn.includes(currentEnvironment)) {
        throw new ModelSelectionError(
            'MODEL_NOT_AVAILABLE_IN_ENVIRONMENT',
            modelId,
            `Model "${modelId}" is not available in current environment "${currentEnvironment}".`
        )
    }
}

function validateRouteType(catalogItem: AiMindModelCatalogItem, modelId: string, routeType: ModelRouteType) {
    const supportsRouteTypeCapability = routeType === 'tasklist' ? catalogItem.capabilities.tasklist : catalogItem.capabilities.chat

    if (!supportsRouteTypeCapability) {
        throw new ModelSelectionError(
            'MODEL_DOES_NOT_SUPPORT_ROUTE_TYPE',
            modelId,
            `Model "${modelId}" does not support route type "${routeType}".`
        )
    }
}
