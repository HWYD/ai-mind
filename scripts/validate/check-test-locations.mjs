#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const targetArg = process.argv[2] ?? '.'
const targetRoot = path.resolve(process.cwd(), targetArg)
const testsRoot = path.resolve(targetRoot, 'tests')

const SKIP_DIRS = new Set(['node_modules', '.next', 'out', 'build', 'dist', 'coverage', '.turbo'])
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx)$/

function normalizePath(value) {
    return path.resolve(value).replace(/\\/g, '/').toLowerCase()
}

function isInsidePath(filePath, parentPath) {
    const normalizedFilePath = normalizePath(filePath)
    const normalizedParentPath = normalizePath(parentPath).replace(/\/$/, '')

    return normalizedFilePath === normalizedParentPath || normalizedFilePath.startsWith(`${normalizedParentPath}/`)
}

async function walkFiles(rootDir) {
    const stack = [rootDir]
    const files = []

    while (stack.length > 0) {
        const currentDir = stack.pop()
        if (!currentDir) {
            continue
        }

        const entries = await fs.readdir(currentDir, { withFileTypes: true })
        for (const entry of entries) {
            const absolutePath = path.join(currentDir, entry.name)

            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name)) {
                    continue
                }

                stack.push(absolutePath)
                continue
            }

            if (entry.isFile()) {
                files.push(absolutePath)
            }
        }
    }

    return files
}

async function main() {
    const allFiles = await walkFiles(targetRoot)
    const testFiles = allFiles.filter(filePath => TEST_FILE_PATTERN.test(path.basename(filePath)))
    const invalidFiles = testFiles.filter(filePath => !isInsidePath(filePath, testsRoot))

    if (invalidFiles.length === 0) {
        console.log(`✅ 测试目录校验通过：共 ${testFiles.length} 个测试文件，全部位于 tests/ 下。`)
        return
    }

    console.error('❌ 发现不在 tests/ 目录下的测试文件：')
    for (const invalidFile of invalidFiles) {
        console.error(`- ${path.relative(targetRoot, invalidFile).replace(/\\/g, '/')}`)
    }
    console.error('\n请将上述测试文件迁移到 apps/webapp/tests/** 后再执行测试。')
    process.exitCode = 1
}

main().catch(error => {
    console.error('❌ 测试目录校验执行失败：', error)
    process.exitCode = 1
})
