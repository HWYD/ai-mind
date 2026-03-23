'use client'

import type { KeyboardEvent } from 'react'

import type { ChatStatus } from '../../lib/ai/types/chat'

export function ChatInputForm({
    input,
    status,
    onInputChange,
    onSubmit,
    onStop,
}: {
    input: string
    status: ChatStatus
    onInputChange: (value: string) => void
    onSubmit: () => void | Promise<void>
    onStop: () => void
}) {
    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key !== 'Enter' || event.shiftKey) {
            return
        }

        event.preventDefault()

        if (status === 'streaming') {
            onStop()
            return
        }

        void onSubmit()
    }

    const sendDisabled = status === 'submitted' || (status !== 'streaming' && !input.trim())

    return (
        <form
            onSubmit={event => {
                event.preventDefault()

                if (status === 'streaming') {
                    onStop()
                } else {
                    void onSubmit()
                }
            }}
            className="mt-auto"
        >
            <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <textarea
                    value={input}
                    onChange={event => onInputChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入你的问题，Enter 发送，Shift + Enter 换行"
                    rows={3}
                    className="min-h-[84px] w-full resize-none border-none bg-transparent text-base leading-7 text-slate-900 outline-none placeholder:text-slate-400"
                />

                <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">
                        {status === 'streaming' ? '正在生成回答，可点击右侧停止。' : '当前只保留本会话内的多轮上下文。'}
                    </span>

                    <button
                        type="submit"
                        aria-label={status === 'streaming' ? 'Stop generation' : 'Send message'}
                        disabled={sendDisabled}
                        className={`grid h-11 w-11 place-items-center rounded-full border-none text-lg font-semibold text-white transition ${
                            status === 'streaming' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-slate-900 hover:bg-slate-800'
                        } ${sendDisabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}
                    >
                        {status === 'streaming' ? '■' : '↑'}
                    </button>
                </div>
            </div>
        </form>
    )
}
