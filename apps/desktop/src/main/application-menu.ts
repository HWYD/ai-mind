import { type BrowserWindow, clipboard, dialog, Menu, type MenuItemConstructorOptions } from 'electron'

import type { DesktopChromeMenu } from '../desktop-chrome-contract'

export function createApplicationMenu(input: { desktopVersion: string; trustedOrigin: string }): Electron.Menu {
    const template: MenuItemConstructorOptions[] = [
        {
            id: 'view',
            label: '查看',
            submenu: [
                {
                    click: () => {
                        const detailText = [
                            '前端：Next.js + React + Tailwind CSS + shadcn/ui',
                            '后端：Next.js API Routes + NestJS',
                            '数据库：PostgreSQL + Prisma + pgvector',
                            'AI Agent：LangChain + LangGraph + MCP SDK',
                        ].join('\n')

                        void dialog.showMessageBox({
                            buttons: ['确定'],
                            cancelId: 0,
                            defaultId: 1,
                            detail: detailText,
                            message: 'AI Mind',
                            title: 'AI Mind',
                            type: 'info',
                            noLink: true,
                        })
                    },
                    label: '技术架构',
                },
            ],
        },
        {
            id: 'help',
            label: '帮助',
            submenu: [
                {
                    click: () => {
                        const detailText = [
                            `桌面版本：${input.desktopVersion}`,
                            `Electron：${process.versions.electron}`,
                            `Node.js：${process.versions.node}`,
                            `日期：${new Date().toLocaleDateString('zh-CN')}`,
                            '分发渠道：internal-preview',
                            '签名状态：unsigned',
                            `受信 Origin：${input.trustedOrigin}`,
                            `github：https://github.com/HWYD/ai-mind`,
                        ].join('\n')

                        void dialog
                            .showMessageBox({
                                buttons: ['复制', '确定'],
                                cancelId: 0,
                                defaultId: 1,
                                detail: detailText,
                                message: 'AI Mind',
                                title: 'AI Mind',
                                type: 'info',
                                noLink: true,
                            })
                            .then(({ response }) => {
                                if (response === 0) {
                                    clipboard.writeText(detailText)
                                }
                            })
                    },
                    label: '关于',
                },
            ],
        },
    ]

    return Menu.buildFromTemplate(template)
}

export function showApplicationMenu(input: {
    menu: Electron.Menu
    menuName: DesktopChromeMenu
    position: { x: number; y: number }
    window: BrowserWindow
}): void {
    input.menu.getMenuItemById(input.menuName)?.submenu?.popup({
        window: input.window,
        x: input.position.x,
        y: input.position.y,
    })
}
