/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AgentTextArtifactPanel } from '@/components/chat/message-list/parts/agent-text-artifact-panel'
import type { AgentTextArtifactViewModel } from '@/lib/ai/types/message'

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

function createArtifact(overrides: Partial<AgentTextArtifactViewModel> = {}): AgentTextArtifactViewModel {
    return {
        artifactId: 'artifact-tasklist',
        artifactKind: 'tasklist',
        artifactType: 'text',
        content: '# v0.1.1 Tasklist\n\n## Step 1\n- [ ] 实现 artifact',
        format: 'markdown',
        status: 'completed',
        title: 'v0.1.1 任务清单草稿',
        ...overrides,
    }
}

describe('AgentTextArtifactPanel', () => {
    it('渲染 tasklist Markdown 产物', () => {
        const { container } = render(<AgentTextArtifactPanel artifact={createArtifact()} />)

        expect(screen.getByText('v0.1.1 任务清单草稿')).toBeTruthy()
        expect(screen.getByText('任务清单')).toBeTruthy()
        expect(container.textContent).toContain('Step 1')
        expect(container.textContent).toContain('实现 artifact')
    })

    it('复制 artifact 全文', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        vi.stubGlobal('navigator', {
            clipboard: {
                writeText,
            },
        })

        render(<AgentTextArtifactPanel artifact={createArtifact()} />)
        fireEvent.click(screen.getByLabelText('复制产物'))

        await waitFor(() => {
            expect(writeText).toHaveBeenCalledWith('# v0.1.1 Tasklist\n\n## Step 1\n- [ ] 实现 artifact')
        })
    })

    it('failed 状态显示错误提示', () => {
        render(<AgentTextArtifactPanel artifact={createArtifact({ content: '', error: 'artifact failed', status: 'failed' })} />)

        expect(screen.getByText('artifact failed')).toBeTruthy()
    })
})
