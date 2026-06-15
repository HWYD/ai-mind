import { PROJECT_ASSISTANT_MCP_DEFAULT_TOKEN } from './mcp/mcp.constants.js'

export type ProjectAssistantServiceConfigErrorCode = 'invalid_port' | 'production_mcp_token_required'

export class ProjectAssistantServiceConfigError extends Error {
    readonly code: ProjectAssistantServiceConfigErrorCode

    constructor(code: ProjectAssistantServiceConfigErrorCode, message: string) {
        super(message)
        this.code = code
        this.name = 'ProjectAssistantServiceConfigError'
    }
}

export interface ProjectAssistantServiceRuntimeConfig {
    host: string
    mcpToken: string
    port: number
}

type ProjectAssistantServiceEnv = Record<string, string | undefined>

const defaultProjectAssistantServiceHost = '127.0.0.1'
const defaultProjectAssistantServicePort = 8788

export function resolveProjectAssistantServiceRuntimeConfig(
    env: ProjectAssistantServiceEnv = process.env
): ProjectAssistantServiceRuntimeConfig {
    return {
        host: env.PROJECT_ASSISTANT_SERVICE_HOST?.trim() || defaultProjectAssistantServiceHost,
        mcpToken: resolveProjectAssistantServiceMcpToken(env),
        port: resolveProjectAssistantServicePort(env.PROJECT_ASSISTANT_SERVICE_PORT),
    }
}

function resolveProjectAssistantServicePort(rawValue: string | undefined): number {
    const value = rawValue?.trim()

    if (!value) {
        return defaultProjectAssistantServicePort
    }

    const parsed = Number(value)

    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
        throw new ProjectAssistantServiceConfigError(
            'invalid_port',
            'PROJECT_ASSISTANT_SERVICE_PORT must be a positive integer between 1 and 65535.'
        )
    }

    return parsed
}

export function resolveProjectAssistantServiceMcpToken(env: ProjectAssistantServiceEnv = process.env): string {
    const token = env.PROJECT_ASSISTANT_SERVICE_MCP_TOKEN?.trim() || PROJECT_ASSISTANT_MCP_DEFAULT_TOKEN

    if (env.NODE_ENV === 'production') {
        const explicitToken = env.PROJECT_ASSISTANT_SERVICE_MCP_TOKEN?.trim()

        if (!explicitToken || token === PROJECT_ASSISTANT_MCP_DEFAULT_TOKEN) {
            throw new ProjectAssistantServiceConfigError(
                'production_mcp_token_required',
                'PROJECT_ASSISTANT_SERVICE_MCP_TOKEN must be configured in production.'
            )
        }
    }

    return token
}
