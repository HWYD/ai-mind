import './globals.css'

import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
    title: 'AI Mind',
    description: '基于 LangChain.js 与 Ollama 的AI Runtime 实验台：支持普通问答、深度思考、Tool 调用与多来源上下文读取。',
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="zh-CN" className="font-sans">
            <body className="min-h-screen antialiased">{children}</body>
        </html>
    )
}
