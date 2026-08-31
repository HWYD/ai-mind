// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ImageBriefPart } from '@/components/chat/message-list/parts/image-brief-part'
import { ImageResultPart } from '@/components/chat/message-list/parts/image-result-part'
import type { ImageBriefPart as ImageBriefPartModel, ImageResultPart as ImageResultPartModel } from '@/lib/ai/types/message'

const localImageCacheMocks = vi.hoisted(() => ({
    readLocalImageResultCache: vi.fn(),
    writeLocalImageResultCache: vi.fn(),
}))
const createObjectUrlMock = vi.fn(() => 'blob:preview')
const revokeObjectUrlMock = vi.fn()

vi.mock('@/components/instamind/local-chat-persistence/store', () => localImageCacheMocks)

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

beforeEach(() => {
    localImageCacheMocks.readLocalImageResultCache.mockResolvedValue({ status: 'missing' })
    localImageCacheMocks.writeLocalImageResultCache.mockResolvedValue({ status: 'written' })
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

        const { unmount } = render(<ImageResultPart brief={createBrief()} conversationId="conv-1" enabled part={createResult()} />)

        await waitFor(() => expect(screen.getByRole('img', { name: 'AI Mind 生成的图片：橘猫，场景：窗边' })).toBeTruthy())
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith('/api/chat/runs/run-1/image', { signal: expect.any(AbortSignal) })
        expect(screen.getByRole('link', { name: '下载生成图片' }).getAttribute('href')).toBe('blob:preview')
        const localCacheBadge = screen.getByText('本地缓存')
        expect(localCacheBadge).toBeTruthy()
        expect(screen.queryByText('已保存在当前浏览器；清除本地数据或缓存淘汰后将无法恢复。')).toBeNull()
        fireEvent.pointerEnter(localCacheBadge, { pointerType: 'mouse' })
        await waitFor(() => expect(screen.getByText('已保存在当前浏览器；清除本地数据或缓存淘汰后将无法恢复。')).toBeTruthy())
        expect(localImageCacheMocks.writeLocalImageResultCache).toHaveBeenCalledWith(
            expect.objectContaining({ conversationId: 'conv-1', mimeType: 'image/jpeg', runId: 'run-1' })
        )

        unmount()
        expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:preview')
    })

    it('keeps the result card and flow placeholder visible until the Blob is ready', async () => {
        let resolveResponse: (response: Response) => void = () => undefined
        const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(resolve => (resolveResponse = resolve)))
        vi.stubGlobal('fetch', fetchMock)
        vi.stubGlobal('URL', {
            ...URL,
            createObjectURL: createObjectUrlMock,
            revokeObjectURL: revokeObjectUrlMock,
        })

        const { container } = render(<ImageResultPart brief={createBrief()} enabled part={createResult()} />)

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
        expect(screen.getByText('生成结果')).toBeTruthy()
        expect(screen.getByText('临时结果')).toBeTruthy()
        expect(container.querySelector('[data-slot="image-generation-preview-placeholder"]')).toBeTruthy()
        const loadingFooter = container.querySelector('[data-slot="card-footer"]')
        expect(loadingFooter).toBeTruthy()
        expect(loadingFooter?.querySelector('[data-slot="image-result-action-reserve"]')).toBeTruthy()
        expect(within(loadingFooter as HTMLElement).queryByRole('link', { name: '下载生成图片' })).toBeNull()
        expect(screen.queryByText('图片读取成功后会保存在当前浏览器。')).toBeNull()
        expect(screen.queryByText(/正在准备临时图片预览|图像生成完成后将准备临时预览/)).toBeNull()

        resolveResponse(new Response('image', { status: 200, headers: { 'content-type': 'image/jpeg' } }))

        await waitFor(() => expect(screen.getByRole('img')).toBeTruthy())
        expect(container.querySelector('[data-slot="image-generation-preview-placeholder"]')).toBeNull()
        expect(container.querySelector('[data-slot="card-footer"]')).toBeTruthy()
        expect(screen.getByRole('link', { name: '下载生成图片' })).toBeTruthy()
    })

    it('uses a cached Blob without refetching an expired result', async () => {
        const cachedBlob = new Blob(['cached'], { type: 'image/jpeg' })
        localImageCacheMocks.readLocalImageResultCache.mockResolvedValue({
            data: {
                blob: cachedBlob,
                byteLength: cachedBlob.size,
                conversationId: 'conv-1',
                createdAt: '2026-07-05T10:00:00.000Z',
                lastAccessedAt: '2026-07-05T10:00:00.000Z',
                mimeType: 'image/jpeg',
                runId: 'run-1',
            },
            status: 'valid',
        })
        vi.stubGlobal('fetch', vi.fn())
        vi.stubGlobal('URL', {
            ...URL,
            createObjectURL: createObjectUrlMock,
            revokeObjectURL: revokeObjectUrlMock,
        })

        render(<ImageResultPart brief={createBrief()} enabled part={{ ...createResult(), expiresAt: '2000-01-01T00:00:00.000Z' }} />)

        await waitFor(() => expect(screen.getByRole('img')).toBeTruthy())
        expect(fetch).not.toHaveBeenCalled()
        expect(screen.getByText('本地缓存')).toBeTruthy()
    })

    it('shows an expired placeholder without fetching when neither cache nor temporary result is available', async () => {
        vi.stubGlobal('fetch', vi.fn())

        const { container } = render(
            <ImageResultPart brief={createBrief()} enabled part={{ ...createResult(), expiresAt: '2000-01-01T00:00:00.000Z' }} />
        )

        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('图片已失效'))
        expect(screen.getByText(/重新发起 \/image/)).toBeTruthy()
        expect(fetch).not.toHaveBeenCalled()
        expect(container.querySelector('[data-slot="aspect-ratio"]')).toBeTruthy()
        expect(container.querySelector('[data-slot="card-footer"] [data-slot="image-result-action-reserve"]')).toBeTruthy()
        expect(screen.queryByRole('link', { name: '下载生成图片' })).toBeNull()
    })

    it('keeps a proportional preview frame and reserved footer when the image request fails', async () => {
        vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('network unavailable')))

        const { container } = render(<ImageResultPart brief={createBrief()} enabled part={createResult()} />)

        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('图片预览不可用'))
        expect(container.querySelector('[data-slot="aspect-ratio"]')).toBeTruthy()
        expect(container.querySelector('[data-slot="card-footer"] [data-slot="image-result-action-reserve"]')).toBeTruthy()
        expect(screen.queryByRole('link', { name: '下载生成图片' })).toBeNull()
    })
})
