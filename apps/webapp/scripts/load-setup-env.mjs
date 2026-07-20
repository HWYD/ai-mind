import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

function isModuleNotFoundError(error) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'MODULE_NOT_FOUND')
}

function loadOptionalDotenvConfig() {
    try {
        const dotenv = require('dotenv')
        return typeof dotenv.config === 'function' ? dotenv.config : null
    } catch (error) {
        if (isModuleNotFoundError(error)) {
            return null
        }

        throw error
    }
}

export function loadSetupEnvFiles(projectRoot = DEFAULT_PROJECT_ROOT) {
    let loadEnv

    for (const fileName of ['.env.local', '.env']) {
        const envPath = resolve(projectRoot, fileName)

        if (!existsSync(envPath)) {
            continue
        }

        loadEnv ??= loadOptionalDotenvConfig()

        if (!loadEnv) {
            return
        }

        loadEnv({
            override: false,
            path: envPath,
            quiet: true,
        })
    }
}
