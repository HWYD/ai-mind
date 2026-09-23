/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GeneralAgentTracePanel } from '@/components/chat/message-list/parts/general-agent/general-agent-trace-panel'
import type { AgentRunPart, AgentTextPart, ToolPart } from '@/lib/ai/types/message'

const completedRun: AgentRunPart = {
    id: 'run-part-1',
    runId: 'run-1',
    status: 'completed',
    type: 'agent-run',
}

function createToolPart(overrides: Partial<ToolPart> = {}): ToolPart {
    return {
        id: 'tool-1',
        input: '{}',
        status: 'completed',
        title: '搜索网页',
        toolName: 'web-search',
        type: 'tool',
        ...overrides,
    }
}

function createAgentTextPart(overrides: Partial<AgentTextPart> = {}): AgentTextPart {
    return {
        format: 'markdown',
        id: 'agent-text-1',
        modelTurnId: 'turn-1',
        phase: 'commentary',
        runId: 'run-1',
        status: 'completed',
        text: '我会先查询资料。',
        type: 'agent-text',
        ...overrides,
    }
}

describe('GeneralAgentTracePanel', () => {
    it('renders one flat inline trace with the official title-only shimmer utility and adjacent chevron', () => {
        const runningRun: AgentRunPart = { ...completedRun, status: 'running' }

        render(
            <GeneralAgentTracePanel
                finalAnswerStarted={false}
                run={runningRun}
                parts={[
                    createToolPart({
                        sources: [
                            {
                                originTool: 'web-search',
                                sourceId: 'source-1',
                                status: 'discovered',
                                title: 'React',
                                url: 'https://example.com/react',
                            },
                        ],
                    }),
                ]}
            />
        )

        const trigger = screen.getByRole('button', { name: '正在思考' })
        const row = screen.getByTestId('general-agent-trace-row')

        expect(trigger.getAttribute('aria-expanded')).toBe('true')
        expect(trigger.querySelector('span.shimmer')?.textContent).toBe('正在思考')
        expect(trigger.querySelector('[data-slot="shimmer"]')).toBeNull()
        expect(trigger.className).toContain('h-[30px]')
        expect(trigger.className).toContain('w-fit')
        expect(trigger.className).toContain('gap-1.5')
        expect(trigger.className).toContain('text-[15px]')
        expect(screen.getByText('已搜索到 1 个来源')).toBeTruthy()
        expect(row.className).toContain('h-[30px]')
        expect(row.className).toContain('gap-[11px]')
        expect(row.querySelectorAll('svg')).toHaveLength(1)
        expect(screen.queryByText('1')).toBeNull()
        expect(screen.queryByText('已完成')).toBeNull()
        expect(trigger.className).not.toContain('border')
    })

    it('keeps the active shimmer while actions have completed but final text has not started', () => {
        render(<GeneralAgentTracePanel finalAnswerStarted={false} parts={[createToolPart()]} run={completedRun} />)

        const trigger = screen.getByRole('button', { name: '正在思考' })

        expect(trigger.querySelector('span.shimmer')?.textContent).toBe('正在思考')
        expect(trigger.querySelector('[data-slot="shimmer"]')).toBeNull()
        expect(trigger.getAttribute('aria-expanded')).toBe('true')
        expect(screen.queryByRole('button', { name: '已完成思考' })).toBeNull()
    })

    it('shows read sources only after a successful read and caps canonical URLs', () => {
        render(
            <GeneralAgentTracePanel
                finalAnswerStarted={false}
                run={completedRun}
                parts={[
                    createToolPart({
                        id: 'read-1',
                        title: '读取页面',
                        toolName: 'read-url',
                        sources: [
                            { originTool: 'read-url', sourceId: 'a', status: 'read', title: 'A', url: 'https://example.com/a#x' },
                            { originTool: 'read-url', sourceId: 'a2', status: 'read', title: 'A duplicate', url: 'https://example.com/a' },
                        ],
                    }),
                ]}
            />
        )

        expect(screen.getByText('已读取 1 个页面')).toBeTruthy()
        expect(screen.getByText('已读取来源')).toBeTruthy()
        expect(screen.getAllByRole('link')).toHaveLength(1)

        const link = screen.getByRole('link', { name: 'A example.com' })

        expect(link.getAttribute('href')).toBe('https://example.com/a')
        expect(link.getAttribute('rel')).toBe('noopener noreferrer')
        expect(link.textContent).toContain('example.com')
        expect(link.querySelectorAll('svg')).toHaveLength(1)
    })

    it('keeps read sources below their owning Tool before later Trace events', () => {
        render(
            <GeneralAgentTracePanel
                finalAnswerStarted={false}
                run={{ ...completedRun, status: 'running' }}
                parts={[
                    createToolPart({
                        id: 'read-1',
                        title: '读取页面',
                        toolName: 'read-url',
                        sources: [
                            {
                                originTool: 'read-url',
                                sourceId: 'vue-guide',
                                status: 'read',
                                title: 'Vue.js',
                                url: 'https://cn.vuejs.org/guide/introduction',
                            },
                        ],
                    }),
                    createAgentTextPart({ id: 'commentary-after-read', text: '我正在整理该页面的核心内容。' }),
                    createToolPart({ id: 'search-after-read' }),
                ]}
            />
        )

        const readTool = screen.getByText('已读取 1 个页面')
        const sourceHeader = screen.getByText('已读取来源')
        const commentary = screen.getByText('我正在整理该页面的核心内容。')

        expect(readTool.compareDocumentPosition(sourceHeader) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
        expect(sourceHeader.compareDocumentPosition(commentary) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    })

    it('never renders credential-bearing, signed, or private source URLs as links', () => {
        render(
            <GeneralAgentTracePanel
                finalAnswerStarted={false}
                run={completedRun}
                parts={[
                    createToolPart({
                        id: 'read-unsafe',
                        title: '读取页面',
                        toolName: 'read-url',
                        sources: [
                            {
                                originTool: 'read-url',
                                sourceId: 'credential-source',
                                status: 'read',
                                title: 'Credential',
                                url: 'https://user:password@example.com/private',
                            },
                            {
                                originTool: 'read-url',
                                sourceId: 'private-source',
                                status: 'read',
                                title: 'Private',
                                url: 'http://127.0.0.1/metadata',
                            },
                            {
                                originTool: 'read-url',
                                sourceId: 'signed-source',
                                status: 'read',
                                title: 'Signed',
                                url: 'https://example.com/file?X-Amz-Signature=secret',
                            },
                        ],
                    }),
                ]}
            />
        )

        expect(screen.getByText('已读取 0 个页面')).toBeTruthy()
        expect(screen.queryByRole('link')).toBeNull()
    })

    it('counts only discovered web sources for a search call', () => {
        render(
            <GeneralAgentTracePanel
                finalAnswerStarted={false}
                run={completedRun}
                parts={[
                    createToolPart({
                        sources: [
                            {
                                originTool: 'web-search',
                                sourceId: 'available',
                                status: 'discovered',
                                title: 'Available',
                                url: 'https://example.com/available',
                            },
                            {
                                originTool: 'web-search',
                                sourceId: 'unavailable',
                                status: 'unavailable',
                                title: 'Unavailable',
                                url: 'https://example.com/unavailable',
                            },
                            {
                                originTool: 'web-search',
                                sourceId: 'read',
                                status: 'read',
                                title: 'Read elsewhere',
                                url: 'https://example.com/read',
                            },
                        ],
                    }),
                ]}
            />
        )

        expect(screen.getByText('已搜索到 1 个来源')).toBeTruthy()
    })

    it('uses each search call result count without exposing raw input', () => {
        render(
            <GeneralAgentTracePanel
                finalAnswerStarted={false}
                run={completedRun}
                parts={[
                    createToolPart({
                        id: 'search-1',
                        input: '公开网页',
                        sources: [
                            {
                                originTool: 'web-search',
                                sourceId: 'first-a',
                                status: 'discovered',
                                title: 'First A',
                                url: 'https://example.com/first-a',
                            },
                            {
                                originTool: 'web-search',
                                sourceId: 'first-b',
                                status: 'discovered',
                                title: 'First B',
                                url: 'https://example.com/first-b',
                            },
                        ],
                    }),
                    createToolPart({
                        id: 'search-2',
                        input: '公开网页',
                        sources: [
                            {
                                originTool: 'web-search',
                                sourceId: 'second-a',
                                status: 'discovered',
                                title: 'Second A',
                                url: 'https://example.com/second-a',
                            },
                        ],
                    }),
                ]}
            />
        )

        expect(screen.getByText('已搜索到 2 个来源')).toBeTruthy()
        expect(screen.getByText('已搜索到 1 个来源')).toBeTruthy()
        expect(screen.queryByText('公开网页')).toBeNull()
    })

    it('collapses once on final text start while allowing manual reopen', () => {
        const runningRun: AgentRunPart = { ...completedRun, status: 'running' }
        const { rerender } = render(<GeneralAgentTracePanel finalAnswerStarted={false} parts={[createToolPart()]} run={runningRun} />)

        rerender(<GeneralAgentTracePanel finalAnswerStarted parts={[createToolPart()]} run={completedRun} />)

        expect(screen.getByText('已完成思考')).toBeTruthy()
        expect(screen.getByRole('button', { name: '已完成思考' }).getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByText('搜索网页')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: '已完成思考' }))

        expect(screen.getByRole('button', { name: '已完成思考' }).getAttribute('aria-expanded')).toBe('true')
        expect(screen.getByText('已搜索到 0 个来源')).toBeTruthy()
    })

    it('preserves a manual collapse while later events arrive', () => {
        const runningRun: AgentRunPart = { ...completedRun, status: 'running' }
        const { rerender } = render(<GeneralAgentTracePanel finalAnswerStarted={false} parts={[createToolPart()]} run={runningRun} />)

        fireEvent.click(screen.getByRole('button', { name: '正在思考' }))
        rerender(
            <GeneralAgentTracePanel
                finalAnswerStarted={false}
                parts={[createToolPart({ id: 'tool-2', title: '读取页面', toolName: 'read-url' })]}
                run={runningRun}
            />
        )

        expect(screen.getByRole('button', { name: '正在思考' }).getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByText('读取页面')).toBeNull()
    })

    it('零 Tool 直答保留完成标题，但不渲染可交互 disclosure', () => {
        render(<GeneralAgentTracePanel finalAnswerStarted parts={[]} run={completedRun} />)

        const title = screen.getByText('已完成思考')

        expect(title).toBeTruthy()
        expect(screen.queryByRole('button', { name: '已完成思考' })).toBeNull()
        expect(screen.queryByTestId('general-agent-trace-row')).toBeNull()
    })

    it('将尚未解析的 Agent 正文显示为无图标的 Markdown 正文', () => {
        const pending: AgentTextPart = {
            format: 'markdown',
            id: 'agent-text-pending',
            modelTurnId: 'turn-pending',
            phase: 'pending',
            runId: 'run-1',
            status: 'streaming',
            text: '我正在整理可公开的说明。',
            type: 'agent-text',
        }

        render(<GeneralAgentTracePanel finalAnswerStarted={false} parts={[pending]} run={{ ...completedRun, status: 'running' }} />)

        const pendingText = screen.getByText('我正在整理可公开的说明。').closest('.ai-message-markdown')

        expect(pendingText).toBeTruthy()
        expect(pendingText?.querySelector('svg')).toBeNull()
        expect(screen.queryByRole('button', { name: '正在思考' })).toBeNull()
        expect(screen.queryByTestId('general-agent-trace-row')).toBeNull()
    })

    it('将工具前说明作为平铺 commentary Trace 行，不归属到 Tool detail', () => {
        const commentary = createAgentTextPart({ text: '我先查询相关资料。' })

        render(<GeneralAgentTracePanel finalAnswerStarted={false} parts={[commentary, createToolPart()]} run={completedRun} />)

        const commentaryText = screen.getByText('我先查询相关资料。').closest('.ai-message-markdown')

        expect(commentaryText).toBeTruthy()
        expect(commentaryText?.querySelector('svg')).toBeNull()
        expect(screen.getAllByTestId('general-agent-trace-row')).toHaveLength(1)
    })

    it('按 part ordinal 追加模型正文和工具，并以无图标的正文 Markdown 渲染模型文本', () => {
        render(
            <GeneralAgentTracePanel
                finalAnswerStarted={false}
                run={{ ...completedRun, status: 'running' }}
                parts={[
                    createAgentTextPart({ id: 'commentary-1', text: '先查询第一个来源。' }),
                    createToolPart({ id: 'tool-1' }),
                    createAgentTextPart({ id: 'commentary-2', modelTurnId: 'turn-2', text: '继续读取其中的页面。' }),
                    createToolPart({ id: 'tool-2', title: '读取页面', toolName: 'read-url' }),
                    createAgentTextPart({
                        id: 'pending-final',
                        modelTurnId: 'turn-3',
                        phase: 'pending',
                        status: 'streaming',
                        text: '我正在汇总最终结论。',
                    }),
                ]}
            />
        )

        const firstCommentary = screen.getByText('先查询第一个来源。').closest('.ai-message-markdown')
        const firstTool = screen.getByText('已搜索到 0 个来源')
        const secondCommentary = screen.getByText('继续读取其中的页面。').closest('.ai-message-markdown')
        const secondTool = screen.getByText('已读取 0 个页面')
        const pending = screen.getByText('我正在汇总最终结论。').closest('.ai-message-markdown')

        expect(firstCommentary).toBeTruthy()
        expect(secondCommentary).toBeTruthy()
        expect(pending).toBeTruthy()
        expect(pending?.querySelector('svg')).toBeNull()
        expect(firstCommentary?.compareDocumentPosition(firstTool) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
        expect(firstTool.compareDocumentPosition(secondCommentary!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
        expect(secondCommentary?.compareDocumentPosition(secondTool) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
        expect(secondTool.compareDocumentPosition(pending!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    })

    it('constrained finalizer 完成时显示处理未完成并保持 live Trace 展开', () => {
        render(
            <GeneralAgentTracePanel
                finalAnswerStarted
                parts={[createToolPart()]}
                run={{ ...completedRun, finalizationMode: 'constrained' }}
            />
        )

        const trigger = screen.getByRole('button', { name: '处理未完成' })

        expect(trigger.getAttribute('aria-expanded')).toBe('true')
        expect(screen.getByText('已搜索到 0 个来源')).toBeTruthy()
    })

    it('恢复的 constrained Run 默认折叠，但仍可手动展开', () => {
        render(
            <GeneralAgentTracePanel
                finalAnswerStarted
                parts={[createToolPart()]}
                run={{ ...completedRun, finalizationMode: 'constrained', restored: true }}
            />
        )

        const trigger = screen.getByRole('button', { name: '处理未完成' })

        expect(trigger.getAttribute('aria-expanded')).toBe('false')
        fireEvent.click(trigger)
        expect(screen.getByText('已搜索到 0 个来源')).toBeTruthy()
    })

    it('uses terminal copy and semantic text color without a separate status icon', () => {
        const failedRun: AgentRunPart = { ...completedRun, status: 'failed' }

        render(
            <GeneralAgentTracePanel
                finalAnswerStarted={false}
                parts={[createToolPart({ status: 'failed', title: '读取页面', toolName: 'read-url' })]}
                run={failedRun}
            />
        )

        const row = screen.getByTestId('general-agent-trace-row')

        expect(screen.getByRole('button', { name: '处理未完成' })).toBeTruthy()
        expect(screen.getByText('读取步骤未完成')).toBeTruthy()
        expect(row.className).toContain('text-destructive')
        expect(row.querySelectorAll('svg')).toHaveLength(1)
    })

    it('renders selected Skill inside the trace with the canonical loading copy', () => {
        render(
            <GeneralAgentTracePanel
                finalAnswerStarted={false}
                run={{ ...completedRun, status: 'running' }}
                parts={[
                    {
                        id: 'skill-1',
                        name: '实用技能',
                        skillId: 'utility-skill',
                        type: 'skill',
                    },
                ]}
            />
        )

        expect(screen.getByText('加载了实用技能 Skill')).toBeTruthy()
        expect(screen.queryByText('已启用 实用技能')).toBeNull()
        expect(screen.queryByText('Skill 命中：实用技能')).toBeNull()
    })
})
