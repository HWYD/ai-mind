import './globals.css'

import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'InstantMind',
    description: '基于 LangChain.js 与 Ollama 的最小化聊天实践项目。',
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="zh-CN">
            <body className="min-h-screen antialiased">{children}</body>
        </html>
    )
}
