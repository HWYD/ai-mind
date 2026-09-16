/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ComposerToolbar } from '@/components/chat/composer/toolbar/composer-toolbar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { modelCatalog } from '@/lib/ai/model-provider/catalog/model-catalog'
import type { ChatModelGroup } from '@/lib/ai/models'

function createPublicModel(modelId: string) {
    const item = modelCatalog.find(candidate => candidate.id === modelId)

    if (!item) {
        throw new Error(`Model catalog item not found in test: ${modelId}`)
    }

    return {
        family: item.family,
        id: item.id,
        label: item.label,
        provider: item.provider,
    }
}

const modelGroups: ChatModelGroup[] = [
    {
        id: 'online',
        label: '线上模型',
        models: [
            // 注意：这里从当前 catalog 派生 provider，避免把 deepseek family 固定绑到某个供应商。
            createPublicModel('qwen/qwen3.6-flash'),
            createPublicModel('deepseek/deepseek-v4-pro'),
            createPublicModel('doubao/doubao-seed-2.0-pro'),
            createPublicModel('doubao/Kimi-K2.6'),
        ],
    },
    {
        id: 'local',
        label: '本地模型',
        models: [createPublicModel('ollama/qwen3-8b')],
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

    it('does not render manual skill mode choices', () => {
        render(
            <ComposerToolbar
                enableReasoning
                isModelLoading={false}
                model="qwen/qwen3.6-flash"
                modelGroups={modelGroups}
                onEnableReasoningChange={vi.fn()}
                onInsertTrigger={vi.fn()}
                onModelChange={vi.fn()}
                onStop={vi.fn()}
                onSubmit={vi.fn()}
                sendDisabled={false}
                status="ready"
            />
        )

        expect(screen.queryByLabelText('切换到 自动：根据问题自动选择合适能力')).toBeNull()
        expect(screen.queryByLabelText('切换到 工具技能：优先使用计算、时间、文本处理与天气等工具能力')).toBeNull()
        expect(screen.queryByLabelText('切换到 阅读技能：优先消费 demo 文档、项目上下文和 MCP 读取能力')).toBeNull()
    })

    it('按线上模型和本地模型分组展示，并在切换模型时回调 onModelChange', async () => {
        const onModelChange = vi.fn()

        render(
            <ComposerToolbar
                enableReasoning
                isModelLoading={false}
                model="qwen/qwen3.6-flash"
                modelGroups={modelGroups}
                onEnableReasoningChange={vi.fn()}
                onInsertTrigger={vi.fn()}
                onModelChange={onModelChange}
                onStop={vi.fn()}
                onSubmit={vi.fn()}
                sendDisabled={false}
                status="ready"
            />
        )

        fireEvent.pointerDown(screen.getByRole('button', { name: '选择模型' }), {
            button: 0,
            ctrlKey: false,
            pointerType: 'mouse',
        })

        const menu = await waitFor(() => screen.getByRole('menu'))
        const onlineQwenItem = within(menu).getByRole('menuitemradio', { name: 'qwen3.6-flash' })
        const deepseekItem = within(menu).getByRole('menuitemradio', { name: 'deepseek-v4-pro' })
        const doubaoItem = within(menu).getByRole('menuitemradio', { name: 'doubao-seed-2.0-pro' })
        const kimiItem = within(menu).getByRole('menuitemradio', { name: 'Kimi-K2.6' })
        const localQwenItem = within(menu).getByRole('menuitemradio', { name: 'qwen3-8b' })
        const onlineQwenIcon = onlineQwenItem.querySelector<SVGElement>('[data-model-icon]')
        const deepseekIcon = deepseekItem.querySelector<SVGElement>('[data-model-icon]')
        const doubaoIcon = doubaoItem.querySelector<SVGElement>('[data-model-icon]')
        const kimiIcon = kimiItem.querySelector<SVGElement>('[data-model-icon]')
        const localQwenIcon = localQwenItem.querySelector<SVGElement>('[data-model-icon]')

        expect(within(menu).getByText('线上模型')).toBeTruthy()
        expect(within(menu).getByText('本地模型')).toBeTruthy()
        expect(onlineQwenItem).toBeTruthy()
        expect(deepseekItem).toBeTruthy()
        expect(doubaoItem).toBeTruthy()
        expect(kimiItem).toBeTruthy()
        expect(localQwenItem).toBeTruthy()
        expect(onlineQwenIcon?.style.color).toBe('var(--color-violet-500)')
        expect(onlineQwenIcon?.dataset.modelIcon).toBe('qwen')
        expect(deepseekIcon?.style.color).toBe('var(--color-sky-500)')
        expect(localQwenIcon?.style.color).toBe('var(--color-violet-500)')
        expect(localQwenIcon?.dataset.modelIcon).toBe('qwen')
        expect(doubaoIcon?.dataset.modelIcon).toBe('doubao')
        expect(kimiIcon?.dataset.modelIcon).toBe('kimi')
        expect(doubaoIcon?.style.color).toBe('var(--color-amber-500)')
        expect(kimiIcon?.style.color).toBe('var(--color-rose-500)')

        fireEvent.click(localQwenItem)

        expect(onModelChange).toHaveBeenCalledWith('ollama/qwen3-8b')
    })

    it('图标颜色在 hover 时保持固定，不跟随菜单项文字变色', async () => {
        render(
            <ComposerToolbar
                enableReasoning
                isModelLoading={false}
                model="doubao/Kimi-K2.6"
                modelGroups={modelGroups}
                onEnableReasoningChange={vi.fn()}
                onInsertTrigger={vi.fn()}
                onModelChange={vi.fn()}
                onStop={vi.fn()}
                onSubmit={vi.fn()}
                sendDisabled={false}
                status="ready"
            />
        )

        fireEvent.pointerDown(screen.getByRole('button', { name: '选择模型' }), {
            button: 0,
            ctrlKey: false,
            pointerType: 'mouse',
        })

        const menu = await waitFor(() => screen.getByRole('menu'))
        const kimiItem = within(menu).getByRole('menuitemradio', { name: 'Kimi-K2.6' })
        const kimiIcon = kimiItem.querySelector<SVGElement>('[data-model-icon]')

        expect(kimiIcon?.style.color).toBe('var(--color-rose-500)')

        fireEvent.mouseEnter(kimiItem)

        expect(kimiIcon?.style.color).toBe('var(--color-rose-500)')
    })

    it('打开模型选择器时不锁住 body 滚动，避免页面滚动条抖动', async () => {
        render(
            <ComposerToolbar
                enableReasoning
                isModelLoading={false}
                model="deepseek/deepseek-v4-pro"
                modelGroups={modelGroups}
                onEnableReasoningChange={vi.fn()}
                onInsertTrigger={vi.fn()}
                onModelChange={vi.fn()}
                onStop={vi.fn()}
                onSubmit={vi.fn()}
                sendDisabled={false}
                status="ready"
            />
        )

        fireEvent.pointerDown(screen.getByRole('button', { name: /选择模型/ }), {
            button: 0,
            ctrlKey: false,
            pointerType: 'mouse',
        })

        await waitFor(() => screen.getByRole('menu'))

        expect(screen.getByRole('button', { name: '选择模型' }).querySelector<SVGElement>('[data-model-icon]')?.style.color).toBe(
            'var(--color-sky-500)'
        )

        expect(document.body.hasAttribute('data-scroll-locked')).toBe(false)
    })

    it('disabled 时发送按钮锁定并使用弱化样式', () => {
        render(
            <ComposerToolbar
                disabled
                enableReasoning
                isModelLoading={false}
                model="qwen/qwen3.6-flash"
                modelGroups={modelGroups}
                onEnableReasoningChange={vi.fn()}
                onInsertTrigger={vi.fn()}
                onModelChange={vi.fn()}
                onStop={vi.fn()}
                onSubmit={vi.fn()}
                sendDisabled
                status="ready"
            />
        )

        const sendButton = screen.getByRole('button', { name: '发送消息' })

        expect((sendButton as HTMLButtonElement).disabled).toBe(true)
        expect(sendButton.className).toContain('bg-muted')
    })

    it('model selector keeps the compact mobile classes without changing desktop classes', () => {
        render(
            <ComposerToolbar
                enableReasoning
                isModelLoading={false}
                model="qwen/qwen3.6-flash"
                modelGroups={modelGroups}
                onEnableReasoningChange={vi.fn()}
                onInsertTrigger={vi.fn()}
                onModelChange={vi.fn()}
                onStop={vi.fn()}
                onSubmit={vi.fn()}
                sendDisabled={false}
                status="ready"
            />
        )

        const modelButton = screen.getByRole('button', { name: '选择模型' })

        expect(modelButton.className).toContain('h-8.5')
        expect(modelButton.className).toContain('text-xs')
        expect(modelButton.className).toContain('sm:h-10')
        expect(modelButton.className).toContain('sm:text-sm')
    })

    it('在能力自动选择模式下显示无数字的聊天记忆占用圆环', () => {
        const { container } = render(
            <TooltipProvider>
                <ComposerToolbar
                    contextUsage={{ effectiveWindowTokens: 128000, usedPercent: 13 }}
                    enableReasoning
                    isModelLoading={false}
                    model="qwen/qwen3.6-flash"
                    modelGroups={modelGroups}
                    onEnableReasoningChange={vi.fn()}
                    onInsertTrigger={vi.fn()}
                    onModelChange={vi.fn()}
                    onStop={vi.fn()}
                    onSubmit={vi.fn()}
                    sendDisabled={false}
                    status="ready"
                />
            </TooltipProvider>
        )

        const indicator = screen.getByLabelText('聊天上下文已使用 13%（128K）')

        expect(container.querySelector('[data-slot="toggle-group"]')).toBeNull()
        expect(indicator.textContent).toBe('')
    })
})
