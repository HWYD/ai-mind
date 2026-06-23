'use client'

import type { Editor } from '@tiptap/react'
import { useCallback, useState } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { hasComposerSemanticInput, resolveComposerSubmissionText } from '@/lib/ai/composer-submission'
import { type ChatModel, type ChatModelGroup } from '@/lib/ai/models'
import type { ChatSkillMode, ChatStatus } from '@/lib/ai/types/chat'

import type { ComposerDisplaySegment, ComposerPayload } from './composer-types'
import { ComposerEditor } from './editor/composer-editor'
import { serializeComposerDisplaySegments, serializeComposerPayload } from './editor/composer-serialization'
import { ComposerToolbar } from './toolbar/composer-toolbar'

const footerTextBySkillMode: Record<ChatSkillMode, string> = {
    auto: '当前只保留本会话内的多轮上下文。',
    utility: '实用模式适合计算、时间日期、文本转换和单位换算。',
    reader: '读取模式当前支持天气与 remote MCP 上下文；docs 文档引用将在 Composer 中承接。',
}

export function ChatComposer({
    enableReasoning,
    hasAvailableModels,
    isModelLoading,
    model,
    modelError,
    modelGroups,
    onEnableReasoningChange,
    onModelChange,
    onSkillModeChange,
    onStop,
    onSubmit,
    skillMode,
    status,
}: {
    enableReasoning: boolean
    hasAvailableModels: boolean
    isModelLoading: boolean
    model: ChatModel
    modelError: string | null
    modelGroups: ChatModelGroup[]
    onEnableReasoningChange: (enabled: boolean) => void
    onModelChange: (model: ChatModel) => void
    onSkillModeChange: (mode: ChatSkillMode) => void
    onStop: () => void
    onSubmit: (value: string, composer?: ComposerPayload, displaySegments?: ComposerDisplaySegment[]) => Promise<boolean> | boolean
    skillMode: ChatSkillMode
    status: ChatStatus
}) {
    const [editor, setEditor] = useState<Editor | null>(null)
    const [input, setInput] = useState('')
    const [composerDraft, setComposerDraft] = useState<ComposerPayload | undefined>()
    const canSubmit = Boolean(input.trim() || hasComposerSemanticInput(composerDraft))
    const sendDisabled = status === 'submitted' || (status !== 'streaming' && (!canSubmit || !hasAvailableModels || isModelLoading))
    const footerText =
        status === 'streaming'
            ? '正在生成回答，可点击右侧按钮停止。'
            : modelError
              ? modelError
              : isModelLoading
                ? '正在加载可用模型...'
                : !hasAvailableModels
                  ? '当前没有可用模型，暂时无法发送消息。'
                  : footerTextBySkillMode[skillMode]

    const handleSubmit = useCallback(
        async (value = input) => {
            if (status === 'streaming') {
                onStop()
                return
            }

            if (status === 'submitted') {
                return
            }

            const composer = editor ? serializeComposerPayload(editor) : undefined
            const displaySegments = editor ? serializeComposerDisplaySegments(editor) : undefined
            const submitValue = resolveComposerSubmissionText(value, composer)

            if (!submitValue) {
                return
            }

            const accepted = await onSubmit(submitValue, composer, displaySegments)

            if (accepted) {
                setInput('')
                setComposerDraft(undefined)
                editor?.commands.clearContent()
            }
        },
        [editor, input, onStop, onSubmit, status]
    )

    function handleInsertTrigger(trigger: '@' | '/') {
        if (!editor) {
            return
        }

        if (trigger === '/') {
            const { from } = editor.state.selection
            const previousCharacter = from > 0 ? editor.state.doc.textBetween(from - 1, from, '\n', '\n') : ''
            const slashTrigger = !previousCharacter || /\s/.test(previousCharacter) ? '/' : ' /'

            editor.chain().focus().insertContent(slashTrigger).run()
            return
        }

        editor.chain().focus().insertContent('@').run()
    }

    return (
        <form
            onSubmit={event => {
                event.preventDefault()
                handleSubmit()
            }}
            className="mt-auto"
        >
            <Card className="rounded-3xl border-border/70 bg-card py-0 shadow-xl shadow-black/[0.06] transition-all focus-within:border-[var(--composer-focus)] focus-within:shadow-[0_18px_55px_rgba(37,99,235,0.12)]">
                <CardContent className="space-y-4 px-5 py-4">
                    <ComposerEditor
                        value={input}
                        status={status}
                        onChange={setInput}
                        onComposerChange={setComposerDraft}
                        onEditorChange={setEditor}
                        onSubmit={handleSubmit}
                        onStop={onStop}
                    />
                    <ComposerToolbar
                        status={status}
                        skillMode={skillMode}
                        modelGroups={modelGroups}
                        model={model}
                        isModelLoading={isModelLoading}
                        enableReasoning={enableReasoning}
                        sendDisabled={sendDisabled}
                        onInsertTrigger={handleInsertTrigger}
                        onSkillModeChange={onSkillModeChange}
                        onModelChange={onModelChange}
                        onEnableReasoningChange={onEnableReasoningChange}
                        onSubmit={handleSubmit}
                        onStop={onStop}
                    />
                </CardContent>
            </Card>

            <div className="hidden sm:block mt-2.5 text-center">
                <span className="text-xs text-muted-foreground">{footerText}</span>
            </div>
        </form>
    )
}
