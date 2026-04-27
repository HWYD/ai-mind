import './globals.css'

import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'AI Mind',
    description: '基于 LangChain.js 与 Ollama 的最小运行时实验项目。',
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
