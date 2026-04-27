import { StdioClientTransport, type StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js'

import type { MCPStdioServerDefinition } from '@/lib/ai/mcp/protocol/types'

/**
 * 把本地 stdio server definition 转成官方 SDK transport。
 */
export function createStdioClientTransport(serverDefinition: MCPStdioServerDefinition): StdioClientTransport {
    const serverParameters: StdioServerParameters = {
        args: serverDefinition.args,
        command: serverDefinition.command,
        cwd: serverDefinition.cwd,
        env: serverDefinition.env,
        stderr: serverDefinition.stderr ?? 'pipe',
    }

    return new StdioClientTransport(serverParameters)
}
