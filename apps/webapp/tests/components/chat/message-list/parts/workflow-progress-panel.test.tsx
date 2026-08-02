/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { WorkflowProgressPanel } from '@/components/chat/message-list/parts/workflow-progress-panel'
import type { WorkflowProgressPart } from '@/lib/ai/types/message'

afterEach(() => {
    cleanup()
})

function createWorkflowProgressPart(overrides: Partial<WorkflowProgressPart> = {}): WorkflowProgressPart {
    return {
        id: 'image-workflow-progress',
        type: 'workflow-progress',
        workflowId: 'image-run-1',
        workflowKind: 'image_generation',
        title: '图像生成',
        status: 'running',
        steps: [
            {
                id: 'accepted',
                title: '已接收生图请求',
                status: 'completed',
                details: [],
                durationMs: 1200,
            },
            {
                id: 'brief',
                title: '正在整理画面需求',
                status: 'running',
                summary: '正在生成安全的图像描述。',
                details: [],
            },
        ],
        visibility: 'expanded',
        ...overrides,
    }
}

describe('WorkflowProgressPanel', () => {
    it('retains the loading spinner only for the running step', () => {
        const { container } = render(<WorkflowProgressPanel part={createWorkflowProgressPart()} />)

        expect(screen.getByText('正在图像生成')).toBeTruthy()
        expect(screen.getByRole('button').querySelectorAll('svg')).toHaveLength(1)
        expect(container.querySelectorAll('svg.animate-spin')).toHaveLength(1)
        expect(screen.getByRole('status').textContent).toContain('正在整理画面需求')
        expect(screen.queryByText('进行中')).toBeNull()
        expect(screen.getByText('已接收生图请求')).toBeTruthy()
        expect(container.querySelectorAll('[data-slot="marker"][data-variant="border"]')).toHaveLength(2)
    })

    it('keeps completed workflow details collapsed until the header is expanded', () => {
        render(
            <WorkflowProgressPanel
                part={createWorkflowProgressPart({
                    status: 'completed',
                    summary: '已处理 41s',
                    visibility: 'collapsed',
                    steps: [
                        {
                            id: 'accepted',
                            title: '已接收生图请求',
                            status: 'completed',
                            details: ['已完成请求校验。'],
                            durationMs: 1200,
                        },
                    ],
                })}
            />
        )

        expect(screen.queryByText('已完成请求校验。')).toBeNull()

        fireEvent.click(screen.getByRole('button'))

        expect(screen.getByText('已完成请求校验。')).toBeTruthy()
        expect(screen.queryByText('已完成')).toBeNull()
    })

    it('uses an alert for terminal failure guidance', () => {
        render(
            <WorkflowProgressPanel
                part={createWorkflowProgressPart({
                    status: 'failed',
                    failureMessage: '暂时无法生成图片，请稍后重试。',
                })}
            />
        )

        expect(screen.getByRole('alert').textContent).toContain('暂时无法生成图片，请稍后重试。')
        expect(screen.queryByText('失败')).toBeNull()
    })
})
