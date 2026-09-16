/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AssistantMessage } from '@/components/chat/message-list/messages/assistant-message'
import type { MindMessage } from '@/lib/ai/types/message'

afterEach(() => cleanup())

function renderGenericMessage(parts: MindMessage['parts']) {
    const message: MindMessage = {
        createdAt: '2026-09-11T00:00:00.000Z',
        id: 'assistant-general-react',
        parts,
        role: 'assistant',
        status: 'completed',
    }

    return render(
        <AssistantMessage
            combinedReasoning=""
            contentParts={parts}
            feedbackState={null}
            hasTextContent
            isAssistantReplyCompleted
            isCopied={false}
            isLatestAssistantMessage
            isThinking={false}
            message={message}
            onCopy={vi.fn()}
            onFeedbackChange={vi.fn()}
            onRegenerateLastTurn={vi.fn()}
            onSelectFollowUpQuestion={vi.fn()}
            showFollowUpSuggestions={false}
        />
    )
}

describe('AssistantMessage generic General ReAct presentation', () => {
    it('General Agent active state does not add the legacy empty reasoning loading panel', () => {
        const parts: MindMessage['parts'] = [
            {
                id: 'run-part-1',
                runId: 'run-1',
                status: 'running',
                type: 'agent-run',
            },
        ]
        const message: MindMessage = {
            createdAt: '2026-09-11T00:00:00.000Z',
            id: 'assistant-general-react-running',
            parts,
            role: 'assistant',
            status: 'streaming',
        }

        render(
            <AssistantMessage
                combinedReasoning=""
                contentParts={parts}
                feedbackState={null}
                hasTextContent={false}
                isAssistantReplyCompleted={false}
                isCopied={false}
                isLatestAssistantMessage
                isThinking
                message={message}
                onCopy={vi.fn()}
                onFeedbackChange={vi.fn()}
                onRegenerateLastTurn={vi.fn()}
                onSelectFollowUpQuestion={vi.fn()}
                showFollowUpSuggestions={false}
            />
        )

        expect(screen.getAllByRole('button', { name: '正在思考' })).toHaveLength(1)
    })

    it('never renders raw reasoning outside the General ReAct Trace', () => {
        const parts: MindMessage['parts'] = [
            {
                id: 'run-part-1',
                runId: 'run-1',
                status: 'running',
                type: 'agent-run',
            },
            {
                format: 'markdown',
                id: 'reasoning-1',
                text: '这段原始推理绝不能显示给用户',
                type: 'reasoning',
            },
        ]
        const message: MindMessage = {
            createdAt: '2026-09-11T00:00:00.000Z',
            id: 'assistant-general-react-reasoning',
            parts,
            role: 'assistant',
            status: 'streaming',
        }

        render(
            <AssistantMessage
                combinedReasoning="这段原始推理绝不能显示给用户"
                contentParts={parts}
                feedbackState={null}
                hasTextContent={false}
                isAssistantReplyCompleted={false}
                isCopied={false}
                isLatestAssistantMessage
                isThinking
                message={message}
                onCopy={vi.fn()}
                onFeedbackChange={vi.fn()}
                onRegenerateLastTurn={vi.fn()}
                onSelectFollowUpQuestion={vi.fn()}
                showFollowUpSuggestions={false}
            />
        )

        expect(screen.getByRole('button', { name: '正在思考' })).toBeTruthy()
        expect(screen.queryByText('这段原始推理绝不能显示给用户')).toBeNull()
    })

    it('renders Tool/Skill/Resource/Prompt only inside one Trace', () => {
        renderGenericMessage([
            {
                id: 'run-part-1',
                runId: 'run-1',
                status: 'completed',
                type: 'agent-run',
            },
            {
                id: 'skill-1',
                name: 'Web Research',
                skillId: 'web-research',
                type: 'skill',
            },
            {
                id: 'tool-1',
                input: '{}',
                status: 'completed',
                title: '搜索网页',
                toolName: 'web-search',
                type: 'tool',
            },
            {
                id: 'resource-1',
                resourceName: 'React',
                serverId: 'web-search',
                status: 'completed',
                type: 'resource',
                uri: 'https://example.com/react',
            },
            {
                id: 'prompt-1',
                promptName: 'research',
                status: 'completed',
                type: 'prompt',
            },
            {
                format: 'markdown',
                id: 'text-1',
                text: '最终回答',
                type: 'text',
            },
        ])

        fireEvent.click(screen.getByRole('button', { name: '已完成思考' }))

        expect(screen.getByText('已搜索到 0 个来源')).toBeTruthy()
        expect(screen.queryByText('工具调用：搜索网页')).toBeNull()
        expect(screen.queryByText('Skill 命中：Web Research')).toBeNull()
        expect(screen.queryByText('资源读取：React')).toBeNull()
        expect(screen.queryByText('Prompt 注入：research')).toBeNull()
    })

    it('renders only the first General Trace when a malformed duplicate agent-run reaches the renderer', () => {
        renderGenericMessage([
            {
                id: 'run-part-1',
                runId: 'run-1',
                status: 'completed',
                type: 'agent-run',
            },
            {
                id: 'run-part-2',
                runId: 'run-2',
                status: 'completed',
                type: 'agent-run',
            },
            {
                format: 'markdown',
                id: 'text-1',
                text: '最终回答',
                type: 'text',
            },
        ])

        expect(screen.getAllByRole('button', { name: '已完成思考' })).toHaveLength(1)
        expect(screen.getByText('最终回答')).toBeTruthy()
    })

    it('agent-run 与 agent-graph 完全按 discriminator 路由，agentName 不参与类型判断', () => {
        renderGenericMessage([
            {
                id: 'run-part-1',
                runId: 'run-1',
                status: 'completed',
                type: 'agent-run',
            },
            {
                format: 'markdown',
                id: 'text-1',
                text: '直接回答',
                type: 'text',
            },
        ])

        expect(screen.getByRole('button', { name: '已完成思考' })).toBeTruthy()
        cleanup()

        renderGenericMessage([
            {
                agentName: 'custom-dedicated-agent',
                graph: {
                    nodes: [
                        {
                            nodeId: 'node-1',
                            partId: 'node-part-1',
                            patchSummaries: [],
                            status: 'completed',
                            stepIndex: 1,
                            title: '专用步骤',
                        },
                    ],
                    routes: [],
                    runtime: 'LangGraph',
                },
                id: 'graph-part-1',
                runId: 'graph-run-1',
                status: 'completed',
                type: 'agent-graph',
            },
        ])

        expect(screen.getByText('专用步骤')).toBeTruthy()
        expect(screen.queryByRole('button', { name: '已完成思考' })).toBeNull()
    })
})
