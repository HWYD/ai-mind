// import './globals.css'

import type { Metadata } from 'next'
// import { Toaster } from 'sonner'

export const metadata: Metadata = {
    title: 'AI 应用 - WebApp',
    description: '演示应用',
}

export default function RootLayout({
    children,
}: Readonly<{s
    children: React.ReactNode
}>) {
    return (
        <html lang="zh-CN">
            <body className="min-h-screen antialiased">
                {children}
                {/* <Toaster position="top-center" richColors /> */}
            </body>
        </html>
    )
}
