import { describe, expect, it } from 'vitest'

import { composerCommandOptions, getFilteredComposerCommands } from '@/components/chat/composer/menu/composer-command-options'

describe('composer image command', () => {
    it('exposes the explicit image command in the command menu', () => {
        expect(composerCommandOptions).toContainEqual(expect.objectContaining({ label: '生成图片', name: 'image' }))
        expect(getFilteredComposerCommands('image')).toContainEqual(expect.objectContaining({ label: '生成图片', name: 'image' }))
    })
})
