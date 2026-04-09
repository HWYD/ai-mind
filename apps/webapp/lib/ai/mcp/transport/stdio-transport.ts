import { StdioClientTransport, type StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js'

import type { MCPServerDefinition } from '@/lib/ai/mcp/protocol/types'

export function createStdioClientTransport(serverDefinition: MCPServerDefinition): StdioClientTransport {
    const serverParameters: StdioServerParameters = {
        args: serverDefinition.args,
        command: serverDefinition.command,
        cwd: serverDefinition.cwd,
        env: serverDefinition.env,
        stderr: serverDefinition.stderr ?? 'pipe',
    }

    return new StdioClientTransport(serverParameters)
}
