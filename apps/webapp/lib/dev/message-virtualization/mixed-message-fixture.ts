import type { MindMessage, MindMessagePart } from '@/lib/ai/types/message'

function createAssistantParts(index: number): MindMessagePart[] {
    switch (Math.floor(index / 2) % 9) {
        case 0:
            return [
                {
                    id: `reasoning-${index}`,
                    type: 'reasoning',
                    text: `推理 ${index}：${'动态高度内容 '.repeat(8)}`,
                    format: 'markdown',
                    visibility: 'collapsed',
                },
                {
                    id: `text-${index}`,
                    type: 'text',
                    text: `## 长回复 ${index}\n\n${'包含 Markdown 列表与段落。'.repeat(12)}`,
                    format: 'markdown',
                },
            ]
        case 1:
            return [
                {
                    id: `text-${index}`,
                    type: 'text',
                    text: `代码示例 ${index}\n\n\`\`\`ts\nconst item = ${index}\nconsole.log(item)\n\`\`\``,
                    format: 'markdown',
                },
            ]
        case 2:
            return [
                {
                    id: `tool-${index}`,
                    type: 'tool',
                    toolName: 'calculator',
                    status: 'completed',
                    input: JSON.stringify({ expression: `${index} * 2` }),
                    output: JSON.stringify({ result: index * 2 }),
                },
            ]
        case 3:
            return [
                {
                    id: `resource-${index}`,
                    type: 'resource',
                    resourceName: `reference-${index}.md`,
                    uri: `demo://virtualization/reference-${index}.md`,
                    serverId: 'fixture-server',
                    source: 'internal',
                    location: 'local',
                    status: 'completed',
                    contentPreview: `资源摘要 ${index}：${'延迟内容占位 '.repeat(10)}`,
                },
            ]
        case 4:
            return [
                {
                    id: `workflow-${index}`,
                    type: 'workflow-progress',
                    workflowId: `fixture-workflow-${index}`,
                    workflowKind: 'image_generation',
                    title: `工作流 ${index}`,
                    status: 'completed',
                    summary: `已处理 ${index % 60}s`,
                    visibility: 'collapsed',
                    steps: [
                        {
                            id: `step-${index}`,
                            title: '生成结果',
                            status: 'completed',
                            details: [`动态卡片详情 ${index}`],
                        },
                    ],
                },
            ]
        case 5:
            return [
                {
                    id: `skill-${index}`,
                    type: 'skill',
                    skillId: 'fixture-reader',
                    name: 'Fixture Reader',
                    description: `为第 ${index} 条消息准备上下文`,
                },
                {
                    id: `prompt-${index}`,
                    type: 'prompt',
                    promptName: 'fixture-summary',
                    source: 'internal',
                    location: 'local',
                    status: 'completed',
                    input: `总结第 ${index} 条消息`,
                    messageCount: 3,
                },
            ]
        case 6:
            return [
                {
                    id: `agent-${index}`,
                    type: 'agent-step',
                    agentName: 'fixture-agent',
                    runId: `fixture-agent-run-${index}`,
                    status: 'completed',
                    graph: {
                        nodes: [],
                        routes: [],
                        runtime: 'LangGraph',
                        debugSummary: {
                            checkpointMode: 'memory',
                            currentNode: 'emitFinalArtifact',
                            draftRevisions: 0,
                            manualReviewItemCount: 0,
                            maxDraftRevisions: 1,
                            maxOptionalContextReads: 1,
                            maxSteps: 12,
                            optionalContextReads: 0,
                            runId: `fixture-agent-run-${index}`,
                            runtimeMode: 'graph',
                            stepCount: 2,
                            threadId: `fixture-agent-thread-${index}`,
                            visitedNodes: ['readFixture', 'emitFinalArtifact'],
                        },
                    },
                },
            ]
        case 7:
            return [
                {
                    id: `image-brief-${index}`,
                    type: 'image-brief',
                    runId: `fixture-delayed-image-run-v2-${index}`,
                    summary: {
                        assumptions: [],
                        avoid: [],
                        intent: `延迟加载图片 ${index}`,
                        mustInclude: ['动态高度'],
                        scene: '虚拟消息列表',
                        subjects: ['AI Mind'],
                    },
                },
                {
                    id: `image-result-${index}`,
                    type: 'image-result',
                    runId: `fixture-delayed-image-run-v2-${index}`,
                    contentPath: `/acceptance-fixtures/image-${index}.svg`,
                    expiresAt: '2099-01-01T00:00:00.000Z',
                    height: 480,
                    suggestedFileName: `fixture-${index}.png`,
                    temporary: true,
                    width: 640,
                },
            ]
        default:
            return [
                {
                    id: `text-${index}`,
                    type: 'text',
                    text: `## 多段内容 ${index}\n\n- 第一项\n- 第二项\n\n${'用于观察快速跨段滚动。'.repeat(18)}`,
                    format: 'markdown',
                },
            ]
    }
}

export function createMessageVirtualizationFixture(count = 1000): MindMessage[] {
    return Array.from({ length: count }, (_, index) =>
        index % 2 === 0
            ? {
                  id: `virtual-user-${index}`,
                  role: 'user',
                  createdAt: new Date(Date.UTC(2026, 7, 1, 0, 0, index)).toISOString(),
                  parts: [
                      {
                          id: `user-text-${index}`,
                          type: 'text',
                          text: `测试问题 ${index}`,
                          format: 'markdown',
                      },
                  ],
              }
            : {
                  id: `virtual-assistant-${index}`,
                  role: 'assistant',
                  createdAt: new Date(Date.UTC(2026, 7, 1, 0, 0, index)).toISOString(),
                  parts: createAssistantParts(index),
              }
    )
}
