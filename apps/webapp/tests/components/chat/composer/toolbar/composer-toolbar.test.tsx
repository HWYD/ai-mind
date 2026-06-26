/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ComposerToolbar } from '@/components/chat/composer/toolbar/composer-toolbar'
import type { ChatModelGroup } from '@/lib/ai/models'

const modelGroups: ChatModelGroup[] = [
    {
        id: 'online',
        label: '线上模型',
        models: [
            { id: 'qwen/qwen3.6-plus', label: 'qwen3.6-plus', provider: 'qwen' },
            { id: 'deepseek/deepseek-v4-pro', label: 'deepseek-v4-pro', provider: 'deepseek' },
        ],
    },
    {
        id: 'local',
        label: '本地模型',
        models: [{ id: 'ollama/qwen3-8b', label: 'qwen3-8b', provider: 'ollama' }],
    },
]

describe('ComposerToolbar model selector', () => {
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
    })

    it('按线上模型 / 本地模型分组展示，并在切换模型时回调 onModelChange', async () => {
        const onModelChange = vi.fn()

        render(
            <ComposerToolbar
                enableReasoning
                isModelLoading={false}
                model="qwen/qwen3.6-plus"
                modelGroups={modelGroups}
                onEnableReasoningChange={vi.fn()}
                onInsertTrigger={vi.fn()}
                onModelChange={onModelChange}
                onSkillModeChange={vi.fn()}
                onStop={vi.fn()}
                onSubmit={vi.fn()}
                sendDisabled={false}
                skillMode="auto"
                status="ready"
            />
        )

        fireEvent.pointerDown(screen.getByRole('button', { name: '选择模型' }), {
            button: 0,
            ctrlKey: false,
            pointerType: 'mouse',
        })

        const menu = await waitFor(() => screen.getByRole('menu'))

        expect(within(menu).getByText('线上模型')).toBeTruthy()
        expect(within(menu).getByText('本地模型')).toBeTruthy()
        expect(within(menu).getByRole('menuitemradio', { name: 'qwen3.6-plus' })).toBeTruthy()
        expect(within(menu).getByRole('menuitemradio', { name: 'deepseek-v4-pro' })).toBeTruthy()
        expect(within(menu).getByRole('menuitemradio', { name: 'qwen3-8b' })).toBeTruthy()
        expect(
            within(menu).getByRole('menuitemradio', { name: 'qwen3.6-plus' }).querySelector<SVGElement>('[data-model-icon]')?.style.color
        ).toBe('var(--color-violet-500)')
        expect(
            within(menu).getByRole('menuitemradio', { name: 'deepseek-v4-pro' }).querySelector<SVGElement>('[data-model-icon]')?.style.color
        ).toBe('var(--color-sky-500)')

        fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'qwen3-8b' }))

        expect(onModelChange).toHaveBeenCalledWith('ollama/qwen3-8b')
    })

    it('打开模型选择器时不锁住 body 滚动，避免页面滚动条抖动', async () => {
        render(
            <ComposerToolbar
                enableReasoning
                isModelLoading={false}
                model="qwen/qwen3.6-plus"
                modelGroups={modelGroups}
                onEnableReasoningChange={vi.fn()}
                onInsertTrigger={vi.fn()}
                onModelChange={vi.fn()}
                onSkillModeChange={vi.fn()}
                onStop={vi.fn()}
                onSubmit={vi.fn()}
                sendDisabled={false}
                skillMode="auto"
                status="ready"
            />
        )

        fireEvent.pointerDown(screen.getByRole('button', { name: /选择模型/ }), {
            button: 0,
            ctrlKey: false,
            pointerType: 'mouse',
        })

        await waitFor(() => screen.getByRole('menu'))

        expect(document.body.hasAttribute('data-scroll-locked')).toBe(false)
    })

    it('disabled 时发送按钮锁定并使用弱化样式', () => {
        render(
            <ComposerToolbar
                disabled
                enableReasoning
                isModelLoading={false}
                model="qwen/qwen3.6-plus"
                modelGroups={modelGroups}
                onEnableReasoningChange={vi.fn()}
                onInsertTrigger={vi.fn()}
                onModelChange={vi.fn()}
                onSkillModeChange={vi.fn()}
                onStop={vi.fn()}
                onSubmit={vi.fn()}
                sendDisabled
                skillMode="auto"
                status="ready"
            />
        )

        const sendButton = screen.getByRole('button', { name: '发送消息' })

        expect((sendButton as HTMLButtonElement).disabled).toBe(true)
        expect(sendButton.className).toContain('bg-muted')
    })
})
