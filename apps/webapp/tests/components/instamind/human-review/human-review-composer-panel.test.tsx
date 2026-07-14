/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { HumanReviewComposerPanel } from '@/components/instamind/human-review/human-review-composer-panel'
import type { PendingAgentInterrupt } from '@/components/instamind/use-chat-stream'

beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
        configurable: true,
        value: () => false,
    })
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
        configurable: true,
        value: () => undefined,
    })
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
        configurable: true,
        value: () => undefined,
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: () => undefined,
    })
    /*
    it('Strategy Review current strategy submit shows loading state', async () => {
        let resolveDecision: ((value: boolean) => void) | null = null
        const onResumeDecision = vi.fn().mockImplementation(
            () =>
                new Promise<boolean>(resolve => {
                    resolveDecision = resolve
                })
        )

        const { container } = render(
            <HumanReviewComposerPanel pendingInterrupt={createStrategyPendingInterrupt()} onResumeDecision={onResumeDecision} />
        )
        const continueButton = container.querySelector('button[class*="bg-[var(--composer-focus)]"]')

        expect(continueButton).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: /鎸夊綋鍓嶇瓥鐣ョ户缁?/ }))

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /鎸夊綋鍓嶇瓥鐣ョ户缁?/ }).getAttribute('aria-busy')).toBe('true')
            expect(screen.getByRole('button', { name: /鎸夊綋鍓嶇瓥鐣ョ户缁?/ }).querySelector('svg.animate-spin')).toBeTruthy()
        })

        resolveDecision?.(true)

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /鎸夊綋鍓嶇瓥鐣ョ户缁?/ }).getAttribute('aria-busy')).toBeNull()
            expect(screen.getByRole('button', { name: /鎸夊綋鍓嶇瓥鐣ョ户缁?/ }).querySelector('svg.animate-spin')).toBeNull()
        })
    })
    */
})

describe('HumanReviewComposerPanel loading state', () => {
    it('shows loading state on the primary strategy submit button', async () => {
        let resolveDecision: ((value: boolean) => void) | null = null
        const onResumeDecision = vi.fn().mockImplementation(
            () =>
                new Promise<boolean>(resolve => {
                    resolveDecision = resolve
                })
        )

        const { container } = render(
            <HumanReviewComposerPanel pendingInterrupt={createStrategyPendingInterrupt()} onResumeDecision={onResumeDecision} />
        )
        const continueButton = container.querySelector('button[class*="bg-[var(--composer-focus)]"]')

        expect(continueButton).toBeTruthy()

        fireEvent.click(continueButton!)

        await waitFor(() => {
            expect(continueButton?.getAttribute('aria-busy')).toBe('true')
            expect(continueButton?.querySelector('svg.animate-spin')).toBeTruthy()
        })

        resolveDecision?.(true)

        await waitFor(() => {
            expect(continueButton?.getAttribute('aria-busy')).toBe('false')
            expect(continueButton?.querySelector('svg.animate-spin')).toBeNull()
        })
    })
})

afterEach(() => {
    cleanup()
})

function createStrategyPendingInterrupt(reviewRound: 1 | 2 = 1): PendingAgentInterrupt {
    return {
        messageId: 'assistant-hitl',
        part: {
            interruptId: `interrupt-strategy-${reviewRound}`,
            interruptKind: 'strategy_review',
            payload: {
                allowedDecisions: reviewRound === 1 ? ['approve', 'edit', 'reject', 'respond'] : ['approve', 'edit', 'reject'],
                data: {
                    planUri: 'demo://version-plans/v0.3.0.md',
                    reviewRound,
                    strategy: {
                        granularity: 'medium',
                        grouping: 'by_phase',
                        notes: '优先保留 stream/artifact 兼容。',
                        priorityFocus: ['core_runtime', 'tests'],
                        stepCountRange: '5-8',
                    },
                    targetVersion: 'v0.3.0',
                },
                kind: 'strategy_review',
                nodeName: 'reviewTasklistStrategy',
                runId: 'run-hitl',
                threadId: 'tasklist-agent:session:run-hitl',
            },
            runId: 'run-hitl',
            status: 'pending',
            threadId: 'tasklist-agent:session:run-hitl',
            type: 'agent-interrupt',
        },
    } as PendingAgentInterrupt
}

function createRevisionPendingInterrupt(): PendingAgentInterrupt {
    return {
        messageId: 'assistant-hitl',
        part: {
            interruptId: 'interrupt-revision',
            interruptKind: 'tasklist_revision_review',
            payload: {
                allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
                data: {
                    fixNow: ['补齐测试验证说明', '补充 refresh recovery 覆盖'],
                    markdown: '# v0.3.0 Tasklist\n\n- [ ] 补齐 HITL UI 测试',
                    reviewRound: 1,
                    revision: 1,
                    validation: {
                        blockingIssues: [],
                        score: 82,
                        status: 'warning',
                        weakSections: [],
                    },
                },
                kind: 'tasklist_revision_review',
                nodeName: 'reviewTasklistRevision',
                runId: 'run-hitl',
                threadId: 'tasklist-agent:session:run-hitl',
            },
            runId: 'run-hitl',
            status: 'pending',
            threadId: 'tasklist-agent:session:run-hitl',
            type: 'agent-interrupt',
        },
    } as PendingAgentInterrupt
}

function expectButtonPressed(name: string | RegExp, pressed: boolean) {
    expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe(String(pressed))
}

describe('HumanReviewComposerPanel', () => {
    it('Strategy Review 默认渲染中文 chip，且不展示开发态 badge', () => {
        render(<HumanReviewComposerPanel pendingInterrupt={createStrategyPendingInterrupt()} onResumeDecision={vi.fn()} />)

        const selectedGranularityButton = screen.getByRole('button', { name: /中等/ })
        const continueButton = screen.getByRole('button', { name: /按当前策略继续/ })

        expect(screen.getByText('确认任务清单生成策略')).toBeTruthy()
        expectButtonPressed(/中等/, true)
        expect(screen.getByRole('button', { name: /更粗/ })).toBeTruthy()
        expectButtonPressed(/按阶段/, true)
        expectButtonPressed(/核心运行时/, true)
        expect(selectedGranularityButton.querySelector('svg')).toBeNull()
        expect(continueButton.querySelector('svg')).toBeNull()
        expect(screen.queryByText('Agent 等待确认策略')).toBeNull()
        expect(screen.queryByText('普通输入框已锁定。')).toBeNull()
        expect(screen.queryByText('Strategy Review')).toBeNull()
        expect(screen.queryByText(/Agent 建议/)).toBeNull()
        expect(screen.queryByRole('button', { name: /修改策略/ })).toBeNull()
    })

    it('Strategy Review 未修改时提交 approve decision', async () => {
        const onResumeDecision = vi.fn().mockResolvedValue(true)

        render(<HumanReviewComposerPanel pendingInterrupt={createStrategyPendingInterrupt()} onResumeDecision={onResumeDecision} />)

        fireEvent.click(screen.getByRole('button', { name: /按当前策略继续/ }))

        await waitFor(() => {
            expect(onResumeDecision).toHaveBeenCalledWith({ type: 'approve' })
        })
    })

    it('Strategy Review chip 修改后提交 edit decision，并保留原 schema 值', async () => {
        const onResumeDecision = vi.fn().mockResolvedValue(true)

        render(<HumanReviewComposerPanel pendingInterrupt={createStrategyPendingInterrupt()} onResumeDecision={onResumeDecision} />)

        fireEvent.click(screen.getByRole('button', { name: /更细/ }))
        fireEvent.click(screen.getByRole('button', { name: /按模块/ }))
        fireEvent.click(screen.getByRole('button', { name: /前端 UI/ }))
        fireEvent.click(screen.getByRole('button', { name: /按当前策略继续/ }))

        await waitFor(() => {
            expect(onResumeDecision).toHaveBeenCalledWith({
                strategy: expect.objectContaining({
                    granularity: 'detailed',
                    grouping: 'by_module',
                    priorityFocus: ['core_runtime', 'tests', 'frontend_ui'],
                }),
                type: 'edit',
            })
        })
    })

    it('Strategy Review 至少保留一个 priorityFocus', () => {
        render(<HumanReviewComposerPanel pendingInterrupt={createStrategyPendingInterrupt()} onResumeDecision={vi.fn()} />)

        fireEvent.click(screen.getByRole('button', { name: /核心运行时/ }))
        fireEvent.click(screen.getByRole('button', { name: '测试' }))

        expectButtonPressed('测试', true)
    })

    it('第二次 Strategy Review 隐藏补充要求入口', () => {
        render(<HumanReviewComposerPanel pendingInterrupt={createStrategyPendingInterrupt(2)} onResumeDecision={vi.fn()} />)

        expect(screen.queryByRole('button', { name: '补充要求' })).toBeNull()
        expect(screen.getByRole('button', { name: /按当前策略继续/ })).toBeTruthy()
    })

    it('Strategy Review notes 通过信息图标展示', async () => {
        render(<HumanReviewComposerPanel pendingInterrupt={createStrategyPendingInterrupt()} onResumeDecision={vi.fn()} />)

        expect(screen.queryByText('优先保留 stream/artifact 兼容。')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: '查看策略说明' }))

        await waitFor(() => {
            expect(screen.getByText('策略说明')).toBeTruthy()
            expect(screen.getByText('优先保留 stream/artifact 兼容。')).toBeTruthy()
        })
    })

    it('Strategy Review 补充要求使用卡内 textarea 提交 respond decision', async () => {
        const onResumeDecision = vi.fn().mockResolvedValue(true)

        render(<HumanReviewComposerPanel pendingInterrupt={createStrategyPendingInterrupt()} onResumeDecision={onResumeDecision} />)

        fireEvent.click(screen.getByRole('button', { name: '补充要求' }))
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '更关注前端交互和错误恢复' } })
        fireEvent.click(screen.getByRole('button', { name: /提交并重新生成策略/ }))

        await waitFor(() => {
            expect(onResumeDecision).toHaveBeenCalledWith({
                feedback: '更关注前端交互和错误恢复',
                type: 'respond',
            })
        })
    })

    it('Strategy Review 终止本轮直接提交 reject decision', async () => {
        const onResumeDecision = vi.fn().mockResolvedValue(true)

        render(<HumanReviewComposerPanel pendingInterrupt={createStrategyPendingInterrupt()} onResumeDecision={onResumeDecision} />)

        fireEvent.click(screen.getByRole('button', { name: '终止本轮' }))

        await waitFor(() => {
            expect(onResumeDecision).toHaveBeenCalledWith({ type: 'reject' })
        })
    })

    it('Tasklist Revision Review 展示 fixNow、validation 和修订说明入口', () => {
        render(<HumanReviewComposerPanel pendingInterrupt={createRevisionPendingInterrupt()} onResumeDecision={vi.fn()} />)

        expect(screen.getByText('确认 tasklist 修订')).toBeTruthy()
        expect(screen.getByText('检测到 2 个需要立即处理的问题。')).toBeTruthy()
        expect(screen.getByText('补齐测试验证说明')).toBeTruthy()
        expect(screen.getByText('补充 refresh recovery 覆盖')).toBeTruthy()
        expect(screen.getByText(/Validation：warning \/ Score：82/)).toBeTruthy()
        expect(screen.queryByText(/最多两轮受控修订/)).toBeNull()
        expect(screen.queryByRole('textbox')).toBeNull()
    })

    it('Tasklist Revision Review 让 Agent 修提交 approve decision', async () => {
        const onResumeDecision = vi.fn().mockResolvedValue(true)

        render(<HumanReviewComposerPanel pendingInterrupt={createRevisionPendingInterrupt()} onResumeDecision={onResumeDecision} />)

        expectButtonPressed(/让 Agent 修/, true)
        fireEvent.click(screen.getByRole('button', { name: /同意修订并继续/ }))

        await waitFor(() => {
            expect(onResumeDecision).toHaveBeenCalledWith({ type: 'approve' })
        })
    })

    it('Tasklist Revision Review 直接编辑 Markdown 后提交 edit decision', async () => {
        const onResumeDecision = vi.fn().mockResolvedValue(true)

        render(<HumanReviewComposerPanel pendingInterrupt={createRevisionPendingInterrupt()} onResumeDecision={onResumeDecision} />)

        fireEvent.click(screen.getByRole('button', { name: /我直接编辑/ }))
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Updated Tasklist\n\n- [ ] 人工修订' } })
        fireEvent.click(screen.getByRole('button', { name: '提交 Markdown 修订' }))

        await waitFor(() => {
            expect(onResumeDecision).toHaveBeenCalledWith({
                markdown: '# Updated Tasklist\n\n- [ ] 人工修订',
                type: 'edit',
            })
        })
    })

    it('Tasklist Revision Review 补充要求提交 respond decision', async () => {
        const onResumeDecision = vi.fn().mockResolvedValue(true)

        render(<HumanReviewComposerPanel pendingInterrupt={createRevisionPendingInterrupt()} onResumeDecision={onResumeDecision} />)

        fireEvent.click(screen.getByRole('button', { name: /补充要求/ }))
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '修订时额外检查恢复流程' } })
        fireEvent.click(screen.getByRole('button', { name: '提交修订要求' }))

        await waitFor(() => {
            expect(onResumeDecision).toHaveBeenCalledWith({
                feedback: '修订时额外检查恢复流程',
                type: 'respond',
            })
        })
    })

    it('Tasklist Revision Review 修订说明不默认占正文空间，终止本轮直接提交', async () => {
        const onResumeDecision = vi.fn().mockResolvedValue(true)

        render(<HumanReviewComposerPanel pendingInterrupt={createRevisionPendingInterrupt()} onResumeDecision={onResumeDecision} />)

        fireEvent.click(screen.getByRole('button', { name: '查看修订说明' }))

        await waitFor(() => {
            expect(screen.getByText(/最多两轮受控修订/)).toBeTruthy()
        })

        fireEvent.click(screen.getByRole('button', { name: '终止本轮' }))

        await waitFor(() => {
            expect(onResumeDecision).toHaveBeenCalledWith({ type: 'reject' })
        })
    })

    /*
    it('Strategy Review current strategy submit shows loading state', async () => {
        let resolveDecision: ((value: boolean) => void) | null = null
        const onResumeDecision = vi.fn().mockImplementation(
            () =>
                new Promise<boolean>(resolve => {
                    resolveDecision = resolve
                })
        )

        render(<HumanReviewComposerPanel pendingInterrupt={createStrategyPendingInterrupt()} onResumeDecision={onResumeDecision} />)

        fireEvent.click(screen.getByRole('button', { name: /鎸夊綋鍓嶇瓥鐣ョ户缁?/ }))

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /鎸夊綋鍓嶇瓥鐣ョ户缁?/ }).getAttribute('aria-busy')).toBe('true')
            expect(screen.getByRole('button', { name: /鎸夊綋鍓嶇瓥鐣ョ户缁?/ }).querySelector('svg.animate-spin')).toBeTruthy()
        })

        resolveDecision?.(true)

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /鎸夊綋鍓嶇瓥鐣ョ户缁?/ }).getAttribute('aria-busy')).toBeNull()
            expect(screen.getByRole('button', { name: /鎸夊綋鍓嶇瓥鐣ョ户缁?/ }).querySelector('svg.animate-spin')).toBeNull()
        })
    })
    */
})
