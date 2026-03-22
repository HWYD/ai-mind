import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'AI 应用 - WebApp',
    description: '演示应用',
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
