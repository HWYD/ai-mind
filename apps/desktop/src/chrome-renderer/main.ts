import './styles.css'

import type { DesktopChromeMenu } from '../desktop-chrome-contract'

if (navigator.userAgent.includes('Macintosh')) {
    document.documentElement.dataset.platform = 'macos'
}

document.querySelectorAll<HTMLButtonElement>('[data-menu]').forEach(button => {
    button.addEventListener('click', () => {
        const menu = button.dataset.menu

        if (menu !== 'view' && menu !== 'help') {
            return
        }

        const bounds = button.getBoundingClientRect()
        void window.aiMindDesktopChrome.openMenu(menu satisfies DesktopChromeMenu, {
            x: Math.round(bounds.left),
            y: Math.round(bounds.bottom),
        })
    })
})
