import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopDirectory = path.resolve(scriptDirectory, '..')
const sourcePath = path.resolve(desktopDirectory, '..', 'webapp', 'public', 'brand', 'ai-mind-icon.png')
const outputDirectory = path.join(desktopDirectory, 'assets', 'icons')
const sourceSize = 1254

const iconSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512, 1024]
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 256]
const icnsTypes = new Map([
    [16, 'icp4'],
    [32, 'icp5'],
    [64, 'icp6'],
    [128, 'ic07'],
    [256, 'ic08'],
    [512, 'ic09'],
    [1024, 'ic10'],
])

function createIco(images) {
    const header = Buffer.alloc(6)
    header.writeUInt16LE(0, 0)
    header.writeUInt16LE(1, 2)
    header.writeUInt16LE(images.length, 4)

    let offset = header.length + images.length * 16
    const entries = images.map(({ data, size }) => {
        const entry = Buffer.alloc(16)
        entry.writeUInt8(size === 256 ? 0 : size, 0)
        entry.writeUInt8(size === 256 ? 0 : size, 1)
        entry.writeUInt8(0, 2)
        entry.writeUInt8(0, 3)
        entry.writeUInt16LE(1, 4)
        entry.writeUInt16LE(32, 6)
        entry.writeUInt32LE(data.length, 8)
        entry.writeUInt32LE(offset, 12)
        offset += data.length
        return entry
    })

    return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)])
}

function createIcns(images) {
    const chunks = images.map(({ data, size }) => {
        const header = Buffer.alloc(8)
        header.write(icnsTypes.get(size), 0, 'ascii')
        header.writeUInt32BE(header.length + data.length, 4)
        return Buffer.concat([header, data])
    })
    const header = Buffer.alloc(8)
    header.write('icns', 0, 'ascii')
    header.writeUInt32BE(header.length + chunks.reduce((total, chunk) => total + chunk.length, 0), 4)

    return Buffer.concat([header, ...chunks])
}

function isInsideRoundedRectangle(x, y) {
    // 向内收缩 4px，去除非透明原图边缘与棋盘格混合产生的白边。
    const left = 214
    const top = 189
    const width = 826
    const height = 876
    const radius = 173
    const right = left + width
    const bottom = top + height

    if (x < left || x > right || y < top || y > bottom) {
        return false
    }

    const nearestX = Math.min(Math.max(x, left + radius), right - radius)
    const nearestY = Math.min(Math.max(y, top + radius), bottom - radius)

    return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2
}

function removeCheckerboardBackground(data) {
    const samplesPerAxis = 4
    const samples = samplesPerAxis ** 2

    for (let y = 0; y < sourceSize; y += 1) {
        for (let x = 0; x < sourceSize; x += 1) {
            let coveredSamples = 0
            for (let sampleY = 0; sampleY < samplesPerAxis; sampleY += 1) {
                for (let sampleX = 0; sampleX < samplesPerAxis; sampleX += 1) {
                    if (isInsideRoundedRectangle(x + (sampleX + 0.5) / samplesPerAxis, y + (sampleY + 0.5) / samplesPerAxis)) {
                        coveredSamples += 1
                    }
                }
            }
            data[(y * sourceSize + x) * 4 + 3] = Math.round((coveredSamples / samples) * 255)
        }
    }
}

async function createIcons() {
    const sourceMetadata = await sharp(sourcePath).metadata()
    if (sourceMetadata.width !== sourceSize || sourceMetadata.height !== sourceSize) {
        throw new Error(`Expected the AI Mind source icon to be ${sourceSize} x ${sourceSize}px.`)
    }

    // 原始文件的棋盘格已烘焙到 RGB 像素中；只保留蓝色圆角底板内的品牌图形。
    const source = await sharp(sourcePath).ensureAlpha().raw().toBuffer()
    removeCheckerboardBackground(source)
    const masterIcon = await sharp(source, { raw: { width: sourceSize, height: sourceSize, channels: 4 } })
        .resize(1024, 1024, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
        .png({ compressionLevel: 9 })
        .toBuffer()

    const imageBuffers = new Map(
        await Promise.all(
            iconSizes.map(async size => [
                size,
                await sharp(masterIcon).resize(size, size, { kernel: sharp.kernel.lanczos3 }).png().toBuffer(),
            ])
        )
    )
    const ico = createIco(icoSizes.map(size => ({ data: imageBuffers.get(size), size })))
    const icns = createIcns([...icnsTypes.keys()].map(size => ({ data: imageBuffers.get(size), size })))

    await mkdir(outputDirectory, { recursive: true })
    await Promise.all([
        writeFile(path.join(outputDirectory, 'ai-mind-icon.png'), masterIcon),
        writeFile(path.join(outputDirectory, 'ai-mind.ico'), ico),
        writeFile(path.join(outputDirectory, 'ai-mind.icns'), icns),
    ])

    process.stdout.write(
        `${JSON.stringify(
            {
                generated: ['ai-mind-icon.png', 'ai-mind.ico', 'ai-mind.icns'],
                outputDirectory,
                sourcePath,
            },
            null,
            2
        )}\n`
    )
}

createIcons().catch(error => {
    process.stderr.write(`[generate-app-icons] ${error.message}\n`)
    process.exitCode = 1
})
