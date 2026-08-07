import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const iconDirectory = resolve(import.meta.dirname, '../../assets/icons')

describe('desktop application icons', () => {
    it('ships a transparent PNG master plus Windows and macOS platform containers', async () => {
        const png = readFileSync(resolve(iconDirectory, 'ai-mind-icon.png'))
        const ico = readFileSync(resolve(iconDirectory, 'ai-mind.ico'))
        const icns = readFileSync(resolve(iconDirectory, 'ai-mind.icns'))
        const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })

        expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        expect(png[25]).toBe(6)
        expect(data[3]).toBe(0)
        expect(data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels + 3]).toBe(255)
        expect(ico.readUInt16LE(2)).toBe(1)
        expect(ico.readUInt16LE(4)).toBe(8)
        expect(icns.subarray(0, 4).toString('ascii')).toBe('icns')
        expect(icns.readUInt32BE(4)).toBe(icns.length)
    })
})
