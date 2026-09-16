/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GeneralAgentTracePanel } from '@/components/chat/message-list/parts/general-agent/general-agent-trace-panel'
import type { AgentRunPart, ToolPart } from '@/lib/ai/types/message'

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

    it('does not count unavailable web sources as discovered search sources', () => {
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
                        ],
                    }),
                ]}
            />
        )

        expect(screen.getByText('已搜索到 1 个来源')).toBeTruthy()
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

    it('零 Tool 直答仍渲染显式 Run Trace，不制造空状态行', () => {
        render(<GeneralAgentTracePanel finalAnswerStarted parts={[]} run={completedRun} />)

        const trigger = screen.getByRole('button', { name: '已完成思考' })

        expect(trigger).toBeTruthy()
        expect(trigger.querySelector('svg')).toBeNull()
        expect(screen.queryByTestId('general-agent-trace-row')).toBeNull()
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
