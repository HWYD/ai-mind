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
            style={{
                marginTop: 'auto',
            }}
        >
            <div
                style={{
                    border: '1px solid #dbe4ef',
                    background: '#ffffff',
                    borderRadius: '24px',
                    padding: '16px 18px',
                    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.06)',
                }}
            >
                <textarea
                    value={input}
                    onChange={event => onInputChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入你的问题，Enter 发送，Shift + Enter 换行"
                    rows={3}
                    style={{
                        width: '100%',
                        resize: 'none',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: '#0f172a',
                        fontSize: '16px',
                        lineHeight: 1.6,
                        minHeight: '84px',
                    }}
                />

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        marginTop: '12px',
                    }}
                >
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                        {status === 'streaming' ? '正在生成回答，可点击右侧停止。' : '当前只保留本会话内的多轮上下文。'}
                    </span>

                    <button
                        type="submit"
                        aria-label={status === 'streaming' ? 'Stop generation' : 'Send message'}
                        disabled={sendDisabled}
                        style={{
                            width: '42px',
                            height: '42px',
                            border: 'none',
                            borderRadius: '999px',
                            backgroundColor: status === 'streaming' ? '#ef4444' : '#111827',
                            color: '#ffffff',
                            cursor: sendDisabled ? 'not-allowed' : 'pointer',
                            fontSize: '20px',
                            fontWeight: 700,
                            display: 'grid',
                            placeItems: 'center',
                            opacity: sendDisabled ? 0.55 : 1,
                        }}
                    >
                        {status === 'streaming' ? '■' : '↑'}
                    </button>
                </div>
            </div>
        </form>
    )
}
