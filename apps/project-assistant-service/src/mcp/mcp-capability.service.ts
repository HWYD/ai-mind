import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Injectable } from '@nestjs/common'
import * as z from 'zod/v4'

import { PROJECT_ASSISTANT_MCP_INFO } from './mcp.constants.js'

interface DocConsistencyInput {
    focus?: string
}

/**
 * 统一注册 `project-assistant-service` 在 v0.0.12 使用的 MCP mock 能力面。
 * 当前严格保持“每类 capability 一个最小 mock”：
 * - resource: `project://latest-context`
 * - prompt: `tasklist-draft`
 * - tool: `check_doc_consistency`
 */
@Injectable()
export class McpCapabilityService {
    /**
     * 为每个 MCP 会话创建独立 McpServer 实例，避免跨会话状态互相污染。
     */
    createServer() {
        const server = new McpServer(PROJECT_ASSISTANT_MCP_INFO)

        this.registerLatestContextResource(server)
        this.registerTasklistDraftPrompt(server)
        this.registerDocConsistencyTool(server)

        return server
    }

    /**
     * Resource：`project://latest-context`
     * 提供项目文档管理场景的最小上下文（mock 内容）。
     */
    private registerLatestContextResource(server: McpServer) {
        server.registerResource(
            'latest-context',
            'project://latest-context',
            {
                title: 'Latest Project Context',
                description: '返回当前项目文档管理所需的最小上下文（mock）。',
                mimeType: 'application/json',
            },
            async () => ({
                contents: [
                    {
                        uri: 'project://latest-context',
                        mimeType: 'application/json',
                        text: JSON.stringify(
                            {
                                project: 'AI Mind',
                                version: 'v0.0.12',
                                summary: '当前版本聚焦 docs resource 边界、Composer V1 与 capability-driven tool runtime。',
                                documents: [
                                    'README.md',
                                    'docs/README.md',
                                    'docs/architecture/capability-skill-surface.md',
                                    'docs/versions/v0.0.12-docs-resource-composer-capability-tool-runtime.md',
                                    'docs/tasklists/v0.0.12-tasklist.md',
                                ],
                                updatedAt: new Date().toISOString(),
                            },
                            null,
                            2
                        ),
                    },
                ],
            })
        )
    }

    /**
     * Prompt：`tasklist-draft`
     * 最小参数能力：可选 `goal`，用于生成 tasklist 草稿提示。
     */
    private registerTasklistDraftPrompt(server: McpServer) {
        server.registerPrompt(
            'tasklist-draft',
            {
                title: 'Tasklist Draft Prompt',
                description: '生成 tasklist 草稿的模板提示（mock）。',
                argsSchema: {
                    goal: z.string().optional().describe('本次 tasklist 的目标（可选）。'),
                },
            },
            async ({ goal }) => {
                const normalizedGoal = goal?.trim() || '请围绕当前版本目标生成 tasklist 草稿。'

                return {
                    messages: [
                        {
                            role: 'user',
                            content: {
                                type: 'text',
                                text: [
                                    '你是项目执行助手，请根据给定目标输出一份可执行的 tasklist 草稿。',
                                    `目标：${normalizedGoal}`,
                                    '边界：本 Prompt 只提供 tasklist 生成指令，不代表已经读取或注入了项目上下文资源。',
                                    '如果目标中没有提供具体项目细节，请生成通用草稿，并在末尾简短说明后续可结合实际项目上下文细化。',
                                    '不要在最终回答中提及“未注入上下文”“已注入 Prompt”“remote MCP 项目上下文”等内部执行状态。',
                                    '要求：按 Step 分组，每个 Step 至少包含目标、输入、输出、验收标准。',
                                ].join('\n'),
                            },
                        },
                    ],
                }
            }
        )
    }

    /**
     * Tool：`check_doc_consistency`
     * 仅做 mock 的只读分析，不访问真实文件系统。
     */
    private registerDocConsistencyTool(server: McpServer) {
        server.registerTool(
            'check_doc_consistency',
            {
                title: 'Check Doc Consistency',
                description: '检查方案、tasklist、release 文案的一致性（mock 结果）。',
                inputSchema: {
                    focus: z.string().optional().describe('本次一致性检查的关注点（可选）。'),
                },
            },
            async ({ focus }: DocConsistencyInput) => {
                const normalizedFocus = focus?.trim() || '版本目标、执行步骤与测试清单一致性'

                const mockResult = {
                    focus: normalizedFocus,
                    checkedAt: new Date().toISOString(),
                    status: 'needs-review',
                    findings: [
                        'plan 中的非目标声明与 tasklist 的 Step 描述基本一致。',
                        '建议补一条“异常路径与回退策略”核查项，避免上线前遗漏。',
                    ],
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(mockResult, null, 2),
                        },
                    ],
                }
            }
        )
    }
}
