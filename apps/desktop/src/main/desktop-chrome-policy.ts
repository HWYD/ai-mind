export const DESKTOP_CHROME_HEIGHT = 40

type DesktopChromeWindowPolicy = {
    backgroundColor: string
    titleBarOverlay?: {
        color: string
        height: number
        symbolColor: string
    }
    titleBarStyle: 'hidden' | 'hiddenInset'
}

export function getDesktopChromeWindowPolicy(platform: NodeJS.Platform): DesktopChromeWindowPolicy {
    if (platform === 'darwin') {
        return {
            backgroundColor: '#f7f8fa',
            titleBarStyle: 'hiddenInset',
        }
    }

    return {
        backgroundColor: '#f7f8fa',
        titleBarOverlay: {
            color: '#f7f8fa',
            // Windows 原生 overlay 会覆盖同一行的 renderer 像素，保留 1px 给网页底边线。
            height: DESKTOP_CHROME_HEIGHT - 1,
            symbolColor: '#273244',
        },
        titleBarStyle: 'hidden',
    }
}
