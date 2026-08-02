// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ImageBriefPart } from '@/components/chat/message-list/parts/image-brief-part'
import { ImageResultPart } from '@/components/chat/message-list/parts/image-result-part'
import type { ImageBriefPart as ImageBriefPartModel, ImageResultPart as ImageResultPartModel } from '@/lib/ai/types/message'

const createObjectUrlMock = vi.fn(() => 'blob:preview')
const revokeObjectUrlMock = vi.fn()

function createBrief(): ImageBriefPartModel {
    return {
        id: 'brief-1',
        runId: 'run-1',
        type: 'image-brief',
        summary: {
            assumptions: [],
            avoid: [],
            intent: '插画',
            mustInclude: ['围巾'],
            scene: '窗边',
            subjects: ['橘猫'],
        },
    }
}

function createResult(): ImageResultPartModel {
    return {
        contentPath: '/api/chat/runs/run-1/image',
        expiresAt: '2099-01-01T00:00:00.000Z',
        id: 'result-1',
        runId: 'run-1',
        suggestedFileName: 'cat.jpg',
        temporary: true,
        type: 'image-result',
    }
}

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('image message parts', () => {
    it('renders only the public image generation summary', () => {
        render(<ImageBriefPart part={createBrief()} />)

        expect(screen.getByText('图像生成摘要')).toBeTruthy()
        expect(screen.queryByText('只读')).toBeNull()
        expect(screen.getByText('橘猫')).toBeTruthy()
        expect(screen.queryByText(/optimizedPrompt|providerUrl/i)).toBeNull()
    })

    it('fetches the same-origin content once, reuses the Blob URL for preview/download, and revokes it on unmount', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response('image', { status: 200, headers: { 'content-type': 'image/jpeg' } }))
        vi.stubGlobal('fetch', fetchMock)
        vi.stubGlobal('URL', {
            ...URL,
            createObjectURL: createObjectUrlMock,
            revokeObjectURL: revokeObjectUrlMock,
        })

        const { unmount } = render(<ImageResultPart brief={createBrief()} enabled part={createResult()} />)

        await waitFor(() => expect(screen.getByRole('img', { name: 'AI Mind 生成的图片：橘猫，场景：窗边' })).toBeTruthy())
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith('/api/chat/runs/run-1/image', { signal: expect.any(AbortSignal) })
        expect(screen.getByRole('link', { name: '下载生成图片' }).getAttribute('href')).toBe('blob:preview')
        expect(screen.getByText('临时结果')).toBeTruthy()

        unmount()
        expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:preview')
    })

    it('shows a semantic expiry alert without fetching expired results', async () => {
        vi.stubGlobal('fetch', vi.fn())

        render(<ImageResultPart brief={createBrief()} enabled part={{ ...createResult(), expiresAt: '2000-01-01T00:00:00.000Z' }} />)

        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('临时图片已过期'))
        expect(screen.getByText(/重新发起 \/image/)).toBeTruthy()
        expect(fetch).not.toHaveBeenCalled()
    })
})
